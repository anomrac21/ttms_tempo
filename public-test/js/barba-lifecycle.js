/**
 * Central Barba.js lifecycle coordinator for TTMS menu sites.
 * Registers page re-init callbacks and runs them after each transition.
 */
(function () {
  'use strict';

  var callbacks = [];
  var scheduled = null;
  var bound = false;
  var reinitInProgress = false;

  var FULL_PAGE_PATH_PREFIXES = [
    '/dashboard',
    '/login',
    '/edit-menu-colors',
    '/edit-menu-rearrange',
    '/edit-menu',
    '/analytics',
    '/notifications',
    '/menu-settings',
    '/admin',
  ];

  function shouldUseFullPageNavigation(href) {
    if (!href || href === '#') return false;
    if (typeof href !== 'string') return false;

    try {
      var url = new URL(href, window.location.href);
      if (/^(javascript:|mailto:|tel:)/i.test(url.href)) return true;
      if (url.origin !== window.location.origin) return true;

      var path = (url.pathname || '/').replace(/\/+$/, '') || '/';
      return FULL_PAGE_PATH_PREFIXES.some(function (prefix) {
        return path === prefix || path.indexOf(prefix + '/') === 0;
      });
    } catch (err) {
      return false;
    }
  }

  window.TTMSBarbaShouldPrevent = shouldUseFullPageNavigation;

  function runAfterTransition(source) {
    if (scheduled) {
      clearTimeout(scheduled);
    }

    scheduled = setTimeout(function () {
      scheduled = null;
      if (reinitInProgress) {
        return;
      }
      reinitInProgress = true;
      try {
        console.log('[TTMSBarba] Reinitializing page features (' + source + ')');

        callbacks.forEach(function (fn) {
          try {
            fn();
          } catch (err) {
            console.error('[TTMSBarba] Reinit callback failed:', err);
          }
        });

        document.dispatchEvent(new CustomEvent('ttms:page-enter', { detail: { source: source } }));
      } finally {
        reinitInProgress = false;
      }
    }, 100);
  }

  var afterEnterHookBound = false;

  /** Barba v2 uses hooks — it does not dispatch barba:afterEnter on document. */
  function ensureBarbaAfterEnterHook() {
    if (afterEnterHookBound) return;
    if (typeof window.barba === 'undefined' || !window.barba.hooks) return;
    if (typeof window.barba.hooks.afterEnter !== 'function') return;

    afterEnterHookBound = true;
    window.barba.hooks.afterEnter(function () {
      runAfterTransition('barba:hook:afterEnter');
    });
  }

  function bindBarbaEvents() {
    if (bound) {
      ensureBarbaAfterEnterHook();
      return;
    }
    bound = true;

    ensureBarbaAfterEnterHook();

    document.addEventListener('barba:afterEnter', function () {
      runAfterTransition('barba:event:afterEnter');
    });
  }

  function navigate(href) {
    if (!href || href === '#') return false;

    if (typeof window.forceClearNavigationUiState === 'function') {
      window.forceClearNavigationUiState();
    } else if (typeof window.closeAllPanelsBeforeNavigation === 'function') {
      window.closeAllPanelsBeforeNavigation();
    } else if (typeof window.ensureMenuReelsItemModalClosed === 'function') {
      window.ensureMenuReelsItemModalClosed();
    }

    try {
      var url = new URL(href, window.location.href);
      if (/^(javascript:|mailto:|tel:)/i.test(url.href)) return false;

      if (url.origin !== window.location.origin) {
        window.location.assign(url.href);
        return true;
      }

      if (shouldUseFullPageNavigation(url.href)) {
        window.location.assign(url.href);
        return true;
      }

      var target = url.pathname + url.search + url.hash;
      if (typeof window.barba !== 'undefined' && typeof window.barba.go === 'function') {
        window.barba.go(target);
        return true;
      }

      window.location.assign(url.href);
      return true;
    } catch (err) {
      window.location.assign(href);
      return true;
    }
  }

  window.TTMSBarba = {
    register: function (fn) {
      if (typeof fn === 'function' && callbacks.indexOf(fn) === -1) {
        callbacks.push(fn);
      }
    },
    runNow: function (source) {
      runAfterTransition(source || 'manual');
    },
    ensureHooks: ensureBarbaAfterEnterHook,
    navigate: navigate,
  };

  function bindFullPageNavGuard() {
    if (window._ttmsFullPageNavGuardBound) return;
    window._ttmsFullPageNavGuardBound = true;

    document.addEventListener(
      'click',
      function (e) {
        if (e.defaultPrevented || e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        var link = e.target && e.target.closest && e.target.closest('a[href]');
        if (!link || link.target === '_blank' || link.hasAttribute('download')) return;

        var href = link.getAttribute('href');
        if (!shouldUseFullPageNavigation(href)) return;

        e.preventDefault();
        if (typeof e.stopImmediatePropagation === 'function') {
          e.stopImmediatePropagation();
        }
        e.stopPropagation();

        if (typeof window.closeAllPanelsBeforeNavigation === 'function') {
          window.closeAllPanelsBeforeNavigation();
        } else if (typeof window.closeAll === 'function') {
          window.closeAll();
        }

        window.location.assign(new URL(href, window.location.href).href);
      },
      true
    );
  }

  bindFullPageNavGuard();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindBarbaEvents);
  } else {
    bindBarbaEvents();
  }

  ensureBarbaAfterEnterHook();
})();
