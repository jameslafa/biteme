// PWA Install Prompt Handler

let deferredPrompt = null;

const DISMISSAL_COUNT_KEY = 'install-prompt-dismissals';
const DISMISSED_AT_KEY = 'install-prompt-dismissed-at';
const MAX_DISMISSALS = 3;
const COOLDOWN_DAYS = 30;

// Check if app is already installed (running in standalone mode)
function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

// Check if install prompt should be suppressed
function shouldSuppressPrompt() {
  const dismissals = parseInt(localStorage.getItem(DISMISSAL_COUNT_KEY) || '0');
  if (dismissals >= MAX_DISMISSALS) return true;

  const dismissedAt = parseInt(localStorage.getItem(DISMISSED_AT_KEY) || '0');
  if (dismissedAt) {
    const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
    if (daysSince < COOLDOWN_DAYS) return true;
  }

  return false;
}

// Record a dismissal
function recordDismissal() {
  const dismissals = parseInt(localStorage.getItem(DISMISSAL_COUNT_KEY) || '0');
  localStorage.setItem(DISMISSAL_COUNT_KEY, String(dismissals + 1));
  localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
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
async function initInstallPrompt() {
  // Don't show if already installed or suppressed
  if (isInstalled() || shouldSuppressPrompt()) return;

  // Only show after user has completed at least one recipe
  try {
    const completed = await hasCompletedCooking();
    if (!completed) return;
  } catch {
    return;
  }

  const installButton = document.getElementById('install-button');
  const closeButton = document.getElementById('install-close');
  const instructionsText = document.getElementById('install-instructions');

  // iOS-specific instructions
  if (isIOS()) {
    instructionsText.textContent = 'Quick access, offline recipes';

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
      if (!deferredPrompt) return;

      // Show browser's install prompt
      deferredPrompt.prompt();

      // Wait for user choice
      const { outcome } = await deferredPrompt.userChoice;

      // Clear the prompt
      deferredPrompt = null;
      hideInstallBanner();

      if (outcome === 'accepted') {
        recordDismissal();
      }
    });
  }

  // Handle close button
  closeButton.addEventListener('click', () => {
    hideInstallBanner();
    recordDismissal();
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initInstallPrompt);
} else {
  initInstallPrompt();
}
