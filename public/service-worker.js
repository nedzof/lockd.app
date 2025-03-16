// Service Worker for Push Notifications
self.addEventListener('push', function(event) {
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/logo192.png',
    badge: '/badge.png',
    data: {
      url: data.url || '/'
    },
    actions: [
      {
        action: 'view',
        title: 'View'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  if (event.action === 'view' || !event.action) {
    // Open the app and navigate to the specific URL
    const urlToOpen = event.notification.data.url || '/';
    
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(windowClients => {
        // Check if there is already a window/tab open with the target URL
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // If no window/tab is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
    );
  }
});

// Cache static assets
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  return self.clients.claim();
}); 