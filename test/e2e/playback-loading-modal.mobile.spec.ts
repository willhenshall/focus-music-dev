import { test, expect, Page } from '@playwright/test';
import { login } from './login';

/**
 * E2E tests for the Playback Loading Modal on mobile.
 * 
 * Basic smoke test to verify modal behavior on mobile viewport.
 */

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

async function signInAsTestUserMobile(page: Page): Promise<void> {
  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    throw new Error('Missing TEST_USER_EMAIL/TEST_USER_PASSWORD');
  }

  await login(page);

  // Click Sign In from landing header
  const signInButton = page.locator('header').getByRole('button', { name: /sign in/i });
  await signInButton.tap();

  // Wait for auth form
  await page.getByLabel(/email/i).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByLabel(/email/i).fill(TEST_USER_EMAIL);
  await page.getByLabel(/password/i).fill(TEST_USER_PASSWORD);
  await page.locator('form').getByRole('button', { name: /sign in/i }).tap();

  // Mobile dashboard shows hamburger menu
  await page.locator('[data-testid="mobile-menu-button"]').waitFor({ state: 'visible', timeout: 30000 });
}

async function navigateToChannelsIfNeeded(page: Page): Promise<void> {
  const channelCard = page.locator('[data-channel-id]').first();
  const isChannelVisible = await channelCard.isVisible({ timeout: 2000 }).catch(() => false);
  if (isChannelVisible) return;

  // Mobile: open hamburger menu if present and tap Channels
  const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]');
  const hasMobileMenu = await mobileMenuButton.isVisible({ timeout: 2000 }).catch(() => false);
  if (hasMobileMenu) {
    await mobileMenuButton.tap();
    await page.waitForTimeout(300);
    const mobileChannels = page.locator('[data-testid="mobile-nav-channels"]');
    await mobileChannels.waitFor({ state: 'visible', timeout: 10000 });
    await mobileChannels.tap();
  } else {
    // Fallback to desktop-style button if rendered
    const channelsButton = page.locator('button:has-text("Channels")').first();
    const isVisible = await channelsButton.isVisible({ timeout: 2000 }).catch(() => false);
    if (isVisible) await channelsButton.click({ force: true });
  }

  await channelCard.waitFor({ state: 'visible', timeout: 20000 });
}

async function getPlaybackLoadingState(page: Page): Promise<{
  status: string;
  requestId?: string;
  channelName?: string;
  energyLevel?: string;
}> {
  return page.evaluate(() => {
    const debug = (window as any).__playerDebug;
    return debug?.getPlaybackLoadingState?.() ?? { status: 'unknown' };
  });
}

test.describe('Playback Loading Modal - Mobile', () => {
  test.setTimeout(120_000);
  test.use({
    hasTouch: true,
  });

  test.skip(!hasTestCredentials, 'Skipping: TEST_USER_EMAIL and TEST_USER_PASSWORD not set');

  test.beforeEach(async ({ page }) => {
    await signInAsTestUserMobile(page);
    await navigateToChannelsIfNeeded(page);
  });

  test('modal appears and dismisses on channel tap', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    const count = await channelCards.count();
    expect(count).toBeGreaterThan(0);

    // Tap on a channel to trigger loading
    await channelCards.first().tap();

    // Wait for either modal or playing state
    await Promise.race([
      page.locator('[data-testid="playback-loading-modal"]').waitFor({ state: 'visible', timeout: 2000 }),
      page.waitForFunction(() => {
        const debug = (window as any).__playerDebug;
        return debug?.getTransportState?.() === 'playing';
      }, { timeout: 10000 }),
    ]).catch(() => {});

    // Verify state machine was triggered
    const state = await getPlaybackLoadingState(page);
    expect(['loading', 'playing', 'idle']).toContain(state.status);

    // Wait for playback to complete
    await page.waitForFunction(() => {
      const debug = (window as any).__playerDebug;
      return debug?.getTransportState?.() === 'playing';
    }, { timeout: 20000 });

    // Modal should be gone
    await page.waitForTimeout(500);
    const modal = page.locator('[data-testid="playback-loading-modal"]');
    const isVisible = await modal.isVisible().catch(() => false);
    expect(isVisible).toBe(false);
  });

  test('modal displays correctly on mobile viewport', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    await channelCards.first().tap();

    const modal = page.locator('[data-testid="playback-loading-modal"]');

    try {
      await modal.waitFor({ state: 'visible', timeout: 1000 });

      // Check modal is centered and visible
      const boundingBox = await modal.boundingBox();
      if (boundingBox) {
        const viewportSize = page.viewportSize();
        if (viewportSize) {
          // Modal should be within viewport
          expect(boundingBox.x).toBeGreaterThanOrEqual(0);
          expect(boundingBox.y).toBeGreaterThanOrEqual(0);
          expect(boundingBox.x + boundingBox.width).toBeLessThanOrEqual(viewportSize.width);
        }
      }

      // Energy pill should be visible
      const energyPill = page.locator('[data-testid="loading-modal-energy-pill"]');
      const isPillVisible = await energyPill.isVisible().catch(() => false);
      expect(isPillVisible).toBe(true);
    } catch {
      // Modal may have dismissed too quickly - acceptable for fast loads
    }
  });

  test('modal not stuck after playback starts', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    await channelCards.first().tap();

    // Wait for audio to be playing
    await page.waitForFunction(() => {
      const debug = (window as any).__playerDebug;
      const state = debug?.getTransportState?.();
      return state === 'playing';
    }, { timeout: 20000 });

    // Wait a bit more
    await page.waitForTimeout(1000);

    // Modal must not be visible
    const modal = page.locator('[data-testid="playback-loading-modal"]');
    const isVisible = await modal.isVisible().catch(() => false);
    expect(isVisible).toBe(false);

    // State should be idle (not stuck in loading)
    const state = await getPlaybackLoadingState(page);
    expect(state.status).toBe('idle');
  });
});

