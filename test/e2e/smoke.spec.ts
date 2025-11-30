import { test, expect } from "@playwright/test";

test.describe("Smoke Tests", () => {
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

  test("homepage loads successfully", async ({ page }) => {
    await expect(page).toHaveTitle(/focus/i);
  });

  test("header is visible with logo", async ({ page }) => {
    const header = page.locator("header");
    await expect(header).toBeVisible();

    // Check for focus.music logo text
    const logo = page.locator("header").getByText("focus");
    await expect(logo).toBeVisible();
  });

  test("main navigation buttons are present", async ({ page }) => {
    // Sign In button
    const signInButton = page.getByRole("button", { name: /sign in/i });
    await expect(signInButton).toBeVisible();

    // Get Started button
    const getStartedButton = page.getByRole("button", { name: /get started/i });
    await expect(getStartedButton).toBeVisible();
  });

  test("hero section displays correctly", async ({ page }) => {
    // Main heading
    const heading = page.getByRole("heading", { name: /music that matches/i });
    await expect(heading).toBeVisible();

    // Call-to-action button
    const ctaButton = page.getByRole("button", { name: /start your free assessment/i });
    await expect(ctaButton).toBeVisible();
  });
});
