const { test, expect } = require('@playwright/test');

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
  await page.goto('/how-it-works.html');
  await clearAppState(page);
  await page.goto('/how-it-works.html');
});

test.describe('How It Works Page', () => {
  test('page loads with correct title and marks as seen', async ({ page }) => {
    await expect(page).toHaveTitle('How It Works - biteme');
    const hasSeen = await page.evaluate(async () => getSetting('hasSeenHowItWorks'));
    expect(hasSeen).toBe(true);
  });

  test('each section has title, description, visible mockup, and non-interactive mockup', async ({ page }) => {
    const sections = page.locator('.feature-section');
    const count = await sections.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const section = sections.nth(i);
      await expect(section.locator('.feature-title')).toBeVisible();
      await expect(section.locator('.feature-description')).toBeVisible();
      const mockup = section.locator('.feature-mockup').first();
      await expect(mockup).toBeVisible();
      const pointerEvents = await mockup.evaluate(el => getComputedStyle(el).pointerEvents);
      expect(pointerEvents).toBe('none');
    }
  });

  test('back button navigates to home', async ({ page }) => {
    await page.goto('/');
    await page.goto('/how-it-works.html');
    await page.locator('.back-button').click();
    await expect(page).toHaveURL(/index\.html|\//);
  });
});
