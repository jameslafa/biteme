# BiteMe - Feature Roadmap

This document tracks feature ideas and improvements for BiteMe.

## Infrastructure & Build System

### [ ] CI/CD Pipeline

- GitHub Actions: run parser + linter on PRs
- Block merging if recipe format is invalid
- Run parser on push to main

## User Features

### [ ] Recipe Rating

Two-phase rollout: local-first, community later.

**Phase 1 — Local ratings (now)**

- Banner at top of recipe list on next app visit after cooking: "How was [recipe]?"
- Quick star rating (1–5) + link to view/edit cooking notes
- Dismiss (x) or "Don't ask me again" option
- Only shown once per cook session
- Stored in IndexedDB, personal and private
- Display personal rating on recipe cards and detail page

**Phase 2 — Community ratings (later, when user base justifies it)**

- Firebase backend with anonymous auth (no account required)
- One-time opt-in prompt: "Share your ratings to help others discover the best recipes?"
- Users who opt in: upload existing local ratings + future ones
- Users who decline: everything stays local, app works the same
- Display average community rating alongside personal rating
- Rate-limit: 1 rating per recipe per anonymous UID

### [ ] First-Time User Onboarding

- Interactive walkthrough for new users explaining key features
- Step-by-step tour with tooltips or overlay
- Skippable, can be replayed from settings/help

### [ ] My Pantry/Spices Inventory

- Store ingredients/spices you have at home
- Pre-check owned items when viewing a recipe
- Store locally in IndexedDB

### [ ] Unit System Toggle (Metric / Imperial)

- Convert quantities in ingredient lists (g ↔ oz, ml ↔ fl oz, °C ↔ °F)
- Store preference in IndexedDB, default based on locale
- **On hold**: low demand, and g→cups conversion requires ingredient density tables

### [ ] Cooking Timers with Alerts

- Countdown timers for steps that require timing
- Browser notifications/audio alerts when time is up

### [ ] Post-Cooking Complexity Rating

- Rate complexity after cooking (Easy / Medium / Hard)
- Display on recipe cards to help pick recipes by effort

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
- **What's New** — Bell icon with notification dot, changelog bottom sheet
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

---

## Principles

- Local-first — IndexedDB for user data, optional backend sync later
- Open-source recipes via PR + automated validation
- Simple, maintainable solutions that scale to 100–500 recipes
