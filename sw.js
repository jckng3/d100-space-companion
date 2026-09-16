/* D100 Space Companion — service worker: full offline cache */
const CACHE = 'd100-space-v16';
const ASSETS = [
  './', './index.html', './manifest.json',
  './data.js', './tiles.js', './help.js',
  './ui.js', './state.js', './map.js',
  './art/hero-bridge.webp', './art/hero-marine.webp', './art/hero-cyborg.webp', './art/hero-skulls.webp',
  './art/hero-fleet.webp', './art/hero-station.webp', './art/hero-arrival.webp', './art/hero-domecity.webp',
  './art/hero-battle.webp', './art/hero-ring.webp', './art/hero-ship.webp',
  './art/crew-merc.webp', './art/crew-power.webp', './art/crew-meditate.webp', './art/crew-soldier.webp',
  './art/diag-elevation.webp', './art/diag-zones.webp', './art/diag-distance.webp', './art/diag-hexmove.webp', './art/diag-sector.webp',
  './art/door-scifi.webp', './art/door-schem.webp'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      // cache same-origin GETs as we go
      if (e.request.method === 'GET' && new URL(e.request.url).origin === self.location.origin) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
