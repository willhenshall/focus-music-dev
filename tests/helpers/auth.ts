import { Page } from '@playwright/test';

async function bypassPasswordGate(page: Page) {
  console.log('[GATE] Checking for password gate...');

  const passwordInput = page.locator('input[type="password"]').first();
  const continueButton = page.locator('button:has-text("Continue")').first();

  const isPasswordGateVisible = await passwordInput.isVisible({ timeout: 2000 }).catch(() => false);
  console.log('[GATE] Password gate visible:', isPasswordGateVisible);

  if (isPasswordGateVisible) {
    console.log('[GATE] Filling password "magic"...');
    await passwordInput.click();
    await passwordInput.fill('magic');
    await page.waitForTimeout(500);

    console.log('[GATE] Clicking Continue button...');
    await continueButton.click();
    await page.waitForTimeout(3000);
    console.log('[GATE] Passed password gate');
  }

  const signInButton = page.locator('button:has-text("Sign In")').first();
  const isSignInVisible = await signInButton.isVisible({ timeout: 2000 }).catch(() => false);
  console.log('[GATE] Sign In button visible:', isSignInVisible);

  if (isSignInVisible) {
    console.log('[GATE] Clicking Sign In...');
    await signInButton.click();
    console.log('[GATE] Waiting for auth form to appear...');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    console.log('[GATE] Auth form appeared');
  }
}

export async function loginAsAdmin(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });

  await bypassPasswordGate(page);

  console.log('[LOGIN] Filling admin credentials...');
  await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'admin@test.com');
  await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'testpass123');

  console.log('[LOGIN] Submitting login form...');
  await page.click('button[type="submit"]');

  console.log('[LOGIN] Waiting for dashboard...');
  await page.waitForSelector('button:has-text("Admin")', { timeout: 30000 });
  console.log('[LOGIN] Admin dashboard loaded');

  await page.waitForTimeout(2000);
}

export async function loginAsUser(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });

  await bypassPasswordGate(page);

  console.log('[LOGIN] Waiting for email input...');
  const emailInput = await page.waitForSelector('input[type="email"]', { timeout: 45000 });
  console.log('[LOGIN] Email input found:', !!emailInput);

  await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL || 'user@test.com');
  await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD || 'testpass123');

  console.log('[LOGIN] Submitting login form...');
  await page.click('button[type="submit"]');

  await page.waitForTimeout(5000);

  const content = await page.content();
  console.log('[LOGIN] After login - page has "Channels":', content.includes('Channels'));
  console.log('[LOGIN] After login - page has "quiz":', content.includes('quiz') || content.includes('Quiz'));
  console.log('[LOGIN] After login - page has "onboarding":', content.includes('onboarding') || content.includes('Onboarding'));

  console.log('[LOGIN] Waiting for Channels button...');
  await page.waitForSelector('button:has-text("Channels")', { timeout: 30000 });

  await page.waitForTimeout(2000);
}

export async function logout(page: Page) {
  // Look for logout button and click it
  await page.click('button:has-text("Logout"), button:has-text("Sign Out")');

  // Wait for redirect to login
  await page.waitForURL('/');
}
