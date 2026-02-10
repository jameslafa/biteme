// IndexedDB helper for BiteMe local storage

const DB_NAME = 'biteme_db';
const DB_VERSION = 1;
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

        // Add index for sorting by date
        favStore.createIndex('created_at', 'created_at', { unique: false });
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
