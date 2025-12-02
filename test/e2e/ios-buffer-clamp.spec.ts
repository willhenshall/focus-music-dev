/**
 * E2E Tests for iOS Buffer Clamp
 * 
 * These tests verify that the iOS buffer clamp debug interface is properly
 * exposed and functional. They don't require a real iOS device - they test
 * the debug API and force-enable functionality for desktop testing.
 */

import { test, expect, Page } from '@playwright/test';
import { login } from './login';

// Test user credentials from environment
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

// Sign in as test user following the existing pattern
async function signInAsTestUser(page: Page): Promise<boolean> {
  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    return false;
  }

  try {
    // First bypass the password gate
    await login(page);

    // Click the Sign In button on the landing page header
    const signInButton = page.locator("header").getByRole("button", { name: /sign in/i });
    await signInButton.click();

    // Wait for the auth form to appear
    await page.getByLabel(/email/i).waitFor({ state: "visible", timeout: 5000 });

    // Fill in credentials
    await page.getByLabel(/email/i).fill(TEST_USER_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_USER_PASSWORD);

    // Click the sign in button in the form
    await page.locator("form").getByRole("button", { name: /sign in/i }).click();

    // Wait for navigation and check if authenticated
    await page.waitForTimeout(3000);
    
    return true;
  } catch (error) {
    console.error('Sign in failed:', error);
    return false;
  }
}

// Helper to login and wait for debug interface
async function loginAndWaitForDebug(page: Page): Promise<void> {
  const success = await signInAsTestUser(page);
  if (!success) {
    test.skip();
  }
  await waitForDebugInterface(page);
}

// Helper to wait for the debug interface to be fully loaded
async function waitForDebugInterface(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const debug = (window as any).__playerDebug;
    return debug && 
           typeof debug.isIOSWebKit === 'function' &&
           typeof debug.isIOSClampActive === 'function' &&
           typeof debug.getIOSClampState === 'function' &&
           typeof debug.getIosInfo === 'function';
  }, { timeout: 10000 });
}

test.describe('iOS Buffer Clamp Debug Interface', () => {
  // Skip tests if no test credentials
  test.beforeEach(async () => {
    if (!hasTestCredentials) {
      test.skip();
    }
  });
  
  test('debug interface exposes all required methods', async ({ page }) => {
    await loginAndWaitForDebug(page);
    
    // Verify all required methods exist
    const hasAllMethods = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return {
        hasIsIOSWebKit: typeof debug.isIOSWebKit === 'function',
        hasIsIOSClampActive: typeof debug.isIOSClampActive === 'function',
        hasGetIOSClampState: typeof debug.getIOSClampState === 'function',
        hasForceIOSClampForTesting: typeof debug.forceIOSClampForTesting === 'function',
        hasGetIosInfo: typeof debug.getIosInfo === 'function',
      };
    });
    
    expect(hasAllMethods.hasIsIOSWebKit).toBe(true);
    expect(hasAllMethods.hasIsIOSClampActive).toBe(true);
    expect(hasAllMethods.hasGetIOSClampState).toBe(true);
    expect(hasAllMethods.hasForceIOSClampForTesting).toBe(true);
    expect(hasAllMethods.hasGetIosInfo).toBe(true);
  });

  test('isIOSWebKit returns boolean on desktop', async ({ page }) => {
    await loginAndWaitForDebug(page);
    
    const result = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return debug.isIOSWebKit();
    });
    
    // On desktop Chromium, this should be false
    expect(typeof result).toBe('boolean');
    expect(result).toBe(false);
  });

  test('getIOSClampState returns valid state object', async ({ page }) => {
    await loginAndWaitForDebug(page);
    
    const state = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return debug.getIOSClampState();
    });
    
    // Verify state structure
    expect(state).toHaveProperty('isIOSWebKit');
    expect(state).toHaveProperty('isClampActive');
    expect(state).toHaveProperty('bufferLimitMB');
    expect(state).toHaveProperty('currentBufferMB');
    expect(state).toHaveProperty('prefetchDisabled');
    expect(state).toHaveProperty('browserName');
    expect(state).toHaveProperty('isCellular');
    
    // On desktop, clamp should not be active
    expect(state.isIOSWebKit).toBe(false);
    expect(state.isClampActive).toBe(false);
  });

  test('getIosInfo returns comprehensive info', async ({ page }) => {
    await loginAndWaitForDebug(page);
    
    const info = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return debug.getIosInfo();
    });
    
    // Verify info structure
    expect(info).toHaveProperty('isIOSWebKit');
    expect(info).toHaveProperty('isLikelyRealDevice');
    expect(info).toHaveProperty('browserName');
    expect(info).toHaveProperty('isCellular');
    expect(info).toHaveProperty('isIPad');
    
    // On desktop Chromium
    expect(info.isIOSWebKit).toBe(false);
    expect(info.browserName).toBe('Chrome');
  });

  test('forceIOSClampForTesting can enable clamp on desktop', async ({ page }) => {
    await loginAndWaitForDebug(page);
    
    // Before forcing - should not be iOS
    const beforeState = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return debug.getIOSClampState();
    });
    expect(beforeState.isIOSWebKit).toBe(false);
    
    // Force enable clamp for testing
    await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      debug.forceIOSClampForTesting(true);
    });
    
    // After forcing - should report as iOS WebKit
    const afterState = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return debug.getIOSClampState();
    });
    expect(afterState.isIOSWebKit).toBe(true);
    expect(afterState.bufferLimitMB).toBeGreaterThan(0);
    
    // Clean up - disable force mode
    await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      debug.forceIOSClampForTesting(false);
    });
    
    // Should be back to desktop detection
    const cleanState = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return debug.getIOSClampState();
    });
    expect(cleanState.isIOSWebKit).toBe(false);
  });

  test('isIOSClampActive returns false initially on desktop', async ({ page }) => {
    await loginAndWaitForDebug(page);
    
    const isActive = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return debug.isIOSClampActive();
    });
    
    expect(typeof isActive).toBe('boolean');
    expect(isActive).toBe(false);
  });
});

test.describe('iOS Buffer Clamp - Mobile Chrome Project', () => {
  // Skip tests if no test credentials
  test.beforeEach(async () => {
    if (!hasTestCredentials) {
      test.skip();
    }
  });

  // These tests use the mobile-chrome project for better iOS simulation
  test.use({ 
    viewport: { width: 390, height: 844 }, // iPhone 14 dimensions
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1'
  });

  test('detects iOS Chrome user agent', async ({ page }) => {
    await loginAndWaitForDebug(page);
    
    const info = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return debug.getIosInfo();
    });
    
    // With iOS Chrome user agent, should detect iOS WebKit
    expect(info.isIOSWebKit).toBe(true);
    expect(info.browserName).toBe('Chrome');
  });

  test('clamp state shows correct limits for iOS', async ({ page }) => {
    await loginAndWaitForDebug(page);
    
    const state = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return debug.getIOSClampState();
    });
    
    // Should have iOS-specific limits
    expect(state.isIOSWebKit).toBe(true);
    expect(state.bufferLimitMB).toBeGreaterThan(0);
    expect(state.bufferLimitMB).toBeLessThan(20); // Should be conservative
  });
});
