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

  keepScreenAwake();
});

// Screen wake: uses Wake Lock API with a silent video fallback for iOS
let wakeLockSentinel = null;
let noSleepVideo = null;

async function keepScreenAwake() {
  await requestWakeLock();
  startNoSleepVideo();
}

function releaseScreenAwake() {
  if (wakeLockSentinel) {
    wakeLockSentinel.release();
    wakeLockSentinel = null;
  }
  if (noSleepVideo) {
    noSleepVideo.pause();
    noSleepVideo.remove();
    noSleepVideo = null;
  }
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    }
  } catch {
    // Wake lock not available or denied — no action needed
  }
}

function startNoSleepVideo() {
  if (noSleepVideo) return;
  const video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.setAttribute('loop', '');
  video.muted = true;
  video.src = 'assets/silent.mp4';
  video.style.cssText = 'position:fixed;top:-1px;left:-1px;width:1px;height:1px;opacity:0.01;';
  document.body.appendChild(video);
  video.play().catch(() => {});
  noSleepVideo = video;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!wakeLockSentinel) requestWakeLock();
    if (noSleepVideo) noSleepVideo.play().catch(() => {});
  }
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
  let stepContentHTML = `<p>${parsedStep}</p>`;

  // Add notes after step 1 instruction
  if (currentStep === 0 && recipe.notes) {
    stepContentHTML += `
      <div class="step-notes">
        <h4>Chef's Notes</h4>
        <p>${recipe.notes}</p>
      </div>
    `;
  }

  // Add serving suggestions after last step instruction
  if (currentStep === totalSteps - 1 && recipe.serving_suggestions) {
    stepContentHTML += `
      <div class="step-serving">
        <h4>Serving Suggestions</h4>
        <p>${recipe.serving_suggestions}</p>
      </div>
    `;
  }

  document.getElementById('step-content').innerHTML = stepContentHTML;

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
  releaseScreenAwake();
  window.location.href = `recipe.html?id=${recipe.id}`;
}

function finishCookingMode() {
  releaseScreenAwake();
  const params = new URLSearchParams({ id: recipe.id });
  if (cookingSessionId) params.set('session', cookingSessionId);
  window.location.href = `completion.html?${params}`;
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
