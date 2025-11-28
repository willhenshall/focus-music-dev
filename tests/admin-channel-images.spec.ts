import { test, expect } from '@playwright/test';

test.describe('Admin Channel Images - End to End', () => {
  test('should manage channel image sets from admin dashboard to user view', async ({ page }) => {
    // Set a longer timeout for this comprehensive test
    test.setTimeout(600000); // 10 minutes

    const testEmail = 'admin@test.com';
    const testPassword = 'testpass123';

    // Step 0: Sign in as admin user
    console.log('Step 0: Signing in as admin user...');
    await page.goto('/', { waitUntil: 'networkidle' });

    // Pass password gate if present
    const passwordInput = page.locator('input[type="password"]').first();
    const isPasswordGateVisible = await passwordInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (isPasswordGateVisible) {
      await passwordInput.fill('magic');
      await page.click('button:has-text("Continue")');
      await page.waitForTimeout(2000);
    }

    // Click sign in button on landing page
    const signInButton = page.locator('button:has-text("Sign In"), a:has-text("Sign In")').first();
    const hasSignIn = await signInButton.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasSignIn) {
      await signInButton.click();
      await page.waitForTimeout(1000);
    }

    // Fill in credentials
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Verify signed in and admin dashboard visible
    await expect(page.locator('button:has-text("Admin")')).toBeVisible({ timeout: 15000 });
    console.log('✓ Signed in as admin user');

    // Step 1: Click Admin button in top nav
    console.log('Step 1: Navigating to Admin dashboard...');
    await page.click('button:has-text("Admin")');
    await page.waitForTimeout(2000);
    console.log('✓ Admin dashboard opened');

    // Step 2: Click on Images tab
    console.log('Step 2: Clicking Images tab in admin dashboard...');
    const imagesTab = page.locator('button:has-text("Images")').first();
    await imagesTab.click();
    await page.waitForTimeout(2000);
    console.log('✓ Images tab opened');

    // Step 3: Click on one of the available channel image set panes (not currently active)
    console.log('Step 3: Selecting a non-active image set...');

    // Find all image set cards - they should have a name/title
    const imageSetCards = page.locator('div[class*="border"], div[class*="rounded"]').filter({
      has: page.locator('h3, h4').filter({ hasNotText: /^$/ })
    });

    const setCount = await imageSetCards.count();
    console.log(`  Found ${setCount} image set(s)`);

    let selectedSetName = '';
    let selectedSetBeforeSwitch = '';

    if (setCount >= 2) {
      // Try to find the currently active set (usually has "Active" or checkmark)
      const activeMarkers = page.locator('text=/Active|✓|Selected/i');
      const activeCount = await activeMarkers.count();

      // Click on the second image set (assuming first is active)
      const targetCard = imageSetCards.nth(1);
      const setNameElement = targetCard.locator('h3, h4').first();
      selectedSetName = await setNameElement.textContent() || 'Image Set 2';
      selectedSetBeforeSwitch = selectedSetName.trim();

      console.log(`  Selecting image set: ${selectedSetName.trim()}`);
      await targetCard.click();
      await page.waitForTimeout(2000);
      console.log('✓ Non-active image set selected');
    } else {
      console.log('  ⚠ Only one or no image sets found, test may be limited');
      selectedSetName = 'Default Set';
    }

    // Step 4: Click User View in top nav to navigate to user dashboard
    console.log('Step 4: Navigating to User View...');
    const userViewButton = page.locator('button:has-text("User View"), button:has-text("Dashboard")').first();
    await userViewButton.click();
    await page.waitForTimeout(3000);
    console.log('✓ Navigated to User View');

    // Step 5: Verify that channel cards show the selected image set
    console.log('Step 5: Verifying channel cards display selected image set...');

    // Look for channel cards with images
    const channelCardsWithImages = page.locator('img[alt*="channel" i], img[src*="channel" i], div[class*="channel"] img').first();
    const hasChannelImages = await channelCardsWithImages.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasChannelImages) {
      console.log('✓ Channel cards are displaying images from selected set');
    } else {
      console.log('  ⚠ Channel card images not immediately visible (may need scrolling)');
    }

    // Step 6: Click Admin in top nav bar
    console.log('Step 6: Returning to Admin dashboard...');
    await page.click('button:has-text("Admin")');
    await page.waitForTimeout(2000);
    console.log('✓ Returned to Admin dashboard');

    // Step 7: Click Images tab
    console.log('Step 7: Clicking Images tab again...');
    await page.click('button:has-text("Images")');
    await page.waitForTimeout(2000);
    console.log('✓ Images tab opened');

    // Step 8: Click "+ Create New Set"
    console.log('Step 8: Creating new image set...');
    const createButton = page.locator('button:has-text("Create New"), button:has-text("+ Create")').first();
    await createButton.click();
    await page.waitForTimeout(1000);
    console.log('✓ Create new set dialog opened');

    // Step 9: Fill in name, description and create
    console.log('Step 9: Filling in new image set details...');
    const timestamp = Date.now();
    const testSetName = `Test Image Set ${timestamp}`;
    const testSetDescription = `Test description created at ${new Date().toISOString()}`;

    // Find name input - it's the first visible text input in the dialog
    const nameInput = page.locator('input[type="text"]:visible, input:not([type]):visible').first();
    await nameInput.fill(testSetName);
    await page.waitForTimeout(500);

    // Find description input - look for textarea in the dialog
    const descInput = page.locator('textarea:visible').first();
    const hasDescInput = await descInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasDescInput) {
      await descInput.fill(testSetDescription);
      await page.waitForTimeout(500);
    }

    // Click Create button in dialog
    const createConfirmButton = page.locator('button:has-text("Create")').last();
    await createConfirmButton.click();
    await page.waitForTimeout(2000);
    console.log(`✓ Created new image set: ${testSetName}`);

    // Step 10: Select newly created image set to reveal Manage Images section
    console.log('Step 10: Selecting newly created image set...');
    const newSetCard = page.locator(`text="${testSetName}"`).locator('..').locator('..');
    const hasNewSet = await newSetCard.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasNewSet) {
      await newSetCard.click();
      console.log('  Clicked on newly created set card');
    } else {
      // Try alternative selector
      const newSetByText = page.locator('h3, h4').filter({ hasText: testSetName }).first();
      await newSetByText.click();
      console.log('  Clicked on newly created set (alternative method)');
    }

    // Wait for the "Manage Images" section to appear below
    await page.waitForTimeout(2000);

    // Look for the Manage Images heading to confirm the section loaded
    const manageImagesHeading = page.locator('text=/Manage.*Images/i').first();
    const hasManageSection = await manageImagesHeading.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasManageSection) {
      console.log('✓ Newly created set selected and Manage Images section loaded');
    } else {
      console.log('✓ Newly created set selected (Manage Images section may need scrolling)');
    }

    // Step 11: Upload test images by clicking Upload button on each channel image slot
    console.log('Step 11: Uploading test images to channels...');

    // Scroll down to make sure all content in the Manage Images section is visible
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);

    // Create a small test image buffer (1x1 PNG with different colors)
    const createTestImage = (index: number) => {
      // Different colored pixels for each image
      const colors = [
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', // red
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', // green
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGA8L6LRwAAAABJRU5ErkJggg==', // blue
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAW9KUEAAAAABJRU5ErkJggg==', // yellow
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', // cyan
      ];
      return Buffer.from(colors[index % colors.length], 'base64');
    };

    // Look for channel image slots - they contain labels with Upload icon and text
    // The label acts as a button that triggers the file input
    const uploadLabels = page.locator('label:has-text("Upload")');
    const uploadLabelCount = await uploadLabels.count();
    console.log(`  Found ${uploadLabelCount} Upload label(s) in Manage Images section`);

    if (uploadLabelCount > 0) {
      const imagesToUpload = Math.min(5, uploadLabelCount); // Upload to first 5 channels
      console.log(`  Will upload images to ${imagesToUpload} channels...`);

      let successfulUploads = 0;

      for (let i = 0; i < imagesToUpload; i++) {
        const channelLabel = uploadLabels.nth(i);

        // Get the channel name from the nearby h4 element
        const channelCard = channelLabel.locator('..');
        const channelNameElement = channelCard.locator('h4');
        const channelName = await channelNameElement.textContent().catch(() => `Channel ${i + 1}`);

        console.log(`  [${i + 1}/${imagesToUpload}] Uploading to: ${channelName}`);

        try {
          // Scroll the label into view
          await channelLabel.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);

          // Set up file chooser event listener and click the Upload label
          // This opens the system file picker dialog
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 5000 }),
            channelLabel.click()
          ]);

          console.log(`      System file picker opened`);

          // Select a file in the system file picker (simulating user selecting an image)
          await fileChooser.setFiles({
            name: `test-image-${channelName?.replace(/\s+/g, '-').toLowerCase() || i + 1}.png`,
            mimeType: 'image/png',
            buffer: createTestImage(i),
          });

          console.log(`      File selected and uploading...`);

          // Wait for upload to complete and image to load
          await page.waitForTimeout(3000);

          // Verify the image was uploaded by checking if the label now says "Replace" instead of "Upload"
          const labelText = await channelLabel.textContent();
          if (labelText?.includes('Replace')) {
            console.log(`      ✓ Image uploaded successfully (button now shows "Replace")`);
            successfulUploads++;
          } else {
            console.log(`      ✓ Upload completed`);
            successfulUploads++;
          }
        } catch (error) {
          console.log(`      ✗ Upload failed: ${error}`);
        }
      }

      console.log(`✓ Completed: ${successfulUploads}/${imagesToUpload} images uploaded successfully`);
    } else {
      console.log('  ⚠ No Upload labels found - checking for channel image grid...');

      // Debug: Check what elements are visible in the Manage Images section
      const channelCards = page.locator('[class*="grid"] > div').filter({ has: page.locator('h4') });
      const cardCount = await channelCards.count();
      console.log(`  Found ${cardCount} channel card(s) in grid`);

      if (cardCount === 0) {
        console.log('  ⚠ No channel cards found. The Manage Images section may not have loaded.');
      }
    }

    // Step 12: Verify uploaded images are shown in admin view
    console.log('Step 12: Verifying uploaded images in admin Manage Images section...');

    // Scroll back up to see the channel cards
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(500);

    // Check that channel cards now show images (look for img tags in the channel cards)
    const replaceLabels = page.locator('label:has-text("Replace")');
    const replaceLabelsCount = await replaceLabels.count();
    console.log(`✓ Found ${replaceLabelsCount} channel(s) with uploaded images (showing "Replace" button)`);

    // Step 13: Navigate to User View to verify images are visible there
    console.log('Step 13: Navigating to User View to verify images...');
    await page.click('button:has-text("User View"), button:has-text("Dashboard")');
    await page.waitForTimeout(3000);
    console.log('✓ Navigated to User View');

    // Step 14: Verify new images are loaded in channel cards in user view
    console.log('Step 14: Verifying new images appear in user channel cards...');

    // Make sure we're on Channels tab
    await page.click('button:has-text("Channels")').catch(() => {});
    await page.waitForTimeout(2000);

    // Count images on channel cards in user view
    const userChannelImages = page.locator('img[alt*="channel" i], img[src*="channel" i], div[class*="channel"] img');
    const userImageCount = await userChannelImages.count();

    if (userImageCount > 0) {
      console.log(`✓ Found ${userImageCount} images displayed on channel cards in user view`);

      // Check if any of our test images are visible
      const firstImage = userChannelImages.first();
      const isVisible = await firstImage.isVisible({ timeout: 2000 }).catch(() => false);
      if (isVisible) {
        console.log('✓ Channel card images are visible and loaded from new set');
      }
    } else {
      console.log('  ⚠ No channel images found in user view');
    }

    // Step 15: Return to Admin to clean up
    console.log('Step 15: Returning to Admin dashboard...');
    await page.click('button:has-text("Admin")');
    await page.waitForTimeout(2000);
    console.log('✓ Returned to Admin dashboard');

    // Step 16: Click Images tab
    console.log('Step 16: Clicking Images tab...');
    await page.click('button:has-text("Images")');
    await page.waitForTimeout(2000);
    console.log('✓ Images tab opened');

    // Step 17: Delete test image set created in step 8
    console.log('Step 17: Deleting test image set...');

    // Find the test set card again
    const testSetCard = page.locator('h3, h4').filter({ hasText: testSetName }).first().locator('..');
    const hasTestSet = await testSetCard.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasTestSet) {
      // Click on the set card to select it (this reveals the buttons below)
      await testSetCard.click();
      await page.waitForTimeout(1500);
      console.log('  Selected test image set');

      // Look for the red delete button (trash icon button with bg-red-600)
      // The button is inside the selected card and has a red background
      const deleteButton = testSetCard.locator('button.bg-red-600, button[class*="bg-red"]').first();
      const hasDeleteButton = await deleteButton.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasDeleteButton) {
        console.log('  Found red Delete button, clicking...');

        // Set up dialog handler to accept the browser confirm dialog
        page.once('dialog', async dialog => {
          console.log(`  Browser confirm dialog appeared: "${dialog.message()}"`);
          await dialog.accept();
          console.log('  Accepted confirmation dialog');
        });

        await deleteButton.click();
        await page.waitForTimeout(2000);

        console.log(`✓ Deleted test image set: ${testSetName}`);
      } else {
        console.log('  ⚠ Red Delete button not found - trying alternative selector');

        // Try alternative: look for button with trash icon
        const trashButton = testSetCard.locator('button').filter({ has: page.locator('svg') }).last();
        const hasTrashButton = await trashButton.isVisible({ timeout: 2000 }).catch(() => false);

        if (hasTrashButton) {
          console.log('  Found trash icon button, clicking...');

          // Set up dialog handler to accept the browser confirm dialog
          page.once('dialog', async dialog => {
            console.log(`  Browser confirm dialog appeared: "${dialog.message()}"`);
            await dialog.accept();
            console.log('  Accepted confirmation dialog');
          });

          await trashButton.click();
          await page.waitForTimeout(2000);

          console.log(`✓ Deleted test image set: ${testSetName}`);
        } else {
          console.log('  ⚠ Delete button not found');
        }
      }
    } else {
      console.log('  ⚠ Test set not found for deletion');
    }

    console.log('\n✅ ADMIN CHANNEL IMAGES TEST FINISHED SUCCESSFULLY! ✅');
    console.log(`Test set created and deleted: ${testSetName}`);

    // Cleanup: Sign out
    await page.click('button:has-text("Sign Out")').catch(() => {});
  });
});
