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
 * Helper to open the "Add from Library" modal and wait for library to load
 */
async function openLibraryModal(page: Page): Promise<void> {
  const openLibraryButton = page.locator('[data-testid="channel-library-open-button"]');
  await expect(openLibraryButton).toBeVisible({ timeout: 5000 });
  await openLibraryButton.click();

  // Wait for library modal to appear
  const libraryModal = page.locator('[data-testid="channel-library-modal"]');
  await expect(libraryModal).toBeVisible({ timeout: 10000 });

  // Wait for the library to finish loading (placeholder changes from "Loading library...")
  // The search input placeholder shows "Loading library..." while loading
  const searchInput = libraryModal.locator('[data-testid="channel-library-search-input"]');
  await expect(searchInput).toBeVisible({ timeout: 5000 });
  
  // Wait for loading to complete - the placeholder will change when done
  // Also wait for any loading overlay to disappear
  await page.waitForFunction(() => {
    const input = document.querySelector('[data-testid="channel-library-search-input"]') as HTMLInputElement;
    return input && !input.placeholder.includes('Loading library');
  }, { timeout: 30000 });
  
  console.log("[LIBRARY MODAL] Library loaded and ready for search");
}

/**
 * Helper to search in library modal and wait for results
 * Returns the locator for track rows scoped to the modal
 */
async function searchLibraryAndWaitForResults(page: Page, searchTerm: string): Promise<{ modal: ReturnType<Page['locator']>, trackRows: ReturnType<Page['locator']> }> {
  const modal = page.locator('[data-testid="channel-library-modal"]');
  const searchInput = modal.locator('[data-testid="channel-library-search-input"]');
  
  // Fill and trigger search
  await searchInput.fill(searchTerm);
  await searchInput.press('Enter');
  
  // Wait for search results to appear (tracks load from the already-loaded libraryTracks)
  // Give the UI time to filter and render
  await page.waitForTimeout(2000);
  
  // Return locators scoped to the modal
  const trackRows = modal.locator('[data-testid="channel-library-track-row"]');
  return { modal, trackRows };
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
    // Increase timeout for this test due to large library
    test.setTimeout(60000);
    
    await navigateToAdminTab(page, "channels");
    await waitForChannelsToLoad(page);
    await openFirstChannelEditor(page);
    await openLibraryModal(page);

    // Search for a specific term that returns manageable results
    // Using "focus" instead of "e" to avoid 10,000+ DOM elements
    const { trackRows } = await searchLibraryAndWaitForResults(page, "focus");
    
    const countAfterSearch = await trackRows.count();
    console.log(`[SEARCH] Track rows after search for 'focus': ${countAfterSearch}`);

    // HARD FAILURE: The library should have tracks containing "focus"
    // If we find 0, something is broken (not skipping!)
    expect(countAfterSearch, "Expected tracks containing 'focus' in library - library should have data").toBeGreaterThan(0);
    
    console.log(`[SEARCH] Found ${countAfterSearch} tracks - search is working correctly`);

    await closeLibraryModal(page);
    await closeChannelEditor(page);
  });

  test("3) Track preview buttons are wired", async ({ page }) => {
    // Increase timeout for this test
    test.setTimeout(60000);
    
    await navigateToAdminTab(page, "channels");
    await waitForChannelsToLoad(page);
    await openFirstChannelEditor(page);
    await openLibraryModal(page);

    // Search to get tracks - use specific term for manageable results
    const { modal, trackRows } = await searchLibraryAndWaitForResults(page, "ambient");
    
    const trackCount = await trackRows.count();
    console.log(`[PREVIEW] Track count: ${trackCount}`);

    // HARD FAILURE: We expect tracks to exist for 'ambient'
    expect(trackCount, "Expected tracks containing 'ambient' in library for preview test").toBeGreaterThan(0);

    // Get the first preview button (scoped to modal)
    const previewButton = modal.locator('[data-testid="channel-library-preview-button"]').first();
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
    // Increase timeout for this test
    test.setTimeout(60000);
    
    await navigateToAdminTab(page, "channels");
    await waitForChannelsToLoad(page);
    await openFirstChannelEditor(page);
    await openLibraryModal(page);

    // Search to get tracks - use specific term for manageable results
    const { modal, trackRows } = await searchLibraryAndWaitForResults(page, "piano");
    
    const trackCount = await trackRows.count();
    console.log(`[ADD TRACK] Track count: ${trackCount}`);

    // HARD FAILURE: We expect tracks to exist for 'piano'
    expect(trackCount, "Expected tracks containing 'piano' in library for add track test").toBeGreaterThan(0);

    // Verify UI elements exist (scoped to modal)
    const addButton = modal.locator('[data-testid="channel-library-add-button"]').first();
    const hasAddButton = await addButton.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[ADD TRACK] Add button visible: ${hasAddButton}`);

    const firstRow = trackRows.first();
    const checkbox = firstRow.locator('input[type="checkbox"]');
    const hasCheckbox = await checkbox.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[ADD TRACK] Checkbox visible: ${hasCheckbox}`);

    // Verify the structure is correct
    expect(hasAddButton || hasCheckbox, "Expected add button or checkbox to be visible").toBe(true);
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
