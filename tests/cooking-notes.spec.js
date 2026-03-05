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

async function seedCookingNote(page, recipeId, text) {
  await page.evaluate(async ({ recipeId, text }) => {
    await initDB();
    await saveCookingNote(recipeId, text);
  }, { recipeId, text });
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
  test('saves note with debounce and reloads it', async ({ page }) => {
    await page.goto('/completion.html?id=test-curry');

    await expect(page.locator('#cooking-notes-input')).toBeVisible();
    await expect(page.locator('.notes-label')).toHaveText('Anything to remember for next time?');

    await page.fill('#cooking-notes-input', 'Needed more salt');
    await expect(page.locator('#notes-status')).toHaveText('Saved', { timeout: 5000 }); // waits for 800ms debounce
    const note = await page.evaluate(async () => getCookingNote('test-curry'));
    expect(note.text).toBe('Needed more salt');

    // Reload and confirm note is restored
    await page.goto('/completion.html?id=test-curry');
    await expect(page.locator('#cooking-notes-input')).toHaveValue('Needed more salt');
  });
});

test.describe('Cooking Notes — Recipe Detail Page', () => {
  test('note display: shows when exists, hidden when not, appears before ingredients', async ({ page }) => {
    // No note — section should be empty
    await page.goto('/recipe.html?id=test-curry');
    await expect(page.locator('#cooking-notes-display')).toBeEmpty();

    // Seed a note and reload
    await seedCookingNote(page, 'test-curry', 'Double the garlic next time');
    await page.goto('/recipe.html?id=test-curry');

    await expect(page.locator('.personal-notes h3')).toHaveText('Personal Notes');
    await expect(page.locator('.cooking-note-text')).toHaveText('Double the garlic next time');

    // Personal Notes h3 should come before Ingredients h3 in the DOM
    const headings = await page.locator('.recipe h3').allTextContents();
    const notesIdx = headings.indexOf('Personal Notes');
    const ingredientsIdx = headings.indexOf('Ingredients');
    expect(notesIdx).toBeGreaterThanOrEqual(0);
    expect(notesIdx).toBeLessThan(ingredientsIdx);
  });

  test('edit flow: cancel discards, save persists, clear removes section', async ({ page }) => {
    await page.goto('/recipe.html?id=test-curry');
    await seedCookingNote(page, 'test-curry', 'Original note');
    await page.goto('/recipe.html?id=test-curry');
    await expect(page.locator('.cooking-note-text')).toBeVisible();

    // Edit mode: textarea and buttons appear
    await page.click('.cooking-note-edit-btn');
    await expect(page.locator('.cooking-note-textarea')).toBeVisible();
    await expect(page.locator('.cooking-note-textarea')).toHaveValue('Original note');
    await expect(page.locator('.cooking-note-save-btn')).toBeVisible();
    await expect(page.locator('.cooking-note-cancel-btn')).toBeVisible();

    // Cancel discards changes
    await page.fill('.cooking-note-textarea', 'This should be discarded');
    await page.click('.cooking-note-cancel-btn');
    await expect(page.locator('.cooking-note-text')).toHaveText('Original note');

    // Save persists the updated note
    await page.click('.cooking-note-edit-btn');
    await page.fill('.cooking-note-textarea', 'Updated note');
    await page.click('.cooking-note-save-btn');
    await expect(page.locator('.cooking-note-text')).toHaveText('Updated note');
    const saved = await page.evaluate(async () => getCookingNote('test-curry'));
    expect(saved.text).toBe('Updated note');

    // Clearing the note removes the section
    await page.click('.cooking-note-edit-btn');
    await page.fill('.cooking-note-textarea', '');
    await page.click('.cooking-note-save-btn');
    await expect(page.locator('#cooking-notes-display')).toBeEmpty();
  });
});
