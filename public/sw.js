// Service Worker for Lootly Web Push Notifications
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'Lootly — Meja Trading AI';
  const options = {
    body: data.body || 'Pemberitahuan sinyal trading baru.',
    icon: data.icon || '/icon.svg',
    badge: data.badge || '/favicon.svg',
    tag: data.tag || 'lootly-trade-alert',
    renotify: true,
    data: data.data || { url: '/ai-desk' },
    vibrate: data.vibrate || [100, 50, 100],
    requireInteraction: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/ai-desk';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && client.url.includes('/ai-desk') && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
