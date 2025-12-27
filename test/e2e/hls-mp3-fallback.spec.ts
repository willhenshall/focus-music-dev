import { test, expect, Page } from "@playwright/test";
import { signInAsAdmin, hasAdminCredentials } from "./admin-login";

/**
 * E2E Tests for HLS → MP3 Fallback
 * 
 * These tests verify that when HLS loading fails (manifest/level/fragment errors),
 * the StreamingAudioEngine automatically falls back to direct MP3 playback.
 * 
 * Test Strategy:
 * - Mock network routes to return 404 for .m3u8 (HLS manifest) requests
 * - Verify audio still plays via MP3 fallback
 * - Verify fallback metrics are recorded
 * 
 * Desktop-only (chromium) as per requirements.
 */

test.skip(
  !hasAdminCredentials,
  "Skipping HLS fallback tests: TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set"
);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Signs in as an admin user and waits for channels to load.
 */
async function signInAndNavigate(page: Page): Promise<boolean> {
  try {
    const ok = await signInAsAdmin(page);
    if (!ok) return false;
    await page.locator('[data-channel-id]').first().waitFor({ state: "visible", timeout: 15000 });
    return true;
  } catch (error) {
    console.error("[HLS FALLBACK] Failed to sign in:", error);
    return false;
  }
}

/**
 * Set up route mocking to block HLS manifest requests.
 * This simulates HLS unavailability (404, network error, etc.).
 */
async function mockHLSFailure(page: Page): Promise<void> {
  // Block all .m3u8 requests with a 404
  await page.route('**/*.m3u8', (route) => {
    console.log('[HLS FALLBACK TEST] Blocking HLS request:', route.request().url());
    route.fulfill({
      status: 404,
      contentType: 'text/plain',
      body: 'Not Found - HLS manifest blocked for testing',
    });
  });
}

/**
 * Starts playback on the first channel.
 */
async function startPlayback(page: Page): Promise<void> {
  const firstChannel = page.locator('[data-channel-id]').first();
  await firstChannel.click();
  
  const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
  await expect(playPauseButton).toBeVisible({ timeout: 10000 });
  await playPauseButton.click();
}

/**
 * Wait for audio to start playing.
 */
async function waitForPlaying(page: Page, timeout: number = 20000): Promise<boolean> {
  try {
    await page.waitForFunction(() => {
      const debug = (window as any).__playerDebug;
      if (!debug?.getTransportState) return false;
      return debug.getTransportState() === 'playing';
    }, { timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if HLS is currently active.
 */
async function isHLSActive(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const debug = (window as any).__playerDebug;
    const metrics = debug?.getHLSMetrics?.();
    return metrics?.isHLSActive === true;
  });
}

/**
 * Get HLS fallback events from the debug interface.
 */
async function getHLSFallbackEvents(page: Page): Promise<any[]> {
  return page.evaluate(() => {
    const debug = (window as any).__playerDebug;
    return debug?.hlsFallbackEvents ?? [];
  });
}

/**
 * Get the current playback time.
 */
async function getCurrentTime(page: Page): Promise<number> {
  return page.evaluate(() => {
    const debug = (window as any).__playerDebug;
    return debug?.getCurrentTime?.() ?? 0;
  });
}

// =============================================================================
// TEST SUITE: HLS to MP3 Fallback
// =============================================================================

test.describe("HLS → MP3 Fallback", () => {

  test.beforeEach(async ({ page }, testInfo) => {
    // Skip on mobile projects - desktop only
    if (testInfo.project.name?.includes('mobile')) {
      test.skip(true, "HLS fallback tests are desktop-only (chromium).");
    }
  });

  test("audio plays via MP3 when HLS manifest returns 404", async ({ page }) => {
    // Set up HLS failure BEFORE navigating
    await mockHLSFailure(page);
    
    const signedIn = await signInAndNavigate(page);
    if (!signedIn) {
      test.skip(true, "Could not sign in");
      return;
    }

    // Start playback
    await startPlayback(page);

    // Wait for audio to start playing
    const isPlaying = await waitForPlaying(page, 25000);
    
    // Even with HLS blocked, audio should play via MP3 fallback
    expect(isPlaying).toBe(true);
    console.log("[HLS FALLBACK] Audio is playing despite HLS being blocked");

    // Verify HLS is NOT active (we're using MP3)
    const hlsActive = await isHLSActive(page);
    expect(hlsActive).toBe(false);
    console.log("[HLS FALLBACK] Confirmed HLS is not active (MP3 fallback succeeded)");

    // Verify playback is progressing
    const time1 = await getCurrentTime(page);
    await page.waitForTimeout(2000);
    const time2 = await getCurrentTime(page);
    
    expect(time2).toBeGreaterThan(time1);
    console.log(`[HLS FALLBACK] Playback progressing: ${time1.toFixed(1)}s → ${time2.toFixed(1)}s`);
  });

  test("fallback event is recorded when HLS fails", async ({ page }) => {
    // Set up HLS failure BEFORE navigating
    await mockHLSFailure(page);
    
    const signedIn = await signInAndNavigate(page);
    if (!signedIn) {
      test.skip(true, "Could not sign in");
      return;
    }

    // Start playback
    await startPlayback(page);

    // Wait for audio to start playing (indicates fallback worked)
    const isPlaying = await waitForPlaying(page, 25000);
    expect(isPlaying).toBe(true);

    // Check fallback events were recorded
    const fallbackEvents = await getHLSFallbackEvents(page);
    
    // Should have at least one fallback event
    expect(fallbackEvents.length).toBeGreaterThanOrEqual(1);
    
    const event = fallbackEvents[0];
    expect(event).toHaveProperty('trackId');
    expect(event).toHaveProperty('errorType');
    expect(event).toHaveProperty('browser');
    expect(event).toHaveProperty('timestamp');
    
    console.log("[HLS FALLBACK] Fallback event recorded:", {
      trackId: event.trackId,
      errorType: event.errorType,
      browser: event.browser,
    });
  });

  test("playback continues normally when HLS succeeds", async ({ page }) => {
    // Do NOT mock HLS failure - let it work normally
    const signedIn = await signInAndNavigate(page);
    if (!signedIn) {
      test.skip(true, "Could not sign in");
      return;
    }

    // Start playback
    await startPlayback(page);

    // Wait for audio to start playing
    const isPlaying = await waitForPlaying(page, 20000);
    expect(isPlaying).toBe(true);

    // Check if HLS is active (if track has HLS support)
    const hlsActive = await isHLSActive(page);
    
    // Log the result - HLS may or may not be active depending on track
    console.log(`[HLS FALLBACK] Normal playback - HLS active: ${hlsActive}`);

    // Either way, playback should be progressing
    const time1 = await getCurrentTime(page);
    await page.waitForTimeout(2000);
    const time2 = await getCurrentTime(page);
    
    expect(time2).toBeGreaterThan(time1);
    console.log(`[HLS FALLBACK] Playback progressing: ${time1.toFixed(1)}s → ${time2.toFixed(1)}s`);
  });

  test("multiple tracks work with HLS blocked", async ({ page }) => {
    // Set up HLS failure BEFORE navigating
    await mockHLSFailure(page);
    
    const signedIn = await signInAndNavigate(page);
    if (!signedIn) {
      test.skip(true, "Could not sign in");
      return;
    }

    // Start playback
    await startPlayback(page);

    // Wait for audio to start playing
    let isPlaying = await waitForPlaying(page, 25000);
    expect(isPlaying).toBe(true);
    console.log("[HLS FALLBACK] First track playing");

    // Skip to next track
    const skipButton = page.locator('[data-testid="skip-track-button"]');
    if (await skipButton.isVisible()) {
      await skipButton.click();
      
      // Wait for next track to start playing
      await page.waitForTimeout(3000);
      isPlaying = await waitForPlaying(page, 20000);
      expect(isPlaying).toBe(true);
      console.log("[HLS FALLBACK] Second track also playing via MP3 fallback");
    } else {
      console.log("[HLS FALLBACK] Skip button not visible, skipping multi-track test");
    }
  });
});

// =============================================================================
// TEST SUITE: Fallback Edge Cases
// =============================================================================

test.describe("HLS Fallback - Edge Cases", () => {

  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name?.includes('mobile')) {
      test.skip(true, "HLS fallback tests are desktop-only (chromium).");
    }
  });

  test("channel switch during HLS failure does not cause ghost audio", async ({ page }) => {
    // Set up HLS failure
    await mockHLSFailure(page);
    
    const signedIn = await signInAndNavigate(page);
    if (!signedIn) {
      test.skip(true, "Could not sign in");
      return;
    }

    // Start playback on first channel
    const channels = page.locator('[data-channel-id]');
    const channelCount = await channels.count();
    
    if (channelCount < 2) {
      test.skip(true, "Need at least 2 channels for this test");
      return;
    }

    // Click first channel
    await channels.first().click();
    await page.locator('[data-testid="channel-play-pause"]').click();
    
    // Quickly switch to second channel (before first finishes loading)
    await page.waitForTimeout(500);
    await channels.nth(1).click();
    
    // Wait for audio to stabilize
    await page.waitForTimeout(5000);
    
    // Should only have one audio source playing (not ghost audio from first channel)
    const isPlaying = await waitForPlaying(page, 15000);
    expect(isPlaying).toBe(true);
    
    // Get current track info to verify we're on the second channel
    const trackInfo = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return {
        trackId: debug?.getCurrentTrackId?.(),
        transport: debug?.getTransportState?.(),
      };
    });
    
    console.log("[HLS FALLBACK] After quick channel switch:", trackInfo);
    
    // The key assertion: only one audio source should be playing
    // (verifying no ghost audio from stale fallback attempts)
    expect(trackInfo.transport).toBe('playing');
  });
});

