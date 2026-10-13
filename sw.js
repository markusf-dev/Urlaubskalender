// Offline support. Online, every request goes to the network first (revalidated,
// so a new version shows up on the next load); the cache is only the fallback
// when offline or when the network is too slow. Requests to other origins
// (school holiday API, sync service) are not touched.
const CACHE = 'urlaubskalender-v11';
const NETWORK_TIMEOUT_MS = 4000;
const FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/dates.js',
  'js/school.js',
  'js/optimizer.js',
  'js/config.js',
  'js/sync.js',
  'js/app.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' bypasses the browser's HTTP cache, so no stale files end up here.
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const network = fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS));
    try {
      const res = await Promise.race([network, timeout]);
      if (res) return res;
    } catch (e) { /* offline */ }
    const cached = await cache.match(request, { ignoreSearch: true });
    return cached || network;
  })());
});
