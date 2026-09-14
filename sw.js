/* ===========================================================
   Famuha Coffee — Service Worker
   Menangani:
   1. Push event dari server (reminder Wishlist kosong)
   2. Klik notifikasi -> buka/fokus tab Famuha
   =========================================================== */

const FAMUHA_URL = self.registration ? self.location.origin + '/' : '/';

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

// ---- Terima push dari server (dikirim lewat Web Push protocol) ----
self.addEventListener('push', function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Famuha Coffee', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Famuha Coffee ☕';
  const options = {
    body: data.body || 'Sudah tahu mau minum apa hari ini?',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    tag: data.tag || 'famuha-wishlist-reminder',
    renotify: true,
    data: {
      url: data.url || FAMUHA_URL
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ---- Klik notifikasi -> fokus tab yang sudah ada, atau buka baru ----
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || FAMUHA_URL;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        // Kalau tab Famuha sudah terbuka, fokus ke situ
        if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
