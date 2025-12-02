import { test, expect } from "@playwright/test";
import {
  signInAsAdmin,
  hasAdminCredentials,
  navigateToAdminDashboard,
} from "./admin-login";

// Skip all tests if admin credentials are not provided
const skipTests = !hasAdminCredentials;

/**
 * Admin Build Info E2E Tests
 *
 * These tests verify the build info is correctly displayed in the Admin navbar.
 * The build label format is: "v{version} #{sha} · {env} · {time}"
 * Example: "v1.3.0 #e3519ee · prod · 2025-12-01T23:48Z"
 *
 * Tests validate:
 * 1. Build info element is present and visible
 * 2. Format matches expected pattern (without hardcoding specific values)
 * 3. Contains required components: version, SHA, env label, timestamp
 *
 * Prerequisites:
 *   - Admin test account must exist with admin privileges
 *   - Environment variables must be set:
 *     - TEST_ADMIN_EMAIL
 *     - TEST_ADMIN_PASSWORD
 *
 * Run with:
 *   TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... npm run e2e -- test/e2e/admin-build-info.spec.ts
 */

test.describe("Admin Build Info Display", () => {
  test.skip(skipTests, "Skipping admin tests - no admin credentials provided");

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
    await navigateToAdminDashboard(page);
  });

  test("build info is visible in admin navbar", async ({ page }) => {
    const buildInfo = page.locator('[data-testid="admin-build-info"]');
    await expect(buildInfo).toBeVisible({ timeout: 10000 });
    
    const text = await buildInfo.textContent();
    console.log('[BUILD INFO] Admin navbar displays:', text);
  });

  test("build info matches expected format pattern", async ({ page }) => {
    const buildInfo = page.locator('[data-testid="admin-build-info"]');
    await expect(buildInfo).toBeVisible({ timeout: 10000 });
    
    const text = await buildInfo.textContent();
    expect(text).toBeTruthy();
    
    // Format: "v{version} #{sha} · {env} · {time}"
    // Pattern breakdown:
    // - v followed by semver (e.g., v1.3.0)
    // - # followed by 7 hex chars or "local" (e.g., #e3519ee or #local)
    // - · separator
    // - env label (prod, dev, test, etc.)
    // - · separator
    // - ISO timestamp without seconds (e.g., 2025-12-01T23:48Z)
    const buildLabelPattern = /^v\d+\.\d+\.\d+ #([a-f0-9]{7}|local) · \w+ · \d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/;
    
    expect(text).toMatch(buildLabelPattern);
    console.log('[BUILD INFO] ✅ Format validated:', text);
  });

  test("build info contains version with v prefix", async ({ page }) => {
    const buildInfo = page.locator('[data-testid="admin-build-info"]');
    await expect(buildInfo).toBeVisible({ timeout: 10000 });
    
    const text = await buildInfo.textContent();
    expect(text).toBeTruthy();
    
    // Should start with "v" followed by semver
    expect(text).toMatch(/^v\d+\.\d+\.\d+/);
    console.log('[BUILD INFO] ✅ Version prefix validated');
  });

  test("build info contains commit SHA with # prefix", async ({ page }) => {
    const buildInfo = page.locator('[data-testid="admin-build-info"]');
    await expect(buildInfo).toBeVisible({ timeout: 10000 });
    
    const text = await buildInfo.textContent();
    expect(text).toBeTruthy();
    
    // Should contain # followed by 7 hex chars or "local"
    expect(text).toMatch(/#([a-f0-9]{7}|local)/);
    console.log('[BUILD INFO] ✅ Commit SHA validated');
  });

  test("build info contains environment label", async ({ page }) => {
    const buildInfo = page.locator('[data-testid="admin-build-info"]');
    await expect(buildInfo).toBeVisible({ timeout: 10000 });
    
    const text = await buildInfo.textContent();
    expect(text).toBeTruthy();
    
    // Should contain an env label (prod, dev, test, staging, etc.)
    expect(text).toMatch(/· (prod|dev|test|staging) ·/);
    console.log('[BUILD INFO] ✅ Environment label validated');
  });

  test("build info contains ISO timestamp", async ({ page }) => {
    const buildInfo = page.locator('[data-testid="admin-build-info"]');
    await expect(buildInfo).toBeVisible({ timeout: 10000 });
    
    const text = await buildInfo.textContent();
    expect(text).toBeTruthy();
    
    // Should end with ISO timestamp (without seconds): YYYY-MM-DDTHH:MMZ
    expect(text).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/);
    console.log('[BUILD INFO] ✅ Timestamp validated');
  });

  test("build info has tooltip with full commit SHA", async ({ page }) => {
    const buildInfo = page.locator('[data-testid="admin-build-info"]');
    await expect(buildInfo).toBeVisible({ timeout: 10000 });
    
    const title = await buildInfo.getAttribute('title');
    expect(title).toBeTruthy();
    
    // Title should contain "Full commit:" with the full SHA
    expect(title).toContain('Full commit:');
    console.log('[BUILD INFO] ✅ Tooltip contains full commit SHA');
  });
});

test.describe("Build Info Configuration Verification", () => {
  test.skip(skipTests, "Skipping admin tests - no admin credentials provided");

  test("logs build info details for verification", async ({ page }) => {
    await signInAsAdmin(page);
    await navigateToAdminDashboard(page);
    
    const buildInfo = page.locator('[data-testid="admin-build-info"]');
    await expect(buildInfo).toBeVisible({ timeout: 10000 });
    
    const text = await buildInfo.textContent();
    const title = await buildInfo.getAttribute('title');
    
    console.log('[CONFIG] Build label:', text);
    console.log('[CONFIG] Tooltip:', title);
    
    // Extract components for logging
    const match = text?.match(/^v(\d+\.\d+\.\d+) #(\w+) · (\w+) · (.+)$/);
    if (match) {
      console.log('[CONFIG] Parsed components:');
      console.log('  - Version:', match[1]);
      console.log('  - Short SHA:', match[2]);
      console.log('  - Environment:', match[3]);
      console.log('  - Build time:', match[4]);
    }
    
    console.log('[CONFIG] ✅ Build info verification complete');
  });
});
