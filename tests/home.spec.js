const { test, expect } = require('@playwright/test');
const testRecipes = require('./fixtures/recipes.test.json');


// Fixture changelog — max id=5, so setSetting('lastSeenChangelogId', 3) reliably shows a dot
const MOCK_CHANGELOG = [
  { id: 5, date: '2026-03-05', text: 'Newest feature' },
  { id: 3, date: '2026-02-01', text: 'Middle feature' },
  { id: 1, date: '2026-01-01', text: 'Oldest feature' },
];
const MOCK_CHANGELOG_JS = `const CHANGELOG = ${JSON.stringify(MOCK_CHANGELOG)};`;

// Used by both Recipe Refresh and Pull to Refresh describes
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


async function simulateVisibilityChange(page, state) {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', {
      value: s, writable: true, configurable: true
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

test.beforeEach(async ({ page }) => {
  await page.route('**/recipes.json', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(testRecipes)
    });
  });
  await page.route('**/changelog.js', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: MOCK_CHANGELOG_JS,
    });
  });

  await page.goto('/');
  await clearAppState(page);
  await page.goto('/');
});

test.describe('Home Page', () => {
  test('displays all recipes; search by title, ingredient, and empty state', async ({ page }) => {
    // All 3 recipes shown in order
    const cards = page.locator('.recipe-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0).locator('.recipe-title')).toHaveText('Test Curry');
    await expect(cards.nth(1).locator('.recipe-title')).toHaveText('Test Salad');
    await expect(cards.nth(2).locator('.recipe-title')).toHaveText('Test Toast');

    // Search by title
    await page.fill('#search-input', 'curry');
    await expect(cards).toHaveCount(1);
    await expect(cards.first().locator('.recipe-title')).toHaveText('Test Curry');

    // Search by ingredient (lentils appears in curry + salad)
    await page.fill('#search-input', 'lentils');
    await expect(cards).toHaveCount(2);
    const titles = await cards.locator('.recipe-title').allTextContents();
    expect(titles).toContain('Test Curry');
    expect(titles).toContain('Test Salad');

    // No results shows empty state; clear button restores all
    await page.fill('#search-input', 'pizza');
    await expect(cards).toHaveCount(0);
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.empty-state p').first()).toHaveText('No recipes found');
    await page.locator('#clear-search-btn').click();
    await expect(cards).toHaveCount(3);
  });

  test('favourite toggle and filter', async ({ page }) => {
    const heartBtn = page.locator('.recipe-card').first().locator('.favorite-button-small');

    // Toggle off → on → off
    await expect(heartBtn).not.toHaveClass(/favorited/);
    await heartBtn.click();
    await expect(heartBtn).toHaveClass(/favorited/);
    await heartBtn.click();
    await expect(heartBtn).not.toHaveClass(/favorited/);

    // Re-favourite for filter tests
    await heartBtn.click();
    await expect(heartBtn).toHaveClass(/favorited/);

    // Favourites filter shows only the favourited recipe
    await page.locator('#favorites-filter').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);
    await expect(page.locator('.recipe-card').first().locator('.recipe-title')).toHaveText('Test Curry');

    // Toggle filter off restores all
    await page.locator('#favorites-filter').click();
    await expect(page.locator('.recipe-card')).toHaveCount(3);

    // Empty favorites state: unfavourite then re-enable filter
    await heartBtn.click();
    await page.locator('#favorites-filter').click();
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('#browse-all-btn')).toBeVisible();
    await page.locator('#browse-all-btn').click();
    await expect(page.locator('.recipe-card')).toHaveCount(3);
  });

  test('recipe card cooking stats: hidden when no session, visible when session exists', async ({ page }) => {
    // No session — stats element absent
    await expect(page.locator('.recipe-card').first().locator('.card-cooking-stats')).toHaveCount(0);

    // Seed a completed session
    await page.evaluate(async () => {
      await initDB();
      const tx = db.transaction(['cooking_sessions'], 'readwrite');
      const store = tx.objectStore('cooking_sessions');
      const now = Date.now();
      store.add({ recipe_id: 'test-curry', started_at: now - 2100000, completed_at: now });
      await new Promise(resolve => { tx.oncomplete = resolve; });
    });

    await page.goto('/');

    const stats = page.locator('.recipe-card').first().locator('.card-cooking-stats');
    await expect(stats).toBeVisible();
    await expect(stats).toContainText('Cooked once');
    await expect(stats).toContainText('35 min');
  });

  test('card click navigates to recipe; cart badge updates after adding ingredient', async ({ page }) => {
    await expect(page.locator('#cart-count')).toBeHidden();

    await page.locator('.recipe-card').first().click();
    await expect(page).toHaveURL(/recipe\.html\?id=test-curry/);

    await page.locator('.add-to-cart').first().click();
    await expect(page.locator('.add-to-cart').first()).toHaveClass(/in-cart/);

    await page.goto('/');
    await expect(page.locator('#cart-count')).toBeVisible();
    await expect(page.locator('#cart-count')).toHaveText('1');
  });
});

test.describe('Install Prompt', () => {
  test('banner not shown without completed recipe', async ({ page }) => {
    await expect(page.locator('.recipe-card').first()).toBeVisible();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeinstallprompt'));
    });
    await page.waitForTimeout(2500);
    await expect(page.locator('#install-banner')).toBeHidden();
  });

  test('banner shown after recipe completion; stays hidden after dismissal', async ({ page }) => {
    // Seed a completed cooking session directly — no need to navigate through cooking
    await page.evaluate(async () => {
      await initDB();
      const tx = db.transaction(['cooking_sessions'], 'readwrite');
      const now = Date.now();
      tx.objectStore('cooking_sessions').add({ recipe_id: 'test-curry', started_at: now - 1800000, completed_at: now });
      await new Promise(resolve => { tx.oncomplete = resolve; });
    });

    // Home page — banner should appear after prompt event
    await page.goto('/');
    await expect(page.locator('.recipe-card').first()).toBeVisible();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeinstallprompt'));
    });
    await expect(page.locator('#install-banner')).toBeVisible({ timeout: 5000 });

    // Dismiss — banner hides
    await page.locator('#install-close').click();
    await expect(page.locator('#install-banner')).toBeHidden();

    // Reload — banner stays hidden (30-day cooldown)
    await page.goto('/');
    await expect(page.locator('.recipe-card').first()).toBeVisible();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeinstallprompt'));
    });
    await page.waitForTimeout(1000);
    await expect(page.locator('#install-banner')).toBeHidden();
  });
});

test.describe('Drawer', () => {
  test('opens on hamburger click; closes via overlay, close button, and Escape; shows footer links', async ({ page }) => {
    // Opens
    await page.locator('#drawer-btn').click();
    await expect(page.locator('.drawer-panel')).toBeVisible();

    // Contains footer links (check while open)
    await expect(page.locator('.drawer-footer-link[href="mailto:freely-dole-yard@duck.com"]')).toBeVisible();
    await expect(page.locator('.drawer-footer-meta')).toContainText('GitHub');

    // Closes on overlay click
    await page.locator('.drawer-overlay').click({ position: { x: 290, y: 10 } });
    await expect(page.locator('#drawer')).toBeHidden();

    // Closes on close button
    await page.locator('#drawer-btn').click();
    await expect(page.locator('.drawer-panel')).toBeVisible();
    await page.locator('#drawer-close').click();
    await expect(page.locator('#drawer')).toBeHidden();

    // Closes on Escape
    await page.locator('#drawer-btn').click();
    await expect(page.locator('.drawer-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#drawer')).toBeHidden();
  });
});

test.describe('What\'s New', () => {
  test('dot: hidden on first visit; appears for new entries; disappears after visiting', async ({ page }) => {
    // No dot on first visit; drawer link navigates to whats-new
    await expect(page.locator('#drawer-dot')).toBeHidden();
    await expect(page.locator('#drawer-whats-new-dot')).toBeHidden();
    await page.locator('#drawer-btn').click();
    await page.locator('#drawer-whats-new').click();
    await expect(page).toHaveURL(/whats-new\.html/);

    // Dot appears when lastSeenChangelogId is behind the latest
    await page.goto('/');
    await page.evaluate(async () => { await setSetting('lastSeenChangelogId', 3); });
    await page.goto('/');
    await expect(page.locator('#drawer-dot')).toBeVisible();

    // Item dot also visible when drawer is open
    await page.locator('#drawer-btn').click();
    await expect(page.locator('#drawer-whats-new-dot')).toBeVisible();

    // Visiting What's New clears the dot — wait for the IndexedDB write to complete
    await page.goto('/whats-new.html');
    await page.waitForFunction(async () => await getSetting('lastSeenChangelogId') !== 3);
    await page.goto('/');
    await expect(page.locator('#drawer-dot')).toBeHidden();

    // Stays gone on reload
    await page.goto('/');
    await expect(page.locator('#drawer-dot')).toBeHidden();
  });
});

test.describe('Chip Filters', () => {
  test('chip rows with correct labels; click to filter and deselect', async ({ page }) => {
    await expect(page.locator('#meal-type-chips')).toBeAttached();
    await expect(page.locator('#cuisine-chips')).toBeAttached();

    const mealChips = page.locator('#meal-type-chips .chip:not(.chip-more)');
    await expect(mealChips).toHaveCount(3);
    await expect(mealChips.nth(0)).toHaveText('breakfast');
    await expect(mealChips.nth(1)).toHaveText('dinner');
    await expect(mealChips.nth(2)).toHaveText('lunch');
    await expect(page.locator('#meal-type-chips .chip-more')).toHaveCount(0);

    const cuisineChips = page.locator('#cuisine-chips .chip:not(.chip-more)');
    await expect(cuisineChips).toHaveCount(4);
    await expect(cuisineChips.nth(0)).toHaveText('american');
    await expect(cuisineChips.nth(1)).toHaveText('french');
    await expect(cuisineChips.nth(2)).toHaveText('indian');
    await expect(cuisineChips.nth(3)).toHaveText('mediterranean');
    await expect(page.locator('#cuisine-chips .chip-more')).toHaveCount(0);

    // Click to filter; click again to deselect
    await page.locator('#meal-type-chips .chip[data-value="dinner"]').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);
    await expect(page.locator('.recipe-title')).toHaveText('Test Curry');

    await page.locator('#meal-type-chips .chip[data-value="dinner"]').click();
    await expect(page.locator('.recipe-card')).toHaveCount(3);
  });

  test('selecting one category narrows the other', async ({ page }) => {
    // breakfast → only toast → cuisine shows only american
    await page.locator('#meal-type-chips .chip[data-value="breakfast"]').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);
    const cuisineChips = page.locator('#cuisine-chips .chip:not(.chip-more)');
    await expect(cuisineChips).toHaveCount(1);
    await expect(cuisineChips.first()).toHaveText('american');

    // Reset, then select indian cuisine → only curry → meal type shows only dinner
    await page.locator('#meal-type-chips .chip[data-value="breakfast"]').click();
    await page.locator('#cuisine-chips .chip[data-value="indian"]').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);
    const mealChips = page.locator('#meal-type-chips .chip:not(.chip-more)');
    await expect(mealChips).toHaveCount(1);
    await expect(mealChips.first()).toHaveText('dinner');
  });

  test('narrow viewport: "more" button reveals all chips; active chip promoted', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 800 });
    await page.goto('/');
    await page.waitForSelector('.recipe-card');

    await expect(page.locator('#cuisine-chips .chip-more')).toBeVisible();
    await expect(page.locator('#meal-type-chips .chip-more')).toHaveCount(0);

    await page.locator('#cuisine-chips .chip-more').click();
    const chips = page.locator('#cuisine-chips .chip:not(.chip-more)');
    await expect(chips).toHaveCount(4);
    const texts = await chips.allTextContents();
    expect(texts).toContain('mediterranean');
    await expect(page.locator('#cuisine-chips .chip-more')).toHaveCount(0);

    // Active chip promoted when behind "more"
    await page.goto('/?cuisine=mediterranean');
    await expect(page.locator('.recipe-card')).toHaveCount(1);
    const visibleChips = page.locator('#cuisine-chips .chip:not(.chip-more)');
    const visibleTexts = await visibleChips.allTextContents();
    expect(visibleTexts).toContain('mediterranean');
    await expect(page.locator('#cuisine-chips .chip-active')).toHaveText('mediterranean');
    await expect(page.locator('#cuisine-chips .chip-more')).toBeVisible();
  });

  test('cuisine and meal_type filters persist in URL and restore on reload', async ({ page }) => {
    await page.locator('#cuisine-chips .chip[data-value="indian"]').click();
    await expect(page).toHaveURL(/cuisine=indian/);
    await expect(page.locator('.recipe-card')).toHaveCount(1);

    await page.goto(page.url());
    await expect(page.locator('.recipe-card')).toHaveCount(1);
    await expect(page.locator('.recipe-title')).toHaveText('Test Curry');
    await expect(page.locator('#cuisine-chips .chip-active')).toHaveText('indian');
  });

  test('bidirectionality: selecting incompatible cuisine auto-clears meal type', async ({ page }) => {
    await page.locator('#meal-type-chips .chip[data-value="lunch"]').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);
    await expect(page.locator('#meal-type-chips .chip-active')).toHaveText('lunch');

    await page.locator('#meal-type-chips .chip[data-value="lunch"]').click();
    await expect(page.locator('.recipe-card')).toHaveCount(3);

    await page.locator('#cuisine-chips .chip[data-value="american"]').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);

    // Set an incompatible meal type via JS (american has no lunch recipe)
    await page.evaluate(() => { setActiveMealType('lunch'); });

    await expect(page.locator('.recipe-card')).toHaveCount(1);
    await expect(page.locator('.recipe-title')).toHaveText('Test Salad');
    await expect(page.locator('#meal-type-chips .chip-active')).toHaveText('lunch');
    await expect(page.locator('#cuisine-chips .chip-active')).toHaveCount(0);
  });
});

test.describe('Recipe Refresh on Resume', () => {
  test('refreshes on version change; skips refresh when manifest version is unchanged', async ({ page }) => {
    await expect(page.locator('.recipe-card')).toHaveCount(3);

    const currentVersion = await page.evaluate(() => {
      const manifest = localStorage.getItem('recipes-manifest');
      return manifest ? JSON.parse(manifest).version : null;
    });

    // Same version — no recipes fetch
    let recipesFetched = false;
    await page.route('**/recipes-manifest.json', route => {
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ version: currentVersion, recipe_count: 3 })
      });
    });
    await page.unroute('**/recipes.json');
    await page.route('**/recipes.json', route => {
      recipesFetched = true;
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(updatedRecipes)
      });
    });
    await simulateVisibilityChange(page, 'visible');
    await page.waitForTimeout(500);
    await expect(page.locator('.recipe-card')).toHaveCount(3);
    expect(recipesFetched).toBe(false);

    // New version — refreshes and shows 4 recipes
    await page.unroute('**/recipes-manifest.json');
    await page.route('**/recipes-manifest.json', route => {
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ version: 'updated-version', recipe_count: 4 })
      });
    });
    await page.unroute('**/recipes.json');
    await page.route('**/recipes.json', route => {
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(updatedRecipes)
      });
    });
    await simulateVisibilityChange(page, 'visible');
    await expect(page.locator('.recipe-card')).toHaveCount(4);
    await expect(page.locator('.recipe-card').nth(3).locator('.recipe-title')).toHaveText('Test Pasta');
  });
});

test.describe('Pull to Refresh', () => {
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

  test('ptr indicator present; long pull force-fetches even with unchanged manifest', async ({ page }) => {
    await expect(page.locator('#ptr-indicator')).toBeAttached();
    await expect(page.locator('.recipe-card')).toHaveCount(3);

    // Long pull (100px > 80px threshold) — force-fetches even when manifest version unchanged
    const currentVersion = await page.evaluate(() => {
      const manifest = localStorage.getItem('recipes-manifest');
      return manifest ? JSON.parse(manifest).version : 'test-version';
    });
    await page.route('**/recipes-manifest.json', route => {
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ version: currentVersion, recipe_count: 4 })
      });
    });
    await page.unroute('**/recipes.json');
    await page.route('**/recipes.json', route => {
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(updatedRecipes)
      });
    });
    await simulatePullGesture(page, 100);
    await expect(page.locator('.recipe-card')).toHaveCount(4);
    await expect(page.locator('.recipe-card').last().locator('.recipe-title')).toHaveText('Test Pasta');
  });
});

test.describe('Surprise Me', () => {
  test('navigates to recipe, stores history, and avoids recently seen', async ({ page }) => {
    await expect(page.locator('#surprise-btn')).toBeVisible();

    await page.locator('#surprise-btn').click();
    await expect(page).toHaveURL(/recipe\.html\?id=/);

    await page.goto('/');
    const history = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('surpriseHistory') || '[]');
    });
    expect(history).toHaveLength(1);
    expect(['test-curry', 'test-salad', 'test-toast']).toContain(history[0]);

    // Avoids recently seen recipes
    await page.evaluate(() => {
      localStorage.setItem('surpriseHistory', JSON.stringify(['test-curry', 'test-salad']));
    });
    await page.locator('#surprise-btn').click();
    await expect(page).toHaveURL(/recipe\.html\?id=test-toast/);
  });

  test('respects active cuisine filter', async ({ page }) => {
    await page.locator('#cuisine-chips .chip[data-value="indian"]').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);

    await page.locator('#surprise-btn').click();
    await expect(page).toHaveURL(/recipe\.html\?id=test-curry/);
  });

  test('respects favorites-only filter', async ({ page }) => {
    await page.locator('.recipe-card').nth(1).locator('.favorite-button-small').click();
    await page.locator('#favorites-filter').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);

    await page.locator('#surprise-btn').click();
    await expect(page).toHaveURL(/recipe\.html\?id=test-salad/);
  });

  test('does nothing when no recipes match active filter', async ({ page }) => {
    await page.locator('.recipe-card').first().locator('.favorite-button-small').click();
    await page.locator('#favorites-filter').click();
    await expect(page.locator('.recipe-card')).toHaveCount(1);

    await page.fill('#search-input', 'xyzzy-no-match');
    await expect(page.locator('.recipe-card')).toHaveCount(0);

    await page.locator('#surprise-btn').click();
    await expect(page).toHaveURL(/index\.html|\/$/);
  });
});

test.describe('Icon Rendering', () => {
  test('data-icon SVGs injected and have correct size attributes', async ({ page }) => {
    const icons = ['menu', 'cart', 'heart', 'shuffle'];
    for (const name of icons) {
      const inner = await page.locator(`svg[data-icon="${name}"]`).first().innerHTML();
      expect(inner.trim(), `icon "${name}" should be injected`).not.toBe('');
    }

    const shuffleIcon = page.locator('#surprise-btn svg').first();
    await expect(shuffleIcon).toHaveAttribute('width', '18');
    await expect(shuffleIcon).toHaveAttribute('height', '18');
  });
});

test.describe('First Visit Nudge', () => {
  test('shows on first visit, dismissed sets flag, hidden on repeat visit', async ({ page }) => {
    const nudge = page.locator('#first-visit-nudge');

    // Visible on first visit with correct content
    await expect(nudge).toBeVisible();
    await expect(nudge.locator('.nudge-text')).toContainText('everything you can do with BiteMe');
    await expect(nudge.locator('.nudge-btn')).toContainText('Take the tour');

    // Dismiss hides the nudge and sets the flag
    await page.locator('#nudge-dismiss').click();
    await expect(nudge).toBeHidden();
    const hasSeen = await page.evaluate(async () => getSetting('hasSeenHowItWorks'));
    expect(hasSeen).toBe(true);

    // Repeat visit: nudge stays hidden
    await page.goto('/');
    await expect(nudge).toBeHidden();
  });
});
