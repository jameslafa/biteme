# BiteMe - Feature Roadmap

This document tracks feature ideas and improvements for BiteMe.

## User Features

### [ ] Recipe Rating — Phase 2 (Community)

- Firebase backend with anonymous auth (no account required)
- One-time opt-in prompt: "Share your ratings to help others discover the best recipes?"
- Users who opt in: upload existing local ratings + future ones
- Users who decline: everything stays local, app works the same
- Display average community rating alongside personal rating
- Rate-limit: 1 rating per recipe per anonymous UID

### [ ] Ingredient Search — Phase 2 ("What Can I Cook?")

- Select multiple ingredients you have on hand
- Show recipes ranked by ingredient coverage
- Lightweight — no persistence needed, just a search UI

### [ ] Meal Planning + Aggregated Shopping List

- Pick recipes for the week on a planner view
- Auto-generate combined shopping list with quantities merged across recipes
- Connects recipes → shopping list in a meaningful weekly workflow

### [ ] Unit System Toggle (Metric / Imperial)

- Convert quantities in ingredient lists (g ↔ oz, ml ↔ fl oz, °C ↔ °F)
- Store preference in IndexedDB, default based on locale
- **On hold**: low demand, and g→cups conversion requires ingredient density tables

### [ ] SEO & Social Sharing

- [ ] JSON-LD structured data for Google recipe rich results

---

## Completed

- **Recipe Parser/Compiler** — Rust parser: MD → JSON, runs locally
- **Recipe Linter** — Validates structure, fields, ingredient format
- **Versioning/Caching** — Manifest-based cache with offline fallback
- **Service Worker Updates** — Toast notification on homepage when app code changes
- **Ingredient Categories** — 4 categories (Fresh, Fridge, Pantry, Spices), validated by parser
- **Favorites** — Heart icon, IndexedDB, filter view, persisted state
- **What's New** — Standalone changelog page with timeline layout, notification dot on drawer, accessible from side drawer
- **Shopping List** — Add ingredients from recipe, grouped list, check off in store, TTL cleanup
- **Screen Wake Lock** — Keeps screen awake in cooking mode
- **Recipe Author & Date** — Optional frontmatter fields, displayed on detail page
- **Adjustable Servings** — Structured quantity parsing, +/- controls, smart rounding, no-scale support
- **Cooking Time Tracking** — Session tracking, elapsed time on completion, history on detail page
- **Share Recipe** — Web Share API on mobile, copy-to-clipboard fallback
- **Recipe Notes & Serving Suggestions** — Optional markdown sections, shown in detail and cooking mode
- **Cooking Notes** — Free-text notes on completion page, auto-saved per recipe, displayed/editable on detail page
- **Completion Page** — Bon appétit animation, cooking time display
- **Progress Bar** — Gradient bar in cooking mode showing step progress
- **Ingredient Checkbox Flow** — Clean separation: overview = prep, cooking mode = action
- **Per-Recipe OG Tags** — Static HTML files with Open Graph + Twitter Card meta tags for rich link previews
- **CI/CD Pipeline** — GitHub Actions: lint on PR, parse + auto-commit on merge, issue template for recipe submissions
- **Tag & Rating Filtering** — Filter panel with tag and rating dropdowns, live result count, clickable tags on cards, URL param support
- **Cooking Timers** — Countdown timer in cooking mode with audio alert and vibration, durations parsed from step text by Rust parser, adjustable before starting, auto screen wake lock
- **Recipe Rating (Phase 1)** — Local star ratings (1–5), post-cooking banner prompt, displayed on cards and detail page, editable from detail page, IndexedDB storage
- **Ingredient Search (Phase 1)** — Search bar matches ingredient text, relevance-scored results (name > tag/description > ingredient)
- **Side Drawer (Hamburger Menu)** — Navigation drawer on home page, houses What's New and footer links, notification dot aggregation
- **Cooking Log** — Dedicated page with stats (recipes cooked, sessions, total time, week streak), most-made recipes, and monthly timeline of all completed cooks
- **How It Works** — Feature guide page with real UI mockups, 8 walkthrough sections, deep-linkable anchors, first-visit nudge on home page

---

## Principles

- Local-first — IndexedDB for user data, optional backend sync later
- Open-source recipes via PR + automated validation
- Simple, maintainable solutions that scale to 100–500 recipes
