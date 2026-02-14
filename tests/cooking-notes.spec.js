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

// Helper: seed a cooking note directly into IndexedDB
async function seedCookingNote(page, recipeId, text) {
  await page.evaluate(async ({ recipeId, text }) => {
    await initDB();
    await saveCookingNote(recipeId, text);
  }, { recipeId, text });
}

// Helper: navigate through cooking mode to reach the completion page
async function cookToCompletion(page, recipeId, stepCount) {
  await page.goto(`/cooking.html?id=${recipeId}`);
  await page.waitForSelector('#step-content');

  const nextBtn = page.locator('#next-btn');
  for (let i = 0; i < stepCount - 1; i++) {
    await nextBtn.click();
    await page.waitForTimeout(200);
  }
  await nextBtn.click(); // Finish
  await page.waitForSelector('.completion-title');
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

test.describe('Cooking Notes — Completion Page', () => {
  test('shows textarea on completion page', async ({ page }) => {
    await cookToCompletion(page, 'test-curry', 5);

    await expect(page.locator('#cooking-notes-input')).toBeVisible();
    await expect(page.locator('.notes-label')).toHaveText('Anything to remember for next time?');
  });

  test('auto-saves note with debounce', async ({ page }) => {
    await cookToCompletion(page, 'test-curry', 5);

    await page.fill('#cooking-notes-input', 'Needed more salt');
    await page.waitForTimeout(1000); // 800ms debounce + margin

    await expect(page.locator('#notes-status')).toHaveText('Saved');

    // Verify persisted in IndexedDB
    const note = await page.evaluate(async () => {
      return await getCookingNote('test-curry');
    });
    expect(note.text).toBe('Needed more salt');
  });

  test('loads existing note into textarea', async ({ page }) => {
    // Seed a note first
    await page.goto('/completion.html?id=test-curry');
    await seedCookingNote(page, 'test-curry', 'Use less chili');

    // Reload completion page
    await page.goto('/completion.html?id=test-curry');
    await expect(page.locator('#cooking-notes-input')).toHaveValue('Use less chili');
  });
});

test.describe('Cooking Notes — Recipe Detail Page', () => {
  test('shows personal notes section when note exists', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');
    await seedCookingNote(page, 'test-curry', 'Double the garlic next time');

    await page.goto('/recipe.html?id=test-curry');

    await expect(page.locator('.personal-notes h3')).toHaveText('Personal Notes');
    await expect(page.locator('.cooking-note-text')).toHaveText('Double the garlic next time');
  });

  test('hides personal notes section when no note exists', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');

    await expect(page.locator('#cooking-notes-display')).toBeEmpty();
  });

  test('personal notes section appears before ingredients', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');
    await seedCookingNote(page, 'test-curry', 'Some note');
    await page.goto('/recipe.html?id=test-curry');

    // Personal Notes h3 should come before Ingredients h3 in the DOM
    const headings = await page.locator('.recipe h3').allTextContents();
    const notesIdx = headings.indexOf('Personal Notes');
    const ingredientsIdx = headings.indexOf('Ingredients');
    expect(notesIdx).toBeGreaterThanOrEqual(0);
    expect(notesIdx).toBeLessThan(ingredientsIdx);
  });

  test('edit button switches to textarea', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');
    await seedCookingNote(page, 'test-curry', 'Original note');
    await page.goto('/recipe.html?id=test-curry');

    await page.click('.cooking-note-edit-btn');

    await expect(page.locator('.cooking-note-textarea')).toBeVisible();
    await expect(page.locator('.cooking-note-textarea')).toHaveValue('Original note');
    await expect(page.locator('.cooking-note-save-btn')).toBeVisible();
    await expect(page.locator('.cooking-note-cancel-btn')).toBeVisible();
  });

  test('save updates the note', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');
    await seedCookingNote(page, 'test-curry', 'Original note');
    await page.goto('/recipe.html?id=test-curry');

    await page.click('.cooking-note-edit-btn');
    await page.fill('.cooking-note-textarea', 'Updated note');
    await page.click('.cooking-note-save-btn');

    // Should return to display mode with updated text
    await expect(page.locator('.cooking-note-text')).toHaveText('Updated note');

    // Verify persisted
    const note = await page.evaluate(async () => {
      return await getCookingNote('test-curry');
    });
    expect(note.text).toBe('Updated note');
  });

  test('cancel discards changes', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');
    await seedCookingNote(page, 'test-curry', 'Original note');
    await page.goto('/recipe.html?id=test-curry');

    await page.click('.cooking-note-edit-btn');
    await page.fill('.cooking-note-textarea', 'This should be discarded');
    await page.click('.cooking-note-cancel-btn');

    await expect(page.locator('.cooking-note-text')).toHaveText('Original note');
  });

  test('clearing note text removes the section', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');
    await seedCookingNote(page, 'test-curry', 'Will be deleted');
    await page.goto('/recipe.html?id=test-curry');

    await page.click('.cooking-note-edit-btn');
    await page.fill('.cooking-note-textarea', '');
    await page.click('.cooking-note-save-btn');

    await expect(page.locator('#cooking-notes-display')).toBeEmpty();
  });
});
