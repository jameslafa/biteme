# Architecture Decisions

This document captures key technical decisions made for the BiteMe project.

## Recipe ID Strategy

**Decision:** Use explicit ID field in markdown frontmatter

**Format:** Lowercase slugs with dashes (e.g., `thai-green-curry`)

**Rationale:**
- Stable across recipe renames and file renames
- Human-readable for debugging and discussions
- Explicit declaration prevents ambiguity
- Easy to validate for uniqueness

**Implementation:**
```markdown
---
id: pad-thai
name: Pad Thai
---
```

**Alternative considered:** UUID - Rejected due to poor readability and ugly URLs

**Stability guarantee:**
- ID never changes once set
- Recipe name can be updated without breaking references
- Filename can be changed without breaking references
- Favorites, notes, and ratings remain linked to ID

## Ingredient ID Strategy

**Decision:** Incremental IDs per recipe (1, 2, 3...)

**Rationale:**
- Simple and predictable
- Easy to generate in Rust parser
- Enables matching in shopping list
- Allows showing shopping list state on recipe page

**Implementation:**
- Rust parser assigns IDs sequentially per recipe
- IDs start at 1 for each recipe
- Each ingredient gets a unique ID within its recipe

**Structure in JSON:**
```javascript
{
  "ingredients": {
    "Fresh": [
      { "id": 1, "text": "2 cloves garlic, minced", "canonical": "garlic", "preparation": "minced",
        "quantity": { "amount": 2, "unit": "cloves", "item": "garlic" } },
      { "id": 2, "text": "1 onion, diced", "canonical": "onion", "preparation": "diced",
        "quantity": { "amount": 1, "item": "onion" } }
    ]
  }
}
```

**Shopping List Reference:**
- Stores `recipe_id + ingredient_id` pair
- Looks up ingredient text from recipe for display
- No text parsing or matching needed

**Trade-offs:**
- Changing ingredient order changes IDs (acceptable for simplicity)

## Canonical Ingredient Vocabulary

**Decision:** Controlled vocabulary in `docs/canonical.json` mapping ingredient names to their canonical singular forms, loaded by the Rust parser at build time.

**Rationale:**
- Shopping list merging requires a stable key to match the same ingredient across recipes (e.g. `2 cloves garlic, minced` and `3 cloves garlic, crushed` both → canonical `"garlic"`)
- Free-form text matching is fragile; explicit author tagging with `[brackets]` is unambiguous
- Plural/singular normalisation (eggs → egg) handled at parse time via the vocabulary

**Implementation:**
- Authors tag ingredient names in markdown: `2 cloves [garlic], minced`
- The parser extracts the bracket text, normalises to singular canonical via `docs/canonical.json`, and stores `canonical` + `preparation` as separate fields on each ingredient
- `quantity.item` is set to the bracket text as the author wrote it (preserving natural plural/singular)
- Step refs `{canonical}` match against the singular `canonical` field exactly — no fuzzy matching

**`docs/canonical.json` structure:**
```json
{
  "ingredients": { "tomato": "tomatoes", "garlic": null, ... },
  "units": { "clove": "cloves", "stick": "sticks", "stalk": "stalks", ... }
}
```

Words in `units` belong before the bracket (`2 cloves [garlic]`), not inside it (`[garlic cloves]`). The linter errors on missing or unknown canonical tags.

## Data Storage

**Decision:** IndexedDB for local storage with future backend sync support

**Why IndexedDB:**
- No backend required for MVP
- Works offline
- Sufficient for local-only features (favorites, notes, ratings)
- Easy to sync with Firebase/Supabase later

**Alternative considered:** LocalStorage - Rejected due to 5-10MB limit and lack of indexing

## Future Backend Sync

**Decision:** Design data structures for eventual Firebase/Supabase sync

**Key principles:**
- Use timestamps for conflict resolution
- Track sync status with `synced_at` field
- Use soft deletes (flags instead of hard deletes)
- Include `user_id` field (null for local-only)
- Generate unique `device_id` for multi-device support

**Sync strategy:**
- Two-way sync: push local changes, pull remote changes
- Conflict resolution: newest timestamp wins (`updated_at`)
- Track sync state: `synced_at` timestamp (null = needs sync)
- Incremental sync: only sync changed records

## Recipe Parser (Rust)

**Decision:** Build Rust CLI tool to parse markdown recipes into JSON

**Responsibilities:**
- Parse recipe markdown files
- Validate recipe structure and required fields
- Check for duplicate IDs
- Generate `recipes.json` for the app
- Run in GitHub Actions on PR

**Why Rust:**
- Fast parsing for large recipe collections
- Strong type safety for validation
- Easy to run in GitHub Actions
- Cross-platform CLI tool

## No Backend (Initial)

**Decision:** Static site with client-side JavaScript only

**Rationale:**
- Simple deployment (GitHub Pages, Netlify, Vercel)
- No server costs
- Fast and reliable
- Easy for contributors to test locally
- Backend can be added later without rewriting everything

**Trade-offs:**
- No community ratings (only personal)
- No cross-device sync initially
- Recipes must be bundled with the app

## Recipe Caching & Freshness

**Decision:** Three-layer caching with automatic refresh on app resume

**Layers:**
1. **In-memory cache** (`recipesCache` variable) — instant access during a session
2. **localStorage** — persists across page reloads, keyed by manifest version
3. **Network** — fetches fresh data when manifest version changes

**Freshness strategy:**
- On page load: check `recipes-manifest.json` version against localStorage, fetch fresh if different
- On app resume (`visibilitychange`): re-check manifest, clear in-memory cache and re-render if stale
- On pull-to-refresh (swipe down from top): force-fetch both `recipes-manifest.json` and `recipes.json` with `cache: 'no-cache'`, bypassing the version check entirely — ensures the user always gets the latest recipes on demand
- Recipe data (`recipes.json`, `recipes-manifest.json`) bypasses the service worker cache entirely

**Why not service worker for recipes:**
- Recipes change independently of app code
- Manifest version check is lightweight and gives precise control
- Service worker handles app shell (HTML, CSS, JS, icons) — different update cadence

**Service worker update detection:**
- Separate concern from recipe freshness
- Toast notification on homepage when new SW is installed
- Only on homepage to avoid interrupting cooking or other flows

## Screen Wake Lock

**Decision:** User-toggled wake lock in cooking mode, auto-enabled when timer starts

**Implementation:**
- Toggle button in cooking header (lightbulb icon) with active/inactive visual states
- Wake Lock API (`navigator.wakeLock.request('screen')`) for Android/desktop Chrome
- Silent looping video (`silent.mp4`) for iOS — video playback keeps the screen awake without interfering with audio routing (e.g. AirPods)
- Re-acquires on `visibilitychange` when returning to the tab
- Auto-enabled when a cooking timer starts (screen must stay on for the alarm)

## Cooking Timer

**Decision:** In-memory countdown timer with durations parsed at build time by the Rust parser

**Duration parsing:**
- Rust regex extracts durations from step text (e.g. "cook for 5 minutes", "simmer for 25 to 30 minutes")
- Supports ranges with `-`, `to`, and en-dash `–` — uses the higher value
- Stored in `recipes.json` as `step.durations[]` with `seconds` and `text` fields
- Step text durations are wrapped as clickable time badges in cooking mode

**Timer behavior:**
- One timer at a time, persists across step navigation
- Never auto-starts — user presses play manually
- Pre-filled from the first duration in the current step, adjustable with ±1min/±5sec arrows
- Toggle button in header (clock icon) to show/hide timer bar on any step
- Audio alert (MP3) + vibration on completion, then auto-resets to suggestion

**iOS audio unlock:**
- `<audio>` element created on first Start press (user gesture)
- Muted play/pause cycle unlocks the element for later unmuted playback
- iOS ignores `volume=0` but respects `muted` property

**Flicker prevention:**
- During countdown ticks, only the time text is updated (not the full innerHTML)
- Prevents DOM rebuild that causes button flash on every second

## What's New / Changelog

**Decision:** Client-side changelog with incremental IDs and IndexedDB tracking

**How it works:**
- `changelog.js` contains a simple array of entries, each with an incremental `id`, `date`, and `text`
- On first visit, `lastSeenChangelogId` is set to the latest ID (no notification dot)
- On subsequent visits, if the latest ID exceeds the stored value, a dot appears on the bell icon in the drawer
- The drawer "What's New" link navigates to `whats-new.html`, a standalone page that renders entries in a timeline layout (shared with Cooking Log) grouped by month
- Loading the page marks all entries as seen by storing the latest ID

**Why incremental IDs (not semver or dates):**
- Simple integer comparison to detect unseen entries
- No coupling to app version — changelog entries are independent of releases
- Easy to add entries: just prepend with `id: previous + 1`

**Why a separate `changelog.js` file:**
- Cached by service worker alongside app shell
- Easy to edit without touching app logic
- Clear separation of content from code

## Per-Recipe OG HTML

**Decision:** Generate static HTML files with Open Graph and Twitter Card meta tags for each recipe

**Problem:** Sharing a recipe link on Telegram/Slack/iMessage showed generic app info because crawlers can't execute JavaScript to read recipe data from the SPA.

**Solution:** The Rust parser generates `docs/r/{recipe-id}.html` for each recipe alongside `recipes.json`. Each file contains:
- OG tags (`og:title`, `og:description`, `og:image`, `og:url`, `og:site_name`)
- Twitter Card tags (`twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`)
- `<meta name="description">` for basic SEO
- Body text with recipe name and description (required by some crawlers)
- JavaScript redirect to `/recipe.html?id={recipe-id}`

**Why JS redirect, not meta refresh or canonical:**
Telegram's crawler follows both `<meta http-equiv="refresh">` and `<link rel="canonical">`, reading OG tags from the destination page instead of the current one. Since the SPA recipe page has no OG tags, Telegram would show no preview. A JS redirect is invisible to crawlers (they don't execute JavaScript) but works instantly for real users.

**Why static files, not server-side rendering:**
- Consistent with the no-backend architecture
- No new dependencies — just string formatting in Rust
- Crawlers read the meta tags; real users get redirected via JS

**Share URL format:** `https://biteme.ovh/r/{recipe-id}.html`

## How It Works (Feature Guide)

**Decision:** Static feature guide page with real UI mockups rendered from actual CSS classes

**How it works:**
- `how-it-works.js` defines 8 feature sections, each with an `id`, `title`, `description`, and mockup HTML (single or multiple per section)
- Mockup HTML uses the same CSS classes as the real app (`.recipe-card`, `.timer-bar`, `.star-rating`, etc.)
- The page imports `style.css`, `recipe.css`, `cooking.css`, `shopping.css`, `completion.css`, and `cooking-log.css` so mockups render with real styles
- `.feature-mockup` container has `pointer-events: none` to prevent interaction
- Each section has a deep-linkable anchor ID (e.g. `#timer`, `#cook`)
- On load, sets `hasSeenHowItWorks` in IndexedDB settings

**First-visit nudge:**
- On the home page, `checkFirstVisitNudge()` checks `hasSeenHowItWorks` setting
- If null (first visit), a dismissible banner links to the How It Works page
- Dismissing the nudge or visiting the page sets the flag

**Why real CSS classes for mockups:**
- Mockups stay visually correct when styles change — no separate screenshots or static images to maintain
- Zero maintenance cost as the design evolves

## Settings Page

**Decision:** Dedicated settings page accessible from the side drawer

**How it works:**
- `settings.html` with a simple toggle-based UI
- Uses `getSetting()` / `setSetting()` from `db.js` for persistent preferences
- Dietary filters: "Vegan only" and "Gluten-free only" toggles filter recipes by their `diet` field. Stored as `dietaryFilters` array in IndexedDB settings. Applied on home page load alongside other filters.
- "Show untested recipes" toggle controls visibility of recipes marked with `tested: false` in frontmatter
- Toggle state is read on home page load to filter the recipe list

**Why a separate page (not inline in drawer):**
- Clean separation — settings will grow over time
- Consistent with other sub-pages (Cooking Log, What's New)
- Avoids cluttering the drawer with controls

## SVG Icon System

**Decision:** Centralise all icons in a single `icons.js` file rather than duplicating inline SVGs across HTML and JS files.

**How it works:**
- `docs/js/icons.js` exports an `ICONS` object keyed by name; values are either a plain inner-SVG string (standard stroke icons) or a metadata object `{inner, viewBox?, solid?}` for icons with non-default viewBox or fill-based rendering
- `icon(name, size=24, cls='')` helper builds a complete `<svg>` string — used in JS-generated HTML (e.g. recipe cards, timer controls)
- Static HTML uses `<svg data-icon="name" …></svg>` shells; a `DOMContentLoaded` listener in `icons.js` injects `innerHTML` and updates `viewBox` for special icons

**Special icon categories:**
- *Special viewBox* (`timer-clock`, `bulb`): stored as `{viewBox, inner}` — injector overrides the default `viewBox="0 0 24 24"` on the shell element
- *Solid/fill icons* (`tri-up`, `tri-down`, `play`, `pause`, `stop`): stored as `{solid: true, inner}` — no `fill="none"` or stroke attributes added to the wrapper

**Why `icons.js` over an SVG sprite file:**
- Icons are used both in static HTML (via `data-icon`) and in JS-generated HTML strings (via `icon()`); a sprite file only serves `<use>` references, not string interpolation
- Single source of truth — one definition covers both usage patterns

## Shopping List Merged View

**Decision:** Two-view toggle (Merged / By recipe) on the shopping list, with Merged as the default.

**Rationale:**
- When shopping, users want a flat list — one line per ingredient, not one per recipe
- By-recipe view is useful when managing the list (removing a recipe's items)
- `canonical` field on every ingredient provides the stable key needed for cross-recipe grouping

**How it works:**
- `resolveAllItems()` loads all DB items, looks up the recipe and ingredient for each, and computes the serving ratio and scaled text
- `buildMergedGroups()` groups by `ingredient.canonical` (falling back to `ingredient.text` for untagged ingredients), then sub-groups by unit. Items in the same canonical+unit sub-group have their amounts summed with `smartRound`
- Each merged group renders as a single row with summed amount and the item name
- Checked state is computed per group: all sources checked → checked; some → indeterminate (partial); none → unchecked. A checkbox click writes to all source DB items via `setShoppingListItemChecked`
- View preference persisted in `localStorage('shopping_view')`; defaults to `'merged'`

**Multi-unit display:**
When the same canonical appears with different units across recipes (e.g. `1 tin` + `250 g` lentils), they stay as separate unit sub-groups and are rendered as a single line: `lentils (1 tin + 250 g)`.

**Unitless fallback:**
If a single-source sub-group has no unit (likely a parser data quality issue where the unit was lost), the original `ingredient.text` is used as the display label rather than a bare number.

## Meal Plan

**Decision:** IDF-weighted greedy set selection, reusing the recommendation engine's ingredient maps and IDF scores. No backend — everything computed client-side on demand.

**Algorithm:**
1. Precompute all C(R,2) pairwise ingredient-overlap scores from the same `ingredientMaps` and `idf` used by the recommendation engine: `pairScore(a,b) = Σ IDF(canonical) × max(weight_a, weight_b)` for each shared canonical
2. Seed selection: if a seed recipe is provided, fix it as the first element and pick the best companion from the pairwise matrix; otherwise pick the highest-scoring pair
3. Greedy extension: add one recipe at a time, choosing the candidate that maximises total pairwise score with the current set

**Ingredient list:**
- `getMergedIngredients()` builds a flat list of unique canonicals across all plan recipes, grouped by category, sorted alphabetically within each category, excluding stoplist ingredients
- Each item has `sources[]` — one entry per `(recipeId, ingredientId)` pair across the plan (same canonical may appear in multiple recipes)
- Preparation text is stripped from display (`omitPreparation: true`)
- Per-ingredient cart buttons add/remove all sources for that canonical to/from the shopping list; `in-cart` state is derived from IndexedDB on render

**Seed recipe UI:**
- Native `<select>` with `<optgroup>` sections: a disabled placeholder, "Any recipe", Favourites (up to 5), Last cooked (up to 5, deduped), and "Let me choose…" which reveals a text search input
- `?seed=recipeId` URL param from recipe detail page pre-selects a recipe safely (injects the option if not yet in the select)

**Two-mode state machine:**
- **Planning mode**: the 3-step form is shown; suggestions are generated live as the user picks a seed/N/servings
- **Active mode**: entered when the user clicks "Save this plan"; shows active cards with cooked-state tracking
- `plan_finalized_at` (localStorage timestamp) is the boundary: present → show active mode on load
- `cooked_at` on each plan entry is three-valued: `null` = auto-sync eligible, `number` (timestamp) = cooked, `false` = user explicitly marked as not cooked
- `syncCookedState()` auto-detects recipes completed after `plan_finalized_at` from IndexedDB sessions
- The home page banner (`#meal-plan-banner`) reads `plan_finalized_at` + `meal_plan` from localStorage synchronously on DOMContentLoaded and shows progress when there are uncooked recipes
- Back navigation on all sub-pages uses `history.back()` (with `href="index.html"` as fallback)

**Files:**
- `docs/plan.html` — 3-step UI: seed, N (2–8), servings per recipe; active plan section
- `docs/js/plan.js` — plan algorithm, card rendering, swap panel, ingredient list, active plan mode
- `docs/css/plan.css` — plan-specific styles; ingredient list matches recipe detail page design
- Reuses globals from `recommendations.js` (ingredient maps, IDF, stoplist)

## Surprise Me

**Decision:** A shuffle button that picks a random recipe using a 4-tier algorithm that prioritises variety and discovery.

**Entry points:** search bar button and filter popover button.

**Algorithm (4 tiers, pick highest non-empty tier, random within it):**
1. Not yet cooked AND not in recent history
2. `tested: false` AND not in recent history
3. Not in recent history
4. Entire filtered set (fallback if history blocks everything)

**History:** `localStorage` key `surpriseHistory`, JSON array of up to 10 recipe IDs (rolling window). Ephemeral — fine to lose on cache clear. No manual reset needed.

**Filter integration:**
- Search bar button uses the current active filters (tag, rating, favorites, dietary, search query)
- Popover button commits pending tag/rating to active state before picking (same outcome as clicking Filter then Surprise)
- `filterRecipes()` is called with current state — no special casing needed

## Recipe Recommendation Engine

**Decision:** IDF-weighted ingredient similarity with category weighting and pantry stoplist, computed entirely client-side, on demand.

**Algorithm:**
1. Build a map of canonical ingredient keys per recipe (excluding Spices and stoplist ingredients). Each entry records the ingredient's category (Fresh, Fridge, Pantry).
2. Compute IDF (inverse document frequency) per canonical: `Math.log(N / df)` where N = corpus size and df = number of recipes containing that ingredient. Common ingredients (garlic in 18 of 24 recipes) get low weight; rare shared ones (lemongrass in 2 recipes) get high weight.
3. Score each candidate recipe by summing `IDF × categoryWeight` for every canonical it shares with the target. The weight used is the maximum of the two recipes' category for that ingredient.
4. Return the top N results sorted by score, each with the list of shared canonical names.

**Category weights:**
- Fresh / Fridge: `2` — perishable ingredients define what a dish actually *is*
- Pantry: `1` — shelf-stable items are less identity-defining

**Pantry stoplist:**
Ingredients excluded entirely regardless of IDF score: all oils (pattern `* oil`), all milks (pattern `* milk` and `milk`), water, vegetable stock, plain/self-raising flour, sugar, brown sugar, baking soda, baking powder, maple syrup, salt, butter, vegan butter, margarine. These are pantry staples present in any kitchen — sharing them carries no useful signal.

**Spices category:**
Excluded entirely. Salt, pepper, and spices are present in almost every recipe and would dominate scoring without contributing useful similarity.

**Corpus filtering:**
The corpus respects the user's settings — `showUntestedRecipes` (IndexedDB) and `dietaryFilters` — so recommendations only surface recipes the user can actually see. If the target recipe itself falls outside the corpus (e.g. an untested recipe viewed via direct link when the setting is off), its ingredients are still extracted from the raw data so it can be scored against the visible corpus.

**Why IDF over raw count:**
Naïve shared-ingredient counting is dominated by ubiquitous items. IDF naturally downweights common ingredients and surfaces meaningful flavour connections — two recipes sharing coconut milk + lemongrass score far higher than two sharing garlic + onion.

**Files:**
- `docs/js/recommendations.js` — `buildRecipeIngredientMaps`, `computeIDF`, `getSimilarRecipes` (all global, no module system)
- Loaded on `recipe.html` only, after `db.js` and `recipes.js`

## Progressive Enhancement

**Decision:** Build features that work today but plan for future enhancements

**Examples:**
- Favorites work locally → sync with backend later
- Personal ratings → community ratings when backend added
- Static recipes → user-submitted recipes when backend ready

This allows rapid development while keeping future scalability options open.
