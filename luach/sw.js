// /luach service worker: only shows the optional Omer reminder notification.
// No fetch handler, no caching.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) if (w.url.includes('/luach/') && 'focus' in w) return w.focus();
    return self.clients.openWindow('/luach/');
  }));
});
