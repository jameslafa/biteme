const { test, expect } = require('@playwright/test');
const testRecipes = require('./fixtures/recipes.test.json');

// Fixture recipes:
//   test-curry  [vegan]               garlic, lentil, onion, vegetable broth, vegetable oil
//   test-salad  [vegan, gluten-free]  garlic, lentil, lettuce, oat milk, olive oil, soy sauce, tomato
//   test-toast  [vegetarian]          bread, butter

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

const titles = page => page.locator('.recipe-title');
const friendOption = (page, name) => page.locator('.friend-option', { hasText: name }).locator('input');

async function seedFriends(page, friends) {
  await page.evaluate(async (list) => {
    for (const f of list) await saveFriend(f);
  }, friends);
  await page.goto('/');
  await expect(page.locator('.recipe-card')).toHaveCount(3);
}

test.describe('Friends page', () => {
  test('add, edit and delete a friend', async ({ page }) => {
    await page.goto('/friends.html');
    await expect(page.locator('.friend-row')).toHaveCount(0);

    // Name is required
    await page.locator('#add-friend-btn').click();
    await page.locator('#friend-form button[type="submit"]').click();
    await expect(page.locator('#friend-form-error')).toBeVisible();

    // Name is escaped, not rendered as HTML
    await page.fill('#friend-name', 'Luna <b>');
    await page.locator('#friend-diets .chip[data-value="vegan"]').click();
    await page.locator('#friend-diets .chip[data-value="gluten-free"]').click();

    // Only known ingredients can be avoided
    await page.fill('#friend-avoid-input', 'unobtainium');
    await page.press('#friend-avoid-input', 'Enter');
    await expect(page.locator('#friend-avoid-hint')).toBeVisible();
    await page.fill('#friend-avoid-input', 'Mushroom');
    await page.press('#friend-avoid-input', 'Enter');
    await page.fill('#friend-avoid-input', 'tomato');
    await page.press('#friend-avoid-input', 'Enter');
    await expect(page.locator('.friend-avoid-chip')).toHaveText(['mushroom', 'tomato']);
    await page.locator('.friend-avoid-chip', { hasText: 'mushroom' }).locator('button').click();
    await expect(page.locator('.friend-avoid-chip')).toHaveText(['tomato']);

    await page.locator('#friend-form button[type="submit"]').click();
    const row = page.locator('.friend-row');
    await expect(row).toHaveCount(1);
    await expect(row.locator('.friend-row-name')).toHaveText('Luna <b>');
    await expect(row.locator('.diet-badge')).toHaveText(['V', 'GF']);
    await expect(row.locator('.friend-row-avoid')).toHaveText('Avoids tomato');

    // Edit persists across reloads
    await row.click();
    await expect(page.locator('#friend-name')).toHaveValue('Luna <b>');
    await page.fill('#friend-name', 'Luna');
    await page.locator('#friend-form button[type="submit"]').click();
    await expect(page.locator('.friend-row-name')).toHaveText(['Luna']);
    await page.reload();
    await expect(page.locator('.friend-row-name')).toHaveText(['Luna']);

    // Delete (soft): gone from the list, kept as a tombstone for future sync
    await page.locator('.friend-row').click();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#friend-delete').click();
    await expect(page.locator('.friend-row')).toHaveCount(0);
    const stored = await page.evaluate(async () => {
      const tx = db.transaction(['friends'], 'readonly');
      return new Promise(r => { const q = tx.objectStore('friends').getAll(); q.onsuccess = () => r(q.result); });
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].deleted_at).not.toBeNull();
  });
});

test.describe('Cooking for', () => {
  test('picking friends combines their diets and avoided ingredients', async ({ page }) => {
    await seedFriends(page, [
      { name: 'Luna', diets: ['vegan', 'gluten-free'], avoid: [] },
      { name: 'Milena', diets: ['vegan'], avoid: ['tomato'] },
      { name: 'Céline', diets: ['vegan'], avoid: ['onion'] },
    ]);

    await page.locator('#cooking-for-btn').click();
    await expect(page.locator('.friend-option-name')).toHaveText(['Céline', 'Luna', 'Milena']);

    // Milena: vegan, no tomato → curry only
    await friendOption(page, 'Milena').check();
    await expect(titles(page)).toHaveText(['Test Curry']);

    // + Luna: vegan & gluten-free, no tomato → nothing fits (salad has tomato)
    await friendOption(page, 'Luna').check();
    await expect(page.locator('.recipe-card')).toHaveCount(0);

    // Luna + Céline: vegan & gluten-free, no onion → salad
    await friendOption(page, 'Milena').uncheck();
    await friendOption(page, 'Céline').check();
    await expect(titles(page)).toHaveText(['Test Salad']);

    await page.locator('#cooking-for-done').click();
    const bar = page.locator('#cooking-for-bar');
    await expect(bar.locator('.cooking-for-label')).toHaveText('Cooking for Céline & Luna');
    await expect(bar.locator('.diet-badge')).toHaveText(['V', 'GF']);
    await expect(bar.locator('.cooking-for-avoid')).toHaveText('· no onion');
    await expect(page.locator('#cooking-for-btn')).toHaveClass(/active/);

    // Clearing resets everything
    await page.locator('.cooking-for-clear').click();
    await expect(bar).toBeHidden();
    await expect(page.locator('.recipe-card')).toHaveCount(3);
    await expect(page).not.toHaveURL(/for=/);
  });

  test('friend\'s diets and avoided ingredients carry to the recipe page; reset on reopening', async ({ page }) => {
    await seedFriends(page, [
      { name: 'Luna', diets: ['vegan', 'gluten-free'], avoid: [] },
      { name: 'Milena', diets: ['vegan'], avoid: ['tomato'] },
    ]);

    // Gluten-free friend → recipe opens with the gluten-free version on
    await page.locator('#cooking-for-btn').click();
    await friendOption(page, 'Luna').check();
    await page.locator('#cooking-for-done').click();
    await page.locator('.recipe-card', { hasText: 'Test Salad' }).click();
    await expect(page).toHaveURL(/id=test-salad&diet=vegan,gluten-free/);
    await expect(page.locator('#gf-toggle')).toBeChecked();

    // Back home: selection kept
    await page.goBack();
    await expect(page.locator('#cooking-for-bar .cooking-for-label')).toHaveText('Cooking for Luna');

    // Avoided ingredient → similar recipes exclude it (salad has tomato)
    await page.goto('/recipe.html?id=test-curry');
    await expect(page.locator('.similar-recipe-item', { hasText: 'Test Salad' })).toBeVisible();
    await page.goto('/');
    await page.locator('#cooking-for-btn').click();
    await friendOption(page, 'Milena').check();
    await page.locator('#cooking-for-done').click();
    await page.locator('.recipe-card', { hasText: 'Test Curry' }).click();
    await expect(page).toHaveURL(/id=test-curry&diet=vegan&avoid=tomato/);
    await expect(page.locator('.recipe-name')).toHaveText('Test Curry');
    await page.waitForTimeout(500);
    await expect(page.locator('.similar-recipe-item', { hasText: 'Test Salad' })).toHaveCount(0);

    // Reopening the app starts with nobody selected
    await page.goto('/');
    await expect(page.locator('#cooking-for-bar')).toBeHidden();
  });

  test('sheet with no friends invites adding them', async ({ page }) => {
    await page.locator('#cooking-for-btn').click();
    await expect(page.locator('#no-friends')).toBeVisible();
    await page.locator('.sheet-link', { hasText: 'Edit friends' }).click();
    await expect(page).toHaveURL(/friends\.html/);
  });
});
