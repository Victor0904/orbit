// Service worker ORBIT : pré-cache de tous les fichiers, cache versionné, cache-first, nettoyage des anciennes versions.
const VERSION = 'orbit-v1.0.0';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './design/tokens.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './src/main.js',
  './src/core/data.js',
  './src/core/rng.js',
  './src/core/input.js',
  './src/core/announcer.js',
  './src/sim/sim.js',
  './src/sim/hazards.js',
  './src/sim/patterns.js',
  './src/sim/bot.js',
  './src/meta/save.js',
  './src/meta/economy.js',
  './src/meta/daily.js',
  './src/meta/progression.js',
  './src/render/renderer.js',
  './src/render/cores.js',
  './src/audio/audio.js',
  './src/ui/ui.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('orbit-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    if (hit) return hit;
    return fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
  }));
});
