const CACHE_NAME = 'biteme-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/recipe.html',
  '/cooking.html',
  '/shopping.html',
  '/completion.html',
  '/css/style.css',
  '/css/recipe.css',
  '/css/cooking.css',
  '/css/shopping.css',
  '/css/completion.css',
  '/js/app.js',
  '/js/db.js',
  '/js/recipes.js',
  '/js/cooking.js',
  '/js/shopping.js',
  '/js/completion.js',
  '/assets/illustrations/empty.svg',
  '/assets/illustrations/empty_cart.svg',
  '/assets/illustrations/empty_favourite.svg',
  '/assets/illustrations/celebrate.svg',
  '/assets/illustrations/finished.svg',
  '/assets/illustrations/winners.svg',
  '/assets/icons/favicon.svg',
  '/assets/icons/apple-touch-icon.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/manifest.webmanifest',
  '/recipes.json',
  '/recipes-manifest.json'
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Caching', STATIC_ASSETS.length, 'static assets');

      // Cache each asset individually to identify failures
      const results = await Promise.allSettled(
        STATIC_ASSETS.map(async (asset) => {
          try {
            await cache.add(asset);
            console.log('[SW] Cached:', asset);
            return { asset, success: true };
          } catch (err) {
            console.error('[SW] Failed to cache:', asset, err.message);
            return { asset, success: false, error: err.message };
          }
        })
      );

      const failed = results.filter(r => r.value && !r.value.success);
      if (failed.length > 0) {
        console.warn('[SW] Failed to cache', failed.length, 'assets');
      } else {
        console.log('[SW] All assets cached successfully!');
      }
    })
  );
  self.skipWaiting();
});

// Activate - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone response for caching
        const responseToCache = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      })
      .catch((error) => {
        // Network failed, try cache
        console.log('[SW] Network failed for:', event.request.url, error.message);
        return caches.match(event.request, { ignoreSearch: true }).then((response) => {
          if (response) {
            console.log('[SW] Serving from cache:', event.request.url);
            return response;
          }

          console.error('[SW] Not in cache:', event.request.url);
          // Not in cache either
          return new Response('Offline and not cached', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});
