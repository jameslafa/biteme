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

// Resolve a step ref name to the single ingredient it refers to.
// Exact canonical match always wins; a word-boundary text match is only used
// as a fallback when no ingredient's canonical matches. This prevents a bare
// ref like {chilli} from also matching "chilli powder", or {coriander} from
// matching "ground coriander", since those have their own canonical entries.
function findStepIngredient(ingredientName, ingredients) {
  const resolved = resolveIngredientRef(ingredientName);
  const escaped = ingredientName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  let fallback = null;
  for (const items of Object.values(ingredients)) {
    for (const item of items) {
      if (item.canonical && item.canonical.toLowerCase() === resolved) {
        return item;
      }
      if (!fallback && regex.test(item.text)) {
        fallback = item;
      }
    }
  }
  return fallback;
}

// Parse step text and replace {ingredient} references with highlighted spans
function parseStepText(stepText, ingredients) {
  return stepText.replace(/\{([^}]+)\}/g, (_match, ingredientName) => {
    if (findStepIngredient(ingredientName, ingredients)) {
      return `<span class="ingredient-ref">${ingredientName}</span>`;
    }
    return ingredientName;
  });
}

// Extract ingredients used in a step
function getStepIngredients(stepText, ingredients) {
  const stepIngredients = [];
  for (const match of stepText.matchAll(/\{([^}]+)\}/g)) {
    const found = findStepIngredient(match[1], ingredients);
    if (found && !stepIngredients.some(i => i.id === found.id)) {
      stepIngredients.push(found);
    }
  }
  return stepIngredients;
}
