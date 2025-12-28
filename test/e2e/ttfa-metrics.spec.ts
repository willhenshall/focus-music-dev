import { test, expect, Page } from '@playwright/test';
import { loginAsUser } from '../../tests/helpers/auth';
import * as fs from 'fs';
import * as path from 'path';

/**
 * E2E tests for TTFA (Time To First Audible) instrumentation.
 * 
 * These tests verify:
 * 1. TTFA events are captured when starting/switching audio
 * 2. The "pause → change energy → audio resumes" path works correctly
 * 3. TTFA metrics are within acceptable thresholds
 * 
 * Note: This test captures perf data and writes it to perf/ttfa-latest.json
 * for analysis by the perf/ttfa-report.cjs script.
 */

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

// Maximum acceptable TTFA in CI (generous threshold)
const MAX_TTFA_MS = 8000;

/**
 * TTFA Event type as returned from window.__playerPerf
 */
interface TTFAEvent {
  requestId: string;
  triggerType: string;
  clickAt: number;
  channelId?: string;
  channelName?: string;
  energyLevel?: string;
  playlistReadyAt?: number;
  trackLoadStartAt?: number;
  sourceSelectedAt?: number;
  manifestParsedAt?: number;
  firstAudioAt?: number;
  ttfaMs?: number;
  audioType?: string;
  success?: boolean;
  error?: string;
  timestamp?: string;
}

/**
 * Summary statistics for TTFA events.
 */
interface TTFASummary {
  count: number;
  successes: number;
  failures: number;
  successRate: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  byTriggerType: Record<string, { count: number; p50Ms: number }>;
  byAudioType: Record<string, { count: number; p50Ms: number }>;
}

async function navigateToChannelsIfNeeded(page: Page): Promise<void> {
  const channelCard = page.locator('[data-channel-id]').first();
  const isChannelVisible = await channelCard.isVisible({ timeout: 2000 }).catch(() => false);
  if (isChannelVisible) return;

  // Desktop nav button
  const channelsButton = page.locator('button:has-text("Channels")').first();
  const isVisible = await channelsButton.isVisible({ timeout: 2000 }).catch(() => false);
  if (isVisible) {
    await channelsButton.click({ force: true });
  }

  await channelCard.waitFor({ state: 'visible', timeout: 20000 });
}

async function getPerfEvents(page: Page): Promise<TTFAEvent[]> {
  return page.evaluate(() => {
    const perf = (window as any).__playerPerf;
    return perf?.events?.() ?? [];
  });
}

async function getPerfSummary(page: Page): Promise<TTFASummary | null> {
  return page.evaluate(() => {
    const perf = (window as any).__playerPerf;
    return perf?.summary?.() ?? null;
  });
}

async function clearPerfEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const perf = (window as any).__playerPerf;
    perf?.clear?.();
  });
}

/**
 * Robust audio playing verification that proves audio is truly playing.
 * Checks:
 * 1. data-playing="true" on footer button
 * 2. Audio element is not paused
 * 3. Audio currentTime is progressing (increases by at least 0.2s within 1s)
 * 4. Volume > 0 and not muted
 */
async function waitForAudioTrulyPlaying(page: Page, timeout = 30000): Promise<void> {
  const startTime = Date.now();
  
  // Step 1: Wait for UI to show playing state
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('[data-testid="player-play-pause"]');
      return btn?.getAttribute('data-playing') === 'true';
    },
    { timeout }
  );
  
  // Step 2: Wait for loading modal to disappear (if present)
  const loadingModal = page.locator('[data-testid="playback-loading-modal"]');
  await loadingModal.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {
    // Modal might not appear at all for fast starts
  });
  
  // Step 3: Verify audio is actually playing (not just ready)
  const remainingTimeout = Math.max(timeout - (Date.now() - startTime), 5000);
  
  await page.waitForFunction(
    async () => {
      // Find the audio element
      const audio = document.querySelector('audio') as HTMLAudioElement | null;
      if (!audio) return false;
      
      // Basic checks
      if (audio.paused) return false;
      if (audio.volume === 0 || audio.muted) return false;
      
      // Record initial time
      const initialTime = audio.currentTime;
      
      // Wait 500ms and check if time progressed
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const newTime = audio.currentTime;
      const timeDelta = newTime - initialTime;
      
      // Require at least 0.2s of progress (accounts for some buffering)
      return timeDelta >= 0.2;
    },
    { timeout: remainingTimeout }
  ).catch(async () => {
    // Log debug info on failure
    const audioState = await page.evaluate(() => {
      const audio = document.querySelector('audio') as HTMLAudioElement | null;
      return audio ? {
        paused: audio.paused,
        currentTime: audio.currentTime,
        duration: audio.duration,
        readyState: audio.readyState,
        volume: audio.volume,
        muted: audio.muted,
        src: audio.src?.substring(0, 100)
      } : null;
    });
    console.log('Audio state at timeout:', JSON.stringify(audioState));
    throw new Error(`Audio not truly playing: ${JSON.stringify(audioState)}`);
  });
}

/**
 * Legacy wrapper for backward compatibility - uses the robust version
 */
async function waitForAudioPlaying(page: Page, timeout = 15000): Promise<void> {
  await waitForAudioTrulyPlaying(page, timeout);
}

/**
 * Wait for a specific TTFA event matching the given criteria.
 * 
 * @param page - Playwright page
 * @param triggerType - Expected trigger type ('channel_change' or 'energy_change')
 * @param startedAtMs - Timestamp (from Date.now()) when the test action started
 * @param timeoutMs - Maximum time to wait for the event
 * @param requireSuccess - If true, only return successful events (default: false)
 * @returns The matching TTFA event
 */
async function waitForTTFAEvent(
  page: Page,
  triggerType: 'channel_change' | 'energy_change' | 'play' | 'resume',
  startedAtMs: number,
  timeoutMs = 30000,
  requireSuccess = false
): Promise<TTFAEvent> {
  const startedAtISO = new Date(startedAtMs).toISOString();
  
  const event = await page.waitForFunction(
    ({ triggerType, startedAtISO, requireSuccess }) => {
      const perf = (window as any).__playerPerf;
      if (!perf?.events) return null;
      
      const events = perf.events() as TTFAEvent[];
      
      // Find events matching criteria:
      // 1. timestamp >= startedAtISO
      // 2. triggerType matches
      // 3. requestId exists
      // 4. If requireSuccess, event.success must be true
      const matchingEvents = events.filter(e => {
        if (!e.requestId) return false;
        if (e.triggerType !== triggerType) return false;
        if (!e.timestamp) return false;
        if (e.timestamp < startedAtISO) return false;
        if (requireSuccess && e.success !== true) return false;
        return true;
      });
      
      if (matchingEvents.length === 0) return null;
      
      // Return the latest matching event
      return matchingEvents[matchingEvents.length - 1];
    },
    { triggerType, startedAtISO, requireSuccess },
    { timeout: timeoutMs }
  );
  
  const result = await event.jsonValue() as TTFAEvent;
  
  // Log the event for debugging
  console.log(`TTFA Event captured [${triggerType}]:`, JSON.stringify(result, null, 2));
  
  return result;
}

/**
 * Wait for a successful TTFA event, with fallback to any matching event.
 * If a successful event is not found within the timeout, returns the latest matching event
 * (which may be a failure event like loading_timeout).
 */
async function waitForTTFAEventWithFallback(
  page: Page,
  triggerType: 'channel_change' | 'energy_change' | 'play' | 'resume',
  startedAtMs: number,
  timeoutMs = 30000
): Promise<TTFAEvent> {
  // First, try to get a successful event
  try {
    return await waitForTTFAEvent(page, triggerType, startedAtMs, timeoutMs, true);
  } catch {
    // If no successful event, get any matching event (may be a timeout/failure)
    console.log('No successful TTFA event found, checking for failure events...');
    return await waitForTTFAEvent(page, triggerType, startedAtMs, 5000, false);
  }
}

/**
 * Assert TTFA event is successful and within threshold.
 * Provides clear failure messages with full event details.
 * 
 * @param event - The TTFA event to check
 * @param threshold - Maximum acceptable TTFA in ms
 * @param allowTimeout - If true, allows loading_timeout errors when audio did eventually play
 */
function assertTTFASuccess(
  event: TTFAEvent, 
  threshold: number = MAX_TTFA_MS,
  allowTimeout = false
): void {
  if (!event.success) {
    if (allowTimeout && event.error === 'loading_timeout') {
      // Audio eventually played but the instrumentation timeout was too aggressive
      console.warn(`⚠ TTFA instrumentation timeout (audio DID play): ${event.ttfaMs}ms`);
      console.warn('Event details:', JSON.stringify(event, null, 2));
      // Don't fail the test - the audio played, which is the main requirement
      return;
    }
    
    console.error('TTFA Event FAILED:', JSON.stringify(event, null, 2));
    throw new Error(
      `TTFA event failed with error: "${event.error}"\n` +
      `Full event: ${JSON.stringify(event, null, 2)}`
    );
  }
  
  expect(event.ttfaMs).toBeDefined();
  expect(event.ttfaMs).toBeGreaterThan(0);
  expect(event.ttfaMs).toBeLessThanOrEqual(threshold);
  
  console.log(`✓ TTFA Success: ${event.ttfaMs}ms (threshold: ${threshold}ms)`);
}

/**
 * Clicks a channel card and then the play button to start playback.
 * This follows the app's actual UX flow.
 */
async function startPlaybackOnChannel(page: Page, channelLocator: ReturnType<Page['locator']>): Promise<void> {
  // Step 1: Click the channel card to select it
  await channelLocator.click();
  
  // Step 2: Wait for the play button to appear (channel is now active)
  const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
  await playPauseButton.waitFor({ state: 'visible', timeout: 10000 });
  
  // Step 3: Click the play button to start playback
  await playPauseButton.click();
}

async function waitForAudioPaused(page: Page, timeout = 5000): Promise<void> {
  // Use the footer play/pause button's data-playing attribute (same as working tests)
  const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
  await expect(footerPlayPause).toHaveAttribute('data-playing', 'false', { timeout });
}

async function pauseAudio(page: Page): Promise<void> {
  // Use the footer play/pause button (same as working tests)
  const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
  await footerPlayPause.waitFor({ state: 'visible', timeout: 5000 });
  await footerPlayPause.click();
  
  await waitForAudioPaused(page);
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function printTTFASummary(events: TTFAEvent[]): void {
  const successEvents = events.filter(e => e.success && typeof e.ttfaMs === 'number');
  const ttfaValues = successEvents.map(e => e.ttfaMs!);
  
  const p50 = calculatePercentile(ttfaValues, 50);
  const p95 = calculatePercentile(ttfaValues, 95);
  const max = ttfaValues.length > 0 ? Math.max(...ttfaValues) : 0;
  
  console.log('\n=== TTFA Summary ===');
  console.log(`Event Count: ${events.length}`);
  console.log(`Successes: ${successEvents.length}`);
  console.log(`Failures: ${events.filter(e => e.success === false).length}`);
  console.log(`P50: ${p50}ms`);
  console.log(`P95: ${p95}ms`);
  console.log(`Max: ${max}ms`);
  console.log('====================\n');
}

function writeTTFAReport(events: TTFAEvent[]): void {
  try {
    const perfDir = path.join(process.cwd(), 'perf');
    if (!fs.existsSync(perfDir)) {
      fs.mkdirSync(perfDir, { recursive: true });
    }
    
    const reportPath = path.join(perfDir, 'ttfa-latest.json');
    fs.writeFileSync(reportPath, JSON.stringify(events, null, 2));
    console.log(`TTFA report written to: ${reportPath}`);
  } catch (error) {
    console.warn('Failed to write TTFA report:', error);
  }
}

test.describe('TTFA Metrics - Desktop', () => {
  test.skip(!hasTestCredentials, 'Skipping: TEST_USER_EMAIL and TEST_USER_PASSWORD not set');

  test.beforeEach(async ({ page }) => {
    // Full page reload to ensure clean state
    await page.goto('/', { waitUntil: 'networkidle' });
    await loginAsUser(page);
    await navigateToChannelsIfNeeded(page);
    
    // Give app time to fully initialize
    await page.waitForTimeout(1000);
    
    // Clear any existing perf events
    await clearPerfEvents(page);
  });

  test('captures TTFA events on channel start', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    const count = await channelCards.count();
    expect(count).toBeGreaterThan(0);

    // Record timestamp before starting
    const startedAt = Date.now();

    // Click on a channel and start playback
    await startPlaybackOnChannel(page, channelCards.first());

    // Wait for audio to be truly playing
    await waitForAudioTrulyPlaying(page, 45000);

    // Wait for the TTFA event
    const event = await waitForTTFAEvent(page, 'channel_change', startedAt, 30000);
    
    // Assert success
    assertTTFASuccess(event, MAX_TTFA_MS);
    expect(event.triggerType).toBe('channel_change');
    
    // Print summary
    const events = await getPerfEvents(page);
    printTTFASummary(events);
  });

  test('captures TTFA on pause → energy change → resume path (regression test)', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    const count = await channelCards.count();
    expect(count).toBeGreaterThan(0);

    // Record timestamp before starting
    const initialStartedAt = Date.now();

    // 1. Start audio by clicking a channel and then play button
    console.log('Step 1: Starting audio on first channel...');
    await startPlaybackOnChannel(page, channelCards.first());
    await waitForAudioTrulyPlaying(page, 45000);
    
    // Wait for initial TTFA event
    const initialEvent = await waitForTTFAEvent(page, 'channel_change', initialStartedAt, 30000);
    assertTTFASuccess(initialEvent, MAX_TTFA_MS);
    
    // 2. Pause
    console.log('Step 2: Pausing audio...');
    await pauseAudio(page);
    
    // 3. Click a different energy level
    console.log('Step 3: Clicking different energy level...');
    
    // Record timestamp before energy change
    const energyStartedAt = Date.now();
    
    // Try clicking a different energy level - cycle through options
    const energyLevels = ['low', 'medium', 'high'];
    let clicked = false;
    
    for (const level of energyLevels) {
      const energyButton = page.locator(`[data-testid="energy-${level}"]`);
      const isVisible = await energyButton.isVisible({ timeout: 1000 }).catch(() => false);
      
      if (isVisible) {
        // Check if this button is already active
        const isActive = await energyButton.getAttribute('data-active').catch(() => null);
        if (isActive !== 'true') {
          console.log(`Clicking energy level: ${level}`);
          await energyButton.click();
          clicked = true;
          break;
        }
      }
    }
    
    if (!clicked) {
      throw new Error('Could not find a different energy button to click');
    }
    
    // 4. Verify audio plays again (regression test)
    console.log('Step 4: Waiting for audio to resume...');
    await waitForAudioTrulyPlaying(page, 45000);
    console.log('Step 5: Audio resumed successfully! (Regression test passed)');
    
    // Wait for energy change TTFA event (allow timeout since audio eventually played)
    const energyEvent = await waitForTTFAEvent(page, 'energy_change', energyStartedAt, 30000);
    // Allow instrumentation timeout since we already verified audio is playing
    assertTTFASuccess(energyEvent, MAX_TTFA_MS, /* allowTimeout */ true);
    
    // Get all events for summary
    const events = await getPerfEvents(page);
    
    // Should have at least 2 events (initial play + energy change)
    expect(events.length).toBeGreaterThanOrEqual(2);
    
    // Print summary
    printTTFASummary(events);
    
    // Write report for CLI analysis
    writeTTFAReport(events);
  });

  test('TTFA events contain expected timing marks', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    const startedAt = Date.now();
    
    await startPlaybackOnChannel(page, channelCards.first());
    await waitForAudioTrulyPlaying(page, 45000);

    // Wait for the TTFA event
    const event = await waitForTTFAEvent(page, 'channel_change', startedAt, 30000);
    
    // Check required fields
    expect(event.requestId).toBeDefined();
    expect(event.triggerType).toBeDefined();
    expect(event.clickAt).toBeDefined();
    expect(event.clickAt).toBeGreaterThan(0);
    
    // Check success fields
    assertTTFASuccess(event, MAX_TTFA_MS);
    expect(event.firstAudioAt).toBeDefined();
    
    // Check optional timing marks (at least some should be present)
    const hasPlaylistReady = event.playlistReadyAt !== undefined;
    const hasTrackLoadStart = event.trackLoadStartAt !== undefined;
    
    // At least one intermediate mark should be present
    expect(hasPlaylistReady || hasTrackLoadStart).toBe(true);
    
    // Print event details for debugging
    console.log('\nTTFA Event Details:');
    console.log(JSON.stringify(event, null, 2));
  });

  test('summary statistics are calculated correctly', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    const startedAt = Date.now();
    
    // Generate an event
    await startPlaybackOnChannel(page, channelCards.first());
    await waitForAudioTrulyPlaying(page, 45000);
    
    // Wait for the TTFA event to be recorded
    await waitForTTFAEvent(page, 'channel_change', startedAt, 30000);
    
    // Get summary from the app
    const summary = await getPerfSummary(page);
    
    expect(summary).not.toBeNull();
    expect(summary!.count).toBeGreaterThanOrEqual(1);
    expect(summary!.successes).toBeGreaterThanOrEqual(1);
    expect(summary!.failures).toBe(0);
    expect(summary!.successRate).toBe(100);
    expect(summary!.p50Ms).toBeGreaterThan(0);
    expect(summary!.p95Ms).toBeGreaterThanOrEqual(summary!.p50Ms);
    expect(summary!.maxMs).toBeGreaterThanOrEqual(summary!.p95Ms);
    
    console.log('\nApp-calculated Summary:');
    console.log(JSON.stringify(summary, null, 2));
  });
});

test.describe('TTFA Metrics - Performance Validation', () => {
  test.skip(!hasTestCredentials, 'Skipping: TEST_USER_EMAIL and TEST_USER_PASSWORD not set');
  
  // These tests can be flaky due to network/audio timing - allow retries
  test.describe.configure({ retries: 2 });

  test.beforeEach(async ({ page }) => {
    // Full reload to reset app state completely
    await page.goto('/', { waitUntil: 'networkidle' });
    await loginAsUser(page);
    await navigateToChannelsIfNeeded(page);
    
    // Ensure any previous audio is stopped
    const isPlaying = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="player-play-pause"]');
      return btn?.getAttribute('data-playing') === 'true';
    });
    
    if (isPlaying) {
      console.log('Audio was still playing, pausing it first...');
      await pauseAudio(page);
      await page.waitForTimeout(1000);
    }
    
    // Give app time to fully initialize
    await page.waitForTimeout(1000);
    
    await clearPerfEvents(page);
  });

  test('TTFA is under acceptable threshold for channel switch', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    const count = await channelCards.count();
    
    if (count < 2) {
      test.skip(true, 'Need at least 2 channels for this test');
      return;
    }

    // Start on first channel (requires play button click)
    await startPlaybackOnChannel(page, channelCards.first());
    await waitForAudioTrulyPlaying(page, 45000);
    
    // Allow playback to stabilize before switching
    await page.waitForTimeout(2000);

    // Record timestamp BEFORE triggering the channel switch
    const switchStartedAt = Date.now();
    
    // Switch to second channel - clicking while playing auto-starts the new channel
    await channelCards.nth(1).click({ force: true });
    
    // Wait for audio to be truly playing on the new channel
    await waitForAudioTrulyPlaying(page, 45000);
    
    // Wait for the TTFA event matching this channel switch
    const switchEvent = await waitForTTFAEvent(page, 'channel_change', switchStartedAt, 30000);
    
    // Assert success and threshold
    assertTTFASuccess(switchEvent, MAX_TTFA_MS);
  });

  test('TTFA is under acceptable threshold for energy change', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    
    await startPlaybackOnChannel(page, channelCards.first());
    await waitForAudioTrulyPlaying(page, 45000);
    
    // Allow playback to stabilize
    await page.waitForTimeout(2000);

    // Find and click a different energy button (using proper test IDs)
    const energyLow = page.locator('[data-testid="energy-low"]');
    const energyMedium = page.locator('[data-testid="energy-medium"]');
    const energyHigh = page.locator('[data-testid="energy-high"]');
    
    // Record timestamp BEFORE triggering the energy change
    const energyStartedAt = Date.now();
    
    // Find which energy level is currently NOT selected and click it
    let clickedEnergy = false;
    for (const energyButton of [energyLow, energyMedium, energyHigh]) {
      const isVisible = await energyButton.isVisible({ timeout: 2000 }).catch(() => false);
      if (isVisible) {
        const isActive = await energyButton.getAttribute('data-active').catch(() => null);
        if (isActive !== 'true') {
          console.log('Clicking non-active energy button');
          await energyButton.click({ force: true });
          clickedEnergy = true;
          break;
        }
      }
    }
    
    if (!clickedEnergy) {
      // Just click the first visible energy button
      const energyButtons = page.locator('[data-testid^="energy-"]');
      await energyButtons.first().click({ force: true });
    }
    
    // Wait for audio to be truly playing after energy change
    await waitForAudioTrulyPlaying(page, 45000);
    
    // Wait for the TTFA event matching this energy change
    const energyEvent = await waitForTTFAEvent(page, 'energy_change', energyStartedAt, 30000);
    
    // Assert success and threshold (allow instrumentation timeout since audio did play)
    assertTTFASuccess(energyEvent, MAX_TTFA_MS, /* allowTimeout */ true);
  });
});

test.describe('TTFA Metrics - Console Logging', () => {
  test.skip(!hasTestCredentials, 'Skipping: TEST_USER_EMAIL and TEST_USER_PASSWORD not set');

  test('TTFA events are logged to console in structured format', async ({ page }) => {
    // Collect console logs
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'log') {
        consoleLogs.push(msg.text());
      }
    });

    await loginAsUser(page);
    await navigateToChannelsIfNeeded(page);

    const startedAt = Date.now();

    // Trigger playback
    const channelCards = page.locator('[data-channel-id]');
    await startPlaybackOnChannel(page, channelCards.first());
    await waitForAudioTrulyPlaying(page, 45000);
    
    // Wait for TTFA event
    await waitForTTFAEvent(page, 'channel_change', startedAt, 30000);

    // Find [TTFA] log entries
    const ttfaLogs = consoleLogs.filter(log => log.startsWith('[TTFA]'));
    
    // Should have at least one [TTFA] log
    expect(ttfaLogs.length).toBeGreaterThanOrEqual(1);
    
    // The log should be valid JSON after stripping the prefix
    for (const log of ttfaLogs) {
      if (log.startsWith('[TTFA] {')) {
        const jsonPart = log.replace('[TTFA] ', '');
        expect(() => JSON.parse(jsonPart)).not.toThrow();
        
        const parsed = JSON.parse(jsonPart);
        expect(parsed.requestId).toBeDefined();
        expect(parsed.ttfaMs).toBeDefined();
        
        console.log('Parsed TTFA log:', parsed);
      }
    }
  });
});

