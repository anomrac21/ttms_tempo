/**
 * TTMS Analytics Integrations
 * Connects menu features with Matomo event tracking (ttmsAnalytics).
 */
(function () {
  'use strict';

  function waitForAnalytics(callback, attempts) {
    attempts = attempts || 0;
    if (window.ttmsAnalytics && window.ttmsAnalytics.enabled) {
      callback();
      return;
    }
    if (attempts > 120) return;
    setTimeout(function () {
      waitForAnalytics(callback, attempts + 1);
    }, 100);
  }

  function track(category, action, name, value) {
    if (window.ttmsAnalytics && window.ttmsAnalytics.enabled) {
      window.ttmsAnalytics.trackEvent(category, action, name, value);
    }
  }

  function extractMenuItemDataFromCard(element, url) {
    var card = element;
    if (card && card.classList && !card.classList.contains('menu-item-card')) {
      card = card.closest ? card.closest('.menu-item-card') : null;
    }
    if (!card) card = element;
    var itemUrl =
      url ||
      (card && card.getAttribute && card.getAttribute('data-item-url')) ||
      (card && card.getAttribute && card.getAttribute('data-favorite-url')) ||
      '';
    var title = '';
    if (card && card.querySelector) {
      var titleText = card.querySelector('.menu-item-title-text');
      var titleLink = card.querySelector('.menu-item-title a');
      var titleNode = card.querySelector('.menu-item-title, h3, .title, .single-page-title');
      if (titleText) title = titleText.textContent.trim();
      else if (titleLink) title = titleLink.textContent.trim();
      else if (titleNode) title = titleNode.textContent.trim();
    }
    var section = card && card.closest ? card.closest('section') : null;
    var category =
      (section && section.id) ||
      (card && card.getAttribute && card.getAttribute('data-favorite-section')) ||
      'Unknown Category';
    var priceEl =
      card && card.querySelector
        ? card.querySelector('.menu-item-price, .expanded-price, .single-page-price, .price, [class*="price"]')
        : null;
    var price = priceEl ? parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')) || 0 : 0;
    return { url: itemUrl, title: title, name: title, category: category, price: price };
  }

  var pendingMenuItemViews = [];
  var recentMenuItemViewKeys = {};

  window.extractMenuItemDataFromCard = extractMenuItemDataFromCard;

  function menuItemViewKey(itemData) {
    var d = itemData || {};
    return String(d.url || d.permalink || window.location.pathname || '') + '|' + String(d.title || d.name || '');
  }

  function flushPendingMenuItemViews() {
    if (!window.ttmsAnalytics || !window.ttmsAnalytics.enabled) return;
    while (pendingMenuItemViews.length) {
      window.ttmsAnalytics.trackMenuItemView(pendingMenuItemViews.shift());
    }
  }

  window.trackMenuItemView = function (itemData, options) {
    options = options || {};
    itemData = itemData || {};
    var key = menuItemViewKey(itemData);
    var now = Date.now();
    if (!options.force && recentMenuItemViewKeys[key] && now - recentMenuItemViewKeys[key] < 1800) {
      return;
    }
    recentMenuItemViewKeys[key] = now;

    if (window.ttmsAnalytics && window.ttmsAnalytics.enabled) {
      window.ttmsAnalytics.trackMenuItemView(itemData);
      return;
    }
    pendingMenuItemViews.push(itemData);
  };

  window.trackAddToCart = function (itemData, quantity, totalPrice) {
    if (window.ttmsAnalytics) {
      window.ttmsAnalytics.trackAddToCart(itemData, quantity, totalPrice);
    }
  };

  window.trackRemoveFromCart = function (itemData, totalCartValue) {
    if (window.ttmsAnalytics) {
      window.ttmsAnalytics.trackRemoveFromCart(itemData, totalCartValue);
    }
  };

  window.trackOrderSubmission = function (orderData) {
    if (window.ttmsAnalytics) {
      window.ttmsAnalytics.trackOrderSubmission(orderData);
    }
  };

  window.trackSearch = function (searchTerm, resultsCount) {
    if (window.ttmsAnalytics) {
      window.ttmsAnalytics.trackSearch(searchTerm, resultsCount);
    }
  };

  window.trackPaymentEvent = function (action, name, value) {
    track('Payment', action, name, value);
  };

  function wrapOnce(obj, methodName, beforeFn) {
    if (!obj || typeof obj[methodName] !== 'function') return false;
    var original = obj[methodName];
    if (original.__ttmsAnalyticsWrapped) return true;
    obj[methodName] = function () {
      try {
        beforeFn.apply(this, arguments);
      } catch (e) {
        console.warn('[analytics] hook error:', e);
      }
      return original.apply(this, arguments);
    };
    obj[methodName].__ttmsAnalyticsWrapped = true;
    obj[methodName].__ttmsAnalyticsOriginal = original;
    return true;
  }

  function trackMenuItemFromOpenItem(ele, options) {
    if (typeof options === 'string') {
      window.trackMenuItemView({ url: options, title: options });
      return;
    }
    if (options && typeof options === 'object') {
      window.trackMenuItemView({
        url: options.url || '',
        title: options.name || options.title || 'Unknown Item',
        category: options.category || 'Unknown Category',
        price: options.items && options.items[0] ? options.items[0].price : 0,
      });
      track('Order', 'Open Item Shop', options.name || options.title || 'Unknown Item');
      return;
    }
    window.trackMenuItemView(extractMenuItemDataFromCard(ele, ''));
  }

  function setupMenuItemTracking() {
    wrapOnce(window, 'openItem', function (ele, options) {
      trackMenuItemFromOpenItem(ele, options);
    });

    document.addEventListener('click', function (e) {
      var menuItem = e.target.closest('[onclick*="openItem"]');
      if (!menuItem || !window.ttmsAnalytics) return;
      var onclickAttr = menuItem.getAttribute('onclick');
      var urlMatch = onclickAttr && onclickAttr.match(/['"]([^'"]+)['"]/);
      if (urlMatch) {
        window.trackMenuItemView(extractMenuItemDataFromCard(menuItem, urlMatch[1]));
      }
    });
  }

  function setupSinglePageItemTracking() {
    function trackCurrentItemPage() {
      var card = document.querySelector('.single-page-item-card');
      if (!card) return;
      window.trackMenuItemView(
        extractMenuItemDataFromCard(card, window.location.pathname),
        { force: true }
      );
    }
    trackCurrentItemPage();
    document.addEventListener('ttms:page-enter', trackCurrentItemPage);
    window.addEventListener('ttms:page-enter', trackCurrentItemPage);
  }

  function setupMenuItemTrackingLate() {
    setupMenuItemTracking();
    flushPendingMenuItemViews();
  }

  function setupSearchTracking() {
    var searchTrackTimer = null;
    document.addEventListener(
      'input',
      function (e) {
        if (e.target.id !== 'searchbox') return;
        clearTimeout(searchTrackTimer);
        searchTrackTimer = setTimeout(function () {
          var term = e.target.value.trim();
          if (!term) return;
          var count = document.querySelectorAll(
            '.menu-item-card:not([hidden]):not(.menu-reels-slide[hidden])'
          ).length;
          window.trackSearch(term, count);
        }, 900);
      },
      true
    );
  }

  function setupAuthTracking() {
    window.addEventListener('auth:login', function () {
      track('Auth', 'Login', 'success');
    });
    window.addEventListener('auth:logout', function () {
      track('Auth', 'Logout');
    });
    document.addEventListener('ttms:auth-ready', function () {
      if (window.AuthClient && AuthClient.isAuthenticated && AuthClient.isAuthenticated()) {
        track('Auth', 'Session', 'restored');
      }
    });
  }

  function setupFavoritesTracking() {
    window.addEventListener('ttms:favorite-toggled', function (e) {
      var d = (e && e.detail) || {};
      track('Favorites', d.action || 'Toggle', d.title || d.item_key || '');
    });
    window.addEventListener('ttms:favorite-login-prompt', function () {
      track('Auth', 'Login Prompt', 'Favorites');
    });
  }

  function setupSmashPassTracking() {
    window.addEventListener('ttms:smash-vote', function (e) {
      var d = (e && e.detail) || {};
      track('SmashPass', d.vote === 'like' ? 'Like' : 'Pass', d.itemId || '', d.likeCount);
    });
  }

  function setupPaymentTracking() {
    if (!window.PaymentIntegration) return;
    wrapOnce(window.PaymentIntegration, 'startCheckout', function (context) {
      var amount = context && context.amount ? Number(context.amount) : 0;
      window.trackPaymentEvent('Checkout Start', 'order', amount);
    });
    wrapOnce(window.PaymentIntegration, 'isCurrentOrderPaid', function () {
      /* no-op — avoid noise */
    });
  }

  function setupWhatsAppModeTracking() {
    wrapOnce(window, 'selectMode', function (modeIndex) {
      track('Order', 'Select Mode', String(modeIndex));
    });
    wrapOnce(window, 'toggleDiningMode', function () {
      track('Order', 'Toggle Dining Mode');
    });
  }

  function setupAdClickTracking() {
    document.addEventListener('click', function (e) {
      var adElement = e.target.closest('.ad-panel, .ads-reels-slide, [data-ad-id]');
      if (!adElement || !window.ttmsAnalytics) return;
      var adData =
        window.ttmsAnalytics.extractAdImpressionData &&
        window.ttmsAnalytics.extractAdImpressionData(adElement);
      if (!adData || !adData.title || adData.title === 'Unknown Ad') return;
      window.ttmsAnalytics.trackAdClick(adData);
    });
  }

  function setupAdsBridge() {
    if (!window.AdsClient) return;
    wrapOnce(window.AdsClient, 'trackImpression', function (adId) {
      if (!window.ttmsAnalytics || !adId) return;
      var meta =
        window.AdsClient.resolveAdMeta &&
        window.AdsClient.resolveAdMeta(adId);
      window.ttmsAnalytics.trackAdImpression({
        id: adId,
        title: meta && (meta.title || meta.name),
        url: meta && (meta.url || meta.link),
      });
    });
    wrapOnce(window.AdsClient, 'trackClick', function (adId) {
      if (!window.ttmsAnalytics || !adId) return;
      var meta =
        window.AdsClient.resolveAdMeta &&
        window.AdsClient.resolveAdMeta(adId);
      window.ttmsAnalytics.trackAdClick({
        id: adId,
        title: meta && (meta.title || meta.name),
        url: meta && (meta.url || meta.link),
      });
    });
  }

  function setupLocationTracking() {
    function trackLocationDetail(detail) {
      if (!detail || !window.ttmsAnalytics) return;
      window.ttmsAnalytics.trackLocationSelection({
        name: detail.name || detail.address || '',
        address: detail.address || '',
        whatsapp: detail.whatsapp || '',
        lat: detail.lat,
        lng: detail.lng,
      });
    }

    window.addEventListener('ttms:location-selected', function (e) {
      trackLocationDetail((e && e.detail) || {});
    });

    var locationSelect = document.getElementById('locationSelect');
    if (!locationSelect) {
      setTimeout(setupLocationTracking, 1000);
      return;
    }
    locationSelect.addEventListener('change', function () {
      var selectedOption = this.options[this.selectedIndex];
      if (!selectedOption || !selectedOption.value || !window.ttmsAnalytics) return;
      trackLocationDetail({
        name: selectedOption.text,
        address: selectedOption.getAttribute('data-address') || '',
        whatsapp: selectedOption.value,
        lat: selectedOption.getAttribute('data-lat'),
        lng: selectedOption.getAttribute('data-lng'),
        source: 'dropdown',
      });
    });
  }

  function setupCartTracking() {
    wrapOnce(window, 'removeAllItems', function () {
      track('Cart', 'Clear', String((window.order && window.order.length) || 0));
    });
    wrapOnce(window, 'toggleCart', function () {
      var cart = document.getElementById('cart');
      var isOpen = cart && !cart.classList.contains('cart-hidden');
      track('Cart', isOpen ? 'Open' : 'Close');
    });
  }

  function setupShareTracking() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.js-share-btn');
      if (!btn) return;
      track(
        'Engagement',
        'Share',
        btn.dataset.shareTitle || document.title || '',
        btn.dataset.shareUrl || window.location.href
      );
    });
  }

  function setupTaxonomyTabTracking() {
    document.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-taxonomy-tab]');
      if (!tab) return;
      track('Navigation', 'Taxonomy Tab', tab.getAttribute('data-taxonomy-tab') || tab.textContent.trim());
    });
  }

  function setupSearchResultTracking() {
    document.addEventListener('click', function (e) {
      var card = e.target.closest('.menu-item-card');
      if (!card || card.hidden) return;
      var searchbox = document.getElementById('searchbox');
      if (!searchbox || !searchbox.value.trim()) return;
      var titleNode = card.querySelector('.menu-item-title-text, .menu-item-title a, h3');
      track('Search', 'Result Click', titleNode ? titleNode.textContent.trim() : '', searchbox.value.trim());
    });
  }

  function setupNotificationTracking() {
    if (!window.NotificationService) return;
    wrapOnce(window.NotificationService, 'subscribe', function () {
      track('Notification', 'Subscribe Attempt');
    });
    wrapOnce(window.NotificationService, 'unsubscribe', function () {
      track('Notification', 'Unsubscribe');
    });
  }

  function setupPullToRefreshTracking() {
    window.addEventListener('ttms:pull-refresh', function () {
      track('Engagement', 'Pull to Refresh');
    });
    document.addEventListener('ttms:pull-refresh', function () {
      track('Engagement', 'Pull to Refresh');
    });
  }

  function setupPWATracking() {
    window.addEventListener('beforeinstallprompt', function () {
      track('PWA', 'Install Prompt Shown');
    });
    window.addEventListener('appinstalled', function () {
      if (window.ttmsAnalytics) {
        window.ttmsAnalytics.trackPWAInstall('accepted');
        window.ttmsAnalytics.trackGoal(1);
      }
    });
    if (window.APP && typeof window.APP.startChromeInstall === 'function') {
      wrapOnce(window.APP, 'startChromeInstall', function () {
        if (window.APP.deferredInstall) {
          window.APP.deferredInstall.userChoice.then(function (choice) {
            if (window.ttmsAnalytics) window.ttmsAnalytics.trackPWAInstall(choice.outcome);
          });
        }
      });
    }
  }

  function setupDashboardTracking() {
    wrapOnce(window, 'toggleDashboard', function () {
      var dashboard = document.getElementById('dashboard');
      var isOpening = dashboard && dashboard.classList.contains('loader-hide-left');
      if (window.ttmsAnalytics) {
        window.ttmsAnalytics.trackDashboardAction(isOpening ? 'Open' : 'Close');
      }
    });
    wrapOnce(window, 'toggleAccountDashboard', function () {
      var panel = document.getElementById('account-dashboard');
      var isOpening = panel && !panel.classList.contains('loader-hide-right');
      track('Dashboard', 'Account ' + (isOpening ? 'Open' : 'Close'));
    });
    document.addEventListener('click', function (e) {
      var dashboardItem = e.target.closest('#dashboard li');
      if (dashboardItem && window.ttmsAnalytics) {
        window.ttmsAnalytics.trackDashboardAction('Menu Click', dashboardItem.textContent.trim());
      }
    });
  }

  function setupSocialMediaTracking() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a');
      if (!link || !link.href || !window.ttmsAnalytics) return;
      var url = link.href.toLowerCase();
      var network = null;
      if (url.indexOf('facebook.com') !== -1) network = 'Facebook';
      else if (url.indexOf('instagram.com') !== -1) network = 'Instagram';
      else if (url.indexOf('tiktok.com') !== -1) network = 'TikTok';
      else if (url.indexOf('youtube.com') !== -1) network = 'YouTube';
      else if (url.indexOf('twitter.com') !== -1 || url.indexOf('x.com') !== -1) network = 'Twitter';
      else if (url.indexOf('whatsapp.com') !== -1 || url.indexOf('wa.me') !== -1) network = 'WhatsApp';
      if (network) window.ttmsAnalytics.trackSocialInteraction(network, 'Click', link.href);
      if (link.hostname && link.hostname !== window.location.hostname) {
        window.ttmsAnalytics.trackOutboundLink(link.href, link.textContent.trim());
      }
    });
  }

  function setupBarbaTracking() {
    document.addEventListener('ttms:page-enter', function () {
      track('Navigation', 'Page Enter', document.title);
    });
  }

  function scheduleLateHooks() {
    [500, 2000, 5000, 10000].forEach(function (ms) {
      setTimeout(function () {
        setupMenuItemTrackingLate();
        setupWhatsAppModeTracking();
        setupPaymentTracking();
        setupCartTracking();
        setupNotificationTracking();
        setupAdsBridge();
      }, ms);
    });
  }

  function initIntegrations() {
    window.trackAddToCart =
      window.trackAddToCart ||
      function () {
        /* defined above */
      };
    setupMenuItemTrackingLate();
    setupSinglePageItemTracking();
    setupSearchTracking();
    setupAuthTracking();
    setupFavoritesTracking();
    setupSmashPassTracking();
    setupPaymentTracking();
    setupWhatsAppModeTracking();
    setupAdClickTracking();
    setupAdsBridge();
    setupLocationTracking();
    setupCartTracking();
    setupShareTracking();
    setupTaxonomyTabTracking();
    setupSearchResultTracking();
    setupNotificationTracking();
    setupPullToRefreshTracking();
    setupPWATracking();
    setupDashboardTracking();
    setupSocialMediaTracking();
    setupBarbaTracking();
    scheduleLateHooks();
  }

  window.addEventListener('adsPopulated', function () {
    if (window.ttmsAnalytics) window.ttmsAnalytics.observeAdImpressions();
  });

  window.addEventListener('ttms:matomo-ready', flushPendingMenuItemViews);

  waitForAnalytics(initIntegrations);
})();
