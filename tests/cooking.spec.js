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
});

test.describe('Cooking Mode', () => {
  test('shows recipe name and first step', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    await expect(page.locator('#recipe-name')).toHaveText('Test Curry');
    await expect(page.locator('#step-progress')).toHaveText('Step 1 of 5');
    await expect(page.locator('#step-content')).toContainText('Heat');
  });

  test('navigate through steps', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    await expect(page.locator('#step-progress')).toHaveText('Step 1 of 5');

    await page.locator('#next-btn').click();
    await expect(page.locator('#step-progress')).toHaveText('Step 2 of 5');

    await page.locator('#next-btn').click();
    await expect(page.locator('#step-progress')).toHaveText('Step 3 of 5');

    // Progress bar should have grown
    const progressBar = page.locator('#progress-bar');
    const width = await progressBar.evaluate(el => el.style.width);
    expect(parseFloat(width)).toBeGreaterThan(0);
  });

  test('previous on step 1 goes back to recipe', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    const prevBtn = page.locator('#prev-btn');
    await expect(prevBtn).toHaveText('Back to recipe');

    await prevBtn.click();
    await expect(page).toHaveURL(/recipe\.html\?id=test-curry/);
  });

  test('finish on last step goes to completion', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    const nextBtn = page.locator('#next-btn');

    // Navigate to last step (5 steps, need 4 clicks to reach last)
    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    await expect(page.locator('#step-progress')).toHaveText('Step 5 of 5');
    await expect(nextBtn).toHaveText('Finish');

    await nextBtn.click();
    await expect(page).toHaveURL(/completion\.html\?id=test-curry&session=\d+/);
  });

  test('step ingredients shown when relevant', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    // Step 1 uses oil and onion — ingredients container should be visible
    const ingredientsContainer = page.locator('#step-ingredients-container');
    await expect(ingredientsContainer).toBeVisible();
    await expect(ingredientsContainer.locator('.step-ingredients-cooking')).toBeVisible();
  });

  test('ingredient links are parsed and displayed correctly', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    // Step 1: "Heat {oil} in a pot" - should show oil as an ingredient
    await expect(page.locator('#step-content')).toContainText('Heat');
    await expect(page.locator('#step-content')).toContainText('oil');

    const step1Container = page.locator('#step-ingredients-container');
    await expect(step1Container).toBeVisible();
    await expect(step1Container.locator('li')).toContainText('1 tbsp oil');

    // Move to Step 2: "Add {onion} and {garlic}"
    await page.locator('#next-btn').click();
    await page.waitForTimeout(300);

    const step2Container = page.locator('#step-ingredients-container');
    await expect(step2Container).toBeVisible();
    const step2Items = step2Container.locator('li');
    await expect(step2Items.first()).toContainText('onion');
    await expect(step2Items.nth(1)).toContainText('garlic');
  });

  test('steps without ingredient links show no ingredients', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    // Navigate to Step 5: "Simmer for 20 minutes" - no ingredient links
    const nextBtn = page.locator('#next-btn');
    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    await expect(page.locator('#step-progress')).toHaveText('Step 5 of 5');
    await expect(page.locator('#step-content')).toContainText('Simmer');

    // Ingredients container should be hidden when no ingredients referenced
    const ingredientsContainer = page.locator('#step-ingredients-container');
    await expect(ingredientsContainer).toBeHidden();
  });

  test('previous button text changes after step 1', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    const prevBtn = page.locator('#prev-btn');
    await expect(prevBtn).toHaveText('Back to recipe');

    await page.locator('#next-btn').click();
    await page.waitForTimeout(300);
    await expect(prevBtn).toHaveText('Previous');
  });
});

test.describe('Cooking Analytics', () => {
  test('cooking session is saved on start', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');
    await expect(page.locator('#step-progress')).toHaveText('Step 1 of 5');

    // Wait for IndexedDB write to complete
    await page.waitForTimeout(500);

    const session = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open('biteme_db');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['cooking_sessions'], 'readonly');
          const store = tx.objectStore('cooking_sessions');
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            db.close();
            resolve(getAll.result[0] || null);
          };
        };
      });
    });

    expect(session).not.toBeNull();
    expect(session.recipe_id).toBe('test-curry');
    expect(session.started_at).toBeTruthy();
    expect(session.completed_at).toBeNull();
  });

  test('session ID passed to completion URL', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    const nextBtn = page.locator('#next-btn');

    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    await nextBtn.click();
    await expect(page).toHaveURL(/completion\.html\?id=test-curry&session=\d+/);
  });

  test('cooking completion is recorded', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    const nextBtn = page.locator('#next-btn');

    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    await nextBtn.click();
    await expect(page).toHaveURL(/completion\.html/);

    // Wait for IndexedDB write to complete
    await page.waitForTimeout(500);

    const session = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open('biteme_db');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['cooking_sessions'], 'readonly');
          const store = tx.objectStore('cooking_sessions');
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            db.close();
            resolve(getAll.result[0] || null);
          };
        };
      });
    });

    expect(session).not.toBeNull();
    expect(session.recipe_id).toBe('test-curry');
    expect(session.completed_at).toBeTruthy();
  });
});
