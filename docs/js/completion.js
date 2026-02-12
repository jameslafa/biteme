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
});
