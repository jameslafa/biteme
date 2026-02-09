// Mock recipe data
const mockRecipes = [
  {
    id: 1,
    name: "Simple Lentil Curry",
    description: "Quick and flavorful vegan curry perfect for weeknight dinners",
    tags: ["vegan", "dinner", "quick"],
    ingredients: [
      "1 cup red lentils, rinsed",
      "1 can (400ml) coconut milk",
      "2 tbsp curry paste",
      "1 onion, diced",
      "2 cloves garlic, minced",
      "1 tbsp oil",
      "2 cups vegetable broth",
      "Salt to taste",
      "Fresh cilantro for garnish"
    ],
    steps: [
      "Heat oil in a large pot over medium heat. Add diced onion and cook until soft, about 5 minutes.",
      "Add minced garlic and curry paste. Cook for 1 minute, stirring constantly until fragrant.",
      "Add rinsed lentils, coconut milk, and vegetable broth. Stir to combine.",
      "Bring to a boil, then reduce heat and simmer for 20-25 minutes until lentils are soft and tender.",
      "Season with salt to taste. Garnish with fresh cilantro and serve hot with rice or naan."
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
