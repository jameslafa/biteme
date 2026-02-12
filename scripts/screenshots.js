const { chromium } = require('playwright');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'documentation', 'screenshots');
const BASE_URL = 'http://localhost:8080';
const RECIPE_ID = 'creamy-mushroom-soup';

// iPhone 14 viewport
const VIEWPORT = { width: 390, height: 844 };

async function takeScreenshots() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // Load the app once to initialize DB
  await page.goto(`${BASE_URL}/`);
  await page.waitForSelector('.recipe-card');

  // Homepage
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'home.png') });
  console.log('Captured: home.png');

  // Recipe detail
  await page.goto(`${BASE_URL}/recipe.html?id=${RECIPE_ID}`);
  await page.waitForSelector('.recipe-name');
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'recipe.png') });
  console.log('Captured: recipe.png');

  // Cooking mode step 1
  await page.goto(`${BASE_URL}/cooking.html?id=${RECIPE_ID}`);
  await page.waitForSelector('#step-content');
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'cooking.png') });
  console.log('Captured: cooking.png');

  // Shopping list — seed ingredients from the curry (short names)
  const SHOPPING_RECIPE = 'pumpkin-potato-curry';
  await page.goto(`${BASE_URL}/recipe.html?id=${SHOPPING_RECIPE}`);
  await page.waitForSelector('.add-to-cart');
  const cartButtons = page.locator('.add-to-cart');
  const count = await cartButtons.count();
  for (let i = 0; i < Math.min(count, 6); i++) {
    await cartButtons.nth(i).click();
    await page.waitForTimeout(100);
  }
  // Check off a couple items on the shopping page
  await page.goto(`${BASE_URL}/shopping.html`);
  await page.waitForSelector('.shopping-item');
  const checkboxes = page.locator('.shopping-item input[type="checkbox"]');
  await checkboxes.nth(0).check();
  await page.waitForTimeout(100);
  await checkboxes.nth(1).check();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'shopping.png') });
  console.log('Captured: shopping.png');

  await browser.close();
  console.log(`\nScreenshots saved to documentation/screenshots/`);
}

takeScreenshots().catch((err) => {
  console.error('Screenshot generation failed:', err.message);
  process.exit(1);
});
