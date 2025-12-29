import { test, expect, Page } from '@playwright/test';
import { loginAsUser } from '../../tests/helpers/auth';
import * as fs from 'fs';
import * as path from 'path';

/**
 * E2E test suite for generating playback performance baselines.
 * 
 * This suite triggers the 3 core playback flows:
 * 1. Initial play (channel start)
 * 2. Energy change (same channel)
 * 3. Channel change (switch to different channel)
 * 
 * After running, traces are automatically exported to:
 *   perf/runs/YYYY-MM-DD_HH-mm-ss/
 * 
 * Usage:
 *   npm run playback:baseline
 *   npx playwright test playback-baseline.spec.ts
 */

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

// Generate timestamped run directory
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const RUN_DIR = process.env.PERF_RUN_DIR || path.join(process.cwd(), 'perf', 'runs', RUN_TIMESTAMP);

// Thresholds for regression checks
const THRESHOLDS = {
  ttfaP95Ms: 4000,           // TTFA P95 must be under 4s
  maxFetchesPerTrace: 20,    // Max fetch requests per trace
  maxDuplicateUserPrefs: 1,  // No duplicate user_preferences
  maxDuplicateSlotStrategy: 2, // Minimal slot_strategy duplicates
};

interface TTFAEvent {
  requestId: string;
  triggerType: string;
  ttfaMs?: number;
  success?: boolean;
  error?: string;
  channelName?: string;
  energyLevel?: string;
  timestamp?: string;
}

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

interface BaselineReport {
  runId: string;
  timestamp: string;
  traces: PlaybackTrace[];
  ttfaEvents: TTFAEvent[];
  summary: {
    traceCount: number;
    successCount: number;
    failCount: number;
    ttfa: {
      min: number;
      p50: number;
      p95: number;
      max: number;
    };
    byTriggerType: Record<string, {
      count: number;
      p50Ms: number;
      p95Ms: number;
      avgFetches: number;
    }>;
    totalFetches: number;
    avgFetchesPerTrace: number;
    warnings: Array<{
      type: string;
      count: number;
    }>;
  };
  thresholds: typeof THRESHOLDS;
  verdict: {
    pass: boolean;
    issues: string[];
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
  
  // Wait for audio element to be actually playing
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
    const perf = (window as any).__playerPerf;
    perf?.clear?.();
  });
}

async function getTraces(page: Page): Promise<PlaybackTrace[]> {
  return page.evaluate(() => {
    const trace = (window as any).__playbackTrace;
    return trace?.traces?.() ?? [];
  });
}

async function getTTFAEvents(page: Page): Promise<TTFAEvent[]> {
  return page.evaluate(() => {
    const perf = (window as any).__playerPerf;
    return perf?.events?.() ?? [];
  });
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function computeBaselineSummary(
  traces: PlaybackTrace[], 
  ttfaEvents: TTFAEvent[]
): BaselineReport['summary'] {
  // TTFA stats from successful events
  const successTTFA = ttfaEvents
    .filter(e => e.success === true && typeof e.ttfaMs === 'number')
    .map(e => e.ttfaMs!);

  const successCount = traces.filter(t => t.outcome?.outcome === 'success').length;
  const failCount = traces.filter(t => t.outcome?.outcome === 'fail').length;

  // By trigger type
  const byTriggerType: Record<string, { times: number[]; fetches: number[] }> = {};
  for (const trace of traces) {
    const triggerType = trace.meta.triggerType || 'unknown';
    if (!byTriggerType[triggerType]) {
      byTriggerType[triggerType] = { times: [], fetches: [] };
    }
    if (trace.outcome?.ttfaMs) {
      byTriggerType[triggerType].times.push(trace.outcome.ttfaMs);
    }
    if (trace.summary?.totalRequests) {
      byTriggerType[triggerType].fetches.push(trace.summary.totalRequests);
    }
  }

  const byTriggerTypeSummary: Record<string, {
    count: number;
    p50Ms: number;
    p95Ms: number;
    avgFetches: number;
  }> = {};

  for (const [type, data] of Object.entries(byTriggerType)) {
    byTriggerTypeSummary[type] = {
      count: data.times.length,
      p50Ms: percentile(data.times, 50),
      p95Ms: percentile(data.times, 95),
      avgFetches: data.fetches.length > 0 
        ? Math.round(data.fetches.reduce((a, b) => a + b, 0) / data.fetches.length)
        : 0,
    };
  }

  // Warning counts
  const warningCounts: Record<string, number> = {};
  for (const trace of traces) {
    // Check for duplicate user_preferences
    const userPrefsCount = Object.entries(trace.summary?.byEndpoint || {})
      .filter(([ep]) => ep.includes('user_preferences'))
      .reduce((sum, [, count]) => sum + count, 0);
    if (userPrefsCount > 1) {
      warningCounts['duplicate_user_preferences'] = (warningCounts['duplicate_user_preferences'] || 0) + 1;
    }

    // Check for duplicate slot_strategies
    const slotStratCount = Object.entries(trace.summary?.byEndpoint || {})
      .filter(([ep]) => ep.includes('slot_strategies'))
      .reduce((sum, [, count]) => sum + count, 0);
    if (slotStratCount > 1) {
      warningCounts['duplicate_slot_strategy'] = (warningCounts['duplicate_slot_strategy'] || 0) + 1;
    }

    // Check for audio_tracks select=*
    for (const event of trace.events || []) {
      if (event.url?.includes('audio_tracks') && event.url.includes('select=*')) {
        warningCounts['audio_tracks_select_all'] = (warningCounts['audio_tracks_select_all'] || 0) + 1;
      }
    }

    // Check for analytics before audio
    const analyticsEvents = (trace.events || []).filter(e => 
      e.pathname?.includes('track_play_events') ||
      e.pathname?.includes('listening_sessions') ||
      e.pathname?.includes('update_track')
    );
    if (analyticsEvents.length > 0 && trace.outcome?.outcome === 'success') {
      const ttfaMs = trace.outcome.ttfaMs || 0;
      const startTs = trace.startedAt || 0;
      const earlyAnalytics = analyticsEvents.filter(e => (e.ts - startTs) < ttfaMs);
      if (earlyAnalytics.length > 0) {
        warningCounts['analytics_before_audio'] = (warningCounts['analytics_before_audio'] || 0) + 1;
      }
    }
  }

  const totalFetches = traces.reduce((sum, t) => sum + (t.summary?.totalRequests || 0), 0);

  return {
    traceCount: traces.length,
    successCount,
    failCount,
    ttfa: {
      min: successTTFA.length > 0 ? Math.min(...successTTFA) : 0,
      p50: percentile(successTTFA, 50),
      p95: percentile(successTTFA, 95),
      max: successTTFA.length > 0 ? Math.max(...successTTFA) : 0,
    },
    byTriggerType: byTriggerTypeSummary,
    totalFetches,
    avgFetchesPerTrace: traces.length > 0 ? Math.round(totalFetches / traces.length) : 0,
    warnings: Object.entries(warningCounts).map(([type, count]) => ({ type, count })),
  };
}

function computeVerdict(summary: BaselineReport['summary']): BaselineReport['verdict'] {
  const issues: string[] = [];

  // Check TTFA P95
  if (summary.ttfa.p95 > THRESHOLDS.ttfaP95Ms) {
    issues.push(`TTFA P95 (${summary.ttfa.p95}ms) exceeds threshold (${THRESHOLDS.ttfaP95Ms}ms)`);
  }

  // Check avg fetches per trace
  if (summary.avgFetchesPerTrace > THRESHOLDS.maxFetchesPerTrace) {
    issues.push(`Avg fetches per trace (${summary.avgFetchesPerTrace}) exceeds threshold (${THRESHOLDS.maxFetchesPerTrace})`);
  }

  // Check warnings
  for (const warning of summary.warnings) {
    if (warning.type === 'duplicate_user_preferences' && warning.count > THRESHOLDS.maxDuplicateUserPrefs) {
      issues.push(`Duplicate user_preferences detected (${warning.count}x)`);
    }
    if (warning.type === 'duplicate_slot_strategy' && warning.count > THRESHOLDS.maxDuplicateSlotStrategy) {
      issues.push(`Excessive slot_strategy duplicates (${warning.count}x)`);
    }
    if (warning.type === 'audio_tracks_select_all') {
      issues.push(`audio_tracks?select=* detected (${warning.count}x) - should use minimal columns`);
    }
    if (warning.type === 'analytics_before_audio') {
      issues.push(`Analytics fired before first audio (${warning.count}x)`);
    }
  }

  return {
    pass: issues.length === 0,
    issues,
  };
}

function writeBaselineReport(report: BaselineReport): void {
  // Ensure run directory exists
  if (!fs.existsSync(RUN_DIR)) {
    fs.mkdirSync(RUN_DIR, { recursive: true });
  }

  // Write traces
  const tracesPath = path.join(RUN_DIR, 'playback-traces.json');
  fs.writeFileSync(tracesPath, JSON.stringify(report.traces, null, 2));

  // Write TTFA events
  const ttfaPath = path.join(RUN_DIR, 'ttfa-events.json');
  fs.writeFileSync(ttfaPath, JSON.stringify(report.ttfaEvents, null, 2));

  // Write full report
  const reportPath = path.join(RUN_DIR, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Write human-readable summary
  const summaryLines = [
    `# Playback Performance Baseline`,
    ``,
    `**Run ID:** ${report.runId}`,
    `**Timestamp:** ${report.timestamp}`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Traces | ${report.summary.traceCount} |`,
    `| Successes | ${report.summary.successCount} |`,
    `| Failures | ${report.summary.failCount} |`,
    `| TTFA P50 | ${report.summary.ttfa.p50}ms |`,
    `| TTFA P95 | ${report.summary.ttfa.p95}ms |`,
    `| TTFA Max | ${report.summary.ttfa.max}ms |`,
    `| Avg Fetches/Trace | ${report.summary.avgFetchesPerTrace} |`,
    ``,
    `## By Trigger Type`,
    ``,
    `| Trigger | Count | P50 | P95 | Avg Fetches |`,
    `|---------|-------|-----|-----|-------------|`,
  ];

  for (const [type, data] of Object.entries(report.summary.byTriggerType)) {
    summaryLines.push(`| ${type} | ${data.count} | ${data.p50Ms}ms | ${data.p95Ms}ms | ${data.avgFetches} |`);
  }

  if (report.summary.warnings.length > 0) {
    summaryLines.push(``);
    summaryLines.push(`## Warnings`);
    summaryLines.push(``);
    for (const warning of report.summary.warnings) {
      summaryLines.push(`- ⚠️ ${warning.type}: ${warning.count}x`);
    }
  }

  summaryLines.push(``);
  summaryLines.push(`## Verdict`);
  summaryLines.push(``);
  if (report.verdict.pass) {
    summaryLines.push(`✅ **PASS** - All thresholds met`);
  } else {
    summaryLines.push(`❌ **FAIL** - Issues detected:`);
    for (const issue of report.verdict.issues) {
      summaryLines.push(`- ${issue}`);
    }
  }

  const summaryPath = path.join(RUN_DIR, 'summary.md');
  fs.writeFileSync(summaryPath, summaryLines.join('\n'));

  console.log(`\n📁 Baseline report written to: ${RUN_DIR}`);
  console.log(`   - playback-traces.json (${report.traces.length} traces)`);
  console.log(`   - ttfa-events.json (${report.ttfaEvents.length} events)`);
  console.log(`   - report.json (full report)`);
  console.log(`   - summary.md (human-readable)`);
}

// ============================================================================
// TEST SUITE
// ============================================================================

test.describe('Playback Baseline Generation', () => {
  test.setTimeout(180_000);
  test.skip(!hasTestCredentials, 'Skipping: TEST_USER_EMAIL and TEST_USER_PASSWORD not set');

  test.beforeEach(async ({ page }) => {
    await forceStreamingEngine(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await loginAsUser(page);
    await navigateToChannelsIfNeeded(page);
    await page.waitForTimeout(1000);
    await clearTraces(page);
  });

  test('generate baseline: initial play → energy change → channel change', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    const count = await channelCards.count();
    expect(count).toBeGreaterThan(1);

    console.log('\n=== BASELINE GENERATION ===\n');

    // -------------------------------------------------------------------------
    // FLOW 1: Initial Play
    // -------------------------------------------------------------------------
    console.log('FLOW 1: Initial Play...');
    
    // Click first channel card
    const firstChannel = channelCards.first();
    await firstChannel.click();
    
    // Wait for energy selector to be visible
    const energySelector = page.locator('[data-testid="energy-selector"]');
    await energySelector.waitFor({ state: 'visible', timeout: 10000 });
    
    // Click play button
    const playButton = page.locator('[data-testid="channel-play-pause"]').first();
    await playButton.waitFor({ state: 'visible', timeout: 10000 });
    await playButton.click();
    
    // Wait for audio to be playing
    await waitForAudioPlaying(page, 45000);
    console.log('  ✓ Initial play complete');

    // Wait for trace to settle
    await page.waitForTimeout(2000);

    // -------------------------------------------------------------------------
    // FLOW 2: Energy Change
    // -------------------------------------------------------------------------
    console.log('FLOW 2: Energy Change...');
    
    // Find a different energy level to click
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
    
    if (clicked) {
      await waitForAudioPlaying(page, 45000);
      console.log('  ✓ Energy change complete');
    } else {
      console.log('  ⚠ Could not find inactive energy level');
    }

    // Wait for trace to settle
    await page.waitForTimeout(2000);

    // -------------------------------------------------------------------------
    // FLOW 3: Channel Change
    // -------------------------------------------------------------------------
    console.log('FLOW 3: Channel Change...');
    
    // Click on a different channel
    const secondChannel = channelCards.nth(1);
    await secondChannel.click();
    
    // Wait for audio - channel click should auto-start since audio was already playing
    await waitForAudioPlaying(page, 45000);
    console.log('  ✓ Channel change complete');

    // Wait for final trace to settle
    await page.waitForTimeout(3000);

    // -------------------------------------------------------------------------
    // EXPORT DATA
    // -------------------------------------------------------------------------
    console.log('\nExporting traces...');
    
    const traces = await getTraces(page);
    const ttfaEvents = await getTTFAEvents(page);

    console.log(`  Captured ${traces.length} traces`);
    console.log(`  Captured ${ttfaEvents.length} TTFA events`);

    // Compute summary and verdict
    const summary = computeBaselineSummary(traces, ttfaEvents);
    const verdict = computeVerdict(summary);

    const report: BaselineReport = {
      runId: RUN_TIMESTAMP,
      timestamp: new Date().toISOString(),
      traces,
      ttfaEvents,
      summary,
      thresholds: THRESHOLDS,
      verdict,
    };

    // Write report
    writeBaselineReport(report);

    // Print summary to console
    console.log('\n=== BASELINE SUMMARY ===\n');
    console.log(`TTFA P50: ${summary.ttfa.p50}ms`);
    console.log(`TTFA P95: ${summary.ttfa.p95}ms`);
    console.log(`TTFA Max: ${summary.ttfa.max}ms`);
    console.log(`Avg Fetches/Trace: ${summary.avgFetchesPerTrace}`);
    console.log(`\nBy Trigger Type:`);
    for (const [type, data] of Object.entries(summary.byTriggerType)) {
      console.log(`  ${type}: count=${data.count}, p50=${data.p50Ms}ms, p95=${data.p95Ms}ms`);
    }
    
    if (summary.warnings.length > 0) {
      console.log(`\nWarnings:`);
      for (const warning of summary.warnings) {
        console.log(`  ⚠️ ${warning.type}: ${warning.count}x`);
      }
    }

    console.log(`\nVerdict: ${verdict.pass ? '✅ PASS' : '❌ FAIL'}`);
    if (!verdict.pass) {
      for (const issue of verdict.issues) {
        console.log(`  - ${issue}`);
      }
    }

    // Assertions for CI
    expect(traces.length).toBeGreaterThan(0);
    expect(summary.successCount).toBeGreaterThan(0);
  });
});

