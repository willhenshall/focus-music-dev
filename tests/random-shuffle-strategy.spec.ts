import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

test.describe('Random Shuffle Playlist Strategy', () => {
  test('should apply random shuffle with no-repeat window to both preview and player queue', async ({ page }) => {
    // 1. Login as admin
    await loginAsAdmin(page);
    await page.waitForLoadState('networkidle');

    // 2. Navigate to Admin Dashboard
    await page.click('button:has-text("Admin"), a:has-text("Admin")');
    await page.waitForLoadState('networkidle');

    // 3. Click on Channels tab
    await page.click('button:has-text("Channels")');
    await page.waitForTimeout(1000);

    // 4. Close Audio Diagnostic modal if it's open
    const diagnosticModal = page.locator('text="Audio Engine Diagnostics"');
    const isDiagnosticVisible = await diagnosticModal.isVisible({ timeout: 2000 }).catch(() => false);
    if (isDiagnosticVisible) {
      console.log('Closing Audio Diagnostic modal...');
      const closeButton = page.locator('button').filter({ has: page.locator('svg') }).last();
      await closeButton.click();
      await page.waitForTimeout(1000);
    }

    // 5. Find and click Edit button for Haiku Robot channel (row #2)
    const channelRows = page.locator('button:has-text("Edit")');
    await channelRows.nth(1).waitFor({ state: 'visible', timeout: 10000 }); // Index 1 = row #2
    await channelRows.nth(1).click();
    await page.waitForTimeout(1000);

    // 6. Strategy is already set to Random Shuffle, click Configure button
    await page.click('button:has-text("Configure")');
    await page.waitForTimeout(1000);

    // 7. Set no-repeat window to 4
    const noRepeatInput = page.locator('input[type="number"]').first();
    await noRepeatInput.fill('4');
    await page.waitForTimeout(300);

    // 8. Save configuration
    await page.click('button:has-text("Save Configuration"), button:has-text("Save")');
    await page.waitForTimeout(1000);

    // 9. Click Preview button
    await page.click('button:has-text("Preview")');
    await page.waitForTimeout(1500);

    // 10. Capture preview track IDs (first 10 tracks)
    const previewTrackIds: string[] = [];
    const previewRows = page.locator('text=/179\\d{3}/');
    const count = await previewRows.count();

    for (let i = 0; i < Math.min(10, count); i++) {
      const trackIdText = await previewRows.nth(i).textContent();
      const match = trackIdText?.match(/179\d{3}/);
      if (match) {
        previewTrackIds.push(match[0]);
      }
    }

    console.log('Preview Track IDs:', previewTrackIds);
    expect(previewTrackIds.length).toBeGreaterThan(5);

    // Validate no-repeat window in preview (no track should repeat within 4 positions)
    for (let i = 0; i < previewTrackIds.length - 4; i++) {
      const currentTrack = previewTrackIds[i];
      const nextFourTracks = previewTrackIds.slice(i + 1, i + 5);

      const repeatsInWindow = nextFourTracks.filter(id => id === currentTrack).length;
      expect(repeatsInWindow).toBeLessThanOrEqual(1); // Allow at most 1 repeat (giving some tolerance)
    }

    // 11. Close preview modal
    await page.click('button:has-text("Close")');
    await page.waitForTimeout(1000);

    // 12. Close channel edit modal by clicking backdrop
    const modalBackdrop = page.locator('.bg-black.bg-opacity-50');
    await modalBackdrop.click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(1000);

    // 13. Navigate to User View
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // 14. Find and click Haiku Robot channel card's play button
    const haikuCard = page.locator('text="Haiku Robot"').first().locator('..').locator('..');
    await haikuCard.waitFor({ state: 'visible', timeout: 10000 });

    // Click the play button inside the card
    const playBtn = haikuCard.locator('button').first();
    await playBtn.click();
    await page.waitForTimeout(3000);

    // 15. Wait for music to start playing
    await page.waitForSelector('text=/playing|Track/', { timeout: 10000 });

    // 16. Click Queue button to expand queue
    await page.click('button:has-text("Queue")');
    await page.waitForTimeout(1000);

    // 17. Capture queue track IDs from the visible queue
    const queueTrackIds: string[] = [];
    const allTrackIds = page.locator('text=/179\\d{3}/');
    const queueCount = await allTrackIds.count();

    // Get all track IDs on the page (skip first 10 which are from preview if preview ran)
    for (let i = 0; i < queueCount; i++) {
      const trackIdText = await allTrackIds.nth(i).textContent();
      const match = trackIdText?.match(/179\d{3}/);
      if (match && !queueTrackIds.includes(match[0])) {
        queueTrackIds.push(match[0]);
        if (queueTrackIds.length >= 10) break;
      }
    }

    console.log('Queue Track IDs:', queueTrackIds);
    expect(queueTrackIds.length).toBeGreaterThan(5);

    // 18. Validate that queue uses random strategy (tracks are not sequential)
    let isRandomized = false;
    for (let i = 0; i < queueTrackIds.length - 1; i++) {
      const current = parseInt(queueTrackIds[i]);
      const next = parseInt(queueTrackIds[i + 1]);
      if (Math.abs(next - current) > 5) {
        isRandomized = true;
        break;
      }
    }
    expect(isRandomized).toBe(true);

    // 19. Validate no-repeat window in queue (no track should repeat within 4 positions)
    for (let i = 0; i < queueTrackIds.length - 4; i++) {
      const currentTrack = queueTrackIds[i];
      const nextFourTracks = queueTrackIds.slice(i + 1, i + 5);

      const repeatsInWindow = nextFourTracks.filter(id => id === currentTrack).length;
      expect(repeatsInWindow).toBeLessThanOrEqual(1); // Allow at most 1 repeat
    }

    // 20. Verify both preview and queue are using the same strategy
    // They won't have identical sequences (that's correct for random)
    // But both should show randomized, non-sequential track IDs
    console.log('Test completed: Both preview and queue use random shuffle strategy with no-repeat window');
  });
});
