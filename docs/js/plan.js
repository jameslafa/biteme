// Meal Plan — ingredient-efficiency based weekly planner.
// Relies on globals from: recommendations.js (CATEGORY_WEIGHT, buildRecipeIngredientMaps,
// computeIDF), db.js (initDB, getSetting, addToShoppingList, removeFromShoppingList,
// getAllShoppingListItems, getShoppingListCount, getAllCompletedSessions, getAllFavorites),
// servings.js (getServings, setServings, scaleIngredientText), recipes.js (getRecipes).

// ─── Module state ──────────────────────────────────────────────────────────

let _allRecipes = [];
let _ingredientMaps = null;
let _idf = null;
let _pairwiseMatrix = null;
let _corpusIds = [];
let _seedRecipe = null;
let _currentPlan = [];
let _defaultServings = 4;
let _planFinalizedAt = null;
let _suggestionsActive = false;

// ─── Persistence ──────────────────────────────────────────────────────────

function loadPlan() {
  try { return JSON.parse(localStorage.getItem('meal_plan') || '[]'); }
  catch { return []; }
}

function savePlan(plan) {
  try { localStorage.setItem('meal_plan', JSON.stringify(plan)); }
  catch {}
}

function loadPlanN() {
  const n = parseInt(localStorage.getItem('plan_n') || '4', 10);
  return (n >= 2 && n <= 8) ? n : 4;
}

function savePlanN(n) {
  try { localStorage.setItem('plan_n', String(n)); }
  catch {}
}

function loadPlanServings() {
  const n = parseInt(localStorage.getItem('plan_servings') || '4', 10);
  return (n >= 1 && n <= 12) ? n : 4;
}

function savePlanServings(n) {
  try { localStorage.setItem('plan_servings', String(n)); }
  catch {}
}

function loadPlanFinalizedAt() {
  const v = localStorage.getItem('plan_finalized_at');
  return v ? parseInt(v, 10) : null;
}

function savePlanFinalizedAt(ts) {
  try { localStorage.setItem('plan_finalized_at', String(ts)); }
  catch {}
}

function clearPlanFinalizedAt() {
  try { localStorage.removeItem('plan_finalized_at'); }
  catch {}
}

// ─── Utilities ────────────────────────────────────────────────────────────

function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// runSuggest is a function declaration so it's hoisted — safe to reference here
const debouncedSuggest = debounce(runSuggest, 50);

// ─── Algorithm ────────────────────────────────────────────────────────────

function pairScore(mapA, mapB, idf) {
  let score = 0;
  for (const [canonical, catA] of mapA) {
    if (mapB.has(canonical)) {
      const catB = mapB.get(canonical);
      const weight = Math.max(CATEGORY_WEIGHT[catA] || 1, CATEGORY_WEIGHT[catB] || 1);
      score += (idf.get(canonical) || 0) * weight;
    }
  }
  return score;
}

function buildPairwiseMatrix(ids, ingredientMaps, idf) {
  const matrix = new Map();
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const mapA = ingredientMaps.get(a);
      const mapB = ingredientMaps.get(b);
      if (mapA && mapB) matrix.set(key, pairScore(mapA, mapB, idf));
    }
  }
  return matrix;
}

function getPairScore(matrix, a, b) {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  return matrix.get(key) || 0;
}

function suggestPlanIds(n, ids, matrix, seedId) {
  if (ids.length === 0) return [];
  if (ids.length <= n) return [...ids];

  let selected;

  if (seedId && ids.includes(seedId)) {
    let bestCompanion = ids.find(id => id !== seedId);
    let bestScore = -1;
    for (const id of ids) {
      if (id === seedId) continue;
      const s = getPairScore(matrix, seedId, id);
      if (s > bestScore) { bestScore = s; bestCompanion = id; }
    }
    selected = [seedId, bestCompanion];
  } else {
    let bestPair = [ids[0], ids[1]], bestScore = -1;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const s = getPairScore(matrix, ids[i], ids[j]);
        if (s > bestScore) { bestScore = s; bestPair = [ids[i], ids[j]]; }
      }
    }
    selected = bestPair;
  }

  while (selected.length < n) {
    const remaining = ids.filter(id => !selected.includes(id));
    if (remaining.length === 0) break;
    let bestNext = remaining[0], bestNextScore = -1;
    for (const id of remaining) {
      const contrib = selected.reduce((sum, sel) => sum + getPairScore(matrix, sel, id), 0);
      if (contrib > bestNextScore) { bestNextScore = contrib; bestNext = id; }
    }
    selected.push(bestNext);
  }

  return selected;
}

function getSwapAlternatives(planIds, swapId, allIds, matrix) {
  const keeping = planIds.filter(id => id !== swapId);
  return allIds
    .filter(id => !planIds.includes(id))
    .map(id => ({
      id,
      score: keeping.reduce((sum, sel) => sum + getPairScore(matrix, sel, id), 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.id);
}

function getPlanSharedIngredients(planIds, ingredientMaps) {
  const counts = new Map();
  for (const id of planIds) {
    const m = ingredientMaps.get(id);
    if (!m) continue;
    for (const canonical of m.keys()) {
      counts.set(canonical, (counts.get(canonical) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([canonical]) => canonical)
    .slice(0, 8);
}

function sourceKey(item) {
  return item.sources.map(s => `${s.recipeId}:${s.ingredientId}`).join(',');
}

function getMergedIngredients(plan, allRecipes) {
  const groups = new Map(); // canonical → { category, sources[] }
  for (const entry of plan) {
    const recipe = allRecipes.find(r => r.id === entry.recipe_id);
    if (!recipe) continue;
    const ratio = entry.servings / recipe.servings;
    for (const [category, ingredients] of Object.entries(recipe.ingredients)) {
      for (const ing of ingredients) {
        if (!ing.id) continue;
        const canonical = ing.canonical || ing.text;
        if (isStopIngredient(canonical)) continue;
        if (!groups.has(canonical)) groups.set(canonical, { category, sources: [] });
        groups.get(canonical).sources.push({
          recipeId: recipe.id,
          scaledText: scaleIngredientText(ing, ratio, { omitPreparation: true }),
          ingredientId: ing.id,
        });
      }
    }
  }
  return [...groups.entries()].map(([canonical, { category, sources }]) => ({ canonical, category, sources }));
}

// ─── Select ───────────────────────────────────────────────────────────────

async function loadSelectData() {
  const [favorites, sessions] = await Promise.all([
    getAllFavorites(),
    getAllCompletedSessions(),
  ]);

  const seenCooked = new Set();
  const lastCooked = [];
  sessions.sort((a, b) => b.completed_at - a.completed_at);
  for (const s of sessions) {
    if (seenCooked.has(s.recipe_id)) continue;
    const recipe = _allRecipes.find(r => r.id === s.recipe_id);
    if (recipe && _ingredientMaps.has(s.recipe_id)) {
      lastCooked.push(recipe);
      seenCooked.add(s.recipe_id);
      if (lastCooked.length >= 5) break;
    }
  }

  const favRecipes = [];
  for (const f of favorites) {
    const recipe = _allRecipes.find(r => r.id === f.recipe_id);
    if (recipe && _ingredientMaps.has(f.recipe_id)) {
      favRecipes.push(recipe);
      if (favRecipes.length >= 5) break;
    }
  }

  return { favorites: favRecipes, lastCooked };
}

function renderSelect(data) {
  const sel = document.getElementById('plan-seed-select');
  sel.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose a recipe…';
  placeholder.disabled = true;
  placeholder.selected = !_seedRecipe;
  sel.appendChild(placeholder);

  const anyOpt = document.createElement('option');
  anyOpt.value = '__any__';
  anyOpt.textContent = 'Any recipe';
  sel.appendChild(anyOpt);

  if (data.favorites.length > 0) {
    const grp = document.createElement('optgroup');
    grp.label = 'Favourites';
    data.favorites.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  }

  if (data.lastCooked.length > 0) {
    const grp = document.createElement('optgroup');
    grp.label = 'Last cooked';
    data.lastCooked.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  }

  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = 'Let me choose…';
  sel.appendChild(customOpt);

  // Restore selected seed if any
  if (_seedRecipe) sel.value = _seedRecipe.id;
}

function showCustomSearch() {
  document.getElementById('plan-seed-search-wrap').style.display = 'block';
  document.getElementById('plan-seed-search').focus();
}

function hideCustomSearch() {
  document.getElementById('plan-seed-search-wrap').style.display = 'none';
  document.getElementById('plan-seed-search').value = '';
  document.getElementById('plan-seed-results').style.display = 'none';
}

// ─── Seed selection ───────────────────────────────────────────────────────

function selectSeed(recipe) {
  _seedRecipe = recipe;
  _suggestionsActive = true;
  hideCustomSearch();

  const sel = document.getElementById('plan-seed-select');
  if (sel) {
    // Ensure the option exists (e.g. when called from ?seed= URL before renderSelect runs)
    if (!sel.querySelector(`option[value="${recipe.id}"]`)) {
      const opt = document.createElement('option');
      opt.value = recipe.id;
      opt.textContent = recipe.name;
      const customOpt = sel.querySelector('option[value="__custom__"]');
      customOpt ? sel.insertBefore(opt, customOpt) : sel.appendChild(opt);
    }
    sel.value = recipe.id;
  }

  if (!_ingredientMaps.has(recipe.id)) {
    showSeedWarning(recipe.name);
  } else {
    document.getElementById('plan-seed-warning').style.display = 'none';
    debouncedSuggest();
  }
}

function clearSeed() {
  _seedRecipe = null;
  _suggestionsActive = true;
  document.getElementById('plan-seed-warning').style.display = 'none';
  hideCustomSearch();
  const sel = document.getElementById('plan-seed-select');
  if (sel) sel.value = '__any__';
  debouncedSuggest();
}

function showSeedWarning(recipeName) {
  const el = document.getElementById('plan-seed-warning');
  el.textContent = `${recipeName} is excluded by your dietary filters and won't appear in suggestions.`;
  el.style.display = 'block';
}

function setupSeedSelect() {
  const sel = document.getElementById('plan-seed-select');
  const input = document.getElementById('plan-seed-search');
  const resultsEl = document.getElementById('plan-seed-results');

  sel.addEventListener('change', () => {
    const val = sel.value;
    if (val === '__any__') {
      clearSeed();
    } else if (val === '__custom__') {
      _seedRecipe = null;
      showCustomSearch();
    } else if (val !== '') {
      const recipe = _allRecipes.find(r => r.id === val);
      if (recipe) selectSeed(recipe);
    }
  });

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { resultsEl.style.display = 'none'; return; }

    const matches = _allRecipes
      .filter(r => r.name.toLowerCase().includes(q))
      .slice(0, 6);

    if (matches.length === 0) { resultsEl.style.display = 'none'; return; }

    resultsEl.innerHTML = matches
      .map(r => `<div class="plan-seed-result" data-id="${r.id}">${r.name}</div>`)
      .join('');
    resultsEl.style.display = 'block';

    resultsEl.querySelectorAll('.plan-seed-result').forEach(el => {
      el.addEventListener('click', () => {
        const recipe = _allRecipes.find(r => r.id === el.dataset.id);
        if (recipe) {
          selectSeed(recipe);
          // Add the chosen recipe as a real option in the select so it persists
          let opt = sel.querySelector(`option[value="${recipe.id}"]`);
          if (!opt) {
            opt = document.createElement('option');
            opt.value = recipe.id;
            opt.textContent = recipe.name;
            sel.insertBefore(opt, sel.querySelector('option[value="__custom__"]'));
          }
          sel.value = recipe.id;
        }
      });
    });
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#plan-seed-search-wrap')) resultsEl.style.display = 'none';
  });
}

// ─── N selector ───────────────────────────────────────────────────────────

function renderNSelector(activeN) {
  const container = document.getElementById('plan-n-selector');
  container.innerHTML = '';
  for (let n = 2; n <= 8; n++) {
    const btn = document.createElement('button');
    btn.className = 'plan-n-btn' + (n === activeN ? ' active' : '');
    btn.textContent = n;
    btn.dataset.n = n;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.plan-n-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      savePlanN(n);
      if (_suggestionsActive) debouncedSuggest();
    });
    container.appendChild(btn);
  }
}

function getSelectedN() {
  const active = document.querySelector('.plan-n-btn.active');
  return active ? parseInt(active.dataset.n, 10) : 4;
}

// ─── Default servings controls ────────────────────────────────────────────

function setupServingsControls() {
  const countEl = document.getElementById('plan-servings-count');

  document.getElementById('plan-servings-dec').addEventListener('click', () => {
    if (_defaultServings > 1) {
      _defaultServings--;
      countEl.textContent = _defaultServings;
      savePlanServings(_defaultServings);
      if (_suggestionsActive) debouncedSuggest();
    }
  });

  document.getElementById('plan-servings-inc').addEventListener('click', () => {
    if (_defaultServings < 12) {
      _defaultServings++;
      countEl.textContent = _defaultServings;
      savePlanServings(_defaultServings);
      if (_suggestionsActive) debouncedSuggest();
    }
  });
}

// ─── Cart count ───────────────────────────────────────────────────────────

async function updateCartCount() {
  const count = await getShoppingListCount();
  const badge = document.getElementById('cart-count');
  if (!badge) return;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

// ─── Suggest ──────────────────────────────────────────────────────────────

async function runSuggest() {
  if (_corpusIds.length === 0) {
    document.getElementById('plan-results').style.display = 'none';
    document.getElementById('plan-empty').style.display = 'block';
    return;
  }

  document.getElementById('plan-results').style.display = 'none';
  document.getElementById('plan-empty').style.display = 'none';

  // Yield to allow UI to update before the synchronous matrix work
  await new Promise(resolve => setTimeout(resolve, 0));

  const n = getSelectedN();
  const seedId = _seedRecipe && _ingredientMaps.has(_seedRecipe.id) ? _seedRecipe.id : null;
  const planIds = suggestPlanIds(n, _corpusIds, _pairwiseMatrix, seedId);

  _currentPlan = planIds.map(id => ({ recipe_id: id, servings: _defaultServings }));
  savePlan(_currentPlan);

  renderPlan();
  document.getElementById('plan-results').style.display = 'block';
}

// ─── Plan rendering ───────────────────────────────────────────────────────

function renderPlan() {
  renderCards();
  renderSharedIngredients();
  renderIngredientList();
}

function renderCards() {
  const container = document.getElementById('plan-cards');
  container.innerHTML = _currentPlan.map(entry => {
    const recipe = _allRecipes.find(r => r.id === entry.recipe_id);
    if (!recipe) return '';
    return `
      <div class="plan-card" data-recipe-id="${recipe.id}">
        <a href="recipe.html?id=${recipe.id}" class="plan-card-title">${recipe.name}</a>
        <p class="plan-card-description">${recipe.description}</p>
        <div class="plan-card-footer">
          <div class="plan-card-servings">
            <button class="plan-servings-btn plan-servings-dec" data-recipe-id="${recipe.id}" aria-label="Decrease servings">−</button>
            <span class="plan-servings-count">${entry.servings}</span>
            <span class="plan-servings-label">servings</span>
            <button class="plan-servings-btn plan-servings-inc" data-recipe-id="${recipe.id}" aria-label="Increase servings">+</button>
          </div>
          <button class="plan-swap-btn" data-recipe-id="${recipe.id}">Find alternative</button>
        </div>
        <div class="plan-swap-panel" id="swap-panel-${recipe.id}" style="display: none;"></div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.plan-swap-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleSwapPanel(btn.dataset.recipeId));
  });
  container.querySelectorAll('.plan-servings-dec').forEach(btn => {
    btn.addEventListener('click', () => adjustServings(btn.dataset.recipeId, -1));
  });
  container.querySelectorAll('.plan-servings-inc').forEach(btn => {
    btn.addEventListener('click', () => adjustServings(btn.dataset.recipeId, 1));
  });
}

function toggleSwapPanel(recipeId) {
  const panel = document.getElementById(`swap-panel-${recipeId}`);
  const btn = document.querySelector(`.plan-swap-btn[data-recipe-id="${recipeId}"]`);

  if (panel.style.display !== 'none') {
    panel.style.display = 'none';
    btn.classList.remove('active');
    return;
  }

  document.querySelectorAll('.plan-swap-panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.plan-swap-btn').forEach(b => b.classList.remove('active'));

  const planIds = _currentPlan.map(e => e.recipe_id);
  const altIds = getSwapAlternatives(planIds, recipeId, _corpusIds, _pairwiseMatrix);

  if (altIds.length === 0) {
    panel.innerHTML = `<p class="plan-swap-panel-label">No alternatives available.</p>`;
  } else {
    panel.innerHTML = `
      <p class="plan-swap-panel-label">Swap with:</p>
      <div class="plan-swap-alternatives">
        ${altIds.map(id => {
          const r = _allRecipes.find(rec => rec.id === id);
          return r ? `<button class="plan-swap-alt" data-swap-to="${id}">${r.name}</button>` : '';
        }).join('')}
      </div>
    `;
    panel.querySelectorAll('.plan-swap-alt').forEach(btn => {
      btn.addEventListener('click', () => swapRecipe(recipeId, btn.dataset.swapTo));
    });
  }

  panel.style.display = 'block';
  btn.classList.add('active');
}

function swapRecipe(oldId, newId) {
  const entry = _currentPlan.find(e => e.recipe_id === oldId);
  if (!entry) return;
  const newRecipe = _allRecipes.find(r => r.id === newId);
  if (!newRecipe) return;

  entry.recipe_id = newId;
  entry.servings = _defaultServings;
  savePlan(_currentPlan);

  renderPlan();
}

function adjustServings(recipeId, delta) {
  const entry = _currentPlan.find(e => e.recipe_id === recipeId);
  if (!entry) return;
  entry.servings = Math.max(1, entry.servings + delta);
  savePlan(_currentPlan);

  const card = document.querySelector(`.plan-card[data-recipe-id="${recipeId}"]`);
  if (card) card.querySelector('.plan-servings-count').textContent = entry.servings;

  renderIngredientList();
}

function renderSharedIngredients() {
  const planIds = _currentPlan.map(e => e.recipe_id);
  const shared = getPlanSharedIngredients(planIds, _ingredientMaps);
  const el = document.getElementById('plan-shared');

  if (shared.length === 0) { el.style.display = 'none'; return; }
  document.getElementById('plan-shared-list').textContent = shared.join(' · ');
  el.style.display = 'block';
}

// ─── Ingredient list ───────────────────────────────────────────────────────

function renderIngredientList(sectionId = 'plan-ingredients-section', containerId = 'plan-ingredients', autoShow = true) {
  const section = document.getElementById(sectionId);
  const container = document.getElementById(containerId);
  if (!section || !container) return;

  const merged = getMergedIngredients(_currentPlan, _allRecipes);
  if (merged.length === 0) { if (autoShow) section.style.display = 'none'; return; }

  const CATEGORY_ORDER = ['Fresh', 'Fridge', 'Pantry', 'Spices'];
  const byCategory = new Map();
  for (const item of merged) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  }
  const orderedCategories = [
    ...CATEGORY_ORDER.filter(c => byCategory.has(c)),
    ...[...byCategory.keys()].filter(c => !CATEGORY_ORDER.includes(c)),
  ];

  for (const items of byCategory.values()) {
    items.sort((a, b) => a.canonical.localeCompare(b.canonical));
  }

  const renderItem = item => `
    <li data-sources="${sourceKey(item)}">
      <div class="ingredient-item">
        <div class="ingredient-checkbox">
          <span>${item.sources[0].scaledText}</span>
        </div>
        <button class="add-to-cart" data-sources="${sourceKey(item)}" aria-label="Add to shopping list">
          ${icon('cart', 16)}
        </button>
      </div>
    </li>
  `;

  container.innerHTML = orderedCategories.map(category => `
    <div class="ingredient-category">
      <h4>${category}</h4>
      <ul>${byCategory.get(category).map(renderItem).join('')}</ul>
    </div>
  `).join('');

  updatePlanCartButtonStates();

  container.querySelectorAll('.add-to-cart').forEach(btn => {
    btn.addEventListener('click', async () => {
      const item = merged.find(i => sourceKey(i) === btn.dataset.sources);
      if (!item) return;

      const isInCart = btn.classList.contains('in-cart');
      if (isInCart) {
        for (const source of item.sources) {
          await removeFromShoppingList(source.recipeId, source.ingredientId);
        }
      } else {
        for (const entry of _currentPlan) setServings(entry.recipe_id, entry.servings);
        for (const source of item.sources) {
          await addToShoppingList(source.recipeId, source.ingredientId);
        }
      }

      btn.classList.toggle('in-cart', !isInCart);
      btn.setAttribute('aria-label', isInCart ? 'Add to shopping list' : 'Remove from shopping list');
      await updateCartCount();
    });
  });

  if (autoShow) section.style.display = 'block';
}

async function updatePlanCartButtonStates() {
  const allItems = await getAllShoppingListItems();
  const inCartSet = new Set(allItems.map(i => `${i.recipe_id}:${i.ingredient_id}`));

  document.querySelectorAll('#plan-ingredients .add-to-cart, #plan-active-ingredients .add-to-cart').forEach(btn => {
    const allInCart = btn.dataset.sources.split(',').every(s => inCartSet.has(s));
    btn.classList.toggle('in-cart', allInCart);
    btn.setAttribute('aria-label', allInCart ? 'Remove from shopping list' : 'Add to shopping list');
  });
}

// ─── Active plan ──────────────────────────────────────────────────────────

async function syncCookedState() {
  if (!_planFinalizedAt) return;
  const sessions = await getAllCompletedSessions();
  let changed = false;
  for (const entry of _currentPlan) {
    if (entry.cooked_at !== null) continue; // already has definitive state
    const session = sessions.find(s => s.recipe_id === entry.recipe_id && s.completed_at > _planFinalizedAt);
    if (session) {
      entry.cooked_at = session.completed_at;
      changed = true;
    }
  }
  if (changed) savePlan(_currentPlan);
}

function toggleCooked(recipeId) {
  const entry = _currentPlan.find(e => e.recipe_id === recipeId);
  if (!entry) return;
  const isCooked = entry.cooked_at !== null && entry.cooked_at !== false;
  entry.cooked_at = isCooked ? false : Date.now();
  savePlan(_currentPlan);
  renderActivePlan();
}

function renderActivePlan() {
  const container = document.getElementById('plan-active-cards');
  container.innerHTML = _currentPlan.map(entry => {
    const recipe = _allRecipes.find(r => r.id === entry.recipe_id);
    if (!recipe) return '';
    const isCooked = entry.cooked_at !== null && entry.cooked_at !== false;
    return `
      <div class="plan-active-card${isCooked ? ' is-cooked' : ''}" data-recipe-id="${recipe.id}">
        <div class="plan-active-card-content">
          <span class="plan-card-title">${recipe.name}</span>
          <p class="plan-card-description">${recipe.description}</p>
        </div>
        <button class="plan-cooked-btn${isCooked ? ' is-cooked' : ''}" data-recipe-id="${recipe.id}" aria-label="${isCooked ? 'Mark as not cooked' : 'Mark as cooked'}">
          ${icon('check', 20)}
        </button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.plan-active-card').forEach(card => {
    card.addEventListener('click', () => {
      location.href = `recipe.html?id=${card.dataset.recipeId}`;
    });
  });

  container.querySelectorAll('.plan-cooked-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleCooked(btn.dataset.recipeId);
    });
  });

  const cooked = _currentPlan.filter(e => e.cooked_at !== null && e.cooked_at !== false).length;
  const total = _currentPlan.length;
  const subtitleEl = document.getElementById('plan-subtitle');
  if (subtitleEl) {
    if (cooked === total && total > 0) {
      subtitleEl.textContent = 'All recipes cooked — well done!';
    } else if (cooked === 0) {
      subtitleEl.textContent = 'Tap the check when you cook a recipe.';
    } else {
      subtitleEl.textContent = `${cooked} of ${total} recipes cooked.`;
    }
  }
}

function showActivePlan() {
  document.getElementById('plan-planning').style.display = 'none';
  document.getElementById('plan-active').style.display = 'block';
  renderIngredientList('plan-active-ingredients-section', 'plan-active-ingredients', false);

  const toggle = document.getElementById('plan-active-ingredients-toggle');
  const section = document.getElementById('plan-active-ingredients-section');
  if (toggle && !toggle._bound) {
    toggle._bound = true;
    toggle.addEventListener('click', () => {
      const open = section.style.display !== 'none';
      section.style.display = open ? 'none' : 'block';
      toggle.setAttribute('aria-expanded', String(!open));
      toggle.textContent = open ? "Show the plan's ingredient list" : 'Hide ingredient list';
    });
  }
}

function showPlanningMode() {
  document.getElementById('plan-active').style.display = 'none';
  document.getElementById('plan-planning').style.display = 'block';
  document.getElementById('plan-subtitle').textContent = "Let's plan your week together — recipes with common ingredients mean less shopping and less waste.";
}

function finalisePlan() {
  if (_currentPlan.length === 0) return;
  _planFinalizedAt = Date.now();
  savePlanFinalizedAt(_planFinalizedAt);
  for (const entry of _currentPlan) {
    if (!('cooked_at' in entry)) entry.cooked_at = null;
    setServings(entry.recipe_id, entry.servings);
  }
  savePlan(_currentPlan);
  renderActivePlan();
  showActivePlan();
}

function showSeedConfirmBanner(seedRecipe, uncookedCount) {
  const existing = document.getElementById('plan-seed-confirm');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'plan-seed-confirm';
  banner.className = 'plan-seed-confirm';
  banner.innerHTML = `
    <p class="plan-seed-confirm-title">Plan a new week around <strong>${seedRecipe.name}</strong>?</p>
    <p class="plan-seed-confirm-note">Your current plan has ${uncookedCount} uncooked recipe${uncookedCount !== 1 ? 's' : ''}.</p>
    <div class="plan-seed-confirm-actions">
      <button class="plan-seed-confirm-yes">Start new plan</button>
      <button class="plan-seed-confirm-no">Keep current plan</button>
    </div>
  `;

  const active = document.getElementById('plan-active');
  active.insertBefore(banner, active.firstChild);

  banner.querySelector('.plan-seed-confirm-yes').addEventListener('click', () => {
    banner.remove();
    startNewPlan();
    selectSeed(seedRecipe);
  });
  banner.querySelector('.plan-seed-confirm-no').addEventListener('click', () => {
    banner.remove();
  });
}

function startNewPlan() {
  _suggestionsActive = false;
  _planFinalizedAt = null;
  clearPlanFinalizedAt();
  _currentPlan = [];
  savePlan([]);
  _seedRecipe = null;
  hideCustomSearch();
  document.getElementById('plan-results').style.display = 'none';
  document.getElementById('plan-empty').style.display = 'none';
  const sel = document.getElementById('plan-seed-select');
  if (sel) sel.value = '__any__';
  showPlanningMode();
}

// ─── Init ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await initDB();

  _allRecipes = await getRecipes();

  const showUntestedRecipes = !!(await getSetting('showUntestedRecipes'));
  const dietaryFilters = (await getSetting('dietaryFilters')) || [];

  _ingredientMaps = buildRecipeIngredientMaps(_allRecipes, { showUntestedRecipes, dietaryFilters });
  _idf = computeIDF(_ingredientMaps);
  _corpusIds = [..._ingredientMaps.keys()];
  _pairwiseMatrix = buildPairwiseMatrix(_corpusIds, _ingredientMaps, _idf);

  _defaultServings = loadPlanServings();
  document.getElementById('plan-servings-count').textContent = _defaultServings;

  renderNSelector(loadPlanN());
  setupServingsControls();
  setupSeedSelect();

  // Populate select with favorites + last cooked (async, non-blocking)
  loadSelectData().then(renderSelect);

  document.getElementById('plan-finalise-btn').addEventListener('click', finalisePlan);
  document.getElementById('plan-new-btn').addEventListener('click', startNewPlan);

  const urlParams = new URLSearchParams(window.location.search);
  const seedId = urlParams.get('seed');
  const seedRecipe = seedId ? _allRecipes.find(r => r.id === seedId) : null;

  _planFinalizedAt = loadPlanFinalizedAt();
  if (_planFinalizedAt) {
    _currentPlan = loadPlan().map(e => ({ cooked_at: null, ...e }));
    await syncCookedState();
    renderActivePlan();
    showActivePlan();

    if (seedRecipe) {
      const uncookedCount = _currentPlan.filter(e => e.cooked_at === null || e.cooked_at === false).length;
      if (uncookedCount > 0) {
        showSeedConfirmBanner(seedRecipe, uncookedCount);
      } else {
        startNewPlan();
        selectSeed(seedRecipe);
      }
    }
  } else {
    if (seedRecipe) selectSeed(seedRecipe);
  }

  updateCartCount();
});
