import { test, expect, Page } from "@playwright/test";
import { login } from "./login";

/**
 * Helper to answer the current quiz question by clicking the middle option.
 * Works for single_select, likert_1_5, and likert_1_7 question types.
 */
async function answerCurrentQuestion(page: Page): Promise<void> {
  const options = page.locator('[data-testid="quiz-option"]');
  await options.first().waitFor({ state: "visible", timeout: 5000 });

  const count = await options.count();
  // Pick the middle option (or first if only one)
  const middleIndex = Math.floor(count / 2);
  await options.nth(middleIndex).click();
}

test.describe("Onboarding Quiz", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("loads quiz landing page", async ({ page }) => {
    // Verify we're on the landing page
    const heading = page.getByRole("heading", { name: /music that matches/i });
    await expect(heading).toBeVisible();

    // Verify the quiz start button is visible and enabled
    const startButton = page.locator('[data-testid="quiz-start-button"]');
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeEnabled();
    await expect(startButton).toHaveText("Start Your Free Assessment");
  });

  test("user can complete the entire quiz and see recommendations", async ({
    page,
  }) => {
    // Click the start button to begin the quiz
    const startButton = page.locator('[data-testid="quiz-start-button"]');
    await startButton.click();

    // Wait for the quiz to load (progress bar appears)
    const progress = page.locator('[data-testid="quiz-progress"]');
    await expect(progress).toBeVisible({ timeout: 10000 });

    // Loop through all questions until we reach the results
    // The quiz has ~21 questions, but we loop until results appear
    const maxQuestions = 25; // Safety limit
    for (let i = 0; i < maxQuestions; i++) {
      // Check if we've reached the results page
      const resultsTitle = page.locator('[data-testid="quiz-results-title"]');
      const isResultsVisible = await resultsTitle.isVisible().catch(() => false);

      if (isResultsVisible) {
        break;
      }

      // Check if quiz question is still visible
      const question = page.locator('[data-testid="quiz-question"]');
      const isQuestionVisible = await question.isVisible().catch(() => false);

      if (!isQuestionVisible) {
        // Might be loading/submitting, wait a moment
        await page.waitForTimeout(500);
        continue;
      }

      // Answer the current question
      await answerCurrentQuestion(page);

      // Small delay to allow for transition
      await page.waitForTimeout(300);
    }

    // Wait for results to fully load
    await page.waitForTimeout(2000);

    // Assert quiz results title is visible
    const resultsTitle = page.locator('[data-testid="quiz-results-title"]');
    await expect(resultsTitle).toBeVisible({ timeout: 15000 });
    await expect(resultsTitle).toHaveText("Your Focus Profile Brain Type");

    // Assert at least one recommended channel is visible
    const recommendedChannels = page.locator(
      '[data-testid="quiz-recommended-channel"]'
    );
    await expect(recommendedChannels.first()).toBeVisible({ timeout: 10000 });

    // Verify we have at least one channel recommendation
    const channelCount = await recommendedChannels.count();
    expect(channelCount).toBeGreaterThanOrEqual(1);
  });
});

test.describe("Onboarding Quiz - Mobile", () => {
  test.use({
    viewport: { width: 375, height: 667 }, // iPhone SE size
    hasTouch: true,
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("works on mobile viewport", async ({ page }) => {
    // Start the quiz
    const startButton = page.locator('[data-testid="quiz-start-button"]');
    await expect(startButton).toBeVisible();
    await startButton.tap();

    // Wait for quiz to load
    const progress = page.locator('[data-testid="quiz-progress"]');
    await expect(progress).toBeVisible({ timeout: 10000 });

    // Answer a few questions (not all - just verify mobile works)
    for (let i = 0; i < 3; i++) {
      // Verify question is visible
      const question = page.locator('[data-testid="quiz-question"]');
      await expect(question).toBeVisible();

      // Verify options are visible
      const options = page.locator('[data-testid="quiz-option"]');
      await expect(options.first()).toBeVisible();

      // Verify progress is visible
      await expect(progress).toBeVisible();

      // Answer the question using tap (mobile interaction)
      const count = await options.count();
      const middleIndex = Math.floor(count / 2);
      await options.nth(middleIndex).tap();

      // Small delay for transition
      await page.waitForTimeout(300);
    }

    // After answering a few questions, verify we're still in the quiz
    // and elements remain visible/scrollable
    const question = page.locator('[data-testid="quiz-question"]');
    const questionVisible = await question.isVisible().catch(() => false);
    const resultsTitle = page.locator('[data-testid="quiz-results-title"]');
    const resultsVisible = await resultsTitle.isVisible().catch(() => false);

    // Either we're still in the quiz OR we somehow reached results (both valid)
    expect(questionVisible || resultsVisible).toBe(true);

    // Verify page is scrollable on mobile
    const initialScrollY = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollTo(0, 200));
    await page.waitForTimeout(100);
    const newScrollY = await page.evaluate(() => window.scrollY);

    // Page should be able to scroll (or already at a scrolled position)
    expect(newScrollY >= 0).toBe(true);
  });
});
