// Shared icon definitions — single source of truth for all SVG icons

const ICONS = {
  // --- Navigation ---
  back:            `<path d="M19 12H5M12 19l-7-7 7-7"/>`,
  'chevron-right': `<polyline points="9 18 15 12 9 6"/>`,

  // --- Header ---
  cart:     `<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>`,
  menu:     `<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>`,

  // --- Recipe list ---
  heart:    `<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>`,
  filter:   `<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>`,
  shuffle:  `<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.5 2.2"/><path d="M22 18h-5.9c-1.3 0-2.5-.6-3.3-1.7l-.8-1.1"/><path d="m18 14 4 4-4 4"/>`,

  // --- Recipe page ---
  share:    `<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>`,

  // --- Shopping list ---
  x:        `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`,

  // --- Drawer ---
  bell:     `<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>`,
  help:     `<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
  clock:    `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`,
  email:    `<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>`,

  // --- Cooking mode: animated via CSS classes, non-standard viewBox ---
  'timer-clock': {
    viewBox: '0 -5 24 29',
    inner: `<circle class="clock-face" cx="12" cy="13" r="8"/><line class="clock-hand-min" x1="12" y1="13" x2="12" y2="9"/><line class="clock-hand-sec" x1="12" y1="13" x2="14" y2="15"/><path d="M9 2h6"/><path d="M12 2v2"/>`,
  },
  bulb: {
    viewBox: '-2 -5 28 29',
    inner: `<path d="M9 18h6"/><path d="M10 22h4"/><path class="bulb" d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5"/><line class="ray" x1="12" y1="-4" x2="12" y2="-2" stroke-width="2"/><line class="ray" x1="1.5" y1="1.5" x2="3.5" y2="3.5" stroke-width="2"/><line class="ray" x1="-1" y1="10" x2="1.5" y2="10" stroke-width="2"/><line class="ray" x1="25" y1="10" x2="22.5" y2="10" stroke-width="2"/><line class="ray" x1="22.5" y1="1.5" x2="20.5" y2="3.5" stroke-width="2"/>`,
  },

  // --- Timer controls: solid fill, no stroke ---
  'tri-up':   { solid: true, inner: `<polygon points="12,6 4,18 20,18"/>` },
  'tri-down': { solid: true, inner: `<polygon points="12,18 4,6 20,6"/>` },
  play:       { solid: true, inner: `<polygon points="6,4 20,12 6,20"/>` },
  pause:      { solid: true, inner: `<rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/>` },
  stop:       { solid: true, inner: `<rect x="4" y="4" width="16" height="16" rx="1"/>` },
};

/**
 * Returns a full <svg> string for the named icon.
 * @param {string} name      - Key from ICONS
 * @param {number} [size=24] - Width and height in px
 * @param {string} [cls='']  - Optional CSS class for the svg element
 */
function icon(name, size = 24, cls = '') {
  const def = ICONS[name];
  if (!def) return '';
  const isMeta     = typeof def === 'object';
  const inner      = isMeta ? def.inner : def;
  const viewBox    = (isMeta && def.viewBox) ? def.viewBox : '0 0 24 24';
  const classAttr  = cls ? ` class="${cls}"` : '';
  const strokeAttrs = (isMeta && def.solid)
    ? ''
    : ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  return `<svg width="${size}" height="${size}" viewBox="${viewBox}"${strokeAttrs}${classAttr}>${inner}</svg>`;
}

// Auto-inject into static HTML: <svg data-icon="name" ...></svg>
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('svg[data-icon]').forEach(el => {
    const def = ICONS[el.dataset.icon];
    if (!def) return;
    const isMeta = typeof def === 'object';
    if (isMeta && def.viewBox) el.setAttribute('viewBox', def.viewBox);
    el.innerHTML = isMeta ? def.inner : def;
  });
});
