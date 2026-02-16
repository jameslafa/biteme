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

test.describe('Cooking Time on Completion', () => {
  test('shows cooking time after finishing', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    const nextBtn = page.locator('#next-btn');

    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    await nextBtn.click();
    await expect(page).toHaveURL(/completion\.html/);

    // Wait for session to be saved and time to render
    await page.waitForTimeout(500);

    const cookingTime = page.locator('#cooking-time');
    await expect(cookingTime).toBeVisible();
    await expect(cookingTime).toContainText('Cooked in');
  });

  test('hides cooking time when no session', async ({ page }) => {
    // Navigate directly to completion without a session ID
    await page.goto('/completion.html?id=test-curry');

    await page.waitForTimeout(500);

    const cookingTime = page.locator('#cooking-time');
    await expect(cookingTime).toBeHidden();
  });
});

test.describe('Recipe Notes and Serving Suggestions', () => {
  test('displays notes on first step after instruction', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    // Should be on step 1
    await expect(page.locator('#step-progress')).toHaveText('Step 1 of 5');

    // Check that notes appear after the main step instruction
    const stepContent = page.locator('#step-content');
    await expect(stepContent).toContainText('Heat');

    const notes = stepContent.locator('.step-notes');
    await expect(notes).toBeVisible();
    await expect(notes.locator('h4')).toHaveText("Chef's Notes");
    await expect(notes.locator('p')).toContainText('Make sure to use fresh spices');
  });

  test('hides notes on steps other than first', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    // Move to step 2
    await page.locator('#next-btn').click();
    await page.waitForTimeout(300);

    await expect(page.locator('#step-progress')).toHaveText('Step 2 of 5');

    // Notes should not be visible
    const notes = page.locator('.step-notes');
    await expect(notes).toBeHidden();
  });

  test('displays serving suggestions on last step after instruction', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    const nextBtn = page.locator('#next-btn');

    // Navigate to last step (step 5)
    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    await expect(page.locator('#step-progress')).toHaveText('Step 5 of 5');

    // Check that serving suggestions appear after the main step instruction
    const stepContent = page.locator('#step-content');
    await expect(stepContent).toContainText('Simmer');

    const serving = stepContent.locator('.step-serving');
    await expect(serving).toBeVisible();
    await expect(serving.locator('h4')).toHaveText('Serving Suggestions');
    await expect(serving.locator('p')).toContainText('Serve over rice with naan bread');
  });

  test('hides serving suggestions on steps other than last', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    // On step 1
    await expect(page.locator('#step-progress')).toHaveText('Step 1 of 5');

    // Serving suggestions should not be visible
    const serving = page.locator('.step-serving');
    await expect(serving).toBeHidden();
  });

  test('recipe without notes and serving suggestions works normally', async ({ page }) => {
    await page.goto('/cooking.html?id=test-salad');

    // Step 1 - no notes
    await expect(page.locator('.step-notes')).toBeHidden();

    // Go to last step
    await page.locator('#next-btn').click();
    await page.waitForTimeout(300);
    await page.locator('#next-btn').click();
    await page.waitForTimeout(300);

    // Last step - no serving suggestions
    await expect(page.locator('.step-serving')).toBeHidden();
  });
});

test.describe('Cooking Timer', () => {
  test('timer bar appears on step with duration', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    // Step 1 has no duration — timer bar should be hidden
    await expect(page.locator('#timer-bar')).toBeHidden();

    // Navigate to step 5 ("Simmer for 20 minutes" — has duration)
    const nextBtn = page.locator('#next-btn');
    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    await expect(page.locator('#step-progress')).toHaveText('Step 5 of 5');
    await expect(page.locator('#timer-bar')).toBeVisible();
    await expect(page.locator('.timer-display')).toHaveText('20:00');
  });

  test('timer bar hidden on step without duration', async ({ page }) => {
    await page.goto('/cooking.html?id=test-salad');

    // All salad steps have no duration
    await expect(page.locator('#timer-bar')).toBeHidden();

    await page.locator('#next-btn').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#timer-bar')).toBeHidden();
  });

  test('toggle button shows and hides timer bar', async ({ page }) => {
    await page.goto('/cooking.html?id=test-salad');

    // No duration — timer bar hidden
    await expect(page.locator('#timer-bar')).toBeHidden();

    // Click toggle to show timer with default 1:00
    await page.locator('#timer-toggle-btn').click();
    await expect(page.locator('#timer-bar')).toBeVisible();
    await expect(page.locator('.timer-display')).toHaveText('1:00');

    // Click toggle again to hide
    await page.locator('#timer-toggle-btn').click();
    await expect(page.locator('#timer-bar')).toBeHidden();
  });

  test('toggle button has active state when timer bar is visible', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    const toggleBtn = page.locator('#timer-toggle-btn');

    // Step 1 — no duration, toggle inactive
    await expect(toggleBtn).not.toHaveClass(/active/);

    // Navigate to step 5 — has duration, toggle active
    const nextBtn = page.locator('#next-btn');
    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }
    await expect(toggleBtn).toHaveClass(/active/);
  });

  test('adjust timer with arrow buttons', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    // Go to step 5 (20:00)
    const nextBtn = page.locator('#next-btn');
    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    await expect(page.locator('.timer-display')).toHaveText('20:00');

    // Add 1 minute
    await page.locator('.timer-arrow[aria-label="Add 1 minute"]').click();
    await expect(page.locator('.timer-display')).toHaveText('21:00');

    // Subtract 1 minute
    await page.locator('.timer-arrow[aria-label="Subtract 1 minute"]').click();
    await expect(page.locator('.timer-display')).toHaveText('20:00');

    // Add 5 seconds
    await page.locator('.timer-arrow[aria-label="Add 5 seconds"]').click();
    await expect(page.locator('.timer-display')).toHaveText('20:05');
  });

  test('start timer and verify countdown', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    // Go to step 5 (20:00)
    const nextBtn = page.locator('#next-btn');
    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    // Start the timer
    await page.locator('.timer-media-btn-play').click();

    // Should show pause and stop buttons
    await expect(page.locator('[aria-label="Pause"]')).toBeVisible();
    await expect(page.locator('[aria-label="Stop"]')).toBeVisible();

    // Wait 2 seconds and check countdown
    await page.waitForTimeout(2100);
    const timeText = await page.locator('.timer-display').textContent();
    expect(timeText).toMatch(/19:5[0-9]/);
  });

  test('pause and resume timer', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    const nextBtn = page.locator('#next-btn');
    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    // Start
    await page.locator('.timer-media-btn-play').click();
    await page.waitForTimeout(1100);

    // Pause
    await page.locator('[aria-label="Pause"]').click();
    const pausedTime = await page.locator('.timer-display').textContent();

    // Should show resume button
    await expect(page.locator('[aria-label="Resume"]')).toBeVisible();

    // Wait and verify time didn't change
    await page.waitForTimeout(1500);
    await expect(page.locator('.timer-display')).toHaveText(pausedTime);
  });

  test('stop timer resets to suggestion', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    const nextBtn = page.locator('#next-btn');
    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    // Start then stop
    await page.locator('.timer-media-btn-play').click();
    await page.waitForTimeout(1100);
    await page.locator('[aria-label="Stop"]').click();

    // Should reset to suggestion mode with original time
    await expect(page.locator('.timer-display')).toHaveText('20:00');
    await expect(page.locator('[aria-label="Start"]')).toBeVisible();
  });

  test('timer persists across step navigation', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    // Go to step 5 and start timer
    const nextBtn = page.locator('#next-btn');
    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    await page.locator('.timer-media-btn-play').click();
    await page.waitForTimeout(1100);

    // Navigate back to step 4
    await page.locator('#prev-btn').click();
    await page.waitForTimeout(300);

    await expect(page.locator('#step-progress')).toHaveText('Step 4 of 5');

    // Timer should still be running
    await expect(page.locator('#timer-bar')).toBeVisible();
    await expect(page.locator('[aria-label="Pause"]')).toBeVisible();
    const timeText = await page.locator('.timer-display').textContent();
    expect(timeText).toMatch(/19:5[0-9]/);
  });

  test('time badge in step text prefills timer', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    // Go to step 5 which has "20 minutes" time badge
    const nextBtn = page.locator('#next-btn');
    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    // Adjust timer to a different value first
    await page.locator('.timer-arrow[aria-label="Add 1 minute"]').click();
    await expect(page.locator('.timer-display')).toHaveText('21:00');

    // Click the time badge in step text
    await page.locator('.time-badge').click();

    // Should reset to the badge's value
    await expect(page.locator('.timer-display')).toHaveText('20:00');
  });

  test('toggle shows timer with step duration when available', async ({ page }) => {
    await page.goto('/cooking.html?id=test-curry');

    // Go to step 5 (has 20min duration), dismiss via toggle
    const nextBtn = page.locator('#next-btn');
    for (let i = 0; i < 4; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    await page.locator('#timer-toggle-btn').click();
    await expect(page.locator('#timer-bar')).toBeHidden();

    // Re-open — should use step duration, not default 1:00
    await page.locator('#timer-toggle-btn').click();
    await expect(page.locator('.timer-display')).toHaveText('20:00');
  });
});
