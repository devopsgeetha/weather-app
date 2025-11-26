// Basic service worker with precache + runtime caching for API requests and offline fallback
const CACHE_VERSION = 'v1';
const PRECACHE = `precache-${CACHE_VERSION}`;
const RUNTIME = `runtime-${CACHE_VERSION}`;
const API_CACHE = `api-cache-${CACHE_VERSION}`;
const API_CACHE_TTL = 300000; // 5 minutes in ms

// List of resources to precache
const PRECACHE_URLS = [
  '/',
  '/offline',
  '/static/css/styles.css',
  '/static/js/main.js',
  '/static/manifest.json',
  // Add other static assets or icons you want precached
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(PRECACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  // Claim clients immediately so the page is controlled by the SW without reload
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => ![PRECACHE, RUNTIME, API_CACHE].includes(k)).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Utility: put a response in API cache attaching a timestamp header
async function cacheApiResponse(request, response) {
  const cloned = response.clone();
  const body = await cloned.blob();
  // Build new response with a custom header for cached time
  const newHeaders = new Headers(cloned.headers);
  newHeaders.set('sw-cache-time', String(Date.now()));
  const newResp = new Response(body, {
    status: cloned.status,
    statusText: cloned.statusText,
    headers: newHeaders
  });
  const cache = await caches.open(API_CACHE);
  await cache.put(request, newResp.clone());
  return newResp;
}

// Fetch handler
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Runtime caching for API calls (network-first with fallback to cache if available and fresh)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(req);
        // cache successful responses
        if (networkResponse && networkResponse.ok) {
          try { await cacheApiResponse(req, networkResponse.clone()); } catch (e) { /* ignore caching errors */ }
        }
        return networkResponse;
      } catch (err) {
        // network failed, attempt to return cached response if within TTL
        const cache = await caches.open(API_CACHE);
        const cached = await cache.match(req);
        if (cached) {
          const cachedTime = Number(cached.headers.get('sw-cache-time') || 0);
          if (Date.now() - cachedTime <= API_CACHE_TTL) {
            return cached;
          }
        }
        // as last resort, return a generic Response indicating offline for API requests
        return new Response(JSON.stringify({ error: 'Network unavailable and no cached data' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503
        });
      }
    })());
    return;
  }

  // Serve navigation (HTML) requests with network-first, fallback to precache or offline page
  if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept') && req.headers.get('accept').includes('text/html'))) {
    event.respondWith((async () => {
      try {
        const networkResp = await fetch(req);
        // optionally store in runtime cache
        const cache = await caches.open(RUNTIME);
        cache.put(req, networkResp.clone());
        return networkResp;
      } catch (err) {
        const cache = await caches.open(PRECACHE);
        const cached = await cache.match(req) || await cache.match('/');
        if (cached) return cached;
        return await cache.match('/offline');
      }
    })());
    return;
  }

  // For other requests, try cache first then network
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const resp = await fetch(req);
      // Cache CSS/JS/images on demand
      if (req.method === 'GET' && resp && resp.ok) {
        cache.put(req, resp.clone());
      }
      return resp;
    } catch (err) {
      // fallback to cache if present
      return cached || fetch(req);
    }
  })());
});