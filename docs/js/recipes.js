// Cache for loaded recipes
let recipesCache = null;

// Map of any ingredient form (singular/plural, lowercase) → canonical (lowercase)
let ingredientVocabulary = null;

async function loadIngredientVocabulary() {
  if (ingredientVocabulary) return;
  try {
    const response = await fetch('ingredients.json');
    if (!response.ok) return;
    const data = await response.json();
    ingredientVocabulary = new Map();
    for (const [canonical, entry] of Object.entries(data.ingredients)) {
      const key = canonical.toLowerCase();
      ingredientVocabulary.set(key, key);
      if (entry.plural) ingredientVocabulary.set(entry.plural.toLowerCase(), key);
    }
  } catch {
    ingredientVocabulary = new Map();
  }
}

function resolveIngredientRef(name) {
  if (!ingredientVocabulary) return name.toLowerCase();
  return ingredientVocabulary.get(name.toLowerCase()) ?? name.toLowerCase();
}

// Force a fresh fetch from the network, bypassing version check and localStorage cache
// Returns true on success, false on failure
async function forceRefreshRecipes() {
  try {
    const [manifestResponse, recipesResponse] = await Promise.all([
      fetch('recipes-manifest.json', { cache: 'no-cache' }),
      fetch('recipes.json', { cache: 'no-cache' }),
    ]);
    if (!manifestResponse.ok || !recipesResponse.ok) return false;

    const manifest = await manifestResponse.json();
    recipesCache = await recipesResponse.json();
    localStorage.setItem('recipes-manifest', JSON.stringify(manifest));
    localStorage.setItem('recipes-cache', JSON.stringify(recipesCache));
    return true;
  } catch {
    return false;
  }
}

// Check manifest and refresh recipes if version changed
// Returns true if recipes were updated
async function checkForRecipeUpdates() {
  try {
    const response = await fetch('recipes-manifest.json');
    if (!response.ok) return false;

    const manifest = await response.json();
    const cachedManifest = localStorage.getItem('recipes-manifest');

    if (cachedManifest) {
      const cached = JSON.parse(cachedManifest);
      if (cached.version === manifest.version) return false;
    }

    // Version changed — clear in-memory cache so next load fetches fresh
    recipesCache = null;
    return true;
  } catch {
    return false;
  }
}

// Load recipes from JSON file with manifest-based caching
async function loadRecipesData() {
  if (recipesCache) {
    return recipesCache;
  }

  try {
    // Try to fetch manifest to check version
    const manifestResponse = await fetch('recipes-manifest.json');

    if (manifestResponse.ok) {
      const manifest = await manifestResponse.json();
      const cachedManifest = localStorage.getItem('recipes-manifest');
      const cachedRecipes = localStorage.getItem('recipes-cache');

      // If we have cached data and version matches, use cache
      if (cachedManifest && cachedRecipes) {
        const cached = JSON.parse(cachedManifest);
        if (cached.version === manifest.version) {
          console.log('[Recipes] Using cached recipes (version match)');
          recipesCache = JSON.parse(cachedRecipes);
          return recipesCache;
        }
      }

      // Version mismatch or no cache - fetch fresh recipes
      console.log('[Recipes] Fetching fresh recipes (new version)');
      const response = await fetch('recipes.json');
      if (!response.ok) {
        throw new Error(`Failed to load recipes: ${response.status}`);
      }
      recipesCache = await response.json();

      // Update cache
      localStorage.setItem('recipes-manifest', JSON.stringify(manifest));
      localStorage.setItem('recipes-cache', JSON.stringify(recipesCache));

      return recipesCache;
    }
  } catch (error) {
    // Network error - try to use cached data
    console.log('[Recipes] Network error, trying cache:', error.message);
    const cachedRecipes = localStorage.getItem('recipes-cache');
    if (cachedRecipes) {
      console.log('[Recipes] Using cached recipes (offline)');
      recipesCache = JSON.parse(cachedRecipes);
      return recipesCache;
    }

    // No cache available
    console.error('[Recipes] No cached data available');
    return [];
  }
}

// Get all recipes
async function getRecipes() {
  return await loadRecipesData();
}

// Get recipe by ID
async function getRecipeById(id) {
  const recipes = await loadRecipesData();
  return recipes.find(recipe => recipe.id === id);
}

// Search recipes by name
async function searchRecipes(query) {
  const recipes = await loadRecipesData();
  if (!query) return recipes;

  const lowerQuery = query.toLowerCase();
  return recipes.filter(recipe =>
    recipe.name.toLowerCase().includes(lowerQuery) ||
    recipe.description.toLowerCase().includes(lowerQuery) ||
    (recipe.cuisine || []).some(c => c.toLowerCase().includes(lowerQuery)) ||
    (recipe.meal_type || []).some(m => m.toLowerCase().includes(lowerQuery))
  );
}

// Match a step ref name against an ingredient — resolves ref to canonical, then falls back to text
function matchStepRef(ingredientName, item) {
  const resolved = resolveIngredientRef(ingredientName);
  if (item.canonical && item.canonical.toLowerCase() === resolved) {
    return true;
  }
  const regex = new RegExp(`\\b${ingredientName}\\b`, 'i');
  return regex.test(item.text);
}

// Parse step text and replace {ingredient} references with clickable links
function parseStepText(stepText, ingredients, stepIndex) {
  return stepText.replace(/\{([^}]+)\}/g, (match, ingredientName) => {
    for (const items of Object.values(ingredients)) {
      const found = items.find(item => matchStepRef(ingredientName, item));
      if (found) {
        const refId = `step-${stepIndex}-ingredient-${ingredientName.replace(/\s+/g, '-')}`;
        return `<a href="#${refId}" class="ingredient-ref">${ingredientName}</a>`;
      }
    }
    return ingredientName;
  });
}

// Extract ingredients used in a step
function getStepIngredients(stepText, ingredients) {
  const stepIngredients = [];
  for (const match of stepText.matchAll(/\{([^}]+)\}/g)) {
    const ingredientName = match[1];
    for (const items of Object.values(ingredients)) {
      const found = items.find(item => matchStepRef(ingredientName, item));
      if (found && !stepIngredients.some(i => i.id === found.id)) {
        stepIngredients.push(found);
      }
    }
  }
  return stepIngredients;
}
