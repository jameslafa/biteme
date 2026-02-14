// Cooking notes - save/retrieve per-recipe notes from IndexedDB

async function saveCookingNote(recipeId, text) {
  if (!db) await initDB();

  const transaction = db.transaction(['cooking_notes'], 'readwrite');
  const store = transaction.objectStore('cooking_notes');

  return new Promise((resolve, reject) => {
    if (!text.trim()) {
      const request = store.delete(recipeId);
      request.onsuccess = () => resolve(null);
      request.onerror = () => reject(request.error);
    } else {
      const note = {
        recipe_id: recipeId,
        text: text.trim(),
        updated_at: Date.now()
      };
      const request = store.put(note);
      request.onsuccess = () => resolve(note);
      request.onerror = () => reject(request.error);
    }
  });
}

async function getCookingNote(recipeId) {
  if (!db) await initDB();

  const transaction = db.transaction(['cooking_notes'], 'readonly');
  const store = transaction.objectStore('cooking_notes');

  return new Promise((resolve, reject) => {
    const request = store.get(recipeId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}
