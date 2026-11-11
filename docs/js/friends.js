// Friends page: list, add, edit and delete friends (name, diets, ingredients to avoid)

let friendsList = [];
let ingredientNames = [];   // canonical names (lowercase) from ingredients.json
let editing = null;         // { id?, name, diets, avoid } while the form is open

document.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  await loadIngredientNames();

  document.getElementById('add-friend-btn').addEventListener('click', () => openForm(null));
  document.getElementById('friend-cancel').addEventListener('click', closeForm);
  document.getElementById('friend-delete').addEventListener('click', removeFriend);
  document.getElementById('friend-form').addEventListener('submit', submitForm);

  const avoidInput = document.getElementById('friend-avoid-input');
  // 'change' fires when a datalist suggestion is picked; Enter adds what's typed
  avoidInput.addEventListener('change', () => addAvoided(avoidInput.value));
  avoidInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addAvoided(avoidInput.value);
    }
  });

  await renderFriendList();
});

async function loadIngredientNames() {
  try {
    const response = await fetch('ingredients.json');
    const data = await response.json();
    ingredientNames = Object.keys(data.ingredients).map(n => n.toLowerCase()).sort();
  } catch {
    ingredientNames = [];
  }
  document.getElementById('ingredient-options').innerHTML =
    ingredientNames.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
}

// ── List ──

async function renderFriendList() {
  friendsList = await getAllFriends();
  const list = document.getElementById('friend-list');
  list.innerHTML = friendsList.map(f => `
    <li>
      <button class="friend-row" data-id="${f.id}">
        <span class="friend-row-main">
          <span class="friend-row-name">${escapeHtml(f.name)}</span>
          ${renderDietIcons(f.diets)}
        </span>
        ${f.avoid.length > 0 ? `<span class="friend-row-avoid">Avoids ${escapeHtml(f.avoid.join(', '))}</span>` : ''}
      </button>
    </li>
  `).join('');
  list.querySelectorAll('.friend-row').forEach(btn => {
    btn.addEventListener('click', () => openForm(friendsList.find(f => f.id === btn.dataset.id)));
  });
}

// ── Form ──

function openForm(friend) {
  editing = friend
    ? { id: friend.id, name: friend.name, diets: [...friend.diets], avoid: [...friend.avoid] }
    : { name: '', diets: [], avoid: [] };

  document.getElementById('friends-view').hidden = true;
  document.getElementById('friend-form').hidden = false;
  document.getElementById('friend-delete').hidden = !friend;
  document.getElementById('friend-form-error').hidden = true;
  document.getElementById('friend-avoid-hint').hidden = true;
  document.getElementById('friend-avoid-input').value = '';

  const nameInput = document.getElementById('friend-name');
  nameInput.value = editing.name;
  renderFormDiets();
  renderFormAvoid();
  if (!friend) nameInput.focus();
}

function closeForm() {
  editing = null;
  document.getElementById('friend-form').hidden = true;
  document.getElementById('friends-view').hidden = false;
}

function renderFormDiets() {
  const container = document.getElementById('friend-diets');
  container.innerHTML = DIETS.map(d => {
    const b = DIET_BADGES[d];
    const active = editing.diets.includes(d);
    return `<button type="button" class="chip chip-diet${active ? ' chip-active' : ''}" data-value="${d}" style="--diet-color:${b.color}" aria-pressed="${active}">`
      + `<span class="diet-badge">${b.label}</span>${b.title}</button>`;
  }).join('');
  container.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = btn.dataset.value;
      editing.diets = editing.diets.includes(d)
        ? editing.diets.filter(x => x !== d)
        : DIETS.filter(x => x === d || editing.diets.includes(x));
      renderFormDiets();
    });
  });
}

function renderFormAvoid() {
  const container = document.getElementById('friend-avoid');
  container.innerHTML = editing.avoid.map(name => `
    <span class="friend-avoid-chip">
      ${escapeHtml(name)}
      <button type="button" data-name="${escapeHtml(name)}" aria-label="Remove ${escapeHtml(name)}">${icon('x', 14)}</button>
    </span>
  `).join('');
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      editing.avoid = editing.avoid.filter(n => n !== btn.dataset.name);
      renderFormAvoid();
    });
  });
}

// Only known ingredients can be avoided: recipes are matched on canonical names
function addAvoided(value) {
  const name = value.trim().toLowerCase();
  if (!name) return;
  const input = document.getElementById('friend-avoid-input');
  const hint = document.getElementById('friend-avoid-hint');
  if (!ingredientNames.includes(name)) {
    hint.hidden = false;
    return;
  }
  hint.hidden = true;
  input.value = '';
  if (!editing.avoid.includes(name)) {
    editing.avoid = [...editing.avoid, name];
    renderFormAvoid();
  }
}

async function submitForm(e) {
  e.preventDefault();
  const name = document.getElementById('friend-name').value.trim();
  if (!name) {
    document.getElementById('friend-form-error').hidden = false;
    return;
  }
  await saveFriend({ ...editing, name });
  closeForm();
  await renderFriendList();
}

async function removeFriend() {
  if (!editing?.id || !confirm(`Delete ${editing.name}?`)) return;
  await deleteFriend(editing.id);
  closeForm();
  await renderFriendList();
}
