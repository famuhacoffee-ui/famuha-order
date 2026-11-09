// Famuha Coffee — Service Worker (push notification + PWA)
// Satu file ini menggantikan sw.js lama. Taruh di root repo, sejajar index.html.

const FAMUHA_CACHE = 'famuha-shell-v1';
const DEFAULT_ICON = '/icon-192.png';

// ---------- Install / activate ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(FAMUHA_CACHE).then((c) => c.add('/')).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('famuha-shell-') && k !== FAMUHA_CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ---------- Fetch: jaringan dulu, cache hanya cadangan saat offline ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // jangan ganggu Apps Script / API lain
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(FAMUHA_CACHE).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/'))
    );
  }
});

// ---------- Badge angka di ikon (seperti WhatsApp) ----------
// Menghitung notifikasi yang belum "dibaca". Angka naik tiap push masuk,
// dan di-nol-kan saat pelanggan membuka Famuha (lihat clearBadge di index.html).
const BADGE_CACHE = 'famuha-badge';
const BADGE_KEY = '/__badge';

function bumpBadge() {
  return caches.open(BADGE_CACHE).then((c) =>
    c.match(BADGE_KEY)
      .then((r) => (r ? r.text() : '0'))
      .then((t) => {
        const n = (parseInt(t, 10) || 0) + 1;
        return c.put(BADGE_KEY, new Response(String(n))).then(() => n);
      })
  ).then((n) => {
    if (self.navigator && self.navigator.setAppBadge) return self.navigator.setAppBadge(n);
  }).catch(() => {});
}

// ---------- Push notification ----------
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Famuha Coffee ☕';
  const options = {
    body: data.body || data.message || '',
    icon: data.icon || DEFAULT_ICON,
    badge: data.badge || DEFAULT_ICON,
    tag: data.tag || 'famuha-notif',
    data: { url: data.url || '/' }
  };
  if (data.image) options.image = data.image;
  event.waitUntil(
    self.registration.showNotification(title, options).then(bumpBadge)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || '/',
    self.location.origin
  ).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          if ('navigate' in c) c.navigate(target);
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
