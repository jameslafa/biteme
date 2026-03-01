const { test, expect } = require('@playwright/test');
const testRecipes = require('./fixtures/recipes.test.json');

/** Add specific ingredients by index from a recipe page */
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
    await page.locator('.view-toggle-btn[data-view="by-recipe"]').click();

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
    await page.locator('.view-toggle-btn[data-view="by-recipe"]').click();

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
    await page.locator('.view-toggle-btn[data-view="by-recipe"]').click();

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

test.describe('Shopping List — Merged view', () => {
  // test-curry index 1 = garlic (canonical: "garlic"), 2 cloves
  // test-salad index 2 = garlic (canonical: "garlic"), 1 clove

  test('toggle hidden when list empty, visible when non-empty', async ({ page }) => {
    await page.goto('/shopping.html');
    await expect(page.locator('#view-toggle')).toBeHidden();

    await addIngredientsToCart(page, 'test-curry', 2);
    await page.goto('/shopping.html');
    await expect(page.locator('#view-toggle')).toBeVisible();
  });

  test('merged view consolidates same-canonical items into one row', async ({ page }) => {
    // Add garlic from curry (index 1) and garlic from salad (index 2)
    await addIngredientsByIndex(page, 'test-curry', [1]);
    await addIngredientsByIndex(page, 'test-salad', [2]);
    await page.goto('/shopping.html');

    // By-recipe shows two separate items
    await page.locator('.view-toggle-btn[data-view="by-recipe"]').click();
    await expect(page.locator('.shopping-item')).toHaveCount(2);

    // Merged view consolidates into one row
    await page.locator('.view-toggle-btn[data-view="merged"]').click();
    await expect(page.locator('.merged-item')).toHaveCount(1);
  });

  test('merged view sums amounts for same-canonical same-unit items', async ({ page }) => {
    // curry garlic = 2 cloves, salad garlic = 1 clove → merged = 3 cloves
    await addIngredientsByIndex(page, 'test-curry', [1]);
    await addIngredientsByIndex(page, 'test-salad', [2]);
    await page.goto('/shopping.html');

    await page.locator('.view-toggle-btn[data-view="merged"]').click();

    const label = page.locator('.merged-item .shopping-item-label');
    await expect(label).toHaveText('3 cloves garlic, minced');
  });

  test('checking merged item marks all underlying items checked', async ({ page }) => {
    await addIngredientsByIndex(page, 'test-curry', [1]);
    await addIngredientsByIndex(page, 'test-salad', [2]);
    await page.goto('/shopping.html');

    await page.locator('.view-toggle-btn[data-view="merged"]').click();

    // Check the merged item
    const mergedCheckbox = page.locator('.merged-item input[type="checkbox"]');
    await mergedCheckbox.check();
    await expect(page.locator('.merged-item')).toHaveClass(/checked/);

    // Switch back to by-recipe view and verify both items are checked
    await page.locator('.view-toggle-btn[data-view="by-recipe"]').click();
    const checkboxes = page.locator('.shopping-item input[type="checkbox"]');
    await expect(checkboxes.nth(0)).toBeChecked();
    await expect(checkboxes.nth(1)).toBeChecked();
  });

  test('unchecking a fully-checked merged item unmarks all underlying items', async ({ page }) => {
    await addIngredientsByIndex(page, 'test-curry', [1]);
    await addIngredientsByIndex(page, 'test-salad', [2]);
    await page.goto('/shopping.html');

    // Check both underlying items in by-recipe view
    await page.locator('.view-toggle-btn[data-view="by-recipe"]').click();
    const checkboxes = page.locator('.shopping-item input[type="checkbox"]');
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();

    // Switch to merged — group should be checked
    await page.locator('.view-toggle-btn[data-view="merged"]').click();
    await expect(page.locator('.merged-item')).toHaveClass(/checked/);

    // Uncheck the merged group
    await page.locator('.merged-item input[type="checkbox"]').uncheck();
    await expect(page.locator('.merged-item')).not.toHaveClass(/checked/);

    // Verify both underlying items are now unchecked
    await page.locator('.view-toggle-btn[data-view="by-recipe"]').click();
    await expect(checkboxes.nth(0)).not.toBeChecked();
    await expect(checkboxes.nth(1)).not.toBeChecked();
  });

  test('items without a canonical get their own row per distinct text', async ({ page }) => {
    // onion (canonical: null) from curry and lettuce (canonical: null) from salad
    // should each appear as their own merged group, not merged together
    await addIngredientsByIndex(page, 'test-curry', [0]); // onion, canonical: null
    await addIngredientsByIndex(page, 'test-salad', [0]); // lettuce, canonical: null
    await page.goto('/shopping.html');

    await expect(page.locator('.merged-item')).toHaveCount(2);
  });

  test('partial check state: one underlying item checked shows indeterminate', async ({ page }) => {
    await addIngredientsByIndex(page, 'test-curry', [1]);
    await addIngredientsByIndex(page, 'test-salad', [2]);
    await page.goto('/shopping.html');

    // Switch to by-recipe to check only one underlying item
    await page.locator('.view-toggle-btn[data-view="by-recipe"]').click();
    const firstCheckbox = page.locator('.shopping-item input[type="checkbox"]').first();
    await firstCheckbox.check();

    // Switch to merged view
    await page.locator('.view-toggle-btn[data-view="merged"]').click();

    // Merged item should be partial (indeterminate)
    await expect(page.locator('.merged-item')).toHaveClass(/partial/);
    const indeterminate = await page.locator('.merged-item input[type="checkbox"]').evaluate(el => el.indeterminate);
    expect(indeterminate).toBe(true);
  });

  test('merged view progress counts groups not individual items', async ({ page }) => {
    // Add two garlic (same canonical → 1 group) and one onion (different → another group)
    await addIngredientsByIndex(page, 'test-curry', [0, 1]); // onion + garlic
    await addIngredientsByIndex(page, 'test-salad', [2]);    // salad garlic

    await page.goto('/shopping.html');
    await page.locator('.view-toggle-btn[data-view="merged"]').click();

    // 2 merged groups (onion + garlic)
    await expect(page.locator('.merged-item')).toHaveCount(2);
    await expect(page.locator('#shopping-progress')).toHaveText('0 of 2 items');

    // Check the garlic group
    const garlicRow = page.locator('.merged-item').filter({ hasText: 'garlic' });
    await garlicRow.locator('input[type="checkbox"]').check();
    await expect(page.locator('#shopping-progress')).toHaveText('1 of 2 items');
  });

  test('view preference persists across page loads', async ({ page }) => {
    await addIngredientsByIndex(page, 'test-curry', [1]); // garlic only
    await page.goto('/shopping.html');

    // Switch to merged
    await page.locator('.view-toggle-btn[data-view="merged"]').click();
    await expect(page.locator('.view-toggle-btn[data-view="merged"]')).toHaveClass(/active/);

    // Reload
    await page.goto('/shopping.html');
    await expect(page.locator('.view-toggle-btn[data-view="merged"]')).toHaveClass(/active/);
    await expect(page.locator('.merged-item')).toHaveCount(1);
  });
});
