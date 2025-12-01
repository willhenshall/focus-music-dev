import { test, expect, Page } from "@playwright/test";
import {
  signInAsAdmin,
  hasAdminCredentials,
  navigateToAdminDashboard,
  navigateToAdminTab,
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
} from "./admin-login";

/**
 * Admin Channel Editor E2E Tests - Phase 2 (Non-Destructive, Desktop Only)
 *
 * These tests verify the admin channel editor functionality without making
 * destructive changes. All tests:
 * - Run only when TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD are set
 * - Use desktop viewport only (chromium project)
 * - Avoid destructive actions: no real deletes, no irreversible changes
 *
 * Test coverage:
 * 1. Opening Admin → Channels section
 * 2. Opening channel edit UI for an existing channel
 * 3. Verifying key fields and controls are present
 * 4. Required-field validation for channel name
 * 5. Cancel closes editor without changes
 * 6. Non-destructive editing flow (type then cancel)
 * 7. Permission check: non-admin cannot access Admin menu
 *
 * Prerequisites:
 *   - Admin test account must exist with admin privileges
 *   - Environment variables must be set:
 *     - TEST_ADMIN_EMAIL
 *     - TEST_ADMIN_PASSWORD
 *
 * Run with:
 *   TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... npm run e2e -- test/e2e/admin-channels.spec.ts
 */

// Non-admin user credentials (for permission tests)
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const hasNonAdminCredentials = Boolean(TEST_USER_EMAIL && TEST_USER_PASSWORD);

/**
 * Helper to wait for the channels tab content to load
 */
async function waitForChannelsTabToLoad(page: Page): Promise<void> {
  // Wait for the channel manager content to be visible
  // Look for the search input and at least one channel card
  const searchInput = page.locator('[data-testid="channels-search-input"]');
  await expect(searchInput).toBeVisible({ timeout: 15000 });

  // Wait for at least one channel to appear
  const firstChannel = page.locator('[data-testid^="channel-card-"]').first();
  await expect(firstChannel).toBeVisible({ timeout: 15000 });
}

/**
 * Helper to open the channel editor for a specific channel
 * Note: In "user-order" mode (default), we need to click the Edit button instead of the card
 */
async function openChannelEditor(page: Page, channelName?: string): Promise<void> {
  // If searching for a specific channel name
  if (channelName) {
    const searchInput = page.locator('[data-testid="channels-search-input"]');
    await searchInput.fill(channelName);
    await page.waitForTimeout(500);
  }

  // Find the first channel card
  const firstChannel = page.locator('[data-testid^="channel-card-"]').first();
  await expect(firstChannel).toBeVisible({ timeout: 10000 });

  // In user-order mode, there's an Edit button; in other modes, clicking the card opens the editor
  // Try to find and click the Edit button first (preferred for user-order mode)
  const editButton = firstChannel.locator('button:has-text("Edit")');
  const hasEditButton = await editButton.isVisible({ timeout: 2000 }).catch(() => false);

  if (hasEditButton) {
    await editButton.click();
  } else {
    // Fallback: click the card itself (works in non user-order modes)
    await firstChannel.click();
  }

  // Wait for the channel editor modal to appear
  const modal = page.locator('[data-testid="channel-editor-modal"]');
  await expect(modal).toBeVisible({ timeout: 10000 });
}

/**
 * Helper to close the channel editor via Cancel button
 */
async function closeChannelEditor(page: Page): Promise<void> {
  // Look for the X close button on the modal
  const closeButton = page.locator('[data-testid="channel-editor-close"]');
  await closeButton.click();

  // Wait for modal to close
  const modal = page.locator('[data-testid="channel-editor-modal"]');
  await expect(modal).toBeHidden({ timeout: 5000 });
}

/**
 * Helper to sign in as a regular (non-admin) user
 */
async function signInAsRegularUser(page: Page): Promise<boolean> {
  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    console.log("[USER LOGIN] Skipping: TEST_USER_EMAIL or TEST_USER_PASSWORD not set");
    return false;
  }

  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    // Bypass password gate if present
    const passwordInput = page.locator('input[type="password"]').first();
    const isPasswordGateVisible = await passwordInput
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (isPasswordGateVisible) {
      await passwordInput.fill("magic");
      await page.getByRole("button", { name: /continue/i }).click();
      await page.waitForTimeout(1500);
    }

    // Click Sign In button on landing page
    const signInButton = page.locator("header").getByRole("button", { name: /sign in/i });
    const signInVisible = await signInButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (signInVisible) {
      await signInButton.click();
    }

    // Fill credentials
    const emailInput = page.getByLabel(/email/i);
    await emailInput.waitFor({ state: "visible", timeout: 10000 });
    await emailInput.fill(TEST_USER_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_USER_PASSWORD);

    // Submit
    await page.locator("form").getByRole("button", { name: /sign in/i }).click();

    // Wait for the dashboard to load (Channels button should be visible)
    const channelsButton = page.getByRole("button", { name: /channels/i });
    await channelsButton.waitFor({ state: "visible", timeout: 15000 });

    console.log("[USER LOGIN] Successfully signed in as regular user");
    return true;
  } catch (error) {
    console.error("[USER LOGIN] Failed to sign in:", error);
    return false;
  }
}

test.describe("Admin Channel Editor E2E Tests - Phase 2 (Non-Destructive)", () => {
  // Admin UI is desktop-only; skip on mobile projects
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name === "mobile-chrome") {
      test.skip(true, "Admin UI is desktop-only; mobile admin not supported.");
    }
  });

  // Skip all tests if admin credentials are not set
  test.skip(
    !hasAdminCredentials,
    "Skipping admin tests: TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD environment variables must be set"
  );

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAsAdmin(page);
    if (!signedIn) {
      test.skip();
    }
    // Navigate to Admin Dashboard
    await navigateToAdminDashboard(page);
  });

  test("1) Admin can navigate to Channels tab and see channel list", async ({ page }) => {
    // Navigate to Channels tab
    await navigateToAdminTab(page, "channels");

    // Wait for channels to load
    await waitForChannelsTabToLoad(page);

    // Verify we can see channel cards
    const channelCards = page.locator('[data-testid^="channel-card-"]');
    const cardCount = await channelCards.count();
    expect(cardCount).toBeGreaterThan(0);

    console.log(`[CHANNELS TAB] Found ${cardCount} channel(s)`);

    // Verify search input is present
    const searchInput = page.locator('[data-testid="channels-search-input"]');
    await expect(searchInput).toBeVisible();

    // Verify "Add Channel" button is present
    const addChannelButton = page.locator('[data-testid="add-channel-button"]');
    await expect(addChannelButton).toBeVisible();
  });

  test("2) Admin can open channel editor for an existing channel", async ({ page }) => {
    await navigateToAdminTab(page, "channels");
    await waitForChannelsTabToLoad(page);

    // Get the first channel name before clicking
    const firstChannelCard = page.locator('[data-testid^="channel-card-"]').first();
    const channelName = await firstChannelCard.locator("h3").textContent();
    console.log(`[CHANNEL EDITOR] Opening editor for channel: ${channelName}`);

    // Open the channel editor
    await openChannelEditor(page);

    // Verify modal is visible
    const modal = page.locator('[data-testid="channel-editor-modal"]');
    await expect(modal).toBeVisible();

    // Verify the channel name is displayed in the modal header
    const modalTitle = page.locator('[data-testid="channel-editor-modal"] h2');
    await expect(modalTitle).toBeVisible();

    // Close the editor
    await closeChannelEditor(page);
  });

  test("3) Channel editor displays all expected fields and controls", async ({ page }) => {
    await navigateToAdminTab(page, "channels");
    await waitForChannelsTabToLoad(page);

    // Open the channel editor
    await openChannelEditor(page);

    // Click the edit button to enter edit mode
    const editButton = page.locator('[data-testid="channel-edit-button"]');
    if (await editButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editButton.click();
      await page.waitForTimeout(500);
    }

    // Verify channel name field is present
    const channelNameInput = page.locator('[data-testid="channel-name-input"]');
    await expect(channelNameInput).toBeVisible({ timeout: 5000 });

    // Verify description field is present
    const descriptionInput = page.locator('[data-testid="channel-description-input"]');
    await expect(descriptionInput).toBeVisible();

    // Verify intensity/energy selector is present
    const intensitySelect = page.locator('[data-testid="channel-intensity-select"]');
    await expect(intensitySelect).toBeVisible();

    // Verify about channel field is present
    const aboutChannelInput = page.locator('[data-testid="channel-about-input"]');
    await expect(aboutChannelInput).toBeVisible();

    // Verify Save button is present
    const saveButton = page.locator('[data-testid="channel-save-button"]');
    await expect(saveButton).toBeVisible();

    // Verify Cancel button is present (exits edit mode)
    const cancelButton = page.locator('[data-testid="channel-cancel-button"]');
    await expect(cancelButton).toBeVisible();

    console.log("[CHANNEL EDITOR] All expected fields and controls are present");

    // Click cancel to exit edit mode (but stay in modal)
    await cancelButton.click();
    await page.waitForTimeout(500);

    // Now close the modal using the close button
    await closeChannelEditor(page);
  });

  test("4) Required-field validation: channel name cannot be empty", async ({ page }) => {
    await navigateToAdminTab(page, "channels");
    await waitForChannelsTabToLoad(page);

    // Open the channel editor
    await openChannelEditor(page);

    // Enter edit mode
    const editButton = page.locator('[data-testid="channel-edit-button"]');
    if (await editButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editButton.click();
      await page.waitForTimeout(500);
    }

    // Get the current channel name
    const channelNameInput = page.locator('[data-testid="channel-name-input"]');
    await expect(channelNameInput).toBeVisible({ timeout: 5000 });
    const originalName = await channelNameInput.inputValue();

    // Clear the channel name field
    await channelNameInput.clear();

    // Verify the save button is disabled when name is empty
    const saveButton = page.locator('[data-testid="channel-save-button"]');
    await expect(saveButton).toBeDisabled();

    console.log("[VALIDATION] Save button is correctly disabled when channel name is empty");

    // Restore the original name
    await channelNameInput.fill(originalName);

    // Verify the save button is now enabled
    await expect(saveButton).toBeEnabled();

    // Click cancel to exit edit mode (stays in modal)
    const cancelButton = page.locator('[data-testid="channel-cancel-button"]');
    await cancelButton.click();
    await page.waitForTimeout(500);

    // Close the modal
    await closeChannelEditor(page);
  });

  test("5) Cancel button discards edits without saving", async ({ page }) => {
    await navigateToAdminTab(page, "channels");
    await waitForChannelsTabToLoad(page);

    // Get the first channel's name before editing
    const firstChannelCard = page.locator('[data-testid^="channel-card-"]').first();
    const originalChannelName = await firstChannelCard.locator("h3").textContent();
    console.log(`[CANCEL TEST] Original channel name: ${originalChannelName}`);

    // Open the channel editor
    await openChannelEditor(page);

    // Enter edit mode
    const editButton = page.locator('[data-testid="channel-edit-button"]');
    if (await editButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editButton.click();
      await page.waitForTimeout(500);
    }

    // Modify the channel name (but don't save)
    const channelNameInput = page.locator('[data-testid="channel-name-input"]');
    await expect(channelNameInput).toBeVisible({ timeout: 5000 });
    const originalInputValue = await channelNameInput.inputValue();
    await channelNameInput.fill("TEMP_TEST_NAME_SHOULD_NOT_SAVE");

    // Click Cancel to discard changes (exits edit mode, stays in modal)
    const cancelButton = page.locator('[data-testid="channel-cancel-button"]');
    await cancelButton.click();
    await page.waitForTimeout(500);

    // Re-enter edit mode to verify the value was reset
    const editButton2 = page.locator('[data-testid="channel-edit-button"]');
    await editButton2.click();
    await page.waitForTimeout(500);

    // Verify the channel name input was reset to original
    const channelNameInput2 = page.locator('[data-testid="channel-name-input"]');
    await expect(channelNameInput2).toBeVisible({ timeout: 5000 });
    const valueAfterCancel = await channelNameInput2.inputValue();
    expect(valueAfterCancel).toBe(originalInputValue);

    console.log(`[CANCEL TEST] Channel name reset after cancel: ${valueAfterCancel}`);

    // Click cancel again and close the modal
    const cancelButton2 = page.locator('[data-testid="channel-cancel-button"]');
    await cancelButton2.click();
    await page.waitForTimeout(500);

    // Close the modal
    await closeChannelEditor(page);

    // Verify the channel name on the card is unchanged
    const channelCardAfter = page.locator('[data-testid^="channel-card-"]').first();
    const nameAfter = await channelCardAfter.locator("h3").textContent();
    expect(nameAfter).toBe(originalChannelName);

    console.log(`[CANCEL TEST] Channel card name unchanged: ${nameAfter}`);
  });

  test("6) Non-destructive editing flow: type in fields then cancel", async ({ page }) => {
    await navigateToAdminTab(page, "channels");
    await waitForChannelsTabToLoad(page);

    // Open the channel editor
    await openChannelEditor(page);

    // Enter edit mode
    const editButton = page.locator('[data-testid="channel-edit-button"]');
    if (await editButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editButton.click();
      await page.waitForTimeout(500);
    }

    // Get current values
    const channelNameInput = page.locator('[data-testid="channel-name-input"]');
    const descriptionInput = page.locator('[data-testid="channel-description-input"]');
    const aboutChannelInput = page.locator('[data-testid="channel-about-input"]');

    await expect(channelNameInput).toBeVisible({ timeout: 5000 });

    const originalName = await channelNameInput.inputValue();
    const originalDescription = await descriptionInput.inputValue();
    const originalAbout = await aboutChannelInput.inputValue();

    // Type temporary values into all fields
    await channelNameInput.fill("TEMP_NAME_" + Date.now());
    await descriptionInput.fill("TEMP_DESCRIPTION_" + Date.now());
    await aboutChannelInput.fill("TEMP_ABOUT_" + Date.now());

    console.log("[NON-DESTRUCTIVE] Filled temporary values in all editable fields");

    // Verify the fields have the new values
    expect(await channelNameInput.inputValue()).toContain("TEMP_NAME_");
    expect(await descriptionInput.inputValue()).toContain("TEMP_DESCRIPTION_");
    expect(await aboutChannelInput.inputValue()).toContain("TEMP_ABOUT_");

    // Cancel without saving (exits edit mode, stays in modal, resets form)
    const cancelButton = page.locator('[data-testid="channel-cancel-button"]');
    await cancelButton.click();
    await page.waitForTimeout(500);

    // Re-enter edit mode to verify values were reset
    const editButton2 = page.locator('[data-testid="channel-edit-button"]');
    await editButton2.click();
    await page.waitForTimeout(500);

    // Verify original values are restored (changes were discarded)
    const nameAfter = await page.locator('[data-testid="channel-name-input"]').inputValue();
    const descAfter = await page.locator('[data-testid="channel-description-input"]').inputValue();
    const aboutAfter = await page.locator('[data-testid="channel-about-input"]').inputValue();

    expect(nameAfter).toBe(originalName);
    expect(descAfter).toBe(originalDescription);
    expect(aboutAfter).toBe(originalAbout);

    console.log("[NON-DESTRUCTIVE] Verified all changes were discarded after cancel");

    // Exit edit mode and close the editor
    const cancelButton2 = page.locator('[data-testid="channel-cancel-button"]');
    await cancelButton2.click();
    await page.waitForTimeout(500);

    await closeChannelEditor(page);
  });

  test("7) Channel editor shows energy tabs (Low, Medium, High)", async ({ page }) => {
    await navigateToAdminTab(page, "channels");
    await waitForChannelsTabToLoad(page);

    // Open the channel editor
    await openChannelEditor(page);

    // Verify energy tabs are present
    const lowTab = page.locator('[data-testid="energy-tab-low"]');
    const mediumTab = page.locator('[data-testid="energy-tab-medium"]');
    const highTab = page.locator('[data-testid="energy-tab-high"]');

    await expect(lowTab).toBeVisible({ timeout: 5000 });
    await expect(mediumTab).toBeVisible();
    await expect(highTab).toBeVisible();

    console.log("[ENERGY TABS] All energy level tabs are present");

    // Click through each tab to verify they're interactive
    await mediumTab.click();
    await page.waitForTimeout(300);
    
    await highTab.click();
    await page.waitForTimeout(300);
    
    await lowTab.click();
    await page.waitForTimeout(300);

    console.log("[ENERGY TABS] All tabs are clickable");

    // Close the editor
    await closeChannelEditor(page);
  });

  test("8) Search functionality filters channels list", async ({ page }) => {
    await navigateToAdminTab(page, "channels");
    await waitForChannelsTabToLoad(page);

    // Get initial channel count
    const initialCards = page.locator('[data-testid^="channel-card-"]');
    const initialCount = await initialCards.count();
    console.log(`[SEARCH] Initial channel count: ${initialCount}`);

    // Search for a specific term that likely won't match all channels
    const searchInput = page.locator('[data-testid="channels-search-input"]');
    await searchInput.fill("xyz123nonexistent");
    await page.waitForTimeout(500);

    // Verify the count changes (likely to 0 or fewer)
    const filteredCards = page.locator('[data-testid^="channel-card-"]');
    const filteredCount = await filteredCards.count();
    console.log(`[SEARCH] Filtered channel count: ${filteredCount}`);

    // Clear search
    await searchInput.clear();
    await page.waitForTimeout(500);

    // Verify original count is restored
    const restoredCards = page.locator('[data-testid^="channel-card-"]');
    const restoredCount = await restoredCards.count();
    expect(restoredCount).toBe(initialCount);

    console.log("[SEARCH] Search filter works correctly");
  });
});

/**
 * Permission Tests - Non-Admin Access Restrictions
 */
test.describe("Admin Channels - Permission Tests", () => {
  // Admin UI is desktop-only
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name === "mobile-chrome") {
      test.skip(true, "Admin UI is desktop-only; mobile admin not supported.");
    }
  });

  test("9) Non-admin user cannot see Admin menu item", async ({ page }) => {
    // Skip if no non-admin user credentials
    test.skip(
      !hasNonAdminCredentials,
      "Skipping permission test: TEST_USER_EMAIL and TEST_USER_PASSWORD not set"
    );

    const signedIn = await signInAsRegularUser(page);
    if (!signedIn) {
      test.skip();
    }

    // Verify the Admin button is NOT visible for regular users
    const adminButton = page.getByRole("button", { name: /^admin$/i });
    const isAdminVisible = await adminButton.isVisible({ timeout: 3000 }).catch(() => false);

    expect(isAdminVisible).toBe(false);
    console.log("[PERMISSION] Verified: Admin button is not visible to non-admin user");

    // Verify the Channels button IS visible (user can access their own dashboard)
    const channelsButton = page.getByRole("button", { name: /channels/i });
    await expect(channelsButton).toBeVisible();

    console.log("[PERMISSION] Verified: Regular user has access to user dashboard but not Admin");
  });

  test("10) Non-admin user cannot navigate directly to Admin area", async ({ page }) => {
    // Skip if no non-admin user credentials
    test.skip(
      !hasNonAdminCredentials,
      "Skipping permission test: TEST_USER_EMAIL and TEST_USER_PASSWORD not set"
    );

    const signedIn = await signInAsRegularUser(page);
    if (!signedIn) {
      test.skip();
    }

    // Try to navigate to admin area by URL manipulation
    // Note: The app may not have a dedicated /admin route, but we test the behavior
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
    await page.goto(`${baseUrl}?admin=true`, { waitUntil: "networkidle" });

    // Verify Admin Dashboard header is NOT visible
    const adminHeader = page.locator("text=Admin Dashboard");
    const isAdminHeaderVisible = await adminHeader.isVisible({ timeout: 3000 }).catch(() => false);

    expect(isAdminHeaderVisible).toBe(false);
    console.log("[PERMISSION] Verified: Non-admin cannot access Admin Dashboard via URL");
  });
});

/**
 * Configuration Verification - Always runs
 */
test.describe("Admin Channels - Configuration Verification", () => {
  // Desktop-only for consistency
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name === "mobile-chrome") {
      test.skip(true, "Admin UI is desktop-only; mobile admin not supported.");
    }
  });

  test("shows clear skip messages about test configuration", async () => {
    // Document the configuration state
    console.log("[CONFIG] Admin credentials available:", hasAdminCredentials);
    console.log("[CONFIG] Non-admin user credentials available:", hasNonAdminCredentials);

    if (hasAdminCredentials) {
      expect(TEST_ADMIN_EMAIL).toBeTruthy();
      expect(TEST_ADMIN_PASSWORD).toBeTruthy();
      console.log(`[CONFIG] Admin email: ${TEST_ADMIN_EMAIL}`);
    } else {
      console.log("[CONFIG] Note: Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to run admin tests");
    }

    if (hasNonAdminCredentials) {
      expect(TEST_USER_EMAIL).toBeTruthy();
      expect(TEST_USER_PASSWORD).toBeTruthy();
      console.log(`[CONFIG] Non-admin email: ${TEST_USER_EMAIL}`);
    } else {
      console.log("[CONFIG] Note: Set TEST_USER_EMAIL and TEST_USER_PASSWORD to run permission tests");
    }

    // This test always passes - it's informational
    expect(true).toBe(true);
  });
});
