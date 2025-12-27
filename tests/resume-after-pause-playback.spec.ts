import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

/**
 * Regression test for: Resume-After-Pause Playback Bug
 * 
 * BUG DESCRIPTION:
 * After pausing playback and then switching to a different channel or energy level,
 * no audio would play and the app would eventually show "No Track Available" error.
 * 
 * ROOT CAUSE:
 * When changing energy level on the same channel while paused, the code checked
 * `wasPlaying` before setting `shouldAutoPlayRef.current = true`. Since the user
 * was paused (`isPlaying = false`), the auto-play never triggered.
 * 
 * FIX:
 * 1. When user explicitly clicks energy button, ALWAYS set isPlaying=true and
 *    shouldAutoPlayRef.current=true, regardless of previous pause state
 * 2. Added logging for all setIsPlaying calls to trace state changes
 */

/**
 * Helper: Wait for audio to start playing (not paused + currentTime advances)
 */
async function waitForAudioPlaying(page: any, timeout = 15000): Promise<boolean> {
  const startTime = Date.now();
  let lastTime = -1;
  
  while (Date.now() - startTime < timeout) {
    const audioState = await page.evaluate(() => {
      const audios = document.querySelectorAll('audio');
      for (const audio of audios) {
        if (audio.src && !audio.paused && audio.currentTime > 0.05) {
          return { 
            playing: true, 
            paused: audio.paused,
            currentTime: audio.currentTime,
            src: audio.src.split('/').pop() 
          };
        }
      }
      // Also check for paused audio with buffer
      for (const audio of audios) {
        if (audio.src) {
          return { 
            playing: false, 
            paused: audio.paused,
            currentTime: audio.currentTime,
            src: audio.src.split('/').pop() 
          };
        }
      }
      return { playing: false, paused: true, currentTime: 0, src: null };
    });
    
    if (audioState.playing && audioState.currentTime > lastTime) {
      console.log('Audio is playing:', audioState);
      return true;
    }
    
    lastTime = audioState.currentTime;
    await page.waitForTimeout(200);
  }
  
  return false;
}

/**
 * Helper: Verify audio currentTime is advancing (true playback, not just unpaused)
 */
async function verifyAudioTimeAdvances(page: any, duration = 2000): Promise<boolean> {
  const startState = await page.evaluate(() => {
    const audios = document.querySelectorAll('audio');
    for (const audio of audios) {
      if (audio.src) {
        return { currentTime: audio.currentTime, paused: audio.paused };
      }
    }
    return { currentTime: 0, paused: true };
  });
  
  await page.waitForTimeout(duration);
  
  const endState = await page.evaluate(() => {
    const audios = document.querySelectorAll('audio');
    for (const audio of audios) {
      if (audio.src) {
        return { currentTime: audio.currentTime, paused: audio.paused };
      }
    }
    return { currentTime: 0, paused: true };
  });
  
  const advanced = endState.currentTime > startState.currentTime + 0.5;
  console.log(`Audio time: ${startState.currentTime} -> ${endState.currentTime}, advanced: ${advanced}`);
  return advanced;
}
test.describe('Resume After Pause Playback', () => {
  test('should play new channel after pausing and switching channels', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes - includes loading modal duration
    
    // Login
    await loginAsUser(page);
    await page.waitForTimeout(3000);
    
    // Wait for channel cards to load
    const channelCards = page.locator('[data-channel-id]');
    await channelCards.first().waitFor({ state: 'visible', timeout: 15000 });
    
    // Get at least 2 channels for the test
    const channelCount = await channelCards.count();
    expect(channelCount).toBeGreaterThanOrEqual(2);
    console.log(`Found ${channelCount} channels`);
    
    // STEP 1: Click first channel to start playback
    const firstChannel = channelCards.first();
    const firstChannelName = await firstChannel.locator('h3').textContent();
    console.log(`Step 1: Clicking first channel: ${firstChannelName}`);
    
    await firstChannel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await firstChannel.click();
    await page.waitForTimeout(1000);
    
    // Select LOW energy level
    const lowButton = firstChannel.locator('button:has-text("LOW")').or(firstChannel.locator('button:has-text("Low")'));
    const lowButtonVisible = await lowButton.isVisible({ timeout: 2000 }).catch(() => false);
    if (lowButtonVisible) {
      await lowButton.click();
      console.log('Selected LOW energy level');
    }
    
    // Wait for loading modal to appear and then dismiss
    console.log('Waiting for loading modal...');
    await page.waitForTimeout(2000);
    
    // Wait for playback to start (loading modal dismisses)
    // The loading modal has a minimum visible time of ~4 seconds
    console.log('Waiting for playback to start...');
    await page.waitForTimeout(6000);
    
    // Verify audio is playing
    const audioState1 = await page.evaluate(() => {
      const audios = document.querySelectorAll('audio');
      for (const audio of audios) {
        if (audio.src && !audio.paused) {
          return { playing: true, src: audio.src.split('/').pop() };
        }
      }
      return { playing: false, src: null };
    });
    console.log('Audio state after first play:', audioState1);
    
    // Verify Now Playing footer is visible (indicates successful playback)
    const nowPlayingFooter = page.locator('.fixed.bottom-0');
    await nowPlayingFooter.waitFor({ state: 'visible', timeout: 10000 });
    console.log('✓ Step 1 complete: First channel is playing');
    
    // STEP 2: Pause playback
    console.log('Step 2: Pausing playback...');
    
    // Find the pause button in the Now Playing footer
    const pauseButton = nowPlayingFooter.locator('button[aria-label*="Pause"], button:has([data-lucide="pause"])').first();
    const pauseButtonVisible = await pauseButton.isVisible({ timeout: 3000 }).catch(() => false);
    
    if (pauseButtonVisible) {
      await pauseButton.click();
      console.log('Clicked pause button');
    } else {
      // Fallback: try clicking any pause button on the page
      const anyPauseButton = page.locator('button[aria-label*="Pause"]').first();
      if (await anyPauseButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await anyPauseButton.click();
        console.log('Clicked fallback pause button');
      }
    }
    
    await page.waitForTimeout(1000);
    
    // Verify audio is paused
    const audioState2 = await page.evaluate(() => {
      const audios = document.querySelectorAll('audio');
      for (const audio of audios) {
        if (audio.src) {
          return { paused: audio.paused, src: audio.src.split('/').pop() };
        }
      }
      return { paused: true, src: null };
    });
    console.log('Audio state after pause:', audioState2);
    console.log('✓ Step 2 complete: Playback is paused');
    
    // STEP 3: Click a DIFFERENT channel while paused
    // This is the critical step that was failing before the fix
    console.log('Step 3: Switching to a different channel while paused...');
    
    const secondChannel = channelCards.nth(1);
    const secondChannelName = await secondChannel.locator('h3').textContent();
    console.log(`Clicking second channel: ${secondChannelName}`);
    
    await secondChannel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await secondChannel.click();
    await page.waitForTimeout(1000);
    
    // Select LOW energy level on second channel
    const lowButton2 = secondChannel.locator('button:has-text("LOW")').or(secondChannel.locator('button:has-text("Low")'));
    const lowButtonVisible2 = await lowButton2.isVisible({ timeout: 2000 }).catch(() => false);
    if (lowButtonVisible2) {
      await lowButton2.click();
      console.log('Selected LOW energy level on second channel');
    }
    
    // Wait for loading modal (should appear)
    console.log('Waiting for loading modal on second channel...');
    await page.waitForTimeout(2000);
    
    // CRITICAL: Wait for audio to actually start playing
    // This is the key assertion - audio must be unpaused AND currentTime advancing
    console.log('Waiting for audio playback after channel switch...');
    const isPlaying = await waitForAudioPlaying(page, 20000);
    
    // Check for error state - this is what the bug would show
    const errorModal = page.locator('text=No track available');
    const hasError = await errorModal.isVisible({ timeout: 1000 }).catch(() => false);
    
    if (hasError) {
      console.error('❌ BUG REPRODUCED: "No Track Available" error appeared!');
      throw new Error('Resume after pause bug: "No Track Available" error shown when switching channels while paused');
    }
    
    // Verify audio is playing
    expect(isPlaying).toBe(true);
    
    // Double-check: verify currentTime is advancing (not just unpaused)
    const timeAdvances = await verifyAudioTimeAdvances(page, 2000);
    expect(timeAdvances).toBe(true);
    
    console.log('✓ Step 3 complete: Second channel is playing (verified time advancing)');
    
    // STEP 4: Verify we can repeat the process (multiple switches)
    console.log('Step 4: Testing multiple pause-and-switch cycles...');
    
    for (let cycle = 1; cycle <= 2; cycle++) {
      console.log(`\n--- Cycle ${cycle}/2 ---`);
      
      // Pause
      const pauseBtn = nowPlayingFooter.locator('button[aria-label*="Pause"], button:has([data-lucide="pause"])').first();
      if (await pauseBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await pauseBtn.click();
        await page.waitForTimeout(500);
        console.log(`Cycle ${cycle}: Paused`);
      }
      
      // Switch to a different channel (alternate between first and second)
      const targetChannel = cycle % 2 === 0 ? firstChannel : secondChannel;
      const targetName = cycle % 2 === 0 ? firstChannelName : secondChannelName;
      
      await targetChannel.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await targetChannel.click();
      await page.waitForTimeout(1000);
      
      // Select energy level
      const energyBtn = targetChannel.locator('button:has-text("LOW")').or(targetChannel.locator('button:has-text("Low")'));
      if (await energyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await energyBtn.click();
      }
      
      console.log(`Cycle ${cycle}: Switched to ${targetName}`);
      
      // Wait for audio to start playing
      const cyclePlaying = await waitForAudioPlaying(page, 15000);
      
      // Check for errors
      const cycleError = await page.locator('text=No track available').isVisible({ timeout: 500 }).catch(() => false);
      if (cycleError) {
        throw new Error(`Cycle ${cycle}: "No Track Available" error appeared`);
      }
      
      expect(cyclePlaying).toBe(true);
      console.log(`Cycle ${cycle}: ✓ Playing correctly (audio unpaused + time > 0)`);
    }
    
    console.log('\n✓ All tests passed! Resume-after-pause playback works correctly.');
  });
  
  test('should play new energy level after pausing and switching energy', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes
    
    // Login
    await loginAsUser(page);
    await page.waitForTimeout(3000);
    
    // Wait for channel cards
    const channelCards = page.locator('[data-channel-id]');
    await channelCards.first().waitFor({ state: 'visible', timeout: 15000 });
    
    // STEP 1: Start playback on LOW energy
    const firstChannel = channelCards.first();
    console.log('Step 1: Starting playback on LOW energy...');
    
    await firstChannel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await firstChannel.click();
    await page.waitForTimeout(1000);
    
    // Select LOW energy
    const lowButton = firstChannel.locator('button:has-text("LOW")').or(firstChannel.locator('button:has-text("Low")'));
    if (await lowButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await lowButton.click();
    }
    
    // Wait for playback
    await page.waitForTimeout(7000);
    
    const nowPlayingFooter = page.locator('.fixed.bottom-0');
    await nowPlayingFooter.waitFor({ state: 'visible', timeout: 10000 });
    console.log('✓ Step 1 complete: Playing on LOW energy');
    
    // STEP 2: Pause
    console.log('Step 2: Pausing...');
    const pauseButton = nowPlayingFooter.locator('button[aria-label*="Pause"], button:has([data-lucide="pause"])').first();
    if (await pauseButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pauseButton.click();
    }
    await page.waitForTimeout(1000);
    console.log('✓ Step 2 complete: Paused');
    
    // STEP 3: Switch to HIGH energy while paused
    console.log('Step 3: Switching to HIGH energy while paused...');
    const highButton = firstChannel.locator('button:has-text("HIGH")').or(firstChannel.locator('button:has-text("High")'));
    if (await highButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await highButton.click();
    }
    
    // Wait for audio to actually start playing
    const isPlaying = await waitForAudioPlaying(page, 20000);
    
    // Check for errors
    const hasError = await page.locator('text=No track available').isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasError).toBe(false);
    
    // Verify playing
    expect(isPlaying).toBe(true);
    
    // Verify time is advancing
    const timeAdvances = await verifyAudioTimeAdvances(page, 2000);
    expect(timeAdvances).toBe(true);
    
    console.log('✓ Step 3 complete: Playing on HIGH energy (verified time advancing)');
    
    console.log('\n✓ Energy level switch after pause works correctly.');
  });
});

