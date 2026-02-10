// Cache for loaded recipes
let recipesCache = null;

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
    recipe.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
}

// Parse step text and replace {ingredient} references with clickable links
function parseStepText(stepText, ingredients, stepIndex) {
  // Find all {ingredient} patterns
  return stepText.replace(/\{([^}]+)\}/g, (match, ingredientName) => {
    // Search for ingredient in all categories
    for (const [category, items] of Object.entries(ingredients)) {
      const found = items.find(item => {
        // Use word boundary matching for precise matches
        const regex = new RegExp(`\\b${ingredientName}\\b`, 'i');
        return regex.test(item.text);
      });

      if (found) {
        // Create a unique ID for this ingredient reference
        const refId = `step-${stepIndex}-ingredient-${ingredientName.replace(/\s+/g, '-')}`;
        // Return clickable styled reference
        return `<a href="#${refId}" class="ingredient-ref">${ingredientName}</a>`;
      }
    }

    // Fallback: just return the ingredient name without braces
    return ingredientName;
  });
}

// Extract ingredients used in a step
function getStepIngredients(stepText, ingredients) {
  const stepIngredients = [];
  const matches = stepText.matchAll(/\{([^}]+)\}/g);

  for (const match of matches) {
    const ingredientName = match[1];

    // Search for ingredient in all categories
    for (const [category, items] of Object.entries(ingredients)) {
      const found = items.find(item => {
        // Use word boundary matching for precise matches
        const regex = new RegExp(`\\b${ingredientName}\\b`, 'i');
        return regex.test(item.text);
      });

      if (found && !stepIngredients.some(i => i.id === found.id)) {
        stepIngredients.push(found);
      }
    }
  }

  return stepIngredients;
}
