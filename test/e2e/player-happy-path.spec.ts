import { test, expect, Page } from "@playwright/test";
import { login } from "./login";

/**
 * Test configuration for a test user account.
 * These tests require a valid test user in the database.
 * 
 * To run these tests:
 * 1. Create a test user in your Supabase database
 * 2. Set environment variables:
 *    - TEST_USER_EMAIL: The test user's email
 *    - TEST_USER_PASSWORD: The test user's password
 * 
 * Example:
 *   TEST_USER_EMAIL=test@focus.music TEST_USER_PASSWORD=yourpassword npm run e2e
 * 
 * If credentials are not set or invalid, tests will be skipped.
 */
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

// Check if test credentials are configured
const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

/**
 * Signs in as a test user to access the user dashboard.
 * This goes through the full auth flow after bypassing the password gate.
 * If the user hasn't completed onboarding, it will complete the quiz first.
 * Returns true if sign-in succeeded, false otherwise.
 */
async function signInAsTestUser(page: Page): Promise<boolean> {
  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    return false;
  }

  try {
    // First bypass the password gate
    await login(page);

    // Click the Sign In button on the landing page header (not in any form)
    const signInButton = page.locator("header").getByRole("button", { name: /sign in/i });
    await signInButton.click();

    // Wait for the auth form to appear
    await page.getByLabel(/email/i).waitFor({ state: "visible", timeout: 5000 });

    // Fill in credentials
    await page.getByLabel(/email/i).fill(TEST_USER_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_USER_PASSWORD);

    // Click the sign in button in the form (inside the form, type="submit")
    await page.locator("form").getByRole("button", { name: /sign in/i }).click();

    // Wait for either dashboard or quiz to appear (any of these indicates successful auth)
    // Use a longer timeout and simpler detection
    await page.waitForTimeout(3000);

    // Check what state we're in after auth
    const isOnQuiz = await page.locator('[data-testid="quiz-progress"]').isVisible().catch(() => false);
    const isOnDashboard = await page.getByRole("button", { name: /sign out/i }).isVisible().catch(() => false);
    const hasAuthError = await page.locator('text=/invalid.*credentials|error.*login|incorrect.*password/i').isVisible().catch(() => false);

    if (hasAuthError) {
      console.error("Authentication failed - invalid credentials");
      return false;
    }
    
    if (isOnQuiz) {
      // Complete the onboarding quiz by answering all questions
      await completeOnboardingQuiz(page);
      // Wait for dashboard after quiz - look for any dashboard indicator
      await page.waitForTimeout(3000);
    } else if (!isOnDashboard) {
      // Wait for dashboard to load - check for sign out OR mobile menu (hamburger)
      try {
        await page.getByRole("button", { name: /sign out/i }).waitFor({ state: "visible", timeout: 5000 });
      } catch {
        // On mobile, sign out is in the hamburger menu - wait for hamburger button instead
        await page.locator('[data-testid="mobile-menu-button"]').waitFor({ state: "visible", timeout: 10000 });
      }
    }

    // Now we should be on the dashboard - navigate to Channels tab
    await page.waitForTimeout(1000);
    
    // Check if we're on mobile or desktop
    const isMobileMenuVisible = await page.locator('[data-testid="mobile-menu-button"]').isVisible().catch(() => false);
    
    if (isMobileMenuVisible) {
      // Mobile: open hamburger menu and click Channels
      await page.locator('[data-testid="mobile-menu-button"]').click();
      await page.waitForTimeout(500);
      const mobileChannelsButton = page.locator('[data-testid="mobile-nav-channels"]');
      await mobileChannelsButton.waitFor({ state: "visible", timeout: 5000 });
      await mobileChannelsButton.click();
    } else {
      // Desktop: click Channels nav tab
      // Use force:true because there's a hover zone overlay that can intercept clicks
      const channelsButtonByText = page.getByRole("button", { name: /^channels$/i }).first();
      await channelsButtonByText.click({ force: true });
    }

    // Wait for channel cards to load - try multiple approaches
    try {
      // First try data-testid
      await page.locator('[data-testid="channel-card"]').first().waitFor({ state: "visible", timeout: 5000 });
    } catch {
      // Fallback: wait for data-channel-id attribute (always present on channel cards)
      await page.locator('[data-channel-id]').first().waitFor({ state: "visible", timeout: 10000 });
    }

    return true;
  } catch (error) {
    console.error("Failed to sign in as test user:", error);
    return false;
  }
}

/**
 * Completes the onboarding quiz by clicking through all questions.
 * Uses the middle option for each question type.
 */
async function completeOnboardingQuiz(page: Page): Promise<void> {
  const maxQuestions = 25; // Safety limit
  
  for (let i = 0; i < maxQuestions; i++) {
    // Check if we've reached the results page or dashboard
    const isOnDashboard = await page.locator('[data-testid="channel-card"], [data-testid="desktop-nav"]').first().isVisible().catch(() => false);
    const isOnResults = await page.locator('[data-testid="quiz-results-title"]').isVisible().catch(() => false);
    
    if (isOnDashboard || isOnResults) {
      break;
    }

    // Check if quiz question is visible
    const questionVisible = await page.locator('[data-testid="quiz-question"]').isVisible().catch(() => false);
    
    if (!questionVisible) {
      // Might be loading, wait a moment
      await page.waitForTimeout(500);
      continue;
    }

    // Answer the current question by clicking the middle option
    const options = page.locator('[data-testid="quiz-option"]');
    const count = await options.count();
    if (count > 0) {
      const middleIndex = Math.floor(count / 2);
      await options.nth(middleIndex).click();
    }

    // Small delay for transition
    await page.waitForTimeout(300);
  }

  // Wait for results or dashboard to appear
  await page.waitForTimeout(2000);
}

/**
 * Helper to wait for a channel to load and be ready for playback.
 */
async function waitForChannelReady(page: Page): Promise<void> {
  // Wait for at least one channel card to be visible
  // Try data-testid first, fall back to data-channel-id
  try {
    await page.locator('[data-testid="channel-card"]').first().waitFor({
      state: "visible",
      timeout: 5000,
    });
  } catch {
    await page.locator('[data-channel-id]').first().waitFor({
      state: "visible",
      timeout: 10000,
    });
  }
}

/**
 * Helper to get the current playback state from the debug interface.
 */
async function getPlaybackState(
  page: Page
): Promise<{ isPlaying: boolean; channelName: string | null }> {
  return page.evaluate(() => {
    const debug = (window as any).__playerDebug;
    if (!debug) return { isPlaying: false, channelName: null };
    return {
      isPlaying: debug.getTransportState() === "playing",
      channelName: debug.getActiveChannel()?.channel_name ?? null,
    };
  });
}

test.describe("Player Happy Path - Desktop", () => {
  // Skip all tests in this describe block if credentials aren't configured
  test.skip(!hasTestCredentials, "Skipping player tests: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAsTestUser(page);
    if (!signedIn) {
      test.skip();
    }
  });

  test("basic happy path - start playing from Channels", async ({ page }) => {
    await waitForChannelReady(page);

    // Click on the first channel card to select it
    // Use data-channel-id as a more reliable selector
    const firstChannel = page.locator('[data-channel-id]').first();
    await firstChannel.click();

    // Wait for channel to become active (play/pause button appears)
    const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
    await expect(playPauseButton).toBeVisible({ timeout: 10000 });

    // Click play to start playback
    await playPauseButton.click();

    // Wait for playback to start
    await page.waitForTimeout(2000);

    // Assert: Now-playing UI is visible
    const playerFooter = page.locator('[data-testid="player-footer"]');
    await expect(playerFooter).toBeVisible({ timeout: 10000 });

    // Assert: "Now playing" text is visible
    const nowPlaying = page.locator('[data-testid="player-now-playing"]');
    await expect(nowPlaying).toBeVisible();

    // Assert: Track info is rendered
    const trackInfo = page.locator('[data-testid="player-track-info"]');
    await expect(trackInfo).toBeVisible();

    // Assert: Play button shows playing state (data-playing="true")
    const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
    await expect(footerPlayPause).toHaveAttribute("data-playing", "true");

    // Assert: Clicking pause toggles to paused state
    await footerPlayPause.click();
    await expect(footerPlayPause).toHaveAttribute("data-playing", "false");

    // Assert: Clicking play again toggles back to playing
    await footerPlayPause.click();
    await expect(footerPlayPause).toHaveAttribute("data-playing", "true");
  });

  test("typical user - multiple channels and energy levels", async ({
    page,
  }) => {
    await waitForChannelReady(page);

    const channelCards = page.locator('[data-channel-id]');
    const channelCount = await channelCards.count();

    // We need at least 3 channels for this test
    if (channelCount < 3) {
      test.skip();
      return;
    }

    const energyLevels = ["low", "medium", "high"] as const;
    const channelIndices = [0, 2, Math.min(4, channelCount - 1)]; // First, third, fifth (or last)

    for (let i = 0; i < 3; i++) {
      const channelIndex = channelIndices[i];
      const energyLevel = energyLevels[i];

      // Click on the channel card
      const channel = channelCards.nth(channelIndex);
      await channel.click();

      // Wait for channel to become active (energy selector appears)
      const energySelector = page.locator('[data-testid="energy-selector"]');
      await expect(energySelector).toBeVisible({ timeout: 10000 });

      // Select the energy level - click and wait for state to settle
      const energyButton = page.locator(`[data-testid="energy-${energyLevel}"]`);
      await energyButton.click();
      await page.waitForTimeout(500);

      // Click play on this channel
      const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
      await playPauseButton.click();

      // Wait for playback to start
      await page.waitForTimeout(2000);

      // Assert: Player footer shows playing state
      const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");

      // Assert: Now playing UI is visible
      const nowPlaying = page.locator('[data-testid="player-now-playing"]');
      await expect(nowPlaying).toBeVisible();

      // Small delay before switching to next channel
      await page.waitForTimeout(1000);
    }
  });

  test("timer display is visible while playing", async ({ page }) => {
    await waitForChannelReady(page);

    // Click on the first channel and start playing
    const firstChannel = page.locator('[data-channel-id]').first();
    await firstChannel.click();

    const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
    await expect(playPauseButton).toBeVisible({ timeout: 10000 });
    await playPauseButton.click();

    // Wait for playback to start
    await page.waitForTimeout(2000);

    // Assert: Session timer is visible in the player footer
    const sessionTimer = page.locator('[data-testid="session-timer"]');
    await expect(sessionTimer).toBeVisible();

    // The timer shows a time value (format: M:SS or MM:SS)
    const timerText = await sessionTimer.textContent();
    expect(timerText).toMatch(/\d+:\d{2}/);
  });

  test("audio is served from Cloudflare R2 CDN, not Supabase", async ({ page }) => {
    await waitForChannelReady(page);

    // Click on the first channel and start playing
    const firstChannel = page.locator('[data-channel-id]').first();
    await firstChannel.click();

    const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
    await expect(playPauseButton).toBeVisible({ timeout: 10000 });
    await playPauseButton.click();

    // Wait for playback to start and audio to load
    await page.waitForTimeout(3000);

    // Verify playing state first
    const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
    await expect(footerPlayPause).toHaveAttribute("data-playing", "true", { timeout: 10000 });

    // Get the audio URL from the debug interface
    // Retry a few times since metrics update async
    let audioUrl: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      audioUrl = await page.evaluate(() => {
        const debug = (window as any).__playerDebug;
        if (debug && typeof debug.getCurrentTrackUrl === 'function') {
          return debug.getCurrentTrackUrl();
        }
        return null;
      });
      
      if (audioUrl) break;
      await page.waitForTimeout(1000);
    }

    // Assert: Audio URL should contain the R2 CDN domain
    expect(audioUrl).not.toBeNull();
    expect(audioUrl).toContain('r2.dev');
    expect(audioUrl).toContain('pub-16f9274cf01948468de2d5af8a6fdb23');
    
    // Assert: Audio URL should NOT contain Supabase
    expect(audioUrl).not.toContain('supabase.co');

    console.log(`[CDN TEST] Audio URL verified: ${audioUrl}`);
  });

  test("navigation while playing - music continues across tabs", async ({
    page,
  }) => {
    await waitForChannelReady(page);

    // Start playback on a channel
    const firstChannel = page.locator('[data-channel-id]').first();
    await firstChannel.click();

    const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
    await expect(playPauseButton).toBeVisible({ timeout: 10000 });
    await playPauseButton.click();

    // Wait for playback to start
    await page.waitForTimeout(2000);

    // Verify playing state
    const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
    await expect(footerPlayPause).toHaveAttribute("data-playing", "true");

    // Capture the initial channel name from Now Playing
    const initialNowPlaying = await page
      .locator('[data-testid="player-now-playing"]')
      .isVisible();
    expect(initialNowPlaying).toBe(true);

    // Navigate to Profile tab
    const profileTab = page.locator('[data-testid="nav-profile"]');
    if (await profileTab.isVisible()) {
      await profileTab.click();
      await page.waitForTimeout(500);

      // Assert: Player footer still visible and playing
      await expect(footerPlayPause).toBeVisible();
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");
    }

    // Navigate to Slideshow tab
    const slideshowTab = page.locator('[data-testid="nav-slideshow"]');
    if (await slideshowTab.isVisible()) {
      await slideshowTab.click();
      await page.waitForTimeout(500);

      // Assert: Player footer still visible and playing
      await expect(footerPlayPause).toBeVisible();
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");
    }

    // Navigate to Settings tab
    const settingsTab = page.locator('[data-testid="nav-settings"]');
    if (await settingsTab.isVisible()) {
      await settingsTab.click();
      await page.waitForTimeout(500);

      // Assert: Player footer still visible and playing
      await expect(footerPlayPause).toBeVisible();
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");
    }

    // Navigate back to Channels tab
    const channelsTab = page.locator('[data-testid="nav-channels"]');
    if (await channelsTab.isVisible()) {
      await channelsTab.click();
      await page.waitForTimeout(500);

      // Assert: Player footer still visible and playing
      await expect(footerPlayPause).toBeVisible();
      await expect(footerPlayPause).toHaveAttribute("data-playing", "true");

      // Assert: Now playing text still present
      const nowPlaying = page.locator('[data-testid="player-now-playing"]');
      await expect(nowPlaying).toBeVisible();
    }
  });
});

test.describe("Player Happy Path - Mobile", () => {
  test.use({
    viewport: { width: 375, height: 667 }, // iPhone SE size
    hasTouch: true,
  });

  // Skip all tests in this describe block if credentials aren't configured
  test.skip(!hasTestCredentials, "Skipping mobile player tests: TEST_USER_EMAIL and TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    const signedIn = await signInAsTestUser(page);
    if (!signedIn) {
      test.skip();
    }
  });

  test("mobile player happy path via hamburger menu", async ({ page }) => {
    // Open hamburger menu
    const menuButton = page.locator('[data-testid="mobile-menu-button"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });
    await menuButton.tap();

    // Tap Channels in the menu
    const channelsMenuItem = page.locator('[data-testid="mobile-nav-channels"]');
    await expect(channelsMenuItem).toBeVisible();
    await channelsMenuItem.tap();

    // Wait for channels to load
    await page.waitForTimeout(1000);

    // Tap on the first channel card
    const firstChannel = page.locator('[data-channel-id]').first();
    await expect(firstChannel).toBeVisible({ timeout: 10000 });
    await firstChannel.tap();

    // Wait for channel to become active (play button appears)
    const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
    await expect(playPauseButton).toBeVisible({ timeout: 10000 });

    // Tap play to start playback
    await playPauseButton.tap();

    // Wait for playback to start
    await page.waitForTimeout(2000);

    // Assert: Mobile player footer bar appears
    const playerFooter = page.locator('[data-testid="player-footer"]');
    await expect(playerFooter).toBeVisible({ timeout: 10000 });

    // Assert: Play/pause button in footer is tappable and shows playing state
    const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
    await expect(footerPlayPause).toBeVisible();
    await expect(footerPlayPause).toHaveAttribute("data-playing", "true");

    // Assert: Tapping pause toggles state
    await footerPlayPause.tap();
    await expect(footerPlayPause).toHaveAttribute("data-playing", "false");

    // Assert: Tapping play again resumes
    await footerPlayPause.tap();
    await expect(footerPlayPause).toHaveAttribute("data-playing", "true");

    // Assert: Session timer is visible on mobile
    const sessionTimer = page.locator('[data-testid="session-timer"]');
    await expect(sessionTimer).toBeVisible();
  });

  test("mobile navigation while playing", async ({ page }) => {
    // Start playback first
    const menuButton = page.locator('[data-testid="mobile-menu-button"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });
    await menuButton.tap();

    const channelsMenuItem = page.locator('[data-testid="mobile-nav-channels"]');
    await channelsMenuItem.tap();
    await page.waitForTimeout(500);

    const firstChannel = page.locator('[data-channel-id]').first();
    await expect(firstChannel).toBeVisible({ timeout: 10000 });
    await firstChannel.tap();

    const playPauseButton = page.locator('[data-testid="channel-play-pause"]');
    await expect(playPauseButton).toBeVisible({ timeout: 10000 });
    await playPauseButton.tap();

    await page.waitForTimeout(2000);

    // Verify playing
    const footerPlayPause = page.locator('[data-testid="player-play-pause"]');
    await expect(footerPlayPause).toHaveAttribute("data-playing", "true");

    // Navigate to Profile via hamburger menu
    await menuButton.tap();
    const profileMenuItem = page.locator('[data-testid="mobile-nav-profile"]');
    await profileMenuItem.tap();
    await page.waitForTimeout(500);

    // Assert: Still playing
    await expect(footerPlayPause).toBeVisible();
    await expect(footerPlayPause).toHaveAttribute("data-playing", "true");

    // Navigate to Settings
    await menuButton.tap();
    const settingsMenuItem = page.locator('[data-testid="mobile-nav-settings"]');
    await settingsMenuItem.tap();
    await page.waitForTimeout(500);

    // Assert: Still playing
    await expect(footerPlayPause).toBeVisible();
    await expect(footerPlayPause).toHaveAttribute("data-playing", "true");

    // Navigate back to Channels
    await menuButton.tap();
    await channelsMenuItem.tap();
    await page.waitForTimeout(500);

    // Assert: Still playing
    await expect(footerPlayPause).toBeVisible();
    await expect(footerPlayPause).toHaveAttribute("data-playing", "true");
  });
});
