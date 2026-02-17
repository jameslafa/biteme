// Cooking Log — data loading, stats, rendering

(async function () {
  await initDB();

  const sessions = await getAllCompletedSessions();

  if (sessions.length === 0) {
    document.getElementById('empty-state').style.display = '';
    return;
  }

  // Load recipe data and ratings for all sessions
  const recipeMap = new Map();
  const ratingMap = new Map();
  for (const s of sessions) {
    if (!recipeMap.has(s.recipe_id)) {
      const recipe = await getRecipeById(s.recipe_id);
      recipeMap.set(s.recipe_id, recipe);
      const rating = await getRating(s.recipe_id);
      if (rating) ratingMap.set(s.recipe_id, rating.rating);
    }
  }

  renderStats(sessions);
  renderMostMade(sessions, recipeMap, ratingMap);
  renderTimeline(sessions, recipeMap);
})();

function renderStats(sessions) {
  const section = document.getElementById('stats-section');
  section.style.display = '';

  // Times cooked
  document.getElementById('stat-times-cooked').textContent = sessions.length;

  // Total time
  const totalMs = sessions.reduce((sum, s) => sum + (s.completed_at - s.started_at), 0);
  document.getElementById('stat-time').textContent = formatCookingDuration(totalMs);

  // Streak
  document.getElementById('stat-streak').textContent = computeWeekStreak(sessions);
}

function computeWeekStreak(sessions) {
  if (sessions.length === 0) return 0;

  // Get ISO week key (Monday-based) for a timestamp
  function isoWeekKey(ts) {
    const d = new Date(ts);
    // Shift to Thursday of the same ISO week
    const day = d.getUTCDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const thursday = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + diff + 3));
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
    return `${thursday.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  // Collect all weeks that had at least one cook
  const weeksWithCook = new Set(sessions.map(s => isoWeekKey(s.completed_at)));

  // Build sorted list of unique weeks
  const sortedWeeks = Array.from(weeksWithCook).sort().reverse();
  if (sortedWeeks.length === 0) return 0;

  const currentWeek = isoWeekKey(Date.now());

  // If the most recent cook week isn't current or previous week, streak is 0
  const latestCookWeek = sortedWeeks[0];
  const previousWeek = isoWeekKey(Date.now() - 7 * 86400000);

  if (latestCookWeek !== currentWeek && latestCookWeek !== previousWeek) {
    return 0;
  }

  // Count consecutive weeks backward from the latest cook week
  let streak = 1;
  for (let i = 1; i < sortedWeeks.length; i++) {
    // Check if this week is exactly one week before the previous one
    const expected = isoWeekKey(weekKeyToTimestamp(sortedWeeks[i - 1]) - 7 * 86400000);
    if (sortedWeeks[i] === expected) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

// Convert a "YYYY-Www" key back to a timestamp (Monday of that week)
function weekKeyToTimestamp(weekKey) {
  const [yearStr, wStr] = weekKey.split('-W');
  const year = parseInt(yearStr);
  const week = parseInt(wStr);
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // Monday=1 .. Sunday=7
  const mondayWeek1 = new Date(jan4.getTime() - (jan4Day - 1) * 86400000);
  return mondayWeek1.getTime() + (week - 1) * 7 * 86400000;
}

function renderMostMade(sessions, recipeMap, ratingMap) {
  // Count sessions per recipe
  const counts = new Map();
  for (const s of sessions) {
    counts.set(s.recipe_id, (counts.get(s.recipe_id) || 0) + 1);
  }

  // Sort by count descending, take top 3
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (sorted.length === 0) return;

  const section = document.getElementById('most-made-section');
  section.style.display = '';

  const list = document.getElementById('most-made-list');
  list.innerHTML = sorted.map(([recipeId, count], i) => {
    const recipe = recipeMap.get(recipeId);
    const name = recipe ? recipe.name : recipeId;
    const href = recipe ? `recipe.html?id=${encodeURIComponent(recipeId)}` : '#';
    const rating = ratingMap.get(recipeId);
    const ratingHtml = rating
      ? `<span class="most-made-rating">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</span>`
      : '';

    return `<div class="most-made-row">
      <span class="most-made-rank">${i + 1}</span>
      <a href="${href}" class="most-made-name">${escapeHtml(name)}</a>
      ${ratingHtml}
      <span class="most-made-count">${count}x</span>
    </div>`;
  }).join('');
}

function renderTimeline(sessions, recipeMap) {
  // Sort newest first
  const sorted = [...sessions].sort((a, b) => b.completed_at - a.completed_at);

  // Group by month
  const groups = new Map();
  for (const s of sorted) {
    const d = new Date(s.completed_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!groups.has(key)) {
      groups.set(key, { label, entries: [] });
    }
    groups.get(key).entries.push(s);
  }

  const section = document.getElementById('timeline-section');
  section.style.display = '';

  const list = document.getElementById('timeline-list');
  list.innerHTML = Array.from(groups.values()).map(group => {
    const entries = group.entries.map(s => {
      const recipe = recipeMap.get(s.recipe_id);
      const name = recipe ? recipe.name : s.recipe_id;
      const href = recipe ? `recipe.html?id=${encodeURIComponent(s.recipe_id)}` : '#';
      const day = new Date(s.completed_at).getDate();

      return `<a href="${href}" class="timeline-entry timeline-entry-link">
        <span class="timeline-day">${day}</span>
        <span class="timeline-recipe-name">${escapeHtml(name)}</span>
        <svg class="timeline-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </a>`;
    }).join('');

    return `<div class="timeline-month">
      <div class="timeline-month-label">${group.label}</div>
      <div class="timeline-entries">${entries}</div>
    </div>`;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
