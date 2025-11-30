import { test, expect } from "@playwright/test";

test.describe("Mobile Navigation", () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

  test.beforeEach(async ({ page }) => {
    // Bypass the password gate
    await page.goto("/");

    // Check if password form is shown
    const passwordInput = page.locator('input[type="password"]');
    if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await passwordInput.fill("magic");
      await page.click('button[type="submit"]');
      await page.waitForURL("/", { timeout: 5000 });
    }
  });

  test("header is visible on mobile", async ({ page }) => {
    const header = page.locator("header");
    await expect(header).toBeVisible();
  });

  test("navigation buttons remain accessible on mobile", async ({ page }) => {
    // On the landing page, buttons should still be visible on mobile
    // The landing page uses a horizontal layout that may wrap on mobile
    const signInButton = page.getByRole("button", { name: /sign in/i });
    const getStartedButton = page.getByRole("button", { name: /get started/i });

    // At least one of these should be visible/clickable
    const signInVisible = await signInButton.isVisible().catch(() => false);
    const getStartedVisible = await getStartedButton.isVisible().catch(() => false);

    expect(signInVisible || getStartedVisible).toBe(true);
  });

  test("hero content is visible on mobile", async ({ page }) => {
    const heading = page.getByRole("heading", { name: /music that matches/i });
    await expect(heading).toBeVisible();
  });

  test("page is scrollable on mobile", async ({ page }) => {
    // Scroll down and verify content changes
    const initialScrollY = await page.evaluate(() => window.scrollY);

    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(100);

    const newScrollY = await page.evaluate(() => window.scrollY);
    expect(newScrollY).toBeGreaterThan(initialScrollY);
  });

  test("touch interactions work on mobile", async ({ page }) => {
    // Tap the Get Started button
    const ctaButton = page.getByRole("button", { name: /start your free assessment/i });

    if (await ctaButton.isVisible()) {
      await ctaButton.tap();

      // Should navigate to quiz or show quiz modal
      // Wait for some UI change
      await page.waitForTimeout(500);

      // Verify the page has changed (either URL or visible content)
      const quizVisible = await page
        .locator("text=/quiz|question|profile/i")
        .first()
        .isVisible()
        .catch(() => false);

      // The button tap should trigger some response
      expect(quizVisible).toBe(true);
    }
  });
});
