/* /ac/ offline support. Scope: /ac/ only.
   - same-origin GETs under /ac/ + /assets/theme.js: network first (short timeout), cache fallback
   - Google Fonts CSS + font files: stale-while-revalidate (opaque responses are fine)
   - navigations fall back to the cached /ac/ page */
const VERSION = 'szv-ac-v2';
const SHELL = ['/ac/', '/ac/ac.css', '/ac/ac.js', '/assets/theme.js'];
const TIMEOUT = 3500;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    try { const c = await caches.open(VERSION); await Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))); } catch (err) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try { const keys = await caches.keys(); await Promise.all(keys.filter((k) => k.startsWith('szv-ac-') && k !== VERSION).map((k) => caches.delete(k))); } catch (err) {}
    await self.clients.claim();
  })());
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

async function networkFirst(req, isNav) {
  const cache = await caches.open(VERSION);
  try {
    const res = await Promise.race([fetch(req), timeout(TIMEOUT)]);
    if (res && res.ok) {
      const copy = res.clone();
      cache.put(isNav ? '/ac/' : req, copy).catch(() => {});
      return res;
    }
    if (res && !isNav) return res;          // e.g. a real 404: pass it through
    throw new Error('bad response');
  } catch (err) {
    const hit = isNav
      ? (await cache.match('/ac/')) || (await cache.match(req, { ignoreSearch: true }))
      : (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
    if (hit) return hit;
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(req, e) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  if (hit) { e.waitUntil(fresh); return hit; }
  return (await fresh) || new Response('', { status: 504, statusText: 'Offline' });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate' && url.pathname.startsWith('/ac/')) { e.respondWith(networkFirst(req, true)); return; }
    if (url.pathname.startsWith('/ac/') || url.pathname === '/assets/theme.js') { e.respondWith(networkFirst(req, false)); return; }
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(staleWhileRevalidate(req, e));
});
