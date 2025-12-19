import { test, expect, Page } from "@playwright/test";
import { login } from "./login";

/**
 * Fast-start audio E2E (mobile).
 *
 * Measures: user tap play -> first "playing" (via window.__playerDebug.getMetrics().fastStart)
 *
 * Threshold is configurable via FAST_START_MAX_MS; defaults to 500 locally, 1200 in CI.
 */

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

// CI is typically slower/noisier (shared runners, throttling, cold caches).
// Keep it overrideable via FAST_START_MAX_MS.
// Keep strict by default but overrideable via FAST_START_MAX_MS.
const FAST_START_MAX_MS = Number(
  process.env.FAST_START_MAX_MS ?? (process.env.CI ? "1200" : "500")
);

async function enableFastStart(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("fastStartAudio", "1");
      localStorage.setItem("audioEngineType", "streaming");
    } catch {}
  });
}

async function signInAsTestUserMobile(page: Page): Promise<void> {
  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    throw new Error("Missing TEST_USER_EMAIL/TEST_USER_PASSWORD");
  }

  await login(page);

  // Click Sign In from landing header
  const signInButton = page.locator("header").getByRole("button", { name: /sign in/i });
  await signInButton.tap();

  // Wait for auth form
  await page.getByLabel(/email/i).waitFor({ state: "visible", timeout: 15000 });
  await page.getByLabel(/email/i).fill(TEST_USER_EMAIL);
  await page.getByLabel(/password/i).fill(TEST_USER_PASSWORD);
  await page.locator("form").getByRole("button", { name: /sign in/i }).tap();

  // Mobile dashboard shows hamburger menu
  await page.locator('[data-testid="mobile-menu-button"]').waitFor({ state: "visible", timeout: 30000 });
}

async function navigateToChannelsIfNeeded(page: Page): Promise<void> {
  const channelCard = page.locator("[data-channel-id]").first();
  const isChannelVisible = await channelCard
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  if (isChannelVisible) return;

  // Mobile: open hamburger menu if present and tap Channels
  const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]');
  const hasMobileMenu = await mobileMenuButton.isVisible({ timeout: 2000 }).catch(() => false);
  if (hasMobileMenu) {
    await mobileMenuButton.tap();
    await page.waitForTimeout(300);
    const mobileChannels = page.locator('[data-testid="mobile-nav-channels"]');
    await mobileChannels.waitFor({ state: "visible", timeout: 10000 });
    await mobileChannels.tap();
  } else {
    // Fallback to desktop-style button if rendered
    const channelsButton = page.locator('button:has-text("Channels")').first();
    const isVisible = await channelsButton.isVisible({ timeout: 2000 }).catch(() => false);
    if (isVisible) await channelsButton.click({ force: true });
  }

  await channelCard.waitFor({ state: "visible", timeout: 20000 });
}

async function waitForWarmPrefetchIfAvailable(page: Page): Promise<void> {
  await page
    .waitForFunction(() => {
      const debug = (window as any).__playerDebug;
      const m = debug?.getMetrics?.();
      return Boolean(m?.prefetchedTrackId);
    }, { timeout: 20000 })
    .catch(() => {});

  await page
    .waitForFunction(() => {
      const debug = (window as any).__playerDebug;
      const cache = debug?.getMetrics?.()?.fastStartCache;
      return Boolean(cache?.entry?.prewarmedAt);
    }, { timeout: 20000 })
    .catch(() => {});
}

async function tryStartPlaybackAndGetFastStart(page: Page): Promise<any> {
  const channelCards = page.locator("[data-channel-id]");
  const count = await channelCards.count();

  // Keep attempts bounded so we stay within Playwright's default 30s test timeout.
  const maxAttempts = Math.min(3, count);
  for (let i = 0; i < maxAttempts; i++) {
    await channelCards.nth(i).tap();

    // Wait for this channel to be prewarmed (best-effort, but improves determinism).
    await page
      .waitForFunction(() => {
        const debug = (window as any).__playerDebug;
        const cache = debug?.getMetrics?.()?.fastStartCache;
        return Boolean(cache?.entry?.prewarmedAt);
      }, { timeout: 20000 })
      .catch(() => {});

    const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
    await expect(playPauseButton).toBeVisible({ timeout: 20000 });
    await playPauseButton.tap();

    await page
      .waitForFunction(() => {
        const debug = (window as any).__playerDebug;
        const m = debug?.getMetrics?.();
        const fastStart = m?.fastStart;
        const hasFastStart = Boolean(fastStart && typeof fastStart.firstAudioMs === "number");
        const isPlaying = debug?.getTransportState?.() === "playing" || m?.playbackState === "playing";
        const hasUrl = Boolean(m?.currentTrackUrl);
        return hasFastStart || (isPlaying && hasUrl);
      }, { timeout: 6000 })
      .catch(() => {});

    const snapshot = await page.evaluate(() => {
      const debug = (window as any).__playerDebug;
      const m = debug?.getMetrics?.() ?? null;
      return {
        fastStart: m?.fastStart ?? null,
        playbackState: m?.playbackState ?? null,
        currentTrackUrl: m?.currentTrackUrl ?? null,
        currentTrackId: m?.currentTrackId ?? null,
        playbackSessionId: m?.playbackSessionId ?? null,
      };
    });

    if (snapshot.fastStart && typeof snapshot.fastStart.firstAudioMs === "number") {
      return snapshot.fastStart;
    }
  }

  return page.evaluate(() => {
    const debug = (window as any).__playerDebug;
    const m = debug?.getMetrics?.() ?? null;
    return {
      fastStart: m?.fastStart ?? null,
      playbackState: m?.playbackState ?? null,
      currentTrackUrl: m?.currentTrackUrl ?? null,
      currentTrackId: m?.currentTrackId ?? null,
      playbackSessionId: m?.playbackSessionId ?? null,
    };
  });
}

test.describe("Fast Start Audio - Mobile", () => {
  // Allow time for prewarm + playback on mobile emulation without changing thresholds.
  test.setTimeout(120_000);
  test.use({
    // Ensure touch semantics even if project config changes
    hasTouch: true,
  });

  test.skip(!hasTestCredentials, "Skipping: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await enableFastStart(page);
    await signInAsTestUserMobile(page);
    await navigateToChannelsIfNeeded(page);
    await waitForWarmPrefetchIfAvailable(page);
  });

  test("first audio starts under threshold after play tap", async ({ page }) => {
    const fastStart = await tryStartPlaybackAndGetFastStart(page);

    expect(fastStart).not.toBeNull();
    expect(typeof fastStart.firstAudioMs).toBe("number");
    expect(fastStart.firstAudioMs).toBeLessThanOrEqual(FAST_START_MAX_MS);
  });
});

