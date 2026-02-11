# Data Structures

This document defines the data schemas used in BiteMe for local storage and future backend sync.

## IndexedDB Database

**Database name:** `biteme_db`

**Version:** 3

**Object stores:** favorites, shopping_list, cooking_sessions

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

**Current Schema (v3 - Local Only):**
```typescript
{
  id: number;              // Auto-increment primary key
  recipe_id: string;       // References recipe (e.g., "pad-thai")
  started_at: number;      // Unix timestamp when cooking started
  completed_at: number | null; // Unix timestamp when finished, null if abandoned
}
```

**Example:**
```json
{
  "id": 1,
  "recipe_id": "pad-thai",
  "started_at": 1707567890123,
  "completed_at": 1707569400000
}
```

**Notes:**
- Session created when user enters cooking mode
- `completed_at` set when user finishes all steps and reaches completion page
- Sessions with null `completed_at` indicate abandoned cooking sessions
- Duration can be calculated from `completed_at - started_at`
- Used to gate the install prompt (only shown after first completed recipe)
- Foundation for future cooking analytics (time tracking, history)

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
