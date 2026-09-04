const CACHE_NAME = 'squadview-shell-v8';

// Only cache resources that physically exist on GitHub Pages. `/watch` is an
// SPA route, not a real file, and including it in cache.addAll() caused the
// entire service-worker installation to fail.
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache each shell resource independently so one transient failure never
      // prevents the service worker from installing.
      await Promise.allSettled(
        APP_SHELL.map(async (url) => {
          const response = await fetch(url, { cache: 'no-store' });
          if (!response.ok) return;
          await cache.put(url, response.clone());
        }),
      );
    }),
  );

  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('squadview-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(async (response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(url.pathname, copy));
            return response;
          }

          // GitHub Pages returns 404 for SPA routes such as /watch. Serve the
          // app shell instead while preserving the requested browser URL.
          const rootResponse = await fetch('/', { cache: 'no-store' });
          if (rootResponse.ok) {
            const copy = rootResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
            return rootResponse;
          }

          return response;
        })
        .catch(async () => (
          (await caches.match(url.pathname))
          || (await caches.match('/'))
          || Response.error()
        )),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
