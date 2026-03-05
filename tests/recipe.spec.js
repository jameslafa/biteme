const { test, expect } = require('@playwright/test');
const testRecipes = require('./fixtures/recipes.test.json');

const CURRY_STEPS = testRecipes.find(r => r.id === 'test-curry').steps.length;

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
    await expect(page.locator('.instructions ol li')).toHaveCount(CURRY_STEPS);
  });

  test('favourite toggle persists on reload', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');

    const heartBtn = page.locator('#favorite-btn');
    await expect(heartBtn).not.toHaveClass(/favorited/);

    await heartBtn.click();
    await expect(heartBtn).toHaveClass(/favorited/);

    await page.reload();
    await expect(page.locator('#favorite-btn')).toHaveClass(/favorited/);
  });

  test('shopping list toggle', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');

    const cartBtn = page.locator('.add-to-cart').first();
    const badge = page.locator('#cart-count');

    // Add
    await expect(cartBtn).not.toHaveClass(/in-cart/);
    await cartBtn.click();
    await expect(cartBtn).toHaveClass(/in-cart/);
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('1');

    // Remove
    await cartBtn.click();
    await expect(cartBtn).not.toHaveClass(/in-cart/);
    await expect(badge).toBeHidden();
  });

  test('start cooking navigates to cooking page', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');

    await page.locator('text=Start cooking').click();
    await expect(page).toHaveURL(/cooking\.html\?id=test-curry/);
  });

  test('invalid recipe ID shows error', async ({ page }) => {
    await page.goto('/recipe.html?id=nonexistent-recipe');
    await expect(page.locator('.error')).toBeVisible();
    await expect(page.locator('.error')).toContainText('Recipe not found');
  });

  test('notes and serving suggestions shown when present, hidden when not', async ({ page }) => {
    // test-curry has both
    await page.goto('/recipe.html?id=test-curry');
    await expect(page.locator('.recipe-notes')).toBeVisible();
    await expect(page.locator('.recipe-notes h3')).toHaveText('Notes');
    await expect(page.locator('.recipe-notes p')).toContainText('Make sure to use fresh spices');
    await expect(page.locator('.serving-suggestions')).toBeVisible();
    await expect(page.locator('.serving-suggestions h3')).toHaveText('Serving Suggestions');
    await expect(page.locator('.serving-suggestions p')).toContainText('Serve over rice with naan bread');

    // test-salad has neither
    await page.goto('/recipe.html?id=test-salad');
    await expect(page.locator('.recipe-notes')).toBeHidden();
    await expect(page.locator('.serving-suggestions')).toBeHidden();
  });

  test('cooking stats shown when sessions exist, hidden when not', async ({ page }) => {
    // No sessions — stats hidden
    await page.goto('/recipe.html?id=test-curry');
    await expect(page.locator('.recipe-name')).toBeVisible(); // page ready
    await expect(page.locator('#cooking-stats')).toBeHidden();

    // Seed a session and reload — stats visible
    await page.evaluate(async () => {
      await initDB();
      const tx = db.transaction(['cooking_sessions'], 'readwrite');
      const store = tx.objectStore('cooking_sessions');
      const now = Date.now();
      store.add({ recipe_id: 'test-curry', started_at: now - 1800000, completed_at: now });
      await new Promise(resolve => { tx.oncomplete = resolve; });
    });
    await page.goto('/recipe.html?id=test-curry');
    await expect(page.locator('#cooking-stats')).toBeVisible();
    await expect(page.locator('#cooking-stats')).toContainText('Cooked once');
    await expect(page.locator('#cooking-stats')).toContainText('30 min');
  });

  test('share button copies link to clipboard', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');

    const shareBtn = page.locator('#share-btn');
    await expect(shareBtn).toBeVisible();
    await expect(shareBtn).toHaveAttribute('aria-label', 'Share recipe');

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await shareBtn.click();

    const toast = page.locator('.copy-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText('Link copied!');
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('/r/test-curry.html');
    await expect(toast).toBeHidden({ timeout: 5000 });
  });

  test('similar recipes shown when matches exist, empty when not', async ({ page }) => {
    // test-curry shares garlic + lentil with test-salad
    await page.goto('/recipe.html?id=test-curry');
    const section = page.locator('#similar-recipes');
    await expect(section).toBeVisible();
    await expect(section.locator('h3')).toHaveText('Same ingredients, different dish');
    const items = section.locator('.similar-recipe-item');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toHaveAttribute('href', /recipe\.html\?id=test-salad/);
    await expect(section.locator('.similar-recipe-shared').first()).toContainText('garlic');
    await expect(section.locator('.similar-recipe-shared').first()).toContainText('lentil');

    // test-toast has no shared ingredients with any recipe
    await page.goto('/recipe.html?id=test-toast');
    await expect(page.locator('#similar-recipes')).toBeEmpty();
  });
});
