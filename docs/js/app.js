// Main app logic for recipe list page

let showFavoritesOnly = false;
let activeTag = null;

document.addEventListener('DOMContentLoaded', async function() {
  await initDB();

  // Restore filter state from localStorage
  showFavoritesOnly = localStorage.getItem('showFavoritesOnly') === 'true';

  // Read tag filter from URL param
  const urlParams = new URLSearchParams(window.location.search);
  activeTag = urlParams.get('tag') || null;

  loadRecipes();
  setupSearch();
  setupFavoritesFilter();
  updateCartCount();
  setupWhatsNew();
  showRatingBannerIfNeeded();

  // Tag filter dropdown: toggle and outside-click-to-close
  document.getElementById('tag-filter-btn').addEventListener('click', () => {
    document.getElementById('tag-dropdown').classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('tag-dropdown');
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });

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

// Load and display all recipes, applying current filters
async function loadRecipes() {
  const allRecipes = await getRecipes();
  let recipes = allRecipes;

  if (showFavoritesOnly) {
    const favorites = await getAllFavorites();
    const favoriteIds = favorites.map(f => f.recipe_id);
    recipes = recipes.filter(r => favoriteIds.includes(r.id));
  }

  const searchQuery = document.getElementById('search-input').value;
  if (searchQuery) {
    const lowerQuery = searchQuery.toLowerCase();
    recipes = recipes.filter(recipe =>
      recipe.name.toLowerCase().includes(lowerQuery) ||
      recipe.description.toLowerCase().includes(lowerQuery) ||
      recipe.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  if (activeTag) {
    recipes = recipes.filter(r => r.tags.includes(activeTag));
  }

  renderTagBar(allRecipes);
  await displayRecipes(recipes);
}

// Render the tag filter dropdown popover contents
function renderTagBar(recipes) {
  const container = document.getElementById('tag-dropdown');
  const popover = container.querySelector('.tag-dropdown-popover');
  const toggle = document.getElementById('tag-filter-btn');
  const tags = [...new Set(recipes.flatMap(r => r.tags))].sort();

  popover.innerHTML = tags.map(tag =>
    `<button class="tag tag-filter${activeTag === tag ? ' active' : ''}" data-tag="${tag}">${tag}</button>`
  ).join('');

  // Update toggle active state
  toggle.classList.toggle('active', !!activeTag);

  popover.querySelectorAll('.tag-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      container.classList.remove('open');
      setActiveTag(btn.dataset.tag === activeTag ? null : btn.dataset.tag);
    });
  });
}

// Set active tag, update URL, and reload
function setActiveTag(tag) {
  activeTag = tag;

  const url = new URL(window.location);
  if (tag) {
    url.searchParams.set('tag', tag);
  } else {
    url.searchParams.delete('tag');
  }
  history.replaceState(null, '', url);

  loadRecipes();
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
        setActiveTag(null);
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
        setActiveTag(null);
      });
    }
    return;
  }

  // Fetch cooking stats and ratings once for all cards
  const cookingStats = await getCookingStatsMap();
  const allRatings = await getAllRatings();
  const ratingsMap = {};
  for (const r of allRatings) ratingsMap[r.recipe_id] = r.rating;

  // Render cards
  recipeGrid.innerHTML = recipes.map(recipe => {
    const stats = cookingStats[recipe.id];
    let statsHtml = '';
    if (stats) {
      const timeStr = stats.count === 1
        ? formatCookingDuration(stats.avgDuration)
        : `~${formatCookingDuration(stats.avgDuration)}`;
      const countStr = stats.count === 1 ? 'Cooked once' : `Cooked ${stats.count} times`;
      const ratingVal = ratingsMap[recipe.id];
      const ratingHtml = ratingVal
        ? ` <span class="card-rating">\u00B7 ${'★'.repeat(ratingVal)}${'☆'.repeat(5 - ratingVal)}</span>`
        : '';
      statsHtml = `<p class="card-cooking-stats">${countStr} \u00B7 ${timeStr}${ratingHtml}</p>`;
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
        ${recipe.tags.map(tag => `<button class="tag tag-filter${activeTag === tag ? ' active' : ''}" data-tag="${tag}">${tag}</button>`).join('')}
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

  // Setup tag click handlers on cards
  recipeGrid.querySelectorAll('.recipe-card .tag-filter').forEach(tagBtn => {
    tagBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent card navigation
      setActiveTag(tagBtn.dataset.tag === activeTag ? null : tagBtn.dataset.tag);
    });
  });
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

    loadRecipes();
  });
}

// Setup search functionality
function setupSearch() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => loadRecipes());
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

// What's New
async function setupWhatsNew() {
  const btn = document.getElementById('whats-new-btn');
  const dot = document.getElementById('whats-new-dot');
  const sheet = document.getElementById('whats-new-sheet');
  const list = document.getElementById('whats-new-list');
  const closeBtn = document.getElementById('whats-new-close');
  const overlay = sheet.querySelector('.whats-new-overlay');

  if (!btn || typeof CHANGELOG === 'undefined' || CHANGELOG.length === 0) return;

  const latestId = CHANGELOG[0].id;
  const lastSeenId = await getSetting('lastSeenChangelogId');

  // First visit — mark all as seen, no dot
  if (lastSeenId === null) {
    await setSetting('lastSeenChangelogId', latestId);
  } else if (latestId > lastSeenId) {
    dot.style.display = '';
  }

  function openSheet() {
    // Render entries
    list.innerHTML = CHANGELOG.map(entry => `
      <div class="whats-new-entry">
        <div class="whats-new-date">${formatChangelogDate(entry.date)}</div>
        <div class="whats-new-text">${entry.text}</div>
      </div>
    `).join('');

    sheet.style.display = '';

    // Mark as seen
    setSetting('lastSeenChangelogId', latestId);
    dot.style.display = 'none';
  }

  function closeSheet() {
    sheet.style.display = 'none';
  }

  btn.addEventListener('click', openSheet);
  closeBtn.addEventListener('click', closeSheet);
  overlay.addEventListener('click', closeSheet);
}

function formatChangelogDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
