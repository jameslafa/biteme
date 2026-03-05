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

test.describe('Diet Badges on Cards', () => {
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

  test('all test recipes show vegan badge', async ({ page }) => {
    const cards = page.locator('.recipe-card');
    await expect(cards).toHaveCount(3);

    for (let i = 0; i < 3; i++) {
      const badge = cards.nth(i).locator('.diet-icons .diet-badge');
      await expect(cards.nth(i).locator('.diet-icons')).toBeVisible();
      await expect(badge).toHaveCount(1);
      await expect(badge).toHaveText('V');
      await expect(badge).toHaveAttribute('title', 'Vegan');
    }
  });
});

test.describe('Settings Dietary Toggles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings.html');
    await clearAppState(page);
    await page.goto('/settings.html');
  });

  test('toggles off by default; toggling vegan saves and persists on reload', async ({ page }) => {
    const veganToggle = page.locator('#toggle-vegan');
    const glutenFreeToggle = page.locator('#toggle-gluten-free');

    await expect(veganToggle).not.toBeChecked();
    await expect(glutenFreeToggle).not.toBeChecked();

    await page.locator('#toggle-vegan + .toggle-slider').click();

    const filters = await page.evaluate(async () => getSetting('dietaryFilters'));
    expect(filters).toEqual(['vegan']);

    await page.goto('/settings.html');
    await expect(veganToggle).toBeChecked();
    await expect(glutenFreeToggle).not.toBeChecked();
  });
});

test.describe('Dietary Filtering on Home Page', () => {
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

  test('vegan filter shows only matching recipes; no recipes hidden when all match', async ({ page }) => {
    await page.evaluate(async () => {
      await setSetting('dietaryFilters', ['vegan']);
    });

    await page.goto('/');

    // All 3 test recipes are vegan — none should be hidden
    const cards = page.locator('.recipe-card');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBe(3);

    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i).locator('.diet-badge')).toHaveText('V');
    }
  });
});
