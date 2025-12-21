import { test, expect, Page } from "@playwright/test";
import { loginAsUser } from "../../tests/helpers/auth";

/**
 * Slot-sequencer playback stall regression (desktop).
 *
 * Ensures slot-based channels (e.g., "Deep", "The Drop") can reach a stable "playing" state,
 * including across energy changes. This guards against next-track prefetch racing startup
 * while slot playlists grow in the background.
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

async function selectSlotChannel(page: Page): Promise<string> {
  const candidates = ["Deep", "The Drop"];
  for (const name of candidates) {
    const card = page.locator("[data-channel-id]", { hasText: name }).first();
    const visible = await card.isVisible({ timeout: 2000 }).catch(() => false);
    if (visible) {
      const channelId = await card.getAttribute("data-channel-id");
      if (!channelId) {
        throw new Error(`Channel card for "${name}" missing data-channel-id`);
      }
      await card.click({ force: true });
      // Wait until the app reports this channel id as active (robust across naming fields).
      await page.waitForFunction((expectedId) => {
        const dbg = (window as any).__playerDebug;
        const ch = dbg?.getActiveChannel?.() ?? null;
        return Boolean(ch?.id && String(ch.id) === String(expectedId));
      }, channelId, { timeout: 20000 });
      return name;
    }
  }
  throw new Error(`Could not find a slot-sequencer channel card. Tried: ${candidates.join(", ")}`);
}

async function debugSnapshot(page: Page) {
  const evalTimeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("debugSnapshot evaluate timeout")), 2000);
  });
  return await Promise.race([
    page.evaluate(() => {
      const dbg = (window as any).__playerDebug;
      const m = dbg?.getMetrics?.() ?? null;
      const ch = dbg?.getActiveChannel?.() ?? null;
      const channelLabel =
        ch?.channel_name ??
        ch?.name ??
        ch?.title ??
        ch?.display_name ??
        ch?.displayName ??
        null;
      return {
        playbackState: m?.playbackState ?? null,
        currentTrackId: m?.currentTrackId ?? null,
        playbackSessionId: m?.playbackSessionId ?? null,
        prefetch: m?.prefetch ?? null,
        currentTrackUrl: dbg?.getCurrentTrackUrl?.() ?? null,
        activeChannel: channelLabel,
      };
    }),
    evalTimeout,
  ]);
}

async function pollUntil(page: Page, predicate: (snap: any) => boolean, timeoutMs: number, label: string) {
  const start = Date.now();
  let last: any = null;
  while (Date.now() - start < timeoutMs) {
    last = await debugSnapshot(page);
    if (predicate(last)) return last;
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(500);
  }
  throw new Error(`Timed out waiting for ${label}. Debug: ${JSON.stringify(last)}`);
}

async function setEnergy(page: Page, energy: "low" | "medium" | "high"): Promise<void> {
  const energySelector = page.locator('[data-testid="energy-selector"]');
  await expect(energySelector).toBeVisible({ timeout: 20000 });
  await page.locator(`[data-testid="energy-${energy}"]`).click({ force: true });
  await page.waitForTimeout(300);
}

async function ensurePlaying(page: Page, label: string): Promise<void> {
  await expect(page.locator('[data-testid="player-play-pause"]')).toHaveAttribute("data-playing", "true", {
    timeout: 30000,
  });
  await pollUntil(page, (s) => s?.playbackState === "playing" && Boolean(s?.currentTrackId), 45_000, `playing state (${label})`);
}

test.describe("Slot Sequencer Playback Stall - Desktop", () => {
  test.setTimeout(180_000);
  test.skip(!hasTestCredentials, "Skipping: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await forceStreamingEngine(page);
    await loginAsUser(page);
    await navigateToChannelsIfNeeded(page);
  });

  test("slot-sequencer channel reaches playing across energy changes", async ({ page }) => {
    const channelName = await selectSlotChannel(page);

    // Start from medium, then cycle energies (matches reported failures across all energies).
    const energies: Array<"low" | "medium" | "high"> = ["medium", "low", "high"];
    for (const energy of energies) {
      await setEnergy(page, energy);

      // Scope play to the currently active channel card to avoid toggling a different channel.
      const activeCard = page.locator("[data-channel-id]").filter({
        has: page.locator('[data-testid="energy-selector"]'),
      }).first();
      const playPauseButton = activeCard.locator('[data-testid="channel-play-pause"]').first();
      await expect(playPauseButton).toBeVisible({ timeout: 20000 });
      const playingAttr = await playPauseButton.getAttribute("data-playing").catch(() => null);
      if (playingAttr !== "true") {
        await playPauseButton.click({ force: true });
      }

      await ensurePlaying(page, `${channelName} / ${energy}`);
    }
  });
});



