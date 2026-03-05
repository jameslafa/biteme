# Architecture Decisions

This document captures key technical decisions for the BiteMe project. It is intended as session context — read it to understand how the app is structured and why key choices were made.

---

## Recipe ID Strategy

**Decision:** Explicit slug IDs in markdown frontmatter (e.g. `thai-green-curry`)

**Rationale:** Stable across renames, human-readable in URLs and discussions, easy to validate for uniqueness. UUID rejected for poor readability.

**Stability guarantee:** ID never changes once set. Recipe name, filename, and ingredient order can all change without breaking favorites, notes, or ratings.

---

## Ingredient ID Strategy

**Decision:** Incremental integers per recipe (1, 2, 3…)

**Rationale:** Simple and predictable. The shopping list stores `recipe_id + ingredient_id` pairs and looks up display text from recipe data — no text parsing or matching needed.

**Trade-off:** Changing ingredient order changes IDs, which is acceptable for the simplicity gained.

---

## Canonical Ingredient Vocabulary

**Decision:** Controlled vocabulary (`docs/ingredients.json`) mapping ingredient names to canonical singular forms, applied by the Rust parser at build time.

**Rationale:** Shopping list merging needs a stable key to match the same ingredient across recipes. Free-form text matching is fragile; explicit bracket-tagging by recipe authors is unambiguous.

**How it works:**
- Authors tag ingredient names with brackets: `2 cloves [garlic], minced`
- The parser extracts the bracket text, normalises to a singular canonical, and stores `canonical` + `preparation` as separate fields on each ingredient
- Step cross-references use `{canonical}` syntax and match exactly against the canonical field — no fuzzy matching
- Each ingredient belongs to a section (Fresh, Fridge, Pantry, Condiments, Spices) and has an optional plural form, both defined in the vocabulary file
- The linter rejects missing or unknown canonical tags

---

## Data Storage

**Decision:** IndexedDB for all local user data (favorites, notes, ratings, settings, cooking history)

**Why not localStorage:** 5–10MB size cap and no indexing make it unsuitable. IndexedDB is async, quota-managed, and can sync with a backend later.

---

## Future Backend Sync

**Decision:** Design data structures for eventual cloud sync from the start — timestamps, soft deletes, user/device IDs — without requiring a backend to work.

All user data is local-first. Sync is additive, not required.

---

## Recipe Parser (Rust)

**Decision:** Rust CLI that compiles markdown recipe files into `docs/recipes.json`

**Responsibilities:** Parse and validate recipe markdown, check for duplicate IDs, assign ingredient IDs and sections, generate per-recipe OG HTML, run in GitHub Actions on PR.

**Why Rust:** Fast, strongly typed validation, easy to run in CI, cross-platform.

---

## No Backend (Initial)

**Decision:** Static site with client-side JavaScript only

**Rationale:** Simple deployment (GitHub Pages), no server costs, easy for contributors to test locally. Backend can be added later without a rewrite.

**Trade-offs:** No community ratings or cross-device sync initially. Recipes are bundled with the app.

---

## Recipe Caching & Freshness

**Decision:** Three-layer caching (in-memory → localStorage → network) with manifest-based invalidation

**How it works:**
- A lightweight manifest file carries a version; recipe data is only re-fetched when the version changes
- Checked on page load and on app resume (`visibilitychange`)
- Pull-to-refresh forces a network fetch regardless of version
- Recipe data bypasses the service worker cache — the SW handles the app shell (HTML, CSS, JS) on a different cadence

---

## Screen Wake Lock

**Decision:** User-toggled wake lock in cooking mode, auto-enabled when a timer starts

**Implementation:** Wake Lock API on Android/Chrome; a silent looping video on iOS (the only reliable way to prevent screen sleep without disrupting audio routing). Re-acquires automatically on tab focus.

---

## Cooking Timer

**Decision:** In-memory countdown timer with durations parsed at build time by the Rust parser

**How it works:**
- The parser extracts time durations from step text and stores them as structured data (seconds + display label)
- In cooking mode, recognised durations appear as tappable badges that pre-fill the timer
- One timer at a time, never auto-starts, persists across step navigation
- Audio alert + vibration on completion
- iOS requires audio to be unlocked via a user gesture before it can play — handled on first timer start

---

## What's New / Changelog

**Decision:** Client-side changelog with incremental integer IDs and IndexedDB tracking

**How it works:**
- `docs/js/changelog.js` contains an array of entries (id, date, text), newest first
- The highest seen ID is stored in IndexedDB; a notification dot appears on the drawer bell when new entries exist
- Visiting the page marks all entries as seen
- IDs are plain integers — simple to compare, no coupling to app version

---

## Per-Recipe OG HTML

**Decision:** Static HTML files generated by the Rust parser for each recipe, used for social sharing previews

**Problem:** Crawlers (Telegram, Slack, iMessage) can't execute JavaScript, so they can't read recipe data from the SPA — shared links showed generic app info.

**Solution:** The parser generates `docs/r/{recipe-id}.html` per recipe with Open Graph and Twitter Card meta tags, plus a JS redirect to the full recipe page. Crawlers see the tags; users get redirected instantly.

**Why JS redirect (not `<meta>` refresh or canonical):** Some crawlers follow meta-refresh and canonical links, reading OG tags from the destination (the SPA) instead. JS redirects are invisible to crawlers.

---

## How It Works (Feature Guide)

**Decision:** Static feature guide page with live UI mockups using the real app's CSS classes

**How it works:**
- Feature sections are defined in `how-it-works.js`, each with a description and mockup HTML
- Mockups use the same CSS classes as the real app — they always reflect current styling with zero maintenance cost
- On first visit, a dismissible nudge banner on the home page links to this page

---

## Dark Mode / Theme System

**Decision:** JS-driven `data-theme` attribute on `<html>`, always resolved at load time. CSS uses only `[data-theme="dark"]` selectors — no `@media (prefers-color-scheme)` in stylesheets.

**How it works:**
- User picks Light / Auto / Dark in Settings; preference stored in `localStorage`
- An inline `<script>` in `<head>` (before any CSS link) reads the preference, resolves "auto" via `matchMedia`, and sets `data-theme` synchronously — preventing any flash of wrong theme on load
- In Auto mode, a `matchMedia` change listener updates the attribute live if the OS theme changes
- All colours are CSS custom properties; the dark palette overrides them under `[data-theme="dark"]`
- Each CSS file has a dark mode overrides section at the bottom

**Why JS-resolved, not pure CSS `@media`:** `prefers-color-scheme` alone can't express a user-controlled Light/Dark/Auto choice. Once JS is resolving the theme anyway, `@media` blocks in CSS are redundant and double the maintenance cost.

---

## Settings Page

**Decision:** Dedicated settings page (not inline in the drawer)

**How it works:** Toggle-based UI backed by `getSetting()` / `setSetting()` from `db.js`. Covers dietary filters (vegan, gluten-free), untested recipe visibility, and theme preference. All filters are applied on home page load.

**Why separate:** Settings will grow; a dedicated page is consistent with other sub-pages (Cooking Log, What's New) and avoids cluttering the drawer.

---

## SVG Icon System

**Decision:** All icons centralised in `docs/js/icons.js`

**How it works:**
- An `ICONS` object keyed by name; an `icon(name, size, cls)` helper builds complete SVG strings for use in JS-generated HTML
- Static HTML uses `<svg data-icon="name">` shells that are hydrated on `DOMContentLoaded`
- Some icons have non-default viewBox or use fill instead of stroke — handled via per-icon metadata

**Why not an SVG sprite:** Icons appear both in static HTML and in JS string interpolation; a sprite only serves `<use>` references.

---

## Shopping List Merged View

**Decision:** Two-view toggle (Merged / By recipe), Merged as default

**Rationale:** When shopping, users want one line per ingredient across all recipes. By-recipe view is useful for managing or removing items.

**How it works:**
- Items are grouped by canonical ingredient key, then sub-grouped by unit; amounts are summed within each sub-group
- When the same canonical appears with different units across recipes, they render on one line with amounts listed separately
- Checkbox state per group reflects all source items: checked if all are checked, indeterminate if some are
- View preference is persisted in localStorage

---

## Meal Plan

**Decision:** IDF-weighted greedy recipe selection, client-side, reusing the recommendation engine

**How it works:**
- Given an optional seed recipe and a target count, the algorithm greedily picks recipes that maximise shared ingredient overlap (same IDF scoring as recommendations)
- Two modes: Planning (interactive form, live suggestions) and Active (saved plan with cooked-state tracking)
- The finalised plan is saved to localStorage; active mode is entered when the user confirms
- Cooked state per recipe is three-valued: auto-detected from cooking sessions, manually overridden by the user, or unset
- The home page shows a progress banner when an active plan has uncooked recipes

---

## Chip Filters

**Decision:** Two always-visible chip rows (meal type + cuisine) replacing a filter popover

**Bidirectionality:** Selecting one dimension narrows the other — chips that would produce zero results are hidden. If the active filter becomes incompatible after narrowing, it auto-clears.

**Chip overflow:** Only the top chips by recipe count show by default; an active chip is always promoted into view. "+N more" permanently expands the row.

**Taxonomy colours:** Meal type and cuisine chips use distinct colour families, applied consistently via CSS custom properties across chips, recipe card tags, and the recipe detail page.

**URL persistence:** Active filters are written to the URL via `history.replaceState` so filtered views are bookmarkable and shareable.

---

## Surprise Me

**Decision:** Shuffle button that picks a random recipe from the current filtered set using a tiered priority algorithm

**Algorithm:** Prioritises uncooked recipes not in recent history, then any unrecent recipe, then the full filtered set as a fallback. History is a rolling window of recent picks in localStorage — ephemeral and self-managing.

---

## Recipe Recommendation Engine

**Decision:** IDF-weighted ingredient similarity with category weighting, computed client-side on demand

**Algorithm:**
1. Build ingredient maps per recipe, excluding the Spices category and common pantry staples (ubiquitous items that carry no useful flavour signal)
2. Compute IDF per ingredient: rare shared ingredients score higher than common ones
3. Score candidates by summing `IDF × categoryWeight` for each shared ingredient; perishable ingredients (Fresh, Fridge) are weighted higher than shelf-stable ones (Pantry) because they define what a dish actually is
4. Return the top results with the list of shared ingredients

**Why IDF over raw count:** Naïve counting is dominated by garlic and onion. IDF surfaces meaningful flavour connections — two recipes sharing an unusual ingredient score far higher.

**Corpus filtering:** Respects dietary and untested-recipe settings so only recipes the user can see are recommended.

---

## Progressive Enhancement

**Decision:** Local-first features today, designed for backend sync later

Favorites, ratings, notes, and cooking history all work entirely offline. The data model is designed so sync can be added without breaking anything. No feature requires a backend to function.
