// Main app logic for recipe list page

let showFavoritesOnly = false;

document.addEventListener('DOMContentLoaded', async function() {
  await initDB();

  // Restore filter state from localStorage
  showFavoritesOnly = localStorage.getItem('showFavoritesOnly') === 'true';

  loadRecipes();
  setupSearch();
  setupFavoritesFilter();
  updateCartCount();

  // Refresh recipes when returning to the app (e.g. PWA resume)
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      const updated = await checkForRecipeUpdates();
      if (updated) {
        loadRecipes();
      }
    }
  });
});

// Load and display all recipes
async function loadRecipes() {
  if (showFavoritesOnly) {
    await displayFavorites();
  } else {
    const recipes = await getRecipes();
    await displayRecipes(recipes);
  }
}

// Display only favorited recipes
async function displayFavorites() {
  const allRecipes = await getRecipes();
  const favorites = await getAllFavorites();
  const favoriteIds = favorites.map(f => f.recipe_id);
  const favoriteRecipes = allRecipes.filter(r => favoriteIds.includes(r.id));

  await displayRecipes(favoriteRecipes);
}

// Build a map of recipe ID → { count, avgDuration } from completed sessions
async function getCookingStatsMap() {
  try {
    const sessions = await getAllCompletedSessions();
    const map = {};

    for (const session of sessions) {
      if (!map[session.recipe_id]) {
        map[session.recipe_id] = { count: 0, totalDuration: 0 };
      }
      map[session.recipe_id].count++;
      map[session.recipe_id].totalDuration += (session.completed_at - session.started_at);
    }

    for (const id of Object.keys(map)) {
      map[id].avgDuration = map[id].totalDuration / map[id].count;
    }

    return map;
  } catch {
    return {};
  }
}

// Display recipes in the grid
async function displayRecipes(recipes) {
  const recipeGrid = document.getElementById('recipe-grid');

  if (recipes.length === 0) {
    if (showFavoritesOnly) {
      recipeGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <img src="assets/illustrations/empty_favourite.svg" alt="No favourites yet" />
          </div>
          <p>No favourites yet</p>
          <p class="empty-subtitle">Tap the heart on any recipe to save it here.</p>
          <button class="button" id="browse-all-btn">Browse all recipes</button>
        </div>
      `;
      document.getElementById('browse-all-btn').addEventListener('click', () => {
        showFavoritesOnly = false;
        localStorage.setItem('showFavoritesOnly', false);
        const filterBtn = document.getElementById('favorites-filter');
        filterBtn.classList.remove('active');
        filterBtn.setAttribute('aria-label', 'Show favourites only');
        loadRecipes();
      });
    } else {
      recipeGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <img src="assets/illustrations/empty.svg" alt="No recipes found" />
          </div>
          <p>No recipes found</p>
          <p class="empty-subtitle">Try a different search or browse all recipes.</p>
          <button class="button" id="clear-search-btn">Browse all recipes</button>
        </div>
      `;
      document.getElementById('clear-search-btn').addEventListener('click', () => {
        document.getElementById('search-input').value = '';
        loadRecipes();
      });
    }
    return;
  }

  // Fetch cooking stats once for all cards
  const cookingStats = await getCookingStatsMap();

  // Render cards
  recipeGrid.innerHTML = recipes.map(recipe => {
    const stats = cookingStats[recipe.id];
    let statsHtml = '';
    if (stats) {
      const timeStr = stats.count === 1
        ? formatCookingDuration(stats.avgDuration)
        : `~${formatCookingDuration(stats.avgDuration)}`;
      const countStr = stats.count === 1 ? 'Cooked once' : `Cooked ${stats.count} times`;
      statsHtml = `<p class="card-cooking-stats">${countStr} \u00B7 ${timeStr}</p>`;
    }

    return `
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
      ${statsHtml}
    </div>
  `;
  }).join('');

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
        const allRecipes = await getRecipes();
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
        const results = await searchRecipes(query);
        await displayRecipes(results);
      }
    });
  }
}

// Update shopping cart badge count
async function updateCartCount() {
  const count = await getShoppingListCount();
  const badge = document.getElementById('cart-count');

  if (badge) {
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }
}
