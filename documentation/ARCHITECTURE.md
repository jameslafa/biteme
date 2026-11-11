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

**Decision:** Three-layer caching (in-memory → localStorage → network) with manifest-based invalidation. Pages never wait on the network when a cached copy exists — a slow kitchen connection must not delay rendering.

**How it works:**
- Recipe data is stale-while-revalidate: pages render from localStorage immediately and the manifest is checked in the background; the home page re-renders if newer recipes arrive
- A lightweight manifest file carries a version; recipe data is only re-fetched when the version changes
- Checked on page load and on app resume (`visibilitychange`); concurrent checks share one request
- A recipe ID missing from stored data (e.g. a freshly shared link) waits for the update check before showing "not found"
- Only the very first load, with nothing stored, waits for the network
- Pull-to-refresh forces a network fetch regardless of version
- Recipe data bypasses the service worker cache — the SW handles the app shell (HTML, CSS, JS) on a different cadence
- The SW is network-first with a 3 s timeout, falling back to cache. After a timeout it serves cached files immediately for 30 s (still refreshing the cache in the background), so the timeout isn't paid again by each script and data file a page loads
- Every file a page or script needs must be listed in `APP_SHELL` in `docs/sw.js`: each SW version bump deletes the old cache, so an unlisted file is unavailable offline until revisited online. `tests/sw.spec.js` enforces this

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

## Cooking Progress (Resume)

**Decision:** Save the current step and timer to localStorage (`cooking_progress`) on every step change and timer action, and resume from it when cooking mode opens for the same recipe within 6 hours.

**Why:** iOS can reload a backgrounded PWA at any time (e.g. after checking a message mid-cook), which used to lose the step and the timer.

**How it works:**
- Resuming reuses the same cooking session, so the recorded cooking time stays right
- A running timer is stored by its start time, so it keeps counting while the app is closed; if it ran out meanwhile, the timer bar shows "Time's up" until dismissed (sound can't play without a tap on iOS)
- Cooking mode shows "Picked up where you left off · Start over" after a resume; the recipe page's button reads "Resume · step N of M" when a cook is in progress past step 1 (covers iOS relaunching to the home page)
- Finishing clears it; "Start over" clears it and starts a new session
- localStorage, not IndexedDB, because it's read synchronously before the first render and it's transient state, not user data
- "Keep screen on" isn't restored: iOS requires a tap to re-enable it

---

## Per-Recipe OG HTML

**Decision:** Static HTML files generated by the Rust parser for each recipe, used for social sharing previews

**Problem:** Crawlers (Telegram, Slack, iMessage) can't execute JavaScript, so they can't read recipe data from the SPA — shared links showed generic app info.

**Solution:** The parser generates `docs/r/{recipe-id}.html` per recipe with Open Graph and Twitter Card meta tags, plus a JS redirect to the full recipe page. Crawlers see the tags; users get redirected instantly.

**Why JS redirect (not `<meta>` refresh or canonical):** Some crawlers follow meta-refresh and canonical links, reading OG tags from the destination (the SPA) instead. JS redirects are invisible to crawlers.

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

**How it works:** Toggle-based UI backed by `getSetting()` / `setSetting()` from `db.js`. Covers untested recipe visibility and theme preference.

**Why separate:** Settings will grow; a dedicated page is consistent with other sub-pages (Cooking Log, Meal Plan) and avoids cluttering the drawer.

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

## Cooking For (Friends & Diet Filtering)

**Decision:** Pick who you're cooking for — saved friends (name, diets, ingredients to avoid) or plain diets — from a bottom sheet opened by an icon in the search bar. Selection lives in the URL (`?for=<friend ids>&diet=…`), not a persistent setting.

**Why:** Diet filtering is per occasion ("Luna is coming tonight"). A persistent setting hidden in Settings silently hid recipes long after the occasion. URL state survives navigation (recipe page and back) but resets when the app is reopened. When anything is selected, a summary line on the home page shows it with a one-tap clear, so a filter is never invisible. Nothing is added to the home page when nothing is selected.

**How it works:**
- A filter is `{ diets, avoid }`. `currentFilter()` in `app.js` combines directly picked diets with the selected friends' diets, and the union of their avoided ingredients — a recipe must work for everyone
- `matchesFilter()` in `recipes.js` is the single matching rule: every diet satisfied (vegan counts as vegetarian, so recipes are never tagged both — the linter rejects it) and no avoided canonical ingredient
- In the sheet, a checkbox per friend combines several; the arrow next to each name selects only that friend and closes the sheet in one tap (the usual case: cooking for one person)
- Avoided ingredients hide recipes (right for allergies); they're picked from `ingredients.json` canonicals so matching is exact
- `viewRecipe()` carries the derived filter to the recipe page via `filterQuery()` (`&diet=…&avoid=…`); similar recipes respect it, and a gluten-free diet switches on the recipe's gluten-free version
- Friends are stored locally in IndexedDB with sync-ready fields (random ID, `updated_at`, soft-delete `deleted_at`) for a future backend
- The meal plan ignores the filter — it plans for the user's own week

---

## Gluten-Free Version

**Decision:** Gluten knowledge lives per ingredient in `docs/ingredients.json` (`contains` + optional swap, or `check`), not per recipe. The parser copies it onto each ingredient in `recipes.json` and rejects a gluten-free recipe using a `contains` ingredient with no swap.

**Why per ingredient:** Written once, applies to every recipe, and new recipes are checked automatically. "Gluten-free" on a recipe means "gluten-free *with these swaps*" — the app has to say which.

**How it works:**
- Recipes tagged gluten-free with something to swap or check show a "Gluten-free version" toggle on the recipe page. It's on when the gluten-free diet is active, and toggling it adds/removes `gluten-free` from the URL's diets — so it carries into cooking mode and back
- When on, flagged ingredients show a note ("Use tamari…", "Check the label…") on the recipe page and in cooking mode
- Shopping items added while it's on are stored with `gluten_free: true`; the list shows the swap and keeps them separate from the regular version
- Only `contains` and `check` exist; pure spices are deliberately unflagged to avoid warning fatigue

---

## Recipe Recommendation Engine

**Decision:** IDF-weighted ingredient similarity with category weighting, computed client-side on demand

**Algorithm:**
1. Build ingredient maps per recipe, excluding the Spices category and common pantry staples (ubiquitous items that carry no useful flavour signal)
2. Compute IDF per ingredient: rare shared ingredients score higher than common ones
3. Score candidates by summing `IDF × categoryWeight` for each shared ingredient; perishable ingredients (Fresh, Fridge) are weighted higher than shelf-stable ones (Pantry) because they define what a dish actually is
4. Return the top results with the list of shared ingredients

**Why IDF over raw count:** Naïve counting is dominated by garlic and onion. IDF surfaces meaningful flavour connections — two recipes sharing an unusual ingredient score far higher.

**Corpus filtering:** Untested recipes are excluded per the user setting. Active diets filter which recipes are *suggested*, but IDF is computed over the whole corpus — in a small diet-filtered set, ingredients shared by every recipe would get IDF 0 and nothing would match.

---

## Progressive Enhancement

**Decision:** Local-first features today, designed for backend sync later

Favorites, ratings, notes, and cooking history all work entirely offline. The data model is designed so sync can be added without breaking anything. No feature requires a backend to function.
