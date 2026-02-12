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
  await page.goto('/');
});

// Helper to dispatch visibilitychange with a given state
async function simulateVisibilityChange(page, state) {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', {
      value: s,
      writable: true,
      configurable: true
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

test.describe('Home Page', () => {
  test('displays all recipes', async ({ page }) => {
    const cards = page.locator('.recipe-card');
    await expect(cards).toHaveCount(3);

    await expect(cards.nth(0).locator('.recipe-title')).toHaveText('Test Curry');
    await expect(cards.nth(1).locator('.recipe-title')).toHaveText('Test Salad');
    await expect(cards.nth(2).locator('.recipe-title')).toHaveText('Test Toast');
  });

  test('search filters recipes', async ({ page }) => {
    const searchInput = page.locator('#search-input');

    await searchInput.fill('curry');
    const cards = page.locator('.recipe-card');
    await expect(cards).toHaveCount(1);
    await expect(cards.first().locator('.recipe-title')).toHaveText('Test Curry');

    await searchInput.clear();
    await expect(page.locator('.recipe-card')).toHaveCount(3);
  });

  test('search with no results shows empty state', async ({ page }) => {
    const searchInput = page.locator('#search-input');

    await searchInput.fill('pizza');
    await expect(page.locator('.recipe-card')).toHaveCount(0);
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.empty-state p').first()).toHaveText('No recipes found');

    // Click browse all to clear search
    await page.locator('#clear-search-btn').click();
    await expect(page.locator('.recipe-card')).toHaveCount(3);
  });

  test('favourite toggle', async ({ page }) => {
    const firstCard = page.locator('.recipe-card').first();
    const heartBtn = firstCard.locator('.favorite-button-small');

    await expect(heartBtn).not.toHaveClass(/favorited/);
    await heartBtn.click();
    await expect(heartBtn).toHaveClass(/favorited/);
    await heartBtn.click();
    await expect(heartBtn).not.toHaveClass(/favorited/);
  });

  test('favourites filter shows only favourited recipes', async ({ page }) => {
    // Favourite the first recipe
    const firstHeart = page.locator('.recipe-card').first().locator('.favorite-button-small');
    await firstHeart.click();
    await expect(firstHeart).toHaveClass(/favorited/);

    // Toggle favourites filter
    await page.locator('#favorites-filter').click();
    const cards = page.locator('.recipe-card');
    await expect(cards).toHaveCount(1);
    await expect(cards.first().locator('.recipe-title')).toHaveText('Test Curry');

    // Toggle off
    await page.locator('#favorites-filter').click();
    await expect(page.locator('.recipe-card')).toHaveCount(3);
  });

  test('empty favourites state', async ({ page }) => {
    await page.locator('#favorites-filter').click();

    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('#browse-all-btn')).toBeVisible();

    // Click browse all to go back
    await page.locator('#browse-all-btn').click();
    await expect(page.locator('.recipe-card')).toHaveCount(3);
  });

  test('recipe card shows cooking stats when sessions exist', async ({ page }) => {
    // Seed a completed cooking session for test-curry
    await page.evaluate(async () => {
      await initDB();
      const tx = db.transaction(['cooking_sessions'], 'readwrite');
      const store = tx.objectStore('cooking_sessions');
      const now = Date.now();
      store.add({ recipe_id: 'test-curry', started_at: now - 2100000, completed_at: now });
      await new Promise(resolve => { tx.oncomplete = resolve; });
    });

    // Reload to pick up the seeded session
    await page.goto('/');
    await page.waitForTimeout(500);

    const firstCard = page.locator('.recipe-card').first();
    const stats = firstCard.locator('.card-cooking-stats');
    await expect(stats).toBeVisible();
    await expect(stats).toContainText('Cooked once');
    await expect(stats).toContainText('35 minutes');
  });

  test('recipe card hides cooking stats when no sessions', async ({ page }) => {
    const firstCard = page.locator('.recipe-card').first();
    const stats = firstCard.locator('.card-cooking-stats');
    await expect(stats).toHaveCount(0);
  });

  test('navigate to recipe', async ({ page }) => {
    await page.locator('.recipe-card').first().click();
    await expect(page).toHaveURL(/recipe\.html\?id=test-curry/);
  });

  test('cart badge updates', async ({ page }) => {
    const badge = page.locator('#cart-count');
    await expect(badge).toBeHidden();

    // Go to a recipe and add an ingredient to shopping list
    await page.goto('/recipe.html?id=test-curry');
    await page.locator('.add-to-cart').first().click();
    await expect(page.locator('.add-to-cart').first()).toHaveClass(/in-cart/);

    // Go back home and check badge
    await page.goto('/');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('1');
  });
});

test.describe('Install Prompt', () => {
  test('install banner not shown without completed recipe', async ({ page }) => {
    // Dispatch beforeinstallprompt to simulate browser event
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeinstallprompt'));
    });

    await page.waitForTimeout(2500);

    const banner = page.locator('#install-banner');
    await expect(banner).toBeHidden();
  });

  test('install banner shown after recipe completion', async ({ page }) => {
    // Complete a cooking session
    await page.goto('/cooking.html?id=test-curry');
    const nextBtn = page.locator('#next-btn');
    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }
    await nextBtn.click();
    await expect(page).toHaveURL(/completion\.html/);
    await page.waitForTimeout(500);

    // Go to home page — initInstallPrompt will check hasCompletedCooking
    await page.goto('/');
    await page.waitForTimeout(500);

    // Dispatch beforeinstallprompt to trigger the banner path
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeinstallprompt'));
    });

    await page.waitForTimeout(2500);

    const banner = page.locator('#install-banner');
    await expect(banner).toBeVisible();
  });

  test('install banner respects dismissal', async ({ page }) => {
    // Complete a cooking session
    await page.goto('/cooking.html?id=test-curry');
    const nextBtn = page.locator('#next-btn');
    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }
    await nextBtn.click();
    await expect(page).toHaveURL(/completion\.html/);
    await page.waitForTimeout(500);

    // Go home, trigger banner, dismiss it
    await page.goto('/');
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeinstallprompt'));
    });
    await page.waitForTimeout(2500);
    await expect(page.locator('#install-banner')).toBeVisible();

    await page.locator('#install-close').click();
    await expect(page.locator('#install-banner')).toBeHidden();

    // Reload and try again — banner should not reappear (within 30-day cooldown)
    await page.goto('/');
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeinstallprompt'));
    });
    await page.waitForTimeout(2500);
    await expect(page.locator('#install-banner')).toBeHidden();
  });
});

test.describe('Recipe Refresh on Resume', () => {
  const updatedRecipes = [
    ...testRecipes,
    {
      id: 'test-pasta',
      name: 'Test Pasta',
      description: 'A new pasta recipe',
      servings: 2,
      time: 20,
      difficulty: 'easy',
      tags: ['vegan', 'dinner', 'pasta'],
      ingredients: {
        Pantry: [
          { id: 1, text: '200g pasta' },
          { id: 2, text: '1 tbsp olive oil' }
        ]
      },
      steps: ['Cook {pasta}', 'Toss with {olive oil}']
    }
  ];

  test('refreshes recipes when manifest version changes', async ({ page }) => {
    // Confirm initial state: 3 recipes
    await expect(page.locator('.recipe-card')).toHaveCount(3);

    // Update mocks: new manifest version + new recipes
    await page.unroute('**/recipes-manifest.json');
    await page.route('**/recipes-manifest.json', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: 'updated-version', generated_at: '9999999999', recipe_count: 4 })
      });
    });
    await page.unroute('**/recipes.json');
    await page.route('**/recipes.json', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updatedRecipes)
      });
    });

    // Simulate returning to the app
    await simulateVisibilityChange(page, 'visible');

    // Should now show 4 recipes
    await expect(page.locator('.recipe-card')).toHaveCount(4);
    await expect(page.locator('.recipe-card').nth(3).locator('.recipe-title')).toHaveText('Test Pasta');
  });

  test('does not refresh when manifest version is unchanged', async ({ page }) => {
    // Get the current manifest version cached in localStorage
    const currentVersion = await page.evaluate(() => {
      const manifest = localStorage.getItem('recipes-manifest');
      return manifest ? JSON.parse(manifest).version : null;
    });

    // Mock manifest with the SAME version
    await page.unroute('**/recipes-manifest.json');
    await page.route('**/recipes-manifest.json', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: currentVersion, generated_at: '9999999999', recipe_count: 3 })
      });
    });

    // Track whether recipes.json is fetched
    let recipesFetched = false;
    await page.unroute('**/recipes.json');
    await page.route('**/recipes.json', route => {
      recipesFetched = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updatedRecipes)
      });
    });

    // Simulate returning to the app
    await simulateVisibilityChange(page, 'visible');

    // Wait a tick for async to settle
    await page.waitForTimeout(200);

    // Should still show 3 recipes, no fetch happened
    await expect(page.locator('.recipe-card')).toHaveCount(3);
    expect(recipesFetched).toBe(false);
  });
});
