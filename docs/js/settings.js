// Settings page logic

document.addEventListener('DOMContentLoaded', async function() {
  await initDB();

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
