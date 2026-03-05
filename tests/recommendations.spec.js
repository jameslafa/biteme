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
  test('getSimilarRecipes: sorted by score, correct ingredients, all exclusions applied', async ({ page }) => {
    const results = await page.evaluate(async () => getSimilarRecipes('test-curry'));

    // Sorted by score, test-salad first (shares garlic + lentil)
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].recipe.id).toBe('test-salad');
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }

    // Shared ingredients include garlic and lentil
    const salad = results.find(r => r.recipe.id === 'test-salad');
    expect(salad.sharedIngredients).toContain('garlic');
    expect(salad.sharedIngredients).toContain('lentil');

    // Does not include self, untested recipes, spices, or stoplist ingredients
    expect(results.find(r => r.recipe.id === 'test-curry')).toBeUndefined();
    expect(results.find(r => r.recipe.id === 'test-soup')).toBeUndefined();
    for (const r of results) {
      expect(r.sharedIngredients).not.toContain('curry powder');
      expect(r.sharedIngredients).not.toContain('vegetable oil');
      expect(r.sharedIngredients).not.toContain('olive oil');
      expect(r.sharedIngredients).not.toContain('butter');
    }

    // Respects n parameter
    const limited = await page.evaluate(async () => getSimilarRecipes('test-curry', 1));
    expect(limited.length).toBeLessThanOrEqual(1);
  });

  test('returns empty array for recipe with no matches and for unknown id', async ({ page }) => {
    const [noMatches, unknown] = await page.evaluate(async () => [
      await getSimilarRecipes('test-toast'),
      await getSimilarRecipes('nonexistent'),
    ]);
    expect(noMatches).toEqual([]);
    expect(unknown).toEqual([]);
  });

  test('IDF scoring: rare ingredients score higher; Fresh weighted above Pantry', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const recipes = await getRecipes();
      const maps = buildRecipeIngredientMaps(recipes);
      const idf = computeIDF(maps);

      // onion (only in test-curry) has higher IDF than garlic (in multiple recipes)
      const garlicIdf = idf.get('garlic');
      const onionIdf = idf.get('onion');

      // Fresh ingredient sharer scores higher than Pantry ingredient sharer
      const targetMap = maps.get('test-curry');
      function scoreAgainst(recipeId) {
        const other = maps.get(recipeId);
        let s = 0;
        for (const [c, cat] of targetMap) {
          if (other.has(c)) {
            const w = Math.max(CATEGORY_WEIGHT[cat] || 1, CATEGORY_WEIGHT[other.get(c)] || 1);
            s += idf.get(c) * w;
          }
        }
        return s;
      }

      return {
        onionIdf,
        garlicIdf,
        freshSharerScore: scoreAgainst('test-fresh-sharer'),
        pantrySharerScore: scoreAgainst('test-pantry-sharer'),
      };
    });

    expect(result.onionIdf).toBeGreaterThan(result.garlicIdf);
    expect(result.freshSharerScore).toBeGreaterThan(result.pantrySharerScore);
  });
});
