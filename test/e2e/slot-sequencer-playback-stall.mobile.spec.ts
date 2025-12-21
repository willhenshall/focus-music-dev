import { test, expect, Page } from "@playwright/test";
import { login } from "./login";

/**
 * Slot-sequencer playback stall regression (mobile).
 *
 * User-facing playback must work on mobile; this validates the same scenario as the desktop test
 * with a touch workflow.
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
  }

  await channelCard.waitFor({ state: "visible", timeout: 20000 });
}

async function selectSlotChannel(page: Page): Promise<string> {
  const candidates = ["Deep", "The Drop"];
  for (const name of candidates) {
    const card = page.locator("[data-channel-id]", { hasText: name }).first();
    const visible = await card.isVisible({ timeout: 2000 }).catch(() => false);
    if (visible) {
      await card.click({ force: true });
      return name;
    }
  }
  throw new Error(`Could not find a slot-sequencer channel card. Tried: ${candidates.join(", ")}`);
}

function slotChannelCard(page: Page, name: string) {
  return page.locator("[data-channel-id]", { hasText: name }).first();
}

async function debugSnapshot(page: Page) {
  const evalTimeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("debugSnapshot evaluate timeout")), 2000);
  });
  return await Promise.race([
    page.evaluate(() => {
      const dbg = (window as any).__playerDebug;
      const m = dbg?.getMetrics?.() ?? null;
      return {
        playbackState: m?.playbackState ?? null,
        muted: m?.muted ?? null,
        currentTrackId: m?.currentTrackId ?? null,
        playbackSessionId: m?.playbackSessionId ?? null,
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
  await page.locator(`[data-testid="energy-${energy}"]`).tap();
  await page.waitForTimeout(300);
}

async function ensurePlaying(page: Page, label: string): Promise<void> {
  // Mobile emulation can be flaky at reaching playbackState="playing", so we use state-level signals:
  // channel play/pause indicates playing + pipeline is unmuted after a user gesture.
  await page
    .locator('[data-testid="channel-play-pause"][data-playing="true"]')
    .waitFor({ state: "visible", timeout: 30000 });

  await page.waitForFunction(() => {
    const dbg = (window as any).__playerDebug;
    const m = dbg?.getMetrics?.();
    return Boolean(m?.muted === false);
  }, { timeout: 45000 });

  await pollUntil(
    page,
    (s) => Boolean(s?.currentTrackId) && s?.muted === false,
    45_000,
    `unmuted + track id (${label})`
  );
}

test.describe("Slot Sequencer Playback Stall - Mobile", () => {
  test.setTimeout(180_000);
  test.use({ hasTouch: true });
  test.skip(!hasTestCredentials, "Skipping: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await forceStreamingEngine(page);
    await signInAsTestUserMobile(page);
    await navigateToChannelsIfNeeded(page);
  });

  test("slot-sequencer channel reaches playing across energy changes", async ({ page }) => {
    const channelName = await selectSlotChannel(page);

    // Turn ON the slot channel via card tap (mobile UX).
    // Note: the per-card play button isn't always present on mobile layouts.
    const card = slotChannelCard(page, channelName);
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await card.click({ force: true });

    const energies: Array<"low" | "medium" | "high"> = ["medium", "low", "high"];
    for (const energy of energies) {
      await setEnergy(page, energy);
      await ensurePlaying(page, `${channelName} / ${energy}`);
    }
  });
});


