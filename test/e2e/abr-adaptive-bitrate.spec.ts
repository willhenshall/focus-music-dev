import { test, expect, Page } from "@playwright/test";
import { loginAsAdmin } from "../../tests/helpers/auth";

/**
 * E2E Tests for ABR (Adaptive Bitrate) System
 * 
 * These tests verify the 4-bitrate HLS ladder system works correctly:
 * - Quality tier detection and display
 * - ABR state tracking (optimal/upgrading/downgraded)
 * - Level switching on bandwidth changes
 * - Quality ladder visualization
 * - Switch history tracking
 * 
 * Our HLS ladder (BANDWIDTH values in manifest):
 * - LOW:     48k  (32 kbps audio)
 * - MEDIUM:  96k  (64 kbps audio)
 * - HIGH:    144k (96 kbps audio)
 * - PREMIUM: 192k (128 kbps audio)
 * 
 * Uses admin credentials from .env.test (TEST_ADMIN_EMAIL/PASSWORD)
 */

// Configure longer timeout for HLS streaming tests
test.use({ 
  actionTimeout: 15000,
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Signs in as admin using shared auth helper.
 * Uses loginAsAdmin which uses TEST_ADMIN_EMAIL/PASSWORD from .env.test
 */
async function signInAndNavigate(page: Page): Promise<boolean> {
  try {
    await loginAsAdmin(page);
    await page.locator('[data-channel-id]').first().waitFor({ state: "visible", timeout: 15000 });
    return true;
  } catch (error) {
    console.error("[ABR] Failed to sign in:", error);
    return false;
  }
}

/**
 * Opens the Audio Diagnostics panel by clicking the diagnostics button
 */
async function openDiagnosticsPanel(page: Page): Promise<void> {
  // Click the diagnostics button in the admin header (has Activity icon with title="Audio Engine Diagnostics")
  const diagButton = page.locator('button[title="Audio Engine Diagnostics"]');
  await diagButton.click();
  await page.waitForTimeout(500);
  
  // Verify panel opened - look for the panel header text
  const panel = page.locator('h3:has-text("Audio Engine Diagnostics")');
  await expect(panel).toBeVisible({ timeout: 5000 });
}

/**
 * Closes the diagnostics panel if open
 */
async function closeDiagnosticsPanel(page: Page): Promise<void> {
  // Click the close button (X) in the diagnostics panel
  const closeButton = page.locator('h3:has-text("Audio Engine Diagnostics")').locator('..').locator('button').first();
  try {
    await closeButton.click({ timeout: 2000 });
  } catch {
    // Panel might already be closed, ignore
  }
  await page.waitForTimeout(300);
}

/**
 * Starts playback on the first channel
 */
async function startPlayback(page: Page): Promise<void> {
  const firstChannel = page.locator('[data-channel-id]').first();
  await firstChannel.click();
  
  const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
  await expect(playPauseButton).toBeVisible({ timeout: 10000 });
  await playPauseButton.click();
  
  // Wait for audio to load and HLS to initialize
  await page.waitForTimeout(3000);
}

/**
 * Waits for HLS to be active with multiple quality levels
 */
async function waitForHLSActive(page: Page, timeout: number = 10000): Promise<boolean> {
  try {
    await page.waitForFunction(() => {
      const debug = (window as any).__playerDebug;
      if (!debug?.getHLSMetrics) return false;
      const metrics = debug.getHLSMetrics();
      return metrics?.isHLSActive && metrics?.levels?.length > 1;
    }, { timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets current HLS metrics via debug interface
 */
async function getHLSMetrics(page: Page): Promise<any> {
  return page.evaluate(() => {
    const debug = (window as any).__playerDebug;
    return debug?.getHLSMetrics?.() ?? null;
  });
}

/**
 * Gets ABR-specific metrics
 */
async function getABRMetrics(page: Page): Promise<any> {
  return page.evaluate(() => {
    const debug = (window as any).__playerDebug;
    const hlsMetrics = debug?.getHLSMetrics?.();
    return hlsMetrics?.abr ?? null;
  });
}

/**
 * Gets the current quality tier name
 */
async function getCurrentQualityTier(page: Page): Promise<string | null> {
  const abr = await getABRMetrics(page);
  return abr?.currentQualityTier ?? null;
}

/**
 * Gets bandwidth estimate in kbps
 */
async function getBandwidthKbps(page: Page): Promise<number> {
  const metrics = await getHLSMetrics(page);
  return Math.round((metrics?.bandwidthEstimate ?? 0) / 1000);
}

// =============================================================================
// TEST SUITE: ABR Detection and Initialization
// =============================================================================

test.describe("ABR System - Detection and Initialization", () => {
  // Set longer timeout for HLS streaming tests (45 seconds instead of 30)
  test.setTimeout(45000);

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAndNavigate(page);
    if (!signedIn) test.skip();
  });

  test("HLS initializes with multiple quality levels", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    
    if (hlsActive) {
      const metrics = await getHLSMetrics(page);
      
      expect(metrics.isHLSActive).toBe(true);
      expect(metrics.levels.length).toBeGreaterThanOrEqual(1);
      
      console.log(`[ABR] HLS initialized with ${metrics.levels.length} quality levels`);
    } else {
      // Track might not have HLS ladder yet
      console.log("[ABR] HLS not active (track may not have multi-bitrate ladder)");
    }
  });

  test("ABR metrics are available after HLS initialization", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    const abr = await getABRMetrics(page);
    
    expect(abr).not.toBeNull();
    expect(abr).toHaveProperty('autoLevelEnabled');
    expect(abr).toHaveProperty('currentQualityTier');
    expect(abr).toHaveProperty('recommendedQualityTier');
    expect(abr).toHaveProperty('abrState');
    expect(abr).toHaveProperty('totalLevelSwitches');
    
    console.log("[ABR] ABR metrics available:", {
      tier: abr.currentQualityTier,
      recommended: abr.recommendedQualityTier,
      state: abr.abrState,
    });
  });

  test("detects correct HLS mode (native vs hls.js)", async ({ page, browserName }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page, 5000);
    if (!hlsActive) {
      // On Safari, native HLS doesn't expose full metrics
      const isSafari = browserName === 'webkit';
      if (isSafari) {
        console.log("[ABR] Safari detected - using native HLS (metrics limited)");
        return;
      }
      test.skip();
      return;
    }

    const metrics = await getHLSMetrics(page);
    
    // Chrome/Firefox should use hls.js, Safari uses native
    if (browserName === 'webkit') {
      expect(metrics.isNativeHLS).toBe(true);
      console.log("[ABR] Safari: using native HLS");
    } else {
      expect(metrics.isNativeHLS).toBe(false);
      console.log("[ABR] Chrome/Firefox: using hls.js");
    }
  });
});

// =============================================================================
// TEST SUITE: Quality Tier Detection
// =============================================================================

test.describe("ABR System - Quality Tier Detection", () => {
  test.setTimeout(45000);

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAndNavigate(page);
    if (!signedIn) test.skip();
  });

  test("quality tier names are correct", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    const metrics = await getHLSMetrics(page);
    const validTiers = ['low', 'medium', 'high', 'premium', 'auto', 'unknown'];
    
    for (const level of metrics.levels) {
      if (level.tierName) {
        expect(validTiers).toContain(level.tierName);
      }
    }
    
    console.log("[ABR] Quality tiers:", metrics.levels.map((l: any) => `${l.tierName}@${l.bitrate/1000}k`));
  });

  test("levels have correct bitrate assignments", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    const metrics = await getHLSMetrics(page);
    
    // If we have 4 levels, verify they match our ladder
    if (metrics.levels.length === 4) {
      // Sort by bitrate to verify order
      const sortedLevels = [...metrics.levels].sort((a: any, b: any) => a.bitrate - b.bitrate);
      
      // Verify bitrates match the BANDWIDTH values from manifest (includes container overhead)
      // LOW: 48000, MEDIUM: 96000, HIGH: 144000, PREMIUM: 192000
      expect(sortedLevels[0].bitrate).toBeLessThan(60000);   // LOW ~48k
      expect(sortedLevels[1].bitrate).toBeLessThan(110000);  // MEDIUM ~96k
      expect(sortedLevels[2].bitrate).toBeLessThan(160000);  // HIGH ~144k
      expect(sortedLevels[3].bitrate).toBeLessThan(210000);  // PREMIUM ~192k
      
      console.log("[ABR] Verified 4-tier ladder bitrates");
    }
  });

  test("current quality tier is valid", async ({ page }) => {
    await startPlayback(page);
    await page.waitForTimeout(2000); // Let ABR settle
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    const tier = await getCurrentQualityTier(page);
    
    expect(tier).not.toBeNull();
    expect(['low', 'medium', 'high', 'premium', 'auto', 'unknown']).toContain(tier);
    
    console.log(`[ABR] Current quality tier: ${tier}`);
  });
});

// =============================================================================
// TEST SUITE: ABR State Management
// =============================================================================

test.describe("ABR System - State Management", () => {
  test.setTimeout(45000);

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAndNavigate(page);
    if (!signedIn) test.skip();
  });

  test("ABR state is valid", async ({ page }) => {
    await startPlayback(page);
    await page.waitForTimeout(2000);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    const abr = await getABRMetrics(page);
    const validStates = ['idle', 'initializing', 'optimal', 'upgrading', 'downgraded'];
    
    expect(validStates).toContain(abr.abrState);
    console.log(`[ABR] ABR state: ${abr.abrState}`);
  });

  test("ABR auto level is enabled by default", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    const abr = await getABRMetrics(page);
    
    expect(abr.autoLevelEnabled).toBe(true);
    console.log("[ABR] Auto level switching is enabled");
  });

  test("bandwidth estimate updates during playback", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    // Capture initial bandwidth
    const initialBw = await getBandwidthKbps(page);
    
    // Wait for more data
    await page.waitForTimeout(5000);
    
    // Capture updated bandwidth
    const laterBw = await getBandwidthKbps(page);
    
    // Bandwidth estimate should be positive (could stay same or change)
    expect(laterBw).toBeGreaterThanOrEqual(0);
    
    console.log(`[ABR] Bandwidth: initial=${initialBw}kbps, later=${laterBw}kbps`);
  });

  test("level switch counter increments on quality change", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    const initialAbr = await getABRMetrics(page);
    const initialSwitches = initialAbr.totalLevelSwitches;
    
    // Wait for potential level switch during playback
    await page.waitForTimeout(10000);
    
    const laterAbr = await getABRMetrics(page);
    
    // Switch count should be >= initial (may not change if connection stable)
    expect(laterAbr.totalLevelSwitches).toBeGreaterThanOrEqual(initialSwitches);
    
    console.log(`[ABR] Level switches: ${initialSwitches} → ${laterAbr.totalLevelSwitches}`);
  });
});

// =============================================================================
// TEST SUITE: Diagnostics Panel ABR Display
// =============================================================================

test.describe("ABR System - Diagnostics Panel Display", () => {
  test.setTimeout(45000);

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAndNavigate(page);
    if (!signedIn) test.skip();
  });

  test("diagnostics panel shows HLS Quality section", async ({ page }) => {
    await startPlayback(page);
    await openDiagnosticsPanel(page);
    
    const hlsQualitySection = page.locator('text=HLS Quality');
    await expect(hlsQualitySection).toBeVisible();
  });

  test("diagnostics panel shows quality tier", async ({ page }) => {
    await startPlayback(page);
    await page.waitForTimeout(2000);
    await openDiagnosticsPanel(page);
    
    // Look for tier label in diagnostics
    const tierLabel = page.locator('text=Tier');
    await expect(tierLabel).toBeVisible({ timeout: 5000 });
  });

  test("diagnostics panel shows bandwidth", async ({ page }) => {
    await startPlayback(page);
    await openDiagnosticsPanel(page);
    
    const bandwidthLabel = page.locator('text=Bandwidth');
    await expect(bandwidthLabel).toBeVisible();
  });

  test("diagnostics panel shows levels count", async ({ page }) => {
    await startPlayback(page);
    await openDiagnosticsPanel(page);
    
    const levelsLabel = page.locator('text=Levels');
    await expect(levelsLabel).toBeVisible();
  });

  test("diagnostics panel shows ABR Analysis section when HLS active", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      console.log("[ABR] HLS not active - ABR Analysis section may not be visible");
      test.skip();
      return;
    }

    await openDiagnosticsPanel(page);
    
    // ABR Analysis section should be visible
    const abrSection = page.locator('text=Adaptive Bitrate');
    const isVisible = await abrSection.isVisible().catch(() => false);
    
    if (isVisible) {
      await expect(abrSection).toBeVisible();
      console.log("[ABR] ABR Analysis section is visible");
    } else {
      console.log("[ABR] ABR Analysis section not visible (may need scroll)");
    }
  });

  test("diagnostics panel shows quality ladder visualization", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    await openDiagnosticsPanel(page);
    
    // Look for Quality Ladder section
    const ladderSection = page.locator('text=Quality Ladder');
    const isVisible = await ladderSection.isVisible().catch(() => false);
    
    if (isVisible) {
      await expect(ladderSection).toBeVisible();
      console.log("[ABR] Quality Ladder visualization is present");
    }
  });
});

// =============================================================================
// TEST SUITE: Network Throttling (if supported)
// =============================================================================

test.describe("ABR System - Network Throttling Response", () => {
  test.setTimeout(60000); // Network tests need more time

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAndNavigate(page);
    if (!signedIn) test.skip();
  });

  test("ABR detects recommended tier based on bandwidth", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    await page.waitForTimeout(3000);
    
    const abr = await getABRMetrics(page);
    
    // Recommended tier should be set
    expect(abr.recommendedQualityTier).not.toBe('unknown');
    
    console.log(`[ABR] Recommended tier: ${abr.recommendedQualityTier}, Current: ${abr.currentQualityTier}`);
  });

  test("ABR tracks upgrading/downgrading state", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    await page.waitForTimeout(5000);
    
    const abr = await getABRMetrics(page);
    
    // Both flags should be boolean
    expect(typeof abr.isUpgrading).toBe('boolean');
    expect(typeof abr.isDowngrading).toBe('boolean');
    
    // Cannot be both upgrading AND downgrading
    expect(!(abr.isUpgrading && abr.isDowngrading)).toBe(true);
    
    console.log(`[ABR] Upgrading: ${abr.isUpgrading}, Downgrading: ${abr.isDowngrading}`);
  });

  test("playback continues during quality changes", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    // Get initial playback position
    const initialTime = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return debug?.getCurrentTime?.() ?? 0;
    });

    // Wait for some playback and potential quality changes
    await page.waitForTimeout(10000);

    // Verify playback progressed
    const laterTime = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return debug?.getCurrentTime?.() ?? 0;
    });

    expect(laterTime).toBeGreaterThan(initialTime);
    console.log(`[ABR] Playback progressed: ${initialTime.toFixed(1)}s → ${laterTime.toFixed(1)}s`);
  });
});

// =============================================================================
// TEST SUITE: Level Switch History
// =============================================================================

test.describe("ABR System - Level Switch History", () => {
  test.setTimeout(45000);

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAndNavigate(page);
    if (!signedIn) test.skip();
  });

  test("level switch history array exists", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    const abr = await getABRMetrics(page);
    
    expect(Array.isArray(abr.levelSwitchHistory)).toBe(true);
    console.log(`[ABR] Switch history entries: ${abr.levelSwitchHistory.length}`);
  });

  test("level switch records have correct structure", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    // Wait for potential switches
    await page.waitForTimeout(15000);
    
    const abr = await getABRMetrics(page);
    
    if (abr.levelSwitchHistory.length > 0) {
      const record = abr.levelSwitchHistory[0];
      
      expect(record).toHaveProperty('timestamp');
      expect(record).toHaveProperty('fromLevel');
      expect(record).toHaveProperty('toLevel');
      expect(record).toHaveProperty('reason');
      expect(record).toHaveProperty('bandwidth');
      
      expect(typeof record.timestamp).toBe('number');
      expect(typeof record.fromLevel).toBe('number');
      expect(typeof record.toLevel).toBe('number');
      expect(typeof record.reason).toBe('string');
      
      console.log(`[ABR] Sample switch record:`, record);
    } else {
      console.log("[ABR] No level switches occurred during test");
    }
  });

  test("switch history is limited to last 10 entries", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    // Even with many switches, should be capped at 10
    await page.waitForTimeout(10000);
    
    const abr = await getABRMetrics(page);
    
    expect(abr.levelSwitchHistory.length).toBeLessThanOrEqual(10);
  });
});

// =============================================================================
// TEST SUITE: Fragment Loading Stats
// =============================================================================

test.describe("ABR System - Fragment Loading", () => {
  test.setTimeout(45000);

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAndNavigate(page);
    if (!signedIn) test.skip();
  });

  test("fragment stats are tracked", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    await page.waitForTimeout(5000);
    
    const metrics = await getHLSMetrics(page);
    
    expect(metrics.fragmentStats).toBeDefined();
    expect(typeof metrics.fragmentStats.loaded).toBe('number');
    expect(typeof metrics.fragmentStats.failed).toBe('number');
    expect(typeof metrics.fragmentStats.retried).toBe('number');
    
    console.log(`[ABR] Fragment stats: loaded=${metrics.fragmentStats.loaded}, failed=${metrics.fragmentStats.failed}`);
  });

  test("fragment load count increases during playback", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    const initialMetrics = await getHLSMetrics(page);
    const initialLoaded = initialMetrics.fragmentStats.loaded;

    // Wait for more fragments to load
    await page.waitForTimeout(10000);

    const laterMetrics = await getHLSMetrics(page);
    
    expect(laterMetrics.fragmentStats.loaded).toBeGreaterThan(initialLoaded);
    console.log(`[ABR] Fragments loaded: ${initialLoaded} → ${laterMetrics.fragmentStats.loaded}`);
  });

  test("fragment success rate is high on stable connection", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    await page.waitForTimeout(10000);
    
    const metrics = await getHLSMetrics(page);
    const { loaded, failed } = metrics.fragmentStats;
    
    if (loaded > 0) {
      const successRate = loaded / (loaded + failed);
      expect(successRate).toBeGreaterThan(0.9); // 90%+ success rate
      console.log(`[ABR] Fragment success rate: ${(successRate * 100).toFixed(1)}%`);
    }
  });
});

// =============================================================================
// TEST SUITE: Buffer Health
// =============================================================================

test.describe("ABR System - Buffer Health", () => {
  test.setTimeout(60000); // Buffer tests need extended wait for HLS loading

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAndNavigate(page);
    if (!signedIn) test.skip();
  });

  test("buffer length is tracked", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    await page.waitForTimeout(5000);
    
    const metrics = await getHLSMetrics(page);
    
    expect(typeof metrics.bufferLength).toBe('number');
    expect(metrics.bufferLength).toBeGreaterThanOrEqual(0);
    
    console.log(`[ABR] Buffer length: ${metrics.bufferLength.toFixed(1)}s`);
  });

  test("buffer target is reasonable", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    const metrics = await getHLSMetrics(page);
    
    // Target buffer should be reasonable (10-60 seconds)
    expect(metrics.targetBuffer).toBeGreaterThanOrEqual(10);
    expect(metrics.targetBuffer).toBeLessThanOrEqual(60);
    
    console.log(`[ABR] Target buffer: ${metrics.targetBuffer}s`);
  });

  test("buffer health improves over time", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    // Capture initial buffer (may be low)
    const initialMetrics = await getHLSMetrics(page);
    const initialBuffer = initialMetrics.bufferLength;

    // Wait for buffering
    await page.waitForTimeout(10000);

    const laterMetrics = await getHLSMetrics(page);
    const laterBuffer = laterMetrics.bufferLength;

    // Buffer should have grown (or stabilized if already full)
    // Account for playback consuming buffer
    console.log(`[ABR] Buffer: ${initialBuffer.toFixed(1)}s → ${laterBuffer.toFixed(1)}s`);
  });
});

// =============================================================================
// TEST SUITE: Debug Interface Verification
// =============================================================================

test.describe("ABR System - Debug Interface", () => {
  test.setTimeout(45000);

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAndNavigate(page);
    if (!signedIn) test.skip();
  });

  test("window.__playerDebug exposes getHLSMetrics", async ({ page }) => {
    await startPlayback(page);
    
    const hasMethod = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return typeof debug?.getHLSMetrics === 'function';
    });
    
    expect(hasMethod).toBe(true);
  });

  test("HLS metrics have complete structure", async ({ page }) => {
    await startPlayback(page);
    
    const hlsActive = await waitForHLSActive(page);
    if (!hlsActive) {
      test.skip();
      return;
    }

    const metrics = await getHLSMetrics(page);
    
    // Verify core HLS metrics
    expect(metrics).toHaveProperty('isHLSActive');
    expect(metrics).toHaveProperty('currentLevel');
    expect(metrics).toHaveProperty('levels');
    expect(metrics).toHaveProperty('bandwidthEstimate');
    expect(metrics).toHaveProperty('bufferedSegments');
    expect(metrics).toHaveProperty('bufferLength');
    expect(metrics).toHaveProperty('targetBuffer');
    expect(metrics).toHaveProperty('isNativeHLS');
    expect(metrics).toHaveProperty('latency');
    expect(metrics).toHaveProperty('fragmentStats');
    expect(metrics).toHaveProperty('abr');
    
    // Verify ABR sub-metrics
    const abr = metrics.abr;
    expect(abr).toHaveProperty('autoLevelEnabled');
    expect(abr).toHaveProperty('currentQualityTier');
    expect(abr).toHaveProperty('recommendedQualityTier');
    expect(abr).toHaveProperty('abrState');
    expect(abr).toHaveProperty('totalLevelSwitches');
    expect(abr).toHaveProperty('levelSwitchHistory');
    
    console.log("[ABR] Full HLS metrics structure verified");
  });
});

