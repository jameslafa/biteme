// Mock recipe data
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
      "Heat oil in a large pot over medium heat. Add diced onion and cook until soft, about 5 minutes.",
      "Add minced garlic and curry paste. Cook for 1 minute, stirring constantly until fragrant.",
      "Add rinsed lentils, coconut milk, and vegetable broth. Stir to combine.",
      "Bring to a boil, then reduce heat and simmer for 20-25 minutes until lentils are soft and tender.",
      "Season with salt to taste. Garnish with fresh cilantro and serve hot with rice or naan."
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
      "In a jar or container, combine oats, plant milk, chia seeds, maple syrup, vanilla, and cinnamon.",
      "Stir well to ensure everything is mixed together.",
      "Cover and refrigerate overnight, or for at least 4 hours.",
      "In the morning, give it a good stir and add more milk if needed for desired consistency.",
      "Top with fresh berries and sliced banana. Enjoy cold or warm it up if preferred."
    ]
  },
  {
    id: 3,
    name: "Mediterranean Buddha Bowl",
    description: "Colorful and nutritious grain bowl with Mediterranean flavors",
    tags: ["vegan", "lunch", "healthy"],
    ingredients: {
      "Fresh Produce": [
        "1 cup cherry tomatoes, halved",
        "1 cucumber, diced",
        "1/4 red onion, thinly sliced",
        "2 cups baby spinach",
        "1 clove garlic, minced",
        "2 tbsp lemon juice"
      ],
      "Refrigerated Items": [],
      "Pantry/Cupboard": [
        "1 cup cooked quinoa",
        "1 cup chickpeas, drained and rinsed",
        "1/4 cup kalamata olives"
      ],
      "Spices & Dried Herbs": [
        "Salt and pepper to taste"
      ],
      "Oils & Condiments": [
        "3 tbsp tahini"
      ]
    },
    steps: [
      "Prepare quinoa according to package directions and let cool slightly.",
      "In a small bowl, whisk together tahini, lemon juice, garlic, and 2-3 tablespoons of water until smooth. Season with salt and pepper.",
      "In serving bowls, arrange spinach as a base.",
      "Top with quinoa, chickpeas, cherry tomatoes, cucumber, red onion, and olives in sections.",
      "Drizzle tahini dressing over the bowl and serve immediately."
    ]
  },
  {
    id: 4,
    name: "Black Bean Tacos",
    description: "Quick and satisfying Mexican-inspired tacos",
    tags: ["vegan", "dinner", "mexican"],
    ingredients: {
      "Fresh Produce": [
        "1 avocado, sliced",
        "1 cup shredded lettuce",
        "1/4 cup fresh cilantro, chopped",
        "Lime wedges for serving"
      ],
      "Refrigerated Items": [
        "1/2 cup salsa"
      ],
      "Pantry/Cupboard": [
        "1 can black beans, drained and rinsed",
        "6 small corn tortillas"
      ],
      "Spices & Dried Herbs": [
        "1 tsp cumin",
        "1 tsp chili powder",
        "1/2 tsp garlic powder"
      ],
      "Oils & Condiments": []
    },
    steps: [
      "In a pan over medium heat, add black beans with cumin, chili powder, and garlic powder.",
      "Cook for 5-7 minutes, mashing some beans with the back of a spoon, until heated through.",
      "Warm tortillas in a dry skillet or microwave.",
      "Fill each tortilla with seasoned black beans.",
      "Top with avocado slices, lettuce, salsa, and cilantro. Serve with lime wedges."
    ]
  },
  {
    id: 5,
    name: "Creamy Tomato Pasta",
    description: "Rich and comforting pasta in a creamy tomato sauce",
    tags: ["vegetarian", "dinner", "italian"],
    ingredients: {
      "Fresh Produce": [
        "3 cloves garlic, minced",
        "Fresh basil for garnish"
      ],
      "Refrigerated Items": [
        "1/2 cup heavy cream or coconut cream",
        "Parmesan cheese (optional)"
      ],
      "Pantry/Cupboard": [
        "12 oz pasta of choice",
        "1 can (400g) crushed tomatoes"
      ],
      "Spices & Dried Herbs": [
        "1 tsp dried basil",
        "1/2 tsp red pepper flakes",
        "Salt and pepper to taste"
      ],
      "Oils & Condiments": [
        "2 tbsp olive oil"
      ]
    },
    steps: [
      "Cook pasta according to package directions. Reserve 1/2 cup pasta water before draining.",
      "In a large pan, heat olive oil over medium heat. Add garlic and cook until fragrant, about 1 minute.",
      "Add crushed tomatoes, dried basil, and red pepper flakes. Simmer for 5 minutes.",
      "Stir in cream and season with salt and pepper. Simmer for another 3-4 minutes.",
      "Add cooked pasta to the sauce, tossing to coat. Add reserved pasta water if needed to thin sauce. Garnish with fresh basil and parmesan if desired."
    ]
  },
  {
    id: 6,
    name: "Asian Vegetable Stir-Fry",
    description: "Colorful veggie stir-fry with a savory sauce",
    tags: ["vegan", "dinner", "asian"],
    ingredients: {
      "Fresh Produce": [
        "2 cups broccoli florets",
        "1 bell pepper, sliced",
        "1 carrot, julienned",
        "1 cup snap peas",
        "2 cloves garlic, minced",
        "1 tsp fresh ginger, grated"
      ],
      "Refrigerated Items": [
        "8 oz firm tofu, cubed"
      ],
      "Pantry/Cupboard": [
        "Cooked rice for serving",
        "Sesame seeds for garnish"
      ],
      "Spices & Dried Herbs": [],
      "Oils & Condiments": [
        "3 tbsp soy sauce",
        "1 tbsp sesame oil",
        "2 tbsp vegetable oil"
      ]
    },
    steps: [
      "Press tofu to remove excess moisture, then cut into cubes.",
      "Heat 1 tablespoon oil in a large wok or pan over high heat. Add tofu and cook until golden on all sides. Remove and set aside.",
      "In the same pan, heat remaining oil. Add garlic and ginger, cook for 30 seconds.",
      "Add all vegetables and stir-fry for 5-7 minutes until tender-crisp.",
      "Return tofu to the pan. Add soy sauce and sesame oil, toss everything together. Serve over rice and garnish with sesame seeds."
    ]
  },
  {
    id: 7,
    name: "Caprese Avocado Toast",
    description: "Elevated avocado toast with fresh mozzarella and tomatoes",
    tags: ["vegetarian", "breakfast", "quick"],
    ingredients: {
      "Fresh Produce": [
        "1 ripe avocado",
        "1 large tomato, sliced",
        "Fresh basil leaves"
      ],
      "Refrigerated Items": [
        "4 oz fresh mozzarella, sliced"
      ],
      "Pantry/Cupboard": [
        "2 slices sourdough bread"
      ],
      "Spices & Dried Herbs": [
        "Salt and pepper to taste",
        "Red pepper flakes (optional)"
      ],
      "Oils & Condiments": [
        "2 tbsp balsamic glaze",
        "1 tbsp olive oil"
      ]
    },
    steps: [
      "Toast the sourdough bread until golden and crispy.",
      "Mash the avocado in a bowl with a pinch of salt and pepper.",
      "Spread mashed avocado evenly on toasted bread.",
      "Layer tomato slices and mozzarella on top of the avocado.",
      "Drizzle with olive oil and balsamic glaze. Top with fresh basil leaves and red pepper flakes if desired."
    ]
  },
  {
    id: 8,
    name: "Butternut Squash Soup",
    description: "Smooth and creamy fall-inspired soup",
    tags: ["vegan", "lunch", "comfort"],
    ingredients: {
      "Fresh Produce": [
        "1 medium butternut squash, peeled and cubed",
        "1 onion, chopped",
        "2 cloves garlic, minced"
      ],
      "Refrigerated Items": [
        "1 can (400ml) coconut milk"
      ],
      "Pantry/Cupboard": [
        "3 cups vegetable broth",
        "Pumpkin seeds for garnish"
      ],
      "Spices & Dried Herbs": [
        "1 tsp ground cumin",
        "1/2 tsp cinnamon",
        "Salt and pepper to taste"
      ],
      "Oils & Condiments": [
        "2 tbsp olive oil"
      ]
    },
    steps: [
      "Heat olive oil in a large pot over medium heat. Add onion and cook until softened, about 5 minutes.",
      "Add garlic, cumin, and cinnamon. Cook for 1 minute until fragrant.",
      "Add butternut squash cubes and vegetable broth. Bring to a boil.",
      "Reduce heat and simmer for 20-25 minutes until squash is very tender.",
      "Use an immersion blender to puree until smooth, or transfer to a blender in batches. Stir in coconut milk and season with salt and pepper. Serve garnished with pumpkin seeds."
    ]
  },
  {
    id: 9,
    name: "Energy Balls",
    description: "No-bake snack balls packed with nuts and dates",
    tags: ["vegan", "snack", "no-cook"],
    ingredients: {
      "Fresh Produce": [],
      "Refrigerated Items": [],
      "Pantry/Cupboard": [
        "1 cup pitted dates",
        "1 cup almonds",
        "2 tbsp cocoa powder",
        "2 tbsp chia seeds",
        "Shredded coconut for rolling (optional)"
      ],
      "Spices & Dried Herbs": [
        "1/4 tsp sea salt"
      ],
      "Oils & Condiments": [
        "2 tbsp maple syrup"
      ]
    },
    steps: [
      "Add dates and almonds to a food processor. Process until finely chopped and sticky.",
      "Add cocoa powder, chia seeds, maple syrup, and salt. Process until mixture holds together when pressed.",
      "Roll mixture into small balls, about 1 inch in diameter.",
      "If desired, roll balls in shredded coconut to coat.",
      "Store in an airtight container in the refrigerator for up to 2 weeks."
    ]
  },
  {
    id: 10,
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
      "Add chickpeas, tahini, lemon juice, garlic, olive oil, and cumin to a food processor.",
      "Process until smooth, about 1-2 minutes.",
      "With the processor running, slowly add water until you reach desired consistency.",
      "Season with salt to taste and process again briefly.",
      "Transfer to a serving bowl, drizzle with olive oil, and sprinkle with paprika. Serve with vegetables or pita bread."
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
