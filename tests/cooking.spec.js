const { test, expect } = require('@playwright/test');
const testRecipes = require('./fixtures/recipes.test.json');

// Derived from fixture — stays correct when steps are added/removed
const CURRY_STEPS = testRecipes.find(r => r.id === 'test-curry').steps.length;

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

async function navigateToLastStep(page) {
  const nextBtn = page.locator('#next-btn');
  for (let i = 0; i < CURRY_STEPS - 1; i++) {
    await nextBtn.click();
    await expect(page.locator('#step-progress')).toHaveText(`Step ${i + 2} of ${CURRY_STEPS}`);
  }
}

// Step 3 has the 20-minute timer used by timer tests
async function navigateToTimerStep(page) {
  const nextBtn = page.locator('#next-btn');
  for (let i = 0; i < 2; i++) {
    await nextBtn.click();
    await expect(page.locator('#step-progress')).toHaveText(`Step ${i + 2} of ${CURRY_STEPS}`);
  }
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

test.describe('Cooking Mode', () => {
  test('step 1 display and per-step ingredient links', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    // Step 1: name, progress, content, ingredients
    await expect(page.locator('#recipe-name')).toHaveText('Test Curry');
    await expect(page.locator('#step-progress')).toHaveText(`Step 1 of ${CURRY_STEPS}`);
    await expect(page.locator('#step-content')).toContainText('Heat');
    await expect(page.locator('#step-ingredients-container')).toBeVisible();
    await expect(page.locator('#step-ingredients-container li')).toContainText('1 tbsp oil');

    // Step 2: different ingredient links
    await page.locator('#next-btn').click();
    await expect(page.locator('#step-progress')).toHaveText(`Step 2 of ${CURRY_STEPS}`);
    const step2Items = page.locator('#step-ingredients-container li');
    await expect(step2Items.first()).toContainText('onion');
    await expect(step2Items.nth(1)).toContainText('garlic');

    // Step 3: no ingredient links — container hidden
    await page.locator('#next-btn').click();
    await expect(page.locator('#step-progress')).toHaveText(`Step 3 of ${CURRY_STEPS}`);
    await expect(page.locator('#step-content')).toContainText('Simmer');
    await expect(page.locator('#step-ingredients-container')).toBeHidden();
  });

  test('navigation: progress and button labels update', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    const prevBtn = page.locator('#prev-btn');
    const nextBtn = page.locator('#next-btn');

    // Step 1: prev shows "Back to recipe"
    await expect(prevBtn).toHaveText('Back to recipe');
    await expect(page.locator('#step-progress')).toHaveText(`Step 1 of ${CURRY_STEPS}`);

    // Step 2: progress updates, prev becomes "Previous"
    await nextBtn.click();
    await expect(page.locator('#step-progress')).toHaveText(`Step 2 of ${CURRY_STEPS}`);
    await expect(prevBtn).toHaveText('Previous');

    // Step 3: progress bar has grown
    await nextBtn.click();
    await expect(page.locator('#step-progress')).toHaveText(`Step 3 of ${CURRY_STEPS}`);
    const width = await page.locator('#progress-bar').evaluate(el => el.style.width);
    expect(parseFloat(width)).toBeGreaterThan(0);
  });

  test('previous on step 1 goes back to recipe; finish on last step goes to completion', async ({ page }) => {
    // Previous on step 1 navigates back to recipe
    await page.goto('/cooking.html?id=test-curry');
    await page.locator('#prev-btn').click();
    await expect(page).toHaveURL(/recipe\.html\?id=test-curry/);

    // Finish on last step navigates to completion
    await page.goto('/cooking.html?id=test-curry');
    await navigateToLastStep(page);
    await expect(page.locator('#next-btn')).toHaveText('Finish');
    await page.locator('#next-btn').click();
    await expect(page).toHaveURL(/completion\.html\?id=test-curry/);
  });
});

test.describe('Cooking Analytics', () => {
  test('session saved on start and marked complete at finish', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');
    await expect(page.locator('#step-progress')).toHaveText(`Step 1 of ${CURRY_STEPS}`);
    // Poll until the session is written to IndexedDB
    await page.waitForFunction(async () => new Promise(resolve => {
      const req = indexedDB.open('biteme_db');
      req.onsuccess = () => {
        const db = req.result;
        try {
          const all = db.transaction(['cooking_sessions'], 'readonly').objectStore('cooking_sessions').getAll();
          all.onsuccess = () => { db.close(); resolve(all.result.length > 0); };
        } catch { db.close(); resolve(false); }
      };
      req.onerror = () => resolve(false);
    }));

    const readFirstSession = () => page.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open('biteme_db');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['cooking_sessions'], 'readonly');
          const getAll = tx.objectStore('cooking_sessions').getAll();
          getAll.onsuccess = () => { db.close(); resolve(getAll.result[0] || null); };
        };
      });
    });

    // Session created with recipe_id and started_at; not yet completed
    const startSession = await readFirstSession();
    expect(startSession).not.toBeNull();
    expect(startSession.recipe_id).toBe('test-curry');
    expect(startSession.started_at).toBeTruthy();
    expect(startSession.completed_at).toBeNull();

    // Navigate to completion — URL includes session ID, session is now complete
    await navigateToLastStep(page);
    await page.locator('#next-btn').click();
    await expect(page).toHaveURL(/completion\.html\?id=test-curry&session=\d+/);
    await expect(page.locator('#cooking-time')).toBeVisible(); // session processed

    const endSession = await readFirstSession();
    expect(endSession.completed_at).toBeTruthy();
  });
});

test.describe('Cooking Time on Completion', () => {
  test('cooking time shown after full journey, hidden when no session', async ({ page }) => {
    // Direct to completion without session ID — time hidden
    await page.goto('/completion.html?id=test-curry');
    await expect(page.locator('#recipe-name')).toBeVisible(); // page ready
    await expect(page.locator('#cooking-time')).toBeHidden();

    // Full journey to completion — time visible
    await page.goto('/cooking.html?id=test-curry');
    await navigateToLastStep(page);
    await page.locator('#next-btn').click();
    await expect(page).toHaveURL(/completion\.html/);
    await expect(page.locator('#cooking-time')).toBeVisible();
    await expect(page.locator('#cooking-time')).toContainText('Cooked in');
  });
});

test.describe('Recipe Notes and Serving Suggestions', () => {
  test('test-curry: notes on step 1, serving on last step', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    // Step 1: notes visible, serving hidden
    const stepContent = page.locator('#step-content');
    await expect(stepContent.locator('.step-notes')).toBeVisible();
    await expect(stepContent.locator('.step-notes h4')).toHaveText("Chef's Notes");
    await expect(stepContent.locator('.step-notes p')).toContainText('Make sure to use fresh spices');
    await expect(stepContent.locator('.step-serving')).toBeHidden();

    // Last step: serving visible, notes hidden
    await navigateToLastStep(page);
    await expect(page.locator('#step-progress')).toHaveText(`Step ${CURRY_STEPS} of ${CURRY_STEPS}`);
    await expect(stepContent.locator('.step-serving')).toBeVisible();
    await expect(stepContent.locator('.step-serving h4')).toHaveText('Serving Suggestions');
    await expect(stepContent.locator('.step-serving p')).toContainText('Serve over rice with naan bread');
    await expect(stepContent.locator('.step-notes')).toBeHidden();
  });

  test('test-salad: no notes or serving suggestions on any step', async ({ page }) => {
    await page.goto('/cooking.html?id=test-salad');

    // Step 1 — no notes
    await expect(page.locator('.step-notes')).toBeHidden();

    // Last step — no serving suggestions
    await page.locator('#next-btn').click();
    await expect(page.locator('#step-progress')).toContainText('Step 2');
    await page.locator('#next-btn').click();
    await expect(page.locator('#step-progress')).toContainText('Step 3');
    await expect(page.locator('.step-serving')).toBeHidden();
  });
});

test.describe('Cooking Timer', () => {
  test('step with duration shows timer; step without hides it', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    // Step 1: no duration — timer hidden, toggle inactive
    await expect(page.locator('#timer-bar')).toBeHidden();
    await expect(page.locator('#timer-toggle-btn')).not.toHaveClass(/active/);

    // Step 5: has duration — timer visible (20:00), toggle active
    await navigateToTimerStep(page);
    await expect(page.locator('#step-progress')).toHaveText(`Step 3 of ${CURRY_STEPS}`);
    await expect(page.locator('#timer-bar')).toBeVisible();
    await expect(page.locator('.timer-display')).toHaveText('20:00');
    await expect(page.locator('#timer-toggle-btn')).toHaveClass(/active/);
  });

  test('test-salad: timer hidden on all steps, toggle shows default 1:00', async ({ page }) => {
    await page.goto('/cooking.html?id=test-salad');

    await expect(page.locator('#timer-bar')).toBeHidden();
    await page.locator('#next-btn').click();
    await expect(page.locator('#step-progress')).toContainText('Step 2');
    await expect(page.locator('#timer-bar')).toBeHidden();

    // Toggle shows default 1:00 (no step duration), toggle again hides it
    await page.locator('#timer-toggle-btn').click();
    await expect(page.locator('#timer-bar')).toBeVisible();
    await expect(page.locator('.timer-display')).toHaveText('1:00');
    await page.locator('#timer-toggle-btn').click();
    await expect(page.locator('#timer-bar')).toBeHidden();
  });

  test('timer controls: arrows, time badge, toggle restores step duration', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');
    await navigateToTimerStep(page);
    await expect(page.locator('.timer-display')).toHaveText('20:00');

    // Arrow adjustments
    await page.locator('.timer-arrow[aria-label="Add 1 minute"]').click();
    await expect(page.locator('.timer-display')).toHaveText('21:00');
    await page.locator('.timer-arrow[aria-label="Subtract 1 minute"]').click();
    await expect(page.locator('.timer-display')).toHaveText('20:00');
    await page.locator('.timer-arrow[aria-label="Add 5 seconds"]').click();
    await expect(page.locator('.timer-display')).toHaveText('20:05');

    // Time badge click resets to step's suggested time
    await page.locator('.time-badge').click();
    await expect(page.locator('.timer-display')).toHaveText('20:00');

    // Toggle off then on — restores step duration (20:00), not default 1:00
    await page.locator('#timer-toggle-btn').click();
    await expect(page.locator('#timer-bar')).toBeHidden();
    await page.locator('#timer-toggle-btn').click();
    await expect(page.locator('.timer-display')).toHaveText('20:00');
  });

  test('timer running: countdown, persists across navigation, pause freezes, stop resets', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');
    await navigateToTimerStep(page);

    // Start
    await page.locator('.timer-media-btn-play').click();
    await expect(page.locator('[aria-label="Pause"]')).toBeVisible();
    await expect(page.locator('[aria-label="Stop"]')).toBeVisible();

    // Countdown is ticking
    await page.waitForTimeout(2100);
    const runningTime = await page.locator('.timer-display').textContent();
    expect(runningTime).toMatch(/19:5[0-9]/);

    // Navigate to step 2 — timer persists
    await page.locator('#prev-btn').click();
    await expect(page.locator('#step-progress')).toHaveText(`Step 2 of ${CURRY_STEPS}`);
    await expect(page.locator('#timer-bar')).toBeVisible();
    await expect(page.locator('[aria-label="Pause"]')).toBeVisible();

    // Navigate back to step 3 before pausing/stopping
    await page.locator('#next-btn').click();
    await expect(page.locator('#step-progress')).toHaveText(`Step 3 of ${CURRY_STEPS}`);

    // Pause — time freezes
    await page.locator('[aria-label="Pause"]').click();
    await expect(page.locator('[aria-label="Resume"]')).toBeVisible();
    const pausedTime = await page.locator('.timer-display').textContent();
    await page.waitForTimeout(1500);
    await expect(page.locator('.timer-display')).toHaveText(pausedTime);

    // Stop — resets to suggested time
    await page.locator('[aria-label="Stop"]').click();
    await expect(page.locator('.timer-display')).toHaveText('20:00');
    await expect(page.locator('[aria-label="Start"]')).toBeVisible();
  });

  test('step 4: word duration "one and a half minutes" prefills 1:30', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');
    const nextBtn = page.locator('#next-btn');
    for (let i = 0; i < 3; i++) {
      await nextBtn.click();
      await expect(page.locator('#step-progress')).toHaveText(`Step ${i + 2} of ${CURRY_STEPS}`);
    }

    await expect(page.locator('#timer-bar')).toBeVisible();
    await expect(page.locator('.timer-display')).toHaveText('1:30');
    await expect(page.locator('.time-badge')).toHaveText('one and a half minutes');

    // Adjust then click badge — prefills back to 1:30
    await page.locator('.timer-arrow[aria-label="Add 1 minute"]').click();
    await expect(page.locator('.timer-display')).toHaveText('2:30');
    await page.locator('.time-badge').click();
    await expect(page.locator('.timer-display')).toHaveText('1:30');
  });
});
