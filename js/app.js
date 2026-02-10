// Main app logic for recipe list page

let showFavoritesOnly = false;

document.addEventListener('DOMContentLoaded', async function() {
  await initDB();

  // Restore filter state from localStorage
  showFavoritesOnly = localStorage.getItem('showFavoritesOnly') === 'true';

  loadRecipes();
  setupSearch();
  setupFavoritesFilter();
});

// Load and display all recipes
async function loadRecipes() {
  if (showFavoritesOnly) {
    await displayFavorites();
  } else {
    const recipes = getRecipes();
    await displayRecipes(recipes);
  }
}

// Display only favorited recipes
async function displayFavorites() {
  const allRecipes = getRecipes();
  const favorites = await getAllFavorites();
  const favoriteIds = favorites.map(f => f.recipe_id);
  const favoriteRecipes = allRecipes.filter(r => favoriteIds.includes(r.id));

  await displayRecipes(favoriteRecipes);
}

// Display recipes in the grid
async function displayRecipes(recipes) {
  const recipeGrid = document.getElementById('recipe-grid');

  if (recipes.length === 0) {
    recipeGrid.innerHTML = '<p class="no-results">No recipes found. Try a different search.</p>';
    return;
  }

  // Render cards
  recipeGrid.innerHTML = recipes.map(recipe => `
    <div class="recipe-card" onclick="viewRecipe('${recipe.id}')">
      <div class="recipe-card-header">
        <h3 class="recipe-title">${recipe.name}</h3>
        <button class="favorite-button-small" data-recipe-id="${recipe.id}" aria-label="Add to favorites">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>
      <p class="recipe-description">${recipe.description}</p>
      <div class="recipe-tags">
        ${recipe.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
      </div>
    </div>
  `).join('');

  // Update favorite states and setup click handlers
  for (const recipe of recipes) {
    const btn = recipeGrid.querySelector(`[data-recipe-id="${recipe.id}"]`);
    const favorited = await isFavorited(recipe.id);
    updateFavoriteButtonSmall(btn, favorited);

    btn.addEventListener('click', async (e) => {
      e.stopPropagation(); // Prevent card click
      await toggleFavorite(recipe.id);
      const newState = await isFavorited(recipe.id);
      updateFavoriteButtonSmall(btn, newState);
    });
  }
}

function updateFavoriteButtonSmall(button, favorited) {
  if (favorited) {
    button.classList.add('favorited');
    button.setAttribute('aria-label', 'Remove from favorites');
  } else {
    button.classList.remove('favorited');
    button.setAttribute('aria-label', 'Add to favorites');
  }
}

// Navigate to recipe detail page
function viewRecipe(id) {
  window.location.href = `recipe.html?id=${id}`;
}

// Setup favorites filter toggle
function setupFavoritesFilter() {
  const filterBtn = document.getElementById('favorites-filter');

  // Set initial state
  if (showFavoritesOnly) {
    filterBtn.classList.add('active');
    filterBtn.setAttribute('aria-label', 'Show all recipes');
  }

  filterBtn.addEventListener('click', async () => {
    showFavoritesOnly = !showFavoritesOnly;

    // Save to localStorage
    localStorage.setItem('showFavoritesOnly', showFavoritesOnly);

    // Update button state
    if (showFavoritesOnly) {
      filterBtn.classList.add('active');
      filterBtn.setAttribute('aria-label', 'Show all recipes');
    } else {
      filterBtn.classList.remove('active');
      filterBtn.setAttribute('aria-label', 'Show favorites only');
    }

    // Reload recipes with filter
    await loadRecipes();
  });
}

// Setup search functionality
async function setupSearch() {
  const searchInput = document.getElementById('search-input');

  if (searchInput) {
    searchInput.addEventListener('input', async function(e) {
      const query = e.target.value;

      if (showFavoritesOnly) {
        // Search within favorites
        const allRecipes = getRecipes();
        const favorites = await getAllFavorites();
        const favoriteIds = favorites.map(f => f.recipe_id);
        const favoriteRecipes = allRecipes.filter(r => favoriteIds.includes(r.id));
        const results = favoriteRecipes.filter(recipe =>
          recipe.name.toLowerCase().includes(query.toLowerCase()) ||
          recipe.description.toLowerCase().includes(query.toLowerCase()) ||
          recipe.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
        );
        await displayRecipes(results);
      } else {
        // Search all recipes
        const results = searchRecipes(query);
        await displayRecipes(results);
      }
    });
  }
}
