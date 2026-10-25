// Service Worker: App-Schale offline verfügbar machen. Gesundheitsdaten liegen im
// localStorage und werden hier nicht berührt.
const VERSION = 'v3.13.0';
const CACHE = `cockpit-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './fonts/OFL.txt',
  './fonts/barlow-semi-condensed-latin-500-normal.woff2',
  './fonts/barlow-semi-condensed-latin-600-normal.woff2',
  './fonts/barlow-semi-condensed-latin-700-normal.woff2',
  './fonts/ibm-plex-mono-latin-400-normal.woff2',
  './fonts/ibm-plex-mono-latin-500-normal.woff2',
  './fonts/source-sans-3-latin-400-normal.woff2',
  './fonts/source-sans-3-latin-600-normal.woff2',
  './fonts/source-sans-3-latin-700-normal.woff2',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './js/app.js',
  './js/demo.js',
  './js/showcase.js',
  './js/data/recipes.js',
  './js/data/supplements.js',
  './js/ui/slot.js',
  './js/photostore.js',
  './js/domain/savedmeals.js',
  './js/domain/supplements.js',
  './js/views/supplements.js',
  './js/views/recipes.js',
  './js/views/planner.js',
  './js/domain/recipes.js',
  './js/domain/planner.js',
  './js/domain/units.js',
  './js/domain/behavior.js',
  './js/domain/emotional.js',
  './js/model.js',
  './js/vision.js',
  './js/store.js',
  './js/safety.js',
  './js/domain/entries.js',
  './js/domain/history.js',
  './js/domain/pyramidtips.js',
  './js/domain/caffeine.js',
  './js/domain/clinical.js',
  './js/domain/coach.js',
  './js/domain/energy.js',
  './js/domain/evidence.js',
  './js/domain/fasting.js',
  './js/domain/foodgroups.js',
  './js/domain/meals.js',
  './js/domain/mealplans.js',
  './js/domain/advice.js',
  './js/domain/cycle.js',
  './js/domain/bluezones.js',
  './js/domain/micros.js',
  './js/data/foods.js',
  './js/domain/review.js',
  './js/domain/foodvision.js',
  './js/domain/hydration.js',
  './js/domain/importers.js',
  './js/domain/longevity.js',
  './js/domain/training.js',
  './js/domain/trend.js',
  './js/domain/util.js',
  './js/ui/chart.js',
  './js/ui/dom.js',
  './js/views/garmin.js',
  './js/views/health.js',
  './js/views/photo.js',
  './js/views/knowledge.js',
  './js/views/motivation.js',
  './js/views/nutrients.js',
  './js/views/report.js',
  './js/views/profile.js',
  './js/views/review.js',
  './js/views/today.js',
  './js/views/training.js',
  './js/views/weight.js',
  './vendor/anthropic-sdk.js',
  './vendor/openai-sdk.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cockpit-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Netzwerk zuerst für eigene Dateien (Updates kommen sofort an), Cache als Rückfall offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit ?? caches.match('./index.html'))),
  );
});
