const { test, expect } = require('@playwright/test');
const testRecipes = require('./fixtures/recipes.test.json');

// Only tested recipes are eligible for planning
const TESTED_RECIPES = testRecipes.filter(r => r.tested !== false);
const CORPUS_SIZE = TESTED_RECIPES.length; // 3: test-curry, test-salad, test-toast

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
  await page.goto('/plan.html');
  await clearAppState(page);
  await page.goto('/plan.html');
});

test.describe('Meal Plan — Planning Mode', () => {
  test('shows planning steps by default', async ({ page }) => {
    await expect(page.locator('.plan-steps')).toBeVisible();
    await expect(page.locator('#plan-active')).toBeHidden();
  });

  test('N selector renders buttons 2 through 8', async ({ page }) => {
    const btns = page.locator('.plan-n-btn');
    await expect(btns).toHaveCount(7);
    await expect(btns.first()).toHaveText('2');
    await expect(btns.last()).toHaveText('8');
  });

  test('selecting Any recipe shows all eligible recipes', async ({ page }) => {
    await page.selectOption('#plan-seed-select', '__any__');
    await expect(page.locator('#plan-results')).toBeVisible();
    // N defaults to 4, but only CORPUS_SIZE tested recipes exist → capped at corpus size
    await expect(page.locator('.plan-card')).toHaveCount(CORPUS_SIZE);
  });

  test('changing N to fewer than corpus shows fewer cards', async ({ page }) => {
    await page.selectOption('#plan-seed-select', '__any__');
    await expect(page.locator('#plan-results')).toBeVisible();

    await page.click('.plan-n-btn[data-n="2"]');
    await expect(page.locator('.plan-card')).toHaveCount(2);
  });

  test('seed recipe via URL param appears first in suggestions', async ({ page }) => {
    // Navigate with ?seed= so the recipe is pre-selected without needing favorites/sessions
    await page.goto('/plan.html?id=test-curry&seed=test-curry');
    await expect(page.locator('.plan-card')).toHaveCount(CORPUS_SIZE);
    const firstTitle = await page.locator('.plan-card .plan-card-title').first().textContent();
    expect(firstTitle).toBe('Test Curry');
  });
});

test.describe('Meal Plan — Active Mode', () => {
  async function finalisePlan(page) {
    await page.selectOption('#plan-seed-select', '__any__');
    await expect(page.locator('#plan-results')).toBeVisible();
    await expect(page.locator('.plan-card')).toHaveCount(CORPUS_SIZE);
    await page.click('#plan-finalise-btn');
    await expect(page.locator('#plan-active')).toBeVisible();
  }

  test('saving the plan switches to active mode', async ({ page }) => {
    await finalisePlan(page);
    await expect(page.locator('#plan-planning')).toBeHidden();
    await expect(page.locator('.plan-active-card')).toHaveCount(CORPUS_SIZE);
  });

  test('active cards are clickable links to recipe pages', async ({ page }) => {
    await finalisePlan(page);
    const firstCard = page.locator('.plan-active-card').first();
    const recipeId = await firstCard.getAttribute('data-recipe-id');
    await firstCard.click();
    await expect(page).toHaveURL(new RegExp(`recipe\\.html\\?id=${recipeId}`));
  });

  test('cooked button marks card as cooked', async ({ page }) => {
    await finalisePlan(page);
    const btn = page.locator('.plan-cooked-btn').first();
    await expect(btn).not.toHaveClass(/is-cooked/);
    await btn.click();
    await expect(btn).toHaveClass(/is-cooked/);
    await expect(page.locator('.plan-active-card').first()).toHaveClass(/is-cooked/);
  });

  test('cooked button toggles back to uncooked', async ({ page }) => {
    await finalisePlan(page);
    const btn = page.locator('.plan-cooked-btn').first();
    await btn.click();
    await expect(btn).toHaveClass(/is-cooked/);
    await btn.click();
    await expect(btn).not.toHaveClass(/is-cooked/);
  });

  test('subtitle updates with cooked progress', async ({ page }) => {
    await finalisePlan(page);
    await expect(page.locator('#plan-subtitle')).toHaveText('Tap the check when you cook a recipe.');

    await page.locator('.plan-cooked-btn').first().click();
    await expect(page.locator('#plan-subtitle')).toContainText(`of ${CORPUS_SIZE} recipes cooked`);
  });

  test('start new plan returns to planning mode', async ({ page }) => {
    await finalisePlan(page);
    await page.click('#plan-new-btn');
    await expect(page.locator('#plan-planning')).toBeVisible();
    await expect(page.locator('#plan-active')).toBeHidden();
  });

  test('active plan persists on reload', async ({ page }) => {
    await finalisePlan(page);
    await page.reload();
    await expect(page.locator('#plan-active')).toBeVisible();
    await expect(page.locator('.plan-active-card')).toHaveCount(CORPUS_SIZE);
  });

  test('ingredient toggle shows and hides ingredient list', async ({ page }) => {
    await finalisePlan(page);
    const toggleBtn = page.locator('#plan-active-ingredients-toggle');
    const section = page.locator('#plan-active-ingredients-section');

    await expect(section).toBeHidden();
    await toggleBtn.click();
    await expect(section).toBeVisible();
    await toggleBtn.click();
    await expect(section).toBeHidden();
  });
});

test.describe('Meal Plan Banner on Home Page', () => {
  test('banner hidden when no active plan', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#meal-plan-banner')).toBeHidden();
  });

  test('banner visible when active plan has uncooked recipes', async ({ page }) => {
    const plan = [
      { recipe_id: 'test-curry', servings: 4, cooked_at: null },
      { recipe_id: 'test-salad', servings: 4, cooked_at: null },
    ];
    await page.evaluate((plan) => {
      localStorage.setItem('plan_finalized_at', String(Date.now()));
      localStorage.setItem('meal_plan', JSON.stringify(plan));
    }, plan);

    await page.goto('/');
    const banner = page.locator('#meal-plan-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('2 recipes to cook');
  });

  test('banner shows cooked progress when some recipes cooked', async ({ page }) => {
    const plan = [
      { recipe_id: 'test-curry', servings: 4, cooked_at: Date.now() },
      { recipe_id: 'test-salad', servings: 4, cooked_at: null },
    ];
    await page.evaluate((plan) => {
      localStorage.setItem('plan_finalized_at', String(Date.now()));
      localStorage.setItem('meal_plan', JSON.stringify(plan));
    }, plan);

    await page.goto('/');
    const banner = page.locator('#meal-plan-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('1 of 2 recipes cooked');
  });

  test('banner hidden when all recipes cooked', async ({ page }) => {
    const plan = [
      { recipe_id: 'test-curry', servings: 4, cooked_at: Date.now() },
      { recipe_id: 'test-salad', servings: 4, cooked_at: Date.now() },
    ];
    await page.evaluate((plan) => {
      localStorage.setItem('plan_finalized_at', String(Date.now()));
      localStorage.setItem('meal_plan', JSON.stringify(plan));
    }, plan);

    await page.goto('/');
    await expect(page.locator('#meal-plan-banner')).toBeHidden();
  });

  test('banner links to plan.html', async ({ page }) => {
    const plan = [{ recipe_id: 'test-curry', servings: 4, cooked_at: null }];
    await page.evaluate((plan) => {
      localStorage.setItem('plan_finalized_at', String(Date.now()));
      localStorage.setItem('meal_plan', JSON.stringify(plan));
    }, plan);

    await page.goto('/');
    await page.click('#meal-plan-banner');
    await expect(page).toHaveURL(/plan\.html/);
  });
});
