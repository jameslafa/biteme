# BiteMe - Feature Roadmap

This document tracks feature ideas and improvements for BiteMe. Mark items as completed as we work through them.

## Infrastructure & Build System

### [ ] Recipe Parser/Compiler (Rust)
- Create a Rust program that parses individual recipe Markdown files
- Generate a single `recipes.json` file with all recipes in the correct format
- App fetches this JSON via URL
- Can run locally via command OR in GitHub Actions pipeline on push
- **Goal**: Avoid backend, keep recipes as open-source MD files that can be submitted via PR

### [ ] Recipe Linter
- Extend the Rust tool to validate recipe structure
- Check required fields, data types, ingredient format, markdown structure
- Run in GitHub Actions when PRs are opened/updated
- Blocks merging if recipe format is invalid
- Makes community contributions easy with automatic validation

### [ ] Versioning/Caching System
- Add versioning so app can detect if recipes JSON has changed
- Avoid re-fetching if nothing changed
- Could use git commit hash, timestamp, or incremental version number
- Consider manifest file approach: check small manifest first, only fetch full JSON if version changed

### [ ] Better Ingredient Categorization System
- **Problem**: Current system uses hardcoded strings like "Fresh Produce", "Refrigerated Items"
- Prone to typos and inconsistency across many MD files
- Need a better system (taxonomy file, ingredient database, or tags)
- **To explore**: What's the best approach for maintainability and scaling?

## User Features

### [x] Favorites System
- Mark recipes as favorites with heart icon
- Store in IndexedDB (local, no backend)
- Filter view to show only favorites
- Filter state persists across sessions
- Works on recipe cards and recipe detail page

### [ ] My Pantry/Spices Inventory
- Users can store a list of ingredients/spices they have at home
- When viewing a recipe, pre-check items they already have
- Show what they need to buy vs what they have
- Store locally in IndexedDB

### [ ] Shopping List Builder
- Add basket/cart icon next to each ingredient in recipe view
- Click to add ingredient to shopping list
- Aggregated shopping list page showing all ingredients from multiple recipes
- Check off items as you buy them in the supermarket
- Store in IndexedDB, works offline
- **Workflow**: Browse recipes → mark what to buy → view shopping list → check off in store

### [ ] Personal Notes/Feedback
- Allow users to add notes to recipes after cooking
- "Added more garlic", "needed 5 extra minutes", "kids loved it", etc.
- Store locally in IndexedDB

### [ ] Rating System
- Let users rate recipes
- **Personal ratings** (local, no backend) vs **community ratings** (requires backend)
- Start with personal ratings to avoid backend complexity?

### [ ] Cooking Timers with Alerts
- For steps that require timing, add countdown timers
- Send browser notifications/audio alerts when time is up
- **To explore**: Browser notification permissions, audio alerts, mobile vibration

### [ ] Cooking Time Tracking
- Track how long user takes to complete a recipe
- Start timer when entering cooking mode
- Display total time on completion page
- Store history in IndexedDB for personal reference

### [ ] Post-Cooking Complexity Rating
- After finishing a recipe, ask user to rate complexity
- Simple scale: Easy / Medium / Hard
- Store in IndexedDB with cooking notes
- Helps users remember which recipes are quick vs involved
- Could display personal complexity rating on recipe cards

### [x] Completion Page with Animation
- Dedicated completion page after finishing cooking
- "Bon appétit!" message with illustration from unDraw
- Bounce-in animation on page load
- Two buttons: return to recipe or browse more recipes
- Clean, celebratory design matching site aesthetic
- Future: Add notes, ratings, complexity feedback on this page

### [x] Progress Bar for Cooking Steps
- Visual indicator showing how far through the recipe you are
- Thin gradient bar (primary → accent color) below header
- Smooth animation on step transitions
- Progress: 0% at step 1, fills incrementally, 100% on finish
- Adds polish and sense of accomplishment to cooking mode

## Site Information & Credits

### [ ] Credits/Acknowledgments Page
- Create a dedicated page to acknowledge tools and resources
- Thank unDraw (https://undraw.co/) for beautiful free illustrations
- Credit any other open-source tools or resources used
- Accessible from footer or about section
- Simple, elegant design matching site aesthetic

## UX Improvements

### [x] Improve Ingredient Checkbox Flow
- **Problem**: Ingredients appear twice (overview + first cooking step)
- Both have checkboxes but state doesn't sync between views
- State isn't persisted across navigation
- **Solution implemented**: Removed ingredients from cooking mode (keep only in overview)
- Checkboxes are ephemeral prep helpers (session state only, no persistence)
- Clean separation: Overview = prep phase, Cooking mode = action phase
- Cooking mode starts directly at first instruction step
- Previous button on Step 1 returns to recipe overview for easy navigation back

---

## Notes
- Prioritizing no-backend solutions where possible
- Local storage (IndexedDB) for user-specific data
- Open-source recipe contributions via PR + automated validation
- Focus on simple, maintainable solutions that scale to 100-500 recipes
