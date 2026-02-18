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

## Progressive Enhancement

**Decision:** Build features that work today but plan for future enhancements

**Examples:**
- Favorites work locally → sync with backend later
- Personal ratings → community ratings when backend added
- Static recipes → user-submitted recipes when backend ready

This allows rapid development while keeping future scalability options open.
