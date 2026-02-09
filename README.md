# biteme 🌱

A simple, open-source vegetarian/vegan recipe app with an elegant minimalist design.

## Live Demo

**https://jameslafa.github.io/biteme/**

## Features

- 📱 Mobile-first elegant design
- 🥗 Vegetarian and vegan recipes organized by kitchen location
- 👨‍🍳 Step-by-step cooking mode with ingredient prep
- 🔗 Smart ingredient references - steps link to ingredient quantities
- 📋 Ingredient checklist to gather what you need

## Technology Stack

- Vanilla JavaScript (no frameworks)
- HTML5/CSS3 with CSS custom properties
- Mobile-first responsive design
- GitHub Pages hosting

## Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/jameslafa/biteme.git
   cd biteme
   ```

2. Start a local server:
   ```bash
   python -m http.server 8000
   ```

3. Open your browser to `http://localhost:8000`

## Contributing

Contributions are welcome! This project is built to be collaborative.

### Adding Recipes

To add a recipe, edit `/js/recipes.js` and add your recipe to the `mockRecipes` array:

```javascript
{
  id: 4,
  name: "Your Recipe Name",
  description: "Brief description",
  tags: ["vegan", "dinner", "quick"],
  ingredients: {
    "Fresh Produce": [
      "1 onion, diced",
      "2 cloves garlic"
    ],
    "Refrigerated Items": [],
    "Pantry/Cupboard": [
      "1 cup rice"
    ],
    "Spices & Dried Herbs": [
      "Salt to taste"
    ],
    "Oils & Condiments": [
      "2 tbsp olive oil"
    ]
  },
  steps: [
    "Heat {olive oil} in a pan. Add {onion} and cook until soft.",
    "Add {garlic} and cook for 1 minute.",
    "Add {rice} and {salt}. Cook until done."
  ]
}
```

**Key points:**
- Organize ingredients by kitchen location (Fresh Produce, Refrigerated Items, Pantry/Cupboard, Spices & Dried Herbs, Oils & Condiments)
- Use `{ingredient}` syntax in steps to reference ingredients
- The reference must match a word in the ingredient list (e.g., `{oil}` matches "2 tbsp olive oil")

Then submit a pull request!

### Code Contributions

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

Built with love for plant-based cooking! 🌱
