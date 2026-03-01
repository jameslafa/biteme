// Shopping list page logic

// ── View state ──

const VIEW_STORAGE_KEY = 'shopping_view';

function getViewMode() {
  return localStorage.getItem(VIEW_STORAGE_KEY) || 'merged';
}

function setViewMode(mode) {
  localStorage.setItem(VIEW_STORAGE_KEY, mode);
}

// ── Initialisation ──

document.addEventListener('DOMContentLoaded', async function() {
  await initDB();
  await cleanupShoppingList();

  // Static event listeners (attached once)
  document.getElementById('clear-all').addEventListener('click', async () => {
    try {
      await clearShoppingList();
      await loadShoppingList();
      await updateCartCount();
    } catch (error) {
      console.error('Error clearing shopping list:', error);
    }
  });

  document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setViewMode(btn.dataset.view);
      loadShoppingList();
    });
  });

  await loadShoppingList();
  await updateCartCount();
});

// ── Data loading ──

async function resolveAllItems() {
  const dbItems = await getAllShoppingListItems();
  const resolved = [];

  for (const item of dbItems) {
    const recipe = await getRecipeById(item.recipe_id);
    if (!recipe) continue;

    const savedServings = getServings(item.recipe_id, recipe.servings);
    const ratio = savedServings / recipe.servings;
    let ingredient = null;

    for (const ingredients of Object.values(recipe.ingredients)) {
      const found = ingredients.find(ing => ing.id === item.ingredient_id);
      if (found) { ingredient = found; break; }
    }

    if (!ingredient) continue;

    resolved.push({
      itemId: item.id,
      recipeId: item.recipe_id,
      recipeName: recipe.name,
      ingredient,
      ratio,
      checked: !!item.checked_at,
      scaledText: scaleIngredientText(ingredient, ratio, { omitPreparation: true })
    });
  }

  return resolved;
}

// ── Merged groups ──

function buildMergedGroups(resolvedItems) {
  const groups = new Map();

  for (const item of resolvedItems) {
    const { ingredient, ratio } = item;
    const canonicalKey = ingredient.canonical || ingredient.text;

    if (!groups.has(canonicalKey)) {
      groups.set(canonicalKey, {
        unitLines: new Map(),
        sources: [],
        hasQuantity: false
      });
    }

    const group = groups.get(canonicalKey);
    group.sources.push({
      itemId: item.itemId,
      recipeId: item.recipeId,
      recipeName: item.recipeName,
      checked: item.checked,
      scaledText: item.scaledText
    });

    if (ingredient.quantity) {
      group.hasQuantity = true;
      const unit = ingredient.quantity.unit || null;
      const unitKey = unit !== null ? unit : '__unitless__';
      const scaledAmount = smartRound(ingredient.quantity.amount * ratio, unit);
      const scaledMax = ingredient.quantity.amount_max != null
        ? smartRound(ingredient.quantity.amount_max * ratio, unit)
        : null;

      if (!group.unitLines.has(unitKey)) {
        group.unitLines.set(unitKey, {
          amount: scaledAmount,
          amountMax: scaledMax,
          unit,
          item: ingredient.quantity.item || '',
          prefix: ingredient.quantity.prefix || null,
          sourceCount: 1,
          firstScaledText: item.scaledText
        });
      } else {
        const line = group.unitLines.get(unitKey);
        line.amount = smartRound(line.amount + scaledAmount, unit);
        if (scaledMax != null && line.amountMax != null) {
          line.amountMax = smartRound(line.amountMax + scaledMax, unit);
        } else {
          line.amountMax = null;
        }
        line.sourceCount++;
      }
    }
  }

  // Finalise groups
  for (const group of groups.values()) {
    const allChecked = group.sources.every(s => s.checked);
    const someChecked = group.sources.some(s => s.checked);
    group.checked = allChecked;
    group.partial = someChecked && !allChecked;

    if (group.hasQuantity && group.unitLines.size > 0) {
      const unitLines = [...group.unitLines.values()];

      if (unitLines.length === 1) {
        const line = unitLines[0];
        // Single-source unitless: use original text (parser may have dropped the unit)
        if (line.sourceCount === 1 && !line.unit) {
          group.lines = [line.firstScaledText];
        } else {
          let label = '';
          if (line.prefix) label += line.prefix + ' ';
          label += formatAmount(line.amount);
          if (line.amountMax != null) label += '-' + formatAmount(line.amountMax);
          if (line.unit) label += ' ' + line.unit;
          if (line.item) label += ' ' + line.item;
          group.lines = [label];
        }
      } else {
        // Multiple unit sub-groups: "item (amount1 unit1 + amount2 unit2)"
        const itemName = unitLines[0].item;
        const quantities = unitLines.map(line => {
          let q = '';
          if (line.prefix) q += line.prefix + ' ';
          q += formatAmount(line.amount);
          if (line.amountMax != null) q += '-' + formatAmount(line.amountMax);
          if (line.unit) q += ' ' + line.unit;
          return q;
        }).join(' + ');
        group.lines = [`${itemName} (${quantities})`];
      }
    } else {
      // No quantity (text-only): show first source's scaled text as-is
      group.lines = [group.sources[0].scaledText];
    }

    delete group.unitLines;
    delete group.hasQuantity;
  }

  return groups;
}

// ── Rendering ──

async function loadShoppingList() {
  const resolved = await resolveAllItems();
  const container = document.getElementById('shopping-list');
  const emptyState = document.getElementById('empty-state');
  const viewToggle = document.getElementById('view-toggle');
  const footerRow = document.getElementById('shopping-footer-row');

  if (resolved.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    viewToggle.style.display = 'none';
    footerRow.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  emptyState.style.display = 'none';
  viewToggle.style.display = '';
  footerRow.style.display = '';

  const mode = getViewMode();

  document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === mode);
  });

  if (mode === 'merged') {
    renderMergedView(buildMergedGroups(resolved));
  } else {
    renderByRecipeView(resolved);
  }

  setupDynamicEventListeners();
  updateProgress();
}

function renderByRecipeView(resolvedItems) {
  const container = document.getElementById('shopping-list');

  const groupedItems = new Map();
  for (const item of resolvedItems) {
    if (!groupedItems.has(item.recipeId)) {
      groupedItems.set(item.recipeId, { recipeName: item.recipeName, items: [] });
    }
    groupedItems.get(item.recipeId).items.push(item);
  }

  container.innerHTML = [...groupedItems.entries()].map(([recipeId, group]) => `
    <div class="recipe-group" data-recipe-id="${recipeId}">
      <div class="recipe-group-header">
        <h3 class="recipe-group-title">${group.recipeName}</h3>
        <button class="remove-recipe" data-recipe-id="${recipeId}" aria-label="Remove ${group.recipeName} from shopping list">Remove recipe</button>
      </div>
      <ul class="shopping-items">
        ${group.items.map(item => `
          <li class="shopping-item ${item.checked ? 'checked' : ''}" data-item-id="${item.itemId}">
            <div class="shopping-item-checkbox">
              <input
                type="checkbox"
                id="item-${item.itemId}"
                ${item.checked ? 'checked' : ''}
                data-item-id="${item.itemId}"
              />
              <label for="item-${item.itemId}" class="shopping-item-label">${item.scaledText}</label>
            </div>
            <button class="remove-item" data-item-id="${item.itemId}" aria-label="Remove item">
              ${icon('x', 16)}
            </button>
          </li>
        `).join('')}
      </ul>
    </div>
  `).join('');
}

function renderMergedView(mergedGroups) {
  const container = document.getElementById('shopping-list');

  const items = [...mergedGroups.values()].map(group => {
    const sourceIds = group.sources.map(s => s.itemId).join(',');
    const labelsHtml = group.lines
      .map(line => `<span class="shopping-item-label">${escapeHtml(line)}</span>`)
      .join('');

    return `
      <li class="shopping-item merged-item ${group.checked ? 'checked' : group.partial ? 'partial' : ''}"
          data-source-ids="${sourceIds}">
        <div class="shopping-item-checkbox">
          <input
            type="checkbox"
            ${group.checked ? 'checked' : ''}
            data-source-ids="${sourceIds}"
          />
          <div class="merged-item-content">
            ${labelsHtml}
          </div>
        </div>
      </li>
    `;
  }).join('');

  container.innerHTML = `<ul class="shopping-items">${items}</ul>`;

  // Indeterminate state must be set via JS (can't be expressed in HTML)
  container.querySelectorAll('.merged-item.partial input[type="checkbox"]').forEach(cb => {
    cb.indeterminate = true;
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Event listeners (dynamic content) ──

function setupDynamicEventListeners() {
  const mode = getViewMode();

  if (mode === 'merged') {
    document.querySelectorAll('.merged-item input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', handleMergedCheckboxChange);
    });
  } else {
    document.querySelectorAll('.shopping-item input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', handleCheckboxChange);
    });

    document.querySelectorAll('.remove-item').forEach(button => {
      button.addEventListener('click', handleRemoveItem);
    });

    document.querySelectorAll('.remove-recipe').forEach(button => {
      button.addEventListener('click', handleRemoveRecipe);
    });
  }
}

async function handleCheckboxChange(e) {
  const itemId = parseInt(e.target.getAttribute('data-item-id'));
  const listItem = e.target.closest('.shopping-item');

  try {
    await toggleShoppingListItem(itemId);

    if (e.target.checked) {
      listItem.classList.add('checked');
      listItem.style.transform = 'scale(1.02)';
      setTimeout(() => { listItem.style.transform = ''; }, 150);
    } else {
      listItem.classList.remove('checked');
    }

    await updateCartCount();
    updateProgress();

    if (e.target.checked) {
      const total = document.querySelectorAll('.shopping-item').length;
      const checked = document.querySelectorAll('.shopping-item.checked').length;
      if (checked === total) showCelebration();
    }
  } catch (error) {
    console.error('Error toggling item:', error);
    e.target.checked = !e.target.checked;
  }
}

async function handleMergedCheckboxChange(e) {
  const sourceIds = e.target.getAttribute('data-source-ids').split(',').map(Number);
  const newChecked = e.target.checked;
  const listItem = e.target.closest('.shopping-item');

  try {
    await Promise.all(sourceIds.map(id => setShoppingListItemChecked(id, newChecked)));

    listItem.classList.toggle('checked', newChecked);
    listItem.classList.remove('partial');
    e.target.indeterminate = false;

    await updateCartCount();
    updateProgress();

    if (newChecked) {
      const total = document.querySelectorAll('.shopping-item').length;
      const checked = document.querySelectorAll('.shopping-item.checked').length;
      if (checked === total) showCelebration();
    }
  } catch (error) {
    console.error('Error toggling merged item:', error);
    e.target.checked = !e.target.checked;
  }
}

async function handleRemoveItem(e) {
  const button = e.currentTarget;
  const itemId = parseInt(button.getAttribute('data-item-id'));
  const listItem = button.closest('.shopping-item');

  try {
    await removeShoppingListItem(itemId);
    listItem.style.opacity = '0';
    setTimeout(async () => {
      await loadShoppingList();
      await updateCartCount();
    }, 200);
  } catch (error) {
    console.error('Error removing item:', error);
  }
}

async function handleRemoveRecipe(e) {
  const button = e.currentTarget;
  const recipeId = button.getAttribute('data-recipe-id');
  const group = button.closest('.recipe-group');

  try {
    await removeShoppingListByRecipe(recipeId);
    group.style.opacity = '0';
    setTimeout(async () => {
      await loadShoppingList();
      await updateCartCount();
    }, 200);
  } catch (error) {
    console.error('Error removing recipe items:', error);
  }
}

// ── Progress & celebration ──

function updateProgress() {
  const total = document.querySelectorAll('.shopping-item').length;
  const checked = document.querySelectorAll('.shopping-item.checked').length;
  const progressEl = document.getElementById('shopping-progress');

  if (progressEl && total > 0) {
    progressEl.textContent = `${checked} of ${total} items`;
  }
}

function showCelebration() {
  if (document.querySelector('.celebration-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'celebration-overlay';
  overlay.innerHTML = `
    <img src="assets/illustrations/celebrate.svg" alt="All done!" />
    <p>All done!</p>
  `;
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.classList.add('visible');
  });

  overlay.addEventListener('click', () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 400);
  });

  setTimeout(() => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 400);
  }, 3000);
}

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
