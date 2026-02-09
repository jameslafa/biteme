// Cooking mode logic

let currentStep = -1; // Start at -1 for ingredient collection step
let recipe = null;

document.addEventListener('DOMContentLoaded', function() {
  const urlParams = new URLSearchParams(window.location.search);
  const recipeId = urlParams.get('id');

  if (!recipeId) {
    window.location.href = 'index.html';
    return;
  }

  recipe = getRecipeById(recipeId);

  if (!recipe) {
    window.location.href = 'index.html';
    return;
  }

  document.title = `Cooking: ${recipe.name}`;
  initializeCookingMode();
  renderStep();
});

function initializeCookingMode() {
  // Render ingredients checklist
  const ingredientsContainer = document.getElementById('ingredients-checklist');

  const categoriesHTML = Object.entries(recipe.ingredients)
    .filter(([category, items]) => items.length > 0)
    .map(([category, items]) => `
      <div class="ingredient-group">
        <h4>${category}</h4>
        <ul>
          ${items.map((ingredient, index) => `
            <li>
              <input type="checkbox" id="cook-ingredient-${category}-${index}" />
              <label for="cook-ingredient-${category}-${index}">${ingredient}</label>
            </li>
          `).join('')}
        </ul>
      </div>
    `).join('');

  ingredientsContainer.innerHTML = `
    <h3>Collect Your Ingredients</h3>
    ${categoriesHTML}
  `;

  // Setup navigation buttons
  document.getElementById('prev-btn').addEventListener('click', previousStep);
  document.getElementById('next-btn').addEventListener('click', nextStep);
  document.getElementById('exit-btn').addEventListener('click', exitCookingMode);
}

function renderStep() {
  const totalSteps = recipe.steps.length;
  const ingredientsSection = document.getElementById('ingredients-checklist');
  const stepSection = document.querySelector('.step-section');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');

  // Step -1: Ingredient collection
  if (currentStep === -1) {
    document.getElementById('step-progress').textContent = 'Preparation';
    ingredientsSection.style.display = 'block';
    stepSection.style.display = 'none';
    prevBtn.disabled = true;
    nextBtn.textContent = 'Start Cooking';
  }
  // Cooking steps
  else {
    const step = recipe.steps[currentStep];

    // Hide ingredients, show step
    ingredientsSection.style.display = 'none';
    stepSection.style.display = 'block';

    // Update progress
    document.getElementById('step-progress').textContent =
      `Step ${currentStep + 1} of ${totalSteps}`;

    // Update step content
    const parsedStep = parseStepText(step, recipe.ingredients, currentStep);
    document.getElementById('step-content').innerHTML = `<p>${parsedStep}</p>`;

    // Update step ingredients in separate container
    const stepIngredients = getStepIngredients(step, recipe.ingredients);
    const stepIngredientsContainer = document.getElementById('step-ingredients-container');

    if (stepIngredients.length > 0) {
      stepIngredientsContainer.innerHTML = `
        <div class="step-ingredients-cooking">
          <h4>Ingredients for this step:</h4>
          <ul>
            ${stepIngredients.map(ingredient => `
              <li>${ingredient}</li>
            `).join('')}
          </ul>
        </div>
      `;
      stepIngredientsContainer.style.display = 'block';
    } else {
      stepIngredientsContainer.style.display = 'none';
    }

    // Update navigation buttons
    prevBtn.disabled = false;

    if (currentStep === totalSteps - 1) {
      nextBtn.textContent = 'Finish';
    } else {
      nextBtn.textContent = 'Next';
    }
  }
}

function previousStep() {
  if (currentStep > -1) {
    currentStep--;
    renderStep();
    scrollToTop();
  }
}

function nextStep() {
  const totalSteps = recipe.steps.length;

  if (currentStep < totalSteps - 1) {
    currentStep++;
    renderStep();
    scrollToTop();
  } else {
    // Finished cooking
    exitCookingMode();
  }
}

function exitCookingMode() {
  window.location.href = `recipe.html?id=${recipe.id}`;
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
