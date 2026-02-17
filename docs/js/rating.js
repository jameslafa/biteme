// Rating banner — prompts user to rate after cooking

// Render a star rating widget. Returns the container element.
// onRate(rating) is called when a star is clicked.
// initialRating is the pre-filled value (0 = none).
function createStarRating(onRate, initialRating = 0) {
  const container = document.createElement('div');
  container.className = 'star-rating';

  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '\u2605';
    btn.setAttribute('aria-label', `Rate ${i} star${i > 1 ? 's' : ''}`);
    if (i <= initialRating) btn.classList.add('filled');

    btn.addEventListener('click', () => {
      onRate(i);
      // Update visual state
      container.querySelectorAll('button').forEach((b, idx) => {
        b.classList.toggle('filled', idx < i);
      });
    });

    container.appendChild(btn);
  }

  return container;
}

// Check for unrated completed cooking sessions and show a banner if needed
async function showRatingBannerIfNeeded() {
  try {
    const sessions = await getAllCompletedSessions();
    if (sessions.length === 0) return;

    // Find the most recent completed session that hasn't been rated or dismissed
    let targetSession = null;
    for (let i = sessions.length - 1; i >= 0; i--) {
      const s = sessions[i];
      if (!s.rated_at && !s.rating_dismissed_at) {
        targetSession = s;
        break;
      }
    }

    if (!targetSession) return;

    const recipe = await getRecipeById(targetSession.recipe_id);
    if (!recipe) return;

    renderRatingBanner(recipe, targetSession);
  } catch {
    // Silent fail — banner is non-critical
  }
}

function renderRatingBanner(recipe, session) {
  const banner = document.createElement('div');
  banner.className = 'rating-banner';
  banner.id = 'rating-banner';

  const content = document.createElement('div');
  content.className = 'rating-banner-content';

  const text = document.createElement('div');
  text.className = 'rating-banner-text';
  text.innerHTML = `<strong>${recipe.name}</strong><span>How was it?</span>`;

  const stars = createStarRating(async (rating) => {
    await saveRating(recipe.id, rating);
    await updateSessionRatingStatus(session.id, 'rated_at');
    // Show thanks, then hide
    banner.innerHTML = '<div class="rating-banner-thanks">Thanks!</div>';
    setTimeout(() => banner.remove(), 1200);
    // Update card rating if visible
    updateCardRating(recipe.id, rating);
  });

  const closeBtn = document.createElement('button');
  closeBtn.className = 'rating-banner-close';
  closeBtn.setAttribute('aria-label', 'Dismiss');
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', async () => {
    await updateSessionRatingStatus(session.id, 'rating_dismissed_at');
    banner.remove();
  });

  content.appendChild(text);
  content.appendChild(stars);
  content.appendChild(closeBtn);
  banner.appendChild(content);

  // Insert before the search bar
  const main = document.querySelector('main');
  const searchContainer = document.querySelector('.search-container');
  if (main && searchContainer) {
    main.insertBefore(banner, searchContainer);
  }
}

// Update a single card's rating display after rating from banner
function updateCardRating(recipeId, rating) {
  const card = document.querySelector(`.recipe-card [data-recipe-id="${recipeId}"]`);
  if (!card) return;
  const recipeCard = card.closest('.recipe-card');
  if (!recipeCard) return;

  // Remove existing rating span if any
  const existing = recipeCard.querySelector('.card-rating');
  if (existing) existing.remove();

  const statsEl = recipeCard.querySelector('.card-cooking-stats');
  if (statsEl) {
    const ratingSpan = document.createElement('span');
    ratingSpan.className = 'card-rating';
    ratingSpan.textContent = ` · ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
    statsEl.appendChild(ratingSpan);
  }
}
