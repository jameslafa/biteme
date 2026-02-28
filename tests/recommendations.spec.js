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

test.beforeEach(async ({ page }) => {
  await page.route('**/recipes.json', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(testRecipes)
    });
  });
  await page.goto('/recipe.html?id=test-curry');
  await clearAppState(page);
  await page.goto('/recipe.html?id=test-curry');
});

test.describe('Recipe Recommendations', () => {
  test('returns similar recipes sorted by score', async ({ page }) => {
    const results = await page.evaluate(async () => {
      return await getSimilarRecipes('test-curry');
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].recipe.id).toBe('test-salad');
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  test('includes shared ingredient names', async ({ page }) => {
    const results = await page.evaluate(async () => {
      return await getSimilarRecipes('test-curry');
    });
    const salad = results.find(r => r.recipe.id === 'test-salad');
    expect(salad).toBeTruthy();
    expect(salad.sharedIngredients).toContain('garlic');
    expect(salad.sharedIngredients).toContain('lentil');
  });

  test('excludes spices from similarity', async ({ page }) => {
    const results = await page.evaluate(async () => {
      return await getSimilarRecipes('test-curry');
    });
    for (const r of results) {
      expect(r.sharedIngredients).not.toContain('curry powder');
    }
  });

  test('does not recommend the recipe to itself', async ({ page }) => {
    const results = await page.evaluate(async () => {
      return await getSimilarRecipes('test-curry');
    });
    expect(results.find(r => r.recipe.id === 'test-curry')).toBeUndefined();
  });

  test('excludes untested recipes', async ({ page }) => {
    const results = await page.evaluate(async () => {
      return await getSimilarRecipes('test-curry');
    });
    expect(results.find(r => r.recipe.id === 'test-soup')).toBeUndefined();
  });

  test('returns empty array for recipe with no matches', async ({ page }) => {
    const results = await page.evaluate(async () => {
      return await getSimilarRecipes('test-toast');
    });
    expect(results).toEqual([]);
  });

  test('respects n parameter', async ({ page }) => {
    const results = await page.evaluate(async () => {
      return await getSimilarRecipes('test-curry', 1);
    });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  test('returns empty array for unknown recipe', async ({ page }) => {
    const results = await page.evaluate(async () => {
      return await getSimilarRecipes('nonexistent');
    });
    expect(results).toEqual([]);
  });

  test('rare ingredients score higher than common ones', async ({ page }) => {
    const results = await page.evaluate(async () => {
      const recipes = await getRecipes();
      const sets = buildRecipeIngredientSets(recipes);
      const idf = computeIDF(sets);
      return {
        garlicIdf: idf.get('garlic'),
        oilIdf: idf.get('vegetable oil'),
      };
    });
    // vegetable oil (df=1) should have higher IDF than garlic (df=2)
    expect(results.oilIdf).toBeGreaterThan(results.garlicIdf);
  });
});
