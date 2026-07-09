/**
 * Admin-only modal shell for the menu item / promotion editor (/edit-menu-colors/panel/?embed=panel).
 */
(function () {
  'use strict';

  var MODAL_ID = 'menu-item-edit-modal';
  var FRAME_ID = 'menuItemEditModalFrame';
  var DRAFT_BADGE_ID = 'menuItemEditModalDraftBadge';
  var LOADING_ID = 'menuItemEditModalLoading';
  var EDIT_EMBED_PATH = '/edit-menu-colors/panel/?embed=panel';
  var FOCUS_ITEM_KEY = 'editMenuFocusItemUrl';
  var FOCUS_SECTION_SLUG_KEY = 'editMenuFocusSectionSlug';
  var FOCUS_PROMO_CATALOG_KEY = 'editMenuFocusPromoCatalogIndex';
  var FOCUS_PROMO_ID_KEY = 'editMenuFocusPromoId';

  var currentMenuRoot = null;
  var currentContentPath = '';
  var modalLoadingFallbackTimer = null;

  function getModal() {
    return document.getElementById(MODAL_ID);
  }

  function getFrame() {
    return document.getElementById(FRAME_ID);
  }

  function getDraftBadge() {
    return document.getElementById(DRAFT_BADGE_ID);
  }

  function getLoadingEl() {
    return document.getElementById(LOADING_ID);
  }

  function setModalLoading(on, message) {
    var loadingEl = getLoadingEl();
    if (!loadingEl) return;
    loadingEl.hidden = !on;
    loadingEl.setAttribute('aria-hidden', on ? 'false' : 'true');
    loadingEl.setAttribute('aria-busy', on ? 'true' : 'false');
    if (message) {
      var label = loadingEl.querySelector('.menu-item-edit-modal__loading-label');
      if (label) label.textContent = message;
    }
    if (on) {
      if (modalLoadingFallbackTimer) clearTimeout(modalLoadingFallbackTimer);
      modalLoadingFallbackTimer = setTimeout(function () {
        setModalLoading(false);
      }, 20000);
    } else if (modalLoadingFallbackTimer) {
      clearTimeout(modalLoadingFallbackTimer);
      modalLoadingFallbackTimer = null;
    }
  }

  function hasAdminSiteAccess() {
    if (!window.AuthClient || !AuthClient.isAuthenticated() || !AuthClient.isAdmin()) {
      return false;
    }
    return (
      window.AuthClientAccess &&
      typeof AuthClientAccess.hasClientAccess === 'function' &&
      AuthClientAccess.hasClientAccess()
    );
  }

  function normalizeItemUrl(url) {
    var trimmed = String(url || '').trim();
    if (!trimmed) return '';
    if (trimmed.charAt(0) !== '/') trimmed = '/' + trimmed;
    return trimmed.replace(/\/+$/, '') + '/';
  }

  function editableElementForMenuRoot(menuRoot) {
    if (!menuRoot) return null;
    var kind = menuRoot.getAttribute('data-actions-kind') || 'menu-item';
    if (kind === 'promotion') {
      return menuRoot.closest('article.ads-reels-slide') || menuRoot;
    }
    if (kind === 'section-header') {
      return menuRoot.closest('.menu-header') || menuRoot;
    }
    return menuRoot.closest('.menu-item-card') || menuRoot;
  }

  function contentPathForMenuRoot(menuRoot) {
    var el = editableElementForMenuRoot(menuRoot);
    if (!el) return '';
    if (window.TTMSContentDrafts && typeof window.TTMSContentDrafts.contentPathForElement === 'function') {
      return window.TTMSContentDrafts.contentPathForElement(el) || '';
    }
    if (el.classList && el.classList.contains('menu-item-card')) {
      var itemUrl = el.getAttribute('data-item-url') || '';
      return itemUrl ? 'content' + itemUrl.replace(/\/$/, '') + '.md' : '';
    }
    if (el.classList && el.classList.contains('menu-header')) {
      var sectionSlug = el.getAttribute('data-section-slug') || '';
      return sectionSlug ? 'content/' + sectionSlug + '/_index.md' : '';
    }
    if (el.classList && el.classList.contains('ads-reels-slide')) {
      var promoSlug =
        window.TTMSContentDrafts && typeof window.TTMSContentDrafts.promotionSlugFromElement === 'function'
          ? window.TTMSContentDrafts.promotionSlugFromElement(el)
          : '';
      if (!promoSlug) {
        var adId = el.getAttribute('data-ad-id') || '';
        if (adId.indexOf('menu-ad-') === 0) {
          promoSlug = adId.replace(/^menu-ad-/, '').replace(/-\d+$/, '');
        }
      }
      return promoSlug ? 'content/promotions/' + promoSlug + '.md' : '';
    }
    return '';
  }

  function syncModalDraftBadge() {
    var badge = getDraftBadge();
    if (!badge) return;
    if (!hasAdminSiteAccess() || !currentContentPath) {
      badge.hidden = true;
      badge.classList.add('hidden');
      badge.removeAttribute('data-content-path');
      return;
    }
    var hasDraft =
      window.TTMSContentDrafts &&
      typeof window.TTMSContentDrafts.has === 'function' &&
      window.TTMSContentDrafts.has(currentContentPath);
    badge.hidden = !hasDraft;
    badge.classList.toggle('hidden', !hasDraft);
    badge.setAttribute('data-content-path', currentContentPath);
  }

  function refreshDraftBadgeState() {
    if (!hasAdminSiteAccess() || !currentMenuRoot) {
      syncModalDraftBadge();
      return;
    }
    currentContentPath = contentPathForMenuRoot(currentMenuRoot);
    if (window.TTMSContentDrafts && typeof window.TTMSContentDrafts.refresh === 'function') {
      window.TTMSContentDrafts.refresh().finally(syncModalDraftBadge);
      return;
    }
    syncModalDraftBadge();
  }

  function loadCmsDraftIntoFrame() {
    if (!currentContentPath) return;
    var frame = getFrame();
    var badge = getDraftBadge();
    if (!frame || !frame.contentWindow) return;
    if (badge) badge.classList.add('is-loading');
    try {
      frame.contentWindow.postMessage(
        {
          type: 'ttms:embed-panel-load-cms-draft',
          contentPath: currentContentPath,
        },
        window.location.origin
      );
    } catch (err) {
      /* ignore */
    }
    setTimeout(function () {
      if (badge) badge.classList.remove('is-loading');
    }, 1200);
  }

  function setModalTitle(menuRoot) {
    var modal = getModal();
    if (!modal) return;
    var titleEl = modal.querySelector('.menu-item-edit-modal__title');
    if (!titleEl) return;
    var kind = (menuRoot && menuRoot.getAttribute('data-actions-kind')) || 'menu-item';
    var label =
      (menuRoot && menuRoot.getAttribute('data-item-title')) ||
      (kind === 'promotion' ? 'Promotion' : kind === 'section-header' ? 'Section' : 'Menu item');
    if (kind === 'promotion') {
      titleEl.textContent = 'Edit promotion';
    } else if (kind === 'section-header') {
      titleEl.textContent = 'Edit section · ' + label;
    } else {
      titleEl.textContent = 'Edit ' + label;
    }
  }

  function storeFocusKeys(menuRoot) {
    if (!menuRoot) return;
    var kind = menuRoot.getAttribute('data-actions-kind') || 'menu-item';
    try {
      if (kind === 'promotion') {
        sessionStorage.removeItem(FOCUS_ITEM_KEY);
        sessionStorage.removeItem(FOCUS_SECTION_SLUG_KEY);
        var catalogIndex = menuRoot.getAttribute('data-promotion-catalog-index');
        var adId = menuRoot.getAttribute('data-ad-id') || '';
        var slide = menuRoot.closest('article.ads-reels-slide');
        if ((!catalogIndex || catalogIndex === '') && slide) {
          catalogIndex = slide.getAttribute('data-catalog-index') || '';
        }
        if (!adId && slide) {
          adId = slide.getAttribute('data-ad-id') || slide.id || '';
        }
        if (catalogIndex != null && catalogIndex !== '') {
          sessionStorage.setItem(FOCUS_PROMO_CATALOG_KEY, String(catalogIndex));
        } else {
          sessionStorage.removeItem(FOCUS_PROMO_CATALOG_KEY);
        }
        if (adId) sessionStorage.setItem(FOCUS_PROMO_ID_KEY, adId);
        else sessionStorage.removeItem(FOCUS_PROMO_ID_KEY);
        return;
      }

      if (kind === 'section-header') {
        sessionStorage.removeItem(FOCUS_PROMO_CATALOG_KEY);
        sessionStorage.removeItem(FOCUS_PROMO_ID_KEY);
        sessionStorage.removeItem(FOCUS_ITEM_KEY);
        var headerEl = menuRoot.closest('.menu-header');
        var sectionSlug =
          menuRoot.getAttribute('data-section-slug') ||
          (headerEl && headerEl.getAttribute('data-section-slug')) ||
          '';
        if (sectionSlug) sessionStorage.setItem(FOCUS_SECTION_SLUG_KEY, sectionSlug);
        else sessionStorage.removeItem(FOCUS_SECTION_SLUG_KEY);
        return;
      }

      sessionStorage.removeItem(FOCUS_PROMO_CATALOG_KEY);
      sessionStorage.removeItem(FOCUS_PROMO_ID_KEY);
      sessionStorage.removeItem(FOCUS_SECTION_SLUG_KEY);
      var itemUrl =
        normalizeItemUrl(menuRoot.getAttribute('data-item-url')) ||
        normalizeItemUrl(
          (menuRoot.closest('.menu-item-card') &&
            menuRoot.closest('.menu-item-card').getAttribute('data-item-url')) ||
            ''
        );
      if (itemUrl) sessionStorage.setItem(FOCUS_ITEM_KEY, itemUrl);
      else sessionStorage.removeItem(FOCUS_ITEM_KEY);
    } catch (err) {
      /* ignore */
    }
  }

  function open(menuRoot) {
    if (!hasAdminSiteAccess()) return false;
    var modal = getModal();
    var frame = getFrame();
    if (!modal || !frame) return false;

    currentMenuRoot = menuRoot;
    currentContentPath = contentPathForMenuRoot(menuRoot);

    storeFocusKeys(menuRoot);
    setModalTitle(menuRoot);
    refreshDraftBadgeState();
    setModalLoading(true, 'Loading editor…');

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-item-edit-modal-open');

    var embedSrc = EDIT_EMBED_PATH;
    if (frame.getAttribute('src') !== embedSrc) {
      frame.setAttribute('src', embedSrc);
    } else if (frame.contentWindow) {
      try {
        frame.contentWindow.location.reload();
      } catch (reloadErr) {
        frame.setAttribute('src', embedSrc);
      }
    }

    return true;
  }

  function close(opts) {
    opts = opts || {};
    var modal = getModal();
    var frame = getFrame();
    if (!modal) return;

    if (
      !opts.skipPersist &&
      frame &&
      frame.contentWindow &&
      frame.getAttribute('src') &&
      frame.getAttribute('src') !== 'about:blank'
    ) {
      try {
        frame.contentWindow.postMessage({ type: 'ttms:embed-panel-close-request' }, window.location.origin);
        return;
      } catch (err) {
        /* ignore */
      }
    }

    closeImmediately();
  }

  function closeImmediately(opts) {
    opts = opts || {};
    var modal = getModal();
    var frame = getFrame();
    if (!modal) return;

    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-item-edit-modal-open');
    setModalLoading(false);

    currentMenuRoot = null;
    currentContentPath = '';
    syncModalDraftBadge();

    if (frame) {
      frame.setAttribute('src', 'about:blank');
    }

    if (opts.reload) {
      if (window.TTMSContentDrafts && typeof window.TTMSContentDrafts.refresh === 'function') {
        window.TTMSContentDrafts.refresh();
      }
    }
  }

  function onDocumentClick(e) {
    if (e.target.closest('#' + DRAFT_BADGE_ID)) {
      e.preventDefault();
      loadCmsDraftIntoFrame();
      return;
    }
    if (e.target.closest('[data-close-menu-item-edit-modal]')) {
      e.preventDefault();
      close();
    }
  }

  function onDocumentKeydown(e) {
    if (e.key === 'Escape' && getModal() && !getModal().hidden) {
      close();
    }
  }

  function onMessage(event) {
    if (!event || event.data == null) return;
    var data = event.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (err) {
        return;
      }
    }
    if (!data || data.type !== 'ttms:close-menu-item-edit-modal') return;
    closeImmediately({ reload: data.reload });
  }

  function onEmbedCloseRequest(event) {
    if (!event || event.data == null) return;
    var data = event.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (err) {
        return;
      }
    }
    if (!data || data.type !== 'ttms:embed-panel-close-complete') return;
    closeImmediately({ reload: data.reload });
  }

  function onEmbedFormReady(event) {
    if (!event || event.data == null) return;
    var data = event.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (err) {
        return;
      }
    }
    if (!data || data.type !== 'ttms:embed-panel-form-ready') return;
    setModalLoading(false);
  }

  function onEmbedFrameLoad() {
    var frame = getFrame();
    if (!frame || frame.getAttribute('src') === 'about:blank') return;
    if (!getModal() || getModal().hidden) return;
    syncModalDraftBadge();
  }

  function init() {
    document.removeEventListener('click', onDocumentClick, true);
    document.addEventListener('click', onDocumentClick, true);
    document.removeEventListener('keydown', onDocumentKeydown, true);
    document.addEventListener('keydown', onDocumentKeydown, true);
    window.removeEventListener('message', onMessage);
    window.addEventListener('message', onMessage);
    window.removeEventListener('message', onEmbedCloseRequest);
    window.addEventListener('message', onEmbedCloseRequest);
    window.removeEventListener('message', onEmbedFormReady);
    window.addEventListener('message', onEmbedFormReady);
    window.removeEventListener('ttms:content-drafts-ready', syncModalDraftBadge);
    window.addEventListener('ttms:content-drafts-ready', syncModalDraftBadge);

    var frame = getFrame();
    if (frame) {
      frame.removeEventListener('load', onEmbedFrameLoad);
      frame.addEventListener('load', onEmbedFrameLoad);
    }

    if (window.AuthMiddleware && typeof AuthMiddleware.toggleAuthElements === 'function') {
      AuthMiddleware.toggleAuthElements();
    }
  }

  function start() {
    if (window.AuthClient && typeof AuthClient.whenReady === 'function') {
      AuthClient.whenReady().then(init);
      return;
    }
    init();
  }

  window.addEventListener('ttms:auth-ready', init);
  document.addEventListener('ttms:page-enter', init);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.TTMSMenuItemEditModal = {
    open: open,
    close: close,
    closeImmediately: closeImmediately,
    hasAccess: hasAdminSiteAccess,
    syncDraftBadge: syncModalDraftBadge,
  };
})();
