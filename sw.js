const CACHE_NAME = "carnets-conducir-v20261031-1";
const APP_SHELL = [
  "index.html",
  "styles.css?v=20260704-6",
  "app.js?v=20260704-6",
  "manifest.webmanifest",
  "icon.svg",
  "data/b/manifest.json",
  "data/moto/manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Cloudflare Access (/cdn-cgi/) and cross-origin requests go straight to the network.
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/cdn-cgi/")) return;
  event.respondWith(
    caches.match(event.request).then((cached) => (
      cached || fetch(event.request).then((response) => {
        // Don't cache Access login redirects or errors.
        if (!response.ok) return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => cached)
    ))
  );
});
