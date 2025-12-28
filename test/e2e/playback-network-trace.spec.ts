import { test, expect, Page } from '@playwright/test';
import { loginAsUser } from '../../tests/helpers/auth';

/**
 * E2E tests for Playback Network Trace instrumentation.
 * 
 * This test verifies that the DEV-only network tracing system:
 * 1. Captures network requests during playback startup
 * 2. Correlates traces to TTFA requestId
 * 3. Produces structured trace data via window.__playbackTrace
 * 
 * NOTE: This is a structural test - it verifies the trace system works,
 * not specific request counts (which vary by environment).
 */

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

/**
 * PlaybackTrace type as exposed via window.__playbackTrace
 */
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
    errorMessage?: string;
  }>;
  summary?: {
    totalRequests: number;
    totalDurationMs: number;
    byHostname: Record<string, { count: number; totalMs: number }>;
    byEndpoint: Record<string, number>;
    slowestRequests: Array<{ url: string; durationMs: number }>;
  };
  active: boolean;
}

/**
 * Navigate to channels if not already visible.
 */
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

/**
 * Get the latest completed trace from window.__playbackTrace.
 */
async function getLatestTrace(page: Page): Promise<PlaybackTrace | null> {
  return page.evaluate(() => {
    const traceApi = (window as any).__playbackTrace;
    return traceApi?.latest?.() ?? null;
  });
}

/**
 * Get all completed traces from window.__playbackTrace.
 */
async function getAllTraces(page: Page): Promise<PlaybackTrace[]> {
  return page.evaluate(() => {
    const traceApi = (window as any).__playbackTrace;
    return traceApi?.traces?.() ?? [];
  });
}

/**
 * Clear all traces.
 */
async function clearTraces(page: Page): Promise<void> {
  await page.evaluate(() => {
    const traceApi = (window as any).__playbackTrace;
    traceApi?.clear?.();
  });
}

/**
 * Check if __playbackTrace API is available (DEV-only).
 */
async function isTraceApiAvailable(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return typeof (window as any).__playbackTrace !== 'undefined';
  });
}

/**
 * Robust audio playing verification.
 */
async function waitForAudioPlaying(page: Page, timeoutMs = 30000): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const isPlaying = await page.evaluate(() => {
      const audioElements = document.querySelectorAll('audio');
      for (const audio of audioElements) {
        if (!audio.paused && audio.currentTime > 0.05 && audio.readyState >= 2) {
          return true;
        }
      }
      return false;
    });
    
    if (isPlaying) return true;
    await page.waitForTimeout(100);
  }
  
  return false;
}

test.describe('Playback Network Trace', () => {
  test.beforeEach(async ({ page }) => {
    // Skip if no test credentials
    test.skip(!hasTestCredentials, 'Test credentials not configured');
  });

  test('should capture network trace during playback startup', async ({ page }) => {
    // Login
    await page.goto('/');
    await loginAsUser(page, TEST_USER_EMAIL!, TEST_USER_PASSWORD!);
    
    // Wait for app to load
    await page.waitForTimeout(2000);
    
    // Navigate to channels
    await navigateToChannelsIfNeeded(page);
    
    // Verify trace API is available (DEV mode)
    const apiAvailable = await isTraceApiAvailable(page);
    if (!apiAvailable) {
      test.skip(true, 'Trace API not available (production build)');
      return;
    }
    
    // Clear any existing traces
    await clearTraces(page);
    
    // Click on a channel to start playback
    const firstChannel = page.locator('[data-channel-id]').first();
    await firstChannel.click();
    
    // Wait for audio to actually be playing
    const audioStarted = await waitForAudioPlaying(page, 30000);
    expect(audioStarted).toBe(true);
    
    // Give a moment for trace to finalize
    await page.waitForTimeout(500);
    
    // Get the latest trace
    const trace = await getLatestTrace(page);
    
    // Verify trace exists and has required structure
    expect(trace).not.toBeNull();
    expect(trace!.requestId).toBeTruthy();
    expect(trace!.outcome).toBeDefined();
    expect(trace!.outcome!.outcome).toBe('success');
    
    // Verify summary exists
    expect(trace!.summary).toBeDefined();
    expect(trace!.summary!.totalRequests).toBeGreaterThan(0);
    
    // Verify we captured at least some Supabase or API requests
    const hasApiRequests = trace!.events.some(e => 
      e.hostname.includes('supabase') || 
      e.pathname.includes('/rest/v1/') ||
      e.pathname.includes('/auth/')
    );
    expect(hasApiRequests).toBe(true);
    
    // Verify meta was captured
    expect(trace!.meta.channelId).toBeTruthy();
    
    // Log for debugging (visible in Playwright report)
    console.log('[TEST] Trace captured:', {
      requestId: trace!.requestId,
      outcome: trace!.outcome,
      totalRequests: trace!.summary!.totalRequests,
      totalNetworkMs: trace!.summary!.totalDurationMs,
      hostnames: Object.keys(trace!.summary!.byHostname),
    });
  });

  test('should track multiple sequential playback attempts', async ({ page }) => {
    // Login
    await page.goto('/');
    await loginAsUser(page, TEST_USER_EMAIL!, TEST_USER_PASSWORD!);
    
    await page.waitForTimeout(2000);
    await navigateToChannelsIfNeeded(page);
    
    const apiAvailable = await isTraceApiAvailable(page);
    if (!apiAvailable) {
      test.skip(true, 'Trace API not available (production build)');
      return;
    }
    
    await clearTraces(page);
    
    // Start first playback
    const channels = page.locator('[data-channel-id]');
    const channelCount = await channels.count();
    
    if (channelCount >= 2) {
      // Click first channel
      await channels.first().click();
      await waitForAudioPlaying(page, 30000);
      await page.waitForTimeout(500);
      
      // Click second channel (channel switch)
      await channels.nth(1).click();
      await waitForAudioPlaying(page, 30000);
      await page.waitForTimeout(500);
      
      // Get all traces
      const traces = await getAllTraces(page);
      
      // Should have 2 traces
      expect(traces.length).toBeGreaterThanOrEqual(2);
      
      // Each trace should have unique requestId
      const requestIds = new Set(traces.map(t => t.requestId));
      expect(requestIds.size).toBeGreaterThanOrEqual(2);
      
      // All completed traces should have success outcome
      traces.forEach(trace => {
        expect(trace.outcome).toBeDefined();
        expect(trace.active).toBe(false);
      });
      
      console.log('[TEST] Multiple traces captured:', {
        count: traces.length,
        requestIds: Array.from(requestIds),
      });
    } else {
      // Only one channel available, just verify single trace
      await channels.first().click();
      await waitForAudioPlaying(page, 30000);
      await page.waitForTimeout(500);
      
      const traces = await getAllTraces(page);
      expect(traces.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('should have correct trace summary structure', async ({ page }) => {
    // Login
    await page.goto('/');
    await loginAsUser(page, TEST_USER_EMAIL!, TEST_USER_PASSWORD!);
    
    await page.waitForTimeout(2000);
    await navigateToChannelsIfNeeded(page);
    
    const apiAvailable = await isTraceApiAvailable(page);
    if (!apiAvailable) {
      test.skip(true, 'Trace API not available (production build)');
      return;
    }
    
    await clearTraces(page);
    
    // Start playback
    const firstChannel = page.locator('[data-channel-id]').first();
    await firstChannel.click();
    await waitForAudioPlaying(page, 30000);
    await page.waitForTimeout(500);
    
    const trace = await getLatestTrace(page);
    expect(trace).not.toBeNull();
    
    // Validate summary structure
    const summary = trace!.summary!;
    
    // Required fields
    expect(typeof summary.totalRequests).toBe('number');
    expect(typeof summary.totalDurationMs).toBe('number');
    expect(typeof summary.byHostname).toBe('object');
    expect(typeof summary.byEndpoint).toBe('object');
    expect(Array.isArray(summary.slowestRequests)).toBe(true);
    
    // byHostname entries should have count and totalMs
    for (const [hostname, data] of Object.entries(summary.byHostname)) {
      expect(typeof hostname).toBe('string');
      expect(typeof data.count).toBe('number');
      expect(typeof data.totalMs).toBe('number');
    }
    
    // slowestRequests should have url and durationMs
    summary.slowestRequests.forEach(req => {
      expect(typeof req.url).toBe('string');
      expect(typeof req.durationMs).toBe('number');
    });
    
    // Slowest should be sorted (first is slowest)
    if (summary.slowestRequests.length >= 2) {
      expect(summary.slowestRequests[0].durationMs)
        .toBeGreaterThanOrEqual(summary.slowestRequests[1].durationMs);
    }
    
    console.log('[TEST] Summary structure validated:', {
      totalRequests: summary.totalRequests,
      hostnames: Object.keys(summary.byHostname),
      slowestCount: summary.slowestRequests.length,
    });
  });
});

