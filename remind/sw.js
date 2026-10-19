// /remind service worker: only here so "reminder due" notifications work on Android
// (Chrome there can't show `new Notification()` from a page). No caching, no fetch handling.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.includes('/remind/') && 'focus' in c) return c.focus();
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow ? self.clients.openWindow('/remind/') : undefined;
  }));
});
