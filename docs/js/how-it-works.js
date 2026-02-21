// How It Works — feature guide with real UI mockups

const FEATURES = [
  {
    id: 'find',
    title: 'Find something to cook',
    description: 'Search by name, or by ingredient if you want to use what\'s already in your fridge. Once you\'ve cooked a few recipes, you can rate them and filter to only show the ones you truly loved. And those recipes that become your go-tos? Mark them as favourites and find them in one tap.',
    mockups: [
      {
        label: 'Browse all recipes for inspiration:',
        html: `
          <div class="recipe-grid" style="margin-bottom:0;">
            <div class="recipe-card" style="cursor:default;">
              <div class="recipe-card-header">
                <h3 class="recipe-title">Thai Green Curry</h3>
                <button class="favorite-button-small favorited" tabindex="-1" aria-label="Favourited">
                  ${icon('heart', 20)}
                </button>
              </div>
              <p class="recipe-description">A fragrant coconut curry with seasonal vegetables</p>
              <div class="recipe-tags">
                <span class="tag">curry</span>
                <span class="tag">dinner</span>
              </div>
              <p class="card-cooking-stats">Cooked 3 times · ~35 min <span class="card-rating">· ★★★★☆</span></p>
            </div>
            <div class="recipe-card" style="cursor:default;">
              <div class="recipe-card-header">
                <h3 class="recipe-title">Pad Thai</h3>
                <button class="favorite-button-small" tabindex="-1" aria-label="Add to favourites">
                  ${icon('heart', 20)}
                </button>
              </div>
              <p class="recipe-description">Classic stir-fried noodles with tofu and peanuts</p>
              <div class="recipe-tags">
                <span class="tag">quick</span>
                <span class="tag">dinner</span>
              </div>
            </div>
          </div>
        `
      },
      {
        label: 'Use the search bar to find recipes by name or ingredient, and tap the filter icon to narrow down by tag or rating:',
        html: `
          <div style="margin-bottom:var(--spacing-xs);">
            <div class="search-container tag-dropdown" style="margin-bottom:0;">
              <input type="search" value="curry" aria-label="Search" tabindex="-1" style="width:100%;padding:var(--spacing-sm) var(--spacing-md);padding-right:5.5rem;font-size:0.95rem;font-weight:300;border:1px solid var(--border);border-radius:var(--radius-sm);background-color:var(--surface);letter-spacing:0.01em;">
              <div class="search-actions">
                <button class="search-action-btn active" tabindex="-1" aria-label="Filter by tag">
                  ${icon('filter', 18)}
                </button>
                <button class="search-action-btn" tabindex="-1" aria-label="Show favourites only">
                  ${icon('heart', 18)}
                </button>
                <button class="search-action-btn" tabindex="-1" aria-label="Surprise me">
                  ${icon('shuffle', 18)}
                </button>
              </div>
            </div>
          </div>
          <div class="filter-popover" style="display:flex;position:static;flex-direction:column;gap:var(--spacing-xs);">
            <div class="filter-row">
              <label class="filter-label">Tag</label>
              <div class="filter-select" style="position:relative;">
                <button class="filter-select-btn has-value" tabindex="-1">vegan</button>
              </div>
            </div>
            <div class="filter-row">
              <label class="filter-label">Rating</label>
              <div class="filter-select" style="position:relative;">
                <button class="filter-select-btn has-value" tabindex="-1">4+ stars</button>
              </div>
            </div>
            <div class="filter-actions">
              <button class="filter-reset-btn" tabindex="-1">Reset</button>
              <button class="filter-apply-btn" tabindex="-1">Show 2 recipes</button>
            </div>
          </div>
        `
      }
    ]
  },
  {
    id: 'surprise',
    title: 'Can\'t decide? Let us pick',
    description: 'Hit the shuffle button next to the search bar and we\'ll pick a random recipe for you. It respects whatever filters you have active, and it\'s smart enough to favour recipes you haven\'t cooked yet — so you\'re more likely to discover something new. You can also use it directly from the filter panel to pick a surprise within a specific tag or rating.',
    mockups: [
      {
        label: 'Tap the shuffle button in the search bar for an instant pick:',
        html: `
          <div class="search-container tag-dropdown" style="margin-bottom:0;">
            <input type="search" placeholder="Search recipes &amp; ingredients..." aria-label="Search" tabindex="-1" style="width:100%;padding:var(--spacing-sm) var(--spacing-md);padding-right:6.5rem;font-size:0.95rem;font-weight:300;border:1px solid var(--border);border-radius:var(--radius-sm);background-color:var(--surface);letter-spacing:0.01em;">
            <div class="search-actions">
              <button class="search-action-btn" tabindex="-1" aria-label="Filter by tag">
                ${icon('filter', 18)}
              </button>
              <button class="search-action-btn" tabindex="-1" aria-label="Show favourites only">
                ${icon('heart', 18)}
              </button>
              <button class="search-action-btn" tabindex="-1" aria-label="Surprise me">
                ${icon('shuffle', 18)}
              </button>
            </div>
          </div>
        `
      },
      {
        label: 'Or pick a surprise within a specific tag or rating from the filter panel:',
        html: `
          <div class="filter-popover" style="display:flex;position:static;flex-direction:column;gap:var(--spacing-xs);">
            <div class="filter-row">
              <label class="filter-label">Tag</label>
              <div class="filter-select" style="position:relative;">
                <button class="filter-select-btn has-value" tabindex="-1">dinner</button>
              </div>
            </div>
            <div class="filter-row">
              <label class="filter-label">Rating</label>
              <div class="filter-select" style="position:relative;">
                <button class="filter-select-btn" tabindex="-1">Any</button>
              </div>
            </div>
            <div class="filter-actions">
              <button class="surprise-popover-btn" tabindex="-1">🎲 Surprise me</button>
              <button class="filter-apply-btn" tabindex="-1">Show 4 recipes</button>
            </div>
          </div>
        `
      }
    ]
  },
  {
    id: 'diet',
    title: 'Cook your way',
    description: 'Vegan? Gluten-free? Head to Settings and toggle your dietary preferences — the recipe list will only show what fits. You\'ll also spot small badges on each card so you know at a glance what\'s what.',
    mockupHTML: `
      <div class="settings-list" style="max-width:none;">
        <div class="settings-item">
          <div class="settings-item-text">
            <span class="settings-item-label" style="display:flex;align-items:center;gap:0.4rem;">
              <span class="diet-badge" style="--diet-color:#6B9080">V</span> Vegan only
            </span>
            <span class="settings-item-description">Only show recipes marked as vegan</span>
          </div>
          <label class="toggle">
            <input type="checkbox" checked tabindex="-1">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="settings-item" style="margin-top:var(--spacing-xs);">
          <div class="settings-item-text">
            <span class="settings-item-label" style="display:flex;align-items:center;gap:0.4rem;">
              <span class="diet-badge" style="--diet-color:#C4A882">GF</span> Gluten-free only
            </span>
            <span class="settings-item-description">Only show recipes marked as gluten-free</span>
          </div>
          <label class="toggle">
            <input type="checkbox" tabindex="-1">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    `
  },
  {
    id: 'prepare',
    title: 'Get ready',
    description: 'Cooking for two instead of four? Just change the servings and all the quantities adjust on their own. Before you start, go through the ingredient list and check off what you already have. Anything missing? Tap the cart icon to add it to your shopping list.',
    mockups: [
      {
        label: 'On the recipe page, check off ingredients and add missing ones to your cart:',
        html: `
          <div class="serving-adjuster" style="margin-bottom:var(--spacing-sm);">
            <button tabindex="-1">−</button>
            <span><span style="font-weight:500;color:var(--primary-color)">4</span> servings</span>
            <button tabindex="-1">+</button>
          </div>
          <ul style="list-style:none;padding:0;">
            <li class="ingredients" style="margin-top:0;">
              <div style="padding:var(--spacing-sm);border-left:3px solid var(--accent-light);background-color:var(--accent-light-alpha-30);border-radius:var(--radius-sm);margin-bottom:var(--spacing-xs);">
                <div class="ingredient-item">
                  <div class="ingredient-checkbox">
                    <input type="checkbox" checked tabindex="-1">
                    <label style="text-decoration:line-through;color:var(--text-secondary);opacity:0.7;">400ml coconut milk</label>
                  </div>
                  <button class="add-to-cart" tabindex="-1" aria-label="Add to shopping list">
                    ${icon('cart', 16)}
                  </button>
                </div>
              </div>
              <div style="padding:var(--spacing-sm);border-left:3px solid var(--accent-light);background-color:var(--accent-light-alpha-30);border-radius:var(--radius-sm);">
                <div class="ingredient-item">
                  <div class="ingredient-checkbox">
                    <input type="checkbox" tabindex="-1">
                    <label>3 tbsp green curry paste</label>
                  </div>
                  <button class="add-to-cart in-cart" tabindex="-1" aria-label="In shopping list">
                    ${icon('cart', 16)}
                  </button>
                </div>
              </div>
            </li>
          </ul>
        `
      },
      {
        label: 'Then at the supermarket, tap the cart icon in the top right to open your shopping list and cross items off as you go:',
        html: `
          <div class="recipe-group" style="margin-bottom:0;">
            <div class="recipe-group-header">
              <span class="recipe-group-title">Thai Green Curry</span>
            </div>
            <ul class="shopping-items">
              <li class="shopping-item checked">
                <label class="shopping-item-checkbox">
                  <input type="checkbox" checked tabindex="-1">
                  <span class="shopping-item-label" style="color:var(--text-secondary);">3 tbsp green curry paste</span>
                </label>
              </li>
              <li class="shopping-item">
                <label class="shopping-item-checkbox">
                  <input type="checkbox" tabindex="-1">
                  <span class="shopping-item-label">1 block firm tofu</span>
                </label>
              </li>
            </ul>
          </div>
        `
      }
    ]
  },
  {
    id: 'cook',
    title: 'Start cooking',
    description: 'When you\'re ready, hit "Start cooking" and you\'ll get a focused view — one step at a time, with only the ingredients you need right there. No scrolling back and forth, no flour on your screen while you swipe around. You can also keep the screen always on with the lightbulb button — handy when your hands are covered in dough.',
    mockupHTML: `
      <div style="display:flex;align-items:center;justify-content:flex-end;padding:var(--spacing-xs) var(--spacing-sm);border-bottom:1px solid var(--border);margin-bottom:var(--spacing-sm);">
        <button class="screen-lock-button active" tabindex="-1" style="width:2.5rem;height:2.5rem;display:flex;align-items:center;justify-content:center;background:none;border:none;color:var(--primary-color);">
          ${icon('bulb', 30)}
        </button>
      </div>
      <div class="step-container" style="min-height:auto;">
        <div class="step-content">
          <p>Knead the <span class="ingredient-ref">dough</span> on a floured surface for <span class="time-badge">8 minutes</span> until smooth and elastic. Shape into a ball.</p>
        </div>
      </div>
      <div class="step-ingredients-cooking" style="margin-top:var(--spacing-md);">
        <h4>Ingredients for this step</h4>
        <ul>
          <li>500g bread flour</li>
          <li>325ml warm water</li>
          <li>7g dried yeast</li>
        </ul>
      </div>
    `
  },
  {
    id: 'timer',
    title: 'Never overcook again',
    description: 'No need to fumble with a separate timer — when a step says "simmer for 5 minutes", tap that duration and the timer is already set for you. Adjust it if you like, hit play, and move on to the next step while it counts down. It\'ll ping you when it\'s done.',
    mockupHTML: `
      <div class="timer-bar">
        <span></span>
        <span class="timer-center">
          <span class="timer-adjuster">
            <button class="timer-arrow" tabindex="-1">${icon('tri-up')}</button>
            <span class="timer-adjuster-label">min</span>
            <button class="timer-arrow" tabindex="-1">${icon('tri-down')}</button>
          </span>
          <span class="timer-display">5:00</span>
          <span class="timer-adjuster">
            <button class="timer-arrow" tabindex="-1">${icon('tri-up')}</button>
            <span class="timer-adjuster-label">sec</span>
            <button class="timer-arrow" tabindex="-1">${icon('tri-down')}</button>
          </span>
        </span>
        <span class="timer-right">
          <span class="timer-controls">
            <button class="timer-media-btn timer-media-btn-play" tabindex="-1">
              ${icon('play')}
            </button>
          </span>
        </span>
      </div>
    `
  },
  {
    id: 'after-cooking',
    title: 'Remember what worked',
    description: 'Right after you finish cooking, you can write down what you want to remember — "used extra lime", "needed more salt", "try Thai basil next time". Later, once you\'ve had a chance to actually taste the meal, we\'ll ask you to rate the recipe so you can remember which ones you loved the most.',
    mockups: [
      {
        label: 'Right after cooking, write down anything you want to remember:',
        html: `
          <div class="completion-notes" style="margin-bottom:0;animation:none;">
            <label class="notes-label">Anything to remember for next time?</label>
            <textarea class="notes-textarea" rows="3" tabindex="-1">Used extra lime juice — much better. Try adding Thai basil next time.</textarea>
          </div>
        `
      },
      {
        label: 'Later, a banner pops up so you can rate the recipe after you\'ve had a chance to savour it:',
        html: `
          <div class="rating-banner" style="position:static;animation:none;">
            <div class="rating-banner-content">
              <div class="rating-banner-text">
                <strong>French Cr\u00EApes</strong>
                <span>How was it?</span>
              </div>
              <div class="star-rating">
                <button tabindex="-1">★</button>
                <button tabindex="-1">★</button>
                <button tabindex="-1">★</button>
                <button tabindex="-1">★</button>
                <button tabindex="-1">★</button>
              </div>
              <button class="rating-banner-close" tabindex="-1" aria-label="Dismiss">&times;</button>
            </div>
          </div>
        `
      }
    ]
  },
  {
    id: 'share',
    title: 'Share the ones you love',
    description: 'Found a recipe your friends need to try? Tap the share button on any recipe page to send them a link — no account needed.',
    mockupHTML: `
      <div class="recipe" style="padding:var(--spacing-md);max-width:none;">
        <div class="recipe-header" style="margin-bottom:0;">
          <h2 class="recipe-name" style="font-size:1.5rem;">Galettes Bretonnes</h2>
          <div class="recipe-actions">
            <button class="icon-button" tabindex="-1" aria-label="Share recipe">
              ${icon('share', 24)}
            </button>
            <button class="icon-button" tabindex="-1" aria-label="Add to favourites">
              ${icon('heart', 24)}
            </button>
          </div>
        </div>
      </div>
    `
  },
  {
    id: 'offline',
    title: 'Take it anywhere',
    description: 'Install BiteMe on your phone and it works like a real app — even without internet. Whether you\'re at the supermarket checking your shopping list or cooking at a cabin with no signal, your recipes and your shopping list are always there. On Android, tap "Install" when prompted. On iPhone, tap Share then "Add to Home Screen".',
    mockupHTML: `
      <div class="install-banner" style="position:static;animation:none;">
        <div class="install-banner-content">
          <img src="assets/icons/icon-192.png" alt="BiteMe" class="install-banner-icon">
          <div class="install-banner-text">
            <strong>Add BiteMe to your home screen</strong>
            <span>Quick access, offline recipes</span>
          </div>
          <div class="install-banner-actions">
            <button class="install-btn" tabindex="-1">Install</button>
          </div>
        </div>
      </div>
    `
  },
  {
    id: 'cooking-log',
    title: 'See how far you\'ve come',
    description: 'What was that curry you made a couple of weeks ago? You\'ll find the answer in your cooking log, along with stats about your cooking habits — your streak, your most-made recipes, and a timeline of everything you\'ve cooked.',
    mockupHTML: `
      <div class="timeline-section" style="margin:0;">
        <div class="timeline-list">
          <div class="timeline-month">
            <div class="timeline-month-label">February 2026</div>
            <div class="timeline-entries">
              <div class="timeline-entry timeline-entry-link" style="text-decoration:none;color:inherit;">
                <span class="timeline-day">18</span>
                <span class="timeline-recipe-name">Tofu Scramble</span>
                ${icon('chevron-right', 16, 'timeline-chevron')}
              </div>
              <div class="timeline-entry timeline-entry-link" style="text-decoration:none;color:inherit;">
                <span class="timeline-day">17</span>
                <span class="timeline-recipe-name">French Cr\u00EApes</span>
                ${icon('chevron-right', 16, 'timeline-chevron')}
              </div>
              <div class="timeline-entry timeline-entry-link" style="text-decoration:none;color:inherit;">
                <span class="timeline-day">17</span>
                <span class="timeline-recipe-name">Chilli Sin Carne</span>
                ${icon('chevron-right', 16, 'timeline-chevron')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  }
];

document.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  await setSetting('hasSeenHowItWorks', true);

  renderFeatures();
  handleHashScroll();
});

function renderMockups(feature) {
  if (feature.mockupHTML) {
    return `<div class="feature-mockup">${feature.mockupHTML}</div>`;
  }
  return feature.mockups.map(m =>
    `${m.label ? `<p class="feature-mockup-label">${m.label}</p>` : ''}
     <div class="feature-mockup">${m.html}</div>`
  ).join('');
}

function renderFeatures() {
  const container = document.getElementById('features-list');
  container.innerHTML = FEATURES.map(feature => `
    <section class="feature-section" id="${feature.id}">
      <h3 class="feature-title">${feature.title}</h3>
      <p class="feature-description">${feature.description}</p>
      ${renderMockups(feature)}
    </section>
  `).join('') + `
    <div class="feature-cta">
      <a href="index.html" class="button button-primary">Start cooking</a>
    </div>
  `;
}

function handleHashScroll() {
  if (!window.location.hash) return;
  const target = document.querySelector(window.location.hash);
  if (target) {
    // Small delay to ensure layout is settled
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth' });
    });
  }
}
