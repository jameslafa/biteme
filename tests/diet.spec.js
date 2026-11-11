const { test, expect } = require('@playwright/test');
const testRecipes = require('./fixtures/recipes.test.json');

// Fixture diets: test-curry [vegan], test-salad [vegan, gluten-free], test-toast [vegetarian]

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
  await page.goto('/');
  await clearAppState(page);
  await page.goto('/');
});

const card = (page, name) => page.locator('.recipe-card', { hasText: name });
const dietChip = (page, diet) => page.locator(`#diet-chips .chip[data-value="${diet}"]`);

// Diet chips live in the "Cooking for" sheet
async function openCookingFor(page) {
  await page.locator('#cooking-for-btn').click();
  await expect(page.locator('#cooking-for-sheet')).toBeVisible();
}

async function closeCookingFor(page) {
  await page.locator('#cooking-for-done').click();
  await expect(page.locator('#cooking-for-sheet')).toBeHidden();
}

test.describe('Diet Badges', () => {
  test('cards and recipe page show the recipe\'s diet badges', async ({ page }) => {
    await expect(page.locator('.recipe-card')).toHaveCount(3);
    await expect(card(page, 'Test Curry').locator('.diet-badge')).toHaveText(['V']);
    await expect(card(page, 'Test Salad').locator('.diet-badge')).toHaveText(['V', 'GF']);
    await expect(card(page, 'Test Toast').locator('.diet-badge')).toHaveText(['Vg']);

    await page.goto('/recipe.html?id=test-salad');
    await expect(page.locator('.recipe-tags .diet-badge')).toHaveText(['V', 'GF']);
  });
});

test.describe('Diet Chips', () => {
  test('diets combine; vegan counts as vegetarian; selection lives in the URL', async ({ page }) => {
    await expect(page.locator('#cooking-for-bar')).toBeHidden();
    await openCookingFor(page);
    await expect(page.locator('#diet-chips .chip')).toHaveText(['VVegan', 'VgVegetarian', 'GFGluten-free']);
    await expect(page.locator('#diet-chips .chip-active')).toHaveCount(0);

    await dietChip(page, 'gluten-free').click();
    await expect(page.locator('.recipe-title')).toHaveText(['Test Salad']);
    await expect(dietChip(page, 'gluten-free')).toHaveAttribute('aria-pressed', 'true');

    await dietChip(page, 'vegan').click();
    await expect(page).toHaveURL(/diet=vegan%2Cgluten-free/);
    await expect(page.locator('.recipe-title')).toHaveText(['Test Salad']);

    await dietChip(page, 'gluten-free').click();
    await expect(page.locator('.recipe-card')).toHaveCount(2);
    await expect(card(page, 'Test Toast')).toHaveCount(0);

    // Vegetarian includes vegan recipes
    await dietChip(page, 'vegan').click();
    await dietChip(page, 'vegetarian').click();
    await expect(page.locator('.recipe-card')).toHaveCount(3);

    // Summary line shows the selection; reload keeps it (it's in the URL)
    await closeCookingFor(page);
    await expect(page.locator('#cooking-for-bar .cooking-for-label')).toHaveText('Vegetarian');
    await page.reload();
    await expect(page.locator('#cooking-for-bar .cooking-for-label')).toHaveText('Vegetarian');

    // Clear button removes it
    await page.locator('.cooking-for-clear').click();
    await expect(page.locator('#cooking-for-bar')).toBeHidden();
    await expect(page).not.toHaveURL(/diet=/);

    // Opening the app fresh starts with no diet selected
    await openCookingFor(page);
    await dietChip(page, 'gluten-free').click();
    await page.goto('/');
    await expect(page.locator('#cooking-for-bar')).toBeHidden();
    await expect(page.locator('.recipe-card')).toHaveCount(3);
  });

  test('"Browse all recipes" on the empty state clears diets too', async ({ page }) => {
    await openCookingFor(page);
    await dietChip(page, 'gluten-free').click();
    await closeCookingFor(page);
    await page.fill('#search-input', 'toast');
    await expect(page.locator('.recipe-card')).toHaveCount(0);

    await page.locator('#clear-search-btn').click();
    await expect(page.locator('.recipe-card')).toHaveCount(3);
    await expect(page.locator('#cooking-for-bar')).toBeHidden();
    await expect(page).not.toHaveURL(/diet=/);
  });
});

test.describe('Diet on the Recipe Page', () => {
  test('active diet carries to the recipe page and filters similar recipes', async ({ page }) => {
    await openCookingFor(page);
    await dietChip(page, 'vegan').click();
    await closeCookingFor(page);
    await card(page, 'Test Curry').click();
    await expect(page).toHaveURL(/id=test-curry&diet=vegan/);

    // Salad shares ingredients with curry and is vegan: shown, and its link keeps the diet
    const similar = page.locator('.similar-recipe-item', { hasText: 'Test Salad' });
    await expect(similar).toHaveAttribute('href', 'recipe.html?id=test-salad&diet=vegan');

    // Curry isn't gluten-free, so it's not suggested from the salad under a GF diet
    await page.goto('/recipe.html?id=test-salad');
    await expect(page.locator('.similar-recipe-item', { hasText: 'Test Curry' })).toBeVisible();
    await page.goto('/recipe.html?id=test-salad&diet=gluten-free');
    await expect(page.locator('.recipe-name')).toHaveText('Test Salad');
    await page.waitForTimeout(500);
    await expect(page.locator('.similar-recipe-item', { hasText: 'Test Curry' })).toHaveCount(0);
  });
});
