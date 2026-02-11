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
