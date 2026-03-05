const { test, expect } = require('@playwright/test');

// Fixture changelog — 3 entries, independent of the real changelog.js
const MOCK_CHANGELOG = [
  { id: 3, date: '2026-03-05', text: 'Feature C — newest entry' },
  { id: 2, date: '2026-02-01', text: 'Feature B — middle entry' },
  { id: 1, date: '2026-01-01', text: 'Feature A — oldest entry' },
];

const MOCK_CHANGELOG_JS = `const CHANGELOG = ${JSON.stringify(MOCK_CHANGELOG)};`;

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
  await page.route('**/changelog.js', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: MOCK_CHANGELOG_JS,
    });
  });
  await page.goto('/whats-new.html');
  await clearAppState(page);
  await page.goto('/whats-new.html');
});

test.describe('What\'s New Page', () => {
  test('displays all entries in correct order', async ({ page }) => {
    const entries = page.locator('.timeline-entry');
    await expect(entries).toHaveCount(MOCK_CHANGELOG.length);

    // Newest first, oldest last
    await expect(entries.first().locator('.timeline-entry-text')).toContainText('Feature C');
    await expect(entries.last().locator('.timeline-entry-text')).toContainText('Feature A');

    // Each entry has a day circle and text
    await expect(entries.first().locator('.timeline-day')).toBeVisible();
    await expect(entries.first().locator('.timeline-entry-text')).toBeVisible();
  });

  test('marks all entries as seen on page load', async ({ page }) => {
    const lastSeenId = await page.evaluate(async () => {
      return await getSetting('lastSeenChangelogId');
    });
    const maxId = Math.max(...MOCK_CHANGELOG.map(e => e.id));
    expect(lastSeenId).toBe(maxId);
  });

  test('back button navigates to home', async ({ page }) => {
    await page.goto('/');
    await page.goto('/whats-new.html');
    await page.locator('.back-button').click();
    await expect(page).toHaveURL(/index\.html|\//);
  });
});
