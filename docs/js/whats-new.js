// What's New page logic

document.addEventListener('DOMContentLoaded', async function() {
  await initDB();

  if (typeof CHANGELOG === 'undefined' || CHANGELOG.length === 0) return;

  renderTimeline();

  // Mark all entries as seen
  await setSetting('lastSeenChangelogId', CHANGELOG[0].id);
});

function renderTimeline() {
  // Group entries by month (CHANGELOG is already newest-first)
  const groups = new Map();
  for (const entry of CHANGELOG) {
    const [year, month] = entry.date.split('-').map(Number);
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const label = new Date(year, month - 1, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!groups.has(key)) {
      groups.set(key, { label, entries: [] });
    }
    groups.get(key).entries.push(entry);
  }

  const list = document.getElementById('whats-new-list');
  list.innerHTML = Array.from(groups.values()).map(group => {
    const entries = group.entries.map(entry => {
      const day = parseInt(entry.date.split('-')[2], 10);
      return `<div class="timeline-entry">
        <span class="timeline-day">${day}</span>
        <span class="timeline-entry-text">${entry.text}</span>
      </div>`;
    }).join('');

    return `<div class="timeline-month">
      <div class="timeline-month-label">${group.label}</div>
      <div class="timeline-entries">${entries}</div>
    </div>`;
  }).join('');
}
