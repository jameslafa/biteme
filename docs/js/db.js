// IndexedDB helper for BiteMe local storage

const DB_NAME = 'biteme_db';
const DB_VERSION = 6;
let db = null;

// Initialize database
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create favorites object store
      if (!db.objectStoreNames.contains('favorites')) {
        const favStore = db.createObjectStore('favorites', { keyPath: 'recipe_id' });
        favStore.createIndex('created_at', 'created_at', { unique: false });
      }

      // Create shopping list object store
      if (!db.objectStoreNames.contains('shopping_list')) {
        const shopStore = db.createObjectStore('shopping_list', { keyPath: 'id', autoIncrement: true });
        shopStore.createIndex('recipe_id', 'recipe_id', { unique: false });
        shopStore.createIndex('checked_at', 'checked_at', { unique: false });
        shopStore.createIndex('created_at', 'created_at', { unique: false });
      }

      // Create cooking sessions object store
      if (!db.objectStoreNames.contains('cooking_sessions')) {
        const cookStore = db.createObjectStore('cooking_sessions', { keyPath: 'id', autoIncrement: true });
        cookStore.createIndex('recipe_id', 'recipe_id', { unique: false });
      }

      // Create settings key-value store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      // Create cooking notes store
      if (!db.objectStoreNames.contains('cooking_notes')) {
        db.createObjectStore('cooking_notes', { keyPath: 'recipe_id' });
      }

      // Create ratings store
      if (!db.objectStoreNames.contains('ratings')) {
        db.createObjectStore('ratings', { keyPath: 'recipe_id' });
      }
    };
  });
}

// Add recipe to favorites
async function addFavorite(recipeId) {
  if (!db) await initDB();

  const transaction = db.transaction(['favorites'], 'readwrite');
  const store = transaction.objectStore('favorites');

  const favorite = {
    recipe_id: recipeId,
    created_at: Date.now()
  };

  return new Promise((resolve, reject) => {
    const request = store.put(favorite);
    request.onsuccess = () => resolve(favorite);
    request.onerror = () => reject(request.error);
  });
}

// Remove recipe from favorites (hard delete)
async function removeFavorite(recipeId) {
  if (!db) await initDB();

  const transaction = db.transaction(['favorites'], 'readwrite');
  const store = transaction.objectStore('favorites');

  return new Promise((resolve, reject) => {
    const request = store.delete(recipeId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Check if recipe is favorited
async function isFavorited(recipeId) {
  if (!db) await initDB();

  const transaction = db.transaction(['favorites'], 'readonly');
  const store = transaction.objectStore('favorites');

  return new Promise((resolve, reject) => {
    const request = store.get(recipeId);

    request.onsuccess = () => {
      // If record exists, it's favorited (we use hard delete)
      resolve(!!request.result);
    };

    request.onerror = () => reject(request.error);
  });
}

// Get all favorited recipes
async function getAllFavorites() {
  if (!db) await initDB();

  const transaction = db.transaction(['favorites'], 'readonly');
  const store = transaction.objectStore('favorites');

  return new Promise((resolve, reject) => {
    const request = store.getAll();

    request.onsuccess = () => {
      const favorites = request.result || [];
      resolve(favorites);
    };

    request.onerror = () => reject(request.error);
  });
}

// Toggle favorite status
async function toggleFavorite(recipeId) {
  const favorited = await isFavorited(recipeId);

  if (favorited) {
    return await removeFavorite(recipeId);
  } else {
    return await addFavorite(recipeId);
  }
}

// Shopping List Functions

// Add item to shopping list
async function addToShoppingList(recipeId, ingredientId) {
  if (!db) await initDB();

  // Check if already in list
  const items = await getShoppingListByRecipe(recipeId);
  const exists = items.find(item => item.ingredient_id === ingredientId);
  if (exists) {
    return; // Already in list
  }

  const transaction = db.transaction(['shopping_list'], 'readwrite');
  const store = transaction.objectStore('shopping_list');

  const item = {
    recipe_id: recipeId,
    ingredient_id: ingredientId,
    checked_at: null,
    created_at: Date.now()
  };

  return new Promise((resolve, reject) => {
    const request = store.add(item);
    request.onsuccess = () => resolve({ ...item, id: request.result });
    request.onerror = () => reject(request.error);
  });
}

// Remove item from shopping list
async function removeFromShoppingList(recipeId, ingredientId) {
  if (!db) await initDB();

  const items = await getShoppingListByRecipe(recipeId);
  const item = items.find(i => i.ingredient_id === ingredientId);

  if (item) {
    return await removeShoppingListItem(item.id);
  }
}

// Get all shopping list items for a specific recipe
async function getShoppingListByRecipe(recipeId) {
  if (!db) await initDB();

  const transaction = db.transaction(['shopping_list'], 'readonly');
  const store = transaction.objectStore('shopping_list');

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const items = request.result || [];
      const recipeItems = items.filter(item => item.recipe_id === recipeId);
      resolve(recipeItems);
    };
    request.onerror = () => reject(request.error);
  });
}

// Get all shopping list items
async function getAllShoppingListItems() {
  if (!db) await initDB();

  const transaction = db.transaction(['shopping_list'], 'readonly');
  const store = transaction.objectStore('shopping_list');

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// Toggle item checked status
async function toggleShoppingListItem(itemId) {
  if (!db) await initDB();

  const transaction = db.transaction(['shopping_list'], 'readwrite');
  const store = transaction.objectStore('shopping_list');

  return new Promise((resolve, reject) => {
    const getRequest = store.get(itemId);

    getRequest.onsuccess = () => {
      const item = getRequest.result;
      if (!item) {
        reject(new Error('Item not found'));
        return;
      }

      // Toggle checked status
      item.checked_at = item.checked_at ? null : Date.now();

      const updateRequest = store.put(item);
      updateRequest.onsuccess = () => resolve(item);
      updateRequest.onerror = () => reject(updateRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

// Remove item from shopping list
async function removeShoppingListItem(itemId) {
  if (!db) await initDB();

  const transaction = db.transaction(['shopping_list'], 'readwrite');
  const store = transaction.objectStore('shopping_list');

  return new Promise((resolve, reject) => {
    const request = store.delete(itemId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Clean up checked items older than 1 hour
async function cleanupShoppingList() {
  if (!db) await initDB();

  const transaction = db.transaction(['shopping_list'], 'readwrite');
  const store = transaction.objectStore('shopping_list');
  const index = store.index('checked_at');

  const oneHourAgo = Date.now() - (60 * 60 * 1000);

  return new Promise((resolve, reject) => {
    const request = index.openCursor();
    const deletedIds = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const item = cursor.value;
        // Delete if checked and older than 1 hour
        if (item.checked_at && item.checked_at < oneHourAgo) {
          cursor.delete();
          deletedIds.push(item.id);
        }
        cursor.continue();
      } else {
        resolve(deletedIds);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

// Get shopping list item count (unchecked only)
async function getShoppingListCount() {
  const items = await getAllShoppingListItems();
  return items.filter(item => !item.checked_at).length;
}

// Cooking Session Functions

// Save a cooking session start
async function saveCookingStart(recipeId) {
  if (!db) await initDB();

  const transaction = db.transaction(['cooking_sessions'], 'readwrite');
  const store = transaction.objectStore('cooking_sessions');

  const session = {
    recipe_id: recipeId,
    started_at: Date.now(),
    completed_at: null,
    rated_at: null,
    rating_dismissed_at: null
  };

  return new Promise((resolve, reject) => {
    const request = store.add(session);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Save a cooking session completion
async function saveCookingComplete(sessionId) {
  if (!db) await initDB();

  const transaction = db.transaction(['cooking_sessions'], 'readwrite');
  const store = transaction.objectStore('cooking_sessions');

  return new Promise((resolve, reject) => {
    const getRequest = store.get(sessionId);

    getRequest.onsuccess = () => {
      const session = getRequest.result;
      if (!session) {
        reject(new Error('Session not found'));
        return;
      }

      session.completed_at = Date.now();

      const updateRequest = store.put(session);
      updateRequest.onsuccess = () => resolve(session);
      updateRequest.onerror = () => reject(updateRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

// Mark a cooking session as rated or dismissed
async function updateSessionRatingStatus(sessionId, field) {
  if (!db) await initDB();

  const transaction = db.transaction(['cooking_sessions'], 'readwrite');
  const store = transaction.objectStore('cooking_sessions');

  return new Promise((resolve, reject) => {
    const getRequest = store.get(sessionId);

    getRequest.onsuccess = () => {
      const session = getRequest.result;
      if (!session) {
        reject(new Error('Session not found'));
        return;
      }

      session[field] = Date.now();

      const updateRequest = store.put(session);
      updateRequest.onsuccess = () => resolve(session);
      updateRequest.onerror = () => reject(updateRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

// Get all completed cooking sessions for a recipe
async function getCookingSessionsByRecipe(recipeId) {
  if (!db) await initDB();

  const transaction = db.transaction(['cooking_sessions'], 'readonly');
  const store = transaction.objectStore('cooking_sessions');
  const index = store.index('recipe_id');

  return new Promise((resolve, reject) => {
    const request = index.getAll(recipeId);

    request.onsuccess = () => {
      const sessions = (request.result || []).filter(s => s.completed_at !== null);
      resolve(sessions);
    };

    request.onerror = () => reject(request.error);
  });
}

// Get all completed cooking sessions
async function getAllCompletedSessions() {
  if (!db) await initDB();

  const transaction = db.transaction(['cooking_sessions'], 'readonly');
  const store = transaction.objectStore('cooking_sessions');

  return new Promise((resolve, reject) => {
    const request = store.getAll();

    request.onsuccess = () => {
      const sessions = (request.result || []).filter(s => s.completed_at !== null);
      resolve(sessions);
    };

    request.onerror = () => reject(request.error);
  });
}

// Format cooking duration from milliseconds to human-readable string
function formatCookingDuration(ms) {
  const totalMinutes = Math.round(ms / 60000);

  if (totalMinutes < 1) return '< 1 min';
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

// Settings Functions

// Get a setting value by key
async function getSetting(key) {
  if (!db) await initDB();

  const transaction = db.transaction(['settings'], 'readonly');
  const store = transaction.objectStore('settings');

  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result ? request.result.value : null);
    request.onerror = () => reject(request.error);
  });
}

// Set a setting value by key
async function setSetting(key, value) {
  if (!db) await initDB();

  const transaction = db.transaction(['settings'], 'readwrite');
  const store = transaction.objectStore('settings');

  return new Promise((resolve, reject) => {
    const request = store.put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Rating Functions

// Save or update a rating for a recipe
async function saveRating(recipeId, rating) {
  if (!db) await initDB();

  const transaction = db.transaction(['ratings'], 'readwrite');
  const store = transaction.objectStore('ratings');
  const now = Date.now();

  return new Promise((resolve, reject) => {
    // Read then write in the same transaction to avoid it auto-committing
    const getRequest = store.get(recipeId);

    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      const record = {
        recipe_id: recipeId,
        rating,
        created_at: existing ? existing.created_at : now,
        updated_at: now
      };

      const putRequest = store.put(record);
      putRequest.onsuccess = () => resolve(record);
      putRequest.onerror = () => reject(putRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

// Get rating for a specific recipe
async function getRating(recipeId) {
  if (!db) await initDB();

  const transaction = db.transaction(['ratings'], 'readonly');
  const store = transaction.objectStore('ratings');

  return new Promise((resolve, reject) => {
    const request = store.get(recipeId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// Get all ratings
async function getAllRatings() {
  if (!db) await initDB();

  const transaction = db.transaction(['ratings'], 'readonly');
  const store = transaction.objectStore('ratings');

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// Check if user has completed at least one cooking session
async function hasCompletedCooking() {
  if (!db) await initDB();

  const transaction = db.transaction(['cooking_sessions'], 'readonly');
  const store = transaction.objectStore('cooking_sessions');

  return new Promise((resolve, reject) => {
    const request = store.openCursor();

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.completed_at !== null) {
          resolve(true);
          return;
        }
        cursor.continue();
      } else {
        resolve(false);
      }
    };

    request.onerror = () => reject(request.error);
  });
}
