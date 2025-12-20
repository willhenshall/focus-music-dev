import { test, expect, Page } from "@playwright/test";
import { loginAsUser } from "../../tests/helpers/auth";

/**
 * Next-track prefetch E2E (desktop).
 *
 * Goal: ensure we REQUEST prefetch for the upcoming track after playback begins.
 * This validates the sequencing bug fix (prefetch must not be overwritten by loadTrack()).
 *
 * Notes:
 * - This asserts the request signal exposed via window.__playerDebug.getMetrics().prefetch
 *   (does not depend on the media download completing, which is flaky in CI).
 */

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

async function forceStreamingEngine(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
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

  const channelsButton = page.locator('button:has-text("Channels")').first();
  const isVisible = await channelsButton.isVisible({ timeout: 2000 }).catch(() => false);
  if (isVisible) {
    await channelsButton.click({ force: true });
  }

  await channelCard.waitFor({ state: "visible", timeout: 20000 });
}

async function startPlaybackOnFirstChannel(page: Page): Promise<void> {
  const firstCard = page.locator("[data-channel-id]").first();
  await firstCard.waitFor({ state: "visible", timeout: 20000 });
  const playPauseButton = firstCard.locator('[data-testid="channel-play-pause"]');
  await expect(playPauseButton).toBeVisible({ timeout: 20000 });
  await playPauseButton.click({ force: true });
}

test.describe("Next Track Prefetch - Desktop", () => {
  test.setTimeout(120_000);
  test.skip(!hasTestCredentials, "Skipping: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await forceStreamingEngine(page);
    await loginAsUser(page);
    await navigateToChannelsIfNeeded(page);
  });

  test("requests prefetch for upcoming track after playback begins", async ({ page }) => {
    console.log("[NEXT_PREFETCH] Starting playback...");
    await startPlaybackOnFirstChannel(page);

    // Sanity: UI indicates playback is active.
    console.log("[NEXT_PREFETCH] Waiting for footer playing indicator...");
    await expect(page.locator('[data-testid="player-play-pause"]')).toHaveAttribute("data-playing", "true", { timeout: 30000 });

    const debugSnapshot = async () => {
      // Guard: if the page thread is busy, evaluate() can stall.
      // IMPORTANT: use a Node-side timeout (not page.waitForTimeout) so it still fires even if evaluate is wedged.
      const evalTimeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("debugSnapshot evaluate timeout")), 2000);
      });
      return await Promise.race([
        page.evaluate(() => {
          const dbg = (window as any).__playerDebug;
          const m = dbg?.getMetrics?.() ?? null;
          const list = dbg?.getPlaylist?.() ?? [];
          const idx = dbg?.getPlaylistIndex?.() ?? 0;
          return {
            playbackState: m?.playbackState ?? null,
            muted: m?.muted ?? null,
            currentTrackId: m?.currentTrackId ?? null,
            playbackSessionId: m?.playbackSessionId ?? null,
            playlistIndex: idx,
            playlistLength: list?.length ?? 0,
            nextTrackId: list?.[idx + 1]?.metadata?.track_id ?? null,
            prefetch: m?.prefetch ?? null,
          };
        }),
        evalTimeout,
      ]);
    };

    async function pollUntil(predicate: (snap: any) => boolean, timeoutMs: number, label: string) {
      const start = Date.now();
      let last: any = null;
      while (Date.now() - start < timeoutMs) {
        last = await debugSnapshot();
        if (predicate(last)) return last;
        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(500);
      }
      throw new Error(`Timed out waiting for ${label}. Debug: ${JSON.stringify(last)}`);
    }

    console.log("[NEXT_PREFETCH] Waiting for playlist to include a next track...");
    await pollUntil((s) => Boolean(s?.nextTrackId), 45_000, "next track in playlist");

    console.log("[NEXT_PREFETCH] Waiting for prefetch request to be recorded...");
    await pollUntil((s) => Boolean(s?.prefetch?.source === "next-track" && s?.prefetch?.trackId), 45_000, "prefetch request");
    console.log("[NEXT_PREFETCH] Prefetch request observed.");

    const snapshot = await page.evaluate(() => {
      const dbg = (window as any).__playerDebug;
      const list = dbg?.getPlaylist?.() ?? [];
      const idx = dbg?.getPlaylistIndex?.() ?? 0;
      const nextId = list?.[idx + 1]?.metadata?.track_id ?? null;
      const m = dbg?.getMetrics?.() ?? null;
      return {
        nextId: nextId ? String(nextId) : null,
        prefetch: m?.prefetch ?? null,
      };
    });

    expect(snapshot.nextId).not.toBeNull();
    expect(snapshot.prefetch).not.toBeNull();
    expect(snapshot.prefetch.source).toBe("next-track");
    expect(snapshot.prefetch.trackId).toBe(snapshot.nextId);

    // Regression guard (best-effort): try a skip and observe session advance without using waitForFunction.
    const skipButton = page.locator('[data-testid="player-next"], button[aria-label*="Skip"], button[aria-label*="Next"]').first();
    const canSkip = await skipButton.isVisible({ timeout: 2000 }).catch(() => false);
    if (canSkip) {
      const before = await page.evaluate(() => {
        const dbg = (window as any).__playerDebug;
        const m = dbg?.getMetrics?.() ?? null;
        return { session: m?.playbackSessionId ?? 0 };
      });
      await skipButton.click({ force: true }).catch(() => {});
      await pollUntil((s) => typeof s?.playbackSessionId === "number" && s.playbackSessionId !== before.session, 20_000, "playback session advance after skip");
    }
  });
});


