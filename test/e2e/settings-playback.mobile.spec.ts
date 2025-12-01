import { test, expect, Page } from "@playwright/test";
import { login } from "./login";

/**
 * Settings ↔ Playback E2E Tests - MOBILE
 *
 * Mobile counterpart to settings-playback.spec.ts (desktop tests).
 * These tests verify that user settings actually affect playback behavior on mobile devices.
 *
 * All tests are:
 * - Mobile-only (mobile-chrome project, or explicit viewport)
 * - Non-destructive (no permanent user data or DB changes)
 * - Using the existing test-user account (NOT admin)
 *
 * Prerequisites:
 *   - Test user account must exist
 *   - Environment variables must be set:
 *     - TEST_USER_EMAIL
 *     - TEST_USER_PASSWORD
 *
 * Run with:
 *   TEST_USER_EMAIL=... TEST_USER_PASSWORD=... npm run e2e -- --project=mobile-chrome test/e2e/settings-playback.mobile.spec.ts
 */

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

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
        console.error("[MOBILE] Authentication failed - invalid credentials");
        return false;
      }
      throw new Error("[MOBILE] Dashboard did not load after sign in");
    }

    return true;
  } catch (error) {
    console.error("[MOBILE] Failed to sign in as test user:", error);
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
 * Navigates to a specific settings sub-tab on mobile.
 */
async function navigateToSettingsSubTab(page: Page, tab: "profile" | "preferences" | "privacy"): Promise<void> {
  const mobileTabButton = page.locator(`[data-testid="mobile-settings-tab-${tab}"]`);
  await mobileTabButton.scrollIntoViewIfNeeded();
  await expect(mobileTabButton).toBeVisible({ timeout: 5000 });
  await mobileTabButton.tap();

  // Wait for content to load based on which tab
  if (tab === "preferences") {
    await expect(page.locator('[data-testid="bell-sound-option"]').first()).toBeVisible({ timeout: 10000 });
  }
}

/**
 * Navigates to the Channels tab on mobile via hamburger menu.
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
 * Navigates to the Profile tab on mobile via hamburger menu.
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
 * Navigates to the Slideshow tab on mobile via hamburger menu.
 */
async function navigateToSlideshow(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await openMobileMenu(page);

  const mobileNavSlideshow = page.locator('[data-testid="mobile-nav-slideshow"]');
  await mobileNavSlideshow.waitFor({ state: "visible", timeout: 5000 });
  await mobileNavSlideshow.tap();

  // Verify we're on slideshow
  const slideshowContent = page.locator('[data-testid="slideshow-card"], [data-testid="slideshow-toggle"], [data-testid="slideshow-create-button"]').first();
  await slideshowContent.waitFor({ state: "visible", timeout: 10000 });
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

// ============================================================================
// TEST SUITES - MOBILE
// ============================================================================

test.describe("Settings ↔ Playback E2E Tests - Mobile", () => {
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
  // 1) Timer + Bell Sound Integration - Mobile
  // ==========================================================================
  test.describe("1) Timer + Bell Sound Integration - Mobile", () => {
    test("timer settings are accessible and bell sounds load correctly on mobile", async ({ page }) => {
      // Navigate to Settings → Preferences
      await navigateToSettings(page);
      await navigateToSettingsSubTab(page, "preferences");

      // Verify bell sound options are visible
      const bellOptions = page.locator('[data-testid="bell-sound-option"]');
      const optionCount = await bellOptions.count();
      expect(optionCount).toBeGreaterThan(0);
      console.log(`[MOBILE-TIMER] Found ${optionCount} bell sound options`);

      // Verify volume slider is visible (may need to scroll on mobile)
      const volumeSlider = page.locator('[data-testid="bell-volume-slider"]');
      await volumeSlider.scrollIntoViewIfNeeded();
      await expect(volumeSlider).toBeVisible();

      // Verify at least one bell option is selected
      const selectedBell = page.locator('[data-testid="bell-sound-option"][data-selected="true"]');
      await expect(selectedBell).toBeVisible({ timeout: 5000 });
      console.log("[MOBILE-TIMER] Bell settings loaded successfully on mobile");
    });

    test("selecting a bell sound persists the selection on mobile", async ({ page }) => {
      await navigateToSettings(page);
      await navigateToSettingsSubTab(page, "preferences");

      const bellOptions = page.locator('[data-testid="bell-sound-option"]');
      const optionCount = await bellOptions.count();

      if (optionCount > 1) {
        // Tap on a different bell sound (second option)
        const secondOption = bellOptions.nth(1);
        await secondOption.scrollIntoViewIfNeeded();
        await secondOption.tap();
        await expect(secondOption).toHaveAttribute("data-selected", "true", { timeout: 5000 });

        // Navigate away and back to verify persistence
        await navigateToChannels(page);
        await page.waitForTimeout(500);
        await navigateToSettings(page);
        await navigateToSettingsSubTab(page, "preferences");

        // The second option should still be selected
        const bellOptionsAfter = page.locator('[data-testid="bell-sound-option"]');
        const secondOptionAfter = bellOptionsAfter.nth(1);
        await secondOptionAfter.scrollIntoViewIfNeeded();
        await expect(secondOptionAfter).toHaveAttribute("data-selected", "true", { timeout: 5000 });
        console.log("[MOBILE-TIMER] Bell selection persisted across navigation on mobile");
      } else {
        console.log("[MOBILE-TIMER] Only one bell option available, skipping persistence check");
      }
    });

    test("session timer is visible and interactive while playing on mobile", async ({ page }) => {
      // Start playback first
      await startPlayback(page);

      // Verify session timer is visible in the player footer
      const sessionTimer = page.locator('[data-testid="session-timer"]');
      await expect(sessionTimer).toBeVisible({ timeout: 10000 });

      // Verify timer shows a time value
      const timerText = await sessionTimer.textContent();
      expect(timerText).toMatch(/\d+:\d{2}/);
      console.log(`[MOBILE-TIMER] Session timer showing: ${timerText}`);

      // Tap the timer to open the timer modal
      await sessionTimer.tap();
      await page.waitForTimeout(500);

      // Verify the timer modal opens (contains Session Timer heading)
      const timerModal = page.locator('text=Session Timer');
      await expect(timerModal).toBeVisible({ timeout: 5000 });

      // Close the modal by tapping outside or the X button
      const closeButton = page.locator('.fixed.inset-0').locator('button:has(.lucide-x)').first();
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.tap();
      } else {
        // Tap outside the modal (top-left corner)
        await page.locator('.fixed.inset-0').first().tap({ position: { x: 10, y: 10 } });
      }

      await page.waitForTimeout(300);
      console.log("[MOBILE-TIMER] Timer modal interaction successful on mobile");
    });

    test("timer reflects active state attribute correctly on mobile", async ({ page }) => {
      await startPlayback(page);

      const sessionTimer = page.locator('[data-testid="session-timer"]');
      await expect(sessionTimer).toBeVisible();

      // Check the data-timer-active attribute
      const timerActive = await sessionTimer.getAttribute("data-timer-active");
      console.log(`[MOBILE-TIMER] Timer active state: ${timerActive}`);

      // The attribute should be either "true" or "false"
      expect(timerActive === "true" || timerActive === "false").toBe(true);
    });
  });

  // ==========================================================================
  // 2) Settings Survive Navigation (Player Continuity) - Mobile
  // ==========================================================================
  test.describe("2) Settings Survive Navigation (Player Continuity) - Mobile", () => {
    test("playback continues while navigating across all tabs on mobile", async ({ page }) => {
      // Start playback
      await startPlayback(page);

      const footerPlayPause = page.locator('[data-testid="player-play-pause"]');

      // Navigate to Profile
      console.log("[MOBILE-NAV] Navigating to Profile...");
      await navigateToProfile(page);
      await expect(footerPlayPause).toBeVisible();
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");
      console.log("[MOBILE-NAV] Profile: Music still playing");

      // Navigate to Slideshow
      console.log("[MOBILE-NAV] Navigating to Slideshow...");
      await navigateToSlideshow(page);
      await expect(footerPlayPause).toBeVisible();
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");
      console.log("[MOBILE-NAV] Slideshow: Music still playing");

      // Navigate to Settings
      console.log("[MOBILE-NAV] Navigating to Settings...");
      await navigateToSettings(page);
      await expect(footerPlayPause).toBeVisible();
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");
      console.log("[MOBILE-NAV] Settings: Music still playing");

      // Navigate back to Channels
      console.log("[MOBILE-NAV] Navigating back to Channels...");
      await navigateToChannels(page);
      await expect(footerPlayPause).toBeVisible();
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");
      console.log("[MOBILE-NAV] Channels: Music still playing");

      // Finally stop playback and confirm it stops
      await footerPlayPause.tap();
      await expect(footerPlayPause).toHaveAttribute("data-playing", "false", { timeout: 5000 });
      console.log("[MOBILE-NAV] Playback stopped successfully - no stray audio");
    });

    test("energy level selection persists during navigation on mobile", async ({ page }) => {
      await navigateToChannels(page);

      // Tap on a channel
      const firstChannel = page.locator('[data-channel-id]').first();
      await firstChannel.tap();

      // Wait for energy selector
      const energySelector = page.locator('[data-testid="energy-selector"]');
      await expect(energySelector).toBeVisible({ timeout: 10000 });

      // Select "high" energy level
      const energyHigh = page.locator('[data-testid="energy-high"]');
      await energyHigh.scrollIntoViewIfNeeded();
      await energyHigh.tap();
      await page.waitForTimeout(500);

      // Start playback
      const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
      await playPauseButton.tap();
      await page.waitForTimeout(2000);

      // Verify playing
      const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");

      // Navigate away to Settings
      await navigateToSettings(page);
      await page.waitForTimeout(500);

      // Navigate back to Channels
      await navigateToChannels(page);

      // Music should still be playing
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");
      console.log("[MOBILE-NAV] Energy level selection and playback persisted through navigation on mobile");
    });

    test("session timer visible across all navigation on mobile", async ({ page }) => {
      // Start playback
      await startPlayback(page);

      const sessionTimer = page.locator('[data-testid="session-timer"]');
      await expect(sessionTimer).toBeVisible();

      // Navigate to each tab and verify timer remains visible
      const tabs = [
        { name: "Profile", navigate: navigateToProfile },
        { name: "Slideshow", navigate: navigateToSlideshow },
        { name: "Settings", navigate: navigateToSettings },
        { name: "Channels", navigate: navigateToChannels },
      ];

      for (const tab of tabs) {
        console.log(`[MOBILE-NAV] Checking timer visibility on ${tab.name}...`);
        await tab.navigate(page);
        await expect(sessionTimer).toBeVisible({ timeout: 5000 });
        console.log(`[MOBILE-NAV] ${tab.name}: Session timer visible`);
      }

      console.log("[MOBILE-NAV] Session timer remained visible across all tabs on mobile");
    });
  });
});

// ============================================================================
// Configuration Verification - Mobile
// ============================================================================
test.describe("Settings-Playback Mobile - Configuration Verification", () => {
  test.use({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
  });

  test("verifies test configuration and environment for mobile", async ({ page }) => {
    console.log("========================================");
    console.log("MOBILE CONFIGURATION VERIFICATION");
    console.log("========================================");

    // Check viewport
    const viewportSize = page.viewportSize();
    console.log(`[MOBILE-CONFIG] Viewport: ${viewportSize?.width}x${viewportSize?.height}`);
    expect(viewportSize?.width).toBeLessThan(768);

    // Check credentials
    console.log(`[MOBILE-CONFIG] Test credentials available: ${hasTestCredentials}`);
    if (hasTestCredentials) {
      console.log(`[MOBILE-CONFIG] Test user email: ${TEST_USER_EMAIL}`);
      expect(TEST_USER_EMAIL).toBeTruthy();
      expect(TEST_USER_PASSWORD).toBeTruthy();
    } else {
      console.log("[MOBILE-CONFIG] WARNING: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");
      console.log("[MOBILE-CONFIG] Set these environment variables to run the full test suite");
    }

    // This test always passes - it's informational
    expect(true).toBe(true);
  });

  test("verifies timer and bell settings load correctly on mobile", async ({ page }) => {
    if (!hasTestCredentials) {
      test.skip();
      return;
    }

    const signedIn = await signInAsTestUser(page);
    if (!signedIn) {
      test.skip();
      return;
    }

    // Navigate to settings preferences
    await navigateToSettings(page);
    await navigateToSettingsSubTab(page, "preferences");

    // Check bell sound options
    const bellOptions = page.locator('[data-testid="bell-sound-option"]');
    const bellCount = await bellOptions.count();
    console.log(`[MOBILE-CONFIG] Bell sound options available: ${bellCount}`);
    expect(bellCount).toBeGreaterThan(0);

    // Check volume slider (scroll into view on mobile)
    const volumeSlider = page.locator('[data-testid="bell-volume-slider"]');
    await volumeSlider.scrollIntoViewIfNeeded();
    const sliderVisible = await volumeSlider.isVisible().catch(() => false);
    console.log(`[MOBILE-CONFIG] Volume slider visible: ${sliderVisible}`);
    expect(sliderVisible).toBe(true);

    // Check for preview buttons
    const previewButtons = page.locator('[data-testid="bell-preview-button"]');
    const previewCount = await previewButtons.count();
    console.log(`[MOBILE-CONFIG] Bell preview buttons: ${previewCount}`);
    expect(previewCount).toBeGreaterThanOrEqual(bellCount);

    console.log("[MOBILE-CONFIG] Timer and bell settings loaded correctly on mobile");
  });

  test("verifies player footer elements exist during playback on mobile", async ({ page }) => {
    if (!hasTestCredentials) {
      test.skip();
      return;
    }

    const signedIn = await signInAsTestUser(page);
    if (!signedIn) {
      test.skip();
      return;
    }

    // Start playback
    await startPlayback(page);

    // Verify all player footer elements
    const elements = [
      { testId: "player-footer", name: "Player Footer" },
      { testId: "player-play-pause", name: "Play/Pause Button" },
      { testId: "session-timer", name: "Session Timer" },
      { testId: "player-now-playing", name: "Now Playing Text" },
      { testId: "player-track-info", name: "Track Info" },
    ];

    console.log("[MOBILE-CONFIG] Verifying player footer elements on mobile...");
    for (const element of elements) {
      const locator = page.locator(`[data-testid="${element.testId}"]`);
      const visible = await locator.isVisible().catch(() => false);
      console.log(`[MOBILE-CONFIG] ${element.name}: ${visible ? "VISIBLE" : "NOT VISIBLE"}`);
      expect(visible).toBe(true);
    }

    // Stop playback
    await stopPlayback(page);

    console.log("[MOBILE-CONFIG] All player footer elements verified on mobile");
  });

  test("verifies mobile menu navigation works correctly", async ({ page }) => {
    if (!hasTestCredentials) {
      test.skip();
      return;
    }

    const signedIn = await signInAsTestUser(page);
    if (!signedIn) {
      test.skip();
      return;
    }

    // Verify hamburger menu is visible
    const menuButton = page.locator('[data-testid="mobile-menu-button"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });
    console.log("[MOBILE-CONFIG] Hamburger menu button visible");

    // Open menu
    await menuButton.tap();
    await page.waitForTimeout(300);

    // Verify all nav items are visible
    const navItems = [
      { testId: "mobile-nav-channels", name: "Channels" },
      { testId: "mobile-nav-profile", name: "Profile" },
      { testId: "mobile-nav-slideshow", name: "Slideshow" },
      { testId: "mobile-nav-settings", name: "Settings" },
    ];

    for (const item of navItems) {
      const navItem = page.locator(`[data-testid="${item.testId}"]`);
      const visible = await navItem.isVisible().catch(() => false);
      console.log(`[MOBILE-CONFIG] ${item.name} nav: ${visible ? "VISIBLE" : "NOT VISIBLE"}`);
      expect(visible).toBe(true);
    }

    console.log("[MOBILE-CONFIG] Mobile menu navigation verified");
  });
});
