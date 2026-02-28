// Returns Map<recipeId, Set<canonical>> filtered by user settings, excluding Spices.
function buildRecipeIngredientSets(recipes, { showUntestedRecipes = true, dietaryFilters = [] } = {}) {
  const sets = new Map();
  for (const recipe of recipes) {
    if (!showUntestedRecipes && recipe.tested === false) continue;
    if (dietaryFilters.length > 0 && !dietaryFilters.every(d => (recipe.diet || []).includes(d))) continue;
    const canonicals = new Set();
    for (const [category, ingredients] of Object.entries(recipe.ingredients)) {
      if (category === 'Spices') continue;
      for (const ing of ingredients) {
        canonicals.add(ing.canonical || ing.text);
      }
    }
    sets.set(recipe.id, canonicals);
  }
  return sets;
}

// Returns Map<canonical, idfScore>
function computeIDF(ingredientSets) {
  const df = new Map();
  const N = ingredientSets.size;
  for (const canonicals of ingredientSets.values()) {
    for (const c of canonicals) {
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
// Excludes recipes with score 0 (no shared non-spice ingredients).
// Respects the user's showUntestedRecipes and dietaryFilters settings.
async function getSimilarRecipes(recipeId, n = 5) {
  const recipes = await getRecipes();

  await initDB();
  const showUntestedRecipes = !!(await getSetting('showUntestedRecipes'));
  const dietaryFilters = (await getSetting('dietaryFilters')) || [];

  const ingredientSets = buildRecipeIngredientSets(recipes, { showUntestedRecipes, dietaryFilters });
  const idf = computeIDF(ingredientSets);

  // Get target set from corpus; if not there (e.g. recipe filtered by diet but user navigated directly),
  // build it from the raw recipe data so we can still score against the visible corpus.
  let targetSet = ingredientSets.get(recipeId);
  if (!targetSet) {
    const targetRecipe = recipes.find(r => r.id === recipeId);
    if (!targetRecipe) return [];
    targetSet = new Set();
    for (const [category, ingredients] of Object.entries(targetRecipe.ingredients)) {
      if (category === 'Spices') continue;
      for (const ing of ingredients) {
        targetSet.add(ing.canonical || ing.text);
      }
    }
  }

  const scores = [];
  for (const [otherId, otherSet] of ingredientSets) {
    if (otherId === recipeId) continue;

    const shared = [];
    let score = 0;
    for (const c of targetSet) {
      if (otherSet.has(c)) {
        shared.push(c);
        score += idf.get(c);
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
