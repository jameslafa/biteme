// Cooking mode logic

let currentStep = 0; // Start at first cooking step
let recipe = null;
let cookingSessionId = null;
let servingRatio = 1;

// Timer state
let timerSeconds = 0;
let timerRemaining = 0;
let timerInterval = null;
let timerRunning = false;
let timerFinished = false;
let timerDismissed = false;
let timerAudio = null;

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

  const savedServings = getServings(recipeId, recipe.servings);
  servingRatio = savedServings / recipe.servings;

  document.title = `Cooking: ${recipe.name}`;
  const headerText = savedServings !== recipe.servings
    ? `${recipe.name} (${savedServings} servings)`
    : recipe.name;
  document.getElementById('recipe-name').textContent = headerText;
  initializeCookingMode();
  renderStep();

  saveCookingStart(recipeId).then(id => {
    cookingSessionId = id;
  }).catch(() => {});

});

// Screen wake lock — toggled by user via header button.
// Uses Wake Lock API + unmuted silent video (iOS needs a user gesture
// to play unmuted audio, which is what actually prevents screen sleep).
let screenLockActive = false;
let wakeLockSentinel = null;
let noSleepVideo = null;

function initScreenLockButton() {
  const btn = document.getElementById('screen-lock-btn');
  btn.addEventListener('click', () => {
    if (screenLockActive) {
      disableScreenLock();
    } else {
      enableScreenLock();
    }
  });
}

async function enableScreenLock() {
  screenLockActive = true;
  document.getElementById('screen-lock-btn').classList.add('active');

  // Wake Lock API (works on Android/desktop Chrome)
  try {
    if ('wakeLock' in navigator) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    }
  } catch {
    // Not available or denied
  }

  // Video-only loop (no audio track) keeps iOS awake via active media
  // playback without interfering with audio routing (e.g. AirPods).
  if (!noSleepVideo) {
    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('loop', '');
    video.muted = true;
    video.src = 'assets/silent.mp4';
    video.style.cssText = 'position:fixed;top:-1px;left:-1px;width:1px;height:1px;opacity:0.01;';
    document.body.appendChild(video);
    noSleepVideo = video;
  }
  noSleepVideo.play().catch(() => {});
}

function disableScreenLock() {
  screenLockActive = false;
  document.getElementById('screen-lock-btn').classList.remove('active');

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

document.addEventListener('visibilitychange', () => {
  if (!screenLockActive || document.visibilityState !== 'visible') return;
  if (!wakeLockSentinel) {
    navigator.wakeLock?.request('screen').then(s => {
      wakeLockSentinel = s;
      s.addEventListener('release', () => { wakeLockSentinel = null; });
    }).catch(() => {});
  }
  if (noSleepVideo) noSleepVideo.play().catch(() => {});
});

function initializeCookingMode() {
  document.getElementById('prev-btn').addEventListener('click', previousStep);
  document.getElementById('next-btn').addEventListener('click', nextStep);
  document.getElementById('exit-btn').addEventListener('click', exitCookingMode);
  initScreenLockButton();
  initTimerToggleButton();
}

function initTimerToggleButton() {
  document.getElementById('timer-toggle-btn').addEventListener('click', toggleTimerBar);
}

function toggleTimerBar() {
  const bar = document.getElementById('timer-bar');
  if (!bar.hidden && !timerRunning) {
    // Hide the timer bar
    timerDismissed = true;
    timerSeconds = 0;
    timerRemaining = 0;
    renderTimerBar();
  } else if (bar.hidden) {
    // Show the timer bar
    timerFinished = false;
    timerDismissed = false;
    const step = recipe.steps[currentStep];
    const durations = step.durations || [];
    timerSeconds = durations.length > 0 ? durations[0].seconds : 60;
    timerRemaining = timerSeconds;
    renderTimerBar();
  }
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
  const parsedStep = parseStepText(step.text, recipe.ingredients, currentStep);
  let stepContentHTML = `<p>${wrapTimeBadges(parsedStep, step.durations || [])}</p>`;

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
  const stepIngredients = getStepIngredients(step.text, recipe.ingredients);
  const stepIngredientsContainer = document.getElementById('step-ingredients-container');

  if (stepIngredients.length > 0) {
    stepIngredientsContainer.innerHTML = `
      <div class="step-ingredients-cooking">
        <h4>Ingredients for this step:</h4>
        <ul>
          ${stepIngredients.map(ingredient => `
            <li>${scaleIngredientText(ingredient, servingRatio)}</li>
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

  suggestTimerForStep();
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
  disableScreenLock();
  window.location.href = `recipe.html?id=${recipe.id}`;
}

function finishCookingMode() {
  disableScreenLock();
  const params = new URLSearchParams({ id: recipe.id });
  if (cookingSessionId) params.set('session', cookingSessionId);
  window.location.href = `completion.html?${params}`;
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Timer ---

const ICON_TRI_UP = `<svg viewBox="0 0 24 24"><polygon points="12,6 4,18 20,18"/></svg>`;
const ICON_TRI_DOWN = `<svg viewBox="0 0 24 24"><polygon points="12,18 4,6 20,6"/></svg>`;
const ICON_PLAY = `<svg viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20"/></svg>`;
const ICON_PAUSE = `<svg viewBox="0 0 24 24"><rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/></svg>`;
const ICON_STOP = `<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1"/></svg>`;

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function suggestTimerForStep() {
  if (timerRunning || timerFinished) return;
  timerDismissed = false;
  const step = recipe.steps[currentStep];
  const durations = step.durations || [];
  if (durations.length > 0) {
    timerSeconds = durations[0].seconds;
    timerRemaining = durations[0].seconds;
  } else {
    timerSeconds = 0;
    timerRemaining = 0;
  }
  renderTimerBar();
}

function renderTimerBar() {
  const bar = document.getElementById('timer-bar');
  const toggleBtn = document.getElementById('timer-toggle-btn');

  // Toggle button is always visible; active when timer bar is showing
  toggleBtn.hidden = false;

  if (timerRunning) {
    // During ticks, only update the time text to avoid DOM rebuild flicker
    const existingDisplay = bar.querySelector('.timer-display');
    if (bar.className === 'timer-bar timer-running' && existingDisplay) {
      existingDisplay.textContent = formatTime(timerRemaining);
      updateToggleActive(true);
      return;
    }
    bar.hidden = false;
    bar.className = 'timer-bar timer-running';
    bar.innerHTML = `
      <span></span>
      <span class="timer-display">${formatTime(timerRemaining)}</span>
      <span class="timer-controls">
        <button class="timer-media-btn" onclick="pauseTimer()" aria-label="Pause">${ICON_PAUSE}</button>
        <button class="timer-media-btn timer-media-btn-stop" onclick="stopTimer()" aria-label="Stop">${ICON_STOP}</button>
      </span>
    `;
    updateToggleActive(true);
    return;
  }

  // Paused (was running, now paused)
  if (timerInterval === null && timerRemaining > 0 && timerRemaining < timerSeconds) {
    bar.hidden = false;
    bar.className = 'timer-bar timer-paused';
    bar.innerHTML = `
      <span></span>
      <span class="timer-display">${formatTime(timerRemaining)}</span>
      <span class="timer-controls">
        <button class="timer-media-btn timer-media-btn-play" onclick="startTimer()" aria-label="Resume">${ICON_PLAY}</button>
        <button class="timer-media-btn timer-media-btn-stop" onclick="stopTimer()" aria-label="Stop">${ICON_STOP}</button>
      </span>
    `;
    updateToggleActive(true);
    return;
  }

  // Suggestion mode
  if (timerSeconds > 0 && !timerDismissed) {
    bar.hidden = false;
    bar.className = 'timer-bar';
    bar.innerHTML = `
      <span></span>
      <span class="timer-center">
        <span class="timer-adjuster">
          <button class="timer-arrow" onclick="adjustTimer(60)" aria-label="Add 1 minute">${ICON_TRI_UP}</button>
          <span class="timer-adjuster-label">min</span>
          <button class="timer-arrow" onclick="adjustTimer(-60)" aria-label="Subtract 1 minute">${ICON_TRI_DOWN}</button>
        </span>
        <span class="timer-display">${formatTime(timerSeconds)}</span>
        <span class="timer-adjuster">
          <button class="timer-arrow" onclick="adjustTimer(5)" aria-label="Add 5 seconds">${ICON_TRI_UP}</button>
          <span class="timer-adjuster-label">sec</span>
          <button class="timer-arrow" onclick="adjustTimer(-5)" aria-label="Subtract 5 seconds">${ICON_TRI_DOWN}</button>
        </span>
      </span>
      <span class="timer-right">
        <button class="timer-media-btn timer-media-btn-play" onclick="startTimer()" aria-label="Start">${ICON_PLAY}</button>
      </span>
    `;
    updateToggleActive(true);
    return;
  }

  // No timer to show
  bar.hidden = true;
  bar.className = 'timer-bar';
  updateToggleActive(false);
}

function updateToggleActive(active) {
  document.getElementById('timer-toggle-btn').classList.toggle('active', active);
}

function adjustTimer(delta) {
  timerSeconds = Math.max(5, timerSeconds + delta);
  timerRemaining = timerSeconds;
  renderTimerBar();
}

function ensureTimerAudio() {
  if (!timerAudio) {
    timerAudio = new Audio('assets/timer-beep.mp3');
  }
  // Unlock audio on iOS by playing muted from a user gesture.
  // iOS ignores volume=0 but respects the muted property.
  timerAudio.muted = true;
  timerAudio.play().then(() => {
    timerAudio.pause();
    timerAudio.currentTime = 0;
    timerAudio.muted = false;
  }).catch(() => {
    timerAudio.muted = false;
  });
}

function startTimer() {
  ensureTimerAudio();
  // Keep screen on so the timer can ring
  if (!screenLockActive) enableScreenLock();
  timerRunning = true;
  timerFinished = false;
  timerInterval = setInterval(() => {
    timerRemaining--;
    if (timerRemaining <= 0) {
      timerRemaining = 0;
      timerRunning = false;
      timerFinished = true;
      clearInterval(timerInterval);
      timerInterval = null;
      onTimerComplete();
    }
    renderTimerBar();
  }, 1000);
  renderTimerBar();
}

function pauseTimer() {
  timerRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  renderTimerBar();
}

function stopTimer() {
  timerRunning = false;
  timerFinished = false;
  clearInterval(timerInterval);
  timerInterval = null;
  // Re-suggest from current step
  suggestTimerForStep();
}

function onTimerComplete() {
  playTimerBeep();
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200]);
  }
  // Auto-reset: go back to suggestion for current step
  timerFinished = false;
  suggestTimerForStep();
}

function playTimerBeep() {
  if (!timerAudio) return;
  timerAudio.currentTime = 0;
  timerAudio.play().catch(() => {});
}

function prefillTimer(seconds) {
  if (timerRunning) return;
  timerFinished = false;
  timerDismissed = false;
  timerSeconds = seconds;
  timerRemaining = seconds;
  renderTimerBar();
  document.getElementById('timer-bar').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function wrapTimeBadges(html, durations) {
  for (const d of durations) {
    const escaped = d.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(escaped), `<span class="time-badge" onclick="prefillTimer(${d.seconds})">${d.text}</span>`);
  }
  return html;
}
