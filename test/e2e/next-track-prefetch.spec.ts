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

  const channelsButton = page.locator('button:has-text("Channels")').first();
  const isVisible = await channelsButton.isVisible({ timeout: 2000 }).catch(() => false);
  if (isVisible) {
    await channelsButton.click({ force: true });
  }

  await channelCard.waitFor({ state: "visible", timeout: 20000 });
}

async function startPlaybackOnFirstChannel(page: Page): Promise<void> {
  await page.locator("[data-channel-id]").first().click();
  const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
  await expect(playPauseButton).toBeVisible({ timeout: 20000 });
  await playPauseButton.click();
}

test.describe("Next Track Prefetch - Desktop", () => {
  test.skip(!hasTestCredentials, "Skipping: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await forceStreamingEngine(page);
    await loginAsUser(page);
    await navigateToChannelsIfNeeded(page);
  });

  test("requests prefetch for upcoming track after playback begins", async ({ page }) => {
    await startPlaybackOnFirstChannel(page);

    // Sanity: playback should not be muted once playing.
    await page.waitForFunction(() => {
      const dbg = (window as any).__playerDebug;
      const m = dbg?.getMetrics?.();
      return Boolean(m?.playbackState === "playing" && m?.muted === false);
    }, { timeout: 30000 });

    // Wait for playlist to have a next track.
    await page.waitForFunction(() => {
      const dbg = (window as any).__playerDebug;
      const list = dbg?.getPlaylist?.() ?? [];
      const idx = dbg?.getPlaylistIndex?.() ?? 0;
      return Boolean(list[idx] && list[idx + 1] && list[idx + 1]?.metadata?.track_id);
    }, { timeout: 30000 });

    // Wait for prefetch request to be recorded (context-level signal).
    await page.waitForFunction(() => {
      const dbg = (window as any).__playerDebug;
      const m = dbg?.getMetrics?.();
      return Boolean(m?.prefetch?.source === "next-track" && m?.prefetch?.trackId);
    }, { timeout: 30000 });

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
  });
});


