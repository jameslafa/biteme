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
  test('has correct page title', async ({ page }) => {
    await expect(page).toHaveTitle('How It Works - biteme');
  });

  test('renders all 10 feature sections', async ({ page }) => {
    const sections = page.locator('.feature-section');
    await expect(sections).toHaveCount(10);
  });

  test('sections have correct anchor IDs', async ({ page }) => {
    const expectedIds = ['find', 'surprise', 'diet', 'prepare', 'cook', 'timer', 'after-cooking', 'share', 'offline', 'cooking-log'];
    for (const id of expectedIds) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
  });

  test('each section has title, description, and mockup', async ({ page }) => {
    const sections = page.locator('.feature-section');
    const count = await sections.count();
    for (let i = 0; i < count; i++) {
      const section = sections.nth(i);
      await expect(section.locator('.feature-title')).toBeVisible();
      await expect(section.locator('.feature-description')).toBeVisible();
      await expect(section.locator('.feature-mockup').first()).toBeVisible();
    }
  });

  test('sets hasSeenHowItWorks on page load', async ({ page }) => {
    const hasSeen = await page.evaluate(async () => {
      return await getSetting('hasSeenHowItWorks');
    });
    expect(hasSeen).toBe(true);
  });

  test('hash navigation scrolls to section', async ({ page }) => {
    await page.goto('/how-it-works.html#timer');
    await page.waitForTimeout(500);

    const timerSection = page.locator('#timer');
    await expect(timerSection).toBeInViewport();
  });

  test('back button navigates to home', async ({ page }) => {
    await page.locator('.back-button').click();
    await expect(page).toHaveURL(/index\.html|\/$/);
  });

  test('mockups are non-interactive', async ({ page }) => {
    const mockup = page.locator('.feature-mockup').first();
    const pointerEvents = await mockup.evaluate(el => getComputedStyle(el).pointerEvents);
    expect(pointerEvents).toBe('none');
  });
});
