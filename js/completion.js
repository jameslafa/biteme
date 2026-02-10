// Completion page logic

document.addEventListener('DOMContentLoaded', function() {
  const urlParams = new URLSearchParams(window.location.search);
  const recipeId = urlParams.get('id');

  if (!recipeId) {
    window.location.href = 'index.html';
    return;
  }

  const recipe = getRecipeById(recipeId);

  if (!recipe) {
    window.location.href = 'index.html';
    return;
  }

  // Update page title
  document.title = 'Bon appétit! - biteme';

  // Setup navigation buttons
  document.getElementById('back-to-recipe-btn').addEventListener('click', function() {
    window.location.href = `recipe.html?id=${recipeId}`;
  });

  document.getElementById('back-to-home-btn').addEventListener('click', function() {
    window.location.href = 'index.html';
  });
});
