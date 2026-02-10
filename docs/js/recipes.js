// Cache for loaded recipes
let recipesCache = null;

// Load recipes from JSON file
async function loadRecipesData() {
  if (recipesCache) {
    return recipesCache;
  }

  try {
    const response = await fetch('recipes.json');
    if (!response.ok) {
      throw new Error(`Failed to load recipes: ${response.status}`);
    }
    recipesCache = await response.json();
    return recipesCache;
  } catch (error) {
    console.error('Error loading recipes:', error);
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
