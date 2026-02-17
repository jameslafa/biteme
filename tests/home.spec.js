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

  test('search by ingredient returns matching recipes', async ({ page }) => {
    const searchInput = page.locator('#search-input');

    await searchInput.fill('lentils');
    const cards = page.locator('.recipe-card');
    await expect(cards).toHaveCount(1);
    await expect(cards.first().locator('.recipe-title')).toHaveText('Test Curry');

    await searchInput.clear();
    await expect(page.locator('.recipe-card')).toHaveCount(3);
  });

  test('title matches rank above ingredient-only matches', async ({ page }) => {
    const searchInput = page.locator('#search-input');

    // "curry" matches Test Curry by name (score 3) + tag (2) + ingredient "curry powder" (1) = 6
    // Other recipes with curry powder but no name/tag match would score 1
    await searchInput.fill('curry');
    const cards = page.locator('.recipe-card');
    await expect(cards).toHaveCount(1);
    await expect(cards.first().locator('.recipe-title')).toHaveText('Test Curry');
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
    await expect(stats).toContainText('35 min');
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

test.describe('What\'s New', () => {
  test('no dot on first visit', async ({ page }) => {
    const dot = page.locator('#whats-new-dot');
    await expect(dot).toBeHidden();
  });

  test('button opens sheet with all entries', async ({ page }) => {
    await page.locator('#whats-new-btn').click();

    const sheet = page.locator('#whats-new-sheet');
    await expect(sheet).toBeVisible();

    const entries = sheet.locator('.whats-new-entry');
    await expect(entries).toHaveCount(12);
    await expect(entries.first().locator('.whats-new-text')).toContainText('Search now matches ingredients');
  });

  test('sheet closes on overlay click', async ({ page }) => {
    await page.locator('#whats-new-btn').click();
    await expect(page.locator('#whats-new-sheet')).toBeVisible();

    await page.locator('.whats-new-overlay').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('#whats-new-sheet')).toBeHidden();
  });

  test('sheet closes on close button', async ({ page }) => {
    await page.locator('#whats-new-btn').click();
    await expect(page.locator('#whats-new-sheet')).toBeVisible();

    await page.locator('#whats-new-close').click();
    await expect(page.locator('#whats-new-sheet')).toBeHidden();
  });

  test('dot appears when new entries are added after first visit', async ({ page }) => {
    // First visit sets lastSeenChangelogId to latest (5), no dot
    await expect(page.locator('#whats-new-dot')).toBeHidden();

    // Simulate a new changelog entry by setting lastSeenChangelogId to an older value
    await page.evaluate(async () => {
      await setSetting('lastSeenChangelogId', 3);
    });

    // Reload — now there are entries with id > 3
    await page.goto('/');
    await expect(page.locator('#whats-new-dot')).toBeVisible();
  });

  test('dot disappears after opening sheet and stays gone on reload', async ({ page }) => {
    // Set up unseen entries
    await page.evaluate(async () => {
      await setSetting('lastSeenChangelogId', 2);
    });
    await page.goto('/');
    await expect(page.locator('#whats-new-dot')).toBeVisible();

    // Open sheet — should mark as seen
    await page.locator('#whats-new-btn').click();
    await expect(page.locator('#whats-new-dot')).toBeHidden();

    // Close and reload — dot should stay gone
    await page.locator('#whats-new-close').click();
    await page.goto('/');
    await expect(page.locator('#whats-new-dot')).toBeHidden();
  });

  test('sheet contains feedback link', async ({ page }) => {
    await page.locator('#whats-new-btn').click();
    const link = page.locator('.whats-new-footer a');
    await expect(link).toHaveText('Send feedback');
    await expect(link).toHaveAttribute('href', 'mailto:freely-dole-yard@duck.com');
  });
});

test.describe('Filter Panel', () => {
  // Helper: open the filter popover
  async function openFilterPanel(page) {
    await page.locator('#tag-filter-btn').click();
    await expect(page.locator('.filter-popover')).toBeVisible();
  }

  // Helper: select a value from a custom dropdown
  async function selectFilterOption(page, selectBtnId, value) {
    await page.locator(`#${selectBtnId}`).click();
    const option = page.locator(`.filter-select.open .filter-option[data-value="${value}"]`);
    await option.click();
  }

  // Helper: seed a rating for a recipe
  async function seedRating(page, recipeId, rating) {
    await page.evaluate(async ({ recipeId, rating }) => {
      await initDB();
      await saveRating(recipeId, rating);
    }, { recipeId, rating });
  }

  test('filter icon opens and closes popover', async ({ page }) => {
    const popover = page.locator('.filter-popover');
    await expect(popover).toBeHidden();

    await page.locator('#tag-filter-btn').click();
    await expect(popover).toBeVisible();

    await page.locator('#tag-filter-btn').click();
    await expect(popover).toBeHidden();
  });

  test('popover closes on outside click', async ({ page }) => {
    await openFilterPanel(page);
    await page.locator('h1').click(); // click header (outside)
    await expect(page.locator('.filter-popover')).toBeHidden();
  });

  test('tag dropdown lists all tags sorted', async ({ page }) => {
    await openFilterPanel(page);
    await page.locator('#tag-select-btn').click();

    const options = page.locator('#tag-options .filter-option');
    // "All" + 7 unique tags: breakfast, curry, dinner, lunch, quick, salad, vegan
    await expect(options).toHaveCount(8);
    await expect(options.nth(0)).toHaveText('All');
    await expect(options.nth(1)).toHaveText('breakfast');
    await expect(options.nth(7)).toHaveText('vegan');
  });

  test('apply button shows live result count', async ({ page }) => {
    await openFilterPanel(page);
    const applyBtn = page.locator('#filter-apply-btn');

    // No filters — all 3 recipes
    await expect(applyBtn).toHaveText('Show 3 recipes');

    // Select tag "curry" — 1 recipe
    await selectFilterOption(page, 'tag-select-btn', 'curry');
    await expect(applyBtn).toHaveText('Show 1 recipe');

    // Select tag "vegan" — all 3
    await selectFilterOption(page, 'tag-select-btn', 'vegan');
    await expect(applyBtn).toHaveText('Show 3 recipes');
  });

  test('selecting tag and clicking Filter applies it', async ({ page }) => {
    await expect(page.locator('.recipe-card')).toHaveCount(3);

    await openFilterPanel(page);
    await selectFilterOption(page, 'tag-select-btn', 'dinner');
    await page.locator('#filter-apply-btn').click();

    // Popover closed, only dinner recipes shown
    await expect(page.locator('.filter-popover')).toBeHidden();
    await expect(page.locator('.recipe-card')).toHaveCount(1);
    await expect(page.locator('.recipe-title')).toHaveText('Test Curry');
  });

  test('filter does not apply until Filter button is clicked', async ({ page }) => {
    await openFilterPanel(page);
    await selectFilterOption(page, 'tag-select-btn', 'dinner');

    // List should still show all 3 recipes (pending, not applied)
    await expect(page.locator('.recipe-card')).toHaveCount(3);
  });

  test('outside click discards pending filter changes', async ({ page }) => {
    await openFilterPanel(page);
    await selectFilterOption(page, 'tag-select-btn', 'dinner');

    // Close by clicking outside (discard)
    await page.locator('h1').click();

    // Reopen — should show "All" again, not "dinner"
    await openFilterPanel(page);
    await expect(page.locator('#tag-select-btn')).toHaveText('All');
    await expect(page.locator('#filter-apply-btn')).toHaveText('Show 3 recipes');
  });

  test('reset clears active filters', async ({ page }) => {
    // Apply a tag filter first
    await openFilterPanel(page);
    await selectFilterOption(page, 'tag-select-btn', 'dinner');
    await page.locator('#filter-apply-btn').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);

    // Open and reset
    await openFilterPanel(page);
    await expect(page.locator('#filter-reset-btn')).toBeVisible();
    await page.locator('#filter-reset-btn').click();

    await expect(page.locator('.recipe-card')).toHaveCount(3);
    await expect(page.locator('.filter-popover')).toBeHidden();
  });

  test('reset button hidden when no filters active', async ({ page }) => {
    await openFilterPanel(page);
    await expect(page.locator('#filter-reset-btn')).toBeHidden();
  });

  test('filter icon shows active state when filters applied', async ({ page }) => {
    const filterIcon = page.locator('#tag-filter-btn');
    await expect(filterIcon).not.toHaveClass(/active/);

    await openFilterPanel(page);
    await selectFilterOption(page, 'tag-select-btn', 'curry');
    await page.locator('#filter-apply-btn').click();

    await expect(filterIcon).toHaveClass(/active/);
  });

  test('rating filter works', async ({ page }) => {
    // Seed ratings: curry=4, salad=2
    await seedRating(page, 'test-curry', 4);
    await seedRating(page, 'test-salad', 2);
    await page.goto('/');

    await openFilterPanel(page);
    await selectFilterOption(page, 'rating-select-btn', '3');
    await expect(page.locator('#filter-apply-btn')).toHaveText('Show 1 recipe');

    await page.locator('#filter-apply-btn').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);
    await expect(page.locator('.recipe-title')).toHaveText('Test Curry');
  });

  test('combined tag and rating filter', async ({ page }) => {
    await seedRating(page, 'test-curry', 5);
    await seedRating(page, 'test-salad', 5);
    await page.goto('/');

    await openFilterPanel(page);
    // Filter by tag "dinner" AND rating 4+ — only curry matches both
    await selectFilterOption(page, 'tag-select-btn', 'dinner');
    await selectFilterOption(page, 'rating-select-btn', '4');
    await expect(page.locator('#filter-apply-btn')).toHaveText('Show 1 recipe');

    await page.locator('#filter-apply-btn').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);
    await expect(page.locator('.recipe-title')).toHaveText('Test Curry');
  });

  test('apply button disabled when no recipes match', async ({ page }) => {
    // No ratings exist, so filtering by 3+ should show 0
    await openFilterPanel(page);
    await selectFilterOption(page, 'rating-select-btn', '3');

    const applyBtn = page.locator('#filter-apply-btn');
    await expect(applyBtn).toHaveText('No recipes match');
    await expect(applyBtn).toBeDisabled();
  });

  test('live count accounts for favorites filter', async ({ page }) => {
    // Favourite only curry
    const firstHeart = page.locator('.recipe-card').first().locator('.favorite-button-small');
    await firstHeart.click();
    await expect(firstHeart).toHaveClass(/favorited/);

    // Enable favorites filter
    await page.locator('#favorites-filter').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);

    // Open filter panel — count should reflect favorites (1 recipe)
    await openFilterPanel(page);
    await expect(page.locator('#filter-apply-btn')).toHaveText('Show 1 recipe');

    // Select a tag that doesn't match the favourite — should be 0
    await selectFilterOption(page, 'tag-select-btn', 'breakfast');
    await expect(page.locator('#filter-apply-btn')).toHaveText('No recipes match');
  });

  test('clicking tag on card applies filter directly', async ({ page }) => {
    // Click "dinner" tag on curry card
    await page.locator('.recipe-card').first().locator('.tag-filter[data-tag="dinner"]').click();

    await expect(page.locator('.recipe-card')).toHaveCount(1);
    await expect(page.locator('.recipe-title')).toHaveText('Test Curry');

    // Filter icon should be active
    await expect(page.locator('#tag-filter-btn')).toHaveClass(/active/);
  });

  test('tag filter persists in URL', async ({ page }) => {
    await openFilterPanel(page);
    await selectFilterOption(page, 'tag-select-btn', 'curry');
    await page.locator('#filter-apply-btn').click();

    await expect(page).toHaveURL(/tag=curry/);

    // Reload — filter should still be applied
    await page.goto(page.url());
    await expect(page.locator('.recipe-card')).toHaveCount(1);
    await expect(page.locator('.recipe-title')).toHaveText('Test Curry');
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
        body: JSON.stringify({ version: 'updated-version', recipe_count: 4 })
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
        body: JSON.stringify({ version: currentVersion, recipe_count: 3 })
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
