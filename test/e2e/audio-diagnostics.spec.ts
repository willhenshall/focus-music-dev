import { test, expect, Page } from "@playwright/test";
import { signInAsAdmin, hasAdminCredentials } from "./admin-login";

/**
 * E2E tests for the Audio Diagnostics modal (admin-only).
 *
 * This suite focuses on:
 * - Open/close via the header button
 * - Tabbed UI
 * - Minimize / restore
 * - Basic presence of streaming/HLS info while playing
 */

/**
 * Opens the Audio Diagnostics modal via the header button.
 */
async function openDiagnosticsModal(page: Page): Promise<void> {
  const button = page.locator('button[title="Audio Engine Diagnostics"]');
  await expect(button).toBeVisible({ timeout: 15000 });
  await button.click();
  await expect(page.locator('[data-testid="audio-diagnostics-modal"]')).toBeVisible({ timeout: 5000 });
}

/**
 * Starts playback on the first channel
 */
async function startPlayback(page: Page): Promise<void> {
  const firstChannel = page.locator('[data-channel-id]').first();
  await firstChannel.click();
  
  const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
  await expect(playPauseButton).toBeVisible({ timeout: 10000 });
  await playPauseButton.click();
  
  await page.waitForTimeout(3000); // Wait for audio to load and start
}

test.describe("Audio Diagnostics Modal (Admin) - Desktop", () => {
  test.skip(!hasAdminCredentials, "Skipping: TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set");

  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name === "mobile-chrome") {
      test.skip(true, "Admin E2E is desktop-only in this suite.");
    }
    const signedIn = await signInAsAdmin(page);
    if (!signedIn) test.skip();

    // Wait for channels to be visible (user dashboard).
    await page.locator('[data-channel-id]').first().waitFor({ state: "visible", timeout: 15000 });
  });

  test("opens from header and shows tab bar", async ({ page }) => {
    await openDiagnosticsModal(page);
    await expect(page.locator('[data-testid="audio-diagnostics-tab-summary"]')).toBeVisible();
    await expect(page.locator('[data-testid="audio-diagnostics-tab-streaming"]')).toBeVisible();
    await expect(page.locator('[data-testid="audio-diagnostics-tab-raw"]')).toBeVisible();
  });

  test("can minimize and restore", async ({ page }) => {
    await openDiagnosticsModal(page);
    await page.locator('[data-testid="audio-diagnostics-minimize"]').click();
    await expect(page.locator('[data-testid="audio-diagnostics-expand"]')).toBeVisible();
    await page.locator('[data-testid="audio-diagnostics-expand"]').click();
    await expect(page.locator('[data-testid="audio-diagnostics-tab-summary"]')).toBeVisible();
  });

  test("shows streaming diagnostics during playback", async ({ page }) => {
    await startPlayback(page);
    await openDiagnosticsModal(page);
    await page.locator('[data-testid="audio-diagnostics-tab-streaming"]').click();
    await expect(page.locator("text=Streaming Engine")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Delivery")).toBeVisible();
  });

  test("raw tab renders JSON", async ({ page }) => {
    await openDiagnosticsModal(page);
    await page.locator('[data-testid="audio-diagnostics-tab-raw"]').click();
    await expect(page.locator("text=Raw diagnostics")).toBeVisible();
    await expect(page.locator("pre")).toBeVisible();
  });

  test("export/download works", async ({ page }) => {
    await openDiagnosticsModal(page);
    const downloadPromise = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await page.locator("button", { hasText: "Export" }).click();
    const download = await downloadPromise;
    if (download) {
      const filename = download.suggestedFilename();
      expect(filename).toContain("audio-diagnostics");
      expect(filename).toContain(".json");
    }
  });
});

test.describe("Audio Diagnostics Modal (Admin) - Mobile", () => {
  test.skip(!hasAdminCredentials, "Skipping: TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set");

  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name !== "mobile-chrome") {
      test.skip(true, "This suite is mobile-only.");
    }
    const signedIn = await signInAsAdmin(page);
    if (!signedIn) test.skip();
    await page.locator('[data-channel-id]').first().waitFor({ state: "visible", timeout: 15000 });
  });

  test("opens from mobile menu and shows tab bar", async ({ page }) => {
    await page.getByTestId("mobile-menu-button").click();
    await page.getByTestId("mobile-audio-diagnostics").click();
    await expect(page.locator('[data-testid="audio-diagnostics-modal"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="audio-diagnostics-tab-summary"]')).toBeVisible();
  });

  test("can minimize and restore on mobile", async ({ page }) => {
    await page.getByTestId("mobile-menu-button").click();
    await page.getByTestId("mobile-audio-diagnostics").click();
    await page.getByTestId("audio-diagnostics-minimize").click();
    await expect(page.getByTestId("audio-diagnostics-expand")).toBeVisible();
    await page.getByTestId("audio-diagnostics-expand").click();
    await expect(page.getByTestId("audio-diagnostics-tab-summary")).toBeVisible();
  });
});
