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
- `favorited` - Filter active favorites
- `updated_at` - Sort by date
- `synced_at` - Find unsynced items
- `user_id` - Filter by user (for future multi-user)

**Schema:**
```typescript
{
  recipe_id: string;        // Primary key (e.g., "thai-green-curry")
  user_id: string | null;   // null for local, real ID when backend added
  favorited: boolean;       // true = favorited, false = soft delete
  created_at: number;       // Unix timestamp (milliseconds)
  updated_at: number;       // Unix timestamp (milliseconds)
  synced_at: number | null; // null = never synced, timestamp = last sync
  device_id: string;        // Unique device identifier
}
```

**Example:**
```json
{
  "recipe_id": "pad-thai",
  "user_id": null,
  "favorited": true,
  "created_at": 1707567890123,
  "updated_at": 1707567890123,
  "synced_at": null,
  "device_id": "abc-123-def"
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

## Sync Strategy

### Finding Unsynced Items

```javascript
// Items that need syncing to backend
const needsSync = items.filter(item =>
  !item.synced_at || item.updated_at > item.synced_at
)
```

### Conflict Resolution

When syncing, compare timestamps:

```javascript
function mergeItem(local, remote) {
  // Newest wins
  if (remote.updated_at > local.updated_at) {
    return { ...remote, synced_at: Date.now() }
  }
  return local
}
```

### Soft Deletes

Never hard delete - use flags instead:

```javascript
// Unfavorite (don't delete)
item.favorited = false
item.updated_at = Date.now()
item.synced_at = null  // Mark for sync
```

This preserves history and allows deletion to sync to backend.

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
