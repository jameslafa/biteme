// Cooking mode logic

let currentStep = 0; // Start at first cooking step
let recipe = null;
let cookingSessionId = null;

document.addEventListener('DOMContentLoaded', async function() {
  const urlParams = new URLSearchParams(window.location.search);
  const recipeId = urlParams.get('id');

  if (!recipeId) {
    window.location.href = 'index.html';
    return;
  }

  recipe = await getRecipeById(recipeId);

  if (!recipe) {
    window.location.href = 'index.html';
    return;
  }

  document.title = `Cooking: ${recipe.name}`;
  document.getElementById('recipe-name').textContent = recipe.name;
  initializeCookingMode();
  renderStep();

  saveCookingStart(recipeId).then(id => {
    cookingSessionId = id;
  }).catch(() => {});
});

function initializeCookingMode() {
  // Setup navigation buttons
  document.getElementById('prev-btn').addEventListener('click', previousStep);
  document.getElementById('next-btn').addEventListener('click', nextStep);
  document.getElementById('exit-btn').addEventListener('click', exitCookingMode);
}

function updateProgressBar() {
  const totalSteps = recipe.steps.length;
  const progress = (currentStep / totalSteps) * 100;
  document.getElementById('progress-bar').style.width = `${progress}%`;
}

function renderStep() {
  const totalSteps = recipe.steps.length;
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');

  const step = recipe.steps[currentStep];

  // Update progress text and bar
  document.getElementById('step-progress').textContent =
    `Step ${currentStep + 1} of ${totalSteps}`;
  updateProgressBar();

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
            <li>${ingredient.text}</li>
          `).join('')}
        </ul>
      </div>
    `;
    stepIngredientsContainer.style.display = 'block';
  } else {
    stepIngredientsContainer.style.display = 'none';
  }

  // Update navigation buttons
  // Previous button always enabled - on step 0 it returns to recipe overview
  prevBtn.disabled = false;

  if (currentStep === totalSteps - 1) {
    nextBtn.textContent = 'Finish';
  } else {
    nextBtn.textContent = 'Next';
  }

  if (currentStep === 0) {
    prevBtn.textContent = 'Back to recipe';
  } else {
    prevBtn.textContent = 'Previous';
  }
}

function transitionStep(callback) {
  const stepContent = document.getElementById('step-content');
  const ingredientsContainer = document.getElementById('step-ingredients-container');

  stepContent.style.opacity = '0';
  ingredientsContainer.style.opacity = '0';

  setTimeout(() => {
    callback();
    stepContent.style.opacity = '1';
    ingredientsContainer.style.opacity = '1';
  }, 200);
}

function previousStep() {
  if (currentStep === 0) {
    exitCookingMode();
  } else {
    transitionStep(() => {
      currentStep--;
      renderStep();
      scrollToTop();
    });
  }
}

function nextStep() {
  const totalSteps = recipe.steps.length;

  if (currentStep < totalSteps - 1) {
    transitionStep(() => {
      currentStep++;
      renderStep();
      scrollToTop();
    });
  } else {
    // Finished cooking - show 100% progress briefly before going to completion page
    document.getElementById('progress-bar').style.width = '100%';
    setTimeout(() => {
      finishCookingMode();
    }, 500);
  }
}

function exitCookingMode() {
  window.location.href = `recipe.html?id=${recipe.id}`;
}

function finishCookingMode() {
  const params = new URLSearchParams({ id: recipe.id });
  if (cookingSessionId) params.set('session', cookingSessionId);
  window.location.href = `completion.html?${params}`;
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
