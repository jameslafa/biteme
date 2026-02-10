// Shopping list page logic

document.addEventListener('DOMContentLoaded', async function() {
  await initDB();
  await cleanupShoppingList(); // Remove items checked > 1 hour ago
  await loadShoppingList();
  await updateCartCount();
});

async function loadShoppingList() {
  const items = await getAllShoppingListItems();
  const shoppingListContainer = document.getElementById('shopping-list');
  const emptyState = document.getElementById('empty-state');

  if (items.length === 0) {
    shoppingListContainer.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  shoppingListContainer.style.display = 'block';
  emptyState.style.display = 'none';

  // Group items by recipe and look up ingredient text
  const groupedItems = {};

  for (const item of items) {
    const recipe = getRecipeById(item.recipe_id);
    if (!recipe) continue;

    if (!groupedItems[item.recipe_id]) {
      groupedItems[item.recipe_id] = {
        recipe_name: recipe.name,
        items: []
      };
    }

    // Find ingredient text from recipe
    let ingredientText = 'Unknown ingredient';
    for (const [category, ingredients] of Object.entries(recipe.ingredients)) {
      const found = ingredients.find(ing => ing.id === item.ingredient_id);
      if (found) {
        ingredientText = found.text;
        break;
      }
    }

    groupedItems[item.recipe_id].items.push({
      ...item,
      ingredient_text: ingredientText
    });
  }

  // Render grouped items
  shoppingListContainer.innerHTML = Object.entries(groupedItems)
    .map(([recipeId, group]) => `
      <div class="recipe-group">
        <div class="recipe-group-header">
          <h3 class="recipe-group-title">${group.recipe_name}</h3>
        </div>
        <ul class="shopping-items">
          ${group.items.map(item => `
            <li class="shopping-item ${item.checked_at ? 'checked' : ''}" data-item-id="${item.id}">
              <div class="shopping-item-checkbox">
                <input
                  type="checkbox"
                  id="item-${item.id}"
                  ${item.checked_at ? 'checked' : ''}
                  data-item-id="${item.id}"
                />
                <label for="item-${item.id}" class="shopping-item-label">${item.ingredient_text}</label>
              </div>
              <button class="remove-item" data-item-id="${item.id}" aria-label="Remove item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </li>
          `).join('')}
        </ul>
      </div>
    `).join('');

  // Setup event listeners
  setupEventListeners();
  updateProgress();
}

function setupEventListeners() {
  // Handle checkbox clicks
  const checkboxes = document.querySelectorAll('.shopping-item input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      const itemId = parseInt(e.target.getAttribute('data-item-id'));
      const listItem = e.target.closest('.shopping-item');

      try {
        await toggleShoppingListItem(itemId);

        // Update UI
        if (e.target.checked) {
          listItem.classList.add('checked');
          listItem.style.transform = 'scale(1.02)';
          setTimeout(() => { listItem.style.transform = ''; }, 150);
        } else {
          listItem.classList.remove('checked');
        }

        // Update cart count and progress
        await updateCartCount();
        updateProgress();

        // Celebrate when all items are checked
        if (e.target.checked) {
          const total = document.querySelectorAll('.shopping-item').length;
          const checked = document.querySelectorAll('.shopping-item.checked').length;
          if (checked === total) {
            showCelebration();
          }
        }
      } catch (error) {
        console.error('Error toggling item:', error);
        // Revert checkbox state on error
        e.target.checked = !e.target.checked;
      }
    });
  });

  // Handle remove button clicks
  const removeButtons = document.querySelectorAll('.remove-item');
  removeButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      const itemId = parseInt(button.getAttribute('data-item-id'));
      const listItem = button.closest('.shopping-item');

      try {
        await removeShoppingListItem(itemId);

        // Remove from UI with fade out
        listItem.style.opacity = '0';
        setTimeout(async () => {
          await loadShoppingList(); // Reload to check if recipe group is now empty
          await updateCartCount(); // Update cart count
        }, 200);
      } catch (error) {
        console.error('Error removing item:', error);
      }
    });
  });
}

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
