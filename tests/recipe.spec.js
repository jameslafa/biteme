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

test.describe('Recipe Detail', () => {
  test('displays recipe content', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');

    await expect(page.locator('.recipe-name')).toHaveText('Test Curry');
    await expect(page.locator('.recipe-description')).toContainText('simple test curry');
    await expect(page.locator('.ingredients')).toBeVisible();
    await expect(page.locator('.instructions')).toBeVisible();
    await expect(page.locator('.instructions ol li')).toHaveCount(5);
  });

  test('favourite toggle persists on reload', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');

    const heartBtn = page.locator('#favorite-btn');
    await expect(heartBtn).not.toHaveClass(/favorited/);

    await heartBtn.click();
    await expect(heartBtn).toHaveClass(/favorited/);

    // Reload and check persistence
    await page.reload();
    await expect(page.locator('#favorite-btn')).toHaveClass(/favorited/);
  });

  test('add to shopping list', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');

    const cartBtn = page.locator('.add-to-cart').first();
    const badge = page.locator('#cart-count');

    await expect(cartBtn).not.toHaveClass(/in-cart/);
    await cartBtn.click();
    await expect(cartBtn).toHaveClass(/in-cart/);
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('1');
  });

  test('remove from shopping list', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');

    const cartBtn = page.locator('.add-to-cart').first();

    // Add then remove
    await cartBtn.click();
    await expect(cartBtn).toHaveClass(/in-cart/);

    await cartBtn.click();
    await expect(cartBtn).not.toHaveClass(/in-cart/);
    await expect(page.locator('#cart-count')).toBeHidden();
  });

  test('start cooking navigates to cooking page', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');

    await page.locator('text=Start cooking').click();
    await expect(page).toHaveURL(/cooking\.html\?id=test-curry/);
  });

  test('invalid recipe ID redirects to home', async ({ page }) => {
    await page.goto('/recipe.html?id=nonexistent-recipe');
    await expect(page.locator('.error')).toBeVisible();
    await expect(page.locator('.error')).toContainText('Recipe not found');
  });

  test('displays notes and serving suggestions when present', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');

    // Check notes section is visible
    const notesSection = page.locator('.recipe-notes');
    await expect(notesSection).toBeVisible();
    await expect(notesSection.locator('h3')).toHaveText('Notes');
    await expect(notesSection.locator('p')).toContainText('Make sure to use fresh spices');

    // Check serving suggestions section is visible
    const servingSection = page.locator('.serving-suggestions');
    await expect(servingSection).toBeVisible();
    await expect(servingSection.locator('h3')).toHaveText('Serving Suggestions');
    await expect(servingSection.locator('p')).toContainText('Serve over rice with naan bread');
  });

  test('hides notes and serving suggestions when not present', async ({ page }) => {
    await page.goto('/recipe.html?id=test-salad');

    // Test salad has no notes or serving suggestions
    const notesSection = page.locator('.recipe-notes');
    const servingSection = page.locator('.serving-suggestions');

    await expect(notesSection).toBeHidden();
    await expect(servingSection).toBeHidden();
  });

  test('share button is visible', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');

    const shareBtn = page.locator('#share-btn');
    await expect(shareBtn).toBeVisible();
    await expect(shareBtn).toHaveAttribute('aria-label', 'Share recipe');
  });

  test('share button copies link when Web Share API is unavailable', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');

    // Ensure navigator.share is not available (Playwright doesn't support it)
    const hasShare = await page.evaluate(() => !!navigator.share);
    expect(hasShare).toBe(false);

    // Grant clipboard permissions and click share
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#share-btn').click();

    // Should show copy toast
    const toast = page.locator('.copy-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText('Link copied!');

    // Verify clipboard content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('recipe.html?id=test-curry');

    // Toast should disappear
    await expect(toast).toBeHidden({ timeout: 5000 });
  });
});
