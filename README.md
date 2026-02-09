# BiteMe 🌱

A simple, open-source vegetarian/vegan recipe app built as a Progressive Web App (PWA).

## Features

- 📱 Mobile-first design for iPhone
- 🥗 Vegetarian and vegan recipes
- 👨‍🍳 Step-by-step cooking mode
- 📝 Add notes to improve recipes
- 🔄 Multi-device sync (coming soon)
- 📴 Offline support (coming soon)

## Live Demo

Coming soon - will be hosted on GitHub Pages!

## Technology Stack

- Vanilla JavaScript (no frameworks)
- HTML5/CSS3
- Mobile-first responsive design
- GitHub Pages hosting

## Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/biteme.git
   cd biteme
   ```

2. Start a local server:
   ```bash
   python -m http.server 8000
   ```

3. Open your browser to `http://localhost:8000`

## Project Status

**Phase 1** (Current): Static site with mock recipe data
- ✅ Basic recipe list view
- ✅ Recipe detail page
- ✅ Mobile-optimized design

**Coming Soon:**
- Phase 2: Step-by-step cooking mode
- Phase 3: More recipes
- Phase 4: Notes feature
- Phase 5: Firebase backend for multi-device sync
- Phase 6: Full PWA with offline support

## Contributing

Contributions are welcome! This project is built to be collaborative.

### Adding Recipes (Phase 1-3)

To add a recipe, edit `/js/recipes.js` and add your recipe to the `mockRecipes` array:

```javascript
{
  id: 2,
  name: "Your Recipe Name",
  description: "Brief description",
  tags: ["vegan", "dinner"],
  ingredients: [
    "ingredient 1",
    "ingredient 2"
  ],
  steps: [
    "Step 1 instructions",
    "Step 2 instructions"
  ]
}
```

Then submit a pull request!

### Code Contributions

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

James Laffat

## Acknowledgments

Built with love for plant-based cooking! 🌱
