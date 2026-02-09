// Main app logic for recipe list page

document.addEventListener('DOMContentLoaded', function() {
  loadRecipes();
  setupSearch();
});

// Load and display all recipes
function loadRecipes() {
  const recipes = getRecipes();
  displayRecipes(recipes);
}

// Display recipes in the grid
function displayRecipes(recipes) {
  const recipeGrid = document.getElementById('recipe-grid');

  if (recipes.length === 0) {
    recipeGrid.innerHTML = '<p class="no-results">No recipes found. Try a different search.</p>';
    return;
  }

  recipeGrid.innerHTML = recipes.map(recipe => `
    <div class="recipe-card" onclick="viewRecipe(${recipe.id})">
      <h3 class="recipe-title">${recipe.name}</h3>
      <p class="recipe-description">${recipe.description}</p>
      <div class="recipe-tags">
        ${recipe.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

// Navigate to recipe detail page
function viewRecipe(id) {
  window.location.href = `recipe.html?id=${id}`;
}

// Setup search functionality
function setupSearch() {
  const searchInput = document.getElementById('search-input');

  if (searchInput) {
    searchInput.addEventListener('input', function(e) {
      const query = e.target.value;
      const results = searchRecipes(query);
      displayRecipes(results);
    });
  }
}
