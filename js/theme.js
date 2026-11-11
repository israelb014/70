// A different look every day: 7 themes (Sunday "להבה" … Saturday "שמפניה"), or one fixed theme.
// A theme only overrides design tokens (css/styles.css, section 1b) through <html data-theme>.
import { getState } from './storage.js';

export const THEMES = [
  { id: 'flame', name: 'להבה', day: 'ראשון' },
  { id: 'ruby', name: 'רובי', day: 'שני' },
  { id: 'cobalt', name: 'קובלט', day: 'שלישי' },
  { id: 'lime', name: 'ליים', day: 'רביעי' },
  { id: 'magenta', name: 'מג׳נטה', day: 'חמישי' },
  { id: 'silver', name: 'כסף', day: 'שישי' },
  { id: 'champagne', name: 'שמפניה', day: 'שבת' },
];
const IDS = THEMES.map((t) => t.id);

/** The day's theme (by weekday), unless a fixed theme is chosen. */
export function themeFor(date = new Date(), setting = getState().settings?.theme) {
  return setting && setting !== 'auto' && IDS.includes(setting) ? setting : IDS[date.getDay()];
}

/** A theme's resolved tokens (read from the stylesheet through a probe element). */
export function themeTokens(id) {
  const probe = document.createElement('i');
  probe.hidden = true;
  probe.setAttribute('data-theme', id);
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const t = { accent: cs.getPropertyValue('--accent').trim(), bg: cs.getPropertyValue('--bg').trim(), hi: cs.getPropertyValue('--accent-hi').trim() };
  probe.remove();
  return t;
}

const svgFavicon = (accent, hi) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="2" y="2" width="60" height="60" rx="14" fill="#1b1d21" stroke="#3a3d43" stroke-width="2"/>`
  + `<path d="M11 21h18l-8 27" fill="none" stroke="${accent}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>`
  + `<path d="M39 20a12 14 0 1 0 6 -1" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round"/>`
  + `<path d="M39 20a12 14 0 1 0 6 -1" fill="none" stroke="${hi}" stroke-width="1.6" stroke-linecap="round" opacity=".7"/></svg>`;

let applied = '';
/** Apply today's (or the fixed) theme; meta theme-color and the tab's favicon follow it. */
export function applyTheme(now = new Date()) {
  const id = themeFor(now);
  const html = document.documentElement;
  if (html.dataset.theme !== id) html.dataset.theme = id;
  if (applied === id) return id;
  applied = id;
  const t = themeTokens(id);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', id === 'flame' ? '#0B0D10' : t.bg);
  const link = document.querySelector('link[rel="icon"][type="image/svg+xml"]');
  if (link && t.accent) link.href = `data:image/svg+xml,${encodeURIComponent(svgFavicon(t.accent, t.hi))}`;
  return id;
}

let timer = 0;
/** Switch at local midnight (and whenever the app comes back, if the date changed). */
export function startThemeClock() {
  applyTheme();
  const arm = () => {
    clearTimeout(timer);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    timer = setTimeout(() => { applyTheme(); arm(); }, next - now);
  };
  arm();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { applyTheme(); arm(); }
  });
}
