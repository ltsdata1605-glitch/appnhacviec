/* Service worker — Nhắc việc
   - Lưu tạm vỏ ứng dụng để mở nhanh, dùng được khi mạng chập chờn
   - Nhận thông báo đẩy (Firebase Cloud Messaging / Web Push) và cập nhật số trên biểu tượng app */
const CACHE = 'nhac-viec-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icons/apple-touch-icon.png', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Firebase, Google: không can thiệp
  if (url.pathname.startsWith('/__/')) return; // trang đăng nhập Firebase
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

function parsePush(event) {
  let raw = {};
  try {
    raw = event.data ? event.data.json() : {};
  } catch (err) {
    raw = { data: { title: 'Nhắc việc', body: event.data ? event.data.text() : '' } };
  }
  const data = raw.data || {};
  const n = raw.notification || {};
  return {
    title: n.title || data.title || 'Nhắc việc',
    body: n.body || data.body || '',
    link: data.link || '',
    badge: data.badge ? Number(data.badge) : null,
    tag: data.tag || undefined,
    level: data.level || 'normal',
  };
}

self.addEventListener('push', (event) => {
  const p = parsePush(event);
  const tasks = [
    self.registration.showNotification(p.title, {
      body: p.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: p.tag,
      // Báo lại (có tiếng) khi cùng một việc được nhắc tiếp
      renotify: !!p.tag,
      // Việc quan trọng giữ trên màn hình đến khi người dùng chạm (trình duyệt hỗ trợ)
      requireInteraction: p.level !== 'normal',
      vibrate: p.level === 'urgent' ? [400, 150, 400, 150, 400, 150, 700] : p.level === 'high' ? [250, 120, 250] : [180],
      timestamp: Date.now(),
      data: { link: p.link, level: p.level },
    }),
  ];
  if (p.badge !== null && self.navigator && 'setAppBadge' in self.navigator) {
    tasks.push(p.badge > 0 ? self.navigator.setAppBadge(p.badge) : self.navigator.clearAppBadge());
  }
  event.waitUntil(Promise.all(tasks).catch(() => {}));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.postMessage({ type: 'open', link });
          return c.focus();
        }
      }
      return self.clients.openWindow(link ? `/?open=${encodeURIComponent(link)}` : '/');
    }),
  );
});
