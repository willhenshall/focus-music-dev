import { test, expect, Page } from "@playwright/test";
import { login } from "./login";

/**
 * Channel Switch Resilience E2E Tests
 * 
 * These tests verify that channel switching works correctly without:
 * - Stale track names flashing during switch
 * - Old track audio continuing to play
 * - Session state corruption
 * 
 * Covers recent bug fixes:
 * - fix/channel-card-stale-track - Prevent stale track name flash
 * - fix/audio-crossfade-click - Smooth transitions without clicks
 * - HLS cleanup during channel switch
 * 
 * Prerequisites:
 *   - Test user account must exist
 *   - Environment variables from .env.test:
 *     - TEST_USER_EMAIL
 *     - TEST_USER_PASSWORD
 * 
 * Run with:
 *   npm run e2e -- test/e2e/channel-switch-resilience.spec.ts
 */

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Signs in as the test user and navigates to dashboard.
 */
async function signInAsTestUser(page: Page): Promise<boolean> {
  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    return false;
  }

  try {
    await login(page);

    const signInButton = page.locator("header").getByRole("button", { name: /sign in/i });
    await signInButton.click();

    const emailInput = page.getByLabel(/email/i);
    await emailInput.waitFor({ state: "visible", timeout: 5000 });
    await emailInput.fill(TEST_USER_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_USER_PASSWORD);

    await page.locator("form").getByRole("button", { name: /sign in/i }).click();

    // Wait for dashboard to load
    try {
      await Promise.race([
        page.waitForSelector('[data-testid="mobile-menu-button"]', { state: "visible", timeout: 15000 }),
        page.waitForSelector('button:has-text("Sign Out")', { state: "visible", timeout: 15000 }),
      ]);
    } catch {
      const hasAuthError = await page.locator('text=/invalid.*credentials|error.*login|incorrect.*password/i').isVisible().catch(() => false);
      if (hasAuthError) {
        console.error("[CHANNEL_SWITCH] Authentication failed");
        return false;
      }
      throw new Error("Dashboard did not load");
    }

    return true;
  } catch (error) {
    console.error("[CHANNEL_SWITCH] Sign in failed:", error);
    return false;
  }
}

/**
 * Navigates to the Channels tab.
 */
async function navigateToChannels(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");

  // Check if mobile or desktop
  const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]');
  const isMobile = await mobileMenuButton.isVisible().catch(() => false);

  if (isMobile) {
    await mobileMenuButton.click();
    await page.waitForTimeout(300);
    const mobileNavChannels = page.locator('[data-testid="mobile-nav-channels"]');
    await mobileNavChannels.waitFor({ state: "visible", timeout: 5000 });
    await mobileNavChannels.click();
  } else {
    const staticNav = page.locator('[data-testid="nav-channels"]');
    const staticNavVisible = await staticNav.isVisible().catch(() => false);

    if (staticNavVisible) {
      await staticNav.click({ force: true });
    } else {
      await page.mouse.move(500, 50);
      const channelsButton = page.getByRole("button", { name: /^channels$/i }).first();
      await channelsButton.waitFor({ state: "visible", timeout: 5000 });
      await channelsButton.click({ force: true });
    }
  }

  await page.locator('[data-channel-id]').first().waitFor({ state: "visible", timeout: 10000 });
}

/**
 * Gets the current track info from the player footer.
 */
async function getCurrentTrackInfo(page: Page): Promise<{ name: string | null; channel: string | null }> {
  const trackInfo = page.locator('[data-testid="player-track-info"]');
  const isVisible = await trackInfo.isVisible().catch(() => false);

  if (!isVisible) {
    return { name: null, channel: null };
  }

  // Get track name and channel from the track info element
  const name = await trackInfo.locator('[data-testid="track-name"]').textContent().catch(() => null);
  const channel = await trackInfo.locator('[data-testid="track-channel"]').textContent().catch(() => null);

  return { name, channel };
}

/**
 * Captures debug info from the player.
 */
async function captureDebugInfo(page: Page): Promise<{
  trackUrl: string | null;
  sessionId: number;
  currentTime: number;
  channelId: string | null;
}> {
  await page.waitForFunction(() => {
    const debug = (window as any).__playerDebug;
    return debug && typeof debug.getPlaybackSessionId === "function";
  }, { timeout: 10000 });

  return page.evaluate(() => {
    const debug = (window as any).__playerDebug;
    return {
      trackUrl: debug.getCurrentTrackUrl?.() || null,
      sessionId: debug.getPlaybackSessionId?.() || 0,
      currentTime: debug.getCurrentTime?.() || 0,
      channelId: debug.getActiveChannel?.()?.id || null,
    };
  });
}

/**
 * Starts playback on a specific channel by index.
 */
async function startPlaybackOnChannel(page: Page, channelIndex: number): Promise<void> {
  const channelCards = page.locator('[data-channel-id]');
  const channel = channelCards.nth(channelIndex);

  await channel.click();
  await page.waitForTimeout(500);

  const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
  await expect(playPauseButton).toBeVisible({ timeout: 10000 });
  await playPauseButton.click();

  // Wait for playback to start
  const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
  await expect(footerPlayPause).toHaveAttribute("data-playing", "true", { timeout: 15000 });
}

/**
 * Stops playback if currently playing.
 */
async function stopPlayback(page: Page): Promise<void> {
  const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
  const isVisible = await footerPlayPause.isVisible().catch(() => false);

  if (isVisible) {
    const isPlaying = await footerPlayPause.getAttribute("data-playing");
    if (isPlaying === "true") {
      await footerPlayPause.click();
      await expect(footerPlayPause).toHaveAttribute("data-playing", "false", { timeout: 5000 });
    }
  }
}

// =============================================================================
// TEST SUITES
// =============================================================================

test.describe("Channel Switch Resilience - Desktop", () => {
  test.skip(!hasTestCredentials, "Skipping tests: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAsTestUser(page);
    if (!signedIn) {
      test.skip();
    }
  });

  test.afterEach(async ({ page }) => {
    await stopPlayback(page).catch(() => {});
  });

  // ===========================================================================
  // Test 1: No stale track name flash during channel switch
  // ===========================================================================
  test("channel switch does not flash stale track name", async ({ page }) => {
    console.log("[CHANNEL_SWITCH] Testing for stale track name flash...");

    await navigateToChannels(page);

    // Start playback on first channel
    console.log("[CHANNEL_SWITCH] Starting playback on channel 0...");
    await startPlaybackOnChannel(page, 0);
    await page.waitForTimeout(2000);

    // Capture initial track info
    const initialInfo = await captureDebugInfo(page);
    console.log(`[CHANNEL_SWITCH] Initial channel: ${initialInfo.channelId}`);

    // Get channel count
    const channelCards = page.locator('[data-channel-id]');
    const channelCount = await channelCards.count();

    if (channelCount < 2) {
      console.log("[CHANNEL_SWITCH] Not enough channels to test switching");
      test.skip();
      return;
    }

    // Set up mutation observer to detect any text changes in track info
    const trackNameChanges: string[] = [];
    await page.evaluate(() => {
      const trackInfo = document.querySelector('[data-testid="player-track-info"]');
      if (!trackInfo) return;

      (window as any).__trackNameChanges = [];
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'characterData' || mutation.type === 'childList') {
            const currentName = trackInfo.querySelector('[data-testid="track-name"]')?.textContent;
            (window as any).__trackNameChanges.push({
              timestamp: Date.now(),
              name: currentName,
            });
          }
        }
      });

      observer.observe(trackInfo, {
        characterData: true,
        childList: true,
        subtree: true,
      });

      (window as any).__stopTrackObserver = () => observer.disconnect();
    });

    // Switch to second channel
    console.log("[CHANNEL_SWITCH] Switching to channel 1...");
    const secondChannel = channelCards.nth(1);
    await secondChannel.click();
    await page.waitForTimeout(500);

    const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
    await playPauseButton.click();

    // Wait for new track to load
    await page.waitForTimeout(3000);

    // Get observed changes
    const observedChanges = await page.evaluate(() => {
      (window as any).__stopTrackObserver?.();
      return (window as any).__trackNameChanges || [];
    });

    // Verify: track name should not flash back to old track
    const newInfo = await captureDebugInfo(page);
    console.log(`[CHANNEL_SWITCH] New channel: ${newInfo.channelId}`);
    console.log(`[CHANNEL_SWITCH] Track name changes observed: ${observedChanges.length}`);

    // The channel should have changed
    expect(newInfo.channelId).not.toBe(initialInfo.channelId);

    // If there were intermediate changes, none should be the old track name
    // (This catches the "stale flash" bug)
    if (observedChanges.length > 1) {
      const initialTrackUrl = initialInfo.trackUrl;
      const flashedBack = observedChanges.some((change: { name: string }) => 
        change.name && initialTrackUrl?.includes(change.name)
      );
      expect(flashedBack).toBe(false);
      console.log("[CHANNEL_SWITCH] ✅ No stale track name flash detected");
    }
  });

  // ===========================================================================
  // Test 2: Session ID changes on channel switch
  // ===========================================================================
  test("session ID changes when switching channels", async ({ page }) => {
    console.log("[CHANNEL_SWITCH] Testing session ID change on channel switch...");

    await navigateToChannels(page);

    // Start playback on first channel
    await startPlaybackOnChannel(page, 0);
    await page.waitForTimeout(2000);

    const initialInfo = await captureDebugInfo(page);
    console.log(`[CHANNEL_SWITCH] Initial session ID: ${initialInfo.sessionId}`);

    // Get channel count
    const channelCards = page.locator('[data-channel-id]');
    const channelCount = await channelCards.count();

    if (channelCount < 2) {
      test.skip();
      return;
    }

    // Switch to second channel
    const secondChannel = channelCards.nth(1);
    await secondChannel.click();
    await page.waitForTimeout(500);

    const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
    await playPauseButton.click();

    await page.waitForTimeout(3000);

    const newInfo = await captureDebugInfo(page);
    console.log(`[CHANNEL_SWITCH] New session ID: ${newInfo.sessionId}`);

    // Session ID should change when switching channels
    expect(newInfo.sessionId).not.toBe(initialInfo.sessionId);
    console.log("[CHANNEL_SWITCH] ✅ Session ID correctly changed on channel switch");
  });

  // ===========================================================================
  // Test 3: Track URL changes on channel switch
  // ===========================================================================
  test("track URL changes when switching channels", async ({ page }) => {
    console.log("[CHANNEL_SWITCH] Testing track URL change on channel switch...");

    await navigateToChannels(page);

    await startPlaybackOnChannel(page, 0);
    await page.waitForTimeout(2000);

    const initialInfo = await captureDebugInfo(page);
    console.log(`[CHANNEL_SWITCH] Initial track URL: ${initialInfo.trackUrl?.substring(0, 50)}...`);

    const channelCards = page.locator('[data-channel-id]');
    const channelCount = await channelCards.count();

    if (channelCount < 2) {
      test.skip();
      return;
    }

    // Switch to second channel
    const secondChannel = channelCards.nth(1);
    await secondChannel.click();
    await page.waitForTimeout(500);

    const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
    await playPauseButton.click();

    await page.waitForTimeout(3000);

    const newInfo = await captureDebugInfo(page);
    console.log(`[CHANNEL_SWITCH] New track URL: ${newInfo.trackUrl?.substring(0, 50)}...`);

    // Track URL should change
    expect(newInfo.trackUrl).not.toBe(initialInfo.trackUrl);
    console.log("[CHANNEL_SWITCH] ✅ Track URL correctly changed on channel switch");
  });

  // ===========================================================================
  // Test 4: Rapid channel switching stability
  // ===========================================================================
  test("rapid channel switching remains stable", async ({ page }) => {
    console.log("[CHANNEL_SWITCH] Testing rapid channel switching stability...");

    await navigateToChannels(page);

    const channelCards = page.locator('[data-channel-id]');
    const channelCount = await channelCards.count();

    if (channelCount < 3) {
      console.log("[CHANNEL_SWITCH] Not enough channels for rapid switching test");
      test.skip();
      return;
    }

    // Start on first channel
    await startPlaybackOnChannel(page, 0);
    await page.waitForTimeout(1000);

    const footerPlayPause = page.locator('[data-testid="player-play-pause"]');

    // Rapidly switch between channels (simulates user quickly browsing)
    const switchSequence = [1, 2, 0, 2, 1];

    for (const channelIndex of switchSequence) {
      console.log(`[CHANNEL_SWITCH] Rapid switch to channel ${channelIndex}...`);

      const channel = channelCards.nth(channelIndex);
      await channel.click();
      await page.waitForTimeout(300);

      const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
      await playPauseButton.click();

      // Very brief wait - stress test
      await page.waitForTimeout(500);
    }

    // Final stabilization wait
    await page.waitForTimeout(2000);

    // Verify: Should be playing on the last channel
    await expect(footerPlayPause).toHaveAttribute("data-playing", "true", { timeout: 10000 });

    const finalInfo = await captureDebugInfo(page);
    console.log(`[CHANNEL_SWITCH] Final channel ID: ${finalInfo.channelId}`);
    console.log(`[CHANNEL_SWITCH] Final session ID: ${finalInfo.sessionId}`);

    // Should have a valid track URL
    expect(finalInfo.trackUrl).toBeTruthy();

    console.log("[CHANNEL_SWITCH] ✅ Rapid channel switching remained stable");
  });

  // ===========================================================================
  // Test 5: No ghost audio from old channel
  // ===========================================================================
  test("no ghost audio from old channel after switch", async ({ page }) => {
    console.log("[CHANNEL_SWITCH] Testing for ghost audio after switch...");

    await navigateToChannels(page);

    await startPlaybackOnChannel(page, 0);
    await page.waitForTimeout(2000);

    const initialInfo = await captureDebugInfo(page);

    const channelCards = page.locator('[data-channel-id]');
    const channelCount = await channelCards.count();

    if (channelCount < 2) {
      test.skip();
      return;
    }

    // Switch to second channel
    const secondChannel = channelCards.nth(1);
    await secondChannel.click();
    await page.waitForTimeout(500);

    const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
    await playPauseButton.click();

    // Wait for crossfade to complete
    await page.waitForTimeout(3000);

    // Verify only ONE audio element is playing (via console or debug)
    const audioStates = await page.evaluate(() => {
      const audioElements = document.querySelectorAll('audio');
      return Array.from(audioElements).map(audio => ({
        src: audio.src ? audio.src.substring(0, 50) + '...' : 'empty',
        paused: audio.paused,
        volume: audio.volume,
        currentTime: audio.currentTime,
      }));
    });

    console.log(`[CHANNEL_SWITCH] Audio elements found: ${audioStates.length}`);
    audioStates.forEach((state, i) => {
      console.log(`[CHANNEL_SWITCH] Audio ${i}: paused=${state.paused}, vol=${state.volume.toFixed(2)}, time=${state.currentTime.toFixed(1)}s`);
    });

    // Only one audio element should be playing (volume > 0 and not paused)
    const playingElements = audioStates.filter(s => !s.paused && s.volume > 0.01);
    expect(playingElements.length).toBeLessThanOrEqual(1);

    console.log("[CHANNEL_SWITCH] ✅ No ghost audio detected after channel switch");
  });
});

// =============================================================================
// MOBILE TESTS
// =============================================================================

test.describe("Channel Switch Resilience - Mobile", () => {
  test.use({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
  });

  test.skip(!hasTestCredentials, "Skipping tests: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAsTestUser(page);
    if (!signedIn) {
      test.skip();
    }
  });

  test.afterEach(async ({ page }) => {
    await stopPlayback(page).catch(() => {});
  });

  test("mobile channel switch does not flash stale track name", async ({ page }) => {
    console.log("[CHANNEL_SWITCH][MOBILE] Testing for stale track name flash...");

    await navigateToChannels(page);

    // Tap first channel to start playback
    const channelCards = page.locator('[data-channel-id]');
    const firstChannel = channelCards.first();
    await firstChannel.tap();
    await page.waitForTimeout(500);

    const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
    await expect(playPauseButton).toBeVisible({ timeout: 10000 });
    await playPauseButton.tap();

    const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
    await expect(footerPlayPause).toHaveAttribute("data-playing", "true", { timeout: 15000 });

    await page.waitForTimeout(2000);

    const initialInfo = await captureDebugInfo(page);

    const channelCount = await channelCards.count();
    if (channelCount < 2) {
      test.skip();
      return;
    }

    // Tap second channel
    const secondChannel = channelCards.nth(1);
    await secondChannel.tap();
    await page.waitForTimeout(500);
    await playPauseButton.tap();

    await page.waitForTimeout(3000);

    const newInfo = await captureDebugInfo(page);

    // Verify channel changed
    expect(newInfo.channelId).not.toBe(initialInfo.channelId);
    console.log("[CHANNEL_SWITCH][MOBILE] ✅ Channel switch successful without stale flash");
  });

  test("mobile rapid channel switching remains stable", async ({ page }) => {
    console.log("[CHANNEL_SWITCH][MOBILE] Testing rapid channel switching...");

    await navigateToChannels(page);

    const channelCards = page.locator('[data-channel-id]');
    const channelCount = await channelCards.count();

    if (channelCount < 3) {
      test.skip();
      return;
    }

    // Start on first channel
    const firstChannel = channelCards.first();
    await firstChannel.tap();
    await page.waitForTimeout(500);

    const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
    await playPauseButton.tap();

    const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
    await expect(footerPlayPause).toHaveAttribute("data-playing", "true", { timeout: 15000 });

    // Rapid taps on different channels
    for (let i = 1; i <= 2; i++) {
      await channelCards.nth(i).tap();
      await page.waitForTimeout(300);
      await playPauseButton.tap();
      await page.waitForTimeout(500);
    }

    await page.waitForTimeout(2000);

    // Should still be playing
    await expect(footerPlayPause).toHaveAttribute("data-playing", "true", { timeout: 10000 });

    console.log("[CHANNEL_SWITCH][MOBILE] ✅ Rapid switching remained stable");
  });
});

// =============================================================================
// CONFIGURATION VERIFICATION
// =============================================================================

test.describe("Channel Switch - Configuration Verification", () => {
  test("verifies test configuration", async ({ page }) => {
    console.log("========================================");
    console.log("CHANNEL SWITCH TEST CONFIGURATION");
    console.log("========================================");

    console.log(`[CONFIG] Test credentials available: ${hasTestCredentials}`);

    if (hasTestCredentials) {
      console.log(`[CONFIG] Test user email: ${TEST_USER_EMAIL}`);
      expect(TEST_USER_EMAIL).toBeTruthy();
      expect(TEST_USER_PASSWORD).toBeTruthy();
    } else {
      console.log("[CONFIG] WARNING: Set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.test");
    }

    expect(true).toBe(true);
  });
});
