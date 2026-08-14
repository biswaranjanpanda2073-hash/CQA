/* ============================================================
   CQA MES — Service Worker  (sw.js)
   Strategy:
     • Navigation (HTML)      → Network first, fall back to cache
     • JS / CSS assets        → Network first, fall back to cache
       (Vite hashes filenames, so network always wins when online)
     • Images / other static  → Cache first (rarely change)
   Update flow:
     • skipWaiting() on install → activate immediately
     • On new SW activation, purge all old caches & notify clients
   ============================================================ */

const CACHE_NAME = 'cqa-mes-v1';   // ← vite build stamps a timestamp here

const STATIC_ASSETS = [
    '/',
    '/index.html',
];

// ── Install: pre-cache shell ──────────────────────────────────
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
});

// ── Activate: clean old caches + claim clients + notify ───────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then((keys) =>
                Promise.all(
                    keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
                )
            ),
        ]).then(() => {
            self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
                clients.forEach((client) =>
                    client.postMessage({ type: 'UPDATE_AVAILABLE' })
                );
            });
        })
    );
});

// ── Fetch handler ─────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignore cross-origin requests
    if (url.origin !== self.location.origin) return;
    // Ignore non-GET requests
    if (request.method !== 'GET') return;

    const isAsset = /\.(js|css|woff2?|ttf|otf|svg|png|jpg|jpeg|ico|webp)(\?.*)?$/.test(url.pathname);

    if (request.mode === 'navigate' || isAsset) {
        // ── Network-first for HTML + JS/CSS/fonts/images ──────
        // Always try network first so updated bundles are served
        // immediately. Falls back to cache only when offline.
        event.respondWith(
            fetch(request)
                .then((res) => {
                    if (res.ok) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then((c) => c.put(request, clone));
                    }
                    return res;
                })
                .catch(() =>
                    caches.match(request).then(
                        (cached) => cached || caches.match('/index.html')
                    )
                )
        );
        return;
    }

    // ── Cache-first for everything else (API calls are excluded above) ──
    event.respondWith(
        caches.match(request).then((cached) => {
            const networkFetch = fetch(request).then((res) => {
                if (res.ok) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(request, clone));
                }
                return res;
            });
            return cached || networkFetch;
        })
    );
});

// ── Handle SKIP_WAITING from reload button ────────────────────
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
