const { test, expect } = require('@playwright/test');
const testRecipes = require('./fixtures/recipes.test.json');

async function clearAppState(page) {
  await page.evaluate(async () => {
    localStorage.clear();
    // Close any open DB connection from the app
    if (typeof db !== 'undefined' && db) db.close();
    // Unregister service workers so they don't intercept test requests
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

  test('diet badges appear on recipe cards', async ({ page }) => {
    const cards = page.locator('.recipe-card');
    await expect(cards).toHaveCount(3);

    for (let i = 0; i < 3; i++) {
      const dietIcons = cards.nth(i).locator('.diet-icons');
      await expect(dietIcons).toBeVisible();
      await expect(dietIcons.locator('.diet-badge')).toHaveCount(1);
    }
  });

  test('vegan badge shows V', async ({ page }) => {
    const badge = page.locator('.recipe-card').first().locator('.diet-badge');
    await expect(badge).toHaveText('V');
    await expect(badge).toHaveAttribute('title', 'Vegan');
  });

  test('all test recipes show vegan badge', async ({ page }) => {
    // No test recipes have gluten-free, so verify all three show vegan
    const badges = page.locator('.recipe-card .diet-badge');
    await expect(badges).toHaveCount(3);

    for (let i = 0; i < 3; i++) {
      await expect(badges.nth(i)).toHaveText('V');
      await expect(badges.nth(i)).toHaveAttribute('title', 'Vegan');
    }
  });
});

test.describe('Settings Dietary Toggles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings.html');
    await clearAppState(page);
    await page.goto('/settings.html');
  });

  test('dietary toggles are off by default', async ({ page }) => {
    const veganToggle = page.locator('#toggle-vegan');
    const glutenFreeToggle = page.locator('#toggle-gluten-free');

    await expect(veganToggle).not.toBeChecked();
    await expect(glutenFreeToggle).not.toBeChecked();
  });

  test('toggling vegan saves to IndexedDB', async ({ page }) => {
    await page.locator('#toggle-vegan + .toggle-slider').click();

    const filters = await page.evaluate(async () => {
      return await getSetting('dietaryFilters');
    });
    expect(filters).toEqual(['vegan']);
  });

  test('dietary setting persists on reload', async ({ page }) => {
    await page.locator('#toggle-vegan + .toggle-slider').click();

    // Verify the setting was saved before reloading
    const saved = await page.evaluate(async () => {
      return await getSetting('dietaryFilters');
    });
    expect(saved).toEqual(['vegan']);

    await page.goto('/settings.html');

    await expect(page.locator('#toggle-vegan')).toBeChecked();
    await expect(page.locator('#toggle-gluten-free')).not.toBeChecked();
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

  test('vegan filter shows only vegan recipes', async ({ page }) => {
    // Set dietary filter in IndexedDB
    await page.evaluate(async () => {
      await setSetting('dietaryFilters', ['vegan']);
    });

    await page.goto('/');

    // All visible recipe cards should have vegan diet badge
    const cards = page.locator('.recipe-card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const badge = cards.nth(i).locator('.diet-badge');
      await expect(badge).toHaveText('V');
    }
  });

  test('no recipes hidden when filter matches all', async ({ page }) => {
    // All 3 test recipes are vegan, so vegan filter should show all 3
    await page.evaluate(async () => {
      await setSetting('dietaryFilters', ['vegan']);
    });

    await page.goto('/');

    await expect(page.locator('.recipe-card')).toHaveCount(3);
  });
});
