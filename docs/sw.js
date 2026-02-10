const CACHE_NAME = 'biteme-v16';

// Install - just activate immediately, don't pre-cache
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
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

// Fetch - cache on demand
self.addEventListener('fetch', (event) => {
  // Skip non-http requests
  if (!event.request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[SW] Cache hit:', event.request.url);
          return cachedResponse;
        }

        // Not in cache, fetch from network
        console.log('[SW] Fetching:', event.request.url);
        return fetch(event.request)
          .then((response) => {
            // Cache successful responses
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return response;
          })
          .catch((error) => {
            console.error('[SW] Fetch failed:', event.request.url, error);
            // Return a basic offline page for navigation
            if (event.request.mode === 'navigate') {
              return new Response(
                '<h1>Offline</h1><p>No cached version available.</p>',
                { headers: { 'Content-Type': 'text/html' } }
              );
            }
            return new Response('Offline', { status: 503 });
          });
      })
  );
});
