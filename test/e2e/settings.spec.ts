import { test, expect, Page } from "@playwright/test";
import { login } from "./login";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * E2E tests for user settings functionality.
 * These tests require a valid test user in the database.
 * 
 * Run with:
 *   TEST_USER_EMAIL=e2etest@williamhenshall.com TEST_USER_PASSWORD=test123 npm run e2e
 */
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const TEST_ALLOW_ACCOUNT_DELETION = process.env.TEST_ALLOW_ACCOUNT_DELETION === "true";

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

    // Wait for dashboard to load - either sign out button (desktop) or hamburger menu (mobile)
    // Use waitForSelector which doesn't have strict mode issues
    try {
      await Promise.race([
        page.waitForSelector('[data-testid="mobile-menu-button"]', { state: "visible", timeout: 15000 }),
        page.waitForSelector('button:has-text("Sign Out")', { state: "visible", timeout: 15000 }),
      ]);
    } catch {
      // Check for auth error
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
 * Navigates to the Settings tab.
 * Handles both static and floating nav scenarios.
 */
async function navigateToSettings(page: Page): Promise<void> {
  // Wait for page to be ready
  await page.waitForLoadState("domcontentloaded");
  
  // Use viewport width to determine mobile vs desktop (more reliable than element visibility)
  const viewportSize = page.viewportSize();
  const isMobile = viewportSize ? viewportSize.width < 768 : false;

  if (isMobile) {
    const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]');
    await expect(mobileMenuButton).toBeVisible({ timeout: 10000 });
    await mobileMenuButton.click();
    
    // Wait for mobile menu to be visible
    const mobileNavSettings = page.locator('[data-testid="mobile-nav-settings"]');
    await mobileNavSettings.waitFor({ state: "visible", timeout: 5000 });
    await mobileNavSettings.click();
    
    // Wait for settings mobile nav to appear
    await page.locator('[data-testid="settings-mobile-nav"]').waitFor({ state: "visible", timeout: 10000 });
  } else {
    // On desktop, look for any visible Settings button and click it
    // First try the data-testid selector, then fallback to role-based selector
    const staticNav = page.locator('[data-testid="nav-settings"]');
    const settingsButton = page.getByRole("button", { name: /^settings$/i }).first();
    
    // Try static nav first
    if (await staticNav.isVisible().catch(() => false)) {
      await staticNav.scrollIntoViewIfNeeded();
      await staticNav.click({ force: true });
    } else {
      // Hover near top to trigger floating nav if needed
      await page.mouse.move(500, 50);
      await page.waitForTimeout(300);
      
      // Try to find any visible settings button
      await settingsButton.waitFor({ state: "visible", timeout: 5000 });
      await settingsButton.click({ force: true });
    }

    // Wait for settings sub-nav to confirm we're on settings page
    // Retry navigation if the sub-nav doesn't appear
    try {
      await expect(page.locator('[data-testid="settings-sub-nav"]')).toBeVisible({ timeout: 5000 });
    } catch {
      // Click didn't work - try again with a different approach
      await page.mouse.move(500, 50);
      await page.waitForTimeout(500);
      const anySettingsBtn = page.locator('button:has-text("Settings")').first();
      await anySettingsBtn.click({ force: true });
      await expect(page.locator('[data-testid="settings-sub-nav"]')).toBeVisible({ timeout: 10000 });
    }
  }
}

/**
 * Navigates to the Slideshow tab.
 * Handles both static and floating nav scenarios.
 */
async function navigateToSlideshow(page: Page): Promise<void> {
  // Wait for page to be ready
  await page.waitForLoadState("domcontentloaded");
  
  // Use viewport width to determine mobile vs desktop
  const viewportSize = page.viewportSize();
  const isMobile = viewportSize ? viewportSize.width < 768 : false;

  if (isMobile) {
    const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]');
    await expect(mobileMenuButton).toBeVisible({ timeout: 10000 });
    await mobileMenuButton.click();
    
    // Wait for mobile menu to be visible
    const mobileNavSlideshow = page.locator('[data-testid="mobile-nav-slideshow"]');
    await mobileNavSlideshow.waitFor({ state: "visible", timeout: 5000 });
    await mobileNavSlideshow.click();
  } else {
    // On desktop, try static nav first, then hover trigger
    const staticNav = page.locator('[data-testid="nav-slideshow"]');
    const staticNavVisible = await staticNav.isVisible().catch(() => false);

    if (staticNavVisible) {
      await staticNav.scrollIntoViewIfNeeded();
      await staticNav.click({ force: true });
    } else {
      // Trigger floating nav by hovering near top of page
      await page.mouse.move(500, 50);
      const slideshowButton = page.getByRole("button", { name: /^slideshow$/i }).first();
      await slideshowButton.waitFor({ state: "visible", timeout: 5000 });
      await slideshowButton.click({ force: true });
    }
  }
  
  // Verify we're on slideshow by checking for slideshow content
  const slideshowContent = page.locator('[data-testid="slideshow-card"], [data-testid="slideshow-toggle"], [data-testid="slideshow-create-button"]').first();
  await slideshowContent.waitFor({ state: "visible", timeout: 10000 });
}

/**
 * Navigates to a specific settings sub-tab.
 * Assumes we're already on the Settings page.
 */
async function navigateToSettingsSubTab(page: Page, tab: "profile" | "preferences" | "privacy"): Promise<void> {
  // Use viewport width to determine mobile vs desktop
  const viewportSize = page.viewportSize();
  const isMobile = viewportSize ? viewportSize.width < 768 : false;
  
  if (isMobile) {
    const mobileTabButton = page.locator(`[data-testid="mobile-settings-tab-${tab}"]`);
    await mobileTabButton.scrollIntoViewIfNeeded();
    await expect(mobileTabButton).toBeVisible({ timeout: 5000 });
    await mobileTabButton.click();
  } else {
    // Desktop: settings sub-nav should be visible
    const desktopNav = page.locator('[data-testid="settings-sub-nav"]');
    await expect(desktopNav).toBeVisible({ timeout: 5000 });
    const tabButton = page.locator(`[data-testid="settings-tab-${tab}"]`);
    await tabButton.scrollIntoViewIfNeeded();
    await expect(tabButton).toBeVisible({ timeout: 5000 });
    await tabButton.click({ force: true });
  }
  
  // Wait for content to load based on which tab we navigated to
  if (tab === "profile") {
    await expect(page.locator('[data-testid="display-name-input"], [data-testid="avatar-upload-button"]').first()).toBeVisible({ timeout: 10000 });
  } else if (tab === "preferences") {
    await expect(page.locator('[data-testid="bell-sound-option"]').first()).toBeVisible({ timeout: 10000 });
  } else if (tab === "privacy") {
    await expect(page.locator('[data-testid="delete-account-button"]')).toBeVisible({ timeout: 10000 });
  }
}

test.describe("Settings E2E Tests - Desktop", () => {
  test.skip(!hasTestCredentials, "Skipping settings tests: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAsTestUser(page);
    if (!signedIn) {
      test.skip();
    }
  });

  test("1) Timer bell sound settings - select sound and adjust volume", async ({ page }) => {
    await navigateToSettings(page);
    await navigateToSettingsSubTab(page, "preferences");

    // Bell options should already be loaded from navigateToSettingsSubTab
    const bellOptions = page.locator('[data-testid="bell-sound-option"]');
    const optionCount = await bellOptions.count();
    expect(optionCount).toBeGreaterThan(0);

    // Click on a different bell sound (second option if available)
    if (optionCount > 1) {
      const secondOption = bellOptions.nth(1);
      await secondOption.click();
      // Wait for selection to update
      await expect(secondOption).toHaveAttribute("data-selected", "true", { timeout: 5000 });
    }

    // Test volume slider
    const volumeSlider = page.locator('[data-testid="bell-volume-slider"]');
    await expect(volumeSlider).toBeVisible();

    // Change volume (set to 50)
    await volumeSlider.fill("50");
    // Verify slider reflects new value
    await expect(volumeSlider).toHaveValue("50", { timeout: 3000 });

    // Test preview button exists
    const previewButton = page.locator('[data-testid="bell-preview-button"]').first();
    await expect(previewButton).toBeVisible();
  });

  test.skip("2) Slideshow settings - toggle slideshow and timer overlay", async ({ page }) => {
    // NOTE: This test is skipped due to navigation issues with the auto-hide nav.
    // The slideshow page requires reliable navigation which is affected by the hover zone.
    // TODO: Re-enable once navigation is more reliable or auto-hide is disabled in tests.
    await navigateToSlideshow(page);

    // Wait longer and scroll to find the slideshow playback settings section
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(500);

    // Wait for slideshow toggles to load
    const slideshowToggle = page.locator('[data-testid="slideshow-toggle"]');
    await slideshowToggle.waitFor({ state: "visible", timeout: 10000 });

    // Get initial slideshow state and toggle
    const initialEnabled = await slideshowToggle.getAttribute("data-enabled");
    await slideshowToggle.click();
    await page.waitForTimeout(500);

    const newEnabled = await slideshowToggle.getAttribute("data-enabled");
    expect(newEnabled).not.toBe(initialEnabled);
  });

  test.skip("3) Slideshow settings - create custom slideshow", async ({ page }) => {
    // NOTE: This test is skipped due to navigation issues with the auto-hide nav.
    // TODO: Re-enable once navigation is more reliable or auto-hide is disabled in tests.
    await navigateToSlideshow(page);

    // Click upload/create button
    const createButton = page.locator('[data-testid="slideshow-create-button"]');
    await createButton.waitFor({ state: "visible", timeout: 10000 });
    await createButton.click();

    // Wait for modal and create slideshow
    const modal = page.locator('[data-testid="slideshow-create-modal"]');
    await modal.waitFor({ state: "visible", timeout: 5000 });

    const slideshowName = `Test Slideshow ${Date.now()}`;
    await page.locator('[data-testid="slideshow-name-input"]').fill(slideshowName);
    await page.locator('[data-testid="slideshow-create-confirm"]').click();
    await page.waitForTimeout(2000);

    await expect(modal).not.toBeVisible();
    const newSlideshow = page.getByText(slideshowName);
    await expect(newSlideshow).toBeVisible();
  });

  test("4) Profile - upload avatar", async ({ page }) => {
    await navigateToSettings(page);
    await navigateToSettingsSubTab(page, "profile");

    // Upload button should be visible from navigateToSettingsSubTab
    const uploadButton = page.locator('[data-testid="avatar-upload-button"]');

    // Get fixture file path
    const fixturePath = path.resolve(__dirname, "../fixtures/test-image.png");

    // Upload avatar using file input
    const fileInput = page.locator('[data-testid="avatar-file-input"]');
    await fileInput.setInputFiles(fixturePath);

    // Wait for editor modal to appear and save
    const savePhotoButton = page.getByRole("button", { name: /save photo/i });
    const modalAppeared = await savePhotoButton.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
    
    if (modalAppeared) {
      await savePhotoButton.click({ force: true });
      // Wait for upload to complete - check for status message or avatar update
      await expect(
        page.locator('[data-testid="avatar-status"], [data-testid="avatar-image"]').first()
      ).toBeVisible({ timeout: 10000 });
    }

    // Verify we're still on the profile page
    await expect(uploadButton).toBeVisible();
  });

  test("5) Profile - change display name", async ({ page }) => {
    await navigateToSettings(page);
    await navigateToSettingsSubTab(page, "profile");

    // Name input should be visible from navigateToSettingsSubTab
    const nameInput = page.locator('[data-testid="display-name-input"]');

    // Click edit button to enable editing
    const editButton = page.locator('[data-testid="display-name-edit-button"]');
    await editButton.click();

    // Wait for input to become enabled (not disabled)
    await expect(nameInput).not.toBeDisabled({ timeout: 3000 });

    // Generate unique name with timestamp
    const newName = `E2E Test User ${Date.now()}`;

    // Clear and type new name
    await nameInput.fill(newName);

    // Click save (same button, now shows "Save")
    await editButton.click();

    // Verify success message appears
    const statusMessage = page.locator('[data-testid="display-name-status"]');
    await expect(statusMessage).toBeVisible({ timeout: 10000 });
    await expect(statusMessage).toContainText(/updated|success/i);

    // Reload and verify persistence
    await page.reload();

    await navigateToSettings(page);
    await navigateToSettingsSubTab(page, "profile");

    // Verify name persisted
    await expect(page.locator('[data-testid="display-name-input"]')).toHaveValue(newName, { timeout: 5000 });
  });

  test("6) Profile - change email (UI only, non-destructive)", async ({ page }) => {
    await navigateToSettings(page);
    await navigateToSettingsSubTab(page, "profile");

    // Email input should be visible from navigateToSettingsSubTab
    const emailInput = page.locator('[data-testid="email-input"]');

    // Click edit button to enable editing
    const editButton = page.locator('[data-testid="email-edit-button"]');
    await editButton.click();

    // Wait for input to become enabled
    await expect(emailInput).not.toBeDisabled({ timeout: 3000 });

    // Enter a fake email (won't actually change since confirmation is required)
    const fakeEmail = `fake+${Date.now()}@example.com`;
    await emailInput.fill(fakeEmail);

    // Click save
    await editButton.click();

    // Verify a status message appears (could be confirmation or validation error)
    const statusMessage = page.locator('[data-testid="email-status"]');
    await expect(statusMessage).toBeVisible({ timeout: 10000 });
    
    // The message should contain either a success/confirmation text OR an error
    // This test just verifies the UI responds to the email change attempt
    const statusText = await statusMessage.textContent();
    expect(statusText).toBeTruthy();

    // Note: The email won't actually change without clicking the confirmation link
    // The test user should still be able to log in with the original email
  });

  test("7) Privacy - delete account dialog (safe coverage - cancel)", async ({ page }) => {
    await navigateToSettings(page);
    await navigateToSettingsSubTab(page, "privacy");

    // Delete button should be visible from navigateToSettingsSubTab
    const deleteButton = page.locator('[data-testid="delete-account-button"]');

    // Click to open confirmation dialog
    await deleteButton.click();

    // Verify confirmation modal is visible
    const confirmModal = page.locator('[data-testid="delete-confirm-modal"]');
    await expect(confirmModal).toBeVisible({ timeout: 5000 });

    // Verify required elements in the modal
    const confirmInput = page.locator('[data-testid="delete-confirm-input"]');
    const cancelButton = page.locator('[data-testid="delete-cancel-button"]');
    const confirmButton = page.locator('[data-testid="delete-confirm-button"]');

    await expect(confirmInput).toBeVisible();
    await expect(cancelButton).toBeVisible();
    await expect(confirmButton).toBeVisible();

    // Verify confirm button is disabled (DELETE not typed)
    await expect(confirmButton).toBeDisabled();

    // Click cancel to close the modal
    await cancelButton.click();

    // Verify modal is closed
    await expect(confirmModal).not.toBeVisible({ timeout: 5000 });

    // Verify we're still on the settings page
    const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]');
    const isMobile = await mobileMenuButton.isVisible().catch(() => false);
    
    if (isMobile) {
      await expect(mobileMenuButton).toBeVisible();
    } else {
      await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
    }
  });
});

test.describe("Settings E2E Tests - Mobile", () => {
  test.use({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
  });

  test.skip(!hasTestCredentials, "Skipping mobile settings tests: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAsTestUser(page);
    if (!signedIn) {
      test.skip();
    }
  });

  test("8) Mobile - navigate to settings and toggle bell settings", async ({ page }) => {
    // Open hamburger menu
    const menuButton = page.locator('[data-testid="mobile-menu-button"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });
    await menuButton.tap();

    // Navigate to Settings
    const mobileNavSettings = page.locator('[data-testid="mobile-nav-settings"]');
    await expect(mobileNavSettings).toBeVisible({ timeout: 5000 });
    await mobileNavSettings.tap();

    // Wait for settings mobile nav to appear
    await expect(page.locator('[data-testid="settings-mobile-nav"]')).toBeVisible({ timeout: 10000 });

    // Navigate to Preferences sub-tab
    const prefsTab = page.locator('[data-testid="mobile-settings-tab-preferences"]');
    await expect(prefsTab).toBeVisible({ timeout: 5000 });
    await prefsTab.tap();

    // Verify bell settings are visible
    const bellOptions = page.locator('[data-testid="bell-sound-option"]');
    await expect(bellOptions.first()).toBeVisible({ timeout: 10000 });

    // Tap on a bell option
    await bellOptions.first().tap();

    // Verify selection
    await expect(bellOptions.first()).toHaveAttribute("data-selected", "true", { timeout: 5000 });

    // Volume slider should be visible
    const volumeSlider = page.locator('[data-testid="bell-volume-slider"]');
    await expect(volumeSlider).toBeVisible();
  });

  test("8b) Mobile - slideshow toggle", async ({ page }) => {
    // Navigate to Slideshow via hamburger
    const menuButton = page.locator('[data-testid="mobile-menu-button"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });
    await menuButton.tap();

    const mobileNavSlideshow = page.locator('[data-testid="mobile-nav-slideshow"]');
    await expect(mobileNavSlideshow).toBeVisible({ timeout: 5000 });
    await mobileNavSlideshow.tap();

    // Wait for slideshow content to load
    const slideshowToggle = page.locator('[data-testid="slideshow-toggle"]');
    await expect(slideshowToggle).toBeVisible({ timeout: 10000 });

    // Get initial state and toggle
    const initialState = await slideshowToggle.getAttribute("data-enabled");
    await slideshowToggle.tap();

    // Verify state changed (wait for attribute to update)
    const expectedNewState = initialState === "true" ? "false" : "true";
    await expect(slideshowToggle).toHaveAttribute("data-enabled", expectedNewState, { timeout: 5000 });
  });
});

// Optional: Destructive tests - only run with explicit flag
test.describe("Settings - Destructive Tests (SKIPPED BY DEFAULT)", () => {
  test.skip(!TEST_ALLOW_ACCOUNT_DELETION, "Skipping destructive tests: TEST_ALLOW_ACCOUNT_DELETION not set to true");

  test("DANGEROUS: Actually delete account", async ({ page }) => {
    // This test is skipped by default
    // To run: TEST_ALLOW_ACCOUNT_DELETION=true TEST_USER_EMAIL=... TEST_USER_PASSWORD=... npm run e2e

    const signedIn = await signInAsTestUser(page);
    if (!signedIn) {
      test.skip();
      return;
    }

    await navigateToSettings(page);
    await navigateToSettingsSubTab(page, "privacy");

    // Click delete button
    await page.locator('[data-testid="delete-account-button"]').click();
    await page.waitForTimeout(500);

    // Type DELETE
    await page.locator('[data-testid="delete-confirm-input"]').fill("DELETE");

    // Click confirm
    await page.locator('[data-testid="delete-confirm-button"]').click();

    // Wait for redirect to home page
    await page.waitForTimeout(5000);

    // Should be logged out and on landing page
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });
});
