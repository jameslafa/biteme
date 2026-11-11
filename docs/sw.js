const CACHE_NAME = 'biteme-v43';
const NETWORK_TIMEOUT_MS = 3000;
const SLOW_NETWORK_WINDOW_MS = 30000;
let slowNetworkUntil = 0;

const APP_SHELL = [
  './',
  'index.html',
  'recipe.html',
  'cooking.html',
  'shopping.html',
  'plan.html',
  'cooking-log.html',
  'settings.html',
  'friends.html',
  'completion.html',
  'css/style.css',
  'css/recipe.css',
  'css/cooking.css',
  'css/shopping.css',
  'css/plan.css',
  'css/cooking-log.css',
  'css/settings.css',
  'css/friends.css',
  'css/completion.css',
  'js/icons.js',
  'js/db.js',
  'js/recipes.js',
  'js/app.js',
  'js/cooking.js',
  'js/shopping.js',
  'js/plan.js',
  'js/recommendations.js',
  'js/cooking-log.js',
  'js/settings.js',
  'js/friends.js',
  'js/servings.js',
  'js/notes.js',
  'js/rating.js',
  'js/completion.js',
  'js/sw-update.js',
  'assets/icons/favicon.svg',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/illustrations/finished.svg',
  'assets/illustrations/empty_cart.svg',
  'assets/illustrations/empty_favourite.svg',
  'assets/illustrations/celebrate.svg',
  'assets/illustrations/winners.svg',
  'assets/illustrations/empty.svg',
  'assets/silent.mp4',
  'assets/timer-beep.mp3',
  'ingredients.json',
  'manifest.webmanifest',
];

// Install - pre-cache app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use allSettled so one failure doesn't block everything
      return Promise.allSettled(
        APP_SHELL.map((url) => cache.add(url).catch((err) => {
          console.warn('[SW] Failed to cache:', url, err);
        }))
      );
    })
  );
  self.skipWaiting();
});

// Activate - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch handler
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-http requests
  if (!url.protocol.startsWith('http')) return;

  // Don't intercept recipe data — let recipes.js handle via localStorage
  if (url.pathname.endsWith('recipes.json') || url.pathname.endsWith('recipes-manifest.json')) {
    return;
  }

  // Navigation requests are cached by pathname only, so recipe.html?id=X
  // doesn't create a separate entry per recipe
  if (event.request.mode === 'navigate') {
    event.respondWith(
      networkFirst(event.request, url.origin + url.pathname)
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  event.respondWith(networkFirst(event.request, event.request));
});

// Network-first, but don't wait on a slow connection: after NETWORK_TIMEOUT_MS,
// serve the cached copy if there is one. Once a request has timed out, treat the
// connection as slow for SLOW_NETWORK_WINDOW_MS and serve cached copies right away,
// so the timeout isn't paid again by every script and data file the page loads.
// The network response still updates the cache in the background for next time.
async function networkFirst(request, cacheKey) {
  const network = fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy));
    }
    return response;
  });
  network.catch(() => {}); // a late failure after serving the cache is not an error

  if (Date.now() < slowNetworkUntil) {
    const cached = await caches.match(cacheKey);
    if (cached) return cached;
  }

  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));
  try {
    const response = await Promise.race([network, timeout]);
    if (response) return response;
    slowNetworkUntil = Date.now() + SLOW_NETWORK_WINDOW_MS;
  } catch {
    // Network failed — fall through to cache
  }

  const cached = await caches.match(cacheKey);
  return cached || network;
}
