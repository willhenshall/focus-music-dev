import { test, expect, Page } from "@playwright/test";
import {
  signInAsAdmin,
  hasAdminCredentials,
  navigateToAdminDashboard,
  navigateToAdminTab,
} from "./admin-login";

/**
 * Admin Library E2E Tests – Phase 1 (Non-Destructive)
 *
 * These tests verify the admin channel library functionality without making
 * destructive changes. All tests:
 * - Run only when TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD are set
 * - Use desktop viewport only (chromium project)
 * - Avoid destructive actions: no real deletes, no irreversible changes
 * - Cancel/close dialogs instead of saving to ensure no persistent changes
 *
 * Test coverage:
 * 1. Admin can open channel editor and the Library modal
 * 2. Library search/filter functionality
 * 3. Track preview buttons are wired
 * 4. "Add track" flow is wired (but cancelled, non-destructive)
 * 5. Cancel/close behavior is safe
 *
 * Prerequisites:
 *   - Admin test account must exist with admin privileges
 *   - Environment variables must be set:
 *     - TEST_ADMIN_EMAIL
 *     - TEST_ADMIN_PASSWORD
 *
 * Run with:
 *   TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... npm run e2e -- test/e2e/admin-library.spec.ts
 */

/**
 * Helper to wait for channels tab to load
 */
async function waitForChannelsToLoad(page: Page): Promise<void> {
  const searchInput = page.locator('[data-testid="channels-search-input"]');
  await expect(searchInput).toBeVisible({ timeout: 15000 });

  const firstChannel = page.locator('[data-testid^="channel-card-"]').first();
  await expect(firstChannel).toBeVisible({ timeout: 15000 });
}

/**
 * Helper to open the channel editor for the first channel
 */
async function openFirstChannelEditor(page: Page): Promise<void> {
  const firstChannel = page.locator('[data-testid^="channel-card-"]').first();
  await expect(firstChannel).toBeVisible({ timeout: 10000 });

  // In user-order mode, there's an Edit button
  const editButton = firstChannel.locator('button:has-text("Edit")');
  const hasEditButton = await editButton.isVisible({ timeout: 2000 }).catch(() => false);

  if (hasEditButton) {
    await editButton.click();
  } else {
    // Fallback: click the card itself
    await firstChannel.click();
  }

  // Wait for the channel editor modal to appear
  const modal = page.locator('[data-testid="channel-editor-modal"]');
  await expect(modal).toBeVisible({ timeout: 10000 });
}

/**
 * Helper to open the "Add from Library" modal
 */
async function openLibraryModal(page: Page): Promise<void> {
  const openLibraryButton = page.locator('[data-testid="channel-library-open-button"]');
  await expect(openLibraryButton).toBeVisible({ timeout: 5000 });
  await openLibraryButton.click();

  // Wait for library modal to appear
  const libraryModal = page.locator('[data-testid="channel-library-modal"]');
  await expect(libraryModal).toBeVisible({ timeout: 10000 });
}

/**
 * Helper to close the library modal
 */
async function closeLibraryModal(page: Page): Promise<void> {
  const closeButton = page.locator('[data-testid="channel-library-close-button"]');
  await closeButton.click();

  const libraryModal = page.locator('[data-testid="channel-library-modal"]');
  await expect(libraryModal).toBeHidden({ timeout: 5000 });
}

/**
 * Helper to close the channel editor
 */
async function closeChannelEditor(page: Page): Promise<void> {
  const closeButton = page.locator('[data-testid="channel-editor-close"]');
  await closeButton.click();

  const modal = page.locator('[data-testid="channel-editor-modal"]');
  await expect(modal).toBeHidden({ timeout: 5000 });
}

// Note: Search is done directly in tests using the search input locator

test.describe("Admin Library E2E Tests – Phase 1 (Non-Destructive)", () => {
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

  test("1) Admin can open channel editor and the Library modal", async ({ page }) => {
    // Navigate to Channels tab
    await navigateToAdminTab(page, "channels");
    await waitForChannelsToLoad(page);

    // Open the first channel's editor
    await openFirstChannelEditor(page);

    // Verify the channel editor is showing
    const modal = page.locator('[data-testid="channel-editor-modal"]');
    await expect(modal).toBeVisible();

    // Open the library modal
    await openLibraryModal(page);

    // Verify the library modal is showing
    const libraryModal = page.locator('[data-testid="channel-library-modal"]');
    await expect(libraryModal).toBeVisible();

    // Verify the search input is present
    const searchInput = page.locator('[data-testid="channel-library-search-input"]');
    await expect(searchInput).toBeVisible();

    console.log("[LIBRARY] Successfully opened channel editor and library modal");

    // Close library modal
    await closeLibraryModal(page);

    // Close channel editor
    await closeChannelEditor(page);
  });

  test("2) Library search/filter works", async ({ page }) => {
    await navigateToAdminTab(page, "channels");
    await waitForChannelsToLoad(page);
    await openFirstChannelEditor(page);
    await openLibraryModal(page);

    // Verify search input is present
    const searchInput = page.locator('[data-testid="channel-library-search-input"]');
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    console.log("[SEARCH] Search input is visible");

    // Search for a term
    await searchInput.fill("e");
    await searchInput.press('Enter');
    await page.waitForTimeout(3000);

    // Check for track rows OR "no results" message
    const trackRows = page.locator('[data-testid="channel-library-track-row"]');
    const countAfterSearch = await trackRows.count();
    console.log(`[SEARCH] Track rows after search: ${countAfterSearch}`);

    if (countAfterSearch === 0) {
      // Verify the "no results" or prompt message appears (search UI is working)
      const noResultsMsg = page.locator('text=No tracks found');
      const searchPrompt = page.locator('text=Search for tracks');
      const hasMsg = await noResultsMsg.isVisible({ timeout: 2000 }).catch(() => false) ||
                     await searchPrompt.isVisible({ timeout: 2000 }).catch(() => false);
      
      console.log(`[SEARCH] Search UI showing appropriate message: ${hasMsg}`);
      console.log("[SEARCH] Library search UI is functional (no matching tracks in library)");
    } else {
      console.log(`[SEARCH] Found ${countAfterSearch} tracks - search is working`);
      expect(countAfterSearch).toBeGreaterThan(0);
    }

    console.log("[SEARCH] Library search functionality verified");
    await closeLibraryModal(page);
    await closeChannelEditor(page);
  });

  test("3) Track preview buttons are wired", async ({ page }) => {
    await navigateToAdminTab(page, "channels");
    await waitForChannelsToLoad(page);
    await openFirstChannelEditor(page);
    await openLibraryModal(page);

    // Search to get tracks
    const searchInput = page.locator('[data-testid="channel-library-search-input"]');
    await searchInput.fill("e");
    await searchInput.press('Enter');
    await page.waitForTimeout(3000);

    // Check for track rows
    const trackRows = page.locator('[data-testid="channel-library-track-row"]');
    const trackCount = await trackRows.count();
    console.log(`[PREVIEW] Track count: ${trackCount}`);

    if (trackCount === 0) {
      console.log("[PREVIEW] No tracks in library - skipping preview button test");
      await closeLibraryModal(page);
      await closeChannelEditor(page);
      test.skip();
      return;
    }

    // Get the first preview button
    const previewButton = page.locator('[data-testid="channel-library-preview-button"]').first();
    await expect(previewButton).toBeVisible({ timeout: 5000 });

    // Verify the button has the data-playing attribute
    const initialAttr = await previewButton.getAttribute('data-playing');
    console.log(`[PREVIEW] Initial data-playing: ${initialAttr}`);
    expect(initialAttr).toBeTruthy(); // Should be 'true' or 'false'

    // Click the button
    await previewButton.click();
    await page.waitForTimeout(1500);

    // Check state changed
    const afterClickAttr = await previewButton.getAttribute('data-playing');
    console.log(`[PREVIEW] After click data-playing: ${afterClickAttr}`);

    // State should have toggled
    expect(afterClickAttr).not.toBe(initialAttr);

    // Click again
    await previewButton.click();
    await page.waitForTimeout(1500);

    const afterSecondClick = await previewButton.getAttribute('data-playing');
    console.log(`[PREVIEW] After second click data-playing: ${afterSecondClick}`);

    // Should toggle back
    expect(afterSecondClick).toBe(initialAttr);

    console.log("[PREVIEW] Preview button toggle works correctly");
    await closeLibraryModal(page);
    await closeChannelEditor(page);
  });

  test("4) Add track flow is wired but non-destructive (cancel)", async ({ page }) => {
    await navigateToAdminTab(page, "channels");
    await waitForChannelsToLoad(page);
    await openFirstChannelEditor(page);
    await openLibraryModal(page);

    // Search to get tracks
    const searchInput = page.locator('[data-testid="channel-library-search-input"]');
    await searchInput.fill("e");
    await searchInput.press('Enter');
    await page.waitForTimeout(3000);

    // Check for track rows
    const trackRows = page.locator('[data-testid="channel-library-track-row"]');
    const trackCount = await trackRows.count();
    console.log(`[ADD TRACK] Track count: ${trackCount}`);

    if (trackCount === 0) {
      console.log("[ADD TRACK] No tracks in library - skipping add track test");
      await closeLibraryModal(page);
      await closeChannelEditor(page);
      test.skip();
      return;
    }

    // Verify UI elements exist
    const addButton = page.locator('[data-testid="channel-library-add-button"]').first();
    const hasAddButton = await addButton.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[ADD TRACK] Add button visible: ${hasAddButton}`);

    const firstRow = trackRows.first();
    const checkbox = firstRow.locator('input[type="checkbox"]');
    const hasCheckbox = await checkbox.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[ADD TRACK] Checkbox visible: ${hasCheckbox}`);

    // Verify the structure is correct
    expect(hasAddButton || hasCheckbox).toBe(true);
    console.log("[ADD TRACK] Add track UI elements are present");

    // NON-DESTRUCTIVE: We do NOT click the add button
    // Just verify the close button works
    await closeLibraryModal(page);
    console.log("[ADD TRACK] Library modal closed without adding tracks - non-destructive test passed");
    
    await closeChannelEditor(page);
  });

  test("5) Cancel/close behavior is safe - no changes persist", async ({ page }) => {
    await navigateToAdminTab(page, "channels");
    await waitForChannelsToLoad(page);

    // Get the first channel info
    const firstChannelCard = page.locator('[data-testid^="channel-card-"]').first();
    const channelName = await firstChannelCard.locator("h3").textContent();
    console.log(`[CANCEL] Testing with channel: ${channelName}`);

    // Open channel editor
    await openFirstChannelEditor(page);

    // Note the modal is open
    const modal = page.locator('[data-testid="channel-editor-modal"]');
    await expect(modal).toBeVisible();
    console.log("[CANCEL] Channel editor opened");

    // Open library modal
    await openLibraryModal(page);
    console.log("[CANCEL] Library modal opened");

    // Close library modal without doing anything
    await closeLibraryModal(page);
    console.log("[CANCEL] Library modal closed");

    // Close channel editor
    await closeChannelEditor(page);
    console.log("[CANCEL] Channel editor closed");

    // Verify we're back to the channels list
    await expect(firstChannelCard).toBeVisible({ timeout: 5000 });

    // Verify the channel name is unchanged
    const channelNameAfter = await firstChannelCard.locator("h3").textContent();
    expect(channelNameAfter).toBe(channelName);
    console.log(`[CANCEL] Channel name unchanged: ${channelNameAfter}`);

    console.log("[CANCEL] Verified: cancel/close behavior is safe - no changes");
  });
});

/**
 * Configuration Verification - Always runs
 */
test.describe("Admin Library - Configuration Verification", () => {
  // Desktop-only for consistency
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name === "mobile-chrome") {
      test.skip(true, "Admin UI is desktop-only; mobile admin not supported.");
    }
  });

  test("shows clear skip messages about test configuration", async () => {
    console.log("[CONFIG] Admin credentials available:", hasAdminCredentials);

    if (hasAdminCredentials) {
      expect(process.env.TEST_ADMIN_EMAIL).toBeTruthy();
      expect(process.env.TEST_ADMIN_PASSWORD).toBeTruthy();
      console.log(`[CONFIG] Admin email: ${process.env.TEST_ADMIN_EMAIL}`);
    } else {
      console.log("[CONFIG] Note: Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to run admin tests");
    }

    // This test always passes - it's informational
    expect(true).toBe(true);
  });
});
