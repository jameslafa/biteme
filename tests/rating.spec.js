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

async function seedCompletedSession(page, recipeId) {
  await page.evaluate(async (rid) => {
    await initDB();
    const sessionId = await saveCookingStart(rid);
    await saveCookingComplete(sessionId);
  }, recipeId);
}

async function seedRating(page, recipeId, rating) {
  await page.evaluate(async ({ rid, r }) => {
    await initDB();
    await saveRating(rid, r);
  }, { rid: recipeId, r: rating });
}

async function getRatingsFromDB(page) {
  return page.evaluate(async () => {
    await initDB();
    return getAllRatings();
  });
}

async function getSessionRatingFields(page, recipeId) {
  return page.evaluate(async (rid) => {
    await initDB();
    const sessions = await getCookingSessionsByRecipe(rid);
    return sessions.map(s => ({
      id: s.id,
      rated_at: s.rated_at,
      rating_dismissed_at: s.rating_dismissed_at
    }));
  }, recipeId);
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

test.describe('Rating Banner', () => {
  test('no banner without session; appears with recipe name after cooking', async ({ page }) => {
    await expect(page.locator('#rating-banner')).toBeHidden();

    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');
    const banner = page.locator('#rating-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Test Curry');
    await expect(banner).toContainText('How was it?');
  });

  test('star click: shows thanks, saves rating to DB, marks session as rated', async ({ page }) => {
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');

    const banner = page.locator('#rating-banner');
    await expect(banner).toBeVisible();

    await banner.locator('.star-rating button').nth(3).click();
    await expect(banner).toContainText('Thanks!');
    await expect(banner).toBeHidden({ timeout: 3000 });

    const ratings = await getRatingsFromDB(page);
    expect(ratings).toHaveLength(1);
    expect(ratings[0].recipe_id).toBe('test-curry');
    expect(ratings[0].rating).toBe(4);

    const sessions = await getSessionRatingFields(page, 'test-curry');
    expect(sessions[0].rated_at).toBeTruthy();
    expect(sessions[0].rating_dismissed_at).toBeNull();
  });

  test('dismiss: hides banner, marks session dismissed, stays hidden on reload', async ({ page }) => {
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');

    const banner = page.locator('#rating-banner');
    await expect(banner).toBeVisible();

    await banner.locator('.rating-banner-close').click();
    await expect(banner).toBeHidden();

    const sessions = await getSessionRatingFields(page, 'test-curry');
    expect(sessions[0].rating_dismissed_at).toBeTruthy();
    expect(sessions[0].rated_at).toBeNull();

    await page.goto('/');
    await expect(page.locator('#rating-banner')).toBeHidden();
  });

  test('banner reappears after second cook even if first was dismissed', async ({ page }) => {
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');
    await page.locator('#rating-banner .rating-banner-close').click();
    await expect(page.locator('#rating-banner')).toBeHidden();

    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');
    await expect(page.locator('#rating-banner')).toBeVisible();
    await expect(page.locator('#rating-banner')).toContainText('Test Curry');
  });

  test('banner reappears after second cook even if first was rated', async ({ page }) => {
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');
    await page.locator('#rating-banner .star-rating button').nth(3).click();
    await expect(page.locator('#rating-banner')).toBeHidden({ timeout: 3000 });

    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');
    await expect(page.locator('#rating-banner')).toBeVisible();
    await expect(page.locator('#rating-banner')).toContainText('Test Curry');
  });

  test('re-rating: upserts rating value; banner shows empty stars for second session', async ({ page }) => {
    // First session — rate 3 stars
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');
    await page.locator('#rating-banner .star-rating button').nth(2).click();
    await expect(page.locator('#rating-banner')).toBeHidden({ timeout: 3000 });

    let ratings = await getRatingsFromDB(page);
    expect(ratings[0].rating).toBe(3);

    // Second session — stars should be empty (no pre-fill)
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');
    await expect(page.locator('#rating-banner .star-rating button.filled')).toHaveCount(0);

    // Rate 5 stars — upserts to 5
    await page.locator('#rating-banner .star-rating button').nth(4).click();
    await expect(page.locator('#rating-banner')).toContainText('Thanks!');

    ratings = await getRatingsFromDB(page);
    const curryRatings = ratings.filter(r => r.recipe_id === 'test-curry');
    expect(curryRatings).toHaveLength(1);
    expect(curryRatings[0].rating).toBe(5);
  });

  test('only one banner shown at a time (most recent session)', async ({ page }) => {
    await seedCompletedSession(page, 'test-curry');
    await seedCompletedSession(page, 'test-salad');
    await page.goto('/');

    await expect(page.locator('.rating-banner')).toHaveCount(1);
    await expect(page.locator('.rating-banner').first()).toContainText('Test Salad');
  });
});

test.describe('Rating on Recipe Cards', () => {
  test('card hidden when unrated; shows stars when rated', async ({ page }) => {
    const card = page.locator('.recipe-card').filter({ hasText: 'Test Curry' });
    await expect(card.locator('.card-rating')).toBeHidden();

    await seedCompletedSession(page, 'test-curry');
    await seedRating(page, 'test-curry', 4);
    await page.goto('/');
    await expect(card.locator('.card-rating')).toContainText('★★★★☆');
  });

  test('rating from banner updates card inline', async ({ page }) => {
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');

    await page.locator('#rating-banner .star-rating button').nth(4).click();

    const card = page.locator('.recipe-card').filter({ hasText: 'Test Curry' });
    await expect(card.locator('.card-rating')).toContainText('★★★★★');
  });
});

test.describe('Rating on Recipe Detail Page', () => {
  test('star rating hidden without session; visible after cooking', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');
    await expect(page.locator('#cooking-stats .star-rating')).toBeHidden();

    await seedCompletedSession(page, 'test-curry');
    await page.goto('/recipe.html?id=test-curry');
    await expect(page.locator('#cooking-stats .star-rating')).toBeVisible();
  });

  test('existing rating pre-fills stars; clicking new star updates value', async ({ page }) => {
    await page.goto('/');
    await seedCompletedSession(page, 'test-curry');
    await seedRating(page, 'test-curry', 2);
    await page.goto('/recipe.html?id=test-curry');

    const filledStars = page.locator('#cooking-stats .star-rating button.filled');
    await expect(filledStars).toHaveCount(2);

    await page.locator('#cooking-stats .star-rating button').nth(3).click();
    await expect(filledStars).toHaveCount(4);

    const ratings = await getRatingsFromDB(page);
    expect(ratings.find(r => r.recipe_id === 'test-curry').rating).toBe(4);
  });

  test('clicking stars on detail page saves new rating', async ({ page }) => {
    await page.goto('/');
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/recipe.html?id=test-curry');

    await page.locator('#cooking-stats .star-rating button').nth(4).click();
    await expect(page.locator('#cooking-stats .star-rating button.filled')).toHaveCount(5);

    const ratings = await getRatingsFromDB(page);
    expect(ratings).toHaveLength(1);
    expect(ratings[0].rating).toBe(5);
  });
});
