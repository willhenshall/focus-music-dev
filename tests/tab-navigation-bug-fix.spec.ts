import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

test.describe('Tab Navigation Bug Fix - Build 1317', () => {
  test('should NOT skip tracks when switching tabs 10 times', async ({ page, context }) => {
    test.setTimeout(180000); // 3 minutes

    console.log('\n======== TAB NAVIGATION STABILITY TEST (Build 1317) ========\n');

    // Step 1: Login as test user
    console.log('Step 1: Logging in as test user...');
    await loginAsUser(page);
    console.log('✓ User logged in\n');

    // Wait for channels to load
    await page.waitForTimeout(3000);

    // Step 2: Find first channel card
    console.log('Step 2: Finding first channel card...');
    const channelCards = page.locator('[data-channel-id]');
    await channelCards.first().waitFor({ timeout: 10000 });

    const firstChannelCard = channelCards.first();
    const channelId = await firstChannelCard.getAttribute('data-channel-id');
    console.log(`✓ Found channel (ID: ${channelId})\n`);

    // Step 3: Click the channel card to select it
    console.log('Step 3: Clicking channel card...');
    await firstChannelCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await firstChannelCard.click();
    await page.waitForTimeout(2000);
    console.log('✓ Channel card clicked\n');

    // Step 4: Click an energy level button
    console.log('Step 4: Selecting Medium energy level...');
    const energyButton = firstChannelCard.locator('button:has-text("Medium"), button:has-text("Low"), button:has-text("High")').first();
    await energyButton.click();
    console.log('✓ Energy level clicked');
    await page.waitForTimeout(2000);

    // Step 5: Click play button if it's visible (not already playing)
    console.log('\nStep 5: Ensuring playback started...');
    const playButton = firstChannelCard.locator('button[aria-label*="Play"], button:has([data-lucide="play"])').first();
    const playButtonVisible = await playButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (playButtonVisible) {
      console.log('  ▶️  Play button visible, clicking it...');
      await playButton.click();
      await page.waitForTimeout(2000);
    } else {
      console.log('  ⏸  Pause button showing (already playing)');
    }

    // Step 6: Wait for playback to stabilize
    console.log('\nStep 6: Waiting for audio element and playback...');

    // Wait for Now Playing to show
    await page.waitForSelector('text=Now playing', { timeout: 10000 });
    console.log('✓ Now Playing footer visible');

    // Wait for audio element to exist (it may not be visible)
    await page.waitForFunction(() => document.querySelector('audio') !== null, { timeout: 10000 });
    console.log('✓ Audio element exists');

    // Give it time to buffer
    await page.waitForTimeout(3000);

    // Check if it's ready to play
    const audioReady = await page.evaluate(() => {
      const audio = document.querySelector('audio');
      return audio && audio.readyState >= 2;
    });
    console.log(`Audio ready state: ${audioReady ? 'ready' : 'still loading'}`);

    // Verify audio is actually playing
    const isPlaying = await page.evaluate(() => {
      const audio = document.querySelector('audio');
      return audio && !audio.paused && audio.currentTime > 0;
    });

    if (!isPlaying) {
      // One more attempt - click the footer play button
      console.log('  ⚠️  Audio not playing, trying footer play button...');
      const footerPlay = page.locator('.fixed.bottom-0 button[aria-label*="Play"]').first();
      const footerPlayVisible = await footerPlay.isVisible({ timeout: 2000 }).catch(() => false);
      if (footerPlayVisible) {
        await footerPlay.click();
        await page.waitForTimeout(2000);
      }
    }

    // Final verification
    const finalCheck = await page.evaluate(() => {
      const audio = document.querySelector('audio');
      return {
        exists: !!audio,
        paused: audio?.paused,
        currentTime: audio?.currentTime,
        readyState: audio?.readyState,
        src: audio?.src
      };
    });

    console.log('Audio state:', finalCheck);

    if (finalCheck.paused || finalCheck.currentTime === 0) {
      throw new Error(`Audio did not start playing. State: paused=${finalCheck.paused}, time=${finalCheck.currentTime}s`);
    }

    console.log('✅ Audio playback confirmed\n');

    // Step 7: Get initial track info
    const getTrackInfo = async () => {
      return await page.evaluate(() => {
        const audio = document.querySelector('audio');
        return {
          src: audio?.src || '',
          time: audio?.currentTime || 0,
          paused: audio?.paused || true
        };
      });
    };

    const getTrackName = (src: string) => {
      const parts = src.split('/');
      const file = parts[parts.length - 1];
      return file.split('?')[0];
    };

    const initialTrack = await getTrackInfo();
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Initial Track: ${getTrackName(initialTrack.src)}`);
    console.log(`Initial Time: ${initialTrack.time.toFixed(2)}s`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    let unexpectedTrackChanges = 0;
    let previousTrackSrc = initialTrack.src;
    let previousTime = initialTrack.time;

    // Step 8: Perform 10 tab navigation cycles
    console.log('Step 8: Starting 10 tab navigation cycles...\n');

    for (let i = 1; i <= 10; i++) {
      console.log(`${'─'.repeat(70)}`);
      console.log(`CYCLE ${i}/10`);
      console.log(`${'─'.repeat(70)}`);

      // Get state before switching
      const before = await getTrackInfo();
      console.log(`  Before Switch:`);
      console.log(`    Track: ${getTrackName(before.src)}`);
      console.log(`    Time: ${before.time.toFixed(2)}s`);
      console.log(`    Paused: ${before.paused}`);

      // a. Open blank tab
      console.log(`\n  Opening blank tab...`);
      const blankPage = await context.newPage();
      await blankPage.goto('about:blank');
      await blankPage.waitForTimeout(1500);

      // b. Check audio continues in background
      const during = await getTrackInfo();
      console.log(`\n  While in Background:`);
      console.log(`    Time: ${during.time.toFixed(2)}s`);
      console.log(`    Paused: ${during.paused}`);

      if (during.paused) {
        console.log(`    ⚠️  WARNING: Audio paused in background`);
      }

      // c. Return to music app
      console.log(`\n  Returning to music app...`);
      await page.bringToFront();
      await page.waitForTimeout(1000);

      // d. Check state after return
      const after = await getTrackInfo();
      console.log(`\n  After Return:`);
      console.log(`    Track: ${getTrackName(after.src)}`);
      console.log(`    Time: ${after.time.toFixed(2)}s`);
      console.log(`    Paused: ${after.paused}`);

      // e. Analyze for bug
      console.log(`\n  Analysis:`);

      if (after.src !== previousTrackSrc) {
        // Track changed
        if (after.time < 5) {
          // New track at beginning - natural progression
          console.log(`    ℹ️  Track changed (natural progression)`);
          console.log(`       Old: ${getTrackName(previousTrackSrc)}`);
          console.log(`       New: ${getTrackName(after.src)}`);
        } else {
          // Track changed mid-playback - BUG!
          unexpectedTrackChanges++;
          console.log(`    ❌ BUG: Track changed mid-playback!`);
          console.log(`       Old: ${getTrackName(previousTrackSrc)}`);
          console.log(`       New: ${getTrackName(after.src)} at ${after.time.toFixed(2)}s`);
        }
        previousTrackSrc = after.src;
        previousTime = after.time;
      } else {
        // Same track
        if (after.time < previousTime - 1) {
          // Track restarted - BUG!
          unexpectedTrackChanges++;
          console.log(`    ❌ BUG: Track restarted!`);
          console.log(`       Time jumped from ${previousTime.toFixed(2)}s to ${after.time.toFixed(2)}s`);
        } else if (after.time > previousTime) {
          console.log(`    ✅ Stable - playback progressed (${previousTime.toFixed(2)}s → ${after.time.toFixed(2)}s)`);
        } else {
          console.log(`    ✅ Stable - time unchanged (${after.time.toFixed(2)}s)`);
        }
        previousTime = after.time;
      }

      if (after.paused) {
        console.log(`    ⚠️  Audio paused after return`);
      }

      await blankPage.close();
      await page.waitForTimeout(500);
      console.log('');
    }

    // Step 9: Report results
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('TEST COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Unexpected track changes/restarts: ${unexpectedTrackChanges}`);

    if (unexpectedTrackChanges === 0) {
      console.log('\n✅ SUCCESS: No unexpected track changes during 10 tab navigation cycles');
      console.log('✅ Build 1317 tab navigation fix is working correctly!');
    } else {
      console.log(`\n❌ FAILURE: ${unexpectedTrackChanges} unexpected track changes/restarts detected`);
      console.log('❌ The tab navigation bug is STILL PRESENT');
      console.log('\nThe bug manifests as:');
      console.log('  - Tracks changing mid-playback when returning from another tab');
      console.log('  - Tracks restarting from 0:00 when returning from another tab');
      console.log('\nThis indicates the visibility change handler is triggering');
      console.log('unwanted playback commands (play/load) on the audio engine.');
    }

    console.log('═══════════════════════════════════════════════════════════════\n');

    // Assert no unexpected changes
    expect(unexpectedTrackChanges).toBe(0);
  });
});
