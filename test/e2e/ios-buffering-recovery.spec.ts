import { test, expect, Page } from "@playwright/test";
import { signInAsTestUser, hasTestUserCredentials } from "./login";

/**
 * iOS WebKit Buffering Recovery E2E Tests
 * 
 * These tests verify the iOS buffer management and recovery functionality.
 * Since we can't truly simulate iOS WebKit behavior in Chromium, these tests
 * verify:
 * 1. The debug interface is properly exposed
 * 2. The buffer manager initializes correctly
 * 3. Recovery mechanisms are wired correctly
 * 4. Playback remains stable during simulated stress
 * 
 * Run with:
 *   TEST_USER_EMAIL=... TEST_USER_PASSWORD=... npm run e2e -- test/e2e/ios-buffering-recovery.spec.ts
 */

const skipTests = !hasTestUserCredentials;

/**
 * Helper to wait for audio engine to be ready
 */
async function waitForAudioEngine(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    return !!(window as any).__playerDebug?.getAudioEngine;
  }, { timeout: 15000 });
}

/**
 * Helper to start playback on a channel
 */
async function startPlayback(page: Page): Promise<void> {
  // Navigate to channels
  const channelsNav = page.locator('[data-testid="nav-channels"]');
  await channelsNav.click();
  await page.waitForTimeout(1000);

  // Click first channel
  const firstChannel = page.locator('[data-testid^="channel-card-"]').first();
  await firstChannel.waitFor({ state: "visible", timeout: 10000 });
  await firstChannel.click();
  await page.waitForTimeout(1000);

  // Click play button
  const playButton = page.locator('[data-testid="player-play-button"]');
  if (await playButton.isVisible().catch(() => false)) {
    await playButton.click();
  }

  // Wait for playback to start
  await page.waitForTimeout(3000);
}

test.describe("iOS Buffer Manager Debug Interface", () => {
  test.skip(skipTests, "Skipping - no test user credentials provided");

  test.beforeEach(async ({ page }) => {
    await signInAsTestUser(page);
    await waitForAudioEngine(page);
  });

  test("debug interface is exposed on window", async ({ page }) => {
    const hasDebug = await page.evaluate(() => {
      return !!(window as any).__iosBufferDebug;
    });
    
    expect(hasDebug).toBe(true);
    console.log("[iOS BUFFER TEST] Debug interface is exposed");
  });

  test("debug interface has required methods", async ({ page }) => {
    const methods = await page.evaluate(() => {
      const debug = (window as any).__iosBufferDebug;
      return {
        hasGetState: typeof debug?.getState === 'function',
        hasGetEvents: typeof debug?.getEvents === 'function',
        hasClearEvents: typeof debug?.clearEvents === 'function',
        hasIsActive: typeof debug?.isActive === 'function',
        hasConfig: typeof debug?.config === 'object',
      };
    });

    expect(methods.hasGetState).toBe(true);
    expect(methods.hasGetEvents).toBe(true);
    expect(methods.hasClearEvents).toBe(true);
    expect(methods.hasIsActive).toBe(true);
    expect(methods.hasConfig).toBe(true);
    
    console.log("[iOS BUFFER TEST] All debug methods present:", methods);
  });

  test("debug state has correct structure", async ({ page }) => {
    const state = await page.evaluate(() => {
      return (window as any).__iosBufferDebug?.getState();
    });

    expect(state).toBeDefined();
    expect(typeof state.enabled).toBe('boolean');
    expect(typeof state.isIosMobile).toBe('boolean');
    expect(typeof state.isCellular).toBe('boolean');
    expect(typeof state.isMonitoring).toBe('boolean');
    expect(typeof state.currentBufferedBytes).toBe('number');
    expect(typeof state.proactiveRecoveryCount).toBe('number');
    expect(Array.isArray(state.events)).toBe(true);
    
    console.log("[iOS BUFFER TEST] Debug state structure:", {
      enabled: state.enabled,
      isIosMobile: state.isIosMobile,
      isCellular: state.isCellular,
      isMonitoring: state.isMonitoring,
    });
  });

  test("config has expected thresholds", async ({ page }) => {
    const config = await page.evaluate(() => {
      return (window as any).__iosBufferDebug?.config;
    });

    expect(config).toBeDefined();
    expect(config.DANGER_ZONE_BYTES).toBeGreaterThan(0);
    expect(config.HEALTH_CHECK_INTERVAL_MS).toBeGreaterThan(0);
    expect(config.MAX_PROACTIVE_RECOVERIES).toBeGreaterThan(0);
    
    console.log("[iOS BUFFER TEST] Config:", config);
  });
});

test.describe("iOS Buffer Recovery During Playback", () => {
  test.skip(skipTests, "Skipping - no test user credentials provided");

  test.beforeEach(async ({ page }) => {
    await signInAsTestUser(page);
    await waitForAudioEngine(page);
  });

  test("playback does not skip tracks during first 60 seconds", async ({ page }) => {
    await startPlayback(page);
    
    // Get initial track URL
    const initialTrackUrl = await page.evaluate(() => {
      return (window as any).__playerDebug?.getCurrentTrackUrl?.();
    });
    
    expect(initialTrackUrl).toBeTruthy();
    console.log("[iOS BUFFER TEST] Initial track URL:", initialTrackUrl?.substring(initialTrackUrl.lastIndexOf('/') + 1));
    
    // Wait 60 seconds while checking track hasn't changed
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(5000);
      
      const currentTrackUrl = await page.evaluate(() => {
        return (window as any).__playerDebug?.getCurrentTrackUrl?.();
      });
      
      const metrics = await page.evaluate(() => {
        return (window as any).__playerDebug?.getAudioEngine?.()?.getMetrics?.();
      });
      
      console.log(`[iOS BUFFER TEST] Check ${i + 1}/12 (${(i + 1) * 5}s):`, {
        sameTrack: currentTrackUrl === initialTrackUrl,
        currentTime: metrics?.currentTime?.toFixed(1),
        buffered: metrics?.buffered?.toFixed(1),
        error: metrics?.error,
      });
      
      // Track should not have changed (unless it naturally ended)
      // Allow track to change only if currentTime was near duration
      if (currentTrackUrl !== initialTrackUrl && metrics?.currentTime < metrics?.duration - 5) {
        throw new Error(`Track unexpectedly changed at ${metrics?.currentTime}s`);
      }
    }
    
    console.log("[iOS BUFFER TEST] ✅ Playback remained stable for 60 seconds");
  });

  test("no network errors during playback", async ({ page }) => {
    await startPlayback(page);
    
    let errorCount = 0;
    
    // Monitor for 30 seconds
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(5000);
      
      const metrics = await page.evaluate(() => {
        return (window as any).__playerDebug?.getAudioEngine?.()?.getMetrics?.();
      });
      
      if (metrics?.error && metrics.errorCategory === 'network') {
        errorCount++;
        console.warn(`[iOS BUFFER TEST] Network error detected: ${metrics.error}`);
      }
    }
    
    expect(errorCount).toBe(0);
    console.log("[iOS BUFFER TEST] ✅ No network errors during 30 seconds of playback");
  });

  test("buffer metrics remain stable", async ({ page }) => {
    await startPlayback(page);
    
    await page.waitForTimeout(5000); // Let buffer fill
    
    const samples: number[] = [];
    
    // Collect buffer samples
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(2000);
      
      const metrics = await page.evaluate(() => {
        return (window as any).__playerDebug?.getAudioEngine?.()?.getMetrics?.();
      });
      
      if (metrics?.buffered > 0) {
        samples.push(metrics.buffered);
      }
    }
    
    // Buffer should generally increase or stay stable (not drop dramatically)
    let significantDrops = 0;
    for (let i = 1; i < samples.length; i++) {
      const drop = samples[i - 1] - samples[i];
      if (drop > 5) { // More than 5 seconds of buffer dropped
        significantDrops++;
        console.warn(`[iOS BUFFER TEST] Buffer dropped: ${samples[i-1].toFixed(1)} -> ${samples[i].toFixed(1)}`);
      }
    }
    
    console.log("[iOS BUFFER TEST] Buffer samples:", samples.map(s => s.toFixed(1)));
    expect(significantDrops).toBeLessThan(2); // Allow at most 1 drop (could be track change)
    console.log("[iOS BUFFER TEST] ✅ Buffer remained stable");
  });
});

test.describe("iOS Buffer Manager Test Hooks", () => {
  test.skip(skipTests, "Skipping - no test user credentials provided");

  test.beforeEach(async ({ page }) => {
    await signInAsTestUser(page);
    await waitForAudioEngine(page);
  });

  test("can force enable iOS WebKit mode for testing", async ({ page }) => {
    // Force enable iOS mode
    await page.evaluate(() => {
      (window as any).__playerDebug?.getAudioEngine?.()?._setIosWebKitForTesting?.(true);
    });
    
    const isIosWebKit = await page.evaluate(() => {
      return (window as any).__playerDebug?.getAudioEngine?.()?.getIsIosWebKit?.();
    });
    
    expect(isIosWebKit).toBe(true);
    console.log("[iOS BUFFER TEST] ✅ Successfully forced iOS WebKit mode");
  });

  test("recovery callback is properly wired", async ({ page }) => {
    await startPlayback(page);
    await page.waitForTimeout(5000); // Let playback establish
    
    // Get current time before simulating recovery
    const beforeRecovery = await page.evaluate(() => {
      const engine = (window as any).__playerDebug?.getAudioEngine?.();
      return {
        currentTime: engine?.getCurrentTime?.(),
        trackUrl: (window as any).__playerDebug?.getCurrentTrackUrl?.(),
      };
    });
    
    console.log("[iOS BUFFER TEST] Before recovery:", beforeRecovery);
    
    // Trigger simulated error (this tests the recovery wiring)
    await page.evaluate(() => {
      (window as any).__playerDebug?.getAudioEngine?.()?._setIosWebKitForTesting?.(true);
      (window as any).__playerDebug?.getAudioEngine?.()?._simulateNetworkNoSource?.();
    });
    
    await page.waitForTimeout(3000);
    
    // Verify playback recovered
    const afterRecovery = await page.evaluate(() => {
      const engine = (window as any).__playerDebug?.getAudioEngine?.();
      const metrics = engine?.getMetrics?.();
      return {
        currentTime: engine?.getCurrentTime?.(),
        trackUrl: (window as any).__playerDebug?.getCurrentTrackUrl?.(),
        isPlaying: engine?.isPlaying?.(),
        error: metrics?.error,
        iosRecoveryAttempts: metrics?.iosRecoveryAttempts,
      };
    });
    
    console.log("[iOS BUFFER TEST] After recovery:", afterRecovery);
    
    // Track should be the same (recovered, not skipped)
    expect(afterRecovery.trackUrl).toBe(beforeRecovery.trackUrl);
    console.log("[iOS BUFFER TEST] ✅ Recovery maintained same track");
  });
});

test.describe("Configuration Verification", () => {
  test.skip(skipTests, "Skipping - no test user credentials provided");

  test("logs iOS buffer debug state for verification", async ({ page }) => {
    await signInAsTestUser(page);
    await waitForAudioEngine(page);
    
    const debugInfo = await page.evaluate(() => {
      const bufferDebug = (window as any).__iosBufferDebug;
      const playerDebug = (window as any).__playerDebug;
      const engine = playerDebug?.getAudioEngine?.();
      
      return {
        bufferDebug: bufferDebug?.getState?.(),
        config: bufferDebug?.config,
        isIosWebKit: engine?.getIsIosWebKit?.(),
        iosRecoveryState: engine?.getIosRecoveryState?.(),
      };
    });
    
    console.log("[CONFIG] iOS Buffer Debug Info:");
    console.log("  - Buffer state:", debugInfo.bufferDebug);
    console.log("  - Config:", debugInfo.config);
    console.log("  - isIosWebKit:", debugInfo.isIosWebKit);
    console.log("  - iosRecoveryState:", debugInfo.iosRecoveryState);
    console.log("[CONFIG] ✅ Debug verification complete");
  });
});
