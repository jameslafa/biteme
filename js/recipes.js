// Mock recipe data (keep only 3 recipes)
const mockRecipes = [
  {
    id: 1,
    name: "Simple Lentil Curry",
    description: "Quick and flavorful vegan curry perfect for weeknight dinners",
    tags: ["vegan", "dinner", "quick"],
    ingredients: {
      "Fresh Produce": [
        "1 onion, diced",
        "2 cloves garlic, minced",
        "Fresh cilantro for garnish"
      ],
      "Refrigerated Items": [
        "1 can (400ml) coconut milk"
      ],
      "Pantry/Cupboard": [
        "1 cup red lentils, rinsed",
        "2 cups vegetable broth",
        "2 tbsp curry paste"
      ],
      "Spices & Dried Herbs": [
        "Salt to taste"
      ],
      "Oils & Condiments": [
        "1 tbsp oil"
      ]
    },
    steps: [
      "Heat {oil} in a large pot over medium heat. Add {onion} and cook until soft, about 5 minutes.",
      "Add {garlic} and {curry paste}. Cook for 1 minute, stirring constantly until fragrant.",
      "Add {lentils}, {coconut milk}, and {vegetable broth}. Stir to combine.",
      "Bring to a boil, then reduce heat and simmer for 20-25 minutes until lentils are soft and tender.",
      "Season with {salt} to taste. Garnish with {cilantro} and serve hot with rice or naan."
    ]
  },
  {
    id: 2,
    name: "Overnight Oats",
    description: "Easy no-cook breakfast ready when you wake up",
    tags: ["vegan", "breakfast", "no-cook"],
    ingredients: {
      "Fresh Produce": [
        "Fresh berries for topping",
        "Sliced banana for topping"
      ],
      "Refrigerated Items": [
        "1/2 cup plant milk"
      ],
      "Pantry/Cupboard": [
        "1/2 cup rolled oats",
        "1 tbsp chia seeds"
      ],
      "Spices & Dried Herbs": [
        "Pinch of cinnamon"
      ],
      "Oils & Condiments": [
        "1 tbsp maple syrup",
        "1/2 tsp vanilla extract"
      ]
    },
    steps: [
      "In a jar or container, combine {oats}, {plant milk}, {chia seeds}, {maple syrup}, {vanilla}, and {cinnamon}.",
      "Stir well to ensure everything is mixed together.",
      "Cover and refrigerate overnight, or for at least 4 hours.",
      "In the morning, give it a good stir and add more milk if needed for desired consistency.",
      "Top with {berries} and {banana}. Enjoy cold or warm it up if preferred."
    ]
  },
  {
    id: 3,
    name: "Classic Hummus",
    description: "Smooth and creamy homemade hummus",
    tags: ["vegan", "snack", "mediterranean"],
    ingredients: {
      "Fresh Produce": [
        "3 tbsp lemon juice",
        "2 cloves garlic"
      ],
      "Refrigerated Items": [],
      "Pantry/Cupboard": [
        "1 can (400g) chickpeas, drained and rinsed",
        "1/4 cup water"
      ],
      "Spices & Dried Herbs": [
        "1/2 tsp cumin",
        "Salt to taste",
        "Paprika for serving"
      ],
      "Oils & Condiments": [
        "1/4 cup tahini",
        "2 tbsp olive oil",
        "Olive oil for serving"
      ]
    },
    steps: [
      "Add {chickpeas}, {tahini}, {lemon juice}, {garlic}, {olive oil}, and {cumin} to a food processor.",
      "Process until smooth, about 1-2 minutes.",
      "With the processor running, slowly add {water} until you reach desired consistency.",
      "Season with {salt} to taste and process again briefly.",
      "Transfer to a serving bowl, drizzle with olive oil, and sprinkle with {paprika}. Serve with vegetables or pita bread."
    ]
  }
];

// Get all recipes
function getRecipes() {
  return mockRecipes;
}

// Get recipe by ID
function getRecipeById(id) {
  return mockRecipes.find(recipe => recipe.id === parseInt(id));
}

// Search recipes by name
function searchRecipes(query) {
  if (!query) return mockRecipes;

  const lowerQuery = query.toLowerCase();
  return mockRecipes.filter(recipe =>
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
        return regex.test(item);
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
        return regex.test(item);
      });

      if (found && !stepIngredients.includes(found)) {
        stepIngredients.push(found);
      }
    }
  }

  return stepIngredients;
}
