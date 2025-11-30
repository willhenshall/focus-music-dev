import { Page } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

/**
 * Logs into the Focus Music app by entering the password gate.
 * Call this at the start of each test or in a beforeEach hook.
 */
export async function login(page: Page): Promise<void> {
  await page.goto(baseUrl);

  // Fill the password field
  await page.getByLabel("Password").fill("magic");

  // Click the Continue button
  await page.getByRole("button", { name: /continue/i }).click();

  // Wait for the main app to load (landing page header with logo)
  await page.locator("header").waitFor({ state: "visible", timeout: 10000 });
}
