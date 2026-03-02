// Servings scaling module

// ── Formatting ──

const FRACTION_MAP = [
  [0.25, '1/4'],
  [1/3,  '1/3'],
  [0.5,  '1/2'],
  [2/3,  '2/3'],
  [0.75, '3/4'],
];

function formatAmount(n) {
  if (n <= 0) return '0';

  const whole = Math.floor(n);
  const frac = n - whole;

  // Try to match a common fraction (within tolerance)
  let fracChar = null;
  for (const [val, char] of FRACTION_MAP) {
    if (Math.abs(frac - val) < 0.05) {
      fracChar = char;
      break;
    }
  }

  if (fracChar) {
    return whole > 0 ? `${whole} ${fracChar}` : fracChar;
  }
  if (frac < 0.05) {
    return `${whole}`;
  }
  // Round to 1 decimal
  return `${Math.round(n * 10) / 10}`;
}

// ── Unit normalisation ──

// Countable units with distinct singular/plural forms.
// Keys are singular, values are plural — mirrors docs/ingredients.json "units" section.
const UNIT_PLURAL_MAP = {
  'clove':    'cloves',
  'tin':      'tins',
  'can':      'cans',
  'cup':      'cups',
  'sheet':    'sheets',
  'stalk':    'stalks',
  'stick':    'sticks',
  'bunch':    'bunches',
  'thumb':    'thumbs',
  'pinch':    'pinches',
  'handful':  'handfuls',
  'bundle':   'bundles',
  'portion':  'portions',
  'head':     'heads',
};

// Reverse: plural → singular
const UNIT_SINGULAR_MAP = Object.fromEntries(
  Object.entries(UNIT_PLURAL_MAP).map(([s, p]) => [p, s])
);

/**
 * Normalise a unit string to its singular canonical form.
 * Used as a merge key so "clove" and "cloves" group together.
 */
function unitSingular(unit) {
  return UNIT_SINGULAR_MAP[unit] || unit;
}

/**
 * Return the appropriate singular/plural form of a unit for a given amount.
 * Falls back to the unit as-is for non-countable units (g, ml, tbsp, …).
 */
function unitForAmount(unit, amount) {
  if (!unit) return unit;
  const singular = UNIT_SINGULAR_MAP[unit] || unit;
  return amount === 1 ? singular : (UNIT_PLURAL_MAP[singular] || singular);
}

function smartRound(n, unit) {
  if (n <= 0) return 0;

  const u = (unit || '').toLowerCase();

  // Metric (g, ml, kg, l): round to nearest 5 for values >50, nearest 1 otherwise
  if (['g', 'ml', 'kg', 'l'].includes(u)) {
    if (n > 50) return Math.round(n / 5) * 5;
    return Math.round(n);
  }

  // tsp/tbsp: round to nearest 0.25
  if (['tsp', 'tbsp'].includes(u)) {
    return Math.round(n * 4) / 4;
  }

  // Counts (cloves, tins, etc.): round to nearest 0.5
  if (unitSingular(u) in UNIT_PLURAL_MAP) {
    return Math.round(n * 2) / 2;
  }

  // Default: round to 2 decimal places
  return Math.round(n * 100) / 100;
}

// ── Scaling ──

function capitaliseFirst(s) {
  if (!s) return s;
  return s.replace(/^[a-z]/, c => c.toUpperCase());
}

function scaleIngredientText(ingredient, ratio, { omitPreparation = false } = {}) {
  if (!ingredient.quantity || ratio === 1) {
    if (omitPreparation && ingredient.preparation) {
      const suffix = ', ' + ingredient.preparation;
      const text = ingredient.text;
      return capitaliseFirst(text.endsWith(suffix) ? text.slice(0, -suffix.length) : text);
    }
    return capitaliseFirst(ingredient.text);
  }

  const q = ingredient.quantity;
  const scaledAmount = smartRound(q.amount * ratio, q.unit);
  const scaledMax = q.amount_max != null ? smartRound(q.amount_max * ratio, q.unit) : null;

  let result = '';

  // Prefix (e.g., "Juice of")
  if (q.prefix) {
    result += q.prefix + ' ';
  }

  // Primary amount
  result += formatAmount(scaledAmount);
  if (scaledMax != null) {
    result += '-' + formatAmount(scaledMax);
  }

  // Unit
  if (q.unit) {
    result += ' ' + q.unit;
  }

  // Secondary quantity in parentheses
  if (q.secondary_amount != null) {
    const scaledSec = smartRound(q.secondary_amount * ratio, q.secondary_unit);
    result += ' (';
    if (q.secondary_prefix) {
      result += q.secondary_prefix + ' ';
    }
    result += formatAmount(scaledSec);
    if (q.secondary_unit) {
      result += ' ' + q.secondary_unit;
    }
    result += ')';
  }

  // Item
  if (q.item) {
    result += ' ' + q.item;
  }

  // Preparation (now stored separately on the ingredient)
  if (!omitPreparation && ingredient.preparation) {
    result += ', ' + ingredient.preparation;
  }

  return capitaliseFirst(result);
}

// ── Persistence ──

function getServings(recipeId, defaultServings) {
  try {
    const stored = localStorage.getItem(`servings_${recipeId}`);
    if (stored != null) {
      const val = parseInt(stored, 10);
      if (val > 0) return val;
    }
  } catch {
    // localStorage unavailable
  }
  return defaultServings;
}

function setServings(recipeId, count) {
  try {
    localStorage.setItem(`servings_${recipeId}`, count);
  } catch {
    // localStorage unavailable
  }
}
