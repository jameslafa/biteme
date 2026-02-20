const { test, expect } = require('@playwright/test');
const testRecipes = require('./fixtures/recipes.test.json');

async function clearAppState(page) {
  await page.evaluate(async () => {
    localStorage.clear();
    if (typeof db !== 'undefined' && db) db.close();
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) await reg.unregister();
    return new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('biteme_db');
      req.onsuccess = resolve;
      req.onerror = resolve;
      req.onblocked = resolve;
    });
  });
}

/** Add ingredients to shopping list from a recipe page */
async function addIngredientsToCart(page, recipeId, count = 2) {
  await page.goto(`/recipe.html?id=${recipeId}`);
  const cartButtons = page.locator('.add-to-cart');
  for (let i = 0; i < count; i++) {
    await cartButtons.nth(i).click();
    await expect(cartButtons.nth(i)).toHaveClass(/in-cart/);
  }
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

test.describe('Shopping List', () => {
  test('empty state', async ({ page }) => {
    await page.goto('/shopping.html');

    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('#shopping-list')).toBeHidden();

    // Browse recipes button works
    const browseBtn = page.locator('#empty-state .button');
    await expect(browseBtn).toBeVisible();
    await browseBtn.click();
    await expect(page).toHaveURL(/index\.html/);
  });

  test('display items grouped by recipe', async ({ page }) => {
    await addIngredientsToCart(page, 'test-curry', 2);

    await page.goto('/shopping.html');

    await expect(page.locator('#empty-state')).toBeHidden();
    await expect(page.locator('#shopping-list')).toBeVisible();
    await expect(page.locator('.recipe-group')).toHaveCount(1);
    await expect(page.locator('.recipe-group-title')).toHaveText('Test Curry');
    await expect(page.locator('.shopping-item')).toHaveCount(2);
  });

  test('check item', async ({ page }) => {
    await addIngredientsToCart(page, 'test-curry', 2);
    await page.goto('/shopping.html');

    const firstItem = page.locator('.shopping-item').first();
    const checkbox = firstItem.locator('input[type="checkbox"]');

    await expect(firstItem).not.toHaveClass(/checked/);
    await checkbox.check();
    await expect(firstItem).toHaveClass(/checked/);

    // Progress should update
    await expect(page.locator('#shopping-progress')).toHaveText('1 of 2 items');
  });

  test('uncheck item', async ({ page }) => {
    await addIngredientsToCart(page, 'test-curry', 2);
    await page.goto('/shopping.html');

    const firstItem = page.locator('.shopping-item').first();
    const checkbox = firstItem.locator('input[type="checkbox"]');

    await checkbox.check();
    await expect(firstItem).toHaveClass(/checked/);

    await checkbox.uncheck();
    await expect(firstItem).not.toHaveClass(/checked/);
    await expect(page.locator('#shopping-progress')).toHaveText('0 of 2 items');
  });

  test('remove item', async ({ page }) => {
    await addIngredientsToCart(page, 'test-curry', 2);
    await page.goto('/shopping.html');

    await expect(page.locator('.shopping-item')).toHaveCount(2);

    // Click remove on first item
    await page.locator('.shopping-item').first().locator('.remove-item').click();

    // Wait for fade out and reload
    await expect(page.locator('.shopping-item')).toHaveCount(1);
  });

  test('all checked celebration', async ({ page }) => {
    await addIngredientsToCart(page, 'test-curry', 2);
    await page.goto('/shopping.html');

    // Check all items
    const checkboxes = page.locator('.shopping-item input[type="checkbox"]');
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();

    // Celebration overlay should appear
    await expect(page.locator('.celebration-overlay')).toBeVisible();
  });

  test('progress counter', async ({ page }) => {
    await addIngredientsToCart(page, 'test-curry', 3);
    await page.goto('/shopping.html');

    const progress = page.locator('#shopping-progress');
    await expect(progress).toHaveText('0 of 3 items');

    await page.locator('.shopping-item').nth(0).locator('input[type="checkbox"]').check();
    await expect(progress).toHaveText('1 of 3 items');

    await page.locator('.shopping-item').nth(1).locator('input[type="checkbox"]').check();
    await expect(progress).toHaveText('2 of 3 items');
  });

  test('remove recipe clears all items for that recipe', async ({ page }) => {
    await addIngredientsToCart(page, 'test-curry', 3);
    await addIngredientsToCart(page, 'test-salad', 2);
    await page.goto('/shopping.html');

    await expect(page.locator('.recipe-group')).toHaveCount(2);
    await expect(page.locator('.shopping-item')).toHaveCount(5);

    // Remove the curry recipe group
    await page.locator('.remove-recipe[data-recipe-id="test-curry"]').click();

    // Only salad items should remain
    await expect(page.locator('.recipe-group')).toHaveCount(1);
    await expect(page.locator('.recipe-group-title')).toHaveText('Test Salad');
    await expect(page.locator('.shopping-item')).toHaveCount(2);
  });

  test('clear all removes entire shopping list', async ({ page }) => {
    await addIngredientsToCart(page, 'test-curry', 2);
    await addIngredientsToCart(page, 'test-salad', 2);
    await page.goto('/shopping.html');

    await expect(page.locator('.shopping-item')).toHaveCount(4);

    await page.locator('.clear-all').click();

    // Should show empty state
    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('#shopping-list')).toBeHidden();
  });
});
