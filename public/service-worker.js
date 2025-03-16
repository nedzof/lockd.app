// Service Worker for Push Notifications

// Cache name for static resources
const CACHE_NAME = 'lockd-app-cache-v1';

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing');
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating');
  return self.clients.claim();
});

// Push event - handle incoming push messages
self.addEventListener('push', (event) => {
  console.log('Push notification received', event);
  
  if (!event.data) {
    console.log('No payload in push notification');
    
    // Even with no payload, show a default notification
    event.waitUntil(
      self.registration.showNotification('Lockd App', {
        body: 'New update from Lockd App',
        icon: '/icon-192x192.png',
        badge: '/badge-96x96.png'
      })
    );
    
    return;
  }
  
  try {
    // Parse the notification data
    let data;
    try {
      data = event.data.json();
      console.log('Push notification data (JSON):', data);
    } catch (jsonError) {
      // If JSON parsing fails, try to use the text payload
      console.warn('Failed to parse notification data as JSON, using text instead:', jsonError);
      data = {
        title: 'Lockd App',
        body: event.data.text()
      };
    }
    
    // Show the notification
    const title = data.title || 'Lockd App';
    const options = {
      body: data.body || 'You have a new notification',
      icon: '/icon-192x192.png',
      badge: '/badge-96x96.png',
      data: {
        url: data.url || '/',
        timestamp: Date.now()
      },
      requireInteraction: true, // Keep notification visible until user interacts with it
      vibrate: [100, 50, 100] // Vibration pattern for mobile devices
    };
    
    event.waitUntil(
      self.registration.showNotification(title, options)
        .then(() => {
          console.log('Notification displayed successfully');
        })
        .catch(error => {
          console.error('Failed to display notification:', error);
        })
    );
  } catch (error) {
    console.error('Error handling push notification:', error);
    
    // Show a fallback notification
    event.waitUntil(
      self.registration.showNotification('Lockd App', {
        body: 'There was an update, but we had trouble processing it',
        icon: '/icon-192x192.png'
      })
    );
  }
});

// Notification click event - open the URL
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked', event.notification);
  
  event.notification.close();
  
  // Get the URL from the notification data
  const url = (event.notification.data && event.notification.data.url) || '/';
  
  // Open the URL in the existing tab if it's already open, otherwise open a new one
  event.waitUntil(
    self.clients.matchAll({ type: 'window' })
      .then((clientList) => {
        // Check if there's already a window/tab open with the target URL
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        
        // If no matching client found, open a new window/tab
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
      .catch(error => {
        console.error('Error handling notification click:', error);
      })
  );
});

// Handle subscription change events
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('Push subscription changed');
  
  // Attempt to resubscribe if the subscription expires or changes
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options)
      .then(subscription => {
        console.log('Resubscribed to push notifications', subscription);
        
        // Here you would normally send the new subscription to your server
        // but that's better handled from the app/client side
      })
      .catch(error => {
        console.error('Failed to resubscribe:', error);
      })
  );
}); 