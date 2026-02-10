const { test, expect } = require('@playwright/test');
const testRecipes = require('./fixtures/recipes.test.json');

async function clearAppState(page) {
  await page.evaluate(() => {
    localStorage.clear();
    if (typeof db !== 'undefined' && db) db.close();
    return new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('biteme_db');
      req.onsuccess = resolve;
      req.onerror = resolve;
      req.onblocked = resolve;
    });
  });
}

test.beforeEach(async ({ page }) => {
  // Mock the recipes.json fetch to return test data
  await page.route('**/recipes.json', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(testRecipes)
    });
  });

  await page.goto('/');
  await clearAppState(page);
});

test.describe('Cooking Mode', () => {
  test('shows recipe name and first step', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    await expect(page.locator('#recipe-name')).toHaveText('Test Curry');
    await expect(page.locator('#step-progress')).toHaveText('Step 1 of 5');
    await expect(page.locator('#step-content')).toContainText('Heat');
  });

  test('navigate through steps', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    await expect(page.locator('#step-progress')).toHaveText('Step 1 of 5');

    await page.locator('#next-btn').click();
    await expect(page.locator('#step-progress')).toHaveText('Step 2 of 5');

    await page.locator('#next-btn').click();
    await expect(page.locator('#step-progress')).toHaveText('Step 3 of 5');

    // Progress bar should have grown
    const progressBar = page.locator('#progress-bar');
    const width = await progressBar.evaluate(el => el.style.width);
    expect(parseFloat(width)).toBeGreaterThan(0);
  });

  test('previous on step 1 goes back to recipe', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    const prevBtn = page.locator('#prev-btn');
    await expect(prevBtn).toHaveText('Back to recipe');

    await prevBtn.click();
    await expect(page).toHaveURL(/recipe\.html\?id=test-curry/);
  });

  test('finish on last step goes to completion', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    const nextBtn = page.locator('#next-btn');

    // Navigate to last step (5 steps, need 4 clicks to reach last)
    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    await expect(page.locator('#step-progress')).toHaveText('Step 5 of 5');
    await expect(nextBtn).toHaveText('Finish');

    await nextBtn.click();
    await expect(page).toHaveURL(/completion\.html\?id=test-curry/);
  });

  test('step ingredients shown when relevant', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    // Step 1 uses oil and onion — ingredients container should be visible
    const ingredientsContainer = page.locator('#step-ingredients-container');
    await expect(ingredientsContainer).toBeVisible();
    await expect(ingredientsContainer.locator('.step-ingredients-cooking')).toBeVisible();
  });

  test('previous button text changes after step 1', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    const prevBtn = page.locator('#prev-btn');
    await expect(prevBtn).toHaveText('Back to recipe');

    await page.locator('#next-btn').click();
    await page.waitForTimeout(300);
    await expect(prevBtn).toHaveText('Previous');
  });
});
