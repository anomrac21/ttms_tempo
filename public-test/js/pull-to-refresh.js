/**
 * Pull-down to reload — PWA / standalone (menu) and client dashboard pages.
 * Dashboard uses soft refresh (reload data); menu pages use a full reload.
 */
(function () {
  'use strict';

  var THRESHOLD = 120;
  var MAX_VISUAL = 144;
  var HORIZONTAL_CANCEL_RATIO = 1.2;

  var DASHBOARD_ROOT_SELECTORS = [
    '.dashboard-control-room',
    '.dashboard-analytics-page',
    '.dashboard-notify-page',
    '.dashboard-edit-page',
    '.dashboard-settings-page',
  ].join(', ');

  var BLOCKED_SELECTORS = [
    '.menu-smash-pass-card',
    '.menu-reels-item-modal',
    '.menu-reels-item-modal__body',
    '.ads-reels-track',
    '#ads-reels-overlay',
    '.ads-reels-slide',
    '#dashboard',
    '.menu-image-upload-modal',
    '.expanded-item-details',
    '.single-page-content',
    '.menu-item-slideshow',
    '.expanded-image-carousel',
    '.location-picker',
    '.search-results',
    '.header-menublock-toggle',
    '.header-menublock-backdrop',
    '.main-header.menublock-dropdown-open .header-nav',
    '#menublock',
  ].join(', ');

  var startY = 0;
  var startX = 0;
  var tracking = false;
  var reloading = false;
  var lastPullPx = 0;
  var optsMove = { passive: false, capture: true };
  var optsEnd = { capture: true };

  function isStandaloneAppDisplay() {
    try {
      if (window.navigator.standalone === true) return true;
      if (window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
      if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
    } catch (e) {
      /* ignore */
    }
    return false;
  }

  function isDashboardPage() {
    return !!document.querySelector(DASHBOARD_ROOT_SELECTORS);
  }

  function isPullToRefreshEnabled() {
    return isStandaloneAppDisplay() || isDashboardPage();
  }

  function windowScrollTop() {
    return (
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0
    );
  }

  function menuReelsTrackScrollTop() {
    var track = document.getElementById('menu-reels-track');
    return track ? track.scrollTop : 0;
  }

  function isAtPageTop() {
    if (windowScrollTop() > 2) return false;
    if (menuReelsTrackScrollTop() > 2) return false;
    return true;
  }

  function isScrollableElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el === document.documentElement || el === document.body) return false;
    var style = window.getComputedStyle(el);
    var overflowY = style.overflowY;
    if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') {
      return false;
    }
    return el.scrollHeight > el.clientHeight + 1;
  }

  function hasScrolledAncestor(target) {
    var node = target;
    while (node && node !== document.documentElement) {
      if (isScrollableElement(node) && node.scrollTop > 2) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function isTouchOnBlockedTarget(target) {
    if (!target || !target.closest) return true;
    if (document.body.classList.contains('menublock-dropdown-open')) return true;
    if (document.body.classList.contains('menu-reels-item-modal-open')) return true;
    if (target.closest(BLOCKED_SELECTORS)) return true;
    return false;
  }

  function canUsePullToRefresh(target) {
    if (!isPullToRefreshEnabled()) return false;
    if (reloading) return false;
    if (document.body.classList.contains('menublock-dropdown-open')) return false;
    if (document.body.classList.contains('menu-reels-item-modal-open')) return false;
    if (!isAtPageTop()) return false;
    if (isTouchOnBlockedTarget(target)) return false;
    if (hasScrolledAncestor(target)) return false;
    return true;
  }

  function resetPullState() {
    tracking = false;
    lastPullPx = 0;
    window.TTMS_PTR_PULLING = false;
    hideIndicator();
    detachTouchListeners();
  }

  var indicator = null;
  function ensureIndicator() {
    if (indicator) return indicator;
    var el = document.createElement('div');
    el.id = 'ttms-ptr-indicator';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="ttms-ptr-inner"><span class="ttms-ptr-icon" aria-hidden="true">↓</span><span class="ttms-ptr-text">Pull to refresh</span></div>';
    document.body.appendChild(el);
    indicator = el;
    return el;
  }

  function injectStyles() {
    if (document.getElementById('ttms-ptr-styles')) return;
    var css =
      '#ttms-ptr-indicator{position:fixed;left:0;right:0;top:0;z-index:2147483000;' +
      'display:flex;justify-content:center;pointer-events:none;' +
      'transform:translateY(-100%);transition:opacity .15s ease;opacity:0;' +
      'font-family:system-ui,-apple-system,sans-serif;font-size:13px;}' +
      '#ttms-ptr-indicator.ttms-ptr-visible{opacity:1;}' +
      '.ttms-ptr-inner{margin-top:8px;padding:8px 14px;border-radius:999px;' +
      'background:rgba(0,0,0,.78);color:#fff;box-shadow:0 2px 12px rgba(0,0,0,.25);' +
      'display:flex;align-items:center;gap:8px;}' +
      '.ttms-ptr-icon{display:inline-block;transition:transform .12s ease;}' +
      '#ttms-ptr-indicator.ttms-ptr-ready .ttms-ptr-icon{transform:rotate(-180deg);}' +
      '#ttms-ptr-indicator.ttms-ptr-ready .ttms-ptr-text::after{content:" — release";}' +
      '#ttms-ptr-indicator.ttms-ptr-refreshing .ttms-ptr-icon{animation:ttms-ptr-spin .8s linear infinite;}' +
      '@keyframes ttms-ptr-spin{to{transform:rotate(360deg);}}';
    var s = document.createElement('style');
    s.id = 'ttms-ptr-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function setIndicatorPull(dy) {
    lastPullPx = dy;
    var el = ensureIndicator();
    var t = Math.min(dy / THRESHOLD, 1);
    var translate = -100 + t * 100;
    el.style.transform = 'translateY(' + Math.min(translate, 0) + '%)';
    el.classList.add('ttms-ptr-visible');
    el.classList.remove('ttms-ptr-refreshing');
    if (dy >= THRESHOLD) {
      el.classList.add('ttms-ptr-ready');
      el.setAttribute('aria-hidden', 'false');
    } else {
      el.classList.remove('ttms-ptr-ready');
      el.setAttribute('aria-hidden', 'true');
    }
  }

  function setIndicatorRefreshing(active) {
    var el = ensureIndicator();
    var text = el.querySelector('.ttms-ptr-text');
    if (active) {
      el.classList.add('ttms-ptr-visible', 'ttms-ptr-refreshing');
      el.classList.remove('ttms-ptr-ready');
      el.style.transform = 'translateY(0%)';
      el.setAttribute('aria-hidden', 'false');
      if (text) text.textContent = 'Refreshing…';
      return;
    }
    el.classList.remove('ttms-ptr-refreshing');
    if (text) text.textContent = 'Pull to refresh';
  }

  function hideIndicator() {
    if (!indicator) return;
    indicator.classList.remove('ttms-ptr-visible', 'ttms-ptr-ready', 'ttms-ptr-refreshing');
    indicator.style.transform = 'translateY(-100%)';
    indicator.setAttribute('aria-hidden', 'true');
    var text = indicator.querySelector('.ttms-ptr-text');
    if (text) text.textContent = 'Pull to refresh';
  }

  function detachTouchListeners() {
    document.removeEventListener('touchmove', onTouchMove, optsMove);
    document.removeEventListener('touchend', onTouchEnd, optsEnd);
    document.removeEventListener('touchcancel', onTouchEnd, optsEnd);
  }

  function cancelPullGesture() {
    resetPullState();
  }

  function runDashboardSoftRefresh() {
    var tasks = [];

    document.dispatchEvent(
      new CustomEvent('ttms:pull-refresh', { detail: { soft: true, dashboard: true } })
    );

    if (window.DashboardMenuStatus && typeof window.DashboardMenuStatus.refresh === 'function') {
      tasks.push(Promise.resolve(window.DashboardMenuStatus.refresh()));
    } else if (typeof window.__ttmsMenuStatusRefresh === 'function') {
      tasks.push(Promise.resolve(window.__ttmsMenuStatusRefresh()));
    }

    if (window.DashboardAnalyticsSnapshot) {
      if (document.getElementById('dashboardAnalyticsPage') && window.DashboardAnalyticsSnapshot.loadAnalyticsPage) {
        tasks.push(Promise.resolve(window.DashboardAnalyticsSnapshot.loadAnalyticsPage({ days: 30 })));
      } else if (window.DashboardAnalyticsSnapshot.loadDashboardCard) {
        tasks.push(Promise.resolve(window.DashboardAnalyticsSnapshot.loadDashboardCard({ days: 30 })));
      }
    }

    if (window.DashboardNotifications) {
      if (document.getElementById('dashboardNotificationsPage') && window.DashboardNotifications.refreshOverview) {
        tasks.push(Promise.resolve(window.DashboardNotifications.refreshOverview()));
      } else if (window.DashboardNotifications.loadDashboardCard) {
        tasks.push(Promise.resolve(window.DashboardNotifications.loadDashboardCard({ days: 30 })));
      }
    }

    return Promise.allSettled(tasks);
  }

  function performDashboardSoftRefresh() {
    if (reloading) return;
    reloading = true;
    setIndicatorRefreshing(true);

    runDashboardSoftRefresh()
      .catch(function () {
        /* ignore */
      })
      .then(function () {
        reloading = false;
        hideIndicator();
      });
  }

  function onTouchMove(e) {
    if (!tracking || reloading) return;

    if (!canUsePullToRefresh(e.target) || !isAtPageTop()) {
      cancelPullGesture();
      return;
    }

    var touch = e.touches[0];
    var dy = touch.clientY - startY;
    var dx = touch.clientX - startX;

    if (dy <= 0) {
      window.TTMS_PTR_PULLING = false;
      lastPullPx = 0;
      hideIndicator();
      return;
    }

    if (Math.abs(dx) > Math.abs(dy) * HORIZONTAL_CANCEL_RATIO) {
      cancelPullGesture();
      return;
    }

    var clamped = Math.min(dy, MAX_VISUAL);
    if (clamped > 8) {
      window.TTMS_PTR_PULLING = true;
      try {
        e.preventDefault();
        e.stopImmediatePropagation();
      } catch (err) {
        /* non-passive fallback */
      }
    }
    setIndicatorPull(clamped);
  }

  function onTouchEnd() {
    detachTouchListeners();
    window.TTMS_PTR_PULLING = false;

    if (!tracking || reloading) {
      resetPullState();
      return;
    }

    tracking = false;

    var shouldReload = lastPullPx >= THRESHOLD;
    lastPullPx = 0;

    if (shouldReload) {
      if (isDashboardPage()) {
        hideIndicator();
        performDashboardSoftRefresh();
        return;
      }
      reloading = true;
      hideIndicator();
      window.location.reload();
      return;
    }

    hideIndicator();
  }

  function onTouchStart(e) {
    if (reloading || tracking) return;
    if (!canUsePullToRefresh(e.target)) return;

    var t = e.touches[0];
    startY = t.clientY;
    startX = t.clientX;
    lastPullPx = 0;
    tracking = true;

    document.addEventListener('touchmove', onTouchMove, optsMove);
    document.addEventListener('touchend', onTouchEnd, optsEnd);
    document.addEventListener('touchcancel', onTouchEnd, optsEnd);
  }

  function registerLifecycle() {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(resetPullState);
    }
    document.addEventListener('ttms:page-enter', resetPullState);
    document.addEventListener('menuReelsFlattened', resetPullState);
  }

  function init() {
    if (!isPullToRefreshEnabled()) return;
    injectStyles();
    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: false });
    registerLifecycle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
