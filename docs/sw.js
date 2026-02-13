const CACHE_NAME = 'biteme-v24';

const APP_SHELL = [
  './',
  'index.html',
  'recipe.html',
  'cooking.html',
  'shopping.html',
  'completion.html',
  'css/style.css',
  'css/recipe.css',
  'css/cooking.css',
  'css/shopping.css',
  'css/completion.css',
  'js/changelog.js',
  'js/db.js',
  'js/recipes.js',
  'js/app.js',
  'js/cooking.js',
  'js/shopping.js',
  'js/servings.js',
  'js/completion.js',
  'js/install.js',
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

  // Navigation requests (HTML pages)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache by pathname only (strip query string) so recipe.html?id=X doesn't create separate entries
          const cacheKey = url.origin + url.pathname;
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(cacheKey, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // Offline: try to match by pathname
          const cacheKey = url.origin + url.pathname;
          return caches.match(cacheKey).then((cached) => {
            return cached || caches.match('index.html');
          });
        })
    );
    return;
  }

  // Static assets (CSS, JS, images) — network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
