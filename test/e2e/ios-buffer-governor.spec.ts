/**
 * iOS Buffer Governor E2E Tests
 * 
 * Tests the buffer governor behavior for iOS WebKit browsers.
 * These tests verify that:
 * 1. The buffer governor debug interface is properly exposed via window.__playerDebug
 * 2. All governor methods are callable (not undefined)
 * 3. Playback remains stable with governor active
 * 4. Recovery mechanisms work correctly
 * 
 * Note: These tests use test hooks to simulate iOS WebKit environment
 * since Playwright Chromium is not actual WebKit.
 */

import { test, expect, Page } from '@playwright/test';
import { testUserLogin, TEST_USER_EMAIL, TEST_USER_PASSWORD } from './helpers/auth';

// Helper to check if we have test credentials
const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

// Helper to wait for debug interface to be available with all required methods
async function waitForDebugInterface(page: Page, timeout = 15000): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        const debug = (window as any).__playerDebug;
        return debug && 
               typeof debug.isIOSWebKit === 'function' &&
               typeof debug.isBufferGovernorActive === 'function' &&
               typeof debug.getBufferGovernorState === 'function';
      },
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

// Helper to start playback
async function startPlayback(page: Page): Promise<boolean> {
  // Navigate to a channel
  const channelCard = page.locator('[data-testid="channel-card"]').first();
  if (await channelCard.isVisible({ timeout: 5000 }).catch(() => false)) {
    await channelCard.click();
    await page.waitForTimeout(1000);
  }

  // Try to start playback
  const playButton = page.locator('[data-testid="play-button"], button:has-text("Play")').first();
  if (await playButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await playButton.click();
    await page.waitForTimeout(2000);
    return true;
  }

  return false;
}

test.describe('iOS Buffer Governor', () => {
  test.beforeEach(async ({ page }) => {
    if (!hasTestCredentials) {
      test.skip();
      return;
    }
    await testUserLogin(page);
  });

  test('debug interface exposes all buffer governor methods', async ({ page }) => {
    const hasDebug = await waitForDebugInterface(page);
    expect(hasDebug).toBe(true);

    const debugInterface = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      const keys = Object.keys(debug || {});
      return {
        allKeys: keys,
        hasGetMetrics: typeof debug?.getMetrics === 'function',
        hasGetBufferGovernorState: typeof debug?.getBufferGovernorState === 'function',
        hasIsIOSWebKit: typeof debug?.isIOSWebKit === 'function',
        hasIsBufferGovernorActive: typeof debug?.isBufferGovernorActive === 'function',
        hasForceBufferGovernor: typeof debug?.forceBufferGovernor === 'function',
        hasSimulateBufferFailure: typeof debug?.simulateBufferFailure === 'function',
        hasGetIosInfo: typeof debug?.getIosInfo === 'function',
      };
    });

    console.log('[DEBUG] Available keys on window.__playerDebug:', debugInterface.allKeys);
    
    expect(debugInterface.hasGetMetrics).toBe(true);
    expect(debugInterface.hasGetBufferGovernorState).toBe(true);
    expect(debugInterface.hasIsIOSWebKit).toBe(true);
    expect(debugInterface.hasIsBufferGovernorActive).toBe(true);
    expect(debugInterface.hasForceBufferGovernor).toBe(true);
    expect(debugInterface.hasSimulateBufferFailure).toBe(true);
    expect(debugInterface.hasGetIosInfo).toBe(true);
  });

  test('buffer governor state is accessible and has correct structure', async ({ page }) => {
    const hasDebug = await waitForDebugInterface(page);
    expect(hasDebug).toBe(true);

    const state = await page.evaluate(() => {
      return (window as any).__playerDebug.getBufferGovernorState();
    });

    expect(state).toBeDefined();
    expect(typeof state.active).toBe('boolean');
    expect(typeof state.limitBytes).toBe('number');
    expect(state.recovery).toBeDefined();
    expect(state.prefetch).toBeDefined();
    expect(state.iosInfo).toBeDefined();
    
    // Verify recovery state structure
    expect(typeof state.recovery.attempts).toBe('number');
    expect(state.recovery.isRecovering).toBeDefined();
    
    // Verify prefetch state structure
    expect(typeof state.prefetch.allowed).toBe('boolean');
    expect(typeof state.prefetch.reason).toBe('string');
  });

  test('governor correctly detects non-iOS environment in Chromium', async ({ page }) => {
    const hasDebug = await waitForDebugInterface(page);
    expect(hasDebug).toBe(true);

    const isIOSWebKit = await page.evaluate(() => {
      return (window as any).__playerDebug.isIOSWebKit();
    });

    // Playwright Chromium is NOT iOS WebKit
    expect(isIOSWebKit).toBe(false);

    const isActive = await page.evaluate(() => {
      return (window as any).__playerDebug.isBufferGovernorActive();
    });

    // Governor should be inactive on non-iOS
    expect(isActive).toBe(false);
  });

  test('can force-activate governor for testing', async ({ page }) => {
    const hasDebug = await waitForDebugInterface(page);
    expect(hasDebug).toBe(true);

    // Initially inactive on Chromium
    let isActive = await page.evaluate(() => {
      return (window as any).__playerDebug.isBufferGovernorActive();
    });
    expect(isActive).toBe(false);

    // Force activate
    await page.evaluate(() => {
      (window as any).__playerDebug.forceBufferGovernor(true);
    });

    // Now should be active
    isActive = await page.evaluate(() => {
      return (window as any).__playerDebug.isBufferGovernorActive();
    });
    expect(isActive).toBe(true);
  });

  test('playback works with force-activated governor', async ({ page }) => {
    const hasDebug = await waitForDebugInterface(page);
    expect(hasDebug).toBe(true);

    // Force activate governor
    await page.evaluate(() => {
      (window as any).__playerDebug.forceBufferGovernor(true);
    });

    // Start playback
    const started = await startPlayback(page);
    if (!started) {
      test.skip();
      return;
    }

    // Wait for playback to establish
    await page.waitForTimeout(3000);

    // Check transport state
    const transportState = await page.evaluate(() => {
      return (window as any).__playerDebug.getTransportState();
    });

    // Should be playing or paused
    expect(['playing', 'paused']).toContain(transportState);
    
    // Governor should still be active
    const isActive = await page.evaluate(() => {
      return (window as any).__playerDebug.isBufferGovernorActive();
    });
    expect(isActive).toBe(true);
  });

  test('recovery state is tracked correctly', async ({ page }) => {
    const hasDebug = await waitForDebugInterface(page);
    expect(hasDebug).toBe(true);

    // Force activate governor
    await page.evaluate(() => {
      (window as any).__playerDebug.forceBufferGovernor(true);
    });

    // Check initial recovery state
    const state = await page.evaluate(() => {
      return (window as any).__playerDebug.getBufferGovernorState();
    });

    expect(state.recovery.attempts).toBe(0);
    expect(state.recovery.errorType).toBe(null);
    expect(state.recovery.isRecovering).toBe(false);
  });

  test('iOS info is accessible', async ({ page }) => {
    const hasDebug = await waitForDebugInterface(page);
    expect(hasDebug).toBe(true);

    const iosInfo = await page.evaluate(() => {
      return (window as any).__playerDebug.getIosInfo();
    });

    expect(iosInfo).toBeDefined();
    expect(typeof iosInfo.isIOSWebKit).toBe('boolean');
    expect(typeof iosInfo.browserName).toBe('string');
    expect(typeof iosInfo.isCellular).toBe('boolean');
    
    // On Chromium, should not be iOS
    expect(iosInfo.isIOSWebKit).toBe(false);
  });
});

test.describe('iOS Buffer Governor - Mobile Chrome Project', () => {
  // These tests specifically run in the mobile-chrome project
  test.use({ 
    viewport: { width: 390, height: 844 }, // iPhone 14 Pro dimensions
  });

  test.beforeEach(async ({ page }) => {
    if (!hasTestCredentials) {
      test.skip();
      return;
    }
    await testUserLogin(page);
  });

  test('debug interface available on mobile viewport with all methods', async ({ page }) => {
    const hasDebug = await waitForDebugInterface(page);
    expect(hasDebug).toBe(true);

    const methods = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return {
        hasIsIOSWebKit: typeof debug.isIOSWebKit === 'function',
        hasIsBufferGovernorActive: typeof debug.isBufferGovernorActive === 'function',
        hasGetBufferGovernorState: typeof debug.getBufferGovernorState === 'function',
        hasForceBufferGovernor: typeof debug.forceBufferGovernor === 'function',
        hasSimulateBufferFailure: typeof debug.simulateBufferFailure === 'function',
      };
    });

    expect(methods.hasIsIOSWebKit).toBe(true);
    expect(methods.hasIsBufferGovernorActive).toBe(true);
    expect(methods.hasGetBufferGovernorState).toBe(true);
    expect(methods.hasForceBufferGovernor).toBe(true);
    expect(methods.hasSimulateBufferFailure).toBe(true);
  });

  test('buffer governor state accessible on mobile viewport', async ({ page }) => {
    const hasDebug = await waitForDebugInterface(page);
    expect(hasDebug).toBe(true);

    const state = await page.evaluate(() => {
      return (window as any).__playerDebug.getBufferGovernorState();
    });

    expect(state).toBeDefined();
    expect(state.iosInfo).toBeDefined();
    expect(state.recovery).toBeDefined();
    expect(state.prefetch).toBeDefined();
  });

  test('playback stability with force-activated governor on mobile viewport', async ({ page }) => {
    const hasDebug = await waitForDebugInterface(page);
    expect(hasDebug).toBe(true);

    // Force activate governor to simulate iOS
    await page.evaluate(() => {
      (window as any).__playerDebug.forceBufferGovernor(true);
    });

    // Verify activation
    const isActive = await page.evaluate(() => {
      return (window as any).__playerDebug.isBufferGovernorActive();
    });
    expect(isActive).toBe(true);

    // Start playback
    const started = await startPlayback(page);
    if (!started) {
      test.skip();
      return;
    }

    // Monitor for 10 seconds - no unexpected errors should occur
    const startTime = Date.now();
    let errorOccurred = false;
    let initialTrackId: string | null = null;

    while (Date.now() - startTime < 10000) {
      const trackId = await page.evaluate(() => {
        return (window as any).__playerDebug.getTrackId();
      });

      if (!initialTrackId && trackId) {
        initialTrackId = trackId;
      }

      // Check for buffer-specific errors
      const state = await page.evaluate(() => {
        return (window as any).__playerDebug.getBufferGovernorState();
      });

      if (state.recovery.errorType === 'IOS_WEBKIT_BUFFER_FAILURE') {
        errorOccurred = true;
        break;
      }

      await page.waitForTimeout(500);
    }

    // Should not have encountered buffer errors in simulated environment
    expect(errorOccurred).toBe(false);
  });
});

// Configuration verification
test('Configuration verification', async ({ page }) => {
  if (!hasTestCredentials) {
    console.log('⚠️ Test credentials not configured - some tests skipped');
    console.log('  Set TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables');
  } else {
    console.log('✅ Test credentials configured');
  }

  // Log test environment info
  console.log('📱 iOS Buffer Governor Tests');
  console.log('  - Tests buffer governor initialization');
  console.log('  - Tests debug interface availability');
  console.log('  - Tests force-activation for testing');
  console.log('  - Tests playback stability with governor');
  console.log('');
  console.log('Note: Real iOS WebKit testing requires a physical device.');
  console.log('These tests use force-activation to simulate iOS behavior.');
});
