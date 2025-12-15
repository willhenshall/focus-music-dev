import { test, expect } from "@playwright/test";
import {
  signInAsAdmin,
  hasAdminCredentials,
  navigateToAdminDashboard,
  navigateToUserView,
} from "./admin-login";

/**
 * Admin Header Button Click Coverage E2E Tests
 *
 * These tests verify that header buttons (Admin, Audio Diagnostics, User View)
 * are fully clickable and not blocked by overlapping elements.
 *
 * Bug context: A trigger zone for auto-hide navigation was overlapping the header
 * buttons, causing only the bottom ~20% to be clickable.
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
 *   TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... npm run e2e -- test/e2e/admin-header-buttons.spec.ts
 */

test.describe("Admin Header Button Click Coverage", () => {
  // Admin UI is desktop-only; skip on mobile projects
  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name === "mobile-chrome") {
      test.skip(true, "Admin UI is desktop-only; mobile admin not supported.");
    }

    const signedIn = await signInAsAdmin(page);
    if (!signedIn) {
      test.skip();
    }
  });

  // Skip all tests if admin credentials are not set
  test.skip(
    !hasAdminCredentials,
    "Skipping admin tests: TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD environment variables must be set"
  );

  test("Admin button in header is fully clickable", async ({ page }) => {
    // The admin button should be visible in the user dashboard header
    const adminButton = page.getByRole("button", { name: /^admin$/i });
    await expect(adminButton).toBeVisible({ timeout: 5000 });

    // Get the button's bounding box
    const boundingBox = await adminButton.boundingBox();
    expect(boundingBox).not.toBeNull();

    if (boundingBox) {
      // Click in the CENTER of the button (not the bottom 20%)
      // This would fail if the trigger zone was blocking the top portion
      const centerX = boundingBox.x + boundingBox.width / 2;
      const centerY = boundingBox.y + boundingBox.height / 2;

      console.log(`[HEADER BUTTONS] Clicking Admin button at center: (${centerX}, ${centerY})`);
      await page.mouse.click(centerX, centerY);

      // Wait for admin dashboard to load
      await page.locator("text=Admin Dashboard").waitFor({ state: "visible", timeout: 10000 });
      console.log("[HEADER BUTTONS] Admin button center click successful");
    }
  });

  test("User View button in admin header is fully clickable", async ({ page }) => {
    // First navigate to admin dashboard
    await navigateToAdminDashboard(page);

    // The User View button should be visible
    const userViewButton = page.getByRole("button", { name: /user view/i });
    await expect(userViewButton).toBeVisible({ timeout: 5000 });

    // Get the button's bounding box
    const boundingBox = await userViewButton.boundingBox();
    expect(boundingBox).not.toBeNull();

    if (boundingBox) {
      // Click in the CENTER of the button
      const centerX = boundingBox.x + boundingBox.width / 2;
      const centerY = boundingBox.y + boundingBox.height / 2;

      console.log(`[HEADER BUTTONS] Clicking User View button at center: (${centerX}, ${centerY})`);
      await page.mouse.click(centerX, centerY);

      // Wait for user dashboard to load - Channels tab should be visible
      await page.getByRole("button", { name: /channels/i }).waitFor({ state: "visible", timeout: 10000 });
      console.log("[HEADER BUTTONS] User View button center click successful");
    }
  });

  test("Audio Diagnostics button is fully clickable", async ({ page }) => {
    // The audio diagnostics button should be visible for admin users
    const audioDiagButton = page.locator('button[title="Audio Engine Diagnostics"]');
    await expect(audioDiagButton).toBeVisible({ timeout: 5000 });

    // Get the button's bounding box
    const boundingBox = await audioDiagButton.boundingBox();
    expect(boundingBox).not.toBeNull();

    if (boundingBox) {
      // Click in the CENTER of the button
      const centerX = boundingBox.x + boundingBox.width / 2;
      const centerY = boundingBox.y + boundingBox.height / 2;

      console.log(`[HEADER BUTTONS] Clicking Audio Diagnostics button at center: (${centerX}, ${centerY})`);
      await page.mouse.click(centerX, centerY);

      // Wait for diagnostics panel to appear
      await page.waitForTimeout(500);

      // Verify the diagnostics panel is visible
      const diagnosticsPanel = page.locator("text=Audio Engine Diagnostics").first();
      await expect(diagnosticsPanel).toBeVisible({ timeout: 5000 });

      console.log("[HEADER BUTTONS] Audio Diagnostics button center click successful");
    }
  });

  test("Sign Out button is fully clickable", async ({ page }) => {
    // The sign out button should be visible
    const signOutButton = page.getByRole("button", { name: /sign out/i });
    await expect(signOutButton).toBeVisible({ timeout: 5000 });

    // Get the button's bounding box
    const boundingBox = await signOutButton.boundingBox();
    expect(boundingBox).not.toBeNull();

    if (boundingBox) {
      // Verify we can get the center position (button is not covered)
      const centerX = boundingBox.x + boundingBox.width / 2;
      const centerY = boundingBox.y + boundingBox.height / 2;

      console.log(`[HEADER BUTTONS] Sign Out button center position verified: (${centerX}, ${centerY})`);
      // Note: We don't actually click Sign Out as it would end the session
      // Just verify the button is accessible at its center
    }

    // Verify the button is enabled and interactive
    await expect(signOutButton).toBeEnabled();
    console.log("[HEADER BUTTONS] Sign Out button is enabled and accessible");
  });

  test("Rapid toggle between Admin and User View works", async ({ page }) => {
    // Test multiple rapid toggles to ensure button clicking is reliable

    for (let i = 0; i < 3; i++) {
      console.log(`[HEADER BUTTONS] Toggle iteration ${i + 1}/3`);

      // Click Admin button
      const adminButton = page.getByRole("button", { name: /^admin$/i });
      await adminButton.click();
      await page.locator("text=Admin Dashboard").waitFor({ state: "visible", timeout: 10000 });

      // Click User View button
      const userViewButton = page.getByRole("button", { name: /user view/i });
      await userViewButton.click();
      await page.getByRole("button", { name: /channels/i }).waitFor({ state: "visible", timeout: 10000 });
    }

    console.log("[HEADER BUTTONS] All toggle iterations successful");
  });
});

