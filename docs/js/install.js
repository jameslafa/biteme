// PWA Install Prompt Handler

let deferredPrompt = null;

// Check if app is already installed (running in standalone mode)
function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

// Check if user previously dismissed the prompt
function wasDismissed() {
  return localStorage.getItem('install-prompt-dismissed') === 'true';
}

// Detect iOS
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// Show the install banner
function showInstallBanner() {
  const banner = document.getElementById('install-banner');
  if (banner) {
    banner.style.display = 'block';
  }
}

// Hide the install banner
function hideInstallBanner() {
  const banner = document.getElementById('install-banner');
  if (banner) {
    banner.style.display = 'none';
  }
}

// Initialize install prompt
function initInstallPrompt() {
  // Don't show if already installed or dismissed
  if (isInstalled() || wasDismissed()) {
    return;
  }

  const installButton = document.getElementById('install-button');
  const closeButton = document.getElementById('install-close');
  const instructionsText = document.getElementById('install-instructions');

  // iOS-specific instructions
  if (isIOS()) {
    instructionsText.textContent = 'Get fullscreen experience and offline access';

    const modal = document.getElementById('install-modal');
    const modalClose = document.getElementById('modal-close');
    const modalOverlay = modal?.querySelector('.install-modal-overlay');

    // Show modal
    const showModal = () => {
      if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      }
    };

    // Hide modal
    const hideModal = () => {
      if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
      }
    };

    // On iOS, clicking install shows modal with instructions
    installButton.addEventListener('click', showModal);
    modalClose?.addEventListener('click', hideModal);
    modalOverlay?.addEventListener('click', hideModal);

    // Show banner after a short delay
    setTimeout(showInstallBanner, 2000);
  } else {
    // Android/Desktop: Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;

      // Show banner after a short delay
      setTimeout(showInstallBanner, 2000);
    });

    // Handle install button click
    installButton.addEventListener('click', async () => {
      if (!deferredPrompt) {
        return;
      }

      // Show browser's install prompt
      deferredPrompt.prompt();

      // Wait for user choice
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User ${outcome} the install prompt`);

      // Clear the prompt
      deferredPrompt = null;
      hideInstallBanner();

      if (outcome === 'accepted') {
        localStorage.setItem('install-prompt-dismissed', 'true');
      }
    });
  }

  // Handle close button
  closeButton.addEventListener('click', () => {
    hideInstallBanner();
    localStorage.setItem('install-prompt-dismissed', 'true');
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initInstallPrompt);
} else {
  initInstallPrompt();
}
