/**
 * TTMS Analytics Tracking Module
 * Integrates with Matomo for comprehensive event tracking
 */

class TTMSAnalytics {
  constructor() {
    this.enabled = false;
    this.sessionId = this.generateSessionId();
    this.pageLoadTime = Date.now();
    this.trackedAdImpressions = new Set();
    this.trackedAdClicks = new Set();
    this.matomoInitAttempts = 0;
    this.maxMatomoInitAttempts = 5;
    this.adImpressionRetries = 0;
    this.maxAdImpressionRetries = 4;
    this._trackingError = false;

    this.init();
  }

  /** Local / preview hosts: avoid noisy retries when Matomo snippet is absent. */
  isDevHost() {
    const h = typeof location !== 'undefined' && location.hostname ? location.hostname : '';
    return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local');
  }

  /**
   * Initialize analytics tracking
   */
  init() {
    if (typeof _paq !== 'undefined' && window.__ttmsMatomoReady) {
      this.enabled = true;
      console.log('🎯 TTMS Analytics initialized');

      this.setCustomDimensions();
      this.trackPageEngagement();
      this.observeAdImpressions();
      this.setupScrollTracking();
      return;
    }

    this.matomoInitAttempts++;
    if (this.matomoInitAttempts < this.maxMatomoInitAttempts) {
      if (!this.isDevHost() && this.matomoInitAttempts === 1) {
        console.warn('⚠️ Matomo not ready, waiting...');
      }
      setTimeout(() => this.init(), 500);
    } else if (!this.isDevHost()) {
      console.warn('⚠️ Matomo not available after retries; analytics disabled');
    }
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Set custom dimensions for better segmentation
   */
  setCustomDimensions() {
    if (!this.enabled) return;
    
    // Track session ID
    _paq.push(['setCustomVariable', 1, 'SessionID', this.sessionId, 'visit']);
    
    // Track device type
    const deviceType = this.getDeviceType();
    _paq.push(['setCustomVariable', 2, 'DeviceType', deviceType, 'visit']);
    
    // Track if PWA
    const isPWA = this.isPWA();
    _paq.push(['setCustomVariable', 3, 'IsPWA', isPWA ? 'Yes' : 'No', 'visit']);
    
    console.log('📊 Custom dimensions set:', { sessionId: this.sessionId, deviceType, isPWA });
  }

  /**
   * Get device type
   */
  getDeviceType() {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'Tablet';
    }
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
      return 'Mobile';
    }
    return 'Desktop';
  }

  /**
   * Check if running as PWA
   */
  isPWA() {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone === true;
  }

  /**
   * Track event in Matomo
   */
  trackEvent(category, action, name = null, value = null) {
    if (!this.enabled) {
      console.warn('Analytics not enabled');
      return;
    }

    const eventData = ['trackEvent', category, action];
    if (name) eventData.push(name);
    if (value !== null) eventData.push(value);

    _paq.push(eventData);
    console.log('📈 Event tracked:', { category, action, name, value });
  }

  /**
   * Track menu item view
   */
  trackMenuItemView(itemData) {
    const itemName = itemData.title || itemData.name || 'Unknown Item';
    const itemUrl = itemData.url || itemData.permalink || window.location.pathname;
    const category = itemData.category || 'Uncategorized';
    const price = itemData.price || 0;

    this.trackEvent('Menu', 'Item View', itemName, price);
    
    // Also track as content interaction
    _paq.push(['trackContentInteraction', 'view', 'menu-item', itemUrl, itemName]);
    
    console.log('👁️ Menu item view tracked:', { itemName, category, price });
  }

  /**
   * Track add to cart
   */
  trackAddToCart(itemData, quantity = 1, totalPrice = 0) {
    const itemName = itemData.title || itemData.name || 'Unknown Item';
    const basePrice = itemData.price || 0;
    const category = itemData.category || 'Uncategorized';

    // Track as event
    this.trackEvent('Cart', 'Add Item', itemName, totalPrice);
    
    // Track as ecommerce action (if using Matomo ecommerce)
    _paq.push(['addEcommerceItem',
      itemData.sku || itemData.id || itemName, // SKU
      itemName, // Product name
      category, // Category
      basePrice, // Price
      quantity // Quantity
    ]);
    
    _paq.push(['trackEcommerceCartUpdate', totalPrice]);
    
    console.log('🛒 Add to cart tracked:', { itemName, quantity, totalPrice, category });
  }

  /**
   * Track cart item removal
   */
  trackRemoveFromCart(itemData, totalCartValue = 0) {
    const itemName = itemData.title || itemData.name || 'Unknown Item';
    
    this.trackEvent('Cart', 'Remove Item', itemName);
    
    // Update cart value
    _paq.push(['trackEcommerceCartUpdate', totalCartValue]);
    
    console.log('🗑️ Remove from cart tracked:', { itemName, totalCartValue });
  }

  /**
   * Track order submission
   */
  trackOrderSubmission(orderData) {
    const {
      items = [],
      totalAmount = 0,
      orderMode = 'unknown',
      location = 'unknown',
      tableNumber = null
    } = orderData;

    // Track as event
    this.trackEvent('Order', 'Submit', orderMode, totalAmount);
    
    // Track as ecommerce order
    const orderId = 'order_' + Date.now();
    _paq.push(['trackEcommerceOrder',
      orderId, // Order ID
      totalAmount, // Grand total
      totalAmount, // Sub total
      0, // Tax
      0, // Shipping
      false // Discount
    ]);
    
    // Track additional order details
    _paq.push(['setCustomVariable', 4, 'OrderMode', orderMode, 'page']);
    _paq.push(['setCustomVariable', 5, 'OrderLocation', location, 'page']);
    if (tableNumber) {
      _paq.push(['setCustomVariable', 6, 'TableNumber', tableNumber, 'page']);
    }
    
    console.log('📦 Order tracked:', { orderId, totalAmount, orderMode, location, itemCount: items.length });
  }

  /**
   * Track location selection
   */
  trackLocationSelection(locationData) {
    const locationName = locationData.name || locationData.address || 'Unknown Location';
    const whatsapp = locationData.whatsapp || '';
    
    this.trackEvent('Location', 'Select', locationName);
    
    // Save for order tracking
    _paq.push(['setCustomVariable', 5, 'SelectedLocation', locationName, 'visit']);
    
    console.log('📍 Location selection tracked:', { locationName, whatsapp });
  }

  static AD_TRACKABLE_SELECTOR =
    '.ad-panel, .ads-reels-slide, [data-ad-id].ad-panel, [data-ad-id].ads-reels-slide, #menu-reels-sponsored-ads .ads-reels-slide';

  static GENERIC_AD_ALTS = new Set([
    '',
    'advertisement',
    'sponsored',
    'sponsored advertisement',
    'loading...',
  ]);

  static AD_CONTAINER_IDS = new Set([
    'frontpage-ad-sponsored',
    'frontpage-ads-container',
    'homepage-ads-container',
    'client-ads-container',
    'hero-ads',
    'pageadscontainer',
    'advertisements-section',
    'location-ads',
    'loaderAdContainer',
  ]);

  resolveAdTitleFromId(adId) {
    if (!adId) return '';
    if (window.AdsClient && typeof window.AdsClient.resolveAdMeta === 'function') {
      const meta = window.AdsClient.resolveAdMeta(adId);
      if (meta && meta.title) return meta.title;
    }
    try {
      const el = document.querySelector('[data-ad-id="' + String(adId).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]');
      if (el) {
        const title = el.getAttribute('data-ad-title');
        if (title && title.trim()) return title.trim();
      }
    } catch (_) { /* ignore invalid selector */ }
    return '';
  }

  /**
   * Track advertisement impression (view)
   */
  trackAdImpression(adData) {
    const adId = adData.id || adData.title || 'unknown-ad';
    
    // Only track each ad impression once per session
    if (this.trackedAdImpressions.has(adId)) {
      return;
    }
    
    this.trackedAdImpressions.add(adId);
    
    const adTitle =
      adData.title ||
      this.resolveAdTitleFromId(adData.id) ||
      'Unknown Ad';
    const adUrl = adData.url || adData.link || '';
    
    this.trackEvent('Advertisement', 'Impression', adTitle);
    
    // Track as content impression
    _paq.push(['trackContentImpression', 'advertisement', adTitle, adUrl]);
    
    console.log('👁️ Ad impression tracked:', { adId, adTitle, adUrl });
  }

  /**
   * Track advertisement click
   */
  trackAdClick(adData) {
    const adTitle =
      adData.title ||
      this.resolveAdTitleFromId(adData.id) ||
      'Unknown Ad';
    const adUrl = adData.url || adData.link || '';
    
    this.trackEvent('Advertisement', 'Click', adTitle);
    
    // Track as content interaction
    _paq.push(['trackContentInteraction', 'click', 'advertisement', adUrl, adTitle]);
    
    console.log('🖱️ Ad click tracked:', { adTitle, adUrl });
  }

  /**
   * Observe ad impressions using Intersection Observer
   */
  observeAdImpressions() {
    if (!this.enabled) return;
    setTimeout(() => {
      const adElements = document.querySelectorAll(TTMSAnalytics.AD_TRACKABLE_SELECTOR);

      if (adElements.length === 0) {
        if (this.isDevHost()) return;
        this.adImpressionRetries++;
        if (this.adImpressionRetries < this.maxAdImpressionRetries) {
          setTimeout(() => this.observeAdImpressions(), 2000);
        }
        return;
      }

      this.adImpressionRetries = 0;

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const adData = this.extractAdImpressionData(entry.target);
            if (!adData) return;

            this.trackAdImpression(adData);
            
            // Stop observing this ad
            observer.unobserve(adElement);
          }
        });
      }, {
        threshold: 0.5 // Track when 50% visible
      });
      
      adElements.forEach(ad => observer.observe(ad));
      
      console.log(`👀 Observing ${adElements.length} ads for impressions`);
    }, 1000);
  }

  resolveAdElement(element) {
    if (!element) return null;
    if (
      element.matches &&
      element.matches('.ad-panel, .ads-reels-slide, [data-ad-id]')
    ) {
      return element;
    }
    if (element.closest) {
      return element.closest('.ad-panel, .ads-reels-slide, [data-ad-id]');
    }
    return element;
  }

  isGenericAdAlt(text) {
    return TTMSAnalytics.GENERIC_AD_ALTS.has(String(text || '').trim().toLowerCase());
  }

  /**
   * Extract ad title from element
   */
  extractAdTitle(element) {
    const root = this.resolveAdElement(element) || element;
    if (!root) return 'Unknown Ad';

    const dataTitle = root.getAttribute('data-ad-title');
    if (dataTitle && dataTitle.trim()) return dataTitle.trim();

    const heading = root.querySelector('h1, h2, h3, .clientad-heading, .ads-reels-slide__title-row');
    if (heading) {
      const headingText = heading.textContent.trim();
      if (headingText) return headingText;
    }

    const link = root.querySelector('a[href]');
    if (link) {
      const linkText = link.textContent.trim();
      if (linkText && !this.isGenericAdAlt(linkText)) return linkText;
      if (link.getAttribute('aria-label')) return link.getAttribute('aria-label').trim();
    }

    const img = root.querySelector('img.ad-portrait, img.ad-portrait-bg, img[alt], video.ad-video');
    if (img) {
      const alt = (img.getAttribute('alt') || '').trim();
      if (alt && !this.isGenericAdAlt(alt)) return alt;
    }

    const adId = root.getAttribute('data-ad-id') || root.dataset?.adId;
    if (adId) {
      const resolved = this.resolveAdTitleFromId(adId);
      if (resolved) return resolved;
    }

    const elementId = root.id || '';
    if (elementId && !TTMSAnalytics.AD_CONTAINER_IDS.has(elementId)) {
      return elementId;
    }

    return 'Unknown Ad';
  }

  /**
   * Extract ad URL from element
   */
  extractAdUrl(element) {
    const root = this.resolveAdElement(element) || element;
    if (!root) return '';

    const dataUrl = root.getAttribute('data-ad-url') || root.getAttribute('data-ad-link');
    if (dataUrl) return dataUrl;

    const link = root.querySelector('a[href]');
    if (link && link.href && link.href !== '#') {
      return link.href;
    }

    const onclick = root.getAttribute('onclick');
    if (onclick) {
      const match = onclick.match(/window\.open\(['"]([^'"]+)['"]/);
      if (match) {
        return match[1];
      }
    }

    return '';
  }

  extractAdImpressionData(element) {
    const root = this.resolveAdElement(element);
    if (!root) return null;

    const id =
      root.getAttribute('data-ad-id') ||
      root.dataset?.adId ||
      root.id ||
      null;
    const title = this.extractAdTitle(root);
    const url = this.extractAdUrl(root);

    if (title === 'Unknown Ad' && !id) return null;

    return {
      id: id || title,
      title,
      url,
    };
  }

  /**
   * Track PWA installation
   */
  trackPWAInstall(outcome) {
    this.trackEvent('PWA', 'Install Prompt', outcome);
    console.log('📱 PWA install tracked:', outcome);
  }

  /**
   * Track search
   */
  trackSearch(searchTerm, resultsCount = 0) {
    _paq.push(['trackSiteSearch', searchTerm, false, resultsCount]);
    this.trackEvent('Search', 'Query', searchTerm, resultsCount);
    console.log('🔍 Search tracked:', { searchTerm, resultsCount });
  }

  /**
   * Track dashboard interaction
   */
  trackDashboardAction(action, details = '') {
    this.trackEvent('Dashboard', action, details);
    console.log('📊 Dashboard action tracked:', { action, details });
  }

  /**
   * Track scroll depth
   */
  setupScrollTracking() {
    if (this._scrollTrackingBound) return;
    this._scrollTrackingBound = true;
    this.trackedScrollDepths = this.trackedScrollDepths || new Set();

    const scrollDepths = [25, 50, 75, 100];
    const self = this;

    function trackContainerScroll(container, scopeKey) {
      const scrollTop =
        container === window ? window.scrollY : container.scrollTop;
      const scrollHeight =
        container === window
          ? document.documentElement.scrollHeight
          : container.scrollHeight;
      const clientHeight =
        container === window ? window.innerHeight : container.clientHeight;
      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll <= 0) return;

      const scrollPercent = (scrollTop / maxScroll) * 100;
      scrollDepths.forEach((depth) => {
        const key = scopeKey + ':' + depth;
        if (scrollPercent >= depth && !self.trackedScrollDepths.has(key)) {
          self.trackedScrollDepths.add(key);
          const label = scopeKey === 'page' ? `${depth}%` : `${scopeKey} ${depth}%`;
          self.trackEvent('Engagement', 'Scroll Depth', label);
        }
      });
    }

    window.addEventListener(
      'scroll',
      () => {
        trackContainerScroll(window, 'page');
      },
      { passive: true }
    );

    const bindReelsScroll = () => {
      const reelsTrack = document.getElementById('menu-reels-track');
      if (!reelsTrack || reelsTrack.dataset.ttmsScrollTracked === '1') return;
      reelsTrack.dataset.ttmsScrollTracked = '1';
      reelsTrack.addEventListener(
        'scroll',
        () => {
          trackContainerScroll(reelsTrack, 'Menu Reels');
        },
        { passive: true }
      );
    };

    bindReelsScroll();
    document.addEventListener('ttms:page-enter', bindReelsScroll);
    window.addEventListener('ttms:page-enter', bindReelsScroll);
  }

  /**
   * Track time on page
   */
  trackPageEngagement() {
    if (!this._beforeUnloadHandler) {
      this._beforeUnloadHandler = () => {
        const timeSpent = Math.round((Date.now() - this.pageLoadTime) / 1000);
        this.trackEvent('Engagement', 'Time on Page', document.title, timeSpent);
      };
      window.addEventListener('beforeunload', this._beforeUnloadHandler);
    }

    // Track heartbeat every 30 seconds (user is still engaged)
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.heartbeatInterval = setInterval(() => {
      if (typeof _paq !== 'undefined') {
        _paq.push(['ping']);
      }
    }, 30000);
  }

  /**
   * Re-run observers and track a virtual page view after Barba navigation.
   */
  onPageEnter() {
    this.pageLoadTime = Date.now();
    this.adImpressionRetries = 0;
    this.trackedAdImpressions.clear();
    this.trackedAdClicks.clear();
    this.trackedScrollDepths = new Set();

    if (typeof _paq !== 'undefined') {
      _paq.push(['setDocumentTitle', document.domain + '/' + document.title]);
      _paq.push(['setCustomUrl', window.location.href]);
      _paq.push(['trackPageView']);
    }

    if (this.enabled) {
      this.observeAdImpressions();
      this.trackPageEngagement();
    } else {
      this.init();
    }
  }

  /**
   * Track outbound link
   */
  trackOutboundLink(url, linkName = '') {
    _paq.push(['trackLink', url, 'link']);
    this.trackEvent('Navigation', 'Outbound Link', linkName || url);
    console.log('🔗 Outbound link tracked:', url);
  }

  /**
   * Track social media interaction
   */
  trackSocialInteraction(network, action, target = '') {
    this.trackEvent('Social', `${network} - ${action}`, target);
    console.log('📱 Social interaction tracked:', { network, action, target });
  }

  /**
   * Track custom goal
   */
  trackGoal(goalId, customRevenue = 0) {
    _paq.push(['trackGoal', goalId, customRevenue]);
    console.log('🎯 Goal tracked:', { goalId, customRevenue });
  }

  /**
   * Track error
   */
  trackError(errorMessage, errorLocation = '') {
    if (!this.enabled || this._trackingError) return;
    const msg = String(errorMessage || '');
    if (!msg || msg === 'Script error.' || msg === 'Script error') return;
    if (/analytics\.ttmenus\.com|matomo|piwik|Cache\.ts/i.test(String(errorLocation || ''))) return;

    this._trackingError = true;
    try {
      this.trackEvent('Error', errorLocation || 'JavaScript', msg);
      console.log('❌ Error tracked:', { errorMessage: msg, errorLocation });
    } finally {
      this._trackingError = false;
    }
  }
}

// Initialize when DOM is ready; wait for Matomo script load
window.__ttmsMatomoReady = false;
window.addEventListener('ttms:matomo-ready', function () {
  window.__ttmsMatomoReady = true;
  if (window.ttmsAnalytics) {
    window.ttmsAnalytics.matomoInitAttempts = 0;
    window.ttmsAnalytics.init();
  }
}, { once: true });

function initTTMSAnalytics() {
  if (!window.ttmsAnalytics) {
    window.ttmsAnalytics = new TTMSAnalytics();
    console.log('✅ TTMS Analytics ready');
  }
}

function registerBarbaAnalytics() {
  if (window.TTMSBarba) {
    window.TTMSBarba.register(function () {
      if (window.ttmsAnalytics && typeof window.ttmsAnalytics.onPageEnter === 'function') {
        window.ttmsAnalytics.onPageEnter();
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    initTTMSAnalytics();
    registerBarbaAnalytics();
  });
} else {
  initTTMSAnalytics();
  registerBarbaAnalytics();
}

// Global error tracking (ignore cross-origin / analytics noise)
window.addEventListener('error', (event) => {
  if (!window.ttmsAnalytics) return;
  window.ttmsAnalytics.trackError(event.message, (event.filename || '') + ':' + (event.lineno || 0));
});

// Export for use in other scripts
window.TTMSAnalytics = TTMSAnalytics;

