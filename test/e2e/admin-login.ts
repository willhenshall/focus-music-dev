import { Page } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

/**
 * Admin login credentials from environment variables.
 * Tests should skip if these are not set.
 */
export const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
export const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

/**
 * Returns true if admin credentials are available in environment.
 */
export const hasAdminCredentials = Boolean(TEST_ADMIN_EMAIL && TEST_ADMIN_PASSWORD);

/**
 * Bypasses the password gate if present on the landing page.
 */
async function bypassPasswordGate(page: Page): Promise<void> {
  const passwordInput = page.locator('input[type="password"]').first();
  const isPasswordGateVisible = await passwordInput
    .isVisible({ timeout: 2000 })
    .catch(() => false);

  if (isPasswordGateVisible) {
    await passwordInput.fill("magic");
    await page.getByRole("button", { name: /continue/i }).click();
    await page.waitForTimeout(1500);
  }
}

/**
 * Signs in as the admin test user.
 * 
 * Prerequisites:
 * - TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set in environment
 * - The admin account must exist in the database with admin privileges
 * 
 * @returns true if sign-in succeeded, false otherwise
 */
export async function signInAsAdmin(page: Page): Promise<boolean> {
  if (!TEST_ADMIN_EMAIL || !TEST_ADMIN_PASSWORD) {
    console.log("[ADMIN LOGIN] Skipping: TEST_ADMIN_EMAIL or TEST_ADMIN_PASSWORD not set");
    return false;
  }

  try {
    // Navigate to the app
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    // Bypass password gate if present
    await bypassPasswordGate(page);

    // Click Sign In button on landing page to show auth form
    const signInButton = page.locator("header").getByRole("button", { name: /sign in/i });
    const signInVisible = await signInButton.isVisible({ timeout: 3000 }).catch(() => false);
    
    if (signInVisible) {
      await signInButton.click();
    }

    // Wait for auth form to appear
    const emailInput = page.getByLabel(/email/i);
    await emailInput.waitFor({ state: "visible", timeout: 10000 });

    // Fill credentials
    await emailInput.fill(TEST_ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_ADMIN_PASSWORD);

    // Submit the form
    await page.locator("form").getByRole("button", { name: /sign in/i }).click();

    // Wait for admin dashboard to load - admin button indicates successful admin login
    const adminButton = page.getByRole("button", { name: /admin/i });
    await adminButton.waitFor({ state: "visible", timeout: 15000 });

    console.log("[ADMIN LOGIN] Successfully signed in as admin");
    return true;
  } catch (error) {
    console.error("[ADMIN LOGIN] Failed to sign in:", error);
    return false;
  }
}

/**
 * Navigates to the Admin Dashboard from the User Dashboard.
 * Assumes the user is already signed in as an admin.
 */
export async function navigateToAdminDashboard(page: Page): Promise<void> {
  const adminButton = page.getByRole("button", { name: /admin/i });
  await adminButton.waitFor({ state: "visible", timeout: 5000 });
  await adminButton.click();
  
  // Wait for admin dashboard header to appear
  await page.locator("text=Admin Dashboard").waitFor({ state: "visible", timeout: 10000 });
}

/**
 * Navigates to a specific admin tab.
 * Assumes we're already on the Admin Dashboard.
 * 
 * @param tab - The tab ID to navigate to (analytics, channels, library, users, images, quiz, settings, tests, testing)
 */
export async function navigateToAdminTab(
  page: Page,
  tab: "analytics" | "channels" | "library" | "users" | "images" | "quiz" | "settings" | "tests" | "testing"
): Promise<void> {
  // Map tab IDs to their display labels
  const tabLabels: Record<typeof tab, string> = {
    analytics: "Analytics",
    channels: "Channels",
    library: "Music Library",
    users: "Users",
    images: "Images",
    quiz: "Quiz",
    settings: "Settings",
    tests: "Tests",
    testing: "Dev Tools",
  };

  const tabLabel = tabLabels[tab];
  const tabButton = page.getByRole("button", { name: tabLabel });
  
  await tabButton.waitFor({ state: "visible", timeout: 5000 });
  await tabButton.click();
  
  // Wait for tab content to load
  await page.waitForTimeout(1000);
}

/**
 * Navigates back to the User View (Channels) from Admin Dashboard.
 */
export async function navigateToUserView(page: Page): Promise<void> {
  const userViewButton = page.getByRole("button", { name: /user view/i });
  await userViewButton.waitFor({ state: "visible", timeout: 5000 });
  await userViewButton.click();
  
  // Wait for user dashboard to load - Channels button indicates we're back
  await page.getByRole("button", { name: /channels/i }).waitFor({ state: "visible", timeout: 10000 });
}
