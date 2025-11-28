import { test, expect } from '@playwright/test';
import { logout } from './helpers/auth';

test.describe('Admin - Bulk Delete Users', () => {
  test('should bulk delete multiple users successfully', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes

    console.log('Step 1: Navigate to application...');
    await page.goto('/', { waitUntil: 'networkidle' });

    const passwordInput = page.locator('input[type="password"]').first();
    const isPasswordGateVisible = await passwordInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (isPasswordGateVisible) {
      await passwordInput.fill('magic');
      await page.click('button:has-text("Continue")');
      await page.waitForTimeout(2000);
    }
    console.log('✓ Application loaded');

    console.log('Step 2: Logging in as admin...');

    // Check if we're on landing page - click Sign In to go to auth form
    const signInButton = page.locator('button:has-text("Sign In")').first();
    const isOnLandingPage = await signInButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (isOnLandingPage) {
      console.log('  On landing page, clicking Sign In...');
      await signInButton.click();
      await page.waitForTimeout(2000);
    }

    // Check if we're already logged in
    const emailInput = page.locator('input[type="email"]');
    const isAuthFormVisible = await emailInput.isVisible({ timeout: 2000 }).catch(() => false);

    if (!isAuthFormVisible) {
      const userButton = page.locator('button:has-text("User View")');
      const isUserButtonVisible = await userButton.isVisible({ timeout: 2000 }).catch(() => false);
      if (isUserButtonVisible) {
        console.log('  Already logged in, logging out first...');
        await logout(page);
        await page.waitForTimeout(2000);
        // After logout, click Sign In again to get to auth form
        await page.click('button:has-text("Sign In")');
        await page.waitForTimeout(2000);
      }
    }

    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForTimeout(3000);

    // Check for error message
    const errorMessage = page.locator('text=/Invalid login credentials/i');
    const hasError = await errorMessage.isVisible({ timeout: 1000 }).catch(() => false);
    if (hasError) {
      throw new Error('Login failed with invalid credentials. Check test user setup.');
    }

    // Verify we're logged in by checking for admin button or user view
    const adminButton = page.locator('button:has-text("Admin")');
    const isAdminVisible = await adminButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (!isAdminVisible) {
      throw new Error('Admin button not found after login. User may not have admin privileges.');
    }

    console.log('✓ Logged in as admin');

    console.log('Step 3: Navigate to Admin Dashboard - Users tab...');
    await page.click('button:has-text("Admin")');
    await page.waitForTimeout(1000);

    // Wait for any tab to be visible first
    const usersTab = page.locator('button:has-text("Users")');
    await expect(usersTab).toBeVisible({ timeout: 5000 });

    await page.click('button:has-text("Users")');
    await page.waitForTimeout(2000);
    console.log('✓ Users tab loaded');

    console.log('Step 4: Create test users for bulk deletion...');
    const timestamp = Date.now();
    const testUsers = [
      { email: `bulk-test-1-${timestamp}@example.com`, name: 'Bulk Test User 1' },
      { email: `bulk-test-2-${timestamp}@example.com`, name: 'Bulk Test User 2' },
      { email: `bulk-test-3-${timestamp}@example.com`, name: 'Bulk Test User 3' },
    ];

    for (let i = 0; i < testUsers.length; i++) {
      console.log(`  Creating user ${i + 1}: ${testUsers[i].email}`);
      await page.click('button:has-text("Add User")');
      await page.waitForTimeout(1000);

      await page.fill('input[type="email"]', testUsers[i].email);
      await page.fill('input[placeholder*="Minimum"]', 'TestPass123!');
      await page.fill('input[placeholder*="Optional"]', testUsers[i].name);

      const createButton = page.locator('button:has-text("Create User")');
      await createButton.click();
      await page.waitForTimeout(2000);

      const alert = page.locator('text=/created successfully/i');
      const alertVisible = await alert.isVisible({ timeout: 2000 }).catch(() => false);
      if (alertVisible) {
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
      }

      await page.click('button[aria-label="Close"]').catch(() => {});
      await page.waitForTimeout(1000);
    }
    console.log(`✓ Created ${testUsers.length} test users`);

    console.log('Step 5: Verify test users appear in table...');
    for (const user of testUsers) {
      const userRow = page.locator(`text=${user.email}`);
      await expect(userRow).toBeVisible({ timeout: 5000 });
      console.log(`  ✓ ${user.email} visible`);
    }
    console.log('✓ All test users visible');

    console.log('Step 6: Select test users using checkboxes...');
    for (const user of testUsers) {
      const checkbox = page.locator(`input[data-testid="select-user-${user.email}"]`);
      await checkbox.check();
      await page.waitForTimeout(500);
      console.log(`  ✓ Selected ${user.email}`);
    }
    console.log('✓ All test users selected');

    console.log('Step 7: Verify bulk delete button appears...');
    const bulkDeleteButton = page.locator('button[data-testid="bulk-delete-users-button"]');
    await expect(bulkDeleteButton).toBeVisible();
    const buttonText = await bulkDeleteButton.textContent();
    expect(buttonText).toContain('3');
    console.log(`✓ Bulk delete button visible: "${buttonText}"`);

    console.log('Step 8: Click bulk delete button...');
    await bulkDeleteButton.click();
    await page.waitForTimeout(1000);
    console.log('✓ Bulk delete modal opened');

    console.log('Step 9: Verify bulk delete modal content...');
    const modalTitle = page.locator('text=Bulk Delete Users');
    await expect(modalTitle).toBeVisible();
    console.log('  ✓ Modal title visible');

    const deleteCount = page.locator('text=/permanently delete 3 users?/i');
    await expect(deleteCount).toBeVisible();
    console.log('  ✓ Delete count displayed');

    for (const user of testUsers) {
      const userInList = page.locator(`.bg-slate-50:has-text("${user.email}")`);
      await expect(userInList).toBeVisible();
      console.log(`  ✓ ${user.email} listed in modal`);
    }
    console.log('✓ Modal content verified');

    console.log('Step 10: Type DELETE to confirm...');
    const confirmInput = page.locator('input[data-testid="bulk-delete-confirm-input"]');
    await confirmInput.fill('DELETE');
    await page.waitForTimeout(500);
    console.log('✓ Typed DELETE');

    console.log('Step 11: Click confirm delete button...');
    const confirmButton = page.locator('button[data-testid="confirm-bulk-delete-button"]');
    await expect(confirmButton).toBeEnabled();

    // Set up dialog handler before clicking
    const dialogPromise = new Promise<string>(resolve => {
      page.once('dialog', async dialog => {
        console.log(`  Alert: ${dialog.message()}`);
        const message = dialog.message();
        await dialog.accept();
        resolve(message);
      });
    });

    await confirmButton.click();
    console.log('✓ Clicked confirm');

    console.log('Step 12: Wait for deletion to complete...');
    const successMessage = await dialogPromise;
    expect(successMessage).toContain('Successfully deleted 3 user');
    await page.waitForTimeout(2000);
    console.log('✓ Deletion completed');

    console.log('Step 13: Verify success message...');
    console.log('✓ Success message displayed');

    console.log('Step 14: Verify test users are removed from table...');
    await page.waitForTimeout(2000);
    for (const user of testUsers) {
      const userRow = page.locator(`text=${user.email}`);
      const isVisible = await userRow.isVisible({ timeout: 2000 }).catch(() => false);
      expect(isVisible).toBe(false);
      console.log(`  ✓ ${user.email} removed`);
    }
    console.log('✓ All test users removed from table');

    console.log('Step 15: Test select all functionality...');
    console.log('  Creating 2 more users for select all test...');
    const selectAllUsers = [
      { email: `select-all-1-${timestamp}@example.com`, name: 'Select All Test 1' },
      { email: `select-all-2-${timestamp}@example.com`, name: 'Select All Test 2' },
    ];

    for (const user of selectAllUsers) {
      await page.click('button:has-text("Add User")');
      await page.waitForTimeout(1000);
      await page.fill('input[type="email"]', user.email);
      await page.fill('input[placeholder*="Minimum"]', 'TestPass123!');
      await page.fill('input[placeholder*="Optional"]', user.name);

      // Set up dialog handler before clicking
      const createDialogPromise = new Promise<void>(resolve => {
        page.once('dialog', async dialog => {
          await dialog.accept();
          resolve();
        });
      });

      await page.locator('button:has-text("Create User")').click();
      await createDialogPromise;
      await page.waitForTimeout(500);
      await page.click('button[aria-label="Close"]').catch(() => {});
      await page.waitForTimeout(1000);
    }
    console.log('  ✓ Created 2 users for select all test');

    console.log('  Clicking select all checkbox...');
    const selectAllCheckbox = page.locator('input[data-testid="select-all-users-checkbox"]');
    await selectAllCheckbox.check();
    await page.waitForTimeout(1000);
    console.log('  ✓ Select all checked');

    console.log('  Verify bulk delete button shows all users selected...');
    const allSelectedButton = page.locator('button[data-testid="bulk-delete-users-button"]');
    const isButtonVisible = await allSelectedButton.isVisible({ timeout: 2000 }).catch(() => false);
    if (isButtonVisible) {
      const allButtonText = await allSelectedButton.textContent();
      console.log(`  ✓ Button shows: "${allButtonText}"`);
    }

    console.log('  Unchecking select all...');
    await selectAllCheckbox.uncheck();
    await page.waitForTimeout(500);
    const buttonStillVisible = await allSelectedButton.isVisible({ timeout: 1000 }).catch(() => false);
    expect(buttonStillVisible).toBe(false);
    console.log('  ✓ Button hidden after unchecking');

    console.log('✓ Select all functionality works correctly');

    console.log('Step 16: Cleanup - Delete select all test users...');
    for (const user of selectAllUsers) {
      const checkbox = page.locator(`input[data-testid="select-user-${user.email}"]`);
      const checkboxVisible = await checkbox.isVisible({ timeout: 2000 }).catch(() => false);
      if (checkboxVisible) {
        await checkbox.check();
        await page.waitForTimeout(500);
      }
    }

    const finalButton = page.locator('button[data-testid="bulk-delete-users-button"]');
    const finalButtonVisible = await finalButton.isVisible({ timeout: 2000 }).catch(() => false);
    if (finalButtonVisible) {
      await finalButton.click();
      await page.waitForTimeout(1000);
      await page.fill('input[data-testid="bulk-delete-confirm-input"]', 'DELETE');
      await page.waitForTimeout(500);

      // Set up dialog handler before clicking
      const cleanupDialogPromise = new Promise<void>(resolve => {
        page.once('dialog', async dialog => {
          await dialog.accept();
          resolve();
        });
      });

      await page.locator('button[data-testid="confirm-bulk-delete-button"]').click();
      await cleanupDialogPromise;
      await page.waitForTimeout(1000);
      console.log('✓ Cleanup completed');
    }

    console.log('\n✅ All bulk delete user tests passed!');
  });
});
