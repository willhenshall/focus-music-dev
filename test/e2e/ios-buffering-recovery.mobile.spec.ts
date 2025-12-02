import { test, expect, Page } from "@playwright/test";
import { signInAsTestUser, hasTestUserCredentials } from "./login";

/**
 * iOS WebKit Buffering Recovery E2E Tests - Mobile Chrome Project
 * 
 * These tests run in the mobile-chrome project configuration to simulate
 * mobile viewport and user agent. While we can't truly simulate iOS WebKit
 * in Chromium, these tests verify the mobile-specific code paths.
 * 
 * Run with:
 *   TEST_USER_EMAIL=... TEST_USER_PASSWORD=... npm run e2e -- --project=mobile-chrome test/e2e/ios-buffering-recovery.mobile.spec.ts
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
 * Helper to start playback on mobile
 */
async function startPlaybackMobile(page: Page): Promise<void> {
  // On mobile, channels should be visible by default
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

test.describe("iOS Buffer Manager - Mobile Chrome", () => {
  test.skip(skipTests, "Skipping - no test user credentials provided");

  test.beforeEach(async ({ page }) => {
    await signInAsTestUser(page);
    await waitForAudioEngine(page);
  });

  test("debug interface available on mobile", async ({ page }) => {
    const hasDebug = await page.evaluate(() => {
      return !!(window as any).__iosBufferDebug;
    });
    
    expect(hasDebug).toBe(true);
    console.log("[MOBILE] iOS buffer debug interface available");
  });

  test("mobile playback does not skip during first 60 seconds", async ({ page }) => {
    await startPlaybackMobile(page);
    
    const initialTrackUrl = await page.evaluate(() => {
      return (window as any).__playerDebug?.getCurrentTrackUrl?.();
    });
    
    expect(initialTrackUrl).toBeTruthy();
    console.log("[MOBILE] Initial track:", initialTrackUrl?.substring(initialTrackUrl.lastIndexOf('/') + 1));
    
    // Monitor for 60 seconds
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(5000);
      
      const currentTrackUrl = await page.evaluate(() => {
        return (window as any).__playerDebug?.getCurrentTrackUrl?.();
      });
      
      const metrics = await page.evaluate(() => {
        return (window as any).__playerDebug?.getAudioEngine?.()?.getMetrics?.();
      });
      
      console.log(`[MOBILE] Check ${i + 1}/12:`, {
        sameTrack: currentTrackUrl === initialTrackUrl,
        currentTime: metrics?.currentTime?.toFixed(1),
        error: metrics?.error,
      });
      
      // Allow natural track end
      if (currentTrackUrl !== initialTrackUrl && metrics?.currentTime < metrics?.duration - 5) {
        throw new Error(`Track unexpectedly changed at ${metrics?.currentTime}s`);
      }
    }
    
    console.log("[MOBILE] ✅ Playback stable for 60 seconds");
  });

  test("no network errors on mobile playback", async ({ page }) => {
    await startPlaybackMobile(page);
    
    let errors: string[] = [];
    
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(5000);
      
      const metrics = await page.evaluate(() => {
        return (window as any).__playerDebug?.getAudioEngine?.()?.getMetrics?.();
      });
      
      if (metrics?.error && metrics.errorCategory === 'network') {
        errors.push(metrics.error);
      }
    }
    
    expect(errors.length).toBe(0);
    console.log("[MOBILE] ✅ No network errors in 30 seconds");
  });

  test("recovery within 2 seconds of simulated stall", async ({ page }) => {
    await startPlaybackMobile(page);
    await page.waitForTimeout(5000);
    
    // Enable iOS mode and simulate error
    const beforeTime = await page.evaluate(() => {
      const engine = (window as any).__playerDebug?.getAudioEngine?.();
      engine?._setIosWebKitForTesting?.(true);
      return engine?.getCurrentTime?.();
    });
    
    console.log("[MOBILE] Before simulated error, time:", beforeTime?.toFixed(2));
    
    // Simulate the error
    await page.evaluate(() => {
      (window as any).__playerDebug?.getAudioEngine?.()?._simulateNetworkNoSource?.();
    });
    
    // Wait max 2 seconds for recovery
    const startRecovery = Date.now();
    let recovered = false;
    
    while (Date.now() - startRecovery < 2000) {
      await page.waitForTimeout(200);
      
      const isPlaying = await page.evaluate(() => {
        return (window as any).__playerDebug?.getAudioEngine?.()?.isPlaying?.();
      });
      
      if (isPlaying) {
        recovered = true;
        break;
      }
    }
    
    const recoveryTime = Date.now() - startRecovery;
    console.log("[MOBILE] Recovery took:", recoveryTime + "ms");
    
    expect(recovered).toBe(true);
    expect(recoveryTime).toBeLessThan(2000);
    console.log("[MOBILE] ✅ Recovery completed within 2 seconds");
  });

  test("buffer events are logged", async ({ page }) => {
    await startPlaybackMobile(page);
    await page.waitForTimeout(5000);
    
    const events = await page.evaluate(() => {
      return (window as any).__iosBufferDebug?.getEvents?.();
    });
    
    expect(Array.isArray(events)).toBe(true);
    console.log("[MOBILE] Buffer events logged:", events?.length || 0);
    
    // Log a few events for debugging
    events?.slice(-5).forEach((event: any) => {
      console.log(`  [${event.type}] ${event.timestamp}: ${event.details}`);
    });
  });
});

test.describe("Mobile Buffer Metrics Stability", () => {
  test.skip(skipTests, "Skipping - no test user credentials provided");

  test("metrics remain consistent during navigation", async ({ page }) => {
    await signInAsTestUser(page);
    await waitForAudioEngine(page);
    await startPlaybackMobile(page);
    await page.waitForTimeout(3000);
    
    const beforeNav = await page.evaluate(() => {
      return {
        sessionId: (window as any).__playerDebug?.getPlaybackSessionId?.(),
        currentTime: (window as any).__playerDebug?.getAudioEngine?.()?.getCurrentTime?.(),
      };
    });
    
    // Navigate to profile
    const profileNav = page.locator('[data-testid="nav-profile"]');
    await profileNav.click();
    await page.waitForTimeout(2000);
    
    // Navigate back
    const channelsNav = page.locator('[data-testid="nav-channels"]');
    await channelsNav.click();
    await page.waitForTimeout(2000);
    
    const afterNav = await page.evaluate(() => {
      return {
        sessionId: (window as any).__playerDebug?.getPlaybackSessionId?.(),
        currentTime: (window as any).__playerDebug?.getAudioEngine?.()?.getCurrentTime?.(),
      };
    });
    
    console.log("[MOBILE] Before nav:", beforeNav);
    console.log("[MOBILE] After nav:", afterNav);
    
    // Session should be same, time should have progressed
    expect(afterNav.sessionId).toBe(beforeNav.sessionId);
    expect(afterNav.currentTime).toBeGreaterThan(beforeNav.currentTime);
    
    console.log("[MOBILE] ✅ Metrics stable through navigation");
  });
});
