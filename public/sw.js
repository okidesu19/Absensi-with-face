// FaceAbsen Service Worker
// Provides offline support and caching for better performance

const CACHE_NAME = 'faceabsen-v1';
const STATIC_CACHE = 'faceabsen-static-v1';
const DYNAMIC_CACHE = 'faceabsen-dynamic-v1';
const MODEL_CACHE = 'faceabsen-models-v1';

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/manifest.json'
];

// Face-api.js model files to cache
const MODEL_ASSETS = [
  '/models/tiny_face_detector_model-weights_manifest.json',
  '/models/tiny_face_detector_model-shard1',
  '/models/face_landmark_68_model-weights_manifest.json',
  '/models/face_landmark_68_model-shard1',
  '/models/face_recognition_model-weights_manifest.json',
  '/models/face_recognition_model-shard1',
  '/models/face_recognition_model-shard2',
  '/models/face_expression_model-weights_manifest.json',
  '/models/face_expression_model-shard1'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE).then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      // Cache model files
      caches.open(MODEL_CACHE).then((cache) => {
        console.log('[SW] Caching model files');
        return cache.addAll(MODEL_ASSETS).catch(err => {
          console.warn('[SW] Some model files not found:', err);
        });
      })
    ]).then(() => {
      console.log('[SW] Installation complete');
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (![STATIC_CACHE, DYNAMIC_CACHE, MODEL_CACHE, CACHE_NAME].includes(cacheName)) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Activation complete');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle model files - cache first
  if (url.pathname.startsWith('/models/')) {
    event.respondWith(
      caches.open(MODEL_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(request).then((networkResponse) => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // Handle static assets - cache first
  if (url.pathname === '/' || url.pathname === '/offline') {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          const cache = caches.open(STATIC_CACHE);
          cache.then(c => c.put(request, networkResponse.clone()));
          return networkResponse;
        }).catch(() => {
          return caches.match('/offline');
        });
      })
    );
    return;
  }

  // Handle API requests - network first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Cache successful responses
          if (networkResponse.ok) {
            const cache = caches.open(DYNAMIC_CACHE);
            cache.then(c => c.put(request, networkResponse.clone()));
          }
          return networkResponse;
        })
        .catch(() => {
          // Return cached response if network fails
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return new Response(
              JSON.stringify({ error: 'Offline', message: 'No cached data available' }),
              { 
                status: 503,
                headers: { 'Content-Type': 'application/json' }
              }
            );
          });
        })
    );
    return;
  }

  // Handle Firebase Realtime Database requests
  if (url.hostname.includes('firebaseio.com') || url.hostname.includes('firebase.com')) {
    // Let Firebase SDK handle this - it has its own offline support
    return;
  }

  // Handle other requests - stale while revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        const cache = caches.open(DYNAMIC_CACHE);
        cache.then(c => c.put(request, networkResponse.clone()));
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// Background sync for offline attendance
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-attendance') {
    event.waitUntil(syncAttendance());
  }
});

async function syncAttendance() {
  // This would sync offline attendance records when back online
  // Implementation depends on your offline storage strategy
  console.log('[SW] Syncing offline attendance records...');
  
  // Post message to main thread to trigger sync
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_ATTENDANCE' });
  });
}

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'FaceAbsen', {
      body: data.body || 'New notification',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      tag: data.tag || 'default',
      data: data.data || {}
    })
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});

// Message handler for cache management
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
  
  if (event.data.type === 'CACHE_MODELS') {
    event.waitUntil(
      caches.open(MODEL_CACHE).then((cache) => {
        return cache.addAll(MODEL_ASSETS);
      })
    );
  }
});

console.log('[SW] Service worker loaded');
