const { test, expect } = require('@playwright/test');
const testRecipes = require('./fixtures/recipes.test.json');

async function addIngredientsByIndex(page, recipeId, indices) {
  await page.goto(`/recipe.html?id=${recipeId}`);
  const cartButtons = page.locator('.add-to-cart');
  for (const i of indices) {
    await cartButtons.nth(i).click();
    await expect(cartButtons.nth(i)).toHaveClass(/in-cart/);
  }
}

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

async function addIngredientsToCart(page, recipeId, count = 2) {
  await page.goto(`/recipe.html?id=${recipeId}`);
  const cartButtons = page.locator('.add-to-cart');
  for (let i = 0; i < count; i++) {
    await cartButtons.nth(i).click();
    await expect(cartButtons.nth(i)).toHaveClass(/in-cart/);
  }
}

test.beforeEach(async ({ page }) => {
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
  test('empty state: shows placeholder and browse button', async ({ page }) => {
    await page.goto('/shopping.html');

    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('#shopping-list')).toBeHidden();

    await page.locator('#empty-state .button').click();
    await expect(page).toHaveURL(/index\.html/);
  });

  test('display items grouped by recipe', async ({ page }) => {
    await addIngredientsToCart(page, 'test-curry', 2);
    await page.goto('/shopping.html');
    await page.locator('.view-toggle-btn[data-view="by-recipe"]').click();

    await expect(page.locator('#empty-state')).toBeHidden();
    await expect(page.locator('#shopping-list')).toBeVisible();
    await expect(page.locator('.recipe-group')).toHaveCount(1);
    await expect(page.locator('.recipe-group-title')).toHaveText('Test Curry');
    await expect(page.locator('.shopping-item')).toHaveCount(2);
  });

  test('check and uncheck item: class and progress counter update', async ({ page }) => {
    await addIngredientsToCart(page, 'test-curry', 2);
    await page.goto('/shopping.html');

    const firstItem = page.locator('.shopping-item').first();
    const checkbox = firstItem.locator('input[type="checkbox"]');
    const progress = page.locator('#shopping-progress');

    await expect(firstItem).not.toHaveClass(/checked/);
    await checkbox.check();
    await expect(firstItem).toHaveClass(/checked/);
    await expect(progress).toHaveText('1 of 2 items');

    await checkbox.uncheck();
    await expect(firstItem).not.toHaveClass(/checked/);
    await expect(progress).toHaveText('0 of 2 items');
  });

  test('remove item reduces count', async ({ page }) => {
    await addIngredientsToCart(page, 'test-curry', 2);
    await page.goto('/shopping.html');
    await page.locator('.view-toggle-btn[data-view="by-recipe"]').click();

    await page.locator('.shopping-item').first().locator('.remove-item').click();
    await expect(page.locator('.shopping-item')).toHaveCount(1);
  });

  test('checking all items shows celebration overlay', async ({ page }) => {
    await addIngredientsToCart(page, 'test-curry', 2);
    await page.goto('/shopping.html');

    const checkboxes = page.locator('.shopping-item input[type="checkbox"]');
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();

    await expect(page.locator('.celebration-overlay')).toBeVisible();
  });

  test('progress counter increments as items are checked', async ({ page }) => {
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
    await page.locator('.view-toggle-btn[data-view="by-recipe"]').click();

    await expect(page.locator('.recipe-group')).toHaveCount(2);
    await page.locator('.remove-recipe[data-recipe-id="test-curry"]').click();

    await expect(page.locator('.recipe-group')).toHaveCount(1);
    await expect(page.locator('.recipe-group-title')).toHaveText('Test Salad');
    await expect(page.locator('.shopping-item')).toHaveCount(2);
  });

  test('clear all removes entire shopping list', async ({ page }) => {
    await addIngredientsToCart(page, 'test-curry', 2);
    await addIngredientsToCart(page, 'test-salad', 2);
    await page.goto('/shopping.html');

    await page.locator('.clear-all').click();

    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('#shopping-list')).toBeHidden();
  });
});

test.describe('Shopping List — Merged view', () => {
  // test-curry index 1 = garlic (canonical: "garlic"), 2 cloves
  // test-salad index 2 = garlic (canonical: "garlic"), 1 clove

  test('view toggle hidden when empty, visible when non-empty', async ({ page }) => {
    await page.goto('/shopping.html');
    await expect(page.locator('#view-toggle')).toBeHidden();

    await addIngredientsToCart(page, 'test-curry', 2);
    await page.goto('/shopping.html');
    await expect(page.locator('#view-toggle')).toBeVisible();
  });

  test('merged view: consolidates same-canonical items and sums amounts', async ({ page }) => {
    // curry garlic = 2 cloves, salad garlic = 1 clove → merged = 3 cloves
    await addIngredientsByIndex(page, 'test-curry', [1]);
    await addIngredientsByIndex(page, 'test-salad', [2]);
    await page.goto('/shopping.html');

    await page.locator('.view-toggle-btn[data-view="by-recipe"]').click();
    await expect(page.locator('.shopping-item')).toHaveCount(2);

    await page.locator('.view-toggle-btn[data-view="merged"]').click();
    await expect(page.locator('.merged-item')).toHaveCount(1);
    await expect(page.locator('.merged-item .shopping-item-label')).toHaveText('3 cloves garlic, minced');
  });

  test('check/uncheck merged propagates to underlying items; partial check shows indeterminate', async ({ page }) => {
    await addIngredientsByIndex(page, 'test-curry', [1]);
    await addIngredientsByIndex(page, 'test-salad', [2]);
    await page.goto('/shopping.html');

    const byRecipeBtn = page.locator('.view-toggle-btn[data-view="by-recipe"]');
    const mergedBtn = page.locator('.view-toggle-btn[data-view="merged"]');
    const checkboxes = page.locator('.shopping-item input[type="checkbox"]');

    // Check one underlying → merged shows partial/indeterminate
    await byRecipeBtn.click();
    await checkboxes.first().check();
    await mergedBtn.click();
    await expect(page.locator('.merged-item')).toHaveClass(/partial/);
    const indeterminate = await page.locator('.merged-item input[type="checkbox"]').evaluate(el => el.indeterminate);
    expect(indeterminate).toBe(true);

    // Check the merged item → both underlying become checked
    await page.locator('.merged-item input[type="checkbox"]').check();
    await expect(page.locator('.merged-item')).toHaveClass(/checked/);
    await byRecipeBtn.click();
    await expect(checkboxes.nth(0)).toBeChecked();
    await expect(checkboxes.nth(1)).toBeChecked();

    // Uncheck the merged item → both underlying become unchecked
    await mergedBtn.click();
    await page.locator('.merged-item input[type="checkbox"]').uncheck();
    await expect(page.locator('.merged-item')).not.toHaveClass(/checked/);
    await byRecipeBtn.click();
    await expect(checkboxes.nth(0)).not.toBeChecked();
    await expect(checkboxes.nth(1)).not.toBeChecked();
  });

  test('items without a canonical get their own row per distinct text', async ({ page }) => {
    await addIngredientsByIndex(page, 'test-curry', [0]); // onion, canonical: null
    await addIngredientsByIndex(page, 'test-salad', [0]); // lettuce, canonical: null
    await page.goto('/shopping.html');

    await expect(page.locator('.merged-item')).toHaveCount(2);
  });

  test('merged view progress counts groups not individual items', async ({ page }) => {
    // onion + garlic from curry, salad garlic → 2 merged groups
    await addIngredientsByIndex(page, 'test-curry', [0, 1]);
    await addIngredientsByIndex(page, 'test-salad', [2]);
    await page.goto('/shopping.html');
    await page.locator('.view-toggle-btn[data-view="merged"]').click();

    await expect(page.locator('.merged-item')).toHaveCount(2);
    await expect(page.locator('#shopping-progress')).toHaveText('0 of 2 items');

    await page.locator('.merged-item').filter({ hasText: 'garlic' }).locator('input[type="checkbox"]').check();
    await expect(page.locator('#shopping-progress')).toHaveText('1 of 2 items');
  });

  test('view preference persists across page loads', async ({ page }) => {
    await addIngredientsByIndex(page, 'test-curry', [1]);
    await page.goto('/shopping.html');

    await page.locator('.view-toggle-btn[data-view="merged"]').click();
    await expect(page.locator('.view-toggle-btn[data-view="merged"]')).toHaveClass(/active/);

    await page.goto('/shopping.html');
    await expect(page.locator('.view-toggle-btn[data-view="merged"]')).toHaveClass(/active/);
    await expect(page.locator('.merged-item')).toHaveCount(1);
  });
});
