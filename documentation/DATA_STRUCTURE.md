# Data Structures

This document defines the data schemas used in BiteMe for local storage and future backend sync.

## IndexedDB Database

**Database name:** `biteme_db`

**Version:** 6

**Object stores:** favorites, shopping_list, cooking_sessions, settings, cooking_notes, ratings

## Favorites

**Object store:** `favorites`

**Primary key:** `recipe_id`

**Indexes:**
- `created_at` - Sort by date favorited

**Current Schema (v1 - Local Only):**
```typescript
{
  recipe_id: string;   // Primary key (e.g., "thai-green-curry")
  created_at: number;  // Unix timestamp (milliseconds)
}
```

**Example:**
```json
{
  "recipe_id": "pad-thai",
  "created_at": 1707567890123
}
```

**Notes:**
- Uses hard delete (record removed when unfavorited)
- Simplified for local-only use
- Will be extended with sync fields when backend is added (see Future Schema below)

**Future Schema (v3 - With Sync):**
```typescript
{
  recipe_id: string;
  user_id: string | null;
  favorited: boolean;       // For soft delete
  created_at: number;
  updated_at: number;
  synced_at: number | null;
  device_id: string;
}
```

## Shopping List

**Object store:** `shopping_list`

**Primary key:** `id` (auto-increment)

**Indexes:**
- `recipe_id` - Query items by recipe
- `checked_at` - Find checked items for cleanup
- `created_at` - Sort by date added

**Current Schema (v2 - Local Only):**
```typescript
{
  id: number;              // Auto-increment primary key
  recipe_id: string;       // References recipe (e.g., "pad-thai")
  ingredient_id: number;   // References ingredient within recipe (1, 2, 3...)
  checked_at: number | null; // Unix timestamp when checked, null if unchecked
  created_at: number;      // Unix timestamp when added
}
```

**Example:**
```json
{
  "id": 1,
  "recipe_id": "pad-thai",
  "ingredient_id": 2,
  "checked_at": null,
  "created_at": 1707567890123
}
```

**Notes:**
- Stores `recipe_id + ingredient_id` pair (no text duplication)
- Ingredient text looked up from recipe data for display
- TTL cleanup: Items with `checked_at` older than 1 hour are auto-deleted
- Provides 1-hour undo window for checked items
- Grouped by recipe for better organization
- Hard delete after TTL expiry
- Simple matching: can show shopping list state on recipe page

## Cooking Sessions

**Object store:** `cooking_sessions`

**Primary key:** `id` (auto-increment)

**Indexes:**
- `recipe_id` - Query sessions by recipe

**Current Schema (v6 - Local Only):**
```typescript
{
  id: number;              // Auto-increment primary key
  recipe_id: string;       // References recipe (e.g., "pad-thai")
  started_at: number;      // Unix timestamp when cooking started
  completed_at: number | null; // Unix timestamp when finished, null if abandoned
  rated_at: number | null;           // Unix timestamp when user rated via banner
  rating_dismissed_at: number | null; // Unix timestamp when user dismissed rating banner
}
```

**Example:**
```json
{
  "id": 1,
  "recipe_id": "pad-thai",
  "started_at": 1707567890123,
  "completed_at": 1707569400000,
  "rated_at": 1707570000000,
  "rating_dismissed_at": null
}
```

**Notes:**
- Session created when user enters cooking mode
- `completed_at` set when user finishes all steps and reaches completion page
- Sessions with null `completed_at` indicate abandoned cooking sessions
- Duration can be calculated from `completed_at - started_at`
- Used to gate the install prompt (only shown after first completed recipe)
- `rated_at` / `rating_dismissed_at` track whether the rating banner was handled for this session
- Foundation for future cooking analytics (time tracking, history)

## Cooking Notes

**Object store:** `cooking_notes`

**Primary key:** `recipe_id`

**Current Schema (v5 - Local Only):**
```typescript
{
  recipe_id: string;     // Primary key (e.g., "pad-thai")
  text: string;          // Free-text note content
  updated_at: number;    // Unix timestamp (milliseconds)
}
```

**Example:**
```json
{
  "recipe_id": "pad-thai",
  "text": "Used tamari instead of soy sauce. Needed 2 extra minutes on the noodles.",
  "updated_at": 1707567890123
}
```

**Notes:**
- One note per recipe — users refine over time, no history
- Hard delete when text is cleared (empty string)
- Created on the completion page after finishing cooking
- Displayed on the recipe detail page with edit capability

## Ratings

**Object store:** `ratings`

**Primary key:** `recipe_id`

**Current Schema (v6 - Local Only):**
```typescript
{
  recipe_id: string;     // Primary key (e.g., "pad-thai")
  rating: number;        // 1-5 star rating
  created_at: number;    // Unix timestamp (milliseconds)
  updated_at: number;    // Unix timestamp (milliseconds)
}
```

**Example:**
```json
{
  "recipe_id": "pad-thai",
  "rating": 4,
  "created_at": 1707567890123,
  "updated_at": 1707567890123
}
```

**Notes:**
- One rating per recipe (overwritten on re-rate)
- Prompted via banner on index page after completing a cooking session
- Editable from the recipe detail page
- Displayed on recipe cards alongside cooking stats
- Rating prompt state tracked on cooking sessions (`rated_at`, `rating_dismissed_at`)

## Settings

**Object store:** `settings`

**Primary key:** `key`

**Current Schema (v4 - Local Only):**
```typescript
{
  key: string;    // Setting name (e.g., "lastSeenChangelogId")
  value: any;     // Setting value
}
```

**Example:**
```json
{
  "key": "lastSeenChangelogId",
  "value": 5
}
```

**Notes:**
- Generic key-value store for app settings
- Used by the What's New feature to track the last seen changelog entry (`lastSeenChangelogId`)
- Designed for reuse by future features needing simple persistent settings

## Recipe JSON (`recipes.json`)

Generated by the Rust parser at build time from recipe markdown files.

### Ingredient Schema

Each ingredient in the JSON includes a `text` field (original text) and an optional `quantity` field with structured data for scaling:

```typescript
{
  id: number;
  text: string;            // Original ingredient text (always present)
  quantity?: {             // Omitted for non-scalable ingredients
    amount: number;        // Primary quantity (e.g., 500)
    amount_max?: number;   // Upper bound for ranges (e.g., 4 in "3-4")
    unit?: string;         // Unit after the number (e.g., "g", "tsp", "cloves", "medium")
    item: string;          // Everything after the quantity/unit
    secondary_amount?: number;   // Parenthetical quantity (e.g., 400 in "(400 ml)")
    secondary_unit?: string;     // Parenthetical unit
    secondary_prefix?: string;   // Modifier like "about" in "(about 150 g)"
    prefix?: string;       // Text before the quantity (e.g., "Juice of")
  }
}
```

**Examples:**
- `500 g mushrooms, sliced` → `{ amount: 500, unit: "g", item: "mushrooms, sliced" }`
- `3-4 cloves garlic` → `{ amount: 3, amount_max: 4, unit: "cloves", item: "garlic" }`
- `1 tin (400 ml) coconut milk` → `{ amount: 1, unit: "tin", secondary_amount: 400, secondary_unit: "ml", item: "coconut milk" }`
- `Juice of 1/2 lemon` → `{ amount: 0.5, item: "lemon", prefix: "Juice of" }`
- `Salt to taste` → no `quantity` field (non-scalable)

### Step Schema

Steps are stored as objects with the original text and any durations extracted by the Rust parser:

```typescript
{
  text: string;              // Step instruction text
  durations?: [              // Omitted if no durations detected
    {
      seconds: number;       // Duration in seconds (uses higher value for ranges)
      text: string;          // Original text that matched (e.g., "25 to 30 minutes")
    }
  ]
}
```

**Examples:**
- `"Cook for 5 minutes"` → `{ text: "Cook for 5 minutes", durations: [{ seconds: 300, text: "5 minutes" }] }`
- `"Simmer for 25 to 30 minutes"` → `{ ..., durations: [{ seconds: 1800, text: "25 to 30 minutes" }] }`
- `"Stir well"` → `{ text: "Stir well" }` (no durations field)

### Serving Preferences (localStorage)

Stored per recipe as `servings_{recipeId}` in localStorage. Read by the recipe detail page, cooking mode, and shopping list to scale ingredient quantities.

## Sync Strategy (Future)

**Note:** Current implementation uses hard delete for simplicity. Sync strategy will be implemented when backend is added.

### Migration to Sync (Future)

When backend sync is added:
1. Bump DB version
2. Add new fields to existing records
3. Switch from hard delete to soft delete
4. Migration runs automatically on user's device

```javascript
// Migration code (future)
if (oldVersion < 2) {
  const store = transaction.objectStore('favorites');
  store.openCursor().onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      const record = cursor.value;
      record.user_id = null;
      record.favorited = true;
      record.updated_at = record.created_at;
      record.synced_at = null;
      record.device_id = getDeviceId();
      cursor.update(record);
      cursor.continue();
    }
  };
}
```

### Finding Unsynced Items (Future)

```javascript
const needsSync = items.filter(item =>
  !item.synced_at || item.updated_at > item.synced_at
)
```

### Conflict Resolution (Future)

```javascript
function mergeItem(local, remote) {
  if (remote.updated_at > local.updated_at) {
    return { ...remote, synced_at: Date.now() }
  }
  return local
}
```

## Backend Schema (Future)

When backend is added, use identical structure:

**Supabase tables:**
```sql
CREATE TABLE favorites (
  recipe_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  favorited BOOLEAN NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  device_id TEXT NOT NULL,
  PRIMARY KEY (user_id, recipe_id)
);

CREATE INDEX idx_favorites_user ON favorites(user_id);
CREATE INDEX idx_favorites_updated ON favorites(updated_at);
```

**Firebase collections:**
```
favorites/
  {user_id}_{recipe_id}/
    recipe_id: "pad-thai"
    user_id: "user123"
    favorited: true
    created_at: 1707567890123
    updated_at: 1707567890123
    device_id: "abc-123"
```

The structure is identical to local storage, making sync straightforward.

## Device ID Generation

Generate once per device and store in localStorage:

```javascript
function getDeviceId() {
  let deviceId = localStorage.getItem('biteme_device_id')

  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem('biteme_device_id', deviceId)
  }

  return deviceId
}
```

This prevents duplicate favorites when syncing across devices.
