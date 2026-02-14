// Completion page logic

document.addEventListener('DOMContentLoaded', async function() {
  const urlParams = new URLSearchParams(window.location.search);
  const recipeId = urlParams.get('id');

  if (!recipeId) {
    window.location.href = 'index.html';
    return;
  }

  const recipe = await getRecipeById(recipeId);

  if (!recipe) {
    window.location.href = 'index.html';
    return;
  }

  // Record cooking session completion and show elapsed time
  const sessionId = parseInt(urlParams.get('session'));
  if (sessionId) {
    try {
      const session = await saveCookingComplete(sessionId);
      if (session && session.started_at && session.completed_at) {
        const duration = session.completed_at - session.started_at;
        const timeEl = document.getElementById('cooking-time');
        timeEl.textContent = `Cooked in ${formatCookingDuration(duration)}`;
      }
    } catch {
      // No error state — just skip showing time
    }
  }

  // Update page title and recipe name
  document.title = 'Bon appétit! - biteme';
  document.getElementById('recipe-name').textContent = recipe.name;

  // Setup navigation buttons
  document.getElementById('back-to-recipe-btn').addEventListener('click', function() {
    window.location.href = `recipe.html?id=${recipeId}`;
  });

  document.getElementById('back-to-home-btn').addEventListener('click', function() {
    window.location.href = 'index.html';
  });

  // Cooking notes
  const notesInput = document.getElementById('cooking-notes-input');
  const notesStatus = document.getElementById('notes-status');
  let debounceTimer = null;

  try {
    const existing = await getCookingNote(recipeId);
    if (existing) {
      notesInput.value = existing.text;
    }
  } catch {
    // DB not available — textarea still works, just won't load existing
  }

  notesInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        await saveCookingNote(recipeId, notesInput.value);
        notesStatus.textContent = 'Saved';
        notesStatus.classList.add('visible');
        setTimeout(() => notesStatus.classList.remove('visible'), 1500);
      } catch {
        // Silent fail
      }
    }, 800);
  });
});
