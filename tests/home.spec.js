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
    await expect(cards).toHaveCount(2);
    const titles = await cards.locator('.recipe-title').allTextContents();
    expect(titles).toContain('Test Curry');
    expect(titles).toContain('Test Salad');

    await searchInput.clear();
    await expect(page.locator('.recipe-card')).toHaveCount(3);
  });

  test('title matches rank above ingredient-only matches', async ({ page }) => {
    const searchInput = page.locator('#search-input');

    // "curry" matches Test Curry by name (score 3) + ingredient "curry powder" (1) = 4
    // No other recipe contains "curry" in any field
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

test.describe('Drawer', () => {
  test('opens on hamburger click', async ({ page }) => {
    await page.locator('#drawer-btn').click();
    await expect(page.locator('.drawer-panel')).toBeVisible();
  });

  test('closes on overlay click', async ({ page }) => {
    await page.locator('#drawer-btn').click();
    await expect(page.locator('.drawer-panel')).toBeVisible();

    await page.locator('.drawer-overlay').click({ position: { x: 290, y: 10 } });
    await expect(page.locator('#drawer')).toBeHidden();
  });

  test('closes on close button', async ({ page }) => {
    await page.locator('#drawer-btn').click();
    await expect(page.locator('.drawer-panel')).toBeVisible();

    await page.locator('#drawer-close').click();
    await expect(page.locator('#drawer')).toBeHidden();
  });

  test('closes on Escape key', async ({ page }) => {
    await page.locator('#drawer-btn').click();
    await expect(page.locator('.drawer-panel')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#drawer')).toBeHidden();
  });

  test('shows notification dot when What\'s New has updates', async ({ page }) => {
    await page.evaluate(async () => {
      await setSetting('lastSeenChangelogId', 3);
    });
    await page.goto('/');

    await expect(page.locator('#drawer-dot')).toBeVisible();
  });

  test('dot clears after viewing What\'s New', async ({ page }) => {
    await page.evaluate(async () => {
      await setSetting('lastSeenChangelogId', 2);
    });
    await page.goto('/');
    await expect(page.locator('#drawer-dot')).toBeVisible();

    // Visit the What's New page to mark as seen
    await page.goto('/whats-new.html');
    await page.waitForTimeout(500);

    // Go back — dot should be gone
    await page.goto('/');
    await expect(page.locator('#drawer-dot')).toBeHidden();
  });

  test('contains feedback link and GitHub link in footer', async ({ page }) => {
    await page.locator('#drawer-btn').click();

    const feedbackLink = page.locator('.drawer-footer-link[href="mailto:freely-dole-yard@duck.com"]');
    await expect(feedbackLink).toBeVisible();
    await expect(feedbackLink).toContainText('Send feedback');

    await expect(page.locator('.drawer-footer-meta')).toContainText('GitHub');
  });
});

test.describe('What\'s New', () => {
  test('no dot on first visit', async ({ page }) => {
    await expect(page.locator('#drawer-dot')).toBeHidden();
    await expect(page.locator('#drawer-whats-new-dot')).toBeHidden();
  });

  test('drawer link navigates to whats-new.html', async ({ page }) => {
    await page.locator('#drawer-btn').click();
    await page.locator('#drawer-whats-new').click();
    await expect(page).toHaveURL(/whats-new\.html/);
  });

  test('dot appears when new entries are added after first visit', async ({ page }) => {
    await expect(page.locator('#drawer-dot')).toBeHidden();

    await page.evaluate(async () => {
      await setSetting('lastSeenChangelogId', 3);
    });

    await page.goto('/');
    await expect(page.locator('#drawer-dot')).toBeVisible();

    // Open drawer to check item dot too
    await page.locator('#drawer-btn').click();
    await expect(page.locator('#drawer-whats-new-dot')).toBeVisible();
  });

  test('dot disappears after visiting whats-new page and stays gone on reload', async ({ page }) => {
    await page.evaluate(async () => {
      await setSetting('lastSeenChangelogId', 2);
    });
    await page.goto('/');
    await expect(page.locator('#drawer-dot')).toBeVisible();

    // Visit the What's New page to mark as seen
    await page.goto('/whats-new.html');
    await page.waitForTimeout(500);

    // Go back to home — dot should be gone
    await page.goto('/');
    await expect(page.locator('#drawer-dot')).toBeHidden();

    // Reload — dot should stay gone
    await page.goto('/');
    await expect(page.locator('#drawer-dot')).toBeHidden();
  });
});

test.describe('Chip Filters', () => {
  test('both chip rows present in DOM on load', async ({ page }) => {
    await expect(page.locator('#meal-type-chips')).toBeAttached();
    await expect(page.locator('#cuisine-chips')).toBeAttached();
  });

  test('meal type chips rendered: breakfast, dinner, lunch (all count=1, alphabetical)', async ({ page }) => {
    const chips = page.locator('#meal-type-chips .chip:not(.chip-more)');
    await expect(chips).toHaveCount(3);
    await expect(chips.nth(0)).toHaveText('breakfast');
    await expect(chips.nth(1)).toHaveText('dinner');
    await expect(chips.nth(2)).toHaveText('lunch');
    // No "more" button — exactly 3 = CHIPS_VISIBLE
    await expect(page.locator('#meal-type-chips .chip-more')).toHaveCount(0);
  });

  test('cuisine chips rendered: all 4 visible in alphabetical order at default viewport', async ({ page }) => {
    // 4 cuisines total, all count=1 → alphabetical: american, french, indian, mediterranean
    // At default (wide) viewport all 4 fit without a "more" button
    const chips = page.locator('#cuisine-chips .chip:not(.chip-more)');
    await expect(chips).toHaveCount(4);
    await expect(chips.nth(0)).toHaveText('american');
    await expect(chips.nth(1)).toHaveText('french');
    await expect(chips.nth(2)).toHaveText('indian');
    await expect(chips.nth(3)).toHaveText('mediterranean');
    await expect(page.locator('#cuisine-chips .chip-more')).toHaveCount(0);
  });

  test('clicking a meal type chip filters recipes', async ({ page }) => {
    await page.locator('#meal-type-chips .chip[data-value="dinner"]').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);
    await expect(page.locator('.recipe-title')).toHaveText('Test Curry');
  });

  test('clicking active chip deselects and restores all', async ({ page }) => {
    await page.locator('#meal-type-chips .chip[data-value="dinner"]').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);

    // Click again to deselect
    await page.locator('#meal-type-chips .chip[data-value="dinner"]').click();
    await expect(page.locator('.recipe-card')).toHaveCount(3);
  });

  test('cuisine row narrows when meal type is selected', async ({ page }) => {
    // Select "breakfast" — only test-toast matches (cuisine: american)
    await page.locator('#meal-type-chips .chip[data-value="breakfast"]').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);

    // Cuisine chips should only show "american" now
    const cuisineChips = page.locator('#cuisine-chips .chip:not(.chip-more)');
    await expect(cuisineChips).toHaveCount(1);
    await expect(cuisineChips.first()).toHaveText('american');
  });

  test('meal type row narrows when cuisine is selected', async ({ page }) => {
    // Select "indian" cuisine — only test-curry matches (meal_type: dinner)
    await page.locator('#cuisine-chips .chip[data-value="indian"]').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);

    // Meal type chips should only show "dinner" now
    const mealChips = page.locator('#meal-type-chips .chip:not(.chip-more)');
    await expect(mealChips).toHaveCount(1);
    await expect(mealChips.first()).toHaveText('dinner');
  });

  test('"more" button appears when container is too narrow for all chips', async ({ page }) => {
    // At 380px not all 4 cuisine chips fit — a "more" button should appear
    await page.setViewportSize({ width: 380, height: 800 });
    await page.goto('/');
    await page.waitForSelector('.recipe-card');
    await expect(page.locator('#cuisine-chips .chip-more')).toBeVisible();
    // Only 3 meal types exist — they all fit even at 380px
    await expect(page.locator('#meal-type-chips .chip-more')).toHaveCount(0);
  });

  test('clicking "more" reveals remaining chips with no collapse', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 800 });
    await page.goto('/');
    await page.waitForSelector('.recipe-card');
    await page.locator('#cuisine-chips .chip-more').click();

    // All 4 cuisine chips now visible, no "more" button
    const chips = page.locator('#cuisine-chips .chip:not(.chip-more)');
    await expect(chips).toHaveCount(4);
    const texts = await chips.allTextContents();
    expect(texts).toContain('mediterranean');
    await expect(page.locator('#cuisine-chips .chip-more')).toHaveCount(0);
  });

  test('active chip promoted from hidden when behind "more"', async ({ page }) => {
    // At 380px not all 4 cuisine chips fit — mediterranean is initially hidden
    await page.setViewportSize({ width: 380, height: 800 });
    await page.goto('/?cuisine=mediterranean');
    await expect(page.locator('.recipe-card')).toHaveCount(1);

    // Mediterranean should be promoted into the visible chips
    const visibleChips = page.locator('#cuisine-chips .chip:not(.chip-more)');
    const texts = await visibleChips.allTextContents();
    expect(texts).toContain('mediterranean');

    // The active chip should have chip-active class and be visible (not behind "more")
    await expect(page.locator('#cuisine-chips .chip-active')).toHaveText('mediterranean');
    await expect(page.locator('#cuisine-chips .chip-more')).toBeVisible();
  });

  test('cuisine and meal_type filters persist in URL and restore on reload', async ({ page }) => {
    await page.locator('#cuisine-chips .chip[data-value="indian"]').click();
    await expect(page).toHaveURL(/cuisine=indian/);
    await expect(page.locator('.recipe-card')).toHaveCount(1);

    // Reload
    await page.goto(page.url());
    await expect(page.locator('.recipe-card')).toHaveCount(1);
    await expect(page.locator('.recipe-title')).toHaveText('Test Curry');
    await expect(page.locator('#cuisine-chips .chip-active')).toHaveText('indian');
  });

  test('bidirectionality: selecting incompatible cuisine auto-clears meal type', async ({ page }) => {
    // Select "lunch" meal type (only test-salad: cuisine mediterranean/french)
    await page.locator('#meal-type-chips .chip[data-value="lunch"]').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);
    await expect(page.locator('#meal-type-chips .chip-active')).toHaveText('lunch');

    // Cuisine chips now show french and mediterranean (both from test-salad)
    // Select "american" via the card tag on toast (not visible in chips since filtered)
    // Instead: deselect lunch, select american cuisine, then select lunch
    // American + lunch → no recipe, so lunch should be cleared

    // Deselect lunch first
    await page.locator('#meal-type-chips .chip[data-value="lunch"]').click();
    await expect(page.locator('.recipe-card')).toHaveCount(3);

    // Select "american" cuisine (test-toast: breakfast)
    await page.locator('#cuisine-chips .chip[data-value="american"]').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);
    // meal_type chip row now shows only "breakfast"

    // Now trigger setActiveMealType('lunch') which is incompatible with american
    // by clicking the tag on the salad card (not visible — american shows toast only)
    // Use JS to directly set an incompatible meal type
    await page.evaluate(() => {
      setActiveMealType('lunch');
    });

    // lunch has no american cuisine recipe → activeCuisine should be cleared
    await expect(page.locator('.recipe-card')).toHaveCount(1); // only test-salad has lunch
    await expect(page.locator('.recipe-title')).toHaveText('Test Salad');
    await expect(page.locator('#meal-type-chips .chip-active')).toHaveText('lunch');
    // cuisine active chip should be gone
    await expect(page.locator('#cuisine-chips .chip-active')).toHaveCount(0);
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

test.describe('Pull to Refresh', () => {
  const updatedRecipes = [
    ...testRecipes,
    {
      id: 'test-pasta',
      name: 'Test Pasta',
      description: 'A new pasta recipe added after initial load',
      servings: 2,
      time: 20,
      difficulty: 'easy',
      diet: ['vegan'],
      tested: true,
      ingredients: {
        Pantry: [
          { id: 1, text: '200 g pasta' },
          { id: 2, text: '1 tbsp olive oil' }
        ]
      },
      steps: ['Cook {pasta}', 'Toss with {olive oil}']
    }
  ];

  // Dispatch touchstart → touchmove → touchend on document
  async function simulatePullGesture(page, pullDistance) {
    await page.evaluate((distance) => {
      const startY = 300;
      const endY = startY + distance;
      function makeTouch(type, clientY) {
        const touch = new Touch({ identifier: 1, target: document.body, clientX: 200, clientY });
        return new TouchEvent(type, {
          touches: type === 'touchend' ? [] : [touch],
          changedTouches: [touch],
          bubbles: true,
          cancelable: true,
        });
      }
      document.dispatchEvent(makeTouch('touchstart', startY));
      document.dispatchEvent(makeTouch('touchmove', endY));
      document.dispatchEvent(makeTouch('touchend', endY));
    }, pullDistance);
  }

  test('ptr indicator is present in the DOM', async ({ page }) => {
    await expect(page.locator('#ptr-indicator')).toBeAttached();
  });

  test('force-fetches recipes even when manifest version is unchanged', async ({ page }) => {
    await expect(page.locator('.recipe-card')).toHaveCount(3);

    // Get the version that was cached on initial load
    const currentVersion = await page.evaluate(() => {
      const manifest = localStorage.getItem('recipes-manifest');
      return manifest ? JSON.parse(manifest).version : 'test-version';
    });

    // Same version, but new recipe list — proves version check is bypassed
    await page.route('**/recipes-manifest.json', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: currentVersion, recipe_count: 4 }),
      });
    });
    await page.unroute('**/recipes.json');
    await page.route('**/recipes.json', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updatedRecipes),
      });
    });

    await simulatePullGesture(page, 100); // 100 px > 80 px threshold
    await expect(page.locator('.recipe-card')).toHaveCount(4);
    await expect(page.locator('.recipe-card').last().locator('.recipe-title')).toHaveText('Test Pasta');
  });

  test('does not refresh on a pull shorter than the threshold', async ({ page }) => {
    let recipesFetched = false;
    await page.unroute('**/recipes.json');
    await page.route('**/recipes.json', route => {
      recipesFetched = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(testRecipes),
      });
    });

    await simulatePullGesture(page, 40); // 40 px < 80 px threshold
    await page.waitForTimeout(200);

    await expect(page.locator('.recipe-card')).toHaveCount(3);
    expect(recipesFetched).toBe(false);
  });
});

test.describe('Surprise Me', () => {
  test('surprise button is visible in search bar', async ({ page }) => {
    await expect(page.locator('#surprise-btn')).toBeVisible();
  });

  test('clicking surprise navigates to a recipe page', async ({ page }) => {
    await page.locator('#surprise-btn').click();
    await expect(page).toHaveURL(/recipe\.html\?id=/);
  });

  test('surprise navigates to a recipe matching the active cuisine filter', async ({ page }) => {
    // Apply "indian" cuisine filter via chip (only test-curry matches)
    await page.locator('#cuisine-chips .chip[data-value="indian"]').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);

    await page.locator('#surprise-btn').click();
    await expect(page).toHaveURL(/recipe\.html\?id=test-curry/);
  });

  test('surprise respects favorites-only filter', async ({ page }) => {
    // Favourite only the salad
    await page.locator('.recipe-card').nth(1).locator('.favorite-button-small').click();

    // Enable favorites filter
    await page.locator('#favorites-filter').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);

    await page.locator('#surprise-btn').click();
    await expect(page).toHaveURL(/recipe\.html\?id=test-salad/);
  });

  test('surprise avoids recently seen recipes', async ({ page }) => {
    // Seed history with two of the three visible recipes
    await page.evaluate(() => {
      localStorage.setItem('surpriseHistory', JSON.stringify(['test-curry', 'test-salad']));
    });

    await page.locator('#surprise-btn').click();
    // Only test-toast is not in history, so it must be picked
    await expect(page).toHaveURL(/recipe\.html\?id=test-toast/);
  });

  test('surprise does nothing when no recipes match active filter', async ({ page }) => {
    // Favourite curry, then filter by favorites
    await page.locator('.recipe-card').first().locator('.favorite-button-small').click();
    await page.locator('#favorites-filter').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);

    // Now search for something that produces 0 results within favorites
    await page.fill('#search-input', 'xyzzy-no-match');
    await expect(page.locator('.recipe-card')).toHaveCount(0);

    await page.locator('#surprise-btn').click();
    // Should stay on home page (no navigation)
    await expect(page).toHaveURL(/index\.html|\/$/);
  });

  test('surprise history is stored in localStorage', async ({ page }) => {
    await page.locator('#surprise-btn').click();
    await page.waitForURL(/recipe\.html\?id=/);

    // Navigate back and inspect localStorage (history persists)
    await page.goto('/');
    const history = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('surpriseHistory') || '[]');
    });
    expect(history).toHaveLength(1);
    expect(['test-curry', 'test-salad', 'test-toast']).toContain(history[0]);
  });
});

test.describe('Icon Rendering', () => {
  test('data-icon SVGs are injected on home page', async ({ page }) => {
    // Check a few key icons have non-empty innerHTML after DOMContentLoaded
    const icons = ['menu', 'cart', 'heart', 'shuffle'];
    for (const name of icons) {
      const inner = await page.locator(`svg[data-icon="${name}"]`).first().innerHTML();
      expect(inner.trim(), `icon "${name}" should be injected`).not.toBe('');
    }
  });

  test('SVG icons have expected size attributes', async ({ page }) => {
    const shuffleIcon = page.locator('#surprise-btn svg').first();
    await expect(shuffleIcon).toHaveAttribute('width', '18');
    await expect(shuffleIcon).toHaveAttribute('height', '18');
  });
});

test.describe('First Visit Nudge', () => {
  test('shows nudge when hasSeenHowItWorks is not set', async ({ page }) => {
    const nudge = page.locator('#first-visit-nudge');
    await expect(nudge).toBeVisible();
    await expect(nudge.locator('.nudge-text')).toContainText('everything you can do with BiteMe');
    await expect(nudge.locator('.nudge-btn')).toContainText('Take the tour');
  });

  test('nudge disappears after dismiss and sets flag', async ({ page }) => {
    const nudge = page.locator('#first-visit-nudge');
    await expect(nudge).toBeVisible();

    await page.locator('#nudge-dismiss').click();
    await expect(nudge).toBeHidden();

    const hasSeen = await page.evaluate(async () => {
      return await getSetting('hasSeenHowItWorks');
    });
    expect(hasSeen).toBe(true);
  });

  test('nudge hidden on repeat visits', async ({ page }) => {
    // Set the flag as if user already visited
    await page.evaluate(async () => {
      await setSetting('hasSeenHowItWorks', true);
    });
    await page.goto('/');

    await expect(page.locator('#first-visit-nudge')).toBeHidden();
  });
});
