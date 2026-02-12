// Service Worker Update Detection
// The SW uses skipWaiting + clients.claim, so updates activate automatically.
// We just need to reload the page when a new SW takes over so the user
// gets fresh assets without a manual refresh.

function detectServiceWorkerUpdate() {
  if (!('serviceWorker' in navigator)) return;

  // Only reload on controller change if there was already a controller.
  // On first visit (no existing SW), controllerchange fires when the new
  // SW claims the page — we don't want to reload in that case.
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.ready.then((registration) => {
    // Check for updates periodically (every 60 seconds)
    setInterval(() => {
      registration.update();
    }, 60000);
  });
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', detectServiceWorkerUpdate);
} else {
  detectServiceWorkerUpdate();
}
