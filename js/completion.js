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
