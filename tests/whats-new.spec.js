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
  await page.goto('/whats-new.html');
  await clearAppState(page);
  await page.goto('/whats-new.html');
});

test.describe('What\'s New Page', () => {
  test('displays all changelog entries', async ({ page }) => {
    const entries = page.locator('.timeline-entry');
    await expect(entries).toHaveCount(17);
  });

  test('entries are grouped by month with labels', async ({ page }) => {
    const months = page.locator('.timeline-month');
    await expect(months.first().locator('.timeline-month-label')).toBeVisible();
  });

  test('entries show day circle and text', async ({ page }) => {
    const firstEntry = page.locator('.timeline-entry').first();
    await expect(firstEntry.locator('.timeline-day')).toBeVisible();
    await expect(firstEntry.locator('.timeline-entry-text')).toBeVisible();
    await expect(firstEntry.locator('.timeline-entry-text')).toContainText('Surprise me');
  });

  test('newest entry is first', async ({ page }) => {
    const firstText = await page.locator('.timeline-entry-text').first().textContent();
    const lastText = await page.locator('.timeline-entry-text').last().textContent();

    // First entry should be the newest changelog item
    expect(firstText).toContain('Surprise me');
    // Last entry should be the oldest
    expect(lastText).toContain('Install BiteMe');
  });

  test('marks entries as seen on page load', async ({ page }) => {
    const lastSeenId = await page.evaluate(async () => {
      return await getSetting('lastSeenChangelogId');
    });

    expect(lastSeenId).toBe(17);
  });

  test('back button navigates to home', async ({ page }) => {
    await page.locator('.back-button').click();
    await expect(page).toHaveURL(/index\.html|\/$/);
  });
});
