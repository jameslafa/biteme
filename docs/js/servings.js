// Servings scaling module

// ── Formatting ──

const FRACTION_MAP = [
  [0.25, '\u00BC'],
  [1/3,  '\u2153'],
  [0.5,  '\u00BD'],
  [2/3,  '\u2154'],
  [0.75, '\u00BE'],
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
    return whole > 0 ? `${whole}${fracChar}` : fracChar;
  }
  if (frac < 0.05) {
    return `${whole}`;
  }
  // Round to 1 decimal, drop trailing zero
  const rounded = Math.round(n * 10) / 10;
  return rounded % 1 === 0 ? `${rounded}` : `${rounded}`;
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
  if (['cloves', 'clove', 'tins', 'tin', 'cans', 'can'].includes(u)) {
    return Math.round(n * 2) / 2;
  }

  // Default: round to 2 decimal places
  return Math.round(n * 100) / 100;
}

// ── Scaling ──

function scaleIngredientText(ingredient, ratio) {
  if (!ingredient.quantity || ratio === 1) {
    return ingredient.text;
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

  return result;
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
