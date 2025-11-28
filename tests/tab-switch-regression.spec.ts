import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

test.describe('Tab Switch Regression Test', () => {
  test('tab switch immediately after play does not skip first track', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔄 TAB SWITCH IMMEDIATE PLAY REGRESSION TEST');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('Step 1: Logging in as user...');
    await loginAsUser(page);
    console.log('✓ User logged in\n');

    console.log('Step 2: Waiting for channels to load...');
    await page.waitForTimeout(3000);
    console.log('✓ Channels loaded\n');

    console.log('Step 3: Finding first channel card...');
    const channelCard = page.locator('[data-channel-id]').first();
    await channelCard.waitFor({ state: 'visible', timeout: 10000 });
    console.log('✓ Channel card found\n');

    console.log('Step 4: Clicking channel card to activate it...');
    await channelCard.click();
    await page.waitForTimeout(2000);
    console.log('✓ Channel card clicked\n');

    console.log('Step 5: Finding play button within channel card...');
    const playButton = channelCard.locator('button:has([data-lucide="play"])').first();
    const playButtonVisible = await playButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (!playButtonVisible) {
      console.log('⚠ No play button found, channel may have auto-started playback\n');
    } else {
      console.log('✓ Play button found, clicking it now...');
      await playButton.click();
      console.log('✓ Play button clicked\n');
    }

    console.log('Step 6: Waiting for playlist to be generated...');
    const expected = await page.waitForFunction(() => {
      const dbg = (window as any).__playerDebug;
      if (!dbg) return null;

      const playlist = dbg.getPlaylist?.() || [];
      const first = playlist[0];

      if (playlist.length === 0) return null;

      return {
        firstTrackId: first?.metadata?.track_id || first?.id || null,
        playlistLength: playlist.length,
        available: true,
      };
    }, { timeout: 10000 });

    const expectedData = await expected.jsonValue();
    console.log('✓ Playlist generated\n');

    console.log('Expected playlist state:');
    console.log(`  First Track ID: ${expectedData.firstTrackId}`);
    console.log(`  Playlist Length: ${expectedData.playlistLength}`);
    console.log(`  Debug Available: ${expectedData.available}\n`);

    expect(expectedData.available, '__playerDebug not available on window').toBe(true);
    expect(
      expectedData.firstTrackId,
      'expected playlist[0] to exist'
    ).not.toBeNull();

    console.log('Step 7: IMMEDIATELY simulating tab switch after play started...');
    const otherTab = await context.newPage();
    await otherTab.goto('about:blank');
    console.log('✓ New tab opened\n');

    console.log('Step 8: Very brief delay (50ms) to mimic immediate return...');
    await otherTab.waitForTimeout(50);
    console.log('✓ Wait complete\n');

    console.log('Step 9: Closing other tab and returning to original...');
    await otherTab.close();
    console.log('✓ Tab closed\n');

    console.log('Step 10: Waiting for track to be loaded and playing...');
    const after = await page.waitForFunction(() => {
      const dbg = (window as any).__playerDebug;
      if (!dbg) return null;

      const trackId = dbg.getTrackId?.();
      const state = dbg.getTransportState?.();
      const index = dbg.getPlaylistIndex?.();

      if (!trackId || state !== 'playing') return null;

      return { trackId, state, index };
    }, { timeout: 8000 });

    const result = await after.jsonValue();
    console.log('✓ Track is now playing\n');

    console.log('Player state after tab switch:');
    console.log(`  Track ID: ${result.trackId}`);
    console.log(`  Playlist Index: ${result.index}`);
    console.log(`  Transport State: ${result.state}\n`);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 TEST VALIDATION');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const trackMatches = result.trackId === expectedData.firstTrackId;
    const isFirstTrack = result.index === 0;

    console.log('✓ Check 1: Should be playing the first track from playlist');
    if (trackMatches) {
      console.log(`  ✅ PASS - Playing expected first track: ${result.trackId}\n`);
    } else {
      console.log(`  ❌ FAIL - Playing track ${result.trackId}, expected ${expectedData.firstTrackId}\n`);
    }

    console.log('✓ Check 2: Should be at playlist index 0');
    if (isFirstTrack) {
      console.log(`  ✅ PASS - Playlist index is 0\n`);
    } else {
      console.log(`  ❌ FAIL - Playlist index is ${result.index}, expected 0\n`);
    }

    console.log('✓ Check 3: Player should be in playing state');
    if (result.state === 'playing') {
      console.log(`  ✅ PASS - Player is playing\n`);
    } else {
      console.log(`  ❌ FAIL - Player state is ${result.state}\n`);
    }

    console.log('═══════════════════════════════════════════════════════════════');
    if (trackMatches && isFirstTrack && result.state === 'playing') {
      console.log('🎉 TEST PASSED - Tab switch did not skip first track');
    } else {
      console.log('❌ TEST FAILED - Tab switch caused track skip or playback issue');
    }
    console.log('═══════════════════════════════════════════════════════════════\n');

    expect(
      result.trackId,
      'player skipped away from first track in playlist after immediate tab switch'
    ).toBe(expectedData.firstTrackId);

    expect(
      result.index,
      'playlist index should be 0 (first track)'
    ).toBe(0);

    expect(
      result.state,
      'player should be in playing state'
    ).toBe('playing');

    await context.close();
  });
});
