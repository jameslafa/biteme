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

// Helper: complete a cooking session for a recipe by navigating through all steps
async function completeCooking(page, recipeId, stepCount) {
  await page.goto(`/cooking.html?id=${recipeId}`);
  const nextBtn = page.locator('#next-btn');
  for (let i = 0; i < stepCount - 1; i++) {
    await nextBtn.click();
    await page.waitForTimeout(300);
  }
  // Click "Finish" on last step
  await nextBtn.click();
  await expect(page).toHaveURL(/completion\.html/);
  await page.waitForTimeout(500);
}

// Helper: seed a completed cooking session directly in IndexedDB
async function seedCompletedSession(page, recipeId) {
  await page.evaluate(async (rid) => {
    await initDB();
    const sessionId = await saveCookingStart(rid);
    await saveCookingComplete(sessionId);
  }, recipeId);
}

// Helper: seed a rating directly in IndexedDB
async function seedRating(page, recipeId, rating) {
  await page.evaluate(async ({ rid, r }) => {
    await initDB();
    await saveRating(rid, r);
  }, { rid: recipeId, r: rating });
}

// Helper: get all ratings from IndexedDB
async function getRatingsFromDB(page) {
  return page.evaluate(async () => {
    await initDB();
    return getAllRatings();
  });
}

// Helper: get a cooking session's rating fields
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
});

test.describe('Rating Banner', () => {
  test('no banner when no cooking sessions exist', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#rating-banner')).toBeHidden();
  });

  test('banner appears after completing a cooking session', async ({ page }) => {
    await page.goto('/');
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');

    const banner = page.locator('#rating-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Test Curry');
    await expect(banner).toContainText('How was it?');
  });

  test('clicking a star saves rating and shows thanks', async ({ page }) => {
    await page.goto('/');
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');

    const banner = page.locator('#rating-banner');
    await expect(banner).toBeVisible();

    // Click 4th star
    await banner.locator('.star-rating button').nth(3).click();
    await expect(banner).toContainText('Thanks!');

    // Rating saved in DB
    const ratings = await getRatingsFromDB(page);
    expect(ratings).toHaveLength(1);
    expect(ratings[0].recipe_id).toBe('test-curry');
    expect(ratings[0].rating).toBe(4);

    // Banner disappears
    await expect(banner).toBeHidden({ timeout: 3000 });
  });

  test('rating from banner marks session as rated', async ({ page }) => {
    await page.goto('/');
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');

    await page.locator('#rating-banner .star-rating button').nth(2).click();
    await page.waitForTimeout(500);

    const sessions = await getSessionRatingFields(page, 'test-curry');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].rated_at).toBeTruthy();
    expect(sessions[0].rating_dismissed_at).toBeNull();
  });

  test('dismissing banner marks session as dismissed', async ({ page }) => {
    await page.goto('/');
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');

    const banner = page.locator('#rating-banner');
    await expect(banner).toBeVisible();

    await banner.locator('.rating-banner-close').click();
    await expect(banner).toBeHidden();

    const sessions = await getSessionRatingFields(page, 'test-curry');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].rating_dismissed_at).toBeTruthy();
    expect(sessions[0].rated_at).toBeNull();
  });

  test('dismissed banner does not reappear on reload', async ({ page }) => {
    await page.goto('/');
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');

    await page.locator('#rating-banner .rating-banner-close').click();
    await page.waitForTimeout(300);

    await page.goto('/');
    await expect(page.locator('#rating-banner')).toBeHidden();
  });

  test('banner reappears after cooking again even if previously dismissed', async ({ page }) => {
    await page.goto('/');

    // First session — dismiss
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');
    await page.locator('#rating-banner .rating-banner-close').click();
    await page.waitForTimeout(300);

    // Second session for same recipe
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');

    const banner = page.locator('#rating-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Test Curry');
  });

  test('banner reappears after cooking again even if previously rated', async ({ page }) => {
    await page.goto('/');

    // First session — rate it
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');
    await page.locator('#rating-banner .star-rating button').nth(3).click();
    await page.waitForTimeout(1500);

    // Second session
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');

    const banner = page.locator('#rating-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Test Curry');
  });

  test('re-rating updates the existing rating value', async ({ page }) => {
    await page.goto('/');

    // First session — rate 3 stars
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');
    await page.locator('#rating-banner .star-rating button').nth(2).click();
    await page.waitForTimeout(1500);

    let ratings = await getRatingsFromDB(page);
    expect(ratings[0].rating).toBe(3);

    // Second session — rate 5 stars
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');
    await page.locator('#rating-banner .star-rating button').nth(4).click();
    await page.waitForTimeout(500);

    ratings = await getRatingsFromDB(page);
    // Still one rating per recipe, updated to 5
    const curryRatings = ratings.filter(r => r.recipe_id === 'test-curry');
    expect(curryRatings).toHaveLength(1);
    expect(curryRatings[0].rating).toBe(5);
  });

  test('banner stars are empty (not pre-filled) for re-rating', async ({ page }) => {
    await page.goto('/');

    // Rate first time
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');
    await page.locator('#rating-banner .star-rating button').nth(3).click();
    await page.waitForTimeout(1500);

    // Cook again
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');

    // All stars should be unfilled
    const filledStars = page.locator('#rating-banner .star-rating button.filled');
    await expect(filledStars).toHaveCount(0);
  });

  test('only one banner shown at a time (most recent session)', async ({ page }) => {
    await page.goto('/');

    await seedCompletedSession(page, 'test-curry');
    await seedCompletedSession(page, 'test-salad');
    await page.goto('/');

    const banners = page.locator('.rating-banner');
    await expect(banners).toHaveCount(1);
    // Most recent session should be shown
    await expect(banners.first()).toContainText('Test Salad');
  });
});

test.describe('Rating on Recipe Cards', () => {
  test('rated recipe shows stars on card', async ({ page }) => {
    await page.goto('/');
    await seedCompletedSession(page, 'test-curry');
    await seedRating(page, 'test-curry', 4);
    await page.goto('/');

    const card = page.locator('.recipe-card').filter({ hasText: 'Test Curry' });
    const ratingSpan = card.locator('.card-rating');
    await expect(ratingSpan).toBeVisible();
    await expect(ratingSpan).toContainText('★★★★☆');
  });

  test('unrated recipe has no star rating on card', async ({ page }) => {
    await page.goto('/');

    const card = page.locator('.recipe-card').filter({ hasText: 'Test Curry' });
    await expect(card.locator('.card-rating')).toBeHidden();
  });

  test('rating from banner updates card inline', async ({ page }) => {
    await page.goto('/');
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/');

    // Rate via banner
    await page.locator('#rating-banner .star-rating button').nth(4).click();
    await page.waitForTimeout(500);

    // Card should now show rating
    const card = page.locator('.recipe-card').filter({ hasText: 'Test Curry' });
    await expect(card.locator('.card-rating')).toContainText('★★★★★');
  });
});

test.describe('Rating on Recipe Detail Page', () => {
  test('no rating shown when recipe has not been cooked', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');

    const stats = page.locator('#cooking-stats');
    await expect(stats.locator('.star-rating')).toBeHidden();
  });

  test('star rating shown after cooking', async ({ page }) => {
    await page.goto('/');
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/recipe.html?id=test-curry');

    const stats = page.locator('#cooking-stats');
    await expect(stats.locator('.star-rating')).toBeVisible();
  });

  test('existing rating is pre-filled on detail page', async ({ page }) => {
    await page.goto('/');
    await seedCompletedSession(page, 'test-curry');
    await seedRating(page, 'test-curry', 3);
    await page.goto('/recipe.html?id=test-curry');

    const filledStars = page.locator('#cooking-stats .star-rating button.filled');
    await expect(filledStars).toHaveCount(3);
  });

  test('clicking stars on detail page saves rating', async ({ page }) => {
    await page.goto('/');
    await seedCompletedSession(page, 'test-curry');
    await page.goto('/recipe.html?id=test-curry');

    // Click 5th star
    await page.locator('#cooking-stats .star-rating button').nth(4).click();
    await page.waitForTimeout(500);

    const ratings = await getRatingsFromDB(page);
    expect(ratings).toHaveLength(1);
    expect(ratings[0].rating).toBe(5);
  });

  test('changing rating on detail page updates value', async ({ page }) => {
    await page.goto('/');
    await seedCompletedSession(page, 'test-curry');
    await seedRating(page, 'test-curry', 2);
    await page.goto('/recipe.html?id=test-curry');

    // Change to 4 stars
    await page.locator('#cooking-stats .star-rating button').nth(3).click();
    await page.waitForTimeout(500);

    const ratings = await getRatingsFromDB(page);
    const curry = ratings.find(r => r.recipe_id === 'test-curry');
    expect(curry.rating).toBe(4);

    // Visual state updated
    const filledStars = page.locator('#cooking-stats .star-rating button.filled');
    await expect(filledStars).toHaveCount(4);
  });
});
