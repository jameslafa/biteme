// Main app logic for recipe list page

let showFavoritesOnly = false;
let showUntestedRecipes = false;
let activeCuisine = null;
let activeMealType = null;
let cachedAllRecipes = [];
let cachedRatingsMap = {};
let cachedFavoriteIds = new Set();
let activeDietaryFilters = [];
let mealTypeChipsExpanded = false;
let cuisineChipsExpanded = false;

document.addEventListener('DOMContentLoaded', async function() {
  await initDB();

  // Restore filter state from localStorage
  showFavoritesOnly = localStorage.getItem('showFavoritesOnly') === 'true';

  // Load untested setting from IndexedDB
  showUntestedRecipes = !!(await getSetting('showUntestedRecipes'));

  // Load dietary filters from IndexedDB
  activeDietaryFilters = (await getSetting('dietaryFilters')) || [];

  // Read cuisine/meal_type filters from URL params
  const urlParams = new URLSearchParams(window.location.search);
  activeCuisine = urlParams.get('cuisine') || null;
  activeMealType = urlParams.get('meal_type') || null;

  loadRecipes();
  setupSearch();
  setupFavoritesFilter();
  setupSurpriseBtn();
  updateCartCount();
  setupDrawer();
  checkFirstVisitNudge();
  showMealPlanBanner();
  showRatingBannerIfNeeded();
  setupPullToRefresh();

  // Re-render chips when window is resized (dynamic visible count depends on container width)
  let chipResizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(chipResizeTimer);
    chipResizeTimer = setTimeout(renderChips, 150);
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

// Single filter function used by loadRecipes
function filterRecipes({ cuisine, mealType, favoritesOnly, searchQuery }) {
  let recipes = cachedAllRecipes;

  if (!showUntestedRecipes) {
    recipes = recipes.filter(r => r.tested !== false);
  }

  if (activeDietaryFilters.length > 0) {
    recipes = recipes.filter(r => activeDietaryFilters.every(d => (r.diet || []).includes(d)));
  }

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
        if ((recipe.cuisine || []).some(c => c.toLowerCase().includes(lowerQuery))) score += 2;
        if ((recipe.meal_type || []).some(m => m.toLowerCase().includes(lowerQuery))) score += 1;
        if (Object.values(recipe.ingredients).some(group =>
          group.some(ing => ing.text.toLowerCase().includes(lowerQuery))
        )) score += 1;
        return { recipe, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(r => r.recipe);
  }

  if (cuisine) {
    recipes = recipes.filter(r => (r.cuisine || []).includes(cuisine));
  }

  if (mealType) {
    recipes = recipes.filter(r => (r.meal_type || []).includes(mealType));
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
    cuisine: activeCuisine,
    mealType: activeMealType,
    favoritesOnly: showFavoritesOnly,
    searchQuery: document.getElementById('search-input').value,
  });

  await displayRecipes(recipes);
  renderChips();
}

// Set active cuisine with bidirectionality check, update URL, and reload
function setActiveCuisine(cuisine) {
  activeCuisine = cuisine;
  if (activeCuisine && activeMealType) {
    const available = cachedAllRecipes
      .filter(r => showUntestedRecipes || r.tested !== false)
      .filter(r => (r.cuisine || []).includes(activeCuisine))
      .flatMap(r => r.meal_type || []);
    if (!available.includes(activeMealType)) activeMealType = null;
  }
  updateFilterURL();
  loadRecipes();
}

// Set active meal type with bidirectionality check, update URL, and reload
function setActiveMealType(mealType) {
  activeMealType = mealType;
  if (activeMealType && activeCuisine) {
    const available = cachedAllRecipes
      .filter(r => showUntestedRecipes || r.tested !== false)
      .filter(r => (r.meal_type || []).includes(activeMealType))
      .flatMap(r => r.cuisine || []);
    if (!available.includes(activeCuisine)) activeCuisine = null;
  }
  updateFilterURL();
  loadRecipes();
}

function updateFilterURL() {
  const url = new URL(window.location);
  if (activeCuisine) {
    url.searchParams.set('cuisine', activeCuisine);
  } else {
    url.searchParams.delete('cuisine');
  }
  if (activeMealType) {
    url.searchParams.set('meal_type', activeMealType);
  } else {
    url.searchParams.delete('meal_type');
  }
  history.replaceState(null, '', url);
}

function renderChips() {
  let base = cachedAllRecipes;
  if (!showUntestedRecipes) base = base.filter(r => r.tested !== false);
  if (activeDietaryFilters.length > 0)
    base = base.filter(r => activeDietaryFilters.every(d => (r.diet || []).includes(d)));

  // Meal type counts — narrowed by active cuisine
  const mealTypePool = activeCuisine
    ? base.filter(r => (r.cuisine || []).includes(activeCuisine))
    : base;
  const mealTypeCounts = {};
  for (const r of mealTypePool)
    for (const m of (r.meal_type || [])) mealTypeCounts[m] = (mealTypeCounts[m] || 0) + 1;

  // Cuisine counts — narrowed by active meal_type
  const cuisinePool = activeMealType
    ? base.filter(r => (r.meal_type || []).includes(activeMealType))
    : base;
  const cuisineCounts = {};
  for (const r of cuisinePool)
    for (const c of (r.cuisine || [])) cuisineCounts[c] = (cuisineCounts[c] || 0) + 1;

  renderChipRow(
    document.getElementById('meal-type-chips'),
    mealTypeCounts, activeMealType, 'mealType',
    mealTypeChipsExpanded, v => { mealTypeChipsExpanded = v; }
  );
  renderChipRow(
    document.getElementById('cuisine-chips'),
    cuisineCounts, activeCuisine, 'cuisine',
    cuisineChipsExpanded, v => { cuisineChipsExpanded = v; }
  );
}

function renderChipRow(container, counts, activeValue, type, expanded, setExpanded) {
  const sorted = Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));

  if (sorted.length === 0) { container.innerHTML = ''; return; }

  const makeChip = (value, extra = '') =>
    `<button class="chip${activeValue === value ? ' chip-active' : ''}${extra}" data-type="${type}" data-value="${value}">${value}</button>`;

  if (expanded) {
    container.innerHTML = sorted.map((v, i) => makeChip(v, i > 0 ? ` chip-new" style="animation-delay:${(i - 1) * 40}ms` : '')).join('');
  } else {
    // Render all chips to measure actual widths, then trim to what fits
    container.innerHTML = sorted.map(v => makeChip(v)).join('');

    const chips = [...container.querySelectorAll('.chip')];
    const containerWidth = container.clientWidth;

    if (containerWidth > 0 && chips.length > 0) {
      const GAP = 8; // 0.5rem gap between chips
      const MORE_BTN_WIDTH = 96; // approximate width of "+N more" button

      // Check if all chips fit without a "more" button
      const totalWidth = chips.reduce((s, c, i) => s + c.offsetWidth + (i > 0 ? GAP : 0), 0);

      if (totalWidth > containerWidth) {
        // Find how many chips fit alongside a "more" button
        let usedWidth = 0;
        let cutoff = 0;

        for (let i = 0; i < chips.length; i++) {
          const chipWidth = chips[i].offsetWidth + GAP;
          if (usedWidth + chipWidth + MORE_BTN_WIDTH + GAP > containerWidth) {
            cutoff = Math.max(1, i);
            break;
          }
          usedWidth += chipWidth;
          cutoff = i + 1;
        }

        if (cutoff < sorted.length) {
          const visible = sorted.slice(0, cutoff);
          const hidden = sorted.slice(cutoff);

          // Promote active chip out of hidden into the last visible slot
          if (activeValue && hidden.includes(activeValue)) {
            const displaced = visible.splice(cutoff - 1, 1, activeValue)[0];
            hidden.splice(hidden.indexOf(activeValue), 1);
            hidden.unshift(displaced);
          }

          container.innerHTML =
            visible.map(v => makeChip(v)).join('') +
            `<button class="chip chip-more">+${hidden.length} more</button>`;
        }
      }
    }
  }

  container.querySelectorAll('.chip:not(.chip-more)').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.value;
      if (type === 'mealType') setActiveMealType(activeMealType === val ? null : val);
      else setActiveCuisine(activeCuisine === val ? null : val);
    });
  });

  container.querySelector('.chip-more')?.addEventListener('click', () => {
    setExpanded(true);
    renderChips();
  });
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

// Diet badge config: letter(s) in a circle
const DIET_BADGES = {
  vegan: { label: 'V', title: 'Vegan', color: '#6B9080' },
  vegetarian: { label: 'Vg', title: 'Vegetarian', color: '#b8860b' },
  'gluten-free': { label: 'GF', title: 'Gluten-free', color: '#C4A882' },
};

function renderDietIcons(diet) {
  if (!diet || diet.length === 0) return '';
  const badges = diet
    .filter(d => DIET_BADGES[d])
    .map(d => {
      const b = DIET_BADGES[d];
      return `<span class="diet-badge" title="${b.title}" style="--diet-color:${b.color}">${b.label}</span>`;
    })
    .join('');
  return badges ? `<span class="diet-icons">${badges}</span>` : '';
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
        activeCuisine = null;
        activeMealType = null;
        updateFilterURL();
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
        activeCuisine = null;
        activeMealType = null;
        updateFilterURL();
        loadRecipes();
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
          ${icon('heart', 20)}
        </button>
      </div>
      <p class="recipe-description">${recipe.description}</p>
      <div class="recipe-tags">
        <div class="recipe-tags-left">
          ${recipe.tested === false ? '<span class="tag tag-untested">untested</span>' : ''}
          ${(recipe.meal_type || []).map(m => `<button class="tag tag-meal-type${activeMealType === m ? ' active' : ''}" data-meal-type="${m}">${m}</button>`).join('')}
          ${(recipe.cuisine || []).map(c => `<button class="tag tag-cuisine${activeCuisine === c ? ' active' : ''}" data-cuisine="${c}">${c}</button>`).join('')}
        </div>
        ${renderDietIcons(recipe.diet || [])}
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

  // Setup cuisine click handlers on cards
  recipeGrid.querySelectorAll('.recipe-card .tag-cuisine').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setActiveCuisine(btn.dataset.cuisine === activeCuisine ? null : btn.dataset.cuisine);
    });
  });

  // Setup meal type click handlers on cards
  recipeGrid.querySelectorAll('.recipe-card .tag-meal-type').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setActiveMealType(btn.dataset.mealType === activeMealType ? null : btn.dataset.mealType);
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

// Show a nudge for first-time visitors pointing to the How It Works page
async function checkFirstVisitNudge() {
  const hasSeen = await getSetting('hasSeenHowItWorks');
  if (hasSeen) return;

  const nudge = document.getElementById('first-visit-nudge');
  if (!nudge) return;

  nudge.style.display = '';

  document.getElementById('nudge-dismiss').addEventListener('click', async () => {
    nudge.style.display = 'none';
    await setSetting('hasSeenHowItWorks', true);
  });
}

// Meal plan banner

function showMealPlanBanner() {
  const banner = document.getElementById('meal-plan-banner');
  if (!banner) return;

  const finalizedAt = localStorage.getItem('plan_finalized_at');
  if (!finalizedAt) return;

  let plan;
  try { plan = JSON.parse(localStorage.getItem('meal_plan') || '[]'); }
  catch { return; }
  if (!plan.length) return;

  const cooked = plan.filter(e => e.cooked_at !== null && e.cooked_at !== false).length;
  const total = plan.length;
  if (cooked === total) return;

  const text = cooked === 0
    ? `This week's plan — ${total} recipe${total !== 1 ? 's' : ''} to cook`
    : `This week: ${cooked} of ${total} recipes cooked`;

  document.getElementById('meal-plan-banner-text').textContent = text;
  banner.style.display = 'flex';
}

// Surprise Me feature

function getSurpriseHistory() {
  try {
    return JSON.parse(localStorage.getItem('surpriseHistory') || '[]');
  } catch {
    return [];
  }
}

function addToSurpriseHistory(id) {
  const history = getSurpriseHistory();
  history.push(id);
  localStorage.setItem('surpriseHistory', JSON.stringify(history.slice(-10)));
}

async function pickSurpriseRecipe(filtered) {
  if (filtered.length === 0) return null;

  const history = getSurpriseHistory();
  const statsMap = await getCookingStatsMap();
  const cookedIds = new Set(Object.keys(statsMap));

  const notInHistory = r => !history.includes(r.id);

  const tier1 = filtered.filter(r => !cookedIds.has(r.id) && notInHistory(r));
  const tier2 = filtered.filter(r => r.tested === false && notInHistory(r));
  const tier3 = filtered.filter(notInHistory);
  const tier4 = filtered;

  const pool = [tier1, tier2, tier3, tier4].find(t => t.length > 0);
  const picked = pool[Math.floor(Math.random() * pool.length)];
  addToSurpriseHistory(picked.id);
  return picked;
}

async function triggerSurprise() {
  const filtered = filterRecipes({
    cuisine: activeCuisine,
    mealType: activeMealType,
    favoritesOnly: showFavoritesOnly,
    searchQuery: document.getElementById('search-input').value,
  });

  if (filtered.length === 0) return;

  const picked = await pickSurpriseRecipe(filtered);
  if (picked) viewRecipe(picked.id);
}

function setupSurpriseBtn() {
  document.getElementById('surprise-btn').addEventListener('click', () => {
    triggerSurprise();
  });
}

// Pull-to-refresh: swipe down from the top to force-fetch latest recipes
function setupPullToRefresh() {
  const THRESHOLD = 80;        // pull distance (px) needed to trigger refresh
  const INDICATOR_HEIGHT = 52; // must match CSS

  const indicator = document.createElement('div');
  indicator.id = 'ptr-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  indicator.innerHTML = `
    <svg class="ptr-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="1 4 1 10 7 10"></polyline>
      <polyline points="23 20 23 14 17 14"></polyline>
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"></path>
    </svg>
    <span class="ptr-label">Pull to refresh</span>
  `;

  const main = document.querySelector('main');
  main.insertBefore(indicator, main.firstChild);

  let startY = 0;
  let isPulling = false;
  let isRefreshing = false;

  function setHeight(px, animated) {
    indicator.style.transition = animated ? 'height 0.25s ease' : 'none';
    indicator.style.height = `${px}px`;
  }

  function reset() {
    setHeight(0, true);
    indicator.classList.remove('ptr-ready', 'ptr-refreshing');
    isRefreshing = false;
  }

  document.addEventListener('touchstart', (e) => {
    if (isRefreshing || window.scrollY !== 0) return;
    startY = e.touches[0].clientY;
    isPulling = true;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!isPulling || isRefreshing) return;

    const distance = e.touches[0].clientY - startY;
    if (distance <= 0) {
      isPulling = false;
      return;
    }

    e.preventDefault(); // prevent native pull-to-refresh
    const height = Math.min((distance / THRESHOLD) * INDICATOR_HEIGHT, INDICATOR_HEIGHT);
    setHeight(height, false);
    indicator.classList.toggle('ptr-ready', distance >= THRESHOLD);
    indicator.querySelector('.ptr-label').textContent = distance >= THRESHOLD ? 'Release to refresh' : 'Pull to refresh';
  }, { passive: false });

  document.addEventListener('touchend', async (e) => {
    if (!isPulling || isRefreshing) return;
    isPulling = false;

    const distance = e.changedTouches[0].clientY - startY;
    if (distance < THRESHOLD) {
      reset();
      return;
    }

    // Snap to full height and show spinner
    isRefreshing = true;
    setHeight(INDICATOR_HEIGHT, true);
    indicator.classList.remove('ptr-ready');
    indicator.classList.add('ptr-refreshing');

    const label = indicator.querySelector('.ptr-label');

    if (!navigator.onLine) {
      label.textContent = 'No connection';
    } else {
      label.textContent = 'Refreshing…';
      const ok = await forceRefreshRecipes();
      if (ok) {
        await loadRecipes();
        label.textContent = 'Up to date';
      } else {
        label.textContent = 'Could not refresh';
      }
    }

    setTimeout(reset, 1200);
  }, { passive: true });
}
