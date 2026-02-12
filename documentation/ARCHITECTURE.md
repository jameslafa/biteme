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
      { "id": 1, "text": "2 tomatoes, diced" },
      { "id": 2, "text": "1 onion, diced" }
    ],
    "Pantry": [
      { "id": 3, "text": "1 cup rice" }
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
- No structured data (quantity, unit, name) - deferred for later
- No normalization or aggregation across recipes

**Future Considerations:**
- Structured ingredients (quantity, unit, canonical name) when needed
- For now, keep it simple with text + ID

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
- Recipe data (`recipes.json`, `recipes-manifest.json`) bypasses the service worker cache entirely

**Why not service worker for recipes:**
- Recipes change independently of app code
- Manifest version check is lightweight and gives precise control
- Service worker handles app shell (HTML, CSS, JS, icons) — different update cadence

**Service worker update detection:**
- Separate concern from recipe freshness
- Toast notification on homepage when new SW is installed
- Only on homepage to avoid interrupting cooking or other flows

## Progressive Enhancement

**Decision:** Build features that work today but plan for future enhancements

**Examples:**
- Favorites work locally → sync with backend later
- Personal ratings → community ratings when backend added
- Static recipes → user-submitted recipes when backend ready

This allows rapid development while keeping future scalability options open.
