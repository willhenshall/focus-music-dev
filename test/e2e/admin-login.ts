import type { Page } from "@playwright/test";

export const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
export const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

// Many E2E specs treat this as a boolean constant (not a function).
export const hasAdminCredentials = Boolean(TEST_ADMIN_EMAIL && TEST_ADMIN_PASSWORD);

type AdminTabId =
  | "analytics"
  | "channels"
  | "library"
  | "users"
  | "images"
  | "quiz"
  | "settings"
  | "tests"
  | "testing";

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getAdminTabLabel(tabId: AdminTabId): string {
  switch (tabId) {
    case "analytics":
      return "Analytics";
    case "channels":
      return "Channels";
    case "library":
      return "Music Library";
    case "users":
      return "Users";
    case "images":
      return "Images";
    case "quiz":
      return "Quiz";
    case "settings":
      return "Settings";
    case "tests":
      return "Tests";
    case "testing":
      return "Dev Tools";
  }
}

/**
 * Signs in as an admin user via the UI.
 *
 * Returns false when:
 * - TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD are not set, or
 * - the signed-in user does not appear to be an admin (no Admin button)
 */
export async function signInAsAdmin(page: Page): Promise<boolean> {
  if (!hasAdminCredentials) return false;

  // Avoid the "site access" password gate during E2E.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("site_access_granted", "true");
    } catch {
      // ignore
    }
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const signOutButton = page.getByRole("button", { name: /sign out/i });
  const alreadySignedIn = await signOutButton
    .isVisible({ timeout: 2000 })
    .catch(() => false);

  if (!alreadySignedIn) {
    // If we're already on the AuthForm, the email field will be visible.
    const emailAlreadyVisible = await page
      .locator("#email")
      .isVisible({ timeout: 500 })
      .catch(() => false);

    if (!emailAlreadyVisible) {
      // From the landing page, click "Sign In" to open the AuthForm.
      // NOTE: There has historically been a header overlap bug that makes only the
      // bottom portion of header buttons clickable. Click near the bottom to be resilient.
      const landingSignIn = page.getByRole("button", { name: /^sign in$/i });
      await landingSignIn.waitFor({ state: "visible", timeout: 15000 });

      const box = await landingSignIn.boundingBox();
      if (box) {
        const x = box.x + box.width / 2;
        const y = box.y + box.height * 0.85;
        await page.mouse.click(x, y);
      } else {
        await landingSignIn.click({ force: true });
      }
    }

    await page.locator("#email").waitFor({ state: "visible", timeout: 15000 });

    await page.locator("#email").fill(TEST_ADMIN_EMAIL!);
    await page.locator("#password").fill(TEST_ADMIN_PASSWORD!);

    // AuthForm submit button text is also "Sign In".
    // Scope to the form to avoid strict-mode ambiguity with the (hidden) header placeholder button.
    await page.locator("form").getByRole("button", { name: /^sign in$/i }).click();

    // Login can be slow/noisy in E2E; wait longer and gracefully return false if it never completes.
    try {
      await signOutButton.waitFor({ state: "visible", timeout: 60000 });
    } catch {
      const errorText = await page
        .locator('[class*="bg-red-50"], [class*="text-red-"]')
        .first()
        .textContent()
        .catch(() => null);
      if (errorText) {
        console.log("[ADMIN LOGIN] Sign-in failed:", errorText.trim());
      } else {
        console.log("[ADMIN LOGIN] Sign-in did not complete within timeout.");
      }
      return false;
    }
  }

  // Confirm admin capabilities (admin users have an "Admin" button in the header).
  const adminButton = page.getByRole("button", { name: /^admin$/i });
  const isAdmin = await adminButton.isVisible({ timeout: 15000 }).catch(() => false);
  return isAdmin;
}

export async function navigateToAdminDashboard(page: Page): Promise<void> {
  const adminButton = page.getByRole("button", { name: /^admin$/i });
  await adminButton.waitFor({ state: "visible", timeout: 15000 });
  await adminButton.click();
  await page.locator("text=Admin Dashboard").first().waitFor({ state: "visible", timeout: 15000 });
}

export async function navigateToUserView(page: Page): Promise<void> {
  const userViewButton = page.getByRole("button", { name: /user view/i });
  await userViewButton.waitFor({ state: "visible", timeout: 15000 });
  await userViewButton.click();
  await page.getByRole("button", { name: /channels/i }).waitFor({ state: "visible", timeout: 15000 });
}

export async function navigateToAdminTab(page: Page, tabId: AdminTabId): Promise<void> {
  const label = getAdminTabLabel(tabId);
  const tabButton = page.getByRole("button", {
    name: new RegExp(`^${escapeRegExp(label)}$`, "i"),
  });
  await tabButton.waitFor({ state: "visible", timeout: 15000 });
  await tabButton.click();

  // Let the tab content render before the calling test starts asserting.
  await page.waitForTimeout(250);
}
