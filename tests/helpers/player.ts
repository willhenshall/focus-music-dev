import { Page, expect } from '@playwright/test';

export async function waitForTrackToLoad(page: Page, timeout = 10000) {
  // Wait for music player footer to be visible by checking for "Now playing..." text
  // This uniquely identifies the music footer and not other UI elements
  await page.waitForSelector('text=Now playing', { timeout });
}

export async function waitForTrackToPlay(page: Page, timeout = 5000) {
  // Wait for play button to show pause icon (indicating playback)
  await page.waitForSelector('[data-testid="play-button"][aria-label*="Pause"], button[aria-label*="Pause"]', { timeout });
}

export async function getCurrentTrackTitle(page: Page): Promise<string> {
  const titleElement = await page.locator('[data-testid="track-title"], .track-title').first();
  return await titleElement.textContent() || '';
}

export async function waitForTrackChange(page: Page, previousTitle: string, timeout = 15000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const currentTitle = await getCurrentTrackTitle(page);
    if (currentTitle !== previousTitle && currentTitle !== '') {
      return currentTitle;
    }
    await page.waitForTimeout(500);
  }

  throw new Error(`Track did not change from "${previousTitle}" within ${timeout}ms`);
}

export async function skipToNextTrack(page: Page) {
  await page.click('[data-testid="next-button"], button[aria-label*="Next"]');
}

export async function togglePlayback(page: Page) {
  await page.click('[data-testid="play-button"], button[aria-label*="Play"], button[aria-label*="Pause"]');
}

export async function selectChannel(page: Page, channelName: string) {
  // Allow autoplay in the browser context
  await page.evaluate(() => {
    // Set autoplay policy to allow audio
    // @ts-ignore
    if (navigator.mediaDevices) {
      // Interact with the page to allow autoplay
      document.body.click();
    }
  });

  // Click on the channel card heading to select and start playing it
  // The entire channel card is clickable and will trigger playback automatically
  await page.click(`h3:has-text("${channelName}")`);

  // Wait for playlist to regenerate and playback to start
  // Increased timeout to allow for audio loading
  await page.waitForTimeout(5000);
}

export async function changeEnergyLevel(page: Page, level: 'low' | 'medium' | 'high') {
  // Click on energy level button
  await page.click(`[data-testid="energy-${level}"], button:has-text("${level}")`);

  // Wait for playlist to regenerate
  await page.waitForTimeout(1000);
}

export async function verifyPlaybackContinuity(page: Page, numTracks = 3) {
  const trackTitles: string[] = [];

  // Get first track
  await waitForTrackToPlay(page);
  let currentTitle = await getCurrentTrackTitle(page);
  trackTitles.push(currentTitle);

  // Skip through tracks and verify each loads
  for (let i = 1; i < numTracks; i++) {
    await skipToNextTrack(page);
    const nextTitle = await waitForTrackChange(page, currentTitle);
    trackTitles.push(nextTitle);
    currentTitle = nextTitle;

    // Verify track is playing
    await waitForTrackToPlay(page);
  }

  // Verify all tracks were unique
  const uniqueTitles = new Set(trackTitles);
  expect(uniqueTitles.size).toBe(numTracks);

  return trackTitles;
}
