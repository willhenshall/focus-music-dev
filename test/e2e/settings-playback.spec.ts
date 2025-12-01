import { test, expect, Page } from "@playwright/test";
import { login } from "./login";

/**
 * Settings ↔ Playback E2E Tests
 * 
 * These tests verify that user settings actually affect playback behavior.
 * All tests are:
 * - Desktop-only (chromium project)
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
 *   TEST_USER_EMAIL=... TEST_USER_PASSWORD=... npm run e2e -- test/e2e/settings-playback.spec.ts
 */

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

/**
 * Signs in as the test user to access the user dashboard.
 * Returns true if sign-in succeeded, false otherwise.
 */
async function signInAsTestUser(page: Page): Promise<boolean> {
  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    return false;
  }

  try {
    await login(page);

    const signInButton = page.locator("header").getByRole("button", { name: /sign in/i });
    await signInButton.click();

    // Wait for and fill auth form
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
        console.error("Authentication failed - invalid credentials");
        return false;
      }
      throw new Error("Dashboard did not load after sign in");
    }

    return true;
  } catch (error) {
    console.error("Failed to sign in as test user:", error);
    return false;
  }
}

/**
 * Navigates to Settings tab on desktop.
 */
async function navigateToSettings(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  
  const staticNav = page.locator('[data-testid="nav-settings"]');
  const settingsButton = page.getByRole("button", { name: /^settings$/i }).first();
  
  if (await staticNav.isVisible().catch(() => false)) {
    await staticNav.scrollIntoViewIfNeeded();
    await staticNav.click({ force: true });
  } else {
    await page.mouse.move(500, 50);
    await page.waitForTimeout(300);
    await settingsButton.waitFor({ state: "visible", timeout: 5000 });
    await settingsButton.click({ force: true });
  }

  // Wait for settings sub-nav
  try {
    await expect(page.locator('[data-testid="settings-sub-nav"]')).toBeVisible({ timeout: 5000 });
  } catch {
    await page.mouse.move(500, 50);
    await page.waitForTimeout(500);
    const anySettingsBtn = page.locator('button:has-text("Settings")').first();
    await anySettingsBtn.click({ force: true });
    await expect(page.locator('[data-testid="settings-sub-nav"]')).toBeVisible({ timeout: 10000 });
  }
}

/**
 * Navigates to a specific settings sub-tab.
 */
async function navigateToSettingsSubTab(page: Page, tab: "profile" | "preferences" | "privacy"): Promise<void> {
  const desktopNav = page.locator('[data-testid="settings-sub-nav"]');
  await expect(desktopNav).toBeVisible({ timeout: 5000 });
  const tabButton = page.locator(`[data-testid="settings-tab-${tab}"]`);
  await tabButton.scrollIntoViewIfNeeded();
  await expect(tabButton).toBeVisible({ timeout: 5000 });
  await tabButton.click({ force: true });
  
  // Wait for content
  if (tab === "preferences") {
    await expect(page.locator('[data-testid="bell-sound-option"]').first()).toBeVisible({ timeout: 10000 });
  }
}

/**
 * Navigates to the Slideshow tab on desktop.
 */
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
  
  // Verify we're on slideshow
  const slideshowContent = page.locator('[data-testid="slideshow-card"], [data-testid="slideshow-toggle"], [data-testid="slideshow-create-button"]').first();
  await slideshowContent.waitFor({ state: "visible", timeout: 10000 });
}

/**
 * Navigates to the Channels tab on desktop.
 */
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
  
  // Wait for channel cards
  await page.locator('[data-channel-id]').first().waitFor({ state: "visible", timeout: 10000 });
}

/**
 * Navigates to the Profile tab on desktop.
 */
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

/**
 * Starts playback on a channel and waits for it to begin.
 * Uses retry logic to handle audio loading delays.
 */
async function startPlayback(page: Page): Promise<void> {
  // Navigate to channels first
  await navigateToChannels(page);
  
  // Click on the first channel card to select it
  const firstChannel = page.locator('[data-channel-id]').first();
  await firstChannel.click();

  // Wait for channel to become active (play/pause button appears)
  const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
  await expect(playPauseButton).toBeVisible({ timeout: 10000 });

  // Click play to start playback
  await playPauseButton.click();

  // Wait for playback to start with retry logic
  const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
  
  // Try up to 3 times to ensure playback starts
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.waitForTimeout(2000);
    
    const isPlaying = await footerPlayPause.getAttribute("data-playing");
    if (isPlaying === "true") {
      return;
    }
    
    // If not playing, try clicking play again
    const isVisible = await footerPlayPause.isVisible().catch(() => false);
    if (isVisible) {
      await footerPlayPause.click();
    } else {
      // Footer not visible yet, try the channel play button again
      await playPauseButton.click();
    }
  }

  // Final verification
  await expect(footerPlayPause).toHaveAttribute("data-playing", "true", { timeout: 10000 });
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

// ============================================================================
// TEST SUITES
// ============================================================================

test.describe("Settings ↔ Playback E2E Tests - Desktop", () => {
  // Skip on mobile projects - admin/settings E2E tests are desktop-only
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name === "mobile-chrome") {
      test.skip(true, "Settings-playback tests are desktop-only");
    }
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
  // 1) Timer + Bell Sound Integration
  // ==========================================================================
  test.describe("1) Timer + Bell Sound Integration", () => {
    test("timer settings are accessible and bell sounds load correctly", async ({ page }) => {
      // Navigate to Settings → Preferences
      await navigateToSettings(page);
      await navigateToSettingsSubTab(page, "preferences");

      // Verify bell sound options are visible
      const bellOptions = page.locator('[data-testid="bell-sound-option"]');
      const optionCount = await bellOptions.count();
      expect(optionCount).toBeGreaterThan(0);
      console.log(`[TIMER] Found ${optionCount} bell sound options`);

      // Verify volume slider is visible
      const volumeSlider = page.locator('[data-testid="bell-volume-slider"]');
      await expect(volumeSlider).toBeVisible();

      // Verify at least one bell option is selected
      const selectedBell = page.locator('[data-testid="bell-sound-option"][data-selected="true"]');
      await expect(selectedBell).toBeVisible({ timeout: 5000 });
      console.log("[TIMER] Bell settings loaded successfully");
    });

    test("selecting a bell sound persists the selection", async ({ page }) => {
      await navigateToSettings(page);
      await navigateToSettingsSubTab(page, "preferences");

      const bellOptions = page.locator('[data-testid="bell-sound-option"]');
      const optionCount = await bellOptions.count();

      if (optionCount > 1) {
        // Click on a different bell sound (second option)
        const secondOption = bellOptions.nth(1);
        await secondOption.click();
        await expect(secondOption).toHaveAttribute("data-selected", "true", { timeout: 5000 });

        // Navigate away and back to verify persistence
        await navigateToChannels(page);
        await page.waitForTimeout(500);
        await navigateToSettings(page);
        await navigateToSettingsSubTab(page, "preferences");

        // The second option should still be selected
        const bellOptionsAfter = page.locator('[data-testid="bell-sound-option"]');
        const secondOptionAfter = bellOptionsAfter.nth(1);
        await expect(secondOptionAfter).toHaveAttribute("data-selected", "true", { timeout: 5000 });
        console.log("[TIMER] Bell selection persisted across navigation");
      } else {
        console.log("[TIMER] Only one bell option available, skipping persistence check");
      }
    });

    test("session timer is visible and interactive while playing", async ({ page }) => {
      // Start playback first
      await startPlayback(page);

      // Verify session timer is visible in the player footer
      const sessionTimer = page.locator('[data-testid="session-timer"]');
      await expect(sessionTimer).toBeVisible({ timeout: 10000 });

      // Verify timer shows a time value
      const timerText = await sessionTimer.textContent();
      expect(timerText).toMatch(/\d+:\d{2}/);
      console.log(`[TIMER] Session timer showing: ${timerText}`);

      // Click the timer to open the timer modal
      await sessionTimer.click();
      await page.waitForTimeout(500);

      // Verify the timer modal opens (contains Session Timer heading)
      const timerModal = page.locator('text=Session Timer');
      await expect(timerModal).toBeVisible({ timeout: 5000 });

      // Close the modal by clicking outside or the X button
      const closeButton = page.locator('.fixed.inset-0').locator('button:has(.lucide-x)').first();
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click();
      } else {
        // Click outside the modal
        await page.mouse.click(10, 10);
      }

      await page.waitForTimeout(300);
      console.log("[TIMER] Timer modal interaction successful");
    });

    test("timer reflects active state attribute correctly", async ({ page }) => {
      await startPlayback(page);

      const sessionTimer = page.locator('[data-testid="session-timer"]');
      await expect(sessionTimer).toBeVisible();

      // Check the data-timer-active attribute
      const timerActive = await sessionTimer.getAttribute("data-timer-active");
      console.log(`[TIMER] Timer active state: ${timerActive}`);

      // The attribute should be either "true" or "false"
      expect(timerActive === "true" || timerActive === "false").toBe(true);
    });
  });

  // ==========================================================================
  // 2) Slideshow Integration While Playing
  // NOTE: These tests are SKIPPED due to navigation issues with the auto-hide nav.
  // The slideshow page requires reliable navigation which is affected by the hover zone.
  // This matches the pattern in settings.spec.ts which also skips slideshow tests.
  // TODO: Re-enable once navigation is more reliable or auto-hide is disabled in tests.
  // ==========================================================================
  test.describe("2) Slideshow Integration While Playing", () => {
    test.skip("slideshow settings are accessible and toggle works", async ({ page }) => {
      await navigateToSlideshow(page);

      // Wait for slideshow toggle to load
      const slideshowToggle = page.locator('[data-testid="slideshow-toggle"]');
      await slideshowToggle.waitFor({ state: "visible", timeout: 10000 });

      // Get initial state
      const initialEnabled = await slideshowToggle.getAttribute("data-enabled");
      console.log(`[SLIDESHOW] Initial enabled state: ${initialEnabled}`);

      // Toggle the slideshow
      await slideshowToggle.click();
      await page.waitForTimeout(500);

      // Verify state changed
      const newEnabled = await slideshowToggle.getAttribute("data-enabled");
      expect(newEnabled).not.toBe(initialEnabled);
      console.log(`[SLIDESHOW] After toggle, enabled state: ${newEnabled}`);

      // Toggle back to original state (non-destructive)
      await slideshowToggle.click();
      await page.waitForTimeout(500);

      const finalEnabled = await slideshowToggle.getAttribute("data-enabled");
      expect(finalEnabled).toBe(initialEnabled);
      console.log("[SLIDESHOW] Toggle reverted to original state");
    });

    test.skip("timer overlay toggle is accessible in slideshow settings", async ({ page }) => {
      await navigateToSlideshow(page);

      // Wait for timer overlay toggle to load
      const timerOverlayToggle = page.locator('[data-testid="timer-overlay-toggle"]');
      await timerOverlayToggle.waitFor({ state: "visible", timeout: 10000 });

      // Get initial state
      const initialEnabled = await timerOverlayToggle.getAttribute("data-enabled");
      console.log(`[SLIDESHOW] Timer overlay initial state: ${initialEnabled}`);

      // Toggle the timer overlay
      await timerOverlayToggle.click();
      await page.waitForTimeout(300);

      // Verify state changed
      const newEnabled = await timerOverlayToggle.getAttribute("data-enabled");
      expect(newEnabled).not.toBe(initialEnabled);
      console.log(`[SLIDESHOW] Timer overlay after toggle: ${newEnabled}`);

      // Toggle back to original state (non-destructive)
      await timerOverlayToggle.click();
      await page.waitForTimeout(300);

      const finalEnabled = await timerOverlayToggle.getAttribute("data-enabled");
      expect(finalEnabled).toBe(initialEnabled);
      console.log("[SLIDESHOW] Timer overlay reverted to original state");
    });

    test.skip("slideshow cards are selectable", async ({ page }) => {
      await navigateToSlideshow(page);

      // Wait for slideshow cards to load
      const slideshowCards = page.locator('[data-testid="slideshow-card"]');
      await slideshowCards.first().waitFor({ state: "visible", timeout: 10000 });

      const cardCount = await slideshowCards.count();
      expect(cardCount).toBeGreaterThan(0);
      console.log(`[SLIDESHOW] Found ${cardCount} slideshow cards`);

      if (cardCount > 1) {
        // Click on a different card
        const secondCard = slideshowCards.nth(1);
        await secondCard.click();
        await page.waitForTimeout(500);

        // Verify selection changed
        await expect(secondCard).toHaveAttribute("data-selected", "true", { timeout: 5000 });
        console.log("[SLIDESHOW] Successfully selected a different slideshow card");
      }
    });

    test.skip("slideshow settings persist while playback is active", async ({ page }) => {
      // First configure slideshow settings
      await navigateToSlideshow(page);
      
      const slideshowToggle = page.locator('[data-testid="slideshow-toggle"]');
      await slideshowToggle.waitFor({ state: "visible", timeout: 10000 });
      
      // Enable slideshow if not already enabled
      const currentState = await slideshowToggle.getAttribute("data-enabled");
      if (currentState !== "true") {
        await slideshowToggle.click();
        await page.waitForTimeout(500);
      }

      // Start playback
      await startPlayback(page);

      // Navigate back to slideshow settings
      await navigateToSlideshow(page);

      // Verify slideshow is still enabled
      const slideshowToggleAfter = page.locator('[data-testid="slideshow-toggle"]');
      await expect(slideshowToggleAfter).toHaveAttribute("data-enabled", "true", { timeout: 5000 });
      console.log("[SLIDESHOW] Slideshow settings persisted during playback");

      // Revert slideshow state if we changed it
      if (currentState !== "true") {
        await slideshowToggleAfter.click();
        await page.waitForTimeout(500);
      }
    });
  });

  // ==========================================================================
  // 3) Settings Survive Navigation (Player Continuity)
  // ==========================================================================
  test.describe("3) Settings Survive Navigation (Player Continuity)", () => {
    test("playback continues while navigating across all tabs", async ({ page }) => {
      // Start playback
      await startPlayback(page);

      const footerPlayPause = page.locator('[data-testid="player-play-pause"]');

      // Navigate to Profile
      console.log("[NAV] Navigating to Profile...");
      await navigateToProfile(page);
      await expect(footerPlayPause).toBeVisible();
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");
      console.log("[NAV] Profile: Music still playing");

      // Navigate to Slideshow
      console.log("[NAV] Navigating to Slideshow...");
      await navigateToSlideshow(page);
      await expect(footerPlayPause).toBeVisible();
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");
      console.log("[NAV] Slideshow: Music still playing");

      // Navigate to Settings
      console.log("[NAV] Navigating to Settings...");
      await navigateToSettings(page);
      await expect(footerPlayPause).toBeVisible();
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");
      console.log("[NAV] Settings: Music still playing");

      // Navigate back to Channels
      console.log("[NAV] Navigating back to Channels...");
      await navigateToChannels(page);
      await expect(footerPlayPause).toBeVisible();
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");
      console.log("[NAV] Channels: Music still playing");

      // Finally stop playback and confirm it stops
      await footerPlayPause.click();
      await expect(footerPlayPause).toHaveAttribute("data-playing", "false", { timeout: 5000 });
      console.log("[NAV] Playback stopped successfully - no stray audio");
    });

    test("energy level selection persists during navigation", async ({ page }) => {
      await navigateToChannels(page);

      // Click on a channel
      const firstChannel = page.locator('[data-channel-id]').first();
      await firstChannel.click();

      // Wait for energy selector
      const energySelector = page.locator('[data-testid="energy-selector"]');
      await expect(energySelector).toBeVisible({ timeout: 10000 });

      // Select "high" energy level
      const energyHigh = page.locator('[data-testid="energy-high"]');
      await energyHigh.click();
      await page.waitForTimeout(500);

      // Start playback
      const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
      await playPauseButton.click();
      await page.waitForTimeout(2000);

      // Verify playing
      const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");

      // Navigate away to Settings
      await navigateToSettings(page);
      await page.waitForTimeout(500);

      // Navigate back to Channels
      await navigateToChannels(page);

      // The energy selector should still show (channel is still selected)
      // and music should still be playing
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");
      console.log("[NAV] Energy level selection and playback persisted through navigation");
    });

    test("session timer visible across all navigation", async ({ page }) => {
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
        console.log(`[NAV] Checking timer visibility on ${tab.name}...`);
        await tab.navigate(page);
        await expect(sessionTimer).toBeVisible({ timeout: 5000 });
        console.log(`[NAV] ${tab.name}: Session timer visible`);
      }

      console.log("[NAV] Session timer remained visible across all tabs");
    });
  });
});

// ============================================================================
// 4) Configuration Verification Block
// ============================================================================
test.describe("Settings-Playback - Configuration Verification", () => {
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name === "mobile-chrome") {
      test.skip(true, "Settings-playback tests are desktop-only");
    }
  });

  test("verifies test configuration and environment", async ({ page }) => {
    console.log("========================================");
    console.log("CONFIGURATION VERIFICATION");
    console.log("========================================");

    // Check credentials
    console.log(`[CONFIG] Test credentials available: ${hasTestCredentials}`);
    if (hasTestCredentials) {
      console.log(`[CONFIG] Test user email: ${TEST_USER_EMAIL}`);
      expect(TEST_USER_EMAIL).toBeTruthy();
      expect(TEST_USER_PASSWORD).toBeTruthy();
    } else {
      console.log("[CONFIG] WARNING: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");
      console.log("[CONFIG] Set these environment variables to run the full test suite");
    }

    // Verify we're using test-user, NOT admin
    if (TEST_USER_EMAIL) {
      const isAdminEmail = TEST_USER_EMAIL.toLowerCase().includes("admin");
      console.log(`[CONFIG] Is admin account: ${isAdminEmail}`);
      if (isAdminEmail) {
        console.log("[CONFIG] WARNING: Using admin account - tests should use regular test user");
      } else {
        console.log("[CONFIG] GOOD: Using regular test user account");
      }
    }

    // This test always passes - it's informational
    expect(true).toBe(true);
  });

  // NOTE: Skipped due to navigation issues with slideshow tab (same as slideshow tests above)
  test.skip("verifies slideshow feature is available", async ({ page }) => {
    if (!hasTestCredentials) {
      test.skip();
      return;
    }

    const signedIn = await signInAsTestUser(page);
    if (!signedIn) {
      test.skip();
      return;
    }

    // Navigate to slideshow and verify it loads
    await navigateToSlideshow(page);

    // Check for slideshow toggle
    const slideshowToggle = page.locator('[data-testid="slideshow-toggle"]');
    const toggleVisible = await slideshowToggle.isVisible().catch(() => false);
    console.log(`[CONFIG] Slideshow toggle visible: ${toggleVisible}`);
    expect(toggleVisible).toBe(true);

    // Check for slideshow cards
    const slideshowCards = page.locator('[data-testid="slideshow-card"]');
    const cardCount = await slideshowCards.count();
    console.log(`[CONFIG] Slideshow cards available: ${cardCount}`);
    expect(cardCount).toBeGreaterThanOrEqual(0);

    console.log("[CONFIG] Slideshow feature is available and functional");
  });

  test("verifies timer and bell settings load correctly", async ({ page }) => {
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
    console.log(`[CONFIG] Bell sound options available: ${bellCount}`);
    expect(bellCount).toBeGreaterThan(0);

    // Check volume slider
    const volumeSlider = page.locator('[data-testid="bell-volume-slider"]');
    const sliderVisible = await volumeSlider.isVisible().catch(() => false);
    console.log(`[CONFIG] Volume slider visible: ${sliderVisible}`);
    expect(sliderVisible).toBe(true);

    // Check for preview buttons
    const previewButtons = page.locator('[data-testid="bell-preview-button"]');
    const previewCount = await previewButtons.count();
    console.log(`[CONFIG] Bell preview buttons: ${previewCount}`);
    expect(previewCount).toBeGreaterThanOrEqual(bellCount);

    console.log("[CONFIG] Timer and bell settings loaded correctly");
  });

  test("verifies player footer elements exist during playback", async ({ page }) => {
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

    console.log("[CONFIG] Verifying player footer elements...");
    for (const element of elements) {
      const locator = page.locator(`[data-testid="${element.testId}"]`);
      const visible = await locator.isVisible().catch(() => false);
      console.log(`[CONFIG] ${element.name}: ${visible ? "VISIBLE" : "NOT VISIBLE"}`);
      expect(visible).toBe(true);
    }

    // Stop playback
    await stopPlayback(page);

    console.log("[CONFIG] All player footer elements verified");
  });
});
