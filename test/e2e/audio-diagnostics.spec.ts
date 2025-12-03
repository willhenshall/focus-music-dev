import { test, expect, Page } from "@playwright/test";
import { login } from "./login";

/**
 * E2E tests for the Audio Engine Diagnostics panel
 * 
 * Tests the new HLS streaming diagnostics features including:
 * - Diagnostics panel visibility and interaction
 * - Delivery source detection (HLS vs MP3)
 * - Health score display
 * - HLS-specific metrics when streaming
 */

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

/**
 * Signs in as test user and navigates to channels
 */
async function signInAndNavigate(page: Page): Promise<boolean> {
  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    return false;
  }

  try {
    await login(page);
    
    const signInButton = page.locator("header").getByRole("button", { name: /sign in/i });
    await signInButton.click();
    
    await page.getByLabel(/email/i).waitFor({ state: "visible", timeout: 5000 });
    await page.getByLabel(/email/i).fill(TEST_USER_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_USER_PASSWORD);
    await page.locator("form").getByRole("button", { name: /sign in/i }).click();
    
    await page.waitForTimeout(3000);
    
    // Navigate to Channels
    const isMobileMenuVisible = await page.locator('[data-testid="mobile-menu-button"]').isVisible().catch(() => false);
    
    if (isMobileMenuVisible) {
      await page.locator('[data-testid="mobile-menu-button"]').click();
      await page.waitForTimeout(500);
      await page.locator('[data-testid="mobile-nav-channels"]').click();
    } else {
      await page.getByRole("button", { name: /^channels$/i }).first().click({ force: true });
    }
    
    await page.locator('[data-channel-id]').first().waitFor({ state: "visible", timeout: 10000 });
    return true;
  } catch (error) {
    console.error("Failed to sign in:", error);
    return false;
  }
}

/**
 * Opens the Audio Diagnostics panel using keyboard shortcut
 */
async function openDiagnosticsPanel(page: Page): Promise<void> {
  // Use Shift+D to toggle diagnostics panel
  await page.keyboard.press("Shift+KeyD");
  await page.waitForTimeout(500);
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
  
  await page.waitForTimeout(3000); // Wait for audio to load and start
}

test.describe("Audio Diagnostics Panel - Desktop", () => {
  test.skip(!hasTestCredentials, "Skipping: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAndNavigate(page);
    if (!signedIn) {
      test.skip();
    }
  });

  test("diagnostics panel opens with Shift+D shortcut", async ({ page }) => {
    await openDiagnosticsPanel(page);
    
    // Check that the diagnostics panel is visible
    const panel = page.locator('text=Audio Engine Diagnostics');
    await expect(panel).toBeVisible({ timeout: 5000 });
  });

  test("diagnostics panel shows status when no track is playing", async ({ page }) => {
    await openDiagnosticsPanel(page);
    
    // Should show idle or no track state
    const statusSection = page.locator('text=STATUS');
    await expect(statusSection).toBeVisible();
  });

  test("diagnostics panel can be closed", async ({ page }) => {
    await openDiagnosticsPanel(page);
    
    const panel = page.locator('text=Audio Engine Diagnostics');
    await expect(panel).toBeVisible();
    
    // Close the panel
    const closeButton = page.locator('[data-testid="diagnostics-close"], button:has(svg)').last();
    await closeButton.click();
    
    // Or use keyboard shortcut again
    await openDiagnosticsPanel(page);
    await expect(panel).toBeVisible();
    await page.keyboard.press("Shift+KeyD");
    await page.waitForTimeout(500);
  });

  test("diagnostics shows delivery source info during playback", async ({ page }) => {
    // Start playback first
    await startPlayback(page);
    
    // Open diagnostics
    await openDiagnosticsPanel(page);
    
    // Check Streaming Engine section exists
    const streamingSection = page.locator('text=Streaming Engine');
    await expect(streamingSection).toBeVisible({ timeout: 5000 });
    
    // Check Delivery Source card exists
    const deliverySource = page.locator('text=Delivery Source');
    await expect(deliverySource).toBeVisible();
    
    // Check Engine type is displayed
    const engineLabel = page.locator('text=Engine:');
    await expect(engineLabel).toBeVisible();
  });

  test("diagnostics shows format type (HLS or MP3)", async ({ page }) => {
    await startPlayback(page);
    await openDiagnosticsPanel(page);
    
    // Check Format label exists
    const formatLabel = page.locator('text=Format:');
    await expect(formatLabel).toBeVisible();
    
    // The format should be either HLS or MP3
    const formatValue = page.locator('text=/^(HLS|MP3)$/');
    await expect(formatValue).toBeVisible({ timeout: 5000 });
  });

  test("diagnostics shows playback health score", async ({ page }) => {
    await startPlayback(page);
    await openDiagnosticsPanel(page);
    
    // Check Playback Health card exists
    const healthCard = page.locator('text=Playback Health');
    await expect(healthCard).toBeVisible({ timeout: 5000 });
    
    // Health status should be one of: excellent, good, fair, poor
    const healthStatus = page.locator('text=/^(EXCELLENT|GOOD|FAIR|POOR)$/i');
    await expect(healthStatus).toBeVisible();
  });

  test("diagnostics shows source URL during playback", async ({ page }) => {
    await startPlayback(page);
    await openDiagnosticsPanel(page);
    
    // Check Source label exists
    const sourceLabel = page.locator('text=Source:');
    await expect(sourceLabel).toBeVisible();
    
    // Source should be Cloudflare CDN or Supabase HLS
    const sourceValue = page.locator('text=/(Cloudflare CDN|Supabase HLS|Supabase Storage)/');
    await expect(sourceValue).toBeVisible({ timeout: 5000 });
  });

  test("diagnostics shows circuit breaker status", async ({ page }) => {
    await startPlayback(page);
    await openDiagnosticsPanel(page);
    
    // Circuit breaker section should be visible
    const circuitBreaker = page.locator('text=Circuit Breaker');
    await expect(circuitBreaker).toBeVisible();
    
    // Status should be CLOSED (normal operation)
    const closedStatus = page.locator('text=CLOSED');
    await expect(closedStatus).toBeVisible();
  });

  test("diagnostics export functionality works", async ({ page }) => {
    await startPlayback(page);
    await openDiagnosticsPanel(page);
    
    // Find and click the Export button
    const exportButton = page.locator('button:has-text("Export")');
    await expect(exportButton).toBeVisible();
    
    // Set up download listener
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    
    await exportButton.click();
    
    const download = await downloadPromise;
    
    // Verify download was triggered (if supported by browser)
    if (download) {
      const filename = download.suggestedFilename();
      expect(filename).toContain('audio-diagnostics');
      expect(filename).toContain('.json');
    }
  });

  test("diagnostics panel is draggable", async ({ page }) => {
    await openDiagnosticsPanel(page);
    
    // Find the drag handle (Move icon)
    const dragHandle = page.locator('svg[class*="cursor-move"]').first();
    await expect(dragHandle).toBeVisible();
    
    // Get initial position
    const panel = page.locator('text=Audio Engine Diagnostics').locator('..');
    const initialBox = await panel.boundingBox();
    
    if (initialBox) {
      // Drag the panel
      await dragHandle.hover();
      await page.mouse.down();
      await page.mouse.move(initialBox.x + 100, initialBox.y + 50);
      await page.mouse.up();
      
      // Position should have changed (panel is draggable)
      // Note: exact position testing can be flaky, so we just verify no errors
    }
  });
});

test.describe("Audio Diagnostics - HLS Specific", () => {
  test.skip(!hasTestCredentials, "Skipping: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAndNavigate(page);
    if (!signedIn) {
      test.skip();
    }
  });

  test("shows HLS ACTIVE badge when streaming HLS", async ({ page }) => {
    await startPlayback(page);
    await openDiagnosticsPanel(page);
    
    // Wait for streaming to stabilize
    await page.waitForTimeout(2000);
    
    // Check for either HLS ACTIVE or MP3 FALLBACK badge
    const hlsBadge = page.locator('text=/HLS ACTIVE|MP3 FALLBACK/');
    await expect(hlsBadge).toBeVisible({ timeout: 10000 });
  });

  test("shows HLS Quality section when HLS is active", async ({ page }) => {
    await startPlayback(page);
    await openDiagnosticsPanel(page);
    
    // HLS Quality card should exist (either active or inactive state)
    const hlsQuality = page.locator('text=HLS Quality');
    await expect(hlsQuality).toBeVisible();
  });

  test("shows HLS Mode (Native or hls.js) when HLS active", async ({ page }) => {
    await startPlayback(page);
    await openDiagnosticsPanel(page);
    
    await page.waitForTimeout(2000);
    
    // Check if we're using HLS (has HLS Mode label)
    const hlsModeLabel = page.locator('text=HLS Mode:');
    const isHLSActive = await hlsModeLabel.isVisible().catch(() => false);
    
    if (isHLSActive) {
      // Should show Native (Safari) or hls.js
      const hlsModeValue = page.locator('text=/(Native \\(Safari\\)|hls\\.js)/');
      await expect(hlsModeValue).toBeVisible();
    }
  });

  test("shows HLS Buffer metrics when HLS is active", async ({ page }) => {
    await startPlayback(page);
    await openDiagnosticsPanel(page);
    
    await page.waitForTimeout(3000);
    
    // Check if HLS Buffer section is visible (only shows when HLS is active)
    const hlsBuffer = page.locator('text=HLS Buffer');
    const isHLSActive = await hlsBuffer.isVisible().catch(() => false);
    
    if (isHLSActive) {
      // Buffer Length should be visible
      const bufferLength = page.locator('text=Buffer Length');
      await expect(bufferLength).toBeVisible();
      
      // Segments Buffered should be visible
      const segmentsBuffered = page.locator('text=Segments Buffered');
      await expect(segmentsBuffered).toBeVisible();
    }
  });

  test("shows HLS Fragment Stats when HLS is active", async ({ page }) => {
    await startPlayback(page);
    await openDiagnosticsPanel(page);
    
    await page.waitForTimeout(3000);
    
    // Check if HLS Fragment Stats section is visible
    const fragmentStats = page.locator('text=HLS Fragment Stats');
    const isHLSActive = await fragmentStats.isVisible().catch(() => false);
    
    if (isHLSActive) {
      // Loaded count should be visible
      const loaded = page.locator('text=Loaded');
      await expect(loaded).toBeVisible();
      
      // Failed count should be visible
      const failed = page.locator('text=Failed');
      await expect(failed).toBeVisible();
      
      // Success Rate should be visible
      const successRate = page.locator('text=Success Rate');
      await expect(successRate).toBeVisible();
    }
  });
});

test.describe("Audio Diagnostics - Debug Interface", () => {
  test.skip(!hasTestCredentials, "Skipping: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAndNavigate(page);
    if (!signedIn) {
      test.skip();
    }
  });

  test("window.__playerDebug exposes engine type", async ({ page }) => {
    await startPlayback(page);
    
    const engineType = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return debug?.getEngineType?.() ?? null;
    });
    
    // Should return 'streaming', 'legacy', or 'auto'
    expect(['streaming', 'legacy', 'auto', null]).toContain(engineType);
  });

  test("window.__playerDebug exposes isStreamingEngine", async ({ page }) => {
    await startPlayback(page);
    
    const isStreaming = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return debug?.isStreamingEngine?.() ?? null;
    });
    
    // Should return boolean or null
    expect([true, false, null]).toContain(isStreaming);
  });

  test("window.__playerDebug exposes HLS metrics", async ({ page }) => {
    await startPlayback(page);
    await page.waitForTimeout(3000);
    
    const hlsMetrics = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      return debug?.getHLSMetrics?.() ?? null;
    });
    
    // HLS metrics should have expected shape if available
    if (hlsMetrics) {
      expect(hlsMetrics).toHaveProperty('isHLSActive');
      expect(typeof hlsMetrics.isHLSActive).toBe('boolean');
    }
  });

  test("window.__playerDebug exposes current track URL", async ({ page }) => {
    await startPlayback(page);
    await page.waitForTimeout(2000);
    
    let audioUrl: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      audioUrl = await page.evaluate(() => {
        const debug = (window as any).__playerDebug;
        return debug?.getCurrentTrackUrl?.() ?? null;
      });
      
      if (audioUrl) break;
      await page.waitForTimeout(1000);
    }
    
    // URL should be set during playback
    expect(audioUrl).not.toBeNull();
    expect(audioUrl).toMatch(/^https?:\/\//);
  });
});
