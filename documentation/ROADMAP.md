# BiteMe - Feature Roadmap

This document tracks feature ideas and improvements for BiteMe. Mark items as completed as we work through them.

## Infrastructure & Build System

### [x] Recipe Parser/Compiler (Rust)
- Rust program that parses individual recipe Markdown files
- Generates a single `recipes.json` file with all recipes in the correct format
- App fetches this JSON via URL
- Runs locally via command
- [ ] GitHub Actions pipeline on push
- **Goal**: Avoid backend, keep recipes as open-source MD files that can be submitted via PR

### [x] Recipe Linter
- Integrated into the Rust parser tool
- Validates recipe structure, required fields, data types, ingredient format, markdown structure
- [ ] Run in GitHub Actions when PRs are opened/updated
- [ ] Block merging if recipe format is invalid

### [x] Versioning/Caching System
- Manifest-based approach: check small `recipes-manifest.json` first, only fetch full JSON if version changed
- Cached recipes stored in localStorage for fast loading
- Offline fallback: uses cached data when network unavailable
- Auto-refresh on app resume: checks manifest on `visibilitychange` and re-renders if stale

### [x] Service Worker Update Detection
- Detects when app code (HTML, CSS, JS) has been updated
- Shows toast notification on homepage: "New recipes available" with Refresh button
- Periodic check every 60 seconds + on navigation
- Only shown on homepage to avoid interrupting cooking or other flows

### [x] Better Ingredient Categorization System
- **Solution**: Simplified from 7 categories to 4 clear categories
- New categories: Fresh, Fridge, Spices, Pantry
- Validated by Rust parser to prevent typos and inconsistency
- Simple, maintainable system that scales well

## User Features

### [x] Favorites System
- Mark recipes as favorites with heart icon
- Store in IndexedDB (local, no backend)
- Filter view to show only favorites
- Filter state persists across sessions
- Works on recipe cards and recipe detail page

### [x] What's New Section
- Bell icon button in header with notification dot for unseen entries
- Bottom sheet overlay with changelog entries (date + description)
- Incremental ID system: dot appears when new entries exist beyond last seen
- First visit: no dot (marks all current entries as seen)
- Last seen ID stored in IndexedDB `settings` store
- Includes feedback email link in sheet footer

### [ ] First-Time User Onboarding
- Interactive walkthrough for new users explaining key features
- Highlight main functionalities: browsing recipes, favorites, shopping list, cooking mode
- Step-by-step tour with tooltips or overlay
- Skippable but can be replayed from settings/help
- Store onboarding completion status in IndexedDB
- **Goal**: Reduce confusion, improve feature discoverability for first-time users

### [ ] My Pantry/Spices Inventory
- Users can store a list of ingredients/spices they have at home
- When viewing a recipe, pre-check items they already have
- Show what they need to buy vs what they have
- Store locally in IndexedDB

### [x] Shopping List Builder
- Add basket/cart icon next to each ingredient in recipe view
- Click to add ingredient to shopping list
- Shopping list page showing ingredients grouped by recipe
- Check off items as you buy them in the supermarket
- Store in IndexedDB, works offline
- TTL-based cleanup: checked items auto-delete after 1 hour (undo window)
- Header shopping cart icon with count badge for easy access
- **Workflow**: Browse recipes → add ingredients → view shopping list → check off in store

### [ ] Personal Notes/Feedback
- Allow users to add notes to recipes after cooking
- "Added more garlic", "needed 5 extra minutes", "kids loved it", etc.
- Store locally in IndexedDB

### [ ] Rating System
- Let users rate recipes
- **Personal ratings** (local, no backend) vs **community ratings** (requires backend)
- Start with personal ratings to avoid backend complexity?

### [x] Screen Wake Lock in Cooking Mode
- Keeps screen awake during cooking mode using the Screen Wake Lock API
- Auto-acquires on entering cooking mode, auto-releases on navigation
- Silent fallback if API unavailable — no error state or UI needed

### [ ] Cooking Timers with Alerts
- For steps that require timing, add countdown timers
- Send browser notifications/audio alerts when time is up
- **To explore**: Browser notification permissions, audio alerts, mobile vibration

### [x] Cooking Time Tracking
- [x] Track cooking sessions (start/complete timestamps) in IndexedDB
- [x] Display elapsed time on completion page ("Cooked in 32 minutes")
- [x] Show cooking history on recipe detail page (times cooked, last duration)
- [x] Show cooking indicator on homepage cards (times cooked, average duration)

### [ ] Post-Cooking Complexity Rating
- After finishing a recipe, ask user to rate complexity
- Simple scale: Easy / Medium / Hard
- Store in IndexedDB with cooking notes
- Helps users remember which recipes are quick vs involved
- Could display personal complexity rating on recipe cards

### [x] Share Recipe
- Share button on recipe detail page
- Uses native Web Share API on mobile (opens share sheet)
- Falls back to copy-to-clipboard on desktop with toast feedback

### [x] Recipe Notes & Serving Suggestions
- Optional notes and serving suggestions in recipe markdown
- Displayed on recipe detail page below instructions
- In cooking mode: notes shown on first step, serving suggestions on last step
- Minimal styling with left border accent to avoid visual clutter

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

### [~] SEO & Social Sharing (Open Graph)
- [x] Static OG tags on homepage and recipe page (title, description, image)
- [x] Shared links show app branding and description in previews
- [ ] Per-recipe OG tags (requires generating individual HTML pages at build time)
- [ ] JSON-LD structured data for Google recipe rich results
- **Note:** Dynamic per-recipe previews not possible with current client-side architecture. Would require build-time HTML generation per recipe.

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
