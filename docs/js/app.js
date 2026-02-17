// Main app logic for recipe list page

let showFavoritesOnly = false;
let activeTag = null;
let activeMinRating = null;
let pendingTag = null;
let pendingMinRating = null;
let cachedAllRecipes = [];
let cachedRatingsMap = {};
let cachedFavoriteIds = new Set();

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
  setupFilterPanel();
  updateCartCount();
  setupDrawer();
  showRatingBannerIfNeeded();

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

// Single filter function used by both loadRecipes (applied) and live count (pending)
function filterRecipes({ tag, minRating, favoritesOnly, searchQuery }) {
  let recipes = cachedAllRecipes;

  if (favoritesOnly) {
    recipes = recipes.filter(r => cachedFavoriteIds.has(r.id));
  }

  if (searchQuery) {
    const lowerQuery = searchQuery.toLowerCase();
    recipes = recipes
      .map(recipe => {
        let score = 0;
        if (recipe.name.toLowerCase().includes(lowerQuery)) score += 3;
        if (recipe.description.toLowerCase().includes(lowerQuery)) score += 2;
        if (recipe.tags.some(t => t.toLowerCase().includes(lowerQuery))) score += 2;
        if (Object.values(recipe.ingredients).some(group =>
          group.some(ing => ing.text.toLowerCase().includes(lowerQuery))
        )) score += 1;
        return { recipe, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(r => r.recipe);
  }

  if (tag) {
    recipes = recipes.filter(r => r.tags.includes(tag));
  }

  if (minRating) {
    recipes = recipes.filter(r => (cachedRatingsMap[r.id] || 0) >= minRating);
  }

  return recipes;
}

// Load and display all recipes, applying current filters
async function loadRecipes() {
  cachedAllRecipes = await getRecipes();

  const allRatings = await getAllRatings();
  cachedRatingsMap = {};
  for (const r of allRatings) cachedRatingsMap[r.recipe_id] = r.rating;

  const favorites = await getAllFavorites();
  cachedFavoriteIds = new Set(favorites.map(f => f.recipe_id));

  const recipes = filterRecipes({
    tag: activeTag,
    minRating: activeMinRating,
    favoritesOnly: showFavoritesOnly,
    searchQuery: document.getElementById('search-input').value,
  });

  // Update filter icon state
  const filterBtn = document.getElementById('tag-filter-btn');
  filterBtn.classList.toggle('active', !!activeTag || !!activeMinRating);

  await displayRecipes(recipes);
}

// Setup the filter panel: toggle popover, outside-click-to-close, custom dropdowns
function setupFilterPanel() {
  const container = document.getElementById('tag-dropdown');
  const filterBtn = document.getElementById('tag-filter-btn');

  // Toggle popover — initialize pending state from active when opening
  filterBtn.addEventListener('click', () => {
    const wasOpen = container.classList.contains('open');
    if (!wasOpen) {
      pendingTag = activeTag;
      pendingMinRating = activeMinRating;
      renderFilterDropdowns();
    }
    container.classList.toggle('open');
    closeAllFilterSelects();
  });

  // Close popover on outside click (discard pending changes)
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      container.classList.remove('open');
      closeAllFilterSelects();
    }
  });

  // Setup tag dropdown
  document.getElementById('tag-select-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFilterSelect('tag-select', 'rating-select');
  });

  // Setup rating dropdown
  document.getElementById('rating-select-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFilterSelect('rating-select', 'tag-select');
  });

  // Filter (apply) button — commit pending → active
  document.getElementById('filter-apply-btn').addEventListener('click', () => {
    activeTag = pendingTag;
    activeMinRating = pendingMinRating;
    updateFilterURL();
    container.classList.remove('open');
    closeAllFilterSelects();
    loadRecipes();
  });

  // Reset button
  document.getElementById('filter-reset-btn').addEventListener('click', () => {
    pendingTag = null;
    pendingMinRating = null;
    activeTag = null;
    activeMinRating = null;
    updateFilterURL();
    container.classList.remove('open');
    closeAllFilterSelects();
    loadRecipes();
  });
}

function toggleFilterSelect(openId, closeId) {
  document.getElementById(closeId).classList.remove('open');
  document.getElementById(openId).classList.toggle('open');
}

function closeAllFilterSelects() {
  document.querySelectorAll('.filter-select').forEach(el => el.classList.remove('open'));
}

// Count how many recipes match the pending filters (for live preview in popover)
function countPendingFilterResults() {
  return filterRecipes({
    tag: pendingTag,
    minRating: pendingMinRating,
    favoritesOnly: showFavoritesOnly,
    searchQuery: document.getElementById('search-input').value,
  }).length;
}

// Render tag and rating dropdown options using pending state
function renderFilterDropdowns() {
  const filterBtn = document.getElementById('tag-filter-btn');
  const resetBtn = document.getElementById('filter-reset-btn');
  const applyBtn = document.getElementById('filter-apply-btn');

  // Tag dropdown
  const tags = [...new Set(cachedAllRecipes.flatMap(r => r.tags))].sort();
  const tagOptions = document.getElementById('tag-options');
  const tagBtn = document.getElementById('tag-select-btn');

  tagOptions.innerHTML = `<button class="filter-option${!pendingTag ? ' active' : ''}" data-value="">All</button>`
    + tags.map(tag =>
      `<button class="filter-option${pendingTag === tag ? ' active' : ''}" data-value="${tag}">${tag}</button>`
    ).join('');

  tagBtn.textContent = pendingTag || 'All';
  tagBtn.classList.toggle('has-value', !!pendingTag);

  tagOptions.querySelectorAll('.filter-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      pendingTag = opt.dataset.value || null;
      document.getElementById('tag-select').classList.remove('open');
      renderFilterDropdowns();
    });
  });

  // Rating dropdown
  const ratingOptions = document.getElementById('rating-options');
  const ratingBtn = document.getElementById('rating-select-btn');
  const ratingChoices = [
    { value: '', label: 'Any' },
    { value: '3', label: '3+ stars' },
    { value: '4', label: '4+ stars' },
    { value: '5', label: '5 stars' },
  ];

  ratingOptions.innerHTML = ratingChoices.map(c =>
    `<button class="filter-option${String(pendingMinRating || '') === c.value ? ' active' : ''}" data-value="${c.value}">${c.label}</button>`
  ).join('');

  ratingBtn.textContent = pendingMinRating ? `${pendingMinRating}+ stars` : 'Any';
  if (pendingMinRating === 5) ratingBtn.textContent = '5 stars';
  ratingBtn.classList.toggle('has-value', !!pendingMinRating);

  ratingOptions.querySelectorAll('.filter-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      pendingMinRating = opt.dataset.value ? parseInt(opt.dataset.value) : null;
      document.getElementById('rating-select').classList.remove('open');
      renderFilterDropdowns();
    });
  });

  // Show/hide reset button
  const hasPendingFilters = !!pendingTag || !!pendingMinRating;
  resetBtn.style.display = hasPendingFilters ? '' : 'none';

  // Update filter icon active state based on applied filters
  const hasActiveFilters = !!activeTag || !!activeMinRating;
  filterBtn.classList.toggle('active', hasActiveFilters);

  // Live result count on the apply button
  const count = countPendingFilterResults();
  applyBtn.textContent = count === 0
    ? 'No recipes match'
    : `Show ${count} recipe${count !== 1 ? 's' : ''}`;
  applyBtn.disabled = count === 0;
}

// Set active tag, update URL, and reload
function setActiveTag(tag) {
  activeTag = tag;
  updateFilterURL();
  loadRecipes();
}

function updateFilterURL() {
  const url = new URL(window.location);
  if (activeTag) {
    url.searchParams.set('tag', activeTag);
  } else {
    url.searchParams.delete('tag');
  }
  history.replaceState(null, '', url);
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

  // Fetch cooking stats for all cards (ratings already cached)
  const cookingStats = await getCookingStatsMap();
  const ratingsMap = cachedRatingsMap;

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
      // Keep cached favorites in sync
      if (newState) cachedFavoriteIds.add(recipe.id);
      else cachedFavoriteIds.delete(recipe.id);
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

// Side Drawer
function setupDrawer() {
  const drawer = document.getElementById('drawer');
  const drawerBtn = document.getElementById('drawer-btn');
  const closeBtn = document.getElementById('drawer-close');
  const overlay = drawer.querySelector('.drawer-overlay');

  function openDrawer() {
    drawer.style.display = '';
  }

  function closeDrawer() {
    drawer.style.display = 'none';
  }

  drawerBtn.addEventListener('click', openDrawer);
  closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.style.display !== 'none') {
      closeDrawer();
    }
  });

  checkWhatsNewDot();
}

function updateDrawerDot() {
  const dots = document.querySelectorAll('.drawer-item-dot');
  const hasAny = [...dots].some(dot => dot.style.display !== 'none');
  document.getElementById('drawer-dot').style.display = hasAny ? '' : 'none';
}

// Check if there are unseen changelog entries and show dot
async function checkWhatsNewDot() {
  if (typeof CHANGELOG === 'undefined' || CHANGELOG.length === 0) return;

  const latestId = CHANGELOG[0].id;
  const lastSeenId = await getSetting('lastSeenChangelogId');

  // First visit — mark all as seen, no dot
  if (lastSeenId === null) {
    await setSetting('lastSeenChangelogId', latestId);
  } else if (latestId > lastSeenId) {
    document.getElementById('drawer-whats-new-dot').style.display = '';
    updateDrawerDot();
  }
}
