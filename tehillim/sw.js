// /tehillim service worker: lets the page itself open offline.
// Stale-while-revalidate for same-origin GETs (page, css, js, the /luach and /zmanim
// modules it imports) and Google Fonts. Never caches /api/ or the Sefaria text
// (chapters are kept in localStorage by the page).
const CACHE = 'szv-tehillim-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('szv-tehillim-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const same = u.origin === self.location.origin;
  const font = u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
  if (!(same || font) || u.pathname.startsWith('/api/')) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(r, { ignoreSearch: false });
    const net = fetch(r).then((res) => { if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || (r.mode === 'navigate' ? (await c.match('/tehillim/')) || Response.error() : Response.error());
  })());
});
