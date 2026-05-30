const CACHE_NAME = 'namma-rytha-v9';
const ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/style.css',
  '/smooth.css',
  '/app.js',
  '/manifest.json',
  '/logo.png'
];

self.addEventListener('install', (event) => {
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  // Take control of all open pages immediately
  event.waitUntil(clients.claim());
  
  // Clear old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Network-first strategy for rapid development
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and update cache with the new response
        const resClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, resClone);
        });
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
