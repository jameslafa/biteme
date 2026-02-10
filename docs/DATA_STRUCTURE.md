# Data Structures

This document defines the data schemas used in BiteMe for local storage and future backend sync.

## IndexedDB Database

**Database name:** `biteme_db`

**Version:** 1

**Object stores:** favorites, notes, ratings, cooking_history

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

**Future Schema (v2 - With Sync):**
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

## Notes

**Object store:** `notes`

**Primary key:** `[recipe_id, note_id]` (compound)

**Schema:**
```typescript
{
  note_id: string;          // UUID for the note
  recipe_id: string;        // References recipe
  user_id: string | null;   // null for local
  note_text: string;        // User's note
  created_at: number;       // Unix timestamp
  updated_at: number;       // Unix timestamp
  synced_at: number | null; // Sync status
  device_id: string;        // Device identifier
}
```

## Ratings

**Object store:** `ratings`

**Primary key:** `recipe_id`

**Schema:**
```typescript
{
  recipe_id: string;        // Primary key
  user_id: string | null;   // null for local
  rating: number;           // 1-5 stars
  created_at: number;       // Unix timestamp
  updated_at: number;       // Unix timestamp
  synced_at: number | null; // Sync status
  device_id: string;        // Device identifier
}
```

## Cooking History

**Object store:** `cooking_history`

**Primary key:** `history_id`

**Schema:**
```typescript
{
  history_id: string;       // UUID for history entry
  recipe_id: string;        // References recipe
  user_id: string | null;   // null for local
  completed_at: number;     // Unix timestamp
  time_taken: number;       // Seconds to complete
  complexity_rating: string; // "easy" | "medium" | "hard"
  synced_at: number | null; // Sync status
  device_id: string;        // Device identifier
}
```

## Sync Strategy (Future)

**Note:** Current implementation uses hard delete for simplicity. Sync strategy will be implemented when backend is added.

### Migration to Sync (v1 → v2)

When backend sync is added:
1. Bump DB version from 1 to 2
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
