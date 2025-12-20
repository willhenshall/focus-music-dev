import { test, expect, Page } from "@playwright/test";
import { login } from "./login";

/**
 * Next-track prefetch E2E (mobile).
 *
 * Goal: ensure we REQUEST prefetch for the upcoming track after playback begins.
 * This validates the sequencing bug fix (prefetch must not be overwritten by loadTrack()).
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

async function signInAsTestUserMobile(page: Page): Promise<void> {
  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    throw new Error("Missing TEST_USER_EMAIL/TEST_USER_PASSWORD");
  }

  await login(page);

  const signInButton = page.locator("header").getByRole("button", { name: /sign in/i });
  await signInButton.tap();

  await page.getByLabel(/email/i).waitFor({ state: "visible", timeout: 15000 });
  await page.getByLabel(/email/i).fill(TEST_USER_EMAIL);
  await page.getByLabel(/password/i).fill(TEST_USER_PASSWORD);
  await page.locator("form").getByRole("button", { name: /sign in/i }).tap();

  await page.locator('[data-testid="mobile-menu-button"]').waitFor({ state: "visible", timeout: 30000 });
}

async function navigateToChannelsIfNeeded(page: Page): Promise<void> {
  const channelCard = page.locator("[data-channel-id]").first();
  const isChannelVisible = await channelCard
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  if (isChannelVisible) return;

  const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]');
  const hasMobileMenu = await mobileMenuButton.isVisible({ timeout: 2000 }).catch(() => false);
  if (hasMobileMenu) {
    await mobileMenuButton.tap();
    await page.waitForTimeout(300);
    const mobileChannels = page.locator('[data-testid="mobile-nav-channels"]');
    await mobileChannels.waitFor({ state: "visible", timeout: 10000 });
    await mobileChannels.tap();
  } else {
    const channelsButton = page.locator('button:has-text("Channels")').first();
    const isVisible = await channelsButton.isVisible({ timeout: 2000 }).catch(() => false);
    if (isVisible) await channelsButton.click({ force: true });
  }

  await channelCard.waitFor({ state: "visible", timeout: 20000 });
}

async function startPlaybackOnFirstChannel(page: Page): Promise<void> {
  // Mobile UI: tapping the card itself triggers toggleChannel(channel, true) for inactive channels.
  await page.locator("[data-channel-id]").first().click({ force: true });

  // Ensure the UI reflects "playing" (state-level, not actual audio output).
  await page.locator('[data-testid="channel-play-pause"][data-playing="true"]').waitFor({
    state: "visible",
    timeout: 30000,
  });
}

test.describe("Next Track Prefetch - Mobile", () => {
  test.setTimeout(120_000);
  test.use({ hasTouch: true });

  test.skip(!hasTestCredentials, "Skipping: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await forceStreamingEngine(page);
    await signInAsTestUserMobile(page);
    await navigateToChannelsIfNeeded(page);
  });

  test("requests prefetch for upcoming track after playback begins", async ({ page }) => {
    await startPlaybackOnFirstChannel(page);

    // Sanity: playback pipeline should not remain muted after a user gesture.
    // (Playwright mobile emulation isn't always reliable at reaching playbackState="playing".)
    await page.waitForFunction(() => {
      const dbg = (window as any).__playerDebug;
      const m = dbg?.getMetrics?.();
      return Boolean(m?.muted === false);
    }, { timeout: 45000 });

    await page.waitForFunction(() => {
      const dbg = (window as any).__playerDebug;
      const list = dbg?.getPlaylist?.() ?? [];
      const idx = dbg?.getPlaylistIndex?.() ?? 0;
      return Boolean(list[idx] && list[idx + 1] && list[idx + 1]?.metadata?.track_id);
    }, { timeout: 45000 });

    await page.waitForFunction(() => {
      const dbg = (window as any).__playerDebug;
      const m = dbg?.getMetrics?.();
      return Boolean(m?.prefetch?.source === "next-track" && m?.prefetch?.trackId);
    }, { timeout: 45000 });

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


