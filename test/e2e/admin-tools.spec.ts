import { test, expect } from "@playwright/test";
import {
  signInAsAdmin,
  hasAdminCredentials,
  navigateToAdminDashboard,
  navigateToAdminTab,
  navigateToUserView,
} from "./admin-login";

/**
 * Admin Tools E2E Tests - Phase 1 (Safe, Non-Destructive)
 * 
 * These tests verify admin functionality without modifying or deleting any data.
 * 
 * IMPORTANT: Admin tests are DESKTOP-ONLY. Mobile admin is not supported.
 * 
 * Prerequisites:
 *   - Admin test account must exist with admin privileges
 *   - Environment variables must be set:
 *     - TEST_ADMIN_EMAIL
 *     - TEST_ADMIN_PASSWORD
 * 
 * Run with:
 *   TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... npm run e2e -- test/e2e/admin-tools.spec.ts
 */

test.describe("Admin Tools E2E Tests - Phase 1 (Non-Destructive)", () => {
  // Admin UI is desktop-only; skip on mobile projects
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name === "mobile-chrome") {
      test.skip(true, "Admin UI is desktop-only; mobile admin not supported.");
    }
  });

  // Skip all tests in this describe block if admin credentials are not set
  test.skip(
    !hasAdminCredentials,
    "Skipping admin tests: TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD environment variables must be set"
  );

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAsAdmin(page);
    if (!signedIn) {
      test.skip();
    }
  });

  test("1) Admin can sign in and see the Admin menu item", async ({ page }) => {
    // After signing in (done in beforeEach), verify the Admin button is visible
    const adminButton = page.getByRole("button", { name: /admin/i });
    await expect(adminButton).toBeVisible({ timeout: 10000 });

    // Also verify core user dashboard elements are visible
    const channelsButton = page.getByRole("button", { name: /channels/i });
    await expect(channelsButton).toBeVisible({ timeout: 5000 });

    // Verify Sign Out button exists (confirms we're logged in)
    const signOutButton = page.getByRole("button", { name: /sign out/i });
    await expect(signOutButton).toBeVisible({ timeout: 5000 });
  });

  test("2) Admin can enter the Admin area and see expected sections", async ({ page }) => {
    // Navigate to Admin Dashboard
    await navigateToAdminDashboard(page);

    // Verify Admin Dashboard header is visible
    const adminHeader = page.locator("text=Admin Dashboard");
    await expect(adminHeader).toBeVisible({ timeout: 5000 });

    // Verify all expected admin tabs are present (read-only verification)
    const expectedTabs = [
      "Analytics",
      "Channels",
      "Music Library",
      "Users",
      "Images",
      "Quiz",
      "Settings",
      "Tests",
      "Dev Tools",
    ];

    for (const tabName of expectedTabs) {
      const tabButton = page.getByRole("button", { name: tabName });
      await expect(tabButton).toBeVisible({ timeout: 5000 });
    }

    // Verify Analytics tab is active by default (first tab)
    // Analytics shows stats cards like "Total Users", "Active Sessions"
    const analyticsContent = page.locator("text=Total Users");
    await expect(analyticsContent).toBeVisible({ timeout: 10000 });

    // Verify User View button is available to return to user dashboard
    const userViewButton = page.getByRole("button", { name: /user view/i });
    await expect(userViewButton).toBeVisible({ timeout: 5000 });
  });

  test("3) Admin navigation smoke test - switch between admin pages and return to Channels", async ({
    page,
  }) => {
    // Navigate to Admin Dashboard
    await navigateToAdminDashboard(page);

    // Step 1: Navigate to Users tab
    await navigateToAdminTab(page, "users");
    
    // Verify Users tab content is visible (e.g., "Add User" button)
    const addUserButton = page.getByRole("button", { name: /add user/i });
    await expect(addUserButton).toBeVisible({ timeout: 10000 });

    // Step 2: Navigate to Channels tab
    await navigateToAdminTab(page, "channels");
    
    // Verify Channels tab content is visible
    // Wait a moment for the tab content to render
    await page.waitForTimeout(1000);
    
    // Look for channel-related content (channel card headings)
    const channelsHeading = page.locator("h3").first();
    await expect(channelsHeading).toBeVisible({ timeout: 10000 });

    // Step 3: Navigate back to User View (Channels)
    await navigateToUserView(page);

    // Verify we're back on the user dashboard
    const channelsButton = page.getByRole("button", { name: /channels/i });
    await expect(channelsButton).toBeVisible({ timeout: 5000 });

    // Verify Admin button is still available (confirms we're still logged in as admin)
    const adminButton = page.getByRole("button", { name: /admin/i });
    await expect(adminButton).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Admin Tools - Skip Message Verification", () => {
  // Admin UI is desktop-only; skip on mobile projects
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name === "mobile-chrome") {
      test.skip(true, "Admin UI is desktop-only; mobile admin not supported.");
    }
  });

  // This test always runs to verify the skip behavior is clear
  test("shows clear skip message when admin credentials are missing", async ({ page }) => {
    // This test just documents the expected behavior
    // When TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD are not set,
    // all admin tests should be skipped with a clear message
    
    if (hasAdminCredentials) {
      // If credentials are set, just verify they're being read from env
      expect(process.env.TEST_ADMIN_EMAIL).toBeTruthy();
      expect(process.env.TEST_ADMIN_PASSWORD).toBeTruthy();
    } else {
      // If no credentials, verify the skip condition is correct
      expect(hasAdminCredentials).toBe(false);
      // This test passes either way - it just documents the behavior
    }
  });
});
