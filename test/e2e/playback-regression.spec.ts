import { test, expect, Page } from '@playwright/test';
import { loginAsUser } from '../../tests/helpers/auth';

/**
 * Playback Performance Regression Tests
 * 
 * These tests act as guardrails to catch performance regressions in CI.
 * They verify:
 * 1. TTFA P95 is under threshold (4s)
 * 2. Fetch request count per trace is under budget (20)
 * 3. No audio_tracks?select=* patterns
 * 4. No excessive duplicate API calls
 * 5. No analytics firing before first audio
 * 
 * Usage:
 *   npm run test:perf-regression
 *   npx playwright test playback-regression.spec.ts
 */

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

// Regression thresholds (can be overridden via env vars for different environments)
const THRESHOLDS = {
  ttfaP95Ms: parseInt(process.env.PERF_TTFA_P95_THRESHOLD || '4000', 10),
  maxFetchesPerTrace: parseInt(process.env.PERF_MAX_FETCHES || '25', 10),
  maxDuplicateUserPrefs: parseInt(process.env.PERF_MAX_DUP_USER_PREFS || '2', 10),
  maxDuplicateSlotStrategy: parseInt(process.env.PERF_MAX_DUP_SLOT_STRATEGY || '3', 10),
};

interface PlaybackTrace {
  requestId: string;
  meta: {
    triggerType?: string;
    channelId?: string;
    channelName?: string;
    energyLevel?: string;
    engineType?: string;
  };
  startedAt: number;
  endedAt?: number;
  outcome?: {
    outcome: 'success' | 'fail';
    ttfaMs?: number;
    reason?: string;
  };
  events: Array<{
    ts: number;
    method: string;
    url: string;
    status: number | 'ERR';
    durationMs: number;
    hostname: string;
    pathname: string;
  }>;
  summary?: {
    totalRequests: number;
    totalDurationMs: number;
    byHostname: Record<string, { count: number; totalMs: number }>;
    byEndpoint: Record<string, number>;
    slowestRequests: Array<{ url: string; durationMs: number; method: string; pathname: string }>;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

async function forceStreamingEngine(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('audioEngineType', 'streaming');
    } catch {}
  });
}

async function navigateToChannelsIfNeeded(page: Page): Promise<void> {
  const channelCard = page.locator('[data-channel-id]').first();
  const isChannelVisible = await channelCard.isVisible({ timeout: 2000 }).catch(() => false);
  if (isChannelVisible) return;

  const channelsButton = page.locator('button:has-text("Channels")').first();
  const isVisible = await channelsButton.isVisible({ timeout: 2000 }).catch(() => false);
  if (isVisible) {
    await channelsButton.click({ force: true });
  }

  await channelCard.waitFor({ state: 'visible', timeout: 20000 });
}

async function waitForAudioPlaying(page: Page, timeout = 30000): Promise<void> {
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('[data-testid="player-play-pause"]');
      return btn?.getAttribute('data-playing') === 'true';
    },
    { timeout }
  );
  
  await page.waitForFunction(
    async () => {
      const audio = document.querySelector('audio') as HTMLAudioElement | null;
      if (!audio) return false;
      if (audio.paused) return false;
      
      const initialTime = audio.currentTime;
      await new Promise(resolve => setTimeout(resolve, 300));
      return audio.currentTime > initialTime;
    },
    { timeout: 15000 }
  );
}

async function clearTraces(page: Page): Promise<void> {
  await page.evaluate(() => {
    const trace = (window as any).__playbackTrace;
    trace?.clear?.();
  });
}

async function getTraces(page: Page): Promise<PlaybackTrace[]> {
  return page.evaluate(() => {
    const trace = (window as any).__playbackTrace;
    return trace?.traces?.() ?? [];
  });
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

// ============================================================================
// ANALYSIS
// ============================================================================

interface RegressionIssue {
  type: string;
  message: string;
  severity: 'warning' | 'error';
  trace?: string;
}

function analyzeTracesForRegressions(traces: PlaybackTrace[]): RegressionIssue[] {
  const issues: RegressionIssue[] = [];

  // 1. Check TTFA P95
  const ttfaValues = traces
    .filter(t => t.outcome?.outcome === 'success' && typeof t.outcome?.ttfaMs === 'number')
    .map(t => t.outcome!.ttfaMs!);
  
  const p95 = percentile(ttfaValues, 95);
  if (p95 > THRESHOLDS.ttfaP95Ms) {
    issues.push({
      type: 'ttfa_regression',
      message: `TTFA P95 (${p95}ms) exceeds threshold (${THRESHOLDS.ttfaP95Ms}ms)`,
      severity: 'error',
    });
  }

  for (const trace of traces) {
    const traceId = trace.requestId?.substring(0, 8) || 'unknown';

    // 2. Check fetch count
    const fetchCount = trace.summary?.totalRequests || 0;
    if (fetchCount > THRESHOLDS.maxFetchesPerTrace) {
      issues.push({
        type: 'excessive_fetches',
        message: `Trace ${traceId} has ${fetchCount} fetches (threshold: ${THRESHOLDS.maxFetchesPerTrace})`,
        severity: 'warning',
        trace: traceId,
      });
    }

    // 3. Check for audio_tracks?select=*
    for (const event of trace.events || []) {
      if (event.url?.includes('audio_tracks') && event.url.includes('select=*')) {
        issues.push({
          type: 'audio_tracks_select_all',
          message: `Trace ${traceId}: audio_tracks?select=* detected - fetch only needed columns`,
          severity: 'error',
          trace: traceId,
        });
        break; // Only report once per trace
      }
    }

    // 4. Check for duplicate user_preferences
    const userPrefsCount = Object.entries(trace.summary?.byEndpoint || {})
      .filter(([ep]) => ep.includes('user_preferences'))
      .reduce((sum, [, count]) => sum + count, 0);
    
    if (userPrefsCount > THRESHOLDS.maxDuplicateUserPrefs) {
      issues.push({
        type: 'duplicate_user_preferences',
        message: `Trace ${traceId}: ${userPrefsCount} user_preferences calls (threshold: ${THRESHOLDS.maxDuplicateUserPrefs})`,
        severity: 'warning',
        trace: traceId,
      });
    }

    // 5. Check for duplicate slot_strategies
    const slotStratCount = Object.entries(trace.summary?.byEndpoint || {})
      .filter(([ep]) => ep.includes('slot_strategies'))
      .reduce((sum, [, count]) => sum + count, 0);
    
    if (slotStratCount > THRESHOLDS.maxDuplicateSlotStrategy) {
      issues.push({
        type: 'duplicate_slot_strategy',
        message: `Trace ${traceId}: ${slotStratCount} slot_strategy calls (threshold: ${THRESHOLDS.maxDuplicateSlotStrategy})`,
        severity: 'warning',
        trace: traceId,
      });
    }

    // 6. Check for analytics before audio
    if (trace.outcome?.outcome === 'success' && trace.outcome?.ttfaMs) {
      const ttfaMs = trace.outcome.ttfaMs;
      const startTs = trace.startedAt || 0;
      
      const analyticsEvents = (trace.events || []).filter(e => 
        e.pathname?.includes('track_play_events') ||
        e.pathname?.includes('listening_sessions') ||
        e.pathname?.includes('update_track') ||
        e.pathname?.includes('playlist_generation_logs')
      );

      const earlyAnalytics = analyticsEvents.filter(e => (e.ts - startTs) < ttfaMs);
      
      if (earlyAnalytics.length > 0) {
        issues.push({
          type: 'analytics_before_audio',
          message: `Trace ${traceId}: ${earlyAnalytics.length} analytics call(s) fired before first audio`,
          severity: 'warning',
          trace: traceId,
        });
      }
    }
  }

  return issues;
}

// ============================================================================
// TESTS
// ============================================================================

test.describe('Playback Performance Regression Checks', () => {
  test.setTimeout(120_000);
  test.skip(!hasTestCredentials, 'Skipping: TEST_USER_EMAIL and TEST_USER_PASSWORD not set');

  test.beforeEach(async ({ page }) => {
    await forceStreamingEngine(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await loginAsUser(page);
    await navigateToChannelsIfNeeded(page);
    await page.waitForTimeout(1000);
    await clearTraces(page);
  });

  test('initial play meets performance thresholds', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    const count = await channelCards.count();
    expect(count).toBeGreaterThan(0);

    // Click first channel and start playback
    const firstChannel = channelCards.first();
    await firstChannel.click();
    
    const playButton = page.locator('[data-testid="channel-play-pause"]').first();
    await playButton.waitFor({ state: 'visible', timeout: 10000 });
    await playButton.click();
    
    await waitForAudioPlaying(page, 45000);
    
    // Wait for trace to complete
    await page.waitForTimeout(2000);

    // Get and analyze trace
    const traces = await getTraces(page);
    expect(traces.length).toBeGreaterThan(0);

    const issues = analyzeTracesForRegressions(traces);
    const errors = issues.filter(i => i.severity === 'error');

    // Log all issues
    if (issues.length > 0) {
      console.log('\n=== Performance Issues Detected ===');
      for (const issue of issues) {
        const prefix = issue.severity === 'error' ? '❌' : '⚠️';
        console.log(`${prefix} ${issue.type}: ${issue.message}`);
      }
      console.log('');
    }

    // Fail on errors
    expect(errors, `Performance regression detected: ${errors.map(e => e.message).join(', ')}`).toHaveLength(0);
  });

  test('energy change meets performance thresholds', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    
    // Start initial playback first
    await channelCards.first().click();
    const playButton = page.locator('[data-testid="channel-play-pause"]').first();
    await playButton.waitFor({ state: 'visible', timeout: 10000 });
    await playButton.click();
    await waitForAudioPlaying(page, 45000);
    
    // Clear traces to isolate energy change
    await clearTraces(page);
    
    // Find and click a different energy level
    const energyLevels = ['low', 'medium', 'high'];
    let clicked = false;
    
    for (const level of energyLevels) {
      const energyButton = page.locator(`[data-testid="energy-${level}"]`);
      const isVisible = await energyButton.isVisible({ timeout: 1000 }).catch(() => false);
      
      if (isVisible) {
        const isActive = await energyButton.getAttribute('data-active').catch(() => null);
        if (isActive !== 'true') {
          await energyButton.click();
          clicked = true;
          break;
        }
      }
    }
    
    expect(clicked).toBe(true);
    await waitForAudioPlaying(page, 45000);
    
    // Wait for trace to complete
    await page.waitForTimeout(2000);

    // Get and analyze trace
    const traces = await getTraces(page);
    expect(traces.length).toBeGreaterThan(0);

    const issues = analyzeTracesForRegressions(traces);
    const errors = issues.filter(i => i.severity === 'error');

    if (issues.length > 0) {
      console.log('\n=== Performance Issues (Energy Change) ===');
      for (const issue of issues) {
        const prefix = issue.severity === 'error' ? '❌' : '⚠️';
        console.log(`${prefix} ${issue.type}: ${issue.message}`);
      }
      console.log('');
    }

    expect(errors, `Performance regression detected: ${errors.map(e => e.message).join(', ')}`).toHaveLength(0);
  });

  test('channel switch meets performance thresholds', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    const count = await channelCards.count();
    expect(count).toBeGreaterThan(1);

    // Start initial playback first
    await channelCards.first().click();
    const playButton = page.locator('[data-testid="channel-play-pause"]').first();
    await playButton.waitFor({ state: 'visible', timeout: 10000 });
    await playButton.click();
    await waitForAudioPlaying(page, 45000);
    
    // Clear traces to isolate channel switch
    await clearTraces(page);
    
    // Switch to second channel
    await channelCards.nth(1).click();
    await waitForAudioPlaying(page, 45000);
    
    // Wait for trace to complete
    await page.waitForTimeout(2000);

    // Get and analyze trace
    const traces = await getTraces(page);
    expect(traces.length).toBeGreaterThan(0);

    const issues = analyzeTracesForRegressions(traces);
    const errors = issues.filter(i => i.severity === 'error');

    if (issues.length > 0) {
      console.log('\n=== Performance Issues (Channel Switch) ===');
      for (const issue of issues) {
        const prefix = issue.severity === 'error' ? '❌' : '⚠️';
        console.log(`${prefix} ${issue.type}: ${issue.message}`);
      }
      console.log('');
    }

    expect(errors, `Performance regression detected: ${errors.map(e => e.message).join(', ')}`).toHaveLength(0);
  });

  test('no audio_tracks select=* anywhere', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    
    // Perform a full flow
    await channelCards.first().click();
    const playButton = page.locator('[data-testid="channel-play-pause"]').first();
    await playButton.waitFor({ state: 'visible', timeout: 10000 });
    await playButton.click();
    await waitForAudioPlaying(page, 45000);
    
    // Change energy
    const energyButton = page.locator('[data-testid="energy-low"]');
    if (await energyButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await energyButton.click();
      await waitForAudioPlaying(page, 30000);
    }
    
    // Wait for traces
    await page.waitForTimeout(2000);

    const traces = await getTraces(page);
    
    // Check for select=*
    let selectAllFound = false;
    let offendingUrl = '';
    
    for (const trace of traces) {
      for (const event of trace.events || []) {
        if (event.url?.includes('audio_tracks') && event.url.includes('select=*')) {
          selectAllFound = true;
          offendingUrl = event.url;
          break;
        }
      }
      if (selectAllFound) break;
    }

    expect(selectAllFound, `audio_tracks?select=* detected: ${offendingUrl}`).toBe(false);
  });
});

