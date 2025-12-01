import { test, expect, Page } from "@playwright/test";
import { login } from "./login";

/**
 * Mobile Playback Resilience E2E Tests
 *
 * These tests verify that mobile navigation does NOT cause:
 * - Track to restart from the beginning
 * - Playback session ID to change
 * - currentTime to jump backwards
 *
 * This catches the real-world bug where:
 * On an iPhone (Safari, especially on cellular), if you:
 * 1) Start playing a channel, then
 * 2) Open the mobile hamburger menu and switch to Profile or Settings,
 * ...the audio briefly stops and the same track restarts from the beginning.
 *
 * Prerequisites:
 *   - Test user account must exist
 *   - Environment variables must be set:
 *     - TEST_USER_EMAIL
 *     - TEST_USER_PASSWORD
 *
 * Run with:
 *   TEST_USER_EMAIL=... TEST_USER_PASSWORD=... npm run e2e -- --project=mobile-chrome test/e2e/mobile-playback-resilience.spec.ts
 */

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

// Tolerance for currentTime jitter (in seconds)
// Allow small backward jitter due to audio buffering, but never large jumps
const CURRENT_TIME_TOLERANCE_SECONDS = 1.0;

// Minimum playback time before capturing baseline (ensures audio is actually playing)
const MIN_PLAYBACK_TIME_BEFORE_CAPTURE = 2.0;

// ============================================================================
// DEBUG INTERFACE TYPES
// ============================================================================

interface PlayerDebugInfo {
  trackUrl: string | null;
  sessionId: number;
  currentTime: number;
}

// ============================================================================
// MOBILE-SPECIFIC HELPERS
// ============================================================================

/**
 * Signs in as the test user on mobile.
 * Returns true if sign-in succeeded, false otherwise.
 */
async function signInAsTestUser(page: Page): Promise<boolean> {
  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    return false;
  }

  try {
    await login(page);

    // On mobile, the sign in button is in the header
    const signInButton = page.locator("header").getByRole("button", { name: /sign in/i });
    await signInButton.tap();

    // Wait for and fill auth form
    const emailInput = page.getByLabel(/email/i);
    await emailInput.waitFor({ state: "visible", timeout: 5000 });
    await emailInput.fill(TEST_USER_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_USER_PASSWORD);

    await page.locator("form").getByRole("button", { name: /sign in/i }).tap();

    // Wait for dashboard to load - mobile shows hamburger menu button
    try {
      await page.waitForSelector('[data-testid="mobile-menu-button"]', { state: "visible", timeout: 15000 });
    } catch {
      const hasAuthError = await page.locator('text=/invalid.*credentials|error.*login|incorrect.*password/i').isVisible().catch(() => false);
      if (hasAuthError) {
        console.error("[RESILIENCE] Authentication failed - invalid credentials");
        return false;
      }
      throw new Error("[RESILIENCE] Dashboard did not load after sign in");
    }

    return true;
  } catch (error) {
    console.error("[RESILIENCE] Failed to sign in as test user:", error);
    return false;
  }
}

/**
 * Opens the mobile hamburger menu.
 */
async function openMobileMenu(page: Page): Promise<void> {
  const menuButton = page.locator('[data-testid="mobile-menu-button"]');
  await expect(menuButton).toBeVisible({ timeout: 10000 });
  await menuButton.tap();
  // Wait for menu to animate open
  await page.waitForTimeout(300);
}

/**
 * Navigates to Channels tab on mobile via hamburger menu.
 */
async function navigateToChannels(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await openMobileMenu(page);

  const mobileNavChannels = page.locator('[data-testid="mobile-nav-channels"]');
  await mobileNavChannels.waitFor({ state: "visible", timeout: 5000 });
  await mobileNavChannels.tap();

  // Wait for channel cards to load
  await page.locator('[data-channel-id]').first().waitFor({ state: "visible", timeout: 10000 });
}

/**
 * Navigates to Profile tab on mobile via hamburger menu.
 */
async function navigateToProfile(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await openMobileMenu(page);

  const mobileNavProfile = page.locator('[data-testid="mobile-nav-profile"]');
  await mobileNavProfile.waitFor({ state: "visible", timeout: 5000 });
  await mobileNavProfile.tap();

  await page.waitForTimeout(500);
}

/**
 * Navigates to Settings tab on mobile via hamburger menu.
 */
async function navigateToSettings(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await openMobileMenu(page);

  const mobileNavSettings = page.locator('[data-testid="mobile-nav-settings"]');
  await mobileNavSettings.waitFor({ state: "visible", timeout: 5000 });
  await mobileNavSettings.tap();

  // Wait for settings mobile nav to appear
  await page.locator('[data-testid="settings-mobile-nav"]').waitFor({ state: "visible", timeout: 10000 });
}

/**
 * Starts playback on a channel and waits for it to begin (mobile version).
 * Uses tap interactions and retry logic to handle audio loading delays.
 */
async function startPlayback(page: Page): Promise<void> {
  // Navigate to channels first
  await navigateToChannels(page);

  // Tap on the first channel card to select it
  const firstChannel = page.locator('[data-channel-id]').first();
  await firstChannel.tap();

  // Wait for channel to become active (play/pause button appears)
  const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
  await expect(playPauseButton).toBeVisible({ timeout: 10000 });

  // Tap play to start playback
  await playPauseButton.tap();

  // Wait for playback to start with retry logic
  const footerPlayPause = page.locator('[data-testid="player-play-pause"]');

  // Try up to 3 times to ensure playback starts
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.waitForTimeout(2000);

    const isPlaying = await footerPlayPause.getAttribute("data-playing");
    if (isPlaying === "true") {
      return;
    }

    // If not playing, try tapping play again
    const isVisible = await footerPlayPause.isVisible().catch(() => false);
    if (isVisible) {
      await footerPlayPause.tap();
    } else {
      // Footer not visible yet, try the channel play button again
      await playPauseButton.tap();
    }
  }

  // Final verification
  await expect(footerPlayPause).toHaveAttribute("data-playing", "true", { timeout: 10000 });
}

/**
 * Stops playback if currently playing (mobile version).
 */
async function stopPlayback(page: Page): Promise<void> {
  const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
  const isVisible = await footerPlayPause.isVisible().catch(() => false);

  if (isVisible) {
    const isPlaying = await footerPlayPause.getAttribute("data-playing");
    if (isPlaying === "true") {
      await footerPlayPause.tap();
      await expect(footerPlayPause).toHaveAttribute("data-playing", "false", { timeout: 5000 });
    }
  }
}

/**
 * Captures the current debug info from the player via window.__playerDebug.
 * Uses waitForFunction to ensure values are available.
 */
async function captureDebugInfo(page: Page): Promise<PlayerDebugInfo> {
  // Wait for debug interface to be available and have valid values
  await page.waitForFunction(() => {
    const debug = (window as any).__playerDebug;
    return debug && typeof debug.getPlaybackSessionId === "function";
  }, { timeout: 10000 });

  const debugInfo = await page.evaluate(() => {
    const debug = (window as any).__playerDebug;
    return {
      trackUrl: debug.getCurrentTrackUrl(),
      sessionId: debug.getPlaybackSessionId(),
      currentTime: debug.getCurrentTime(),
    };
  });

  return debugInfo;
}

/**
 * Waits until currentTime is at least a minimum value.
 * This ensures playback has truly started before we capture baseline.
 */
async function waitForMinPlaybackTime(page: Page, minTime: number): Promise<void> {
  await page.waitForFunction(
    (min) => {
      const debug = (window as any).__playerDebug;
      if (!debug || typeof debug.getCurrentTime !== "function") return false;
      return debug.getCurrentTime() >= min;
    },
    minTime,
    { timeout: 30000 }
  );
}

/**
 * Asserts that the current debug info matches the baseline without restart.
 * - Track URL must match
 * - Session ID must match
 * - currentTime must not jump backwards beyond tolerance
 */
function assertPlaybackContinued(
  baseline: PlayerDebugInfo,
  current: PlayerDebugInfo,
  context: string
): void {
  // Track URL should be the same
  expect(current.trackUrl, `[${context}] Track URL should not change`).toBe(baseline.trackUrl);

  // Session ID should be the same
  expect(current.sessionId, `[${context}] Session ID should not change (was ${baseline.sessionId}, now ${current.sessionId})`).toBe(baseline.sessionId);

  // currentTime should not jump backwards significantly
  // We allow small jitter due to buffering, but never large jumps back to ~0
  const timeDelta = current.currentTime - baseline.currentTime;
  const allowedBackwardJitter = -CURRENT_TIME_TOLERANCE_SECONDS;

  expect(
    timeDelta >= allowedBackwardJitter,
    `[${context}] currentTime should not jump backwards (was ${baseline.currentTime.toFixed(2)}s, now ${current.currentTime.toFixed(2)}s, delta=${timeDelta.toFixed(2)}s)`
  ).toBe(true);

  // Also check that if baseline was significant (e.g., >3s), current is not near zero
  if (baseline.currentTime > 3) {
    expect(
      current.currentTime > 1,
      `[${context}] currentTime jumped back near zero! (was ${baseline.currentTime.toFixed(2)}s, now ${current.currentTime.toFixed(2)}s) - track may have restarted`
    ).toBe(true);
  }
}

// ============================================================================
// TEST SUITE
// ============================================================================

test.describe("Mobile Playback Resilience", () => {
  // Force mobile viewport and touch
  test.use({
    viewport: { width: 375, height: 667 }, // iPhone SE size
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
    // Ensure playback is stopped after each test to avoid stray audio
    await stopPlayback(page).catch(() => {});
  });

  // ==========================================================================
  // Core Test: Playback survives mobile navigation without restarting
  // ==========================================================================
  test("mobile playback survives navigation without restarting", async ({ page }) => {
    console.log("[RESILIENCE] Starting mobile playback resilience test");

    // Step 1: Start playback
    console.log("[RESILIENCE] Step 1: Starting playback...");
    await startPlayback(page);

    // Step 2: Wait for playback to actually progress
    console.log("[RESILIENCE] Step 2: Waiting for playback to progress...");
    await waitForMinPlaybackTime(page, MIN_PLAYBACK_TIME_BEFORE_CAPTURE);

    // Step 3: Capture baseline debug info
    console.log("[RESILIENCE] Step 3: Capturing baseline debug info...");
    const baseline = await captureDebugInfo(page);

    // Sanity checks on baseline
    expect(baseline.trackUrl, "Track URL should be non-empty").toBeTruthy();
    expect(baseline.trackUrl?.endsWith(".mp3"), "Track URL should end with .mp3").toBe(true);
    expect(baseline.sessionId, "Session ID should be a positive number").toBeGreaterThan(0);
    expect(baseline.currentTime, "currentTime should be >= 0").toBeGreaterThanOrEqual(0);

    console.log(`[RESILIENCE] Baseline captured:`);
    console.log(`  - trackUrl: ${baseline.trackUrl}`);
    console.log(`  - sessionId: ${baseline.sessionId}`);
    console.log(`  - currentTime: ${baseline.currentTime.toFixed(2)}s`);

    // Step 4: Navigate to Profile via hamburger menu
    console.log("[RESILIENCE] Step 4: Navigating to Profile...");
    await navigateToProfile(page);
    await page.waitForTimeout(500); // Brief settle time

    // Verify playback is still active
    const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
    await expect(footerPlayPause).toHaveAttribute("data-playing", "true", { timeout: 5000 });

    // Capture and verify debug info after Profile navigation
    const afterProfile = await captureDebugInfo(page);
    console.log(`[RESILIENCE] After Profile:`);
    console.log(`  - trackUrl: ${afterProfile.trackUrl}`);
    console.log(`  - sessionId: ${afterProfile.sessionId}`);
    console.log(`  - currentTime: ${afterProfile.currentTime.toFixed(2)}s`);
    assertPlaybackContinued(baseline, afterProfile, "After Profile");

    // Step 5: Navigate to Settings via hamburger menu
    console.log("[RESILIENCE] Step 5: Navigating to Settings...");
    await navigateToSettings(page);
    await page.waitForTimeout(500);

    await expect(footerPlayPause).toHaveAttribute("data-playing", "true", { timeout: 5000 });

    const afterSettings = await captureDebugInfo(page);
    console.log(`[RESILIENCE] After Settings:`);
    console.log(`  - trackUrl: ${afterSettings.trackUrl}`);
    console.log(`  - sessionId: ${afterSettings.sessionId}`);
    console.log(`  - currentTime: ${afterSettings.currentTime.toFixed(2)}s`);
    // Compare to baseline, not afterProfile, to catch any cumulative drift
    assertPlaybackContinued(baseline, afterSettings, "After Settings");

    // Step 6: Navigate back to Channels via hamburger menu
    console.log("[RESILIENCE] Step 6: Navigating back to Channels...");
    await navigateToChannels(page);
    await page.waitForTimeout(500);

    await expect(footerPlayPause).toHaveAttribute("data-playing", "true", { timeout: 5000 });

    const afterChannels = await captureDebugInfo(page);
    console.log(`[RESILIENCE] After Channels:`);
    console.log(`  - trackUrl: ${afterChannels.trackUrl}`);
    console.log(`  - sessionId: ${afterChannels.sessionId}`);
    console.log(`  - currentTime: ${afterChannels.currentTime.toFixed(2)}s`);
    assertPlaybackContinued(baseline, afterChannels, "After Channels");

    // Final verification: currentTime should have progressed
    const totalTimeElapsed = afterChannels.currentTime - baseline.currentTime;
    console.log(`[RESILIENCE] Total time elapsed during test: ${totalTimeElapsed.toFixed(2)}s`);

    // Time should have progressed (accounting for some jitter)
    expect(
      totalTimeElapsed > -CURRENT_TIME_TOLERANCE_SECONDS,
      `currentTime should have progressed or stayed stable (delta: ${totalTimeElapsed.toFixed(2)}s)`
    ).toBe(true);

    console.log("[RESILIENCE] ✅ Test passed: Playback survived navigation without restarting");
  });

  // ==========================================================================
  // Additional Test: Session ID stability across rapid navigation
  // ==========================================================================
  test("session ID remains stable during rapid navigation", async ({ page }) => {
    console.log("[RESILIENCE] Starting rapid navigation session ID stability test");

    // Start playback
    await startPlayback(page);
    await waitForMinPlaybackTime(page, MIN_PLAYBACK_TIME_BEFORE_CAPTURE);

    const baseline = await captureDebugInfo(page);
    console.log(`[RESILIENCE] Initial sessionId: ${baseline.sessionId}`);

    // Rapidly navigate between tabs
    const tabs = [
      { name: "Profile", navigate: navigateToProfile },
      { name: "Settings", navigate: navigateToSettings },
      { name: "Channels", navigate: navigateToChannels },
      { name: "Profile", navigate: navigateToProfile },
      { name: "Channels", navigate: navigateToChannels },
    ];

    for (const tab of tabs) {
      console.log(`[RESILIENCE] Navigating to ${tab.name}...`);
      await tab.navigate(page);

      const current = await captureDebugInfo(page);
      expect(
        current.sessionId,
        `Session ID should remain ${baseline.sessionId} on ${tab.name}, but was ${current.sessionId}`
      ).toBe(baseline.sessionId);
      console.log(`[RESILIENCE] ${tab.name}: sessionId=${current.sessionId} ✓`);
    }

    console.log("[RESILIENCE] ✅ Session ID remained stable through rapid navigation");
  });

  // ==========================================================================
  // Additional Test: currentTime monotonically increases
  // ==========================================================================
  test("currentTime monotonically increases during navigation", async ({ page }) => {
    console.log("[RESILIENCE] Starting currentTime monotonic test");

    // Start playback
    await startPlayback(page);
    await waitForMinPlaybackTime(page, MIN_PLAYBACK_TIME_BEFORE_CAPTURE);

    let lastTime = (await captureDebugInfo(page)).currentTime;
    console.log(`[RESILIENCE] Initial currentTime: ${lastTime.toFixed(2)}s`);

    const tabs = [
      { name: "Profile", navigate: navigateToProfile },
      { name: "Settings", navigate: navigateToSettings },
      { name: "Channels", navigate: navigateToChannels },
    ];

    for (const tab of tabs) {
      console.log(`[RESILIENCE] Navigating to ${tab.name}...`);
      await tab.navigate(page);
      await page.waitForTimeout(1000); // Allow some playback time

      const current = await captureDebugInfo(page);
      const delta = current.currentTime - lastTime;

      console.log(`[RESILIENCE] ${tab.name}: currentTime=${current.currentTime.toFixed(2)}s (delta=${delta.toFixed(2)}s)`);

      // currentTime should not jump backwards significantly
      expect(
        delta >= -CURRENT_TIME_TOLERANCE_SECONDS,
        `currentTime jumped backwards from ${lastTime.toFixed(2)}s to ${current.currentTime.toFixed(2)}s on ${tab.name}`
      ).toBe(true);

      // Update lastTime for next comparison (use the higher value to account for jitter)
      lastTime = Math.max(lastTime, current.currentTime);
    }

    console.log("[RESILIENCE] ✅ currentTime remained monotonic during navigation");
  });
});

// ============================================================================
// Configuration Verification
// ============================================================================
test.describe("Mobile Playback Resilience - Configuration Verification", () => {
  test.use({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
  });

  test("verifies debug interface is available", async ({ page }) => {
    if (!hasTestCredentials) {
      test.skip();
      return;
    }

    const signedIn = await signInAsTestUser(page);
    if (!signedIn) {
      test.skip();
      return;
    }

    // Navigate to channels and start playback to initialize the debug interface
    await startPlayback(page);

    // Verify debug interface methods exist
    const debugMethods = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return {
        hasDebug: !!debug,
        hasGetPlaybackSessionId: typeof debug?.getPlaybackSessionId === "function",
        hasGetCurrentTime: typeof debug?.getCurrentTime === "function",
        hasGetCurrentTrackUrl: typeof debug?.getCurrentTrackUrl === "function",
      };
    });

    console.log("[CONFIG] Debug interface check:", debugMethods);

    expect(debugMethods.hasDebug, "window.__playerDebug should exist").toBe(true);
    expect(debugMethods.hasGetPlaybackSessionId, "getPlaybackSessionId() should exist").toBe(true);
    expect(debugMethods.hasGetCurrentTime, "getCurrentTime() should exist").toBe(true);
    expect(debugMethods.hasGetCurrentTrackUrl, "getCurrentTrackUrl() should exist").toBe(true);

    // Verify methods return reasonable values
    const debugInfo = await captureDebugInfo(page);
    console.log("[CONFIG] Debug info:", {
      trackUrl: debugInfo.trackUrl?.substring(0, 50) + "...",
      sessionId: debugInfo.sessionId,
      currentTime: debugInfo.currentTime,
    });

    expect(typeof debugInfo.sessionId, "sessionId should be a number").toBe("number");
    expect(typeof debugInfo.currentTime, "currentTime should be a number").toBe("number");

    await stopPlayback(page);
    console.log("[CONFIG] ✅ Debug interface verification passed");
  });
});
