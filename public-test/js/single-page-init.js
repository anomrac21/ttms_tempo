/**
 * Single menu item page — (re)init after Barba transitions and first load.
 */
(function () {
  'use strict';

  function deferNonCritical(fn) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(fn, { timeout: 1200 });
    } else {
      setTimeout(fn, 1);
    }
  }

  function initSinglePageFeatures() {
    if (typeof window.closeAllPanelsBeforeNavigation === 'function') {
      window.closeAllPanelsBeforeNavigation();
    } else if (typeof window.ensureMenuReelsItemModalClosed === 'function') {
      window.ensureMenuReelsItemModalClosed();
    }

    if (!document.querySelector('.single-page-item-card')) {
      return;
    }

    if (typeof window.reinitSinglePagePrice === 'function') {
      window.reinitSinglePagePrice();
    }

    if (window.TTMSMenuFavorites && typeof window.TTMSMenuFavorites.init === 'function') {
      window.TTMSMenuFavorites.init();
    }

    deferNonCritical(function () {
      if (typeof window.initMenuImageIntegration === 'function') {
        window.initMenuImageIntegration();
      }

      if (typeof window.initMenuSmashPass === 'function') {
        window.initMenuSmashPass();
      }

      if (typeof window.trackMenuItemView === 'function') {
        var card = document.querySelector('.single-page-item-card');
        if (card) {
          var itemData =
            typeof window.extractMenuItemDataFromCard === 'function'
              ? window.extractMenuItemDataFromCard(card, window.location.pathname)
              : {
                  url: window.location.pathname,
                  title:
                    (card.querySelector('.menu-item-title-text') &&
                      card.querySelector('.menu-item-title-text').textContent.trim()) ||
                    (card.querySelector('.single-page-title') &&
                      card.querySelector('.single-page-title').textContent.trim()) ||
                    document.title,
                };
          window.trackMenuItemView(itemData, { force: true });
        }
      }
    });

    document.querySelectorAll('.single-page-item-card .js-share-btn').forEach(function (btn) {
      var titleEl = document.querySelector(
        '.single-page-item-card .menu-item-title-text, .single-page-item-card .single-page-title'
      );
      btn.dataset.shareUrl = window.location.href;
      if (titleEl && titleEl.textContent) {
        btn.dataset.shareTitle = titleEl.textContent.trim();
      }
    });
  }

  function register() {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(initSinglePageFeatures);
    }
  }

  window.initSinglePageFeatures = initSinglePageFeatures;

  document.addEventListener('ttms:page-enter', initSinglePageFeatures);

  register();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSinglePageFeatures);
  } else {
    initSinglePageFeatures();
  }
})();
