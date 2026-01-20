/*const CACHE_NAME = "registo-ponto-cache-v1";
const urlsToCache = [
  "."
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request).catch(() => new Response('Offline', { status: 503 })))
  );
});
*/

// sw.js — minimal, no caching
self.addEventListener("install", (event) => {
  // Skip caching for now
  console.log("Service Worker installed");
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker activated");
});

self.addEventListener("fetch", (event) => {
  // Just go to network, no caching
  event.respondWith(fetch(event.request));
});
