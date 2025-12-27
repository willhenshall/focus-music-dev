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

async function waitForAudioPlaying(page: Page, timeout = 15000): Promise<void> {
  await page.waitForFunction(() => {
    const debug = (window as any).__playerDebug;
    return debug?.getTransportState?.() === 'playing';
  }, { timeout });
}

async function waitForAudioPaused(page: Page, timeout = 5000): Promise<void> {
  await page.waitForFunction(() => {
    const debug = (window as any).__playerDebug;
    return debug?.getTransportState?.() === 'paused';
  }, { timeout });
}

async function pauseAudio(page: Page): Promise<void> {
  // Click the pause button in the player bar
  const pauseButton = page.locator('[aria-label="Pause"], button:has([data-lucide="pause"])').first();
  const isVisible = await pauseButton.isVisible({ timeout: 2000 }).catch(() => false);
  
  if (isVisible) {
    await pauseButton.click();
  } else {
    // Fallback: use the play/pause toggle button
    const playPauseButton = page.locator('button:has([data-lucide="pause"])').first();
    await playPauseButton.click();
  }
  
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
    await loginAsUser(page);
    await navigateToChannelsIfNeeded(page);
    // Clear any existing perf events
    await clearPerfEvents(page);
  });

  test('captures TTFA events on channel start', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    const count = await channelCards.count();
    expect(count).toBeGreaterThan(0);

    // Click on a channel to trigger playback
    await channelCards.first().click();

    // Wait for audio to start playing
    await waitForAudioPlaying(page);

    // Wait a bit for TTFA event to be recorded
    await page.waitForTimeout(500);

    // Get TTFA events
    const events = await getPerfEvents(page);
    
    // Should have at least 1 event
    expect(events.length).toBeGreaterThanOrEqual(1);
    
    // First event should be successful
    const firstEvent = events[0];
    expect(firstEvent.success).toBe(true);
    expect(firstEvent.ttfaMs).toBeDefined();
    expect(firstEvent.ttfaMs).toBeLessThan(MAX_TTFA_MS);
    expect(firstEvent.triggerType).toBeDefined();
    
    // Print summary
    printTTFASummary(events);
  });

  test('captures TTFA on pause → energy change → resume path (regression test)', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    const count = await channelCards.count();
    expect(count).toBeGreaterThan(0);

    // 1. Start audio by clicking a channel
    console.log('Step 1: Starting audio on first channel...');
    await channelCards.first().click();
    await waitForAudioPlaying(page);
    
    // Wait for TTFA event
    await page.waitForTimeout(500);
    
    // 2. Pause
    console.log('Step 2: Pausing audio...');
    await pauseAudio(page);
    
    // 3. Click a different energy level
    console.log('Step 3: Clicking different energy level...');
    const energyButtons = page.locator('button:has-text("High"), button:has-text("Low"), button:has-text("Medium")');
    const energyButtonCount = await energyButtons.count();
    
    if (energyButtonCount === 0) {
      console.log('No energy buttons found - skipping energy change test');
      return;
    }
    
    // Get current energy to click a different one
    const activeEnergy = page.locator('[data-energy-active="true"]').first();
    const activeEnergyText = await activeEnergy.textContent().catch(() => 'Medium');
    
    // Click a different energy button
    let targetEnergy = 'High';
    if (activeEnergyText?.includes('High')) {
      targetEnergy = 'Low';
    } else if (activeEnergyText?.includes('Low')) {
      targetEnergy = 'Medium';
    }
    
    const targetButton = page.locator(`button:has-text("${targetEnergy}")`).first();
    const isTargetVisible = await targetButton.isVisible({ timeout: 2000 }).catch(() => false);
    
    if (isTargetVisible) {
      await targetButton.click();
      
      // 4. Verify audio plays again (regression test)
      console.log('Step 4: Waiting for audio to resume...');
      await waitForAudioPlaying(page);
      
      console.log('Step 5: Audio resumed successfully! (Regression test passed)');
    }
    
    // Wait for TTFA events to be recorded
    await page.waitForTimeout(500);
    
    // 5. Capture and verify TTFA events
    const events = await getPerfEvents(page);
    
    // Should have at least 2 events (initial play + energy change)
    expect(events.length).toBeGreaterThanOrEqual(2);
    
    // All events should have ttfaMs computed
    for (const event of events) {
      expect(event.ttfaMs).toBeDefined();
      expect(typeof event.ttfaMs).toBe('number');
    }
    
    // All events should be under the threshold
    for (const event of events) {
      if (event.success) {
        expect(event.ttfaMs).toBeLessThan(MAX_TTFA_MS);
      }
    }
    
    // No events should have errors
    const errorEvents = events.filter(e => e.error);
    expect(errorEvents.length).toBe(0);
    
    // Print summary
    printTTFASummary(events);
    
    // Write report for CLI analysis
    writeTTFAReport(events);
  });

  test('TTFA events contain expected timing marks', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    await channelCards.first().click();
    await waitForAudioPlaying(page);
    await page.waitForTimeout(500);

    const events = await getPerfEvents(page);
    expect(events.length).toBeGreaterThanOrEqual(1);
    
    const event = events[0];
    
    // Check required fields
    expect(event.requestId).toBeDefined();
    expect(event.triggerType).toBeDefined();
    expect(event.clickAt).toBeDefined();
    expect(event.clickAt).toBeGreaterThan(0);
    
    // Check success fields
    expect(event.success).toBe(true);
    expect(event.ttfaMs).toBeDefined();
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
    
    // Generate a few events
    await channelCards.first().click();
    await waitForAudioPlaying(page);
    await page.waitForTimeout(500);
    
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

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    await navigateToChannelsIfNeeded(page);
    await clearPerfEvents(page);
  });

  test('TTFA is under acceptable threshold for channel switch', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    const count = await channelCards.count();
    
    if (count < 2) {
      test.skip(true, 'Need at least 2 channels for this test');
      return;
    }

    // Start on first channel
    await channelCards.first().click();
    await waitForAudioPlaying(page);
    await page.waitForTimeout(500);

    // Clear events to isolate the switch
    await clearPerfEvents(page);

    // Switch to second channel
    await channelCards.nth(1).click();
    await waitForAudioPlaying(page);
    await page.waitForTimeout(500);

    const events = await getPerfEvents(page);
    expect(events.length).toBeGreaterThanOrEqual(1);
    
    const switchEvent = events[0];
    expect(switchEvent.success).toBe(true);
    expect(switchEvent.ttfaMs).toBeLessThan(MAX_TTFA_MS);
    expect(switchEvent.triggerType).toBe('channel_change');
    
    console.log(`Channel switch TTFA: ${switchEvent.ttfaMs}ms`);
  });

  test('TTFA is under acceptable threshold for energy change', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    await channelCards.first().click();
    await waitForAudioPlaying(page);
    await page.waitForTimeout(500);

    // Clear events to isolate the energy change
    await clearPerfEvents(page);

    // Find and click a different energy button
    const energyButtons = page.locator('button:has-text("High"), button:has-text("Low")');
    const energyButtonCount = await energyButtons.count();
    
    if (energyButtonCount === 0) {
      test.skip(true, 'No energy buttons visible');
      return;
    }

    await energyButtons.first().click();
    await waitForAudioPlaying(page);
    await page.waitForTimeout(500);

    const events = await getPerfEvents(page);
    expect(events.length).toBeGreaterThanOrEqual(1);
    
    const energyEvent = events[0];
    expect(energyEvent.success).toBe(true);
    expect(energyEvent.ttfaMs).toBeLessThan(MAX_TTFA_MS);
    expect(energyEvent.triggerType).toBe('energy_change');
    
    console.log(`Energy change TTFA: ${energyEvent.ttfaMs}ms`);
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

    // Trigger playback
    const channelCards = page.locator('[data-channel-id]');
    await channelCards.first().click();
    await waitForAudioPlaying(page);
    await page.waitForTimeout(1000);

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

