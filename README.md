# biteme 🌱

A simple, open-source vegetarian/vegan recipe app with an elegant minimalist design.

## Live Demo

**https://jameslafa.github.io/biteme/**

## Why BiteMe?

- 🌱 **Plant-based focus** - Curated vegetarian and vegan recipes
- 📱 **Cook-friendly design** - Clean interface that works while your hands are messy
- 📋 **Smart ingredient prep** - Organized by where items are in your kitchen
- 👨‍🍳 **Step-by-step guidance** - Track your progress as you cook
- 🛒 **Shopping list builder** - Add ingredients and check them off as you shop
- 📤 **Share recipes** - Send your favorite finds to friends with one tap
- ⭐ **Save favorites** - Keep your go-to recipes at your fingertips
- 🔒 **Privacy-first** - No accounts, no tracking, everything stored locally
- 📴 **Works offline** - Full PWA support, use it anywhere without internet
- 🤝 **Community-driven** - Open source project where anyone can contribute recipes or improve the app
- 🆓 **Free forever** - No ads, no paywalls, no premium tiers

## Why I Built This

I haven't found a cooking app I truly enjoyed using. Most are cluttered with ads, tracking, paywalls, or endless content you don't need. I wanted something different—a community-driven, open-source recipe app that's private, safe, and focused on what matters: cooking great food.

Simple features like checking off ingredients, building a shopping list, and having a distraction-free focus mode while cooking make all the difference. BiteMe is built for people who want a clean, functional tool without the noise.

**Want to contribute?** Share your favorite recipes by opening a pull request. Help make this the recipe app we all wish existed.

## Technology Stack

- Vanilla JavaScript (no frameworks)
- HTML5/CSS3 with CSS custom properties
- IndexedDB for local data storage
- Mobile-first responsive design
- GitHub Pages hosting

## Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/jameslafa/biteme.git
   cd biteme
   ```

2. Install dependencies:
   ```bash
   npm install
   npx playwright install chromium
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser to `http://localhost:8080`

## Testing

E2E regression tests are built with [Playwright](https://playwright.dev/):

```bash
npm run test:all                  # Run all tests (parser + Playwright)
npm test                          # Run Playwright tests only
npm run test-parser               # Run parser tests only
npx playwright test --ui          # Visual test runner
npx playwright test tests/home    # Run a specific file
```

A pre-push git hook automatically runs tests before every `git push`.

## Contributing

Contributions are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for details on:
- Adding new recipes
- Recipe format and guidelines
- Code contributions

See our [Roadmap](documentation/ROADMAP.md) for planned features and ideas.

### Quick Start for Contributors

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Documentation

- [Contributing Guide](CONTRIBUTING.md) - How to add recipes and contribute
- [Roadmap](documentation/ROADMAP.md) - Planned features and ideas
- [Architecture](documentation/ARCHITECTURE.md) - Technical decisions
- [Data Structure](documentation/DATA_STRUCTURE.md) - Database schemas

## Acknowledgments

- Illustrations by [unDraw](https://undraw.co/)
- Built with love for plant-based cooking! 🌱
