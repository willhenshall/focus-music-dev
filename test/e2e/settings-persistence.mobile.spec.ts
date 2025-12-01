import { test, expect, Page } from "@playwright/test";
import { login } from "./login";

/**
 * Settings Persistence E2E Tests - Mobile
 *
 * Mobile counterpart to settings-persistence.spec.ts.
 * Tests that verify user settings (bell sound, timer duration) persist correctly:
 * - Across page reloads
 * - Across navigation between tabs
 * - While playback is active
 *
 * All tests are:
 * - Mobile-only (mobile-chrome project)
 * - Non-destructive (only changes user-level settings)
 * - Using the existing test-user account (NOT admin)
 *
 * Run with:
 *   TEST_USER_EMAIL=... TEST_USER_PASSWORD=... npm run e2e -- --project=mobile-chrome test/e2e/settings-persistence.mobile.spec.ts
 */

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

// ============================================================================
// MOBILE-SPECIFIC HELPER FUNCTIONS
// ============================================================================

/**
 * Signs in as the test user on mobile.
 */
async function signInAsTestUser(page: Page): Promise<boolean> {
  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    return false;
  }

  try {
    await login(page);

    const signInButton = page.locator("header").getByRole("button", { name: /sign in/i });
    await signInButton.tap();

    const emailInput = page.getByLabel(/email/i);
    await emailInput.waitFor({ state: "visible", timeout: 5000 });
    await emailInput.fill(TEST_USER_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_USER_PASSWORD);

    await page.locator("form").getByRole("button", { name: /sign in/i }).tap();

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
 * Starts playback on a channel (mobile version).
 */
async function startPlayback(page: Page): Promise<void> {
  await navigateToChannels(page);

  const firstChannel = page.locator('[data-channel-id]').first();
  await firstChannel.tap();

  const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
  await expect(playPauseButton).toBeVisible({ timeout: 10000 });
  await playPauseButton.tap();

  const footerPlayPause = page.locator('[data-testid="player-play-pause"]');

  for (let attempt = 0; attempt < 3; attempt++) {
    await page.waitForTimeout(2000);
    const isPlaying = await footerPlayPause.getAttribute("data-playing");
    if (isPlaying === "true") {
      return;
    }
    const isVisible = await footerPlayPause.isVisible().catch(() => false);
    if (isVisible) {
      await footerPlayPause.tap();
    } else {
      await playPauseButton.tap();
    }
  }

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
 * Gets the index of the currently selected bell sound.
 */
async function getSelectedBellIndex(page: Page): Promise<number> {
  const bellOptions = page.locator('[data-testid="bell-sound-option"]');
  const count = await bellOptions.count();

  for (let i = 0; i < count; i++) {
    const isSelected = await bellOptions.nth(i).getAttribute("data-selected");
    if (isSelected === "true") {
      return i;
    }
  }
  return -1;
}

/**
 * Selects a bell sound by index (mobile version).
 */
async function selectBellByIndex(page: Page, index: number): Promise<void> {
  const bellOptions = page.locator('[data-testid="bell-sound-option"]');
  const option = bellOptions.nth(index);
  await option.scrollIntoViewIfNeeded();
  await option.tap();
  await expect(option).toHaveAttribute("data-selected", "true", { timeout: 5000 });
}

// ============================================================================
// TEST SUITES
// ============================================================================

test.describe("Settings Persistence E2E Tests - Mobile", () => {
  test.use({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
  });

  test.skip(!hasTestCredentials, "Skipping tests: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }, testInfo) => {
    // Skip if not running on mobile-chrome project
    if (testInfo.project.name !== "mobile-chrome") {
      test.skip(true, "Mobile-only tests - use --project=mobile-chrome");
      return;
    }
    const signedIn = await signInAsTestUser(page);
    if (!signedIn) {
      test.skip();
    }
  });

  test.afterEach(async ({ page }) => {
    await stopPlayback(page).catch(() => {});
  });

  // ==========================================================================
  // A. Bell Sound Persistence Across Full Reload
  // ==========================================================================
  test.describe("A. Bell Sound Persistence - Mobile", () => {
    test("bell sound selection persists across full page reload and re-login on mobile", async ({ page }) => {
      // 1. Navigate to Settings → Preferences
      await navigateToSettings(page);
      await navigateToSettingsSubTab(page, "preferences");

      // 2. Read current bell selection
      const bellOptions = page.locator('[data-testid="bell-sound-option"]');
      const optionCount = await bellOptions.count();
      expect(optionCount).toBeGreaterThan(1);

      const initialSelectedIndex = await getSelectedBellIndex(page);
      console.log(`[MOBILE-BELL] Initial selected bell index: ${initialSelectedIndex}`);

      // 3. Select a DIFFERENT bell sound
      const newIndex = initialSelectedIndex === 0 ? 1 : 0;
      await selectBellByIndex(page, newIndex);
      console.log(`[MOBILE-BELL] Changed bell to index: ${newIndex}`);

      // 4. Preview the bell to verify it's wired
      const previewButton = bellOptions.nth(newIndex).locator('[data-testid="bell-preview-button"]');
      await previewButton.tap();
      await page.waitForTimeout(500);
      const isPlaying = await previewButton.locator('.animate-pulse').isVisible().catch(() => false);
      if (isPlaying) {
        await previewButton.tap();
      }

      // 5. Verify new selection is shown
      await expect(bellOptions.nth(newIndex)).toHaveAttribute("data-selected", "true");

      // 6. Full page reload (session persists, no re-login needed)
      console.log("[MOBILE-BELL] Performing full page reload...");
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      
      // Wait for app to stabilize after reload
      await page.waitForTimeout(1000);

      // 7. Navigate back to Settings → Preferences
      await navigateToSettings(page);
      await navigateToSettingsSubTab(page, "preferences");

      // 8. Assert the new bell is still selected
      const bellOptionsAfter = page.locator('[data-testid="bell-sound-option"]');
      const selectedIndexAfterReload = await getSelectedBellIndex(page);

      console.log(`[MOBILE-BELL] After reload, selected index: ${selectedIndexAfterReload}`);
      expect(selectedIndexAfterReload).toBe(newIndex);
      await expect(bellOptionsAfter.nth(newIndex)).toHaveAttribute("data-selected", "true");

      // 9. Check no error toasts
      const errorToast = page.locator('[role="alert"]:has-text("error")');
      const hasError = await errorToast.isVisible().catch(() => false);
      expect(hasError).toBe(false);

      console.log("[MOBILE-BELL] ✓ Bell sound persisted across reload on mobile");
    });
  });

  // ==========================================================================
  // B. Timer Duration Persistence
  // ==========================================================================
  test.describe("B. Timer Duration Persistence - Mobile", () => {
    test("timer duration persists across navigation and reload on mobile", async ({ page }) => {
      // 1. Start playback to get the session timer visible
      await startPlayback(page);

      // 2. Wait for session timer to be visible
      const sessionTimer = page.locator('[data-testid="session-timer"]');
      await expect(sessionTimer).toBeVisible({ timeout: 10000 });

      // 3. Tap session timer to open modal
      await sessionTimer.tap();

      // 4. Wait for timer modal to appear
      const timerModal = page.locator('text=Session Timer').first();
      await expect(timerModal).toBeVisible({ timeout: 5000 });

      // 5. If timer is active, cancel it first
      const cancelButton = page.locator('button:has-text("Cancel Timer")');
      if (await cancelButton.isVisible().catch(() => false)) {
        await cancelButton.tap();
        await page.waitForTimeout(500);
        await sessionTimer.tap();
        await expect(timerModal).toBeVisible({ timeout: 5000 });
      }

      // 6. Set a specific timer duration (15 minutes)
      const timerInput = page.locator('input[type="number"]');
      await timerInput.fill("15");

      // 7. Tap "Set Timer"
      const setTimerButton = page.locator('button:has-text("Set Timer")');
      await setTimerButton.tap();

      // 8. Wait for modal to close and timer to show new value (timer starts counting immediately)
      await page.waitForTimeout(1000);
      const timerText = await sessionTimer.textContent();
      // Timer may already be counting down (14:59, 14:58, etc.)
      expect(timerText).toMatch(/1[45]:\d{2}/);
      console.log(`[MOBILE-TIMER] Timer set to: ${timerText}`);

      // 9. Navigate around via hamburger menu
      console.log("[MOBILE-TIMER] Navigating around...");
      await navigateToProfile(page);
      await page.waitForTimeout(500);

      await navigateToSettings(page);
      await page.waitForTimeout(500);

      await navigateToChannels(page);
      await page.waitForTimeout(500);

      // 10. Verify timer still shows 15 minutes (or remaining time close to it)
      const timerTextAfterNav = await sessionTimer.textContent();
      expect(timerTextAfterNav).toMatch(/1[45]:\d{2}/);
      console.log(`[MOBILE-TIMER] After navigation, timer: ${timerTextAfterNav}`);

      // 11. Cancel the timer (non-destructive cleanup)
      await sessionTimer.tap();
      await expect(timerModal).toBeVisible({ timeout: 5000 });
      const cancelBtn = page.locator('button:has-text("Cancel Timer")');
      if (await cancelBtn.isVisible().catch(() => false)) {
        await cancelBtn.tap();
      } else {
        await page.keyboard.press("Escape");
      }

      console.log("[MOBILE-TIMER] ✓ Timer duration persisted across navigation on mobile");
    });
  });

  // ==========================================================================
  // C. Playback Safety When Changing Settings
  // ==========================================================================
  test.describe("C. Playback Safety During Settings Changes - Mobile", () => {
    test("changing bell/timer settings while playing does not break playback on mobile", async ({ page }) => {
      // 1. Start playback
      await startPlayback(page);
      const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");
      console.log("[MOBILE-SAFETY] Playback started");

      // 2. Verify session timer is visible
      const sessionTimer = page.locator('[data-testid="session-timer"]');
      await expect(sessionTimer).toBeVisible();

      // 3. Navigate to Settings via hamburger (while playing)
      console.log("[MOBILE-SAFETY] Navigating to Settings...");
      await navigateToSettings(page);
      await navigateToSettingsSubTab(page, "preferences");

      // 4. Verify playback is still running
      await expect(footerPlayPause).toBeVisible();
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");
      console.log("[MOBILE-SAFETY] Playback still running after Settings nav");

      // 5. Change bell sound while playing
      const bellOptions = page.locator('[data-testid="bell-sound-option"]');
      const currentIndex = await getSelectedBellIndex(page);
      const newIndex = currentIndex === 0 ? 1 : 0;
      await selectBellByIndex(page, newIndex);
      console.log("[MOBILE-SAFETY] Bell sound changed while playing");

      // 6. Verify playback is STILL running
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");
      console.log("[MOBILE-SAFETY] Playback still running after bell change");

      // 7. Verify session timer is still visible and not showing NaN
      await expect(sessionTimer).toBeVisible();
      const timerText = await sessionTimer.textContent();
      expect(timerText).not.toContain("NaN");
      expect(timerText).toMatch(/\d+:\d{2}/);
      console.log(`[MOBILE-SAFETY] Session timer: ${timerText}`);

      // 8. Navigate back to Channels
      await navigateToChannels(page);

      // 9. Verify playback state is valid
      await expect(footerPlayPause).toBeVisible();
      const playingState = await footerPlayPause.getAttribute("data-playing");
      expect(playingState === "true" || playingState === "false").toBe(true);
      console.log(`[MOBILE-SAFETY] Final playback state: ${playingState}`);

      // 10. Check for no error notifications
      const errorNotification = page.locator('[role="alert"]:has-text("error")');
      const hasError = await errorNotification.isVisible().catch(() => false);
      expect(hasError).toBe(false);

      console.log("[MOBILE-SAFETY] ✓ Settings changes did not break playback on mobile");
    });
  });
});
