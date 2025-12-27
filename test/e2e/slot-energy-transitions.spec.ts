import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test: Slot-Based Channel Energy Level Transitions
 * 
 * Tests that channels using slot-based strategies properly transition
 * between LOW → MEDIUM → HIGH energy levels without stalling playback.
 * 
 * Critical bug fix: This test ensures that track_id is properly included
 * in slot sequencer queries to prevent playlist generation failures.
 */

test.describe('Slot-Based Energy Transitions (Desktop)', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    
    // Navigate to login and authenticate
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check if already logged in
    const signOutButton = page.locator('button:has-text("Sign Out")');
    if (await signOutButton.isVisible()) {
      console.log('Already logged in, continuing...');
    } else {
      // Perform login
      const emailInput = page.locator('input[type="email"]');
      await emailInput.fill('admin@test.com');
      
      const passwordInput = page.locator('input[type="password"]');
      await passwordInput.fill('testpassword123');
      
      const signInButton = page.locator('button:has-text("Sign In")');
      await signInButton.click();
      
      await page.waitForLoadState('networkidle');
    }

    // Wait for app to be ready
    await page.waitForTimeout(2000);
  });

  test('Chinchilla channel should play through LOW → MEDIUM → HIGH transitions', async () => {
    // Find and click Chinchilla channel
    const chinchillaButton = page.locator('button:has-text("Chinchilla")').first();
    await expect(chinchillaButton).toBeVisible({ timeout: 10000 });
    await chinchillaButton.click();
    await page.waitForTimeout(1000);

    // Start with LOW energy
    const lowEnergyButton = page.locator('button:has-text("Low")').first();
    await expect(lowEnergyButton).toBeVisible();
    await lowEnergyButton.click();
    await page.waitForTimeout(2000);

    // Click play button
    const playButton = page.locator('button[aria-label*="Play"], button:has-text("Play")').first();
    if (await playButton.isVisible()) {
      await playButton.click();
      await page.waitForTimeout(3000);
    }

    // Verify playback started (check for pause button or track info)
    const trackInfoOrPause = page.locator('button[aria-label*="Pause"], div:has-text("Now playing")');
    await expect(trackInfoOrPause.first()).toBeVisible({ timeout: 10000 });

    // Transition to MEDIUM energy
    const mediumEnergyButton = page.locator('button:has-text("Medium")').first();
    await mediumEnergyButton.click();
    await page.waitForTimeout(4000);

    // Verify still playing or new track loaded
    const stillPlaying1 = page.locator('button[aria-label*="Pause"]').first();
    await expect(stillPlaying1).toBeVisible({ timeout: 10000 });

    // Transition to HIGH energy (critical test - this is where stalling occurred)
    const highEnergyButton = page.locator('button:has-text("High")').first();
    await highEnergyButton.click();
    await page.waitForTimeout(5000);

    // Critical assertion: Verify playback did NOT stall
    const stillPlaying2 = page.locator('button[aria-label*="Pause"]').first();
    await expect(stillPlaying2).toBeVisible({ timeout: 15000 });

    // Optional: Check for any error messages
    const errorMessage = page.locator('text=/error|failed|stall/i');
    await expect(errorMessage).not.toBeVisible();
  });

  test('Jambient Jungle channel should handle energy transitions', async () => {
    // Find and click Jambient Jungle channel
    const jambientButton = page.locator('button:has-text("Jambient Jungle")').first();
    await expect(jambientButton).toBeVisible({ timeout: 10000 });
    await jambientButton.click();
    await page.waitForTimeout(1000);

    // Start with MEDIUM energy
    const mediumEnergyButton = page.locator('button:has-text("Medium")').first();
    await expect(mediumEnergyButton).toBeVisible();
    await mediumEnergyButton.click();
    await page.waitForTimeout(2000);

    // Click play button
    const playButton = page.locator('button[aria-label*="Play"], button:has-text("Play")').first();
    if (await playButton.isVisible()) {
      await playButton.click();
      await page.waitForTimeout(3000);
    }

    // Transition to HIGH energy
    const highEnergyButton = page.locator('button:has-text("High")').first();
    await highEnergyButton.click();
    await page.waitForTimeout(5000);

    // Verify playback continues
    const stillPlaying = page.locator('button[aria-label*="Pause"]').first();
    await expect(stillPlaying).toBeVisible({ timeout: 15000 });
  });

  test('Deep Space music channel should handle energy transitions', async () => {
    // Find and click Deep Space channel (may have different exact name)
    const deepSpaceButton = page.locator('button:has-text("Deep Space"), button:has-text("deep space")').first();
    
    // Skip test if channel not found
    if (!(await deepSpaceButton.isVisible({ timeout: 5000 }))) {
      test.skip();
      return;
    }

    await deepSpaceButton.click();
    await page.waitForTimeout(1000);

    // Start with LOW energy
    const lowEnergyButton = page.locator('button:has-text("Low")').first();
    await lowEnergyButton.click();
    await page.waitForTimeout(2000);

    // Click play button
    const playButton = page.locator('button[aria-label*="Play"], button:has-text("Play")').first();
    if (await playButton.isVisible()) {
      await playButton.click();
      await page.waitForTimeout(3000);
    }

    // Transition to HIGH energy
    const highEnergyButton = page.locator('button:has-text("High")').first();
    await highEnergyButton.click();
    await page.waitForTimeout(5000);

    // Verify playback continues
    const stillPlaying = page.locator('button[aria-label*="Pause"]').first();
    await expect(stillPlaying).toBeVisible({ timeout: 15000 });
  });

  test('Multiple rapid energy transitions should not cause stalling', async () => {
    // Find and click Chinchilla channel
    const chinchillaButton = page.locator('button:has-text("Chinchilla")').first();
    await expect(chinchillaButton).toBeVisible({ timeout: 10000 });
    await chinchillaButton.click();
    await page.waitForTimeout(1000);

    // Start playback on LOW
    const lowEnergyButton = page.locator('button:has-text("Low")').first();
    await lowEnergyButton.click();
    await page.waitForTimeout(2000);

    const playButton = page.locator('button[aria-label*="Play"], button:has-text("Play")').first();
    if (await playButton.isVisible()) {
      await playButton.click();
      await page.waitForTimeout(3000);
    }

    // Rapidly cycle through energy levels
    const mediumEnergyButton = page.locator('button:has-text("Medium")').first();
    await mediumEnergyButton.click();
    await page.waitForTimeout(2000);

    const highEnergyButton = page.locator('button:has-text("High")').first();
    await highEnergyButton.click();
    await page.waitForTimeout(2000);

    await lowEnergyButton.click();
    await page.waitForTimeout(2000);

    await highEnergyButton.click();
    await page.waitForTimeout(3000);

    // Final check: still playing
    const stillPlaying = page.locator('button[aria-label*="Pause"]').first();
    await expect(stillPlaying).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Slot-Based Energy Transitions (Mobile)', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    
    // Navigate to login and authenticate
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check if already logged in
    const signOutButton = page.locator('button:has-text("Sign Out")');
    if (await signOutButton.isVisible()) {
      console.log('Already logged in, continuing...');
    } else {
      // Perform login
      const emailInput = page.locator('input[type="email"]');
      await emailInput.fill('admin@test.com');
      
      const passwordInput = page.locator('input[type="password"]');
      await passwordInput.fill('testpassword123');
      
      const signInButton = page.locator('button:has-text("Sign In")');
      await signInButton.click();
      
      await page.waitForLoadState('networkidle');
    }

    // Wait for app to be ready
    await page.waitForTimeout(2000);
  });

  test('Mobile: Chinchilla channel energy transitions work correctly', async () => {
    // Find and click Chinchilla channel
    const chinchillaButton = page.locator('button:has-text("Chinchilla")').first();
    await expect(chinchillaButton).toBeVisible({ timeout: 10000 });
    await chinchillaButton.click();
    await page.waitForTimeout(1000);

    // Start with LOW energy
    const lowEnergyButton = page.locator('button:has-text("Low")').first();
    await expect(lowEnergyButton).toBeVisible();
    await lowEnergyButton.click();
    await page.waitForTimeout(2000);

    // Click play button
    const playButton = page.locator('button[aria-label*="Play"], button:has-text("Play")').first();
    if (await playButton.isVisible()) {
      await playButton.click();
      await page.waitForTimeout(3000);
    }

    // Transition to HIGH energy
    const highEnergyButton = page.locator('button:has-text("High")').first();
    await highEnergyButton.click();
    await page.waitForTimeout(5000);

    // Critical assertion: Verify playback continues on mobile
    const stillPlaying = page.locator('button[aria-label*="Pause"]').first();
    await expect(stillPlaying).toBeVisible({ timeout: 15000 });
  });
});



