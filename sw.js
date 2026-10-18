// Service worker: cache-first for app files and the Heebo font. Versioned cache; old caches removed.
const CACHE_VERSION = '1.3.0';
const CACHE = `seventy-${CACHE_VERSION}`;

const APP_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/config.js',
  './js/dates.js',
  './js/storage.js',
  './js/stats.js',
  './js/ui.js',
  './js/charts.js',
  './js/export.js',
  './js/timer.js',
  './js/exerciseEditor.js',
  './js/foods.js',
  './js/foodSheets.js',
  './js/scanner.js',
  './js/progress.js',
  './js/hebrew.js',
  './js/heatmap.js',
  './js/badgeArt.js',
  './js/celebrate.js',
  './js/views/today.js',
  './js/views/food.js',
  './js/views/trends.js',
  './js/views/settings.js',
  './js/views/wizard.js',
  './js/views/achievements.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

// data/foods.json is not precached: it loads lazily on first search and is then
// cached by the fetch handler below, so it works offline afterwards.

const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&display=swap';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(APP_FILES);
      // The font is best-effort: the app must install even if Google Fonts is unreachable.
      try {
        await cacheFont(cache);
      } catch {
        /* cached later at runtime */
      }
      await self.skipWaiting();
    })()
  );
});

/** Cache the font stylesheet and every font file it references. */
async function cacheFont(cache) {
  const res = await fetch(FONT_CSS, { mode: 'cors' });
  if (!res.ok) return;
  await cache.put(FONT_CSS, res.clone());
  const css = await res.text();
  const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map((m) => m[1]);
  await Promise.all(
    urls.map(async (u) => {
      const r = await fetch(u, { mode: 'cors' });
      if (r.ok) await cache.put(u, r);
    })
  );
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('seventy-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !FONT_HOSTS.includes(url.hostname)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Navigations always resolve to the cached app shell.
      if (req.mode === 'navigate') {
        const shell = (await cache.match('./index.html')) || (await cache.match('./'));
        if (shell) return shell;
      }
      const hit = await cache.match(req, { ignoreSearch: sameOrigin });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      } catch (err) {
        if (req.mode === 'navigate') {
          const shell = await cache.match('./index.html');
          if (shell) return shell;
        }
        throw err;
      }
    })()
  );
});
