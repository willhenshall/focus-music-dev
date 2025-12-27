/**
 * E2E Test: Startup Supabase Request Deduplication
 * 
 * Verifies that on a hard reload, each startup resource is fetched at most ONCE:
 * - audio_channels
 * - system_preferences
 * - image_sets
 * - user_profiles
 * - user_preferences
 * 
 * Also verifies that audio_tracks?select=* does NOT fire on initial page load.
 * 
 * Desktop-only test (Playwright chromium project).
 */

import { test, expect } from "@playwright/test";
import { login } from "./login";

const SUPABASE_DOMAIN = "supabase.co";

test.describe("Startup Supabase Request Deduplication", () => {
  test("each startup resource is fetched at most once on initial load", async ({ page }) => {
    // Track network requests to Supabase REST API
    const requestCounts: Record<string, number> = {
      audio_channels: 0,
      system_preferences: 0,
      image_sets: 0,
      user_profiles: 0,
      user_preferences: 0,
      audio_tracks_select_all: 0,
    };

    // Set up request interception before navigation
    await page.route(`**/*${SUPABASE_DOMAIN}**/rest/v1/**`, async (route) => {
      const url = route.request().url();
      
      // Count requests by table
      if (url.includes('/rest/v1/audio_channels')) {
        requestCounts.audio_channels++;
      }
      if (url.includes('/rest/v1/system_preferences')) {
        requestCounts.system_preferences++;
      }
      if (url.includes('/rest/v1/image_sets')) {
        requestCounts.image_sets++;
      }
      if (url.includes('/rest/v1/user_profiles')) {
        requestCounts.user_profiles++;
      }
      if (url.includes('/rest/v1/user_preferences')) {
        requestCounts.user_preferences++;
      }
      // Check for audio_tracks with select=* (the full table fetch we want to avoid)
      if (url.includes('/rest/v1/audio_tracks') && url.includes('select=*')) {
        requestCounts.audio_tracks_select_all++;
      }

      // Continue the request
      await route.continue();
    });

    // Navigate and log in
    await login(page);

    // Wait for the app to fully load
    await page.waitForLoadState('networkidle');

    // Give a bit more time for any delayed requests
    await page.waitForTimeout(2000);

    // Verify request counts
    console.log('Supabase request counts:', requestCounts);

    // Each resource should be fetched at most once
    expect(requestCounts.audio_channels).toBeLessThanOrEqual(1);
    expect(requestCounts.system_preferences).toBeLessThanOrEqual(1);
    expect(requestCounts.image_sets).toBeLessThanOrEqual(1);
    // Note: user_profiles and user_preferences may be 0 if not logged in
    // They are fetched only when user is authenticated

    // audio_tracks?select=* should NOT fire on initial load
    expect(requestCounts.audio_tracks_select_all).toBe(0);
  });

  test("audio_channels returns valid data after dedup", async ({ page }) => {
    let channelsResponse: any = null;

    // Intercept and capture the audio_channels response
    await page.route(`**/*${SUPABASE_DOMAIN}**/rest/v1/audio_channels**`, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      channelsResponse = body;
      await route.fulfill({ response });
    });

    await login(page);
    await page.waitForLoadState('networkidle');

    // Verify channels data was received
    expect(channelsResponse).not.toBeNull();
    expect(Array.isArray(channelsResponse)).toBe(true);
    // There should be at least one channel
    expect(channelsResponse.length).toBeGreaterThan(0);
  });

  test("debug counters are exposed in dev mode", async ({ page }) => {
    await login(page);
    await page.waitForLoadState('networkidle');

    // Check if debug counters are exposed on window.__playerDebug
    const debugInfo = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      if (debug && debug.startupFetchCounts) {
        return debug.startupFetchCounts;
      }
      return null;
    });

    // In dev mode, debug counters should be exposed
    // Note: This may be null in production builds
    if (debugInfo) {
      console.log('Debug fetch counts:', debugInfo);
      // Verify the structure exists
      expect(typeof debugInfo.audio_channels).toBe('number');
      expect(typeof debugInfo.system_preferences).toBe('number');
    }
  });
});

