/**
 * iOS viewport height sync + scroll lock for modals/dashboards.
 * Watches body modal classes and locks page scroll so fixed overlays stay at the top.
 */
(function () {
  'use strict';

  var LOCK_CLASSES = [
    'cart-open',
    'modal-open',
    'table-modal-open',
    'menu-reels-item-modal-open',
    'ads-reels-open',
    'account-dashboard-open',
  ];

  var scrollY = 0;
  var locked = false;
  var viewportListenersBound = false;
  var viewportNotifyFrame = null;

  function syncViewportHeight() {
    var vv = window.visualViewport;
    var height = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty('--ttms-vvh', height + 'px');
    if (vv) {
      document.documentElement.style.setProperty('--ttms-vv-offset-top', vv.offsetTop + 'px');
    }
    if (viewportNotifyFrame) return;
    viewportNotifyFrame = requestAnimationFrame(function () {
      viewportNotifyFrame = null;
      try {
        window.dispatchEvent(new CustomEvent('ttms:viewport-change'));
      } catch (e) { /* ignore */ }
    });
  }

  function shouldLockScroll() {
    return LOCK_CLASSES.some(function (cls) {
      return document.body.classList.contains(cls);
    });
  }

  function applyScrollLock() {
    if (!document.body) return;

    var shouldLock = shouldLockScroll();
    if (shouldLock && !locked) {
      scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      document.body.classList.add('ttms-scroll-locked');
      document.body.style.top = '-' + scrollY + 'px';
      document.documentElement.classList.add('ttms-scroll-locked');
      locked = true;
      syncViewportHeight();
      return;
    }

    if (!shouldLock && locked) {
      document.body.classList.remove('ttms-scroll-locked');
      document.body.style.top = '';
      document.documentElement.classList.remove('ttms-scroll-locked');
      locked = false;
      window.scrollTo(0, scrollY);
    }
  }

  function bindViewportListeners() {
    if (viewportListenersBound) {
      syncViewportHeight();
      return;
    }
    viewportListenersBound = true;

    syncViewportHeight();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncViewportHeight);
      window.visualViewport.addEventListener('scroll', syncViewportHeight);
    }

    window.addEventListener('resize', syncViewportHeight);
    window.addEventListener('orientationchange', function () {
      window.setTimeout(syncViewportHeight, 120);
    });
  }

  function bindScrollLockObserver() {
    if (!document.body || typeof MutationObserver === 'undefined') return;
    if (document.body._ttmsScrollLockObserverBound) return;
    document.body._ttmsScrollLockObserverBound = true;

    new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].attributeName === 'class') {
          applyScrollLock();
          break;
        }
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    applyScrollLock();
  }

  /** Strip modal lock classes and release fixed-body scroll lock after navigation. */
  function forceClearScrollLock() {
    if (!document.body) return;

    LOCK_CLASSES.forEach(function (cls) {
      document.body.classList.remove(cls);
    });

    if (locked) {
      document.body.classList.remove('ttms-scroll-locked');
      document.body.style.top = '';
      document.documentElement.classList.remove('ttms-scroll-locked');
      locked = false;
      window.scrollTo(0, scrollY);
    } else {
      document.body.classList.remove('ttms-scroll-locked');
      document.body.style.top = '';
      document.documentElement.classList.remove('ttms-scroll-locked');
    }

    syncViewportHeight();
  }

  function init() {
    bindViewportListeners();
    bindScrollLockObserver();
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

  window.TTMSViewport = {
    sync: syncViewportHeight,
    refreshScrollLock: applyScrollLock,
    forceClearScrollLock: forceClearScrollLock,
  };
})();
