# Testing Guidelines

Playwright e2e tests for BiteMe. These guidelines were derived from a systematic optimisation pass over the full test suite.

## Running tests

```bash
npm run test:all       # parser (Rust) + e2e (Playwright)
npm test               # e2e only
npm run test-parser    # Rust parser only
npm run lint-recipes   # recipe markdown linting
```

Find slow tests:
```bash
npx playwright test --reporter=json | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  d.suites.flatMap(s=>s.specs).flatMap(s=>s.tests).flatMap(t=>t.results)
    .map(r=>({title:r.workerIndex+' '+r.duration,ms:r.duration}))
    .sort((a,b)=>b.ms-a.ms).slice(0,20).forEach(r=>console.log(r.ms,r.title));
"
```

---

## Core patterns

### beforeEach: always double-goto

After `clearAppState` calls `db.close()`, the global `db` object stays truthy but dead. `initDB()` guards with `if (db) return`, so any seeding done before the next `page.goto()` fails silently. Always end `beforeEach` with a second `page.goto()`:

```js
test.beforeEach(async ({ page }) => {
  // ... route mocks ...
  await page.goto('/');
  await clearAppState(page);
  await page.goto('/');  // reinitialises DB — seeding is safe after this
});
```

### Seed the DB directly — don't navigate the UI

Navigation through cooking steps is expensive (~150ms per click). For tests that only need a precondition (e.g. "a completed session exists"), write directly to IndexedDB:

```js
await page.evaluate(async () => {
  await initDB();
  const tx = db.transaction(['cooking_sessions'], 'readwrite');
  const now = Date.now();
  tx.objectStore('cooking_sessions').add({
    recipe_id: 'test-curry',
    started_at: now - 1800000,
    completed_at: now,
  });
  await new Promise(resolve => { tx.oncomplete = resolve; });
});
await page.goto('/');
```

### waitForFunction for async DB writes with no DOM signal

When a setting is written to IndexedDB asynchronously and there's no DOM element to observe, poll with `waitForFunction`:

```js
await page.goto('/whats-new.html');
// Wait for the async write to complete before navigating away
await page.waitForFunction(async () => await getSetting('lastSeenChangelogId') !== 3);
await page.goto('/');
```

---

## Do and don't

### Never use waitForTimeout for positive assertions

Replace fixed-time waits with DOM-state assertions:

```js
// Bad
await page.waitForTimeout(1500);
await expect(banner).toBeHidden();

// Good
await expect(banner).toBeHidden({ timeout: 3000 });
```

### waitForTimeout is legitimate for negative assertions

When asserting something does NOT appear, there is no DOM signal to wait on. A fixed wait is unavoidable:

```js
// Legitimate — no DOM event fires for absence
await page.waitForTimeout(2500);
await expect(page.locator('#install-banner')).toBeHidden();
```

Keep these waits calibrated to the feature's actual timing:
- Install banner / 30-day cooldown check: `2500ms`
- Post-reload state checks: `1000ms`
- Simple negative check: `500ms`

### Animation timing: use timeout, not waitForTimeout

UI elements that animate out (e.g. rating banner fades after ~1.5s) should use `toBeHidden({ timeout })`, not a fixed wait:

```js
// Bad
await page.waitForTimeout(1500);
await expect(banner).not.toBeVisible();

// Good
await expect(banner).toBeHidden({ timeout: 3000 });
```

---

## Test structure

### Merge tests that share identical setup

If two tests have the same preconditions, combine them into one sequential flow. Separate tests only when setup genuinely differs.

```js
// Bad — two tests, same setup, same beforeEach cost paid twice
test('chip rows render', async ({ page }) => { ... });
test('chip click filters', async ({ page }) => { ... });

// Good — one flow
test('chip rows with correct labels; click to filter and deselect', async ({ page }) => {
  // assertions about row structure
  // ...then...
  await page.locator('.chip[data-value="dinner"]').click();
  await expect(page.locator('.recipe-card')).toHaveCount(1);
  await page.locator('.chip[data-value="dinner"]').click();
  await expect(page.locator('.recipe-card')).toHaveCount(3);
});
```

### beforeEach cost is multiplied

Any slow operation in `beforeEach` is paid by every test in the suite. If only 1–2 tests need a specific precondition, move that setup into the test itself.

### Keep test fixtures minimal

Test recipes should have the minimum number of steps, ingredients, and categories needed to cover all test cases. Every extra step adds overhead to any test that navigates through cooking. When reducing fixture complexity, audit all step references in tests (hardcoded step numbers, loop counts, `navigateTo*` helpers).

---

## Always use fixtures, never real data

Every test must mock `**/recipes.json` with `testRecipes` from `tests/fixtures/recipes.test.json`. Never let tests hit the real `docs/recipes.json` — real recipes are added, renamed, and removed over time, which would cause tests to break for reasons unrelated to the code under test.

The route mock is set up in every `beforeEach`:

```js
await page.route('**/recipes.json', route => {
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(testRecipes),
  });
});
```

The same applies to `**/changelog.js` in tests that involve the What's New dot — mock it with a fixed `MOCK_CHANGELOG` so the max ID is known and stable.

If a new feature introduces a new data source (e.g. a new JSON file), add a route mock for it in the relevant `beforeEach` from the start.

## Fixture file

`tests/fixtures/recipes.test.json` — the mock recipe corpus used by all e2e tests. Structure must match `docs/recipes.json`.

Current test-curry step count: **4** (reduced from 6 during optimisation — don't add steps without good reason).

Key fixture recipes and what they test:
- `test-curry` — main recipe: multi-step cooking, timer on step 3, word duration on step 4, ingredient refs, notes
- `test-salad` — no notes or serving suggestions; shares garlic+lentil canonicals with curry (for recommendations/merge tests)
- `test-toast` — breakfast/american; no shared ingredients (tests "no matches" edge case)
- `test-soup` — `tested: false`; excluded from recommendations and plan generation
- `test-fresh-sharer` / `test-pantry-sharer` — used only for IDF category weight scoring test
