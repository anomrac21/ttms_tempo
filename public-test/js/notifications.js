/**
 * TTMenus Notification Subscription
 * Handles subscription to push notifications via notify-service
 */

function resolveNotifyConfig() {
  let cfg = window.NOTIFY_CONFIG;
  if (typeof cfg === 'string') {
    try {
      cfg = JSON.parse(cfg);
    } catch (e) {
      cfg = null;
    }
  }
  if (cfg && typeof cfg === 'object') {
    if (window.TTMSNetworkGuard && window.TTMSNetworkGuard.ttmsSanitizeNotifyConfig) {
      window.TTMSNetworkGuard.ttmsSanitizeNotifyConfig(cfg);
    }
    window.NOTIFY_CONFIG = cfg;
    return cfg;
  }
  return window.NOTIFY_CONFIG || {};
}

function ttmsIsLocalDevHost() {
  if (window.TTMSNetworkGuard && window.TTMSNetworkGuard.ttmsIsLocalDevHost) {
    return window.TTMSNetworkGuard.ttmsIsLocalDevHost();
  }
  if (typeof window === 'undefined' || !window.location) return false;
  const h = window.location.hostname || '';
  return h === 'localhost' || h === '127.0.0.1' || /\.local$/i.test(h);
}

/** True for localhost / LAN URLs — blocked on public sites (Chrome LNA prompt). */
function ttmsIsLoopbackUrl(url) {
  if (window.TTMSNetworkGuard && window.TTMSNetworkGuard.ttmsIsLocalNetworkUrl) {
    return window.TTMSNetworkGuard.ttmsIsLocalNetworkUrl(url);
  }
  return /^(https?|wss?):\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(String(url || ''));
}

const NotificationService = {
  VAPID_KEY_STORAGE: 'ttmenus_vapid_public_key',
  VAPID_RESYNC_STORAGE: 'ttmenus_vapid_resynced_for',
  PHOTO_REVIEW_ALERTS_STORAGE: 'ttmenus_photo_review_alerts',

  get notifyServiceUrl() {
    const cfg = resolveNotifyConfig();
    return cfg.serviceUrl || window.SiteConfig?.notifyServiceUrl || 'https://notify.ttmenus.com';
  },

  /** Domain registered in notify-service (not necessarily window.location.hostname on localhost). */
  getClientDomain() {
    const configured = (resolveNotifyConfig().clientDomain || '').trim();
    if (configured) {
      return configured.replace(/^www\./i, '');
    }
    return (window.location.hostname || '').replace(/^www\./i, '');
  },

  /** True when browser can receive push while site/app is closed (service worker + PushManager). */
  supportsBackgroundPush() {
    return (
      'serviceWorker' in navigator &&
      !!this.serviceWorkerRegistration &&
      !!this.serviceWorkerRegistration.pushManager
    );
  },

  isIOS() {
    return (
      /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  },

  isStandalonePWA() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  },

  /** iOS only delivers Web Push to home-screen PWAs (iOS 16.4+). */
  getIOSPushRequirementMessage() {
    return (
      'On iPhone/iPad, background alerts require adding this menu to your Home Screen first ' +
      '(Safari Share → Add to Home Screen), then open it from that icon and tap Get menu alerts again.'
    );
  },

  subscriptionId: null,
  wsConnection: null,
  serviceWorkerRegistration: null,

  /**
   * Initialize notification service
   */
  async init() {
    // Check if notifications are enabled
    if (!resolveNotifyConfig().enabled) {
      console.log('Notification service is disabled');
      return;
    }

    this.setupServiceWorkerMessageHandler();
    this.checkSubscriptionStatus();
    this.loadSubscriptionFromStorage();

    // Re-point any stale service worker away from dev loopback URLs (LNA).
    if (window.TTMSNetworkGuard && window.TTMSNetworkGuard.ttmsSyncNotifyUrlToServiceWorker) {
      window.TTMSNetworkGuard.ttmsSyncNotifyUrlToServiceWorker(this.notifyServiceUrl);
    }

    // Defer service worker / push / WebSocket until user has subscribed.
    // Avoids Local Network Access prompts on first visit (Chrome/Edge).
    if (!this.subscriptionId) {
      return;
    }

    await this.registerServiceWorker();

    // Verify push subscription is still valid and sync keys to server
    if (this.subscriptionId && this.serviceWorkerRegistration) {
      await this.verifyPushSubscription();
    }

    if (this.subscriptionId && this.isCurrentUserAdmin()) {
      const userId = this.generateUserID();
      const stored = localStorage.getItem('ttmenus_notification_subscription');
      let linked = false;
      if (stored) {
        try {
          linked = JSON.parse(stored).user_id === userId;
        } catch (e) {
          linked = false;
        }
      }
      if (!linked && userId.startsWith('auth_')) {
        await this.relinkSubscriptionToAuthUser();
      }
    }
    
    // If user is subscribed, connect to WebSocket to receive notifications (when site is open)
    if (this.subscriptionId) {
      this.connectWebSocket();
    }
  },

  /**
   * Verify and restore push subscription if needed
   */
  async verifyPushSubscription() {
    if (!this.serviceWorkerRegistration || !this.serviceWorkerRegistration.pushManager) {
      return;
    }

    if (!this.supportsBackgroundPush()) {
      if (this.isIOS() && !this.isStandalonePWA()) {
        this.updateSubscribeButton(!!this.subscriptionId, { backgroundPush: false });
      }
      return;
    }

    try {
      const stored = localStorage.getItem('ttmenus_notification_subscription');
      if (!stored) return;

      const apiUrl = resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;
      const vapidPublicKey = await this.fetchVapidPublicKey(apiUrl, this.getClientDomain());
      const pushSubscription = await this.ensurePushSubscription(vapidPublicKey);

      if (pushSubscription) {
        await this.syncPushSubscriptionToServer(pushSubscription);
        this.updateSubscribeButton(true, { backgroundPush: true });
        console.log('✅ Background push subscription active and synced');
        return;
      }

      console.warn('⚠️ Background push subscription missing — repairing…');
      this.updateSubscribeButton(true, { backgroundPush: false });
      await this.repairBackgroundPush();
    } catch (error) {
      console.error('Error verifying push subscription:', error);
    }
  },

  /**
   * Re-create browser Push subscription when it was lost but server subscription exists.
   */
  async repairBackgroundPush() {
    if (!this.subscriptionId || !this.supportsBackgroundPush()) return;
    try {
      const apiUrl = resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;
      const vapidPublicKey = await this.fetchVapidPublicKey(apiUrl, this.getClientDomain());
      const pushSubscription = await this.ensurePushSubscription(vapidPublicKey);
      if (pushSubscription) {
        await this.syncPushSubscriptionToServer(pushSubscription);
        this.updateSubscribeButton(true, { backgroundPush: true });
        console.log('✅ Background push subscription repaired');
      }
    } catch (err) {
      console.warn('Could not repair background push:', err && err.message ? err.message : err);
    }
  },

  /**
   * Keep server push endpoint/keys in sync with the browser (required for closed-app delivery).
   */
  async syncPushSubscriptionToServer(pushSubscription) {
    if (!this.subscriptionId) return;

    const pushManager =
      this.serviceWorkerRegistration && this.serviceWorkerRegistration.pushManager;
    if (!pushSubscription && pushManager) {
      pushSubscription = await pushManager.getSubscription();
    }
    if (!pushSubscription) {
      console.warn('⚠️ No browser push subscription to sync');
      return;
    }

    const apiUrl = resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;
    const payload = {
      push_endpoint: pushSubscription.endpoint,
      push_keys: {
        p256dh: this.arrayBufferToBase64(pushSubscription.getKey('p256dh')),
        auth: this.arrayBufferToBase64(pushSubscription.getKey('auth')),
      },
      ws_connection_id: this.getWebSocketConnectionID(),
      preferences: this.buildPreferencesPayload(),
    };

    const authUserId = this.generateUserID();
    if (authUserId.startsWith('auth_')) {
      payload.user_id = authUserId;
    }

    try {
      const res = await fetch(`${apiUrl}/subscriptions/${encodeURIComponent(this.subscriptionId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn('Push sync failed (HTTP ' + res.status + '):', body);
        return;
      }
      const data = await res.json().catch(() => ({}));
      console.log(
        '✅ Push subscription synced to server',
        data.has_background_push ? '(background push ready)' : '(incomplete keys)'
      );
      if (data.user_id || data.preferences) {
        const stored = localStorage.getItem('ttmenus_notification_subscription');
        if (stored) {
          try {
            const sub = JSON.parse(stored);
            if (data.user_id) sub.user_id = data.user_id;
            if (data.preferences) sub.preferences = data.preferences;
            localStorage.setItem('ttmenus_notification_subscription', JSON.stringify(sub));
          } catch (e) {
            /* ignore */
          }
        }
      }
      this.notifyServiceWorkerSubscription(this.subscriptionId);
    } catch (err) {
      console.warn('Push sync error:', err && err.message ? err.message : err);
    }
  },

  /** Tell the service worker which subscription ID to use for confirm/click tracking. */
  notifyServiceWorkerSubscription(subscriptionId) {
    if (!subscriptionId || !navigator.serviceWorker) return;
    const payload = { type: 'SET_SUBSCRIPTION_ID', id: subscriptionId };
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(payload);
    }
    navigator.serviceWorker.ready
      .then((reg) => {
        if (reg.active) reg.active.postMessage(payload);
      })
      .catch(() => {});
  },

  /**
   * Register service worker for background notifications
   */
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const swPath = resolveNotifyConfig().serviceWorkerPath || '/sw.js';
        const registration = await navigator.serviceWorker.register(swPath, {
          scope: '/',
        });
        this.serviceWorkerRegistration = registration;
        console.log('✅ Service Worker registered:', registration.scope);
        this.configureServiceWorkerNotifyUrl(registration);
        
        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('🔄 New service worker available. Reload to update.');
            }
          });
        });
      } catch (error) {
        console.error('❌ Service Worker registration failed:', error);
      }
    } else {
      console.warn('⚠️ Service Workers are not supported in this browser');
    }
  },

  /**
   * Pass notify-service URL to the service worker (supports local dev overrides).
   */
  configureServiceWorkerNotifyUrl(registration) {
    const serviceUrl =
      resolveNotifyConfig().serviceUrl ||
      window.SiteConfig?.notifyServiceUrl ||
      'https://notify.ttmenus.com';
    const sanitized =
      window.TTMSNetworkGuard && window.TTMSNetworkGuard.ttmsSanitizeRemoteUrl
        ? window.TTMSNetworkGuard.ttmsSanitizeRemoteUrl(
            serviceUrl,
            window.TTMSNetworkGuard.DEFAULTS.notifyService
          ) || window.TTMSNetworkGuard.DEFAULTS.notifyService
        : serviceUrl;
    const payload = { type: 'SET_NOTIFY_CONFIG', serviceUrl: sanitized };

    const send = (worker) => {
      if (worker) worker.postMessage(payload);
    };

    send(registration.active);
    send(registration.waiting);
    send(registration.installing);

    navigator.serviceWorker.ready
      .then((reg) => send(reg.active))
      .catch(() => {});
  },

  /**
   * Create or refresh browser Push API subscription (required for phone alerts when app is closed).
   */
  async ensurePushSubscription(vapidPublicKey) {
    const pushManager = this.serviceWorkerRegistration && this.serviceWorkerRegistration.pushManager;
    if (!pushManager) {
      return null;
    }

    const applicationServerKey = this.urlBase64ToUint8Array(vapidPublicKey);
    let pushSubscription = await pushManager.getSubscription();
    const storedVapid = localStorage.getItem(this.VAPID_KEY_STORAGE);
    const resyncedFor = localStorage.getItem(this.VAPID_RESYNC_STORAGE);
    const vapidChanged = !storedVapid || storedVapid !== vapidPublicKey;
    const needsResync = vapidChanged || resyncedFor !== vapidPublicKey;

    if (pushSubscription && needsResync) {
      console.warn('VAPID key changed or push subscription needs resync — recreating background push subscription');
      try {
        await pushSubscription.unsubscribe();
      } catch (unsubErr) {
        console.warn('Could not unsubscribe stale push subscription:', unsubErr);
      }
      pushSubscription = null;
    }

    if (pushSubscription) {
      try {
        if (!pushSubscription.getKey('p256dh') || !pushSubscription.getKey('auth')) {
          await pushSubscription.unsubscribe();
          pushSubscription = null;
        }
      } catch (e) {
        try {
          await pushSubscription.unsubscribe();
        } catch (unsubErr) {
          console.warn('Could not refresh push subscription:', unsubErr);
        }
        pushSubscription = null;
      }
    }

    if (!pushSubscription) {
      try {
        pushSubscription = await pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey,
        });
      } catch (subscribeErr) {
        const name = subscribeErr && subscribeErr.name ? subscribeErr.name : 'PushSubscribeError';
        const msg = subscribeErr && subscribeErr.message ? subscribeErr.message : '';
        throw new Error(
          msg
            ? `Browser push subscribe failed (${name}): ${msg}`
            : `Browser push subscribe failed (${name}). Check VAPID public key on notify-service and try again.`
        );
      }
      console.log(
        '✅ Background push subscription created:',
        pushSubscription.endpoint.substring(0, 50) + '...'
      );
    } else {
      console.log('✅ Using existing background push subscription');
    }

    localStorage.setItem(this.VAPID_KEY_STORAGE, vapidPublicKey);
    localStorage.setItem(this.VAPID_RESYNC_STORAGE, vapidPublicKey);
    return pushSubscription;
  },

  /**
   * Fetch VAPID public key from notify-service.
   */
  async fetchVapidPublicKey(apiUrl, clientDomain) {
    const keyResponse = await fetch(
      `${apiUrl}/clients/${encodeURIComponent(clientDomain)}/vapid-key`
    );
    if (keyResponse.ok) {
      const keyData = await keyResponse.json();
      const key = keyData.publicKey || keyData.vapid_public_key;
      if (key) {
        if (key.length < 80) {
          throw new Error(
            'Invalid VAPID public key from server (too short). Notify-service VAPID_PUBLIC_KEY may be misconfigured.'
          );
        }
        console.log('✅ VAPID public key retrieved');
        return key;
      }
    }
    if (keyResponse.status === 503) {
      throw new Error(
        'Background push is not configured on the notification server (VAPID keys missing).'
      );
    }
    const body = await keyResponse.text().catch(() => '');
    throw new Error(
      'Could not load push configuration (HTTP ' + keyResponse.status + '): ' + body
    );
  },

  /**
   * Check if user has subscribed
   */
  checkSubscriptionStatus() {
    const stored = localStorage.getItem('ttmenus_notification_subscription');
    if (stored) {
      try {
        const subscription = JSON.parse(stored);
        this.subscriptionId = subscription.id;
        this.updateSubscribeButton(true);
      } catch (e) {
        console.error('Failed to parse subscription:', e);
        this.updateSubscribeButton(false);
      }
    } else {
      // Not subscribed - ensure buttons show correctly
      this.updateSubscribeButton(false);
    }
  },

  /**
   * Load subscription from storage
   */
  loadSubscriptionFromStorage() {
    const stored = localStorage.getItem('ttmenus_notification_subscription');
    if (stored) {
      try {
        const subscription = JSON.parse(stored);
        this.subscriptionId = subscription.id;
      } catch (e) {
        console.error('Failed to load subscription:', e);
      }
    }
  },

  /**
   * Generate a unique user ID
   */
  generateUserID() {
    if (typeof AuthClient !== 'undefined' && AuthClient.getCurrentUser) {
      const user = AuthClient.getCurrentUser();
      if (user && user.id != null && user.id !== '') {
        return 'auth_' + String(user.id);
      }
    }
    let userId = localStorage.getItem('ttmenus_user_id');
    if (!userId) {
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('ttmenus_user_id', userId);
    }
    return userId;
  },

  getPhotoReviewAlertsEnabled() {
    const stored = localStorage.getItem(this.PHOTO_REVIEW_ALERTS_STORAGE);
    return stored !== '0' && stored !== 'false';
  },

  setPhotoReviewAlertsEnabled(enabled) {
    localStorage.setItem(this.PHOTO_REVIEW_ALERTS_STORAGE, enabled ? '1' : '0');
  },

  buildPreferencesPayload() {
    return {
      enable_photo_review_alerts: this.getPhotoReviewAlertsEnabled(),
    };
  },

  async updatePhotoReviewPreference(enabled) {
    this.setPhotoReviewAlertsEnabled(enabled);
    if (!this.subscriptionId) {
      return { ok: false, reason: 'not_subscribed' };
    }

    const apiUrl = resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;
    try {
      const res = await fetch(`${apiUrl}/subscriptions/${encodeURIComponent(this.subscriptionId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: { enable_photo_review_alerts: !!enabled },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn('Photo review preference sync failed:', body);
        return { ok: false, reason: body || res.statusText };
      }
      const data = await res.json().catch(() => ({}));
      if (data.preferences) {
        const stored = localStorage.getItem('ttmenus_notification_subscription');
        if (stored) {
          try {
            const sub = JSON.parse(stored);
            sub.preferences = data.preferences;
            localStorage.setItem('ttmenus_notification_subscription', JSON.stringify(sub));
          } catch (e) {
            /* ignore */
          }
        }
      }
      return { ok: true };
    } catch (err) {
      console.warn('Photo review preference sync error:', err && err.message ? err.message : err);
      return { ok: false, reason: err && err.message ? err.message : 'network_error' };
    }
  },

  isCurrentUserAdmin() {
    if (typeof AuthClient === 'undefined') return false;
    if (AuthClient.isSuperadmin && AuthClient.isSuperadmin()) return true;
    if (AuthClient.isAdmin && AuthClient.isAdmin()) return true;
    return false;
  },

  shouldDisplayNotification(notification) {
    var data = notification && notification.data;
    if (!data || data.admin_only !== true) return true;
    if (!this.isCurrentUserAdmin()) return false;
    var adminIds = data.admin_user_ids;
    if (!adminIds || !adminIds.length) return true;
    var userId = this.generateUserID();
    if (!userId || userId.indexOf('auth_') !== 0) return false;
    var numericId = userId.slice(5);
    for (var i = 0; i < adminIds.length; i++) {
      if (String(adminIds[i]) === numericId) return true;
    }
    return false;
  },

  /**
   * Link an existing push subscription to the signed-in admin account (required for photo approval alerts).
   */
  async relinkSubscriptionToAuthUser() {
    if (!this.subscriptionId) return { ok: false, reason: 'not_subscribed' };
    const userId = this.generateUserID();
    if (!userId.startsWith('auth_')) {
      return { ok: false, reason: 'not_signed_in' };
    }

    const pushManager =
      this.serviceWorkerRegistration && this.serviceWorkerRegistration.pushManager;
    let pushSubscription = pushManager ? await pushManager.getSubscription() : null;
    if (this.supportsBackgroundPush() && !pushSubscription) {
      try {
        const apiUrl = resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;
        const vapidPublicKey = await this.fetchVapidPublicKey(apiUrl, this.getClientDomain());
        pushSubscription = await this.ensurePushSubscription(vapidPublicKey);
      } catch (err) {
        return { ok: false, reason: err && err.message ? err.message : 'push_unavailable' };
      }
    }

    await this.syncPushSubscriptionToServer(pushSubscription);
    return { ok: true, userId };
  },

  /**
   * Ensure client is registered in notify-service
   */
  async ensureClientRegistered(clientDomain) {
    const checkUrl = `${this.notifyServiceUrl}/api/v1/clients/${encodeURIComponent(clientDomain)}/api-key`;

    let checkResponse;
    try {
      checkResponse = await fetch(checkUrl);
    } catch (error) {
      const msg = error && error.message ? error.message : String(error);
      throw new Error(
        'Notify service is unreachable (' +
          msg +
          '). If notify.ttmenus.com is down or not deployed, subscriptions cannot work. Check https://notify.ttmenus.com/health from your browser.'
      );
    }

    if (checkResponse.ok) {
      console.log('✅ Notify client registered:', clientDomain);
      return;
    }

    if (checkResponse.status !== 404) {
      const body = await checkResponse.text().catch(() => '');
      throw new Error('Notify client check failed (HTTP ' + checkResponse.status + '): ' + body);
    }

    console.log('Registering notify client:', clientDomain);
    const authClientId =
      window.CLIENT_ID ||
      window.SITE_CLIENT_ID ||
      (window.SiteConfig && window.SiteConfig.contentManagement && window.SiteConfig.contentManagement.clientId) ||
      '';
    const registerUrl = `${this.notifyServiceUrl}/api/v1/clients/register`;
    let registerResponse;
    try {
      registerResponse = await fetch(registerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: clientDomain,
          client_name: document.title || clientDomain,
          service_group: 'ttmenus',
          auth_client_id: authClientId || undefined,
        }),
      });
    } catch (error) {
      const msg = error && error.message ? error.message : String(error);
      throw new Error('Client registration request failed: ' + msg);
    }

    if (registerResponse.ok || registerResponse.status === 409) {
      console.log('✅ Notify client ready:', clientDomain);
      return;
    }

    const error = await registerResponse.json().catch(() => ({ error: registerResponse.statusText }));
    throw new Error(error.error || error.details || 'Failed to register client in notify-service');
  },

  /**
   * Get or create WebSocket connection ID
   */
  getWebSocketConnectionID() {
    let wsId = sessionStorage.getItem('ttmenus_ws_connection_id');
    if (!wsId) {
      wsId = 'ws_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('ttmenus_ws_connection_id', wsId);
    }
    return wsId;
  },

  /**
   * Collect demographic information about the user's device and browser
   */
  collectDemographics() {
    const ua = navigator.userAgent || '';
    const demographics = {
      user_agent: ua,
      screen_width: window.screen ? window.screen.width : 0,
      screen_height: window.screen ? window.screen.height : 0,
      language: navigator.language || navigator.userLanguage || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    };

    // Parse browser information
    if (ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('OPR')) {
      demographics.browser = 'Chrome';
      const match = ua.match(/Chrome\/(\d+)/);
      demographics.browser_version = match ? match[1] : '';
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
      demographics.browser = 'Safari';
      const match = ua.match(/Version\/(\d+)/);
      demographics.browser_version = match ? match[1] : '';
    } else if (ua.includes('Firefox')) {
      demographics.browser = 'Firefox';
      const match = ua.match(/Firefox\/(\d+)/);
      demographics.browser_version = match ? match[1] : '';
    } else if (ua.includes('Edg')) {
      demographics.browser = 'Edge';
      const match = ua.match(/Edg\/(\d+)/);
      demographics.browser_version = match ? match[1] : '';
    } else if (ua.includes('OPR')) {
      demographics.browser = 'Opera';
      const match = ua.match(/OPR\/(\d+)/);
      demographics.browser_version = match ? match[1] : '';
    }

    // Parse OS information
    if (ua.includes('Windows')) {
      demographics.os = 'Windows';
      if (ua.includes('Windows NT 10.0')) demographics.os_version = '10/11';
      else if (ua.includes('Windows NT 6.3')) demographics.os_version = '8.1';
      else if (ua.includes('Windows NT 6.2')) demographics.os_version = '8';
      else if (ua.includes('Windows NT 6.1')) demographics.os_version = '7';
    } else if (ua.includes('Mac OS X') || ua.includes('Macintosh')) {
      demographics.os = 'macOS';
      const match = ua.match(/Mac OS X (\d+[._]\d+)/);
      demographics.os_version = match ? match[1].replace('_', '.') : '';
    } else if (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod')) {
      demographics.os = 'iOS';
      const match = ua.match(/OS (\d+[._]\d+)/);
      demographics.os_version = match ? match[1].replace('_', '.') : '';
      if (ua.includes('iPhone')) {
        demographics.device_type = 'mobile';
        const match = ua.match(/iPhone(\d+,\d+)/);
        if (match) {
          const model = match[1];
          demographics.device_model = `iPhone ${model.replace(',', '.')}`;
        }
      } else if (ua.includes('iPad')) {
        demographics.device_type = 'tablet';
        demographics.device_model = 'iPad';
      }
    } else if (ua.includes('Android')) {
      demographics.os = 'Android';
      const match = ua.match(/Android (\d+[.\d]*)/);
      demographics.os_version = match ? match[1] : '';
      
      // Detect device type
      if (ua.includes('Mobile')) {
        demographics.device_type = 'mobile';
      } else {
        demographics.device_type = 'tablet';
      }
      
      // Try to detect device model
      const modelMatch = ua.match(/Android.*?;\s*([^)]+)\)/);
      if (modelMatch) {
        demographics.device_model = modelMatch[1].trim();
      }
    } else if (ua.includes('Linux')) {
      demographics.os = 'Linux';
    } else {
      demographics.os = 'Unknown';
    }

    // Set device type if not already set - use multiple methods for accuracy
    if (!demographics.device_type) {
      // Method 1: Use screen width
      const screenWidth = demographics.screen_width || window.innerWidth || 0;
      if (screenWidth < 768) {
        demographics.device_type = 'mobile';
      } else if (screenWidth < 1024) {
        demographics.device_type = 'tablet';
      } else {
        demographics.device_type = 'desktop';
      }
      
      // Method 2: Verify with user agent if available
      if (ua.includes('Mobile') && !ua.includes('Tablet') && !ua.includes('iPad')) {
        demographics.device_type = 'mobile';
      } else if (ua.includes('Tablet') || ua.includes('iPad')) {
        demographics.device_type = 'tablet';
      } else if (screenWidth >= 1024 && (ua.includes('Windows') || ua.includes('Mac') || ua.includes('Linux'))) {
        demographics.device_type = 'desktop';
      }
    }
    
    // Ensure device_type is always set
    if (!demographics.device_type) {
      // Final fallback based on screen size
      const screenWidth = demographics.screen_width || window.innerWidth || 0;
      if (screenWidth === 0) {
        demographics.device_type = 'unknown';
      } else if (screenWidth < 768) {
        demographics.device_type = 'mobile';
      } else if (screenWidth < 1024) {
        demographics.device_type = 'tablet';
      } else {
        demographics.device_type = 'desktop';
      }
    }

    console.log('📊 Collected demographics:', {
      device_type: demographics.device_type,
      os: demographics.os,
      browser: demographics.browser,
      screen_width: demographics.screen_width,
      screen_height: demographics.screen_height
    });

    return demographics;
  },

  /**
   * Subscribe to notifications
   */
  async subscribe() {
    try {
      const platform = 'web';
      
      // Check if browser supports notifications
      if (!('Notification' in window)) {
        alert('This browser does not support notifications.');
        return;
      }

      // Check if service worker is registered
      if (!this.serviceWorkerRegistration) {
        await this.registerServiceWorker();
      }

      if (!this.serviceWorkerRegistration) {
        throw new Error('Service Worker registration failed. Push notifications require a service worker.');
      }

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('Notification permission denied. Please enable notifications in your browser settings.');
        return;
      }

      const userId = this.generateUserID();
      
      // Collect demographic information
      const demographics = this.collectDemographics();
      
      const clientDomain = this.getClientDomain();

      await this.ensureClientRegistered(clientDomain);

      const apiUrl = resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;

      if (this.isIOS() && !this.isStandalonePWA()) {
        throw new Error(this.getIOSPushRequirementMessage());
      }

      let pushSubscription = null;
      let deviceToken = this.getWebSocketConnectionID();

      if (this.supportsBackgroundPush()) {
        const vapidPublicKey = await this.fetchVapidPublicKey(apiUrl, clientDomain);
        pushSubscription = await this.ensurePushSubscription(vapidPublicKey);
        if (!pushSubscription) {
          throw new Error('Could not register for background push notifications.');
        }
        deviceToken = pushSubscription.endpoint;
      } else if ('serviceWorker' in navigator) {
        throw new Error(
          'This browser cannot receive alerts when closed. Try Chrome or Safari on your phone, or add the menu to your home screen.'
        );
      } else {
        throw new Error('Push notifications are not supported in this browser.');
      }

      console.log('Subscribing to notifications:', {
        notifyServiceUrl: this.notifyServiceUrl,
        clientDomain: clientDomain,
        userId: userId,
        platform: platform,
        hasPushSubscription: !!pushSubscription,
        deviceToken: deviceToken.substring(0, 50) + '...',
        demographics: demographics
      });

      const wsConnectionId = this.getWebSocketConnectionID();

      // Prepare subscription data
      const subscriptionData = {
        client_domain: clientDomain,
        user_id: userId,
        device_token: deviceToken,
        platform: platform,
        demographics: demographics,
        ws_connection_id: wsConnectionId,
      };

      // Add push subscription details (required for background delivery on phones)
      if (!pushSubscription) {
        throw new Error('Background push registration failed. Alerts cannot be delivered when the app is closed.');
      }
      subscriptionData.push_endpoint = pushSubscription.endpoint;
      subscriptionData.push_keys = {
        p256dh: this.arrayBufferToBase64(pushSubscription.getKey('p256dh')),
        auth: this.arrayBufferToBase64(pushSubscription.getKey('auth')),
      };
      subscriptionData.preferences = this.buildPreferencesPayload();

      // Subscribe via notify-service API
      const subscribeUrl = `${apiUrl}/subscriptions`;
      console.log('Subscription URL:', subscribeUrl);

      // Connect early so welcome notification can arrive via WebSocket while tab is open
      this.connectWebSocket({ allowWithoutSubscription: true });

      const response = await fetch(subscribeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscriptionData),
      });

      console.log('Subscription response status:', response.status, response.statusText);

      if (!response.ok) {
        let errorMessage = 'Failed to subscribe';
        try {
          const error = await response.json();
          errorMessage = error.error || error.details || errorMessage;
          console.error('Subscription error response:', error);
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          console.error('Failed to parse error response:', e);
        }
        throw new Error(errorMessage);
      }

      const subscription = await response.json();
      console.log('Subscription successful:', subscription);
      this.subscriptionId = subscription.id;

      // Store subscription with push subscription details
      const subscriptionToStore = {
        ...subscription,
        ws_connection_id: wsConnectionId,
        pushSubscription: pushSubscription ? {
          endpoint: pushSubscription.endpoint,
          keys: {
            p256dh: this.arrayBufferToBase64(pushSubscription.getKey('p256dh')),
            auth: this.arrayBufferToBase64(pushSubscription.getKey('auth')),
          },
        } : null,
      };
      localStorage.setItem('ttmenus_notification_subscription', JSON.stringify(subscriptionToStore));

      this.notifyServiceWorkerSubscription(subscription.id);

      // Connect to WebSocket for real-time notifications (when site is open)
      this.connectWebSocket();

      this.updateSubscribeButton(true, { backgroundPush: true });
      this.showMessage(
        'Alerts enabled! You will receive push notifications on this device even when the menu is closed.',
        'success'
      );
    } catch (error) {
      console.error('Subscription error:', error);
      let errorMessage = (error && error.message) ? error.message : String(error);
      if (!errorMessage || errorMessage === 'Failed to fetch') {
        errorMessage =
          'Unable to connect to notify.ttmenus.com. Check that clientDomain is set (e.g. menudemo.ttmenus.com in hugo.toml), not localhost.';
      }
      this.showMessage('Failed to subscribe: ' + errorMessage, 'error');
    }
  },

  /**
   * Convert VAPID key from URL-safe base64 to Uint8Array
   */
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  },

  /**
   * Convert ArrayBuffer to base64 string
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  },

  /**
   * Unsubscribe from notifications
   */
  async unsubscribe() {
    if (!this.subscriptionId) {
      this.showMessage('Not subscribed to notifications.', 'info');
      return;
    }

    try {
      const apiUrl = resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;
      const response = await fetch(`${apiUrl}/subscriptions/${this.subscriptionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to unsubscribe');
      }

      // Unsubscribe from Push API
      if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.pushManager) {
        try {
          const pushSubscription = await this.serviceWorkerRegistration.pushManager.getSubscription();
          if (pushSubscription) {
            await pushSubscription.unsubscribe();
            console.log('✅ Push API subscription removed');
          }
        } catch (pushError) {
          console.warn('⚠️ Failed to unsubscribe from Push API:', pushError);
        }
      }

      // Clear subscription
      this.subscriptionId = null;
      localStorage.removeItem('ttmenus_notification_subscription');
      
      // Close WebSocket connection
      if (this.wsConnection) {
        this.wsConnection.close();
        this.wsConnection = null;
      }

      this.updateSubscribeButton(false);
      this.showMessage('Successfully unsubscribed from notifications.', 'success');
    } catch (error) {
      console.error('Unsubscribe error:', error);
      this.showMessage('Failed to unsubscribe: ' + error.message, 'error');
    }
  },

  /**
   * Connect to WebSocket for real-time notifications
   * @param {{ allowWithoutSubscription?: boolean }} [options]
   */
  connectWebSocket(options) {
    options = options || {};
    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      console.log('✅ WebSocket already connected');
      return; // Already connected
    }
    
    if (!options.allowWithoutSubscription && !this.subscriptionId) {
      console.log('⚠️ Cannot connect WebSocket: No active subscription');
      return;
    }

    try {
      const wsUrl = resolveNotifyConfig().websocketUrl || this.notifyServiceUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/api/v1/ws/connect';
      // WebSocket handler requires client_domain query parameter
      const clientDomain = this.getClientDomain();

      let connectionId = this.getWebSocketConnectionID();
      const stored = localStorage.getItem('ttmenus_notification_subscription');
      if (stored) {
        try {
          const subscription = JSON.parse(stored);
          if (subscription.ws_connection_id) {
            connectionId = subscription.ws_connection_id;
          } else if (
            subscription.device_token &&
            !String(subscription.device_token).startsWith('https://')
          ) {
            connectionId = subscription.device_token;
          }
        } catch (e) {
          console.error('Failed to parse subscription for connection ID:', e);
        }
      }
      
      const wsPath = `${wsUrl}?client_domain=${encodeURIComponent(clientDomain)}&connection_id=${encodeURIComponent(connectionId)}`;

      if (!ttmsIsLocalDevHost() && ttmsIsLoopbackUrl(wsPath)) {
        console.warn('Skipping notification WebSocket — loopback URL on public site');
        return;
      }

      console.log('Connecting to WebSocket:', wsPath);
      this.wsConnection = new WebSocket(wsPath);

      this.wsConnection.onopen = () => {
        console.log('✅ WebSocket connected for notifications');
        console.log('🔌 Connection ID:', connectionId);
        console.log('📡 WebSocket readyState:', this.wsConnection.readyState);
        this.syncPushSubscriptionToServer();
      };

      this.wsConnection.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('WebSocket message received:', message);
          
          // Handle WebSocketMessage wrapper
          if (message.type === 'notification' && message.data) {
            // Extract notification from WebSocketMessage wrapper
            const notification = message.data;
            console.log('Notification extracted:', notification);
            this.showNotification(notification);
          } else if (message.title || message.message) {
            // Direct notification object (fallback)
            this.showNotification(message);
          } else {
            console.log('Unknown WebSocket message type:', message);
          }
        } catch (e) {
          console.error('Failed to parse notification:', e, event.data);
        }
      };

      this.wsConnection.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.wsConnection.onclose = () => {
        console.log('WebSocket disconnected');
        // Attempt to reconnect after 5 seconds
        setTimeout(() => {
          if (this.subscriptionId) {
            this.connectWebSocket();
          }
        }, 5000);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  },

  /**
   * Show browser notification
   * Uses service worker if available, otherwise falls back to direct Notification API
   */
  async showNotification(notification) {
    if (Notification.permission !== 'granted') {
      console.warn('⚠️ Notification permission not granted');
      return;
    }

    if (!this.shouldDisplayNotification(notification)) {
      console.log('Skipping admin-only notification for this user/device');
      return;
    }

    var notificationId = notification && notification.id;
    if (notificationId) {
      var now = Date.now();
      if (!this._recentNotificationIds) this._recentNotificationIds = new Map();
      var lastShown = this._recentNotificationIds.get(notificationId);
      if (lastShown && now - lastShown < 15000) {
        console.log('Skipping duplicate in-tab notification:', notificationId);
        return;
      }
      this._recentNotificationIds.set(notificationId, now);
    }

    const defaultIcon = 'https://cdn.ttmenus.com/branding/ttmenus/ttmenus.gif';
    const iconUrl =
      (notification.data && (notification.data.icon || notification.data.image || notification.data.image_url)) ||
      notification.icon ||
      notification.image ||
      defaultIcon;
    const imageUrl =
      (notification.data && (notification.data.image || notification.data.image_url)) ||
      notification.image ||
      undefined;
    const badgeUrl = (notification.data && notification.data.badge) || iconUrl;
    const linkUrl = notification.data && (notification.data.url || notification.data.link);

    const notificationData = {
      title: notification.title || 'TTMenus',
      body: notification.message || notification.body || '',
      icon: iconUrl,
      badge: badgeUrl,
      image: imageUrl,
      id: notification.id,
      tag: notification.id,
      data: {
        ...(notification.data || {}),
        notificationId: notification.id,
        linkUrl: linkUrl,
      },
    };

    // Prefer service worker for background notifications
    if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
      try {
        // Send notification to service worker
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
          if (event.data.success) {
            console.log('✅ Notification shown via service worker');
          }
        };
        
        this.serviceWorkerRegistration.active.postMessage(
          {
            type: 'SHOW_NOTIFICATION',
            notification: notificationData,
          },
          [channel.port2]
        );
        return;
      } catch (error) {
        console.warn('⚠️ Failed to show notification via service worker, falling back:', error);
      }
    }

    // Fallback to direct Notification API (works when page is open)
    try {
      const notificationObj = new Notification(notificationData.title, {
        body: notificationData.body,
        icon: notificationData.icon,
        badge: notificationData.badge,
        image: notificationData.image,
        tag: notificationData.tag,
        data: notificationData.data,
      });
      
      // Track confirmation when notification is displayed
      this.trackNotificationConfirmation(notification.id);
      
      // Handle click event - navigate to link and track click
      notificationObj.onclick = (event) => {
        event.preventDefault();
        
        // Track click via API
        this.trackNotificationClick(notification.id);
        
        // Navigate to link if provided
        if (linkUrl) {
          window.focus(); // Focus the window first
          window.open(linkUrl, '_blank');
        } else {
          // If no link, just focus the window
          window.focus();
        }
        
        // Close the notification
        notificationObj.close();
      };
    } catch (error) {
      console.error('❌ Failed to show notification:', error);
    }
  },
  
  /**
   * Track notification confirmation (when notification is displayed/seen)
   */
  async trackNotificationConfirmation(notificationId) {
    if (!this.subscriptionId) {
      console.warn('Cannot track confirmation: No subscription ID');
      return;
    }
    
    try {
      const apiUrl = resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;
      const trackUrl = `${apiUrl}/notifications/${notificationId}/confirm?subscription_id=${this.subscriptionId}`;
      const response = await fetch(trackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        console.log('✅ Notification confirmation tracked:', notificationId);
      } else {
        console.warn('⚠️ Failed to track notification confirmation:', response.status);
      }
    } catch (error) {
      console.error('❌ Error tracking notification confirmation:', error);
    }
  },

  /**
   * Handle messages from service worker
   */
  setupServiceWorkerMessageHandler() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        console.log('📨 Message from service worker:', event.data);
        
        if (event.data && event.data.type === 'GET_SUBSCRIPTION') {
          // Send subscription info to service worker
          const stored = localStorage.getItem('ttmenus_notification_subscription');
          if (stored) {
            try {
              const subscription = JSON.parse(stored);
              if (event.ports && event.ports[0]) {
                event.ports[0].postMessage(subscription);
              }
            } catch (e) {
              console.error('Failed to parse subscription for service worker:', e);
              if (event.ports && event.ports[0]) {
                event.ports[0].postMessage(null);
              }
            }
          } else {
            if (event.ports && event.ports[0]) {
              event.ports[0].postMessage(null);
            }
          }
        }
      });
    }
  },

  /**
   * Track notification click
   */
  async trackNotificationClick(notificationId) {
    if (!this.subscriptionId) {
      console.warn('Cannot track click: No subscription ID');
      return;
    }
    
    try {
      const apiUrl = resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;
      const trackUrl = `${apiUrl}/notifications/${notificationId}/click?subscription_id=${this.subscriptionId}`;
      const response = await fetch(trackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        console.log('✅ Notification click tracked:', notificationId);
      } else {
        console.warn('⚠️ Failed to track notification click:', response.status);
      }
    } catch (error) {
      console.error('❌ Error tracking notification click:', error);
    }
  },

  /**
   * Apply subscribed/unsubscribed labels to one notify CTA.
   * @param {HTMLElement|null} btn
   * @param {HTMLElement|null} btnText
   * @param {HTMLElement|null} btnHint
   * @param {boolean} isSubscribed
   * @param {boolean} backgroundPush
   */
  applySubscribeButtonState(btn, btnText, btnHint, isSubscribed, backgroundPush) {
    if (!btn) return;

    if (isSubscribed) {
      btn.classList.add('subscribed');
      btn.setAttribute('aria-pressed', 'true');
      if (btnText) {
        btnText.textContent = 'Alerts on';
      } else {
        btn.setAttribute(
          'aria-label',
          backgroundPush ? 'Alerts on — tap to turn off' : 'Alerts need setup — tap to re-enable'
        );
      }
      if (btnHint) {
        btnHint.textContent = backgroundPush
          ? 'Tap to turn off'
          : 'Tap to fix phone alerts';
      }
      btn.title = backgroundPush
        ? 'You receive menu alerts — tap to turn off'
        : 'Background alerts need setup — tap to re-enable';
    } else {
      btn.classList.remove('subscribed');
      btn.setAttribute('aria-pressed', 'false');
      if (btnText) {
        btnText.textContent = 'Get menu alerts';
      } else {
        btn.setAttribute('aria-label', 'Get menu alerts');
      }
      if (btnHint) btnHint.textContent = 'Free · specials & hours';
      btn.title = 'Get alerts for specials, hours, and menu updates';
    }
  },

  /**
   * Update subscribe button state
   * @param {boolean} isSubscribed
   * @param {{ backgroundPush?: boolean }} [options]
   */
  updateSubscribeButton(isSubscribed, options) {
    options = options || {};
    const backgroundPush = options.backgroundPush !== false;

    this.applySubscribeButtonState(
      document.getElementById('subBtn'),
      document.getElementById('subBtnText'),
      document.getElementById('subBtnHint'),
      isSubscribed,
      backgroundPush
    );

    this.applySubscribeButtonState(
      document.getElementById('subBtnHeader'),
      document.getElementById('subBtnHeaderText'),
      document.getElementById('subBtnHeaderHint'),
      isSubscribed,
      backgroundPush
    );

    const btnHero = document.getElementById('subBtnHero');
    const btnHeroText = document.getElementById('subBtnHeroText');
    const btnHeroHint = document.getElementById('subBtnHeroHint');
    if (btnHero && btnHeroText) {
      if (isSubscribed) {
        btnHero.classList.add('hide');
      } else {
        btnHero.classList.remove('hide');
        btnHeroText.textContent = 'Get menu alerts';
        if (btnHeroHint) btnHeroHint.textContent = 'Free · specials & hours';
        btnHero.title = 'Get alerts for specials, hours, and menu updates';
      }
    }
  },

  /**
   * Show message to user
   */
  showMessage(message, type = 'info') {
    // Simple alert for now - can be enhanced with a toast notification
    if (type === 'error') {
      alert('Error: ' + message);
    } else if (type === 'success') {
      console.log('✅ ' + message);
      // Could show a toast notification here
    } else {
      console.log(message);
    }
  },

  /**
   * Toggle subscription (or re-register background push if it was lost)
   */
  toggle() {
    if (this.subscriptionId) {
      const pushManager =
        this.serviceWorkerRegistration && this.serviceWorkerRegistration.pushManager;
      if (pushManager) {
        pushManager
          .getSubscription()
          .then((pushSub) => {
            if (this.supportsBackgroundPush() && !pushSub) {
              return this.unsubscribe().then(() => this.subscribe());
            }
            return this.unsubscribe();
          })
          .catch(() => this.unsubscribe());
      } else {
        this.unsubscribe();
      }
    } else {
      this.subscribe();
    }
  },
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (resolveNotifyConfig().enabled) {
      NotificationService.init();
    }
  });
} else {
  if (resolveNotifyConfig().enabled) {
    NotificationService.init();
  }
}

window.addEventListener('auth:login', function () {
  if (!resolveNotifyConfig().enabled || !NotificationService.subscriptionId) return;
  if (!NotificationService.isCurrentUserAdmin()) return;
  NotificationService.relinkSubscriptionToAuthUser().catch(function (err) {
    console.warn('Could not relink push subscription to admin account:', err);
  });
});

// Export for global use
window.NotificationService = NotificationService;

// Toggle function for button onclick
function toggleNotificationSubscription() {
  NotificationService.toggle();
}

