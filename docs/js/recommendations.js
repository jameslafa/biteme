// Pantry staples that don't meaningfully define a recipe's identity.
// These are excluded from similarity scoring entirely.
const PANTRY_STOPLIST = new Set([
  'water', 'vegetable stock', 'plain flour', 'self-raising flour',
  'baking soda', 'baking powder', 'maple syrup',
  'butter', 'vegan butter', 'margarine',
]);

function isStopIngredient(canonical) {
  return PANTRY_STOPLIST.has(canonical)
    || canonical.includes('salt')
    || canonical.includes('sugar')
    || canonical.includes('black pepper')
    || canonical.includes('white pepper')
    || canonical.endsWith(' oil')
    || canonical.endsWith(' milk')
    || canonical === 'milk';
}

// Category weights: perishable ingredients (Fresh/Fridge) define a recipe's
// identity more than shelf-stable pantry items.
const CATEGORY_WEIGHT = { Fresh: 2, Fridge: 2, Pantry: 1 };

// Returns Map<recipeId, Map<canonical, category>> filtered by user settings.
// Excludes Spices and pantry stoplist ingredients.
function buildRecipeIngredientMaps(recipes, { showUntestedRecipes = true, dietaryFilters = [] } = {}) {
  const maps = new Map();
  for (const recipe of recipes) {
    if (!showUntestedRecipes && recipe.tested === false) continue;
    if (dietaryFilters.length > 0 && !dietaryFilters.every(d => (recipe.diet || []).includes(d))) continue;
    const ingredientMap = new Map();
    for (const [category, ingredients] of Object.entries(recipe.ingredients)) {
      if (category === 'Spices') continue;
      for (const ing of ingredients) {
        const canonical = ing.canonical || ing.text;
        if (isStopIngredient(canonical)) continue;
        ingredientMap.set(canonical, category);
      }
    }
    maps.set(recipe.id, ingredientMap);
  }
  return maps;
}

// Returns Map<canonical, idfScore>
function computeIDF(ingredientMaps) {
  const df = new Map();
  const N = ingredientMaps.size;
  for (const ingredientMap of ingredientMaps.values()) {
    for (const c of ingredientMap.keys()) {
      df.set(c, (df.get(c) || 0) + 1);
    }
  }
  const idf = new Map();
  for (const [canonical, count] of df) {
    idf.set(canonical, Math.log(N / count));
  }
  return idf;
}

// Returns [{ recipe, score, sharedIngredients: string[] }] sorted by score desc.
// n = max results to return. Excludes the recipe itself.
// Excludes recipes with score 0 (no shared meaningful ingredients).
// Respects the user's showUntestedRecipes and dietaryFilters settings.
async function getSimilarRecipes(recipeId, n = 5) {
  const recipes = await getRecipes();

  await initDB();
  const showUntestedRecipes = !!(await getSetting('showUntestedRecipes'));
  const dietaryFilters = (await getSetting('dietaryFilters')) || [];

  const ingredientMaps = buildRecipeIngredientMaps(recipes, { showUntestedRecipes, dietaryFilters });
  const idf = computeIDF(ingredientMaps);

  // Get target map from corpus; if not there (e.g. recipe filtered by diet but user navigated directly),
  // build it from the raw recipe data so we can still score against the visible corpus.
  let targetMap = ingredientMaps.get(recipeId);
  if (!targetMap) {
    const targetRecipe = recipes.find(r => r.id === recipeId);
    if (!targetRecipe) return [];
    targetMap = new Map();
    for (const [category, ingredients] of Object.entries(targetRecipe.ingredients)) {
      if (category === 'Spices') continue;
      for (const ing of ingredients) {
        const canonical = ing.canonical || ing.text;
        if (isStopIngredient(canonical)) continue;
        targetMap.set(canonical, category);
      }
    }
  }

  const scores = [];
  for (const [otherId, otherMap] of ingredientMaps) {
    if (otherId === recipeId) continue;

    const shared = [];
    let score = 0;
    for (const [canonical, category] of targetMap) {
      if (otherMap.has(canonical)) {
        shared.push(canonical);
        const weight = Math.max(
          CATEGORY_WEIGHT[category] || 1,
          CATEGORY_WEIGHT[otherMap.get(canonical)] || 1,
        );
        score += idf.get(canonical) * weight;
      }
    }

    if (score > 0) {
      const recipe = recipes.find(r => r.id === otherId);
      scores.push({ recipe, score: Math.round(score * 100) / 100, sharedIngredients: shared });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, n);
}
