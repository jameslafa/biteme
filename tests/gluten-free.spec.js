const { test, expect } = require('@playwright/test');
const testRecipes = require('./fixtures/recipes.test.json');

// test-salad is [vegan, gluten-free] with soy sauce (gluten: contains, swap) and
// oat milk (gluten: check, note). test-curry isn't gluten-free.

const SOY_NOTE = 'Use gluten-free soy sauce or tamari';
const OAT_NOTE = 'Use certified gluten-free oat milk';

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
  await page.goto('/');
});

const ingredient = (page, text) => page.locator('.ingredient-item', { hasText: text });

test.describe('Gluten-free version on the recipe page', () => {
  test('toggle shows swap notes and carries into the URL; only on gluten-free recipes', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');
    await expect(page.locator('.recipe-name')).toHaveText('Test Curry');
    await expect(page.locator('#gf-toggle')).toHaveCount(0);

    await page.goto('/recipe.html?id=test-salad');
    const toggle = page.locator('#gf-toggle');
    await expect(toggle).not.toBeChecked();
    await expect(page.locator('.gf-note')).toHaveCount(0);

    await page.locator('.gf-toggle-row').click();
    await expect(toggle).toBeChecked();
    await expect(ingredient(page, 'soy sauce').locator('.gf-note')).toHaveText(`GF${SOY_NOTE}`);
    await expect(ingredient(page, 'oat milk').locator('.gf-note')).toHaveText(`GF${OAT_NOTE}`);
    await expect(page.locator('.gf-note')).toHaveCount(2);
    await expect(page).toHaveURL(/id=test-salad&diet=gluten-free/);

    await page.locator('.gf-toggle-row').click();
    await expect(page.locator('.gf-note')).toHaveCount(0);
    await expect(page).not.toHaveURL(/diet=/);
  });

  test('on automatically when arriving with the gluten-free diet; carried into cooking mode and back', async ({ page }) => {
    await page.goto('/recipe.html?id=test-salad&diet=gluten-free');
    await expect(page.locator('#gf-toggle')).toBeChecked();
    await expect(page.locator('.gf-note')).toHaveCount(2);

    await page.locator('.button-primary', { hasText: 'Start cooking' }).click();
    await expect(page).toHaveURL(/cooking\.html\?id=test-salad&diet=gluten-free/);

    // Step 3 uses soy sauce
    await page.locator('#next-btn').click();
    await page.locator('#next-btn').click();
    await expect(page.locator('#step-progress')).toHaveText('Step 3 of 3');
    await expect(page.locator('.step-ingredients-cooking li', { hasText: 'soy sauce' }).locator('.gf-note')).toHaveText(`GF${SOY_NOTE}`);

    await page.locator('#exit-btn').click();
    await expect(page).toHaveURL(/recipe\.html\?id=test-salad&diet=gluten-free/);
  });
});

test.describe('Gluten-free version in the shopping list', () => {
  test('items added with the GF version on show the swap, and don\'t merge with the regular version', async ({ page }) => {
    await page.goto('/recipe.html?id=test-salad&diet=gluten-free');
    await ingredient(page, 'soy sauce').locator('.add-to-cart').click();
    await expect(page.locator('#cart-count')).toHaveText('1');

    // The same ingredient also on the list as the regular version (seeded directly)
    await page.evaluate(async () => {
      await initDB();
      const tx = db.transaction(['shopping_list'], 'readwrite');
      tx.objectStore('shopping_list').add({
        recipe_id: 'test-salad', ingredient_id: 6, gluten_free: false, checked_at: null, created_at: Date.now(),
      });
      await new Promise(resolve => { tx.oncomplete = resolve; });
    });

    await page.goto('/shopping.html');
    const soyRows = page.locator('.merged-item', { hasText: 'soy sauce' });
    await expect(soyRows).toHaveCount(2);
    await expect(page.locator('.merged-item .gf-note')).toHaveText([`GF${SOY_NOTE}`]);

    await page.locator('.view-toggle-btn[data-view="by-recipe"]').click();
    await expect(page.locator('.shopping-item .gf-note')).toHaveText([`GF${SOY_NOTE}`]);
  });
});
