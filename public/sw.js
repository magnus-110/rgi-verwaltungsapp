// Service Worker for handling push notifications

self.addEventListener('install', (event) => {
  console.log('Service Worker installing');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating');
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  console.log('Push message received:', event);

  let notificationData = {};
  
  if (event.data) {
    try {
      notificationData = event.data.json();
    } catch (e) {
      console.error('Error parsing push data:', e);
      notificationData = {
        title: 'Neue Benachrichtigung',
        body: event.data.text() || 'Sie haben eine neue Nachricht erhalten',
        icon: '/favicon.ico',
        badge: '/favicon.ico'
      };
    }
  } else {
    notificationData = {
      title: 'Neue Benachrichtigung',
      body: 'Sie haben eine neue Nachricht erhalten',
      icon: '/favicon.ico',
      badge: '/favicon.ico'
    };
  }

  const notificationOptions = {
    body: notificationData.body || 'Sie haben eine neue Nachricht erhalten',
    icon: notificationData.icon || '/favicon.ico',
    badge: notificationData.badge || '/favicon.ico',
    tag: notificationData.tag || 'default',
    data: notificationData.data || {},
    actions: [
      {
        action: 'open',
        title: 'Öffnen',
        icon: '/favicon.ico'
      },
      {
        action: 'close',
        title: 'Schließen'
      }
    ],
    requireInteraction: true,
    silent: false
  };

  const title = notificationData.title || 'RGI Immobilien';

  event.waitUntil(
    self.registration.showNotification(title, notificationOptions)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  // Default action or 'open' action
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window/tab open with the target URL
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      
      // If not, open a new window/tab
      if (clients.openWindow) {
        const baseUrl = self.location.origin;
        return clients.openWindow(baseUrl + urlToOpen);
      }
    })
  );
});

self.addEventListener('notificationclose', (event) => {
  console.log('Notification closed:', event);
  // You can track notification close events here if needed
});

// Handle background sync for offline functionality
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered:', event.tag);
  
  if (event.tag === 'push-notification-sync') {
    event.waitUntil(
      // Handle any background sync tasks here
      Promise.resolve()
    );
  }
});

// Handle push subscription changes
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('Push subscription changed:', event);
  
  event.waitUntil(
    // Handle subscription change - re-subscribe with new subscription
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: event.oldSubscription?.options?.applicationServerKey
    }).then((newSubscription) => {
      // Send new subscription to server
      return fetch('/api/update-push-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          oldSubscription: event.oldSubscription,
          newSubscription: newSubscription
        })
      });
    })
  );
});