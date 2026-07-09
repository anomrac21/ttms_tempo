/**
 * TTMenus Notification Client
 * Handles push notifications, WebSocket connections, and notification display
 */

const NotifyClient = {
  // Configuration (resolved lazily so Hugo config is always an object)
  get config() {
    var cfg = window.NOTIFY_CONFIG;
    if (typeof cfg === 'string') {
      try {
        cfg = JSON.parse(cfg);
      } catch (e) {
        cfg = null;
      }
    }
    if (cfg && typeof cfg === 'object') {
      window.NOTIFY_CONFIG = cfg;
    } else {
      cfg = {};
    }
    var apiUrl = cfg.apiUrl || 'https://notify.ttmenus.com/api/v1';
    var websocketUrl = cfg.websocketUrl || 'wss://notify.ttmenus.com/api/v1/ws/connect';
    if (window.TTMSNetworkGuard) {
      apiUrl =
        window.TTMSNetworkGuard.ttmsSanitizeRemoteUrl(
          apiUrl,
          window.TTMSNetworkGuard.DEFAULTS.notifyApiV1
        ) || window.TTMSNetworkGuard.DEFAULTS.notifyApiV1;
      websocketUrl =
        window.TTMSNetworkGuard.ttmsSanitizeRemoteUrl(
          websocketUrl,
          window.TTMSNetworkGuard.DEFAULTS.notifyWs
        ) || window.TTMSNetworkGuard.DEFAULTS.notifyWs;
    } else if (typeof window !== 'undefined' && window.location) {
      var h = window.location.hostname || '';
      var localDev = h === 'localhost' || h === '127.0.0.1' || /\.local$/i.test(h);
      if (!localDev && /localhost|127\.0\.0\.1/i.test(apiUrl + websocketUrl)) {
        apiUrl = 'https://notify.ttmenus.com/api/v1';
        websocketUrl = 'wss://notify.ttmenus.com/api/v1/ws/connect';
      }
    }
    return {
      apiUrl: apiUrl,
      websocketUrl: websocketUrl,
      clientDomain: cfg.clientDomain || window.location.hostname,
      enabled: cfg.enabled !== false,
    };
  },

  // State
  state: {
    ws: null,
    subscriptionId: null,
    isConnected: false,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    reconnectDelay: 3000,
    userId: null,
    platform: 'web',
  },

  /**
   * Initialize notification client
   */
  init() {
    if (!this.config.enabled) {
      console.log('Notification service is disabled');
      return;
    }

    console.log('Notification Client initialized');
    
    // Check if user is authenticated and subscribe
    this.checkAuthAndSubscribe();
    
    // Set up visibility change handler (reconnect when tab becomes visible)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this.state.isConnected) {
        this.connectWebSocket();
      }
    });
  },

  /**
   * Check authentication and subscribe user
   */
  async checkAuthAndSubscribe() {
    if (!window.AuthClient) {
      return;
    }
    try {
      if (typeof AuthClient.whenReady === 'function') {
        await AuthClient.whenReady();
      }
      if (!AuthClient.isAuthenticated()) {
        return;
      }
      var user =
        typeof AuthClient.getCurrentUser === 'function'
          ? AuthClient.getCurrentUser()
          : null;
      if (!user || user.id == null) {
        var profile = await AuthClient.getProfile();
        if (profile.success && profile.user) {
          user = profile.user;
        }
      }
      if (user && user.id != null) {
        this.state.userId = String(user.id);
        await this.subscribe({
          userId: this.state.userId,
          platform: this.state.platform,
        });
      }
    } catch (err) {
      console.warn('Notification subscribe skipped:', err);
    }
  },

  /**
   * Subscribe user to notifications
   */
  async subscribe({ userId, deviceToken, platform = 'web' }) {
    if (!this.config.enabled) {
      console.warn('Notification service is disabled');
      return null;
    }

    try {
      // For web, use WebSocket connection ID as device token
      const token = deviceToken || `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const response = await fetch(`${this.config.apiUrl}/subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_domain: this.config.clientDomain,
          user_id: userId,
          device_token: token,
          platform: platform,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to subscribe');
      }

      const subscription = await response.json();
      this.state.subscriptionId = subscription.id;
      this.state.userId = userId;
      this.state.platform = platform;

      console.log('User subscribed to notifications:', subscription.id);

      // Connect WebSocket for web platform
      if (platform === 'web') {
        this.connectWebSocket();
      }

      return subscription;
    } catch (error) {
      console.error('Failed to subscribe to notifications:', error);
      throw error;
    }
  },

  /**
   * Unsubscribe user from notifications
   */
  async unsubscribe() {
    if (!this.state.subscriptionId) {
      return;
    }

    try {
      await fetch(`${this.config.apiUrl}/subscriptions/${this.state.subscriptionId}`, {
        method: 'DELETE',
      });

      this.state.subscriptionId = null;
      this.disconnectWebSocket();
      console.log('User unsubscribed from notifications');
    } catch (error) {
      console.error('Failed to unsubscribe:', error);
    }
  },

  /**
   * Connect to WebSocket for real-time notifications
   */
  connectWebSocket() {
    if (!this.config.enabled || this.state.isConnected) {
      return;
    }

    if (!this.state.userId) {
      console.warn('Cannot connect WebSocket: user not authenticated');
      return;
    }

    try {
      const wsUrl = `${this.config.websocketUrl}?client_domain=${encodeURIComponent(this.config.clientDomain)}`;
      if (/^(wss?):\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(this.config.websocketUrl || '')) {
        var host = (window.location && window.location.hostname) || '';
        if (host !== 'localhost' && host !== '127.0.0.1' && !/\.local$/i.test(host)) {
          console.warn('Skipping notification WebSocket — loopback URL on public site');
          return;
        }
      }
      this.state.ws = new WebSocket(wsUrl);

      this.state.ws.onopen = () => {
        console.log('WebSocket connected');
        this.state.isConnected = true;
        this.state.reconnectAttempts = 0;
        this.dispatchEvent('websocket-connected');
      };

      this.state.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleWebSocketMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.state.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.dispatchEvent('websocket-error', { error });
      };

      this.state.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.state.isConnected = false;
        this.dispatchEvent('websocket-disconnected');
        this.attemptReconnect();
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      this.attemptReconnect();
    }
  },

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket() {
    if (this.state.ws) {
      this.state.ws.close();
      this.state.ws = null;
      this.state.isConnected = false;
    }
  },

  /**
   * Attempt to reconnect WebSocket
   */
  attemptReconnect() {
    if (this.state.reconnectAttempts >= this.state.maxReconnectAttempts) {
      console.warn('Max reconnection attempts reached');
      return;
    }

    this.state.reconnectAttempts++;
    const delay = this.state.reconnectDelay * this.state.reconnectAttempts;

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.state.reconnectAttempts})`);

    setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  },

  /**
   * Handle WebSocket messages
   */
  handleWebSocketMessage(message) {
    if (message.type === 'notification') {
      const notification = message.data;
      this.showNotification(notification);
      this.dispatchEvent('notification-received', notification);
    } else if (message.type === 'ping') {
      // Respond to ping
      if (this.state.ws && this.state.ws.readyState === WebSocket.OPEN) {
        this.state.ws.send(JSON.stringify({ type: 'pong' }));
      }
    }
  },

  /**
   * Send notification (admin only - requires JWT token)
   */
  async sendNotification(notification, token) {
    if (!token) {
      throw new Error('Authentication token required');
    }

    try {
      const response = await fetch(`${this.config.apiUrl}/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(notification),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send notification');
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to send notification:', error);
      throw error;
    }
  },

  /**
   * Display notification in UI
   */
  showNotification(notification) {
    const container = document.getElementById('notification-container');
    if (!container) {
      console.warn('Notification container not found');
      return;
    }

    const notificationEl = this.createNotificationElement(notification);
    container.appendChild(notificationEl);

    // Animate in
    requestAnimationFrame(() => {
      notificationEl.classList.add('show');
    });

    // Auto-remove after delay
    const duration = this.getNotificationDuration(notification.priority);
    setTimeout(() => {
      this.removeNotification(notificationEl);
    }, duration);
  },

  /**
   * Create notification DOM element
   */
  createNotificationElement(notification) {
    const el = document.createElement('div');
    el.className = 'notification';
    el.setAttribute('data-type', notification.type || 'general');
    el.setAttribute('data-priority', notification.priority || 'normal');

    const icon = this.getNotificationIcon(notification.type);
    const priorityClass = `priority-${notification.priority || 'normal'}`;

    el.innerHTML = `
      <div class="notification-content ${priorityClass}">
        <div class="notification-icon">${icon}</div>
        <div class="notification-body">
          <div class="notification-title">${this.escapeHtml(notification.title)}</div>
          <div class="notification-message">${this.escapeHtml(notification.message)}</div>
        </div>
        <button class="notification-close" aria-label="Close">&times;</button>
      </div>
    `;

    // Close button handler
    const closeBtn = el.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
      this.removeNotification(el);
    });

    // Click handler (optional - navigate or perform action)
    if (notification.data && notification.data.url) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        window.location.href = notification.data.url;
      });
    }

    return el;
  },

  /**
   * Remove notification from UI
   */
  removeNotification(element) {
    element.classList.add('hide');
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    }, 300);
  },

  /**
   * Get notification icon based on type
   */
  getNotificationIcon(type) {
    const icons = {
      menu_update: '🍽️',
      promotion: '🎉',
      order: '📦',
      system: '🔔',
      general: 'ℹ️',
    };
    return icons[type] || icons.general;
  },

  /**
   * Get notification display duration based on priority
   */
  getNotificationDuration(priority) {
    const durations = {
      urgent: 10000,
      high: 8000,
      normal: 5000,
      low: 3000,
    };
    return durations[priority] || durations.normal;
  },

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Dispatch custom events
   */
  dispatchEvent(eventName, detail = {}) {
    const event = new CustomEvent(eventName, { detail });
    document.dispatchEvent(event);
  },

  /**
   * Check if WebSocket is connected
   */
  isConnected() {
    return this.state.isConnected;
  },

  /**
   * Check if user is subscribed
   */
  isSubscribed() {
    return !!this.state.subscriptionId;
  },
};

// Auto-initialize if config is available
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (window.NOTIFY_CONFIG?.enabled) {
      NotifyClient.init();
    }
  });
} else {
  if (window.NOTIFY_CONFIG?.enabled) {
    NotifyClient.init();
  }
}

// Export for global access
window.NotifyClient = NotifyClient;


