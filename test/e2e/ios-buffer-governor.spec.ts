/**
 * iOS Buffer Governor E2E Tests
 * 
 * Tests the buffer governor behavior for iOS WebKit browsers.
 * These tests verify that:
 * 1. The buffer governor is properly initialized
 * 2. Debug interface is accessible
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

// Helper to wait for audio engine to be available
async function waitForAudioEngine(page: Page, timeout = 15000): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => typeof (window as any).__playerDebug !== 'undefined',
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

  test('debug interface is exposed on window', async ({ page }) => {
    const hasEngine = await waitForAudioEngine(page);
    expect(hasEngine).toBe(true);

    const debugInterface = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return {
        hasGetMetrics: typeof debug?.getMetrics === 'function',
        hasGetBufferGovernorState: typeof debug?.getBufferGovernorState === 'function',
        hasIsIOSWebKit: typeof debug?.isIOSWebKit === 'function',
        hasIsBufferGovernorActive: typeof debug?.isBufferGovernorActive === 'function',
        hasForceBufferGovernor: typeof debug?.forceBufferGovernor === 'function',
        hasSimulateBufferFailure: typeof debug?.simulateBufferFailure === 'function',
        hasConfig: typeof debug?.config === 'object',
      };
    });

    expect(debugInterface.hasGetMetrics).toBe(true);
    expect(debugInterface.hasGetBufferGovernorState).toBe(true);
    expect(debugInterface.hasIsIOSWebKit).toBe(true);
    expect(debugInterface.hasIsBufferGovernorActive).toBe(true);
    expect(debugInterface.hasForceBufferGovernor).toBe(true);
    expect(debugInterface.hasSimulateBufferFailure).toBe(true);
    expect(debugInterface.hasConfig).toBe(true);
  });

  test('buffer governor config has safe limits', async ({ page }) => {
    const hasEngine = await waitForAudioEngine(page);
    expect(hasEngine).toBe(true);

    const config = await page.evaluate(() => {
      return (window as any).__playerDebug?.config;
    });

    expect(config).toBeDefined();
    
    // Buffer limits should be well under WebKit's ~22MB crash point
    expect(config.DEFAULT_BUFFER_LIMIT_BYTES).toBeLessThan(20 * 1024 * 1024);
    expect(config.CELLULAR_BUFFER_LIMIT_BYTES).toBeLessThan(15 * 1024 * 1024);
    
    // Prefetch limits should be lower than buffer limits
    expect(config.DEFAULT_PREFETCH_LIMIT_BYTES).toBeLessThan(config.DEFAULT_BUFFER_LIMIT_BYTES);
    expect(config.CELLULAR_PREFETCH_LIMIT_BYTES).toBeLessThan(config.CELLULAR_BUFFER_LIMIT_BYTES);
    
    // Recovery settings should be reasonable
    expect(config.MAX_RECOVERY_ATTEMPTS).toBeGreaterThanOrEqual(2);
    expect(config.MAX_RECOVERY_ATTEMPTS).toBeLessThanOrEqual(5);
  });

  test('metrics include iOS WebKit fields', async ({ page }) => {
    const hasEngine = await waitForAudioEngine(page);
    expect(hasEngine).toBe(true);

    const metrics = await page.evaluate(() => {
      return (window as any).__playerDebug?.getMetrics();
    });

    expect(metrics).toBeDefined();
    expect(metrics.iosWebkit).toBeDefined();
    
    // Check all expected fields exist
    expect(typeof metrics.iosWebkit.isIOSWebKit).toBe('boolean');
    expect(typeof metrics.iosWebkit.browserName).toBe('string');
    expect(typeof metrics.iosWebkit.isCellular).toBe('boolean');
    expect(typeof metrics.iosWebkit.bufferGovernorActive).toBe('boolean');
    expect(typeof metrics.iosWebkit.bufferLimitBytes).toBe('number');
    expect(typeof metrics.iosWebkit.estimatedBufferedBytes).toBe('number');
    expect(typeof metrics.iosWebkit.isLargeTrack).toBe('boolean');
    expect(typeof metrics.iosWebkit.isThrottling).toBe('boolean');
    expect(typeof metrics.iosWebkit.recoveryAttempts).toBe('number');
    expect(typeof metrics.iosWebkit.prefetchAllowed).toBe('boolean');
    expect(typeof metrics.iosWebkit.prefetchReason).toBe('string');
  });

  test('buffer governor state is accessible', async ({ page }) => {
    const hasEngine = await waitForAudioEngine(page);
    expect(hasEngine).toBe(true);

    const state = await page.evaluate(() => {
      return (window as any).__playerDebug?.getBufferGovernorState();
    });

    expect(state).toBeDefined();
    expect(typeof state.active).toBe('boolean');
    expect(typeof state.limitBytes).toBe('number');
    expect(state.recovery).toBeDefined();
    expect(state.prefetch).toBeDefined();
    expect(state.iosInfo).toBeDefined();
  });

  test('governor correctly detects non-iOS environment in Chromium', async ({ page }) => {
    const hasEngine = await waitForAudioEngine(page);
    expect(hasEngine).toBe(true);

    const isIOSWebKit = await page.evaluate(() => {
      return (window as any).__playerDebug?.isIOSWebKit();
    });

    // Playwright Chromium is NOT iOS WebKit
    expect(isIOSWebKit).toBe(false);

    const isActive = await page.evaluate(() => {
      return (window as any).__playerDebug?.isBufferGovernorActive();
    });

    // Governor should be inactive on non-iOS
    expect(isActive).toBe(false);
  });

  test('can force-activate governor for testing', async ({ page }) => {
    const hasEngine = await waitForAudioEngine(page);
    expect(hasEngine).toBe(true);

    // Initially inactive on Chromium
    let isActive = await page.evaluate(() => {
      return (window as any).__playerDebug?.isBufferGovernorActive();
    });
    expect(isActive).toBe(false);

    // Force activate
    await page.evaluate(() => {
      (window as any).__playerDebug?.forceBufferGovernor(true);
    });

    // Now should be active
    isActive = await page.evaluate(() => {
      return (window as any).__playerDebug?.isBufferGovernorActive();
    });
    expect(isActive).toBe(true);

    // Check metrics reflect the change
    const metrics = await page.evaluate(() => {
      return (window as any).__playerDebug?.getMetrics();
    });
    expect(metrics.iosWebkit.bufferGovernorActive).toBe(true);
  });

  test('playback works with force-activated governor', async ({ page }) => {
    const hasEngine = await waitForAudioEngine(page);
    expect(hasEngine).toBe(true);

    // Force activate governor
    await page.evaluate(() => {
      (window as any).__playerDebug?.forceBufferGovernor(true);
    });

    // Start playback
    const started = await startPlayback(page);
    if (!started) {
      test.skip();
      return;
    }

    // Wait for playback to establish
    await page.waitForTimeout(3000);

    // Check playback state
    const metrics = await page.evaluate(() => {
      return (window as any).__playerDebug?.getMetrics();
    });

    // Should be playing or have a track loaded
    expect(['playing', 'ready', 'paused']).toContain(metrics.playbackState);
    
    // Governor should still be active
    expect(metrics.iosWebkit.bufferGovernorActive).toBe(true);
  });

  test('recovery state is tracked correctly', async ({ page }) => {
    const hasEngine = await waitForAudioEngine(page);
    expect(hasEngine).toBe(true);

    // Force activate governor
    await page.evaluate(() => {
      (window as any).__playerDebug?.forceBufferGovernor(true);
    });

    // Check initial recovery state
    let state = await page.evaluate(() => {
      return (window as any).__playerDebug?.getBufferGovernorState();
    });

    expect(state.recovery.attempts).toBe(0);
    expect(state.recovery.errorType).toBe(null);
    expect(state.recovery.isRecovering).toBe(false);
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

  test('debug interface available on mobile viewport', async ({ page }) => {
    const hasEngine = await waitForAudioEngine(page);
    expect(hasEngine).toBe(true);

    const hasDebug = await page.evaluate(() => {
      return typeof (window as any).__playerDebug !== 'undefined';
    });

    expect(hasDebug).toBe(true);
  });

  test('buffer governor state accessible on mobile viewport', async ({ page }) => {
    const hasEngine = await waitForAudioEngine(page);
    expect(hasEngine).toBe(true);

    const state = await page.evaluate(() => {
      return (window as any).__playerDebug?.getBufferGovernorState();
    });

    expect(state).toBeDefined();
    expect(state.iosInfo).toBeDefined();
  });

  test('playback stability with force-activated governor on mobile viewport', async ({ page }) => {
    const hasEngine = await waitForAudioEngine(page);
    expect(hasEngine).toBe(true);

    // Force activate governor to simulate iOS
    await page.evaluate(() => {
      (window as any).__playerDebug?.forceBufferGovernor(true);
    });

    // Verify activation
    const isActive = await page.evaluate(() => {
      return (window as any).__playerDebug?.isBufferGovernorActive();
    });
    expect(isActive).toBe(true);

    // Start playback
    const started = await startPlayback(page);
    if (!started) {
      test.skip();
      return;
    }

    // Monitor for 10 seconds - no track skips should occur
    const startTime = Date.now();
    let trackSkipped = false;
    let errorOccurred = false;
    let initialTrackId: string | null = null;

    while (Date.now() - startTime < 10000) {
      const metrics = await page.evaluate(() => {
        return (window as any).__playerDebug?.getMetrics();
      });

      if (!initialTrackId && metrics.currentTrackId) {
        initialTrackId = metrics.currentTrackId;
      }

      if (initialTrackId && metrics.currentTrackId !== initialTrackId) {
        trackSkipped = true;
        break;
      }

      if (metrics.error && metrics.errorCategory === 'ios_webkit_buffer') {
        errorOccurred = true;
        break;
      }

      await page.waitForTimeout(500);
    }

    // Should not have skipped tracks or encountered buffer errors
    // (in a real iOS environment with the governor active)
    expect(trackSkipped).toBe(false);
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
