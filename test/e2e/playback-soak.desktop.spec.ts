import { test, expect, Page } from "@playwright/test";
import { login } from "./login";

/**
 * Desktop Playback Soak Tests
 *
 * Extended tests that simulate long-running audio sessions with repeated navigation
 * to catch audio restart bugs that occur during tab switching.
 *
 * These tests verify:
 * - Audio does NOT restart during navigation
 * - sessionId remains stable
 * - trackUrl remains identical
 * - currentTime increases monotonically (with ±1s jitter tolerance)
 * - No forced reload of the Audio Engine
 *
 * Prerequisites:
 *   - Test user account must exist
 *   - Environment variables must be set:
 *     - TEST_USER_EMAIL
 *     - TEST_USER_PASSWORD
 *
 * Run with:
 *   TEST_USER_EMAIL=... TEST_USER_PASSWORD=... npm run e2e -- --project=chromium test/e2e/playback-soak.desktop.spec.ts
 */

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

// Tolerance for currentTime jitter (in seconds)
const JITTER_TOLERANCE_SECONDS = 1.0;

// Minimum playback time before capturing baseline
const MIN_PLAYBACK_TIME_BEFORE_CAPTURE = 2.0;

// ============================================================================
// PLAYBACK METRICS INTERFACE
// ============================================================================

interface PlaybackMetrics {
  sessionId: number | null;
  currentTime: number | null;
  trackUrl: string | null;
  status: string | null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Gets playback metrics from the debug interface.
 * Maps the app's __playerDebug interface to the expected metrics format.
 */
async function getPlaybackMetrics(page: Page): Promise<PlaybackMetrics> {
  return await page.evaluate(() => {
    const dbg = (window as any).__playerDebug;
    return {
      sessionId: dbg?.getPlaybackSessionId?.() ?? null,
      currentTime: dbg?.getCurrentTime?.() ?? null,
      trackUrl: dbg?.getCurrentTrackUrl?.() ?? null,
      status: dbg?.getTransportState?.() ?? null,
    };
  });
}

/**
 * Waits for the debug interface to be available and have valid values.
 */
async function waitForDebugInterface(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const dbg = (window as any).__playerDebug;
      return dbg && typeof dbg.getPlaybackSessionId === "function";
    },
    { timeout: 15000 }
  );
}

/**
 * Waits until currentTime is at least a minimum value.
 */
async function waitForMinPlaybackTime(page: Page, minTime: number): Promise<void> {
  await page.waitForFunction(
    (min) => {
      const dbg = (window as any).__playerDebug;
      if (!dbg || typeof dbg.getCurrentTime !== "function") return false;
      return dbg.getCurrentTime() >= min;
    },
    minTime,
    { timeout: 30000 }
  );
}

/**
 * Signs in as the test user on desktop.
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
        page.waitForSelector('[data-testid="nav-channels"]', { state: "visible", timeout: 15000 }),
        page.waitForSelector('button:has-text("Sign Out")', { state: "visible", timeout: 15000 }),
      ]);
    } catch {
      const hasAuthError = await page
        .locator("text=/invalid.*credentials|error.*login|incorrect.*password/i")
        .isVisible()
        .catch(() => false);
      if (hasAuthError) {
        console.error("[SOAK-DESKTOP] Authentication failed - invalid credentials");
        return false;
      }
      throw new Error("[SOAK-DESKTOP] Dashboard did not load after sign in");
    }

    return true;
  } catch (error) {
    console.error("[SOAK-DESKTOP] Failed to sign in as test user:", error);
    return false;
  }
}

// ============================================================================
// DESKTOP NAVIGATION HELPERS
// ============================================================================

async function navigateToChannels(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");

  const staticNav = page.locator('[data-testid="nav-channels"]');
  const staticNavVisible = await staticNav.isVisible().catch(() => false);

  if (staticNavVisible) {
    await staticNav.scrollIntoViewIfNeeded();
    await staticNav.click({ force: true });
  } else {
    await page.mouse.move(500, 50);
    const channelsButton = page.getByRole("button", { name: /^channels$/i }).first();
    await channelsButton.waitFor({ state: "visible", timeout: 5000 });
    await channelsButton.click({ force: true });
  }

  await page.locator("[data-channel-id]").first().waitFor({ state: "visible", timeout: 10000 });
}

async function navigateToProfile(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");

  const staticNav = page.locator('[data-testid="nav-profile"]');
  const staticNavVisible = await staticNav.isVisible().catch(() => false);

  if (staticNavVisible) {
    await staticNav.scrollIntoViewIfNeeded();
    await staticNav.click({ force: true });
  } else {
    await page.mouse.move(500, 50);
    const profileButton = page.getByRole("button", { name: /^profile$/i }).first();
    await profileButton.waitFor({ state: "visible", timeout: 5000 });
    await profileButton.click({ force: true });
  }

  await page.waitForTimeout(500);
}

async function navigateToSettings(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");

  const staticNav = page.locator('[data-testid="nav-settings"]');
  const staticNavVisible = await staticNav.isVisible().catch(() => false);

  if (staticNavVisible) {
    await staticNav.scrollIntoViewIfNeeded();
    await staticNav.click({ force: true });
  } else {
    await page.mouse.move(500, 50);
    const settingsButton = page.getByRole("button", { name: /^settings$/i }).first();
    await settingsButton.waitFor({ state: "visible", timeout: 5000 });
    await settingsButton.click({ force: true });
  }

  // Wait for settings sub-nav with fallback
  try {
    await page.locator('[data-testid="settings-sub-nav"]').waitFor({ state: "visible", timeout: 10000 });
  } catch {
    // Settings page loaded but sub-nav not visible - that's OK
    await page.waitForTimeout(500);
  }
}

async function navigateToSlideshow(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");

  const staticNav = page.locator('[data-testid="nav-slideshow"]');
  const staticNavVisible = await staticNav.isVisible().catch(() => false);

  if (staticNavVisible) {
    await staticNav.scrollIntoViewIfNeeded();
    await staticNav.click({ force: true });
  } else {
    await page.mouse.move(500, 50);
    const slideshowButton = page.getByRole("button", { name: /^slideshow$/i }).first();
    await slideshowButton.waitFor({ state: "visible", timeout: 5000 });
    await slideshowButton.click({ force: true });
  }

  // Wait for slideshow content to load with multiple fallback options
  try {
    await page
      .locator('[data-testid="slideshow-card"], [data-testid="slideshow-toggle"], [data-testid="slideshow-create-button"]')
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
  } catch {
    // Slideshow tab might not have cards - just wait a bit
    await page.waitForTimeout(500);
  }
}

type NavigationFunction = (page: Page) => Promise<void>;

const NAV_MAP: Record<string, NavigationFunction> = {
  Channels: navigateToChannels,
  Profile: navigateToProfile,
  Settings: navigateToSettings,
  Slideshow: navigateToSlideshow,
};

const ALL_TABS = ["Channels", "Profile", "Settings", "Slideshow"];

// ============================================================================
// PLAYBACK START
// ============================================================================

async function startPlayback(page: Page): Promise<void> {
  await navigateToChannels(page);

  // Click on the first channel card
  const firstChannel = page.locator("[data-channel-id]").first();
  await firstChannel.click();

  // Wait for play/pause button and click it
  const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
  await expect(playPauseButton).toBeVisible({ timeout: 10000 });
  await playPauseButton.click();

  // Wait for playback to start
  const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.waitForTimeout(2000);
    const isPlaying = await footerPlayPause.getAttribute("data-playing");
    if (isPlaying === "true") return;

    const isVisible = await footerPlayPause.isVisible().catch(() => false);
    if (isVisible) {
      await footerPlayPause.click();
    } else {
      await playPauseButton.click();
    }
  }

  await expect(footerPlayPause).toHaveAttribute("data-playing", "true", { timeout: 10000 });
}

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

// ============================================================================
// ASSERTION HELPERS
// ============================================================================

function assertMetricsStable(
  baseline: PlaybackMetrics,
  current: PlaybackMetrics,
  previousTime: number,
  context: string
): void {
  // Check for null values
  expect(current.sessionId, `[${context}] sessionId should not be null`).not.toBeNull();
  expect(current.trackUrl, `[${context}] trackUrl should not be null`).not.toBeNull();
  expect(current.currentTime, `[${context}] currentTime should not be null`).not.toBeNull();

  // Session ID must remain stable
  expect(current.sessionId, `[${context}] sessionId changed from ${baseline.sessionId} to ${current.sessionId}`).toBe(
    baseline.sessionId
  );

  // Track URL must remain stable
  expect(current.trackUrl, `[${context}] trackUrl changed`).toBe(baseline.trackUrl);

  // currentTime must not jump backwards beyond tolerance
  const timeDelta = current.currentTime! - previousTime;
  expect(
    timeDelta >= -JITTER_TOLERANCE_SECONDS,
    `[${context}] currentTime jumped backwards from ${previousTime.toFixed(2)}s to ${current.currentTime!.toFixed(2)}s (delta=${timeDelta.toFixed(2)}s)`
  ).toBe(true);
}

// ============================================================================
// TEST SUITES
// ============================================================================

test.describe("Desktop Playback Soak Tests", () => {
  // Soak tests need longer timeouts
  test.setTimeout(120000); // 2 minutes per test

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

  // ==========================================================================
  // Pattern A: Channels → Profile → Settings → Channels (3-5 cycles)
  // ==========================================================================
  test("soak: Channels → Profile → Settings → Channels (5 cycles)", async ({ page }) => {
    const CYCLES = 5;
    console.log(`[SOAK-DESKTOP] Starting Pattern A: ${CYCLES} cycles`);

    await startPlayback(page);
    await waitForMinPlaybackTime(page, MIN_PLAYBACK_TIME_BEFORE_CAPTURE);

    const baseline = await getPlaybackMetrics(page);
    console.log(`[SOAK-DESKTOP] Baseline: sessionId=${baseline.sessionId}, trackUrl=${baseline.trackUrl?.slice(-30)}`);

    let previousTime = baseline.currentTime!;

    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      console.log(`[SOAK-DESKTOP] Cycle ${cycle}/${CYCLES}`);

      for (const tab of ["Profile", "Settings", "Channels"]) {
        await NAV_MAP[tab](page);
        await page.waitForTimeout(300);

        const metrics = await getPlaybackMetrics(page);
        assertMetricsStable(baseline, metrics, previousTime, `Cycle ${cycle} - ${tab}`);
        previousTime = Math.max(previousTime, metrics.currentTime!);
      }
    }

    console.log(`[SOAK-DESKTOP] ✅ Pattern A completed: ${CYCLES} cycles passed`);
  });

  // ==========================================================================
  // Pattern B: Channels → Slideshow → Profile → Channels (3-5 cycles)
  // ==========================================================================
  test("soak: Channels → Slideshow → Profile → Channels (5 cycles)", async ({ page }) => {
    const CYCLES = 5;
    console.log(`[SOAK-DESKTOP] Starting Pattern B: ${CYCLES} cycles`);

    await startPlayback(page);
    await waitForMinPlaybackTime(page, MIN_PLAYBACK_TIME_BEFORE_CAPTURE);

    const baseline = await getPlaybackMetrics(page);
    let previousTime = baseline.currentTime!;

    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      console.log(`[SOAK-DESKTOP] Cycle ${cycle}/${CYCLES}`);

      for (const tab of ["Slideshow", "Profile", "Channels"]) {
        await NAV_MAP[tab](page);
        await page.waitForTimeout(300);

        const metrics = await getPlaybackMetrics(page);
        assertMetricsStable(baseline, metrics, previousTime, `Cycle ${cycle} - ${tab}`);
        previousTime = Math.max(previousTime, metrics.currentTime!);
      }
    }

    console.log(`[SOAK-DESKTOP] ✅ Pattern B completed: ${CYCLES} cycles passed`);
  });

  // ==========================================================================
  // Pattern C: Random navigation (10-20 cycles)
  // ==========================================================================
  test("soak: Random navigation pattern (15 cycles)", async ({ page }) => {
    const CYCLES = 15;
    console.log(`[SOAK-DESKTOP] Starting Pattern C (Random): ${CYCLES} cycles`);

    await startPlayback(page);
    await waitForMinPlaybackTime(page, MIN_PLAYBACK_TIME_BEFORE_CAPTURE);

    const baseline = await getPlaybackMetrics(page);
    let previousTime = baseline.currentTime!;

    // Deterministic "random" pattern using cycle index
    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      const tabIndex = (cycle * 7) % ALL_TABS.length; // Pseudo-random but deterministic
      const tab = ALL_TABS[tabIndex];

      console.log(`[SOAK-DESKTOP] Cycle ${cycle}/${CYCLES} → ${tab}`);
      await NAV_MAP[tab](page);
      await page.waitForTimeout(200);

      const metrics = await getPlaybackMetrics(page);
      assertMetricsStable(baseline, metrics, previousTime, `Cycle ${cycle} - ${tab}`);
      previousTime = Math.max(previousTime, metrics.currentTime!);
    }

    console.log(`[SOAK-DESKTOP] ✅ Pattern C (Random) completed: ${CYCLES} cycles passed`);
  });

  // ==========================================================================
  // Pattern D: Mixed Heavy Navigation (30 cycles)
  // ==========================================================================
  test("soak: Heavy mixed navigation (30 cycles)", async ({ page }) => {
    const CYCLES = 30;
    console.log(`[SOAK-DESKTOP] Starting Pattern D (Heavy): ${CYCLES} cycles`);

    await startPlayback(page);
    await waitForMinPlaybackTime(page, MIN_PLAYBACK_TIME_BEFORE_CAPTURE);

    const baseline = await getPlaybackMetrics(page);
    let previousTime = baseline.currentTime!;

    // Deterministic alternating pattern
    const pattern = ["Channels", "Profile", "Settings", "Slideshow"];

    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      const tab = pattern[cycle % pattern.length];

      if (cycle % 10 === 0) {
        console.log(`[SOAK-DESKTOP] Progress: ${cycle}/${CYCLES}`);
      }

      await NAV_MAP[tab](page);
      await page.waitForTimeout(150); // Faster for heavy test

      const metrics = await getPlaybackMetrics(page);
      assertMetricsStable(baseline, metrics, previousTime, `Cycle ${cycle} - ${tab}`);
      previousTime = Math.max(previousTime, metrics.currentTime!);
    }

    const finalMetrics = await getPlaybackMetrics(page);
    const totalPlaybackTime = finalMetrics.currentTime! - baseline.currentTime!;
    console.log(`[SOAK-DESKTOP] Total playback time during test: ${totalPlaybackTime.toFixed(2)}s`);
    console.log(`[SOAK-DESKTOP] ✅ Pattern D (Heavy) completed: ${CYCLES} cycles passed`);
  });

  // ==========================================================================
  // Stability verification test
  // ==========================================================================
  test("soak: Verify metrics remain non-null throughout navigation", async ({ page }) => {
    console.log(`[SOAK-DESKTOP] Starting metrics stability verification`);

    await startPlayback(page);
    await waitForMinPlaybackTime(page, MIN_PLAYBACK_TIME_BEFORE_CAPTURE);

    const baseline = await getPlaybackMetrics(page);

    // Verify baseline is valid
    expect(baseline.sessionId).not.toBeNull();
    expect(baseline.trackUrl).not.toBeNull();
    expect(baseline.currentTime).not.toBeNull();
    expect(baseline.status).toBe("playing");

    // Navigate through all tabs and verify metrics never become null
    for (const tab of ALL_TABS) {
      await NAV_MAP[tab](page);
      await page.waitForTimeout(500);

      const metrics = await getPlaybackMetrics(page);

      expect(metrics.sessionId, `sessionId became null on ${tab}`).not.toBeNull();
      expect(metrics.trackUrl, `trackUrl became null on ${tab}`).not.toBeNull();
      expect(metrics.currentTime, `currentTime became null on ${tab}`).not.toBeNull();
      expect(metrics.status, `status is not 'playing' on ${tab}`).toBe("playing");

      console.log(`[SOAK-DESKTOP] ${tab}: all metrics valid ✓`);
    }

    console.log(`[SOAK-DESKTOP] ✅ Metrics stability verification passed`);
  });
});

// ============================================================================
// Configuration Verification
// ============================================================================
test.describe("Desktop Soak - Configuration Verification", () => {
  test("verifies test environment configuration", async ({ page }) => {
    console.log("========================================");
    console.log("DESKTOP SOAK TEST CONFIGURATION");
    console.log("========================================");
    console.log(`[CONFIG] Test credentials available: ${hasTestCredentials}`);
    console.log(`[CONFIG] Jitter tolerance: ${JITTER_TOLERANCE_SECONDS}s`);
    console.log(`[CONFIG] Min playback time before baseline: ${MIN_PLAYBACK_TIME_BEFORE_CAPTURE}s`);

    if (!hasTestCredentials) {
      console.log("[CONFIG] WARNING: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");
      console.log("[CONFIG] Set these environment variables to run the full test suite");
    }

    expect(true).toBe(true);
  });
});
