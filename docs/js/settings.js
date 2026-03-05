// Settings page logic

function resolveTheme(theme) {
  if (theme === 'auto') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return theme;
}

function applyTheme(theme) {
  localStorage.setItem('theme', theme);
  document.documentElement.setAttribute('data-theme', resolveTheme(theme));
}

document.addEventListener('DOMContentLoaded', async function() {
  await initDB();

  // Theme selector
  const savedTheme = localStorage.getItem('theme') || 'auto';
  const themeRadio = document.querySelector(`input[name="theme"][value="${savedTheme}"]`);
  if (themeRadio) themeRadio.checked = true;

  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener('change', () => applyTheme(radio.value));
  });

  // Untested toggle
  const untestedToggle = document.getElementById('toggle-untested');
  const currentUntested = await getSetting('showUntestedRecipes');
  untestedToggle.checked = !!currentUntested;

  untestedToggle.addEventListener('change', async () => {
    await setSetting('showUntestedRecipes', untestedToggle.checked);
  });

  // Dietary filter toggles
  const currentFilters = (await getSetting('dietaryFilters')) || [];

  const veganToggle = document.getElementById('toggle-vegan');
  const glutenFreeToggle = document.getElementById('toggle-gluten-free');

  veganToggle.checked = currentFilters.includes('vegan');
  glutenFreeToggle.checked = currentFilters.includes('gluten-free');

  async function saveDietaryFilters() {
    const filters = [];
    if (veganToggle.checked) filters.push('vegan');
    if (glutenFreeToggle.checked) filters.push('gluten-free');
    await setSetting('dietaryFilters', filters);
  }

  veganToggle.addEventListener('change', saveDietaryFilters);
  glutenFreeToggle.addEventListener('change', saveDietaryFilters);
});
