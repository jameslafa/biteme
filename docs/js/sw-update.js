// Service Worker Update Detection
// Shows a toast when a new version is available

let updateToast = null;

function showUpdateToast() {
  // Don't show multiple toasts
  if (updateToast) return;

  updateToast = document.createElement('div');
  updateToast.className = 'update-toast';
  updateToast.innerHTML = `
    <div class="update-toast-content">
      <span>New recipes available</span>
      <button class="update-toast-btn">Refresh</button>
      <button class="update-toast-close" aria-label="Dismiss">×</button>
    </div>
  `;

  document.body.appendChild(updateToast);

  // Refresh button
  updateToast.querySelector('.update-toast-btn').addEventListener('click', () => {
    window.location.reload();
  });

  // Dismiss button
  updateToast.querySelector('.update-toast-close').addEventListener('click', () => {
    updateToast.remove();
    updateToast = null;
  });

  // Auto-show with animation
  setTimeout(() => updateToast.classList.add('show'), 100);
}

function detectServiceWorkerUpdate() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.ready.then((registration) => {
    // Check for updates periodically (every 60 seconds)
    setInterval(() => {
      registration.update();
    }, 60000);

    // Listen for new service worker waiting
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New service worker installed and there's an old one active
          // This means there's an update available
          showUpdateToast();
        }
      });
    });
  });

  // Also check if there's already a waiting service worker
  navigator.serviceWorker.getRegistration().then((registration) => {
    if (registration && registration.waiting) {
      showUpdateToast();
    }
  });
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', detectServiceWorkerUpdate);
} else {
  detectServiceWorkerUpdate();
}
