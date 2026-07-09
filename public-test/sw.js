/**
 * Service Worker for TTMenus Notifications
 * Handles background notification delivery and WebSocket connection management
 */

const CACHE_NAME = 'ttmenus-notifications-v2';
const SUB_META_CACHE = 'ttmenus-notify-meta-v1';
let NOTIFY_SERVICE_URL = 'https://notify.ttmenus.com';
const DEFAULT_NOTIFY_ICON = 'https://cdn.ttmenus.com/branding/ttmenus/ttmenus.gif';
const PRODUCTION_NOTIFY_SERVICE = 'https://notify.ttmenus.com';

function isLocalNetworkUrl(url) {
  const s = String(url || '').trim();
  if (!s) return false;
  if (/^(https?):\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(s)) return true;
  try {
    const u = new URL(s);
    const host = (u.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || /\.local$/i.test(host)) {
      return true;
    }
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (m) {
      const a = +m[1];
      const b = +m[2];
      if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) {
        return true;
      }
    }
  } catch (e) {
    /* ignore */
  }
  return false;
}

function sanitizeNotifyServiceUrl(url) {
  if (isLocalNetworkUrl(url)) return PRODUCTION_NOTIFY_SERVICE;
  return String(url || PRODUCTION_NOTIFY_SERVICE).replace(/\/+$/, '') || PRODUCTION_NOTIFY_SERVICE;
}

function getNotifyApiBase() {
  const base = sanitizeNotifyServiceUrl(NOTIFY_SERVICE_URL);
  return base + '/api/v1';
}

/** Resolve icon, badge, and large image from flat or nested push payload. */
function extractMediaFromPayload(data) {
  const nested = (data && data.data) || {};
  const icon =
    (data && (data.icon || data.image)) ||
    nested.icon ||
    nested.image ||
    nested.image_url ||
    DEFAULT_NOTIFY_ICON;
  const image =
    (data && data.image) ||
    nested.image ||
    nested.image_url ||
    null;
  const badge = (data && data.badge) || nested.badge || icon;
  return { icon, badge, image: image || undefined };
}

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installing...');
  self.skipWaiting(); // Activate immediately
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  return self.clients.claim(); // Take control of all pages immediately
});

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received:', event);
  
  let notificationData = {
    title: 'TTMenus',
    body: 'You have a new notification',
    icon: DEFAULT_NOTIFY_ICON,
    badge: DEFAULT_NOTIFY_ICON,
    tag: 'ttmenus-notification',
    data: {},
  };

  // Parse push data
  if (event.data) {
    try {
      const data = event.data.json();
      const media = extractMediaFromPayload(data.notification || data);
      const source = data.notification || data;
      if (data.notification) {
        notificationData = {
          title: source.title || notificationData.title,
          body: source.body || source.message || notificationData.body,
          icon: media.icon,
          badge: media.badge,
          image: media.image,
          tag: source.tag || source.id || notificationData.tag,
          data: {
            ...(source.data || {}),
            notificationId: source.id || data.id,
            linkUrl:
              (source.data && (source.data.url || source.data.link)) ||
              (data.data && (data.data.url || data.data.link || data.data.linkUrl)),
          },
        };
      } else if (data.title || data.message) {
        notificationData = {
          title: data.title || notificationData.title,
          body: data.message || data.body || notificationData.body,
          icon: media.icon,
          badge: media.badge,
          image: media.image,
          tag: data.tag || data.id || notificationData.tag,
          data: {
            ...(data.data || {}),
            notificationId: data.id,
            linkUrl: data.data?.url || data.data?.link || data.data?.linkUrl,
          },
        };
      }
    } catch (e) {
      console.error('[SW] Failed to parse push data:', e);
      if (event.data.text) {
        notificationData.body = event.data.text();
      }
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      image: notificationData.image,
      tag: notificationData.tag,
      data: notificationData.data,
      requireInteraction: false,
      vibrate: [200, 100, 200],
    }).then(() => {
      // Track confirmation
      if (notificationData.data?.notificationId) {
        trackNotificationConfirmation(notificationData.data.notificationId);
      }
    })
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  
  event.notification.close();

  const notificationData = event.notification.data || {};
  const linkUrl = notificationData.linkUrl;

  // Track click
  if (notificationData.notificationId) {
    trackNotificationClick(notificationData.notificationId);
  }

  // Open or focus the page
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window/tab open
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url && 'focus' in client) {
          // If link URL provided, navigate to it
          if (linkUrl) {
            return client.navigate(linkUrl).then(() => client.focus());
          }
          return client.focus();
        }
      }
      
      // If no window is open, open a new one
      if (clients.openWindow) {
        const urlToOpen = linkUrl || '/';
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received from client:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'SET_NOTIFY_CONFIG') {
    if (event.data.serviceUrl) {
      NOTIFY_SERVICE_URL = sanitizeNotifyServiceUrl(event.data.serviceUrl);
    }
  }

  if (event.data && event.data.type === 'SET_SUBSCRIPTION_ID' && event.data.id) {
    storeSubscriptionMeta({ id: event.data.id }).catch((e) => {
      console.warn('[SW] Could not store subscription id:', e);
    });
  }
  
  // Handle notification display requests from main thread
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { notification } = event.data;
    self.registration.showNotification(notification.title || 'TTMenus', {
      body: notification.message || notification.body || '',
      icon: notification.icon || notification.image || DEFAULT_NOTIFY_ICON,
      badge: notification.badge || notification.icon || DEFAULT_NOTIFY_ICON,
      image: notification.image,
      tag: notification.tag || notification.id,
      data: {
        ...notification.data,
        notificationId: notification.id,
        linkUrl: notification.data?.url || notification.data?.link,
      },
    }).then(() => {
      // Track confirmation
      if (notification.id) {
        trackNotificationConfirmation(notification.id);
      }
      // Send confirmation back to client
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
    });
  }
});

// Track notification confirmation
async function trackNotificationConfirmation(notificationId) {
  try {
    const subscription = await getStoredSubscription();
    if (!subscription || !subscription.id) {
      console.warn('[SW] No subscription found for tracking confirmation');
      return;
    }

    const response = await fetch(
      `${getNotifyApiBase()}/notifications/${notificationId}/confirm?subscription_id=${subscription.id}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      console.log('[SW] ✅ Notification confirmation tracked:', notificationId);
    } else {
      console.warn('[SW] ⚠️ Failed to track confirmation:', response.status);
    }
  } catch (error) {
    console.error('[SW] ❌ Error tracking confirmation:', error);
  }
}

// Track notification click
async function trackNotificationClick(notificationId) {
  try {
    const subscription = await getStoredSubscription();
    if (!subscription || !subscription.id) {
      console.warn('[SW] No subscription found for tracking click');
      return;
    }

    const response = await fetch(
      `${getNotifyApiBase()}/notifications/${notificationId}/click?subscription_id=${subscription.id}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      console.log('[SW] ✅ Notification click tracked:', notificationId);
    } else {
      console.warn('[SW] ⚠️ Failed to track click:', response.status);
    }
  } catch (error) {
    console.error('[SW] ❌ Error tracking click:', error);
  }
}

// Persist subscription id so confirm/click works when no tab is open
async function storeSubscriptionMeta(meta) {
  const cache = await caches.open(SUB_META_CACHE);
  await cache.put('/notify-subscription', new Response(JSON.stringify(meta), {
    headers: { 'Content-Type': 'application/json' },
  }));
}

async function readSubscriptionMetaFromCache() {
  try {
    const cache = await caches.open(SUB_META_CACHE);
    const res = await cache.match('/notify-subscription');
    if (res) {
      return await res.json();
    }
  } catch (e) {
    console.warn('[SW] Cache read failed:', e);
  }
  return null;
}

// Get stored subscription from cache or open client
async function getStoredSubscription() {
  const cached = await readSubscriptionMetaFromCache();
  if (cached && cached.id) {
    return cached;
  }

  return new Promise((resolve) => {
    // Send message to all clients to get subscription
    clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clientList) => {
      if (clientList.length > 0) {
        const channel = new MessageChannel();
        let resolved = false;
        
        channel.port1.onmessage = (event) => {
          if (!resolved) {
            resolved = true;
            resolve(event.data);
          }
        };
        
        // Set timeout in case client doesn't respond
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve(null);
          }
        }, 1000);
        
        clientList[0].postMessage({ type: 'GET_SUBSCRIPTION' }, [channel.port2]);
      } else {
        resolve(null);
      }
    });
  });
}

// Sync event (for background sync if needed)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotifications());
  }
});

async function syncNotifications() {
  // Sync pending notifications or other background tasks
  console.log('[SW] Syncing notifications...');
}

