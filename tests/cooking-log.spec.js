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

/**
 * Seed cooking sessions directly into IndexedDB.
 * Each entry: { recipe_id, started_at, completed_at }
 */
async function seedSessions(page, sessions) {
  await page.evaluate(async (data) => {
    await initDB();
    const tx = db.transaction(['cooking_sessions'], 'readwrite');
    const store = tx.objectStore('cooking_sessions');
    for (const s of data) {
      store.add({
        recipe_id: s.recipe_id,
        started_at: s.started_at,
        completed_at: s.completed_at,
        rated_at: null,
        rating_dismissed_at: null
      });
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }, sessions);
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

test.describe('Cooking Log', () => {
  test('empty state when no sessions', async ({ page }) => {
    await page.goto('/cooking-log.html');

    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('#stats-section')).toBeHidden();
    await expect(page.locator('#most-made-section')).toBeHidden();
    await expect(page.locator('#timeline-section')).toBeHidden();

    // Browse recipes link works
    const browseBtn = page.locator('#empty-state .button');
    await expect(browseBtn).toBeVisible();
    await browseBtn.click();
    await expect(page).toHaveURL(/index\.html/);
  });

  test('stats display correct values', async ({ page }) => {
    const now = Date.now();
    const thirtyMin = 30 * 60 * 1000;
    const fortyFiveMin = 45 * 60 * 1000;

    // 3 sessions, 2 distinct recipes
    await page.goto('/cooking-log.html');
    await seedSessions(page, [
      { recipe_id: 'test-curry', started_at: now - thirtyMin, completed_at: now },
      { recipe_id: 'test-curry', started_at: now - fortyFiveMin - 86400000, completed_at: now - 86400000 },
      { recipe_id: 'test-salad', started_at: now - thirtyMin - 86400000 * 2, completed_at: now - 86400000 * 2 },
    ]);
    await page.goto('/cooking-log.html');

    await expect(page.locator('#stats-section')).toBeVisible();
    await expect(page.locator('#stat-times-cooked')).toHaveText('3');
    // Total time = 30 + 45 + 30 = 105 min = 1 hr 45 min
    await expect(page.locator('#stat-time')).toHaveText('1 hr 45 min');
  });

  test('most-made ordering (top 3)', async ({ page }) => {
    const now = Date.now();
    const thirtyMin = 30 * 60 * 1000;

    await page.goto('/cooking-log.html');
    await seedSessions(page, [
      { recipe_id: 'test-curry', started_at: now - thirtyMin, completed_at: now },
      { recipe_id: 'test-curry', started_at: now - thirtyMin - 86400000, completed_at: now - 86400000 },
      { recipe_id: 'test-curry', started_at: now - thirtyMin - 86400000 * 2, completed_at: now - 86400000 * 2 },
      { recipe_id: 'test-salad', started_at: now - thirtyMin - 86400000 * 3, completed_at: now - 86400000 * 3 },
    ]);
    await page.goto('/cooking-log.html');

    await expect(page.locator('#most-made-section')).toBeVisible();
    const rows = page.locator('.most-made-row');
    await expect(rows).toHaveCount(2);

    // First row should be test-curry (3x)
    await expect(rows.first().locator('.most-made-name')).toHaveText('Test Curry');
    await expect(rows.first().locator('.most-made-count')).toContainText('3x');

    // Second row should be test-salad (1x)
    await expect(rows.nth(1).locator('.most-made-name')).toHaveText('Test Salad');
    await expect(rows.nth(1).locator('.most-made-count')).toContainText('1x');
  });

  test('timeline month grouping with day circles', async ({ page }) => {
    const feb15 = new Date('2026-02-15T12:00:00Z').getTime();
    const jan10 = new Date('2026-01-10T12:00:00Z').getTime();
    const thirtyMin = 30 * 60 * 1000;

    await page.goto('/cooking-log.html');
    await seedSessions(page, [
      { recipe_id: 'test-curry', started_at: feb15 - thirtyMin, completed_at: feb15 },
      { recipe_id: 'test-salad', started_at: jan10 - thirtyMin, completed_at: jan10 },
    ]);
    await page.goto('/cooking-log.html');

    await expect(page.locator('#timeline-section')).toBeVisible();
    const months = page.locator('.timeline-month');
    await expect(months).toHaveCount(2);

    // Newest first
    await expect(months.first().locator('.timeline-month-label')).toContainText('February 2026');
    await expect(months.nth(1).locator('.timeline-month-label')).toContainText('January 2026');

    // Day circles show the day number
    const febDay = months.first().locator('.timeline-day');
    await expect(febDay).toHaveText('15');

    const janDay = months.nth(1).locator('.timeline-day');
    await expect(janDay).toHaveText('10');
  });

  test('recipe links navigate to recipe page', async ({ page }) => {
    const now = Date.now();
    const thirtyMin = 30 * 60 * 1000;

    await page.goto('/cooking-log.html');
    await seedSessions(page, [
      { recipe_id: 'test-curry', started_at: now - thirtyMin, completed_at: now },
    ]);
    await page.goto('/cooking-log.html');

    // Click timeline recipe link
    const link = page.locator('.timeline-recipe-name').first();
    await expect(link).toHaveText('Test Curry');
    await link.click();
    await expect(page).toHaveURL(/recipe\.html\?id=test-curry/);
  });

  test('streak calculation', async ({ page }) => {
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const thirtyMin = 30 * 60 * 1000;

    // Cook this week, last week, and two weeks ago → 3-week streak
    await page.goto('/cooking-log.html');
    await seedSessions(page, [
      { recipe_id: 'test-curry', started_at: now - thirtyMin, completed_at: now },
      { recipe_id: 'test-curry', started_at: now - oneWeek - thirtyMin, completed_at: now - oneWeek },
      { recipe_id: 'test-curry', started_at: now - 2 * oneWeek - thirtyMin, completed_at: now - 2 * oneWeek },
    ]);
    await page.goto('/cooking-log.html');

    await expect(page.locator('#stat-streak')).toHaveText('3');
  });
});
