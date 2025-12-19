import { test, expect, Page } from "@playwright/test";
import { loginAsUser } from "../../tests/helpers/auth";

/**
 * Fast-start audio E2E (desktop).
 *
 * Measures: user play click -> first "playing" (exposed via window.__playerDebug.getMetrics().fastStart)
 *
 * Notes:
 * - Fast-start must be enabled (localStorage fastStartAudio=1)
 * - Threshold is configurable via FAST_START_MAX_MS; defaults to 500 locally, 1200 in CI.
 */

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

// CI is slower/noisier; keep strict by default but overrideable via FAST_START_MAX_MS.
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

async function navigateToChannelsIfNeeded(page: Page): Promise<void> {
  const channelCard = page.locator("[data-channel-id]").first();
  const isChannelVisible = await channelCard
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  if (isChannelVisible) return;

  // Desktop nav button
  const channelsButton = page.locator('button:has-text("Channels")').first();
  const isVisible = await channelsButton.isVisible({ timeout: 2000 }).catch(() => false);
  if (isVisible) {
    await channelsButton.click({ force: true });
  }

  await channelCard.waitFor({ state: "visible", timeout: 20000 });
}

async function waitForWarmPrefetchIfAvailable(page: Page): Promise<void> {
  // Best-effort: wait until engine reports a prefetched track (from prewarm).
  await page
    .waitForFunction(() => {
      const debug = (window as any).__playerDebug;
      const m = debug?.getMetrics?.();
      return Boolean(m?.prefetchedTrackId);
    }, { timeout: 20000 })
    .catch(() => {});

  // Prefer: wait until the active channel cache entry is marked prewarmed.
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
    // Select channel i
    await channelCards.nth(i).click();

    const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
    await expect(playPauseButton).toBeVisible({ timeout: 20000 });

    await playPauseButton.click();

    // Wait briefly for either fastStart metric OR some evidence playback started.
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

  // As a last resort, return the current debug snapshot to help diagnose.
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

test.describe("Fast Start Audio - Desktop", () => {
  test.skip(!hasTestCredentials, "Skipping: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await enableFastStart(page);
    await loginAsUser(page);
    await navigateToChannelsIfNeeded(page);
    await waitForWarmPrefetchIfAvailable(page);
  });

  test("first audio starts under threshold after play click", async ({ page }) => {
    const fastStart = await tryStartPlaybackAndGetFastStart(page);

    expect(fastStart).not.toBeNull();
    expect(typeof fastStart.firstAudioMs).toBe("number");
    expect(fastStart.firstAudioMs).toBeLessThanOrEqual(FAST_START_MAX_MS);
  });
});

