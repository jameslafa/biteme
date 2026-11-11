// Escape user-entered text (notes, friend names) before inserting it as HTML
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Cache for loaded recipes
let recipesCache = null;

// Map of any ingredient form (singular/plural, lowercase) → canonical (lowercase)
let ingredientVocabulary = null;

async function loadIngredientVocabulary() {
  if (ingredientVocabulary) return;
  try {
    const response = await fetch('ingredients.json');
    if (!response.ok) return;
    const data = await response.json();
    ingredientVocabulary = new Map();
    for (const [canonical, entry] of Object.entries(data.ingredients)) {
      const key = canonical.toLowerCase();
      ingredientVocabulary.set(key, key);
      if (entry.plural) ingredientVocabulary.set(entry.plural.toLowerCase(), key);
    }
  } catch {
    ingredientVocabulary = new Map();
  }
}

function resolveIngredientRef(name) {
  if (!ingredientVocabulary) return name.toLowerCase();
  return ingredientVocabulary.get(name.toLowerCase()) ?? name.toLowerCase();
}

const RECIPES_KEY = 'recipes-cache';
const MANIFEST_KEY = 'recipes-manifest';

let recipesRevalidation = null;

function readStoredRecipes() {
  try {
    return JSON.parse(localStorage.getItem(RECIPES_KEY));
  } catch {
    return null;
  }
}

function storedRecipesVersion() {
  try {
    return JSON.parse(localStorage.getItem(MANIFEST_KEY))?.version ?? null;
  } catch {
    return null;
  }
}

function storeRecipes(manifest, recipes) {
  recipesCache = recipes;
  try {
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
    localStorage.setItem(RECIPES_KEY, JSON.stringify(recipes));
  } catch {
    // Storage full or unavailable — in-memory copy still works for this page
  }
}

// Fetch the manifest and, if its version differs from the stored one, the recipes.
// Returns true if new recipe data was stored.
async function syncRecipes() {
  try {
    const manifestResponse = await fetch('recipes-manifest.json');
    if (!manifestResponse.ok) return false;
    const manifest = await manifestResponse.json();
    if (manifest.version === storedRecipesVersion() && readStoredRecipes()) return false;

    const recipesResponse = await fetch('recipes.json');
    if (!recipesResponse.ok) return false;
    storeRecipes(manifest, await recipesResponse.json());
    return true;
  } catch {
    return false;
  }
}

// Check for newer recipes in the background. Concurrent callers share one request.
// Resolves to true if recipes changed, so callers can re-render.
function checkForRecipeUpdates() {
  if (!recipesRevalidation) {
    recipesRevalidation = syncRecipes().finally(() => { recipesRevalidation = null; });
  }
  return recipesRevalidation;
}

// Force a fresh fetch from the network, bypassing the version check (pull-to-refresh).
// Returns true on success, false on failure
async function forceRefreshRecipes() {
  try {
    const [manifestResponse, recipesResponse] = await Promise.all([
      fetch('recipes-manifest.json', { cache: 'no-cache' }),
      fetch('recipes.json', { cache: 'no-cache' }),
    ]);
    if (!manifestResponse.ok || !recipesResponse.ok) return false;
    storeRecipes(await manifestResponse.json(), await recipesResponse.json());
    return true;
  } catch {
    return false;
  }
}

// Stale-while-revalidate: return stored recipes immediately and check for updates
// in the background, so a slow network never delays rendering. Only the very first
// load (nothing stored yet) waits for the network.
async function loadRecipesData() {
  if (recipesCache) return recipesCache;

  const stored = readStoredRecipes();
  if (stored) {
    recipesCache = stored;
    checkForRecipeUpdates();
    return recipesCache;
  }

  await syncRecipes();
  return recipesCache || [];
}

// Get all recipes
async function getRecipes() {
  return await loadRecipesData();
}

// Get recipe by ID. A recipe missing from stored data may have been added since the
// last sync (e.g. a freshly shared link), so wait for the update check before giving up.
async function getRecipeById(id) {
  const find = () => (recipesCache || []).find(recipe => recipe.id === id);
  await loadRecipesData();
  if (!find()) await checkForRecipeUpdates();
  return find();
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

// ── Diet & avoided-ingredient filtering ──
// A filter is { diets, avoid }: diets the recipe must satisfy, and canonical
// ingredient names it must not contain. It travels between pages in the URL
// (?diet=vegan,gluten-free&avoid=mushroom) so it survives navigation within a
// session but resets when the app is reopened.

const DIETS = Object.keys(DIET_BADGES);

// A recipe matches if it satisfies every requested diet. Vegan recipes count as
// vegetarian, so recipes only need to be tagged vegan.
function matchesDiets(recipe, diets) {
  const tags = recipe.diet || [];
  return diets.every(d => tags.includes(d) || (d === 'vegetarian' && tags.includes('vegan')));
}

function containsAvoided(recipe, avoid) {
  if (avoid.length === 0) return false;
  return Object.values(recipe.ingredients).flat().some(i => avoid.includes(i.canonical));
}

function matchesFilter(recipe, { diets = [], avoid = [] } = {}) {
  return matchesDiets(recipe, diets) && !containsAvoided(recipe, avoid);
}

function dietsFromParams(params) {
  return (params.get('diet') || '').split(',').filter(d => DIETS.includes(d));
}

function filterFromParams(params) {
  return {
    diets: dietsFromParams(params),
    avoid: (params.get('avoid') || '').split(',').filter(Boolean),
  };
}

// Query-string suffix that carries a filter to another page
function filterQuery({ diets = [], avoid = [] } = {}) {
  let query = '';
  if (diets.length > 0) query += `&diet=${diets.join(',')}`;
  if (avoid.length > 0) query += `&avoid=${avoid.map(encodeURIComponent).join(',')}`;
  return query;
}

// ── Gluten-free version ──
// Ingredients carry an optional `gluten` flag (from ingredients.json via the parser):
// { level: 'contains', swap } must be swapped; { level: 'check', note? } means read the label.

// The note to show for an ingredient in a recipe's gluten-free version, or null
function glutenFreeNote(ingredient) {
  const gluten = ingredient.gluten;
  if (!gluten) return null;
  if (gluten.level === 'contains') return gluten.swap ? `Use ${gluten.swap}` : null;
  const note = gluten.note || 'check the label says gluten-free';
  return note[0].toUpperCase() + note.slice(1);
}

// Only recipes tagged gluten-free offer a gluten-free version, and only if something
// in them needs swapping or checking
function hasGlutenFreeVersion(recipe) {
  return (recipe.diet || []).includes('gluten-free')
    && Object.values(recipe.ingredients).flat().some(i => glutenFreeNote(i));
}

function renderGlutenFreeNote(ingredient) {
  const note = glutenFreeNote(ingredient);
  return note ? `<span class="gf-note"><span class="gf-note-tag">GF</span>${note}</span>` : '';
}

// Resolve a step ref name to the single ingredient it refers to.
// Exact canonical match always wins; a word-boundary text match is only used
// as a fallback when no ingredient's canonical matches. This prevents a bare
// ref like {chilli} from also matching "chilli powder", or {coriander} from
// matching "ground coriander", since those have their own canonical entries.
function findStepIngredient(ingredientName, ingredients) {
  const resolved = resolveIngredientRef(ingredientName);
  const escaped = ingredientName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  let fallback = null;
  for (const items of Object.values(ingredients)) {
    for (const item of items) {
      if (item.canonical && item.canonical.toLowerCase() === resolved) {
        return item;
      }
      if (!fallback && regex.test(item.text)) {
        fallback = item;
      }
    }
  }
  return fallback;
}

// Parse step text and replace {ingredient} references with highlighted spans
function parseStepText(stepText, ingredients) {
  return stepText.replace(/\{([^}]+)\}/g, (_match, ingredientName) => {
    if (findStepIngredient(ingredientName, ingredients)) {
      return `<span class="ingredient-ref">${ingredientName}</span>`;
    }
    return ingredientName;
  });
}

// Extract ingredients used in a step
function getStepIngredients(stepText, ingredients) {
  const stepIngredients = [];
  for (const match of stepText.matchAll(/\{([^}]+)\}/g)) {
    const found = findStepIngredient(match[1], ingredients);
    if (found && !stepIngredients.some(i => i.id === found.id)) {
      stepIngredients.push(found);
    }
  }
  return stepIngredients;
}
