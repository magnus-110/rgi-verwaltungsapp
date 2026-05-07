// Service Worker for handling push notifications
const SW_VERSION = 'rgi-sw-v4-2026-05-07';
const ICON = '/lovable-uploads/6a67de24-d14d-44a0-8b78-b3cf0608cc46.png';
const BADGE = '/lovable-uploads/6a67de24-d14d-44a0-8b78-b3cf0608cc46.png';

self.addEventListener('install', (event) => {
  console.log('[SW] install', SW_VERSION);
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] activate', SW_VERSION);
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'ping') {
    const reply = { type: 'pong', version: SW_VERSION };
    if (event.ports?.[0]) event.ports[0].postMessage(reply);
    else event.source?.postMessage(reply);
  }
});

async function broadcast(msg) {
  try {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) c.postMessage(msg);
  } catch (_) {}
}

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try { data = event.data.json(); }
    catch (_) { data = { title: 'RGI Immobilien', body: event.data.text() }; }
  }

  const title = data.title || 'RGI Immobilien';
  const options = {
    body: data.body || '',
    icon: data.icon || ICON,
    badge: data.badge || BADGE,
    tag: data.tag || data.dedup_key || 'rgi-default',
    renotify: true,
    requireInteraction: Boolean(data.requireInteraction),
    timestamp: Date.now(),
    vibrate: [120, 60, 120],
    data: { url: data?.data?.url || data.url || '/', ...(data.data || {}) },
  };

  event.waitUntil((async () => {
    const receivedAt = Date.now();
    await broadcast({ type: 'push-received', title, body: options.body, ts: receivedAt, version: SW_VERSION });
    try {
      await self.registration.showNotification(title, options);
      await broadcast({ type: 'push-shown', title, ts: Date.now(), version: SW_VERSION });
    } catch (err) {
      await broadcast({ type: 'push-show-error', error: err?.message || String(err), ts: Date.now(), version: SW_VERSION });
      throw err;
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      try {
        await c.focus();
        c.postMessage({ type: 'notification-click', url: urlToOpen });
        return;
      } catch (_) {}
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(self.location.origin + urlToOpen);
    }
  })());
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // App will re-subscribe on next load via usePushSubscription
  event.waitUntil(broadcast({ type: 'pushsubscriptionchange' }));
});
