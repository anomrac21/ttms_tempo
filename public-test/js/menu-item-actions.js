/**
 * Menu item / promotion title-row actions (three-dot menu): Comment (inactive), Edit (admin-site).
 */
(function () {
  'use strict';

  var OPEN_CLASS = 'is-open';
  var FOCUS_ITEM_KEY = 'editMenuFocusItemUrl';
  var FOCUS_SECTION_SLUG_KEY = 'editMenuFocusSectionSlug';
  var FOCUS_PROMO_CATALOG_KEY = 'editMenuFocusPromoCatalogIndex';
  var FOCUS_PROMO_ID_KEY = 'editMenuFocusPromoId';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeItemUrl(url) {
    var trimmed = String(url || '').trim();
    if (!trimmed) return '';
    if (trimmed.charAt(0) !== '/') trimmed = '/' + trimmed;
    return trimmed.replace(/\/+$/, '') + '/';
  }

  function buildActionsMarkup(options) {
    var kind = (options && options.kind) || 'menu-item';
    var url = normalizeItemUrl(options && (options.url || options.RelPermalink));
    var title = (options && (options.linkTitle || options.name || options.title || options.Title)) || '';
    var catalogIndex =
      options && options.catalogIndex != null && options.catalogIndex !== ''
        ? String(options.catalogIndex)
        : '';
    var adId = (options && options.adId) || '';
    var sectionSlug =
      options && options.sectionSlug != null && options.sectionSlug !== ''
        ? String(options.sectionSlug)
        : '';
    var sectionAttrs =
      kind === 'section-header' && sectionSlug
        ? ' data-section-slug="' + escapeHtml(sectionSlug) + '"'
        : '';
    var promoAttrs =
      kind === 'promotion'
        ? ' data-promotion-catalog-index="' +
          escapeHtml(catalogIndex) +
          '" data-ad-id="' +
          escapeHtml(adId) +
          '"'
        : '';

    return (
      '<div class="menu-item-actions" data-menu-item-actions data-actions-kind="' +
      escapeHtml(kind) +
      '" data-item-url="' +
      escapeHtml(url) +
      '" data-item-title="' +
      escapeHtml(title) +
      '"' +
      sectionAttrs +
      promoAttrs +
      '>' +
      '<button type="button" class="menu-item-actions__trigger" aria-haspopup="menu" aria-expanded="false" aria-label="More options for ' +
      escapeHtml(title) +
      '" title="More options">' +
      '<i class="fa fa-ellipsis-v" aria-hidden="true"></i>' +
      '</button>' +
      '<div class="menu-item-actions__menu" role="menu" hidden>' +
      '<button type="button" class="menu-item-actions__option menu-item-actions__option--comment" role="menuitem" disabled aria-disabled="true">Comment</button>' +
      '<button type="button" class="menu-item-actions__option menu-item-actions__option--edit" role="menuitem" data-auth="admin-site" hidden>Edit</button>' +
      '</div></div>'
    );
  }

  function buildMarkup(item) {
    return buildActionsMarkup(item);
  }

  function buildPromotionHeaderMarkup(promo) {
    var title = (promo && (promo.title || promo.linkTitle || promo.name)) || '';
    var favoriteHtml =
      window.TTMSMenuFavorites && typeof window.TTMSMenuFavorites.buildPromoFavoriteMarkup === 'function'
        ? window.TTMSMenuFavorites.buildPromoFavoriteMarkup(promo)
        : '';
    return (
      '<div class="ads-reels-slide__title-row menu-item-title-row">' +
      favoriteHtml +
      '<h3 class="ads-reels-slide__title menu-item-title">' +
      '<span class="menu-item-title-text">' +
      escapeHtml(title) +
      '</span></h3>' +
      buildActionsMarkup({
        kind: 'promotion',
        url: promo && promo.url,
        title: title,
        catalogIndex: promo && promo.catalogIndex,
        adId: promo && promo.adId,
      }) +
      '</div>'
    );
  }

  function ensureMenuHeaderActions(root) {
    var scope = root || document;
    scope.querySelectorAll('.menu-header.menu-reels-slide, .menu-header.list-page-header').forEach(function (header) {
      if (header.querySelector('.menu-header__title-row')) return;
      var link = header.querySelector('.menu-header__link');
      var url = link ? link.getAttribute('href') || '' : '';
      var title = header.getAttribute('data-reel-section') || '';
      var sectionSlug = header.getAttribute('data-section-slug') || '';
      var image = header.getAttribute('data-images-primary') || '';
      var favHtml =
        window.TTMSMenuFavorites && typeof window.TTMSMenuFavorites.buildSectionFavoriteMarkup === 'function'
          ? window.TTMSMenuFavorites.buildSectionFavoriteMarkup({
              url: url,
              title: title,
              sectionSlug: sectionSlug,
              image: image,
            })
          : '';
      var wrap = document.createElement('div');
      wrap.innerHTML =
        '<div class="menu-header__title-row menu-item-title-row">' +
        favHtml +
        buildActionsMarkup({
          kind: 'section-header',
          url: url,
          title: title,
          sectionSlug: sectionSlug,
        }) +
        '</div>';
      var row = wrap.firstChild;
      var anchor = header.querySelector('.menu-anchor');
      if (anchor) {
        header.insertBefore(row, anchor.nextSibling);
      } else {
        header.insertBefore(row, header.firstChild);
      }
    });
  }

  function ensureAdsReelsSlideHeaders(root) {
    var scope = root || document;
    scope.querySelectorAll('article.ads-reels-slide:not(.menu-ad-scroll-end)').forEach(function (slide) {
      if (slide.closest('#ads-reels-overlay')) return;
      if (slide.querySelector('.ads-reels-slide__title-row')) return;
      var title = slide.getAttribute('data-ad-title') || '';
      if (!title) return;
      var image =
        window.TTMSMenuFavorites && typeof window.TTMSMenuFavorites.promoImagePathFromSlide === 'function'
          ? window.TTMSMenuFavorites.promoImagePathFromSlide(slide)
          : '';
      var wrap = document.createElement('div');
      wrap.innerHTML = buildPromotionHeaderMarkup({
        title: title,
        url: slide.getAttribute('data-ad-url') || '',
        promoUrl: slide.getAttribute('data-ad-url') || '',
        catalogIndex: slide.getAttribute('data-catalog-index') || '',
        adId: slide.getAttribute('data-ad-id') || slide.id || '',
        image: image,
      });
      slide.insertBefore(wrap.firstChild, slide.firstChild);
    });
  }

  function closeMenu(menuRoot) {
    if (!menuRoot) return;
    menuRoot.classList.remove(OPEN_CLASS);
    var trigger = menuRoot.querySelector('.menu-item-actions__trigger');
    var panel = menuRoot.querySelector('.menu-item-actions__menu');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (panel) panel.hidden = true;
  }

  function closeAllMenus(exceptRoot) {
    document.querySelectorAll('.menu-item-actions.' + OPEN_CLASS).forEach(function (root) {
      if (exceptRoot && root === exceptRoot) return;
      closeMenu(root);
    });
  }

  function openMenu(menuRoot) {
    if (!menuRoot) return;
    closeAllMenus(menuRoot);
    menuRoot.classList.add(OPEN_CLASS);
    var trigger = menuRoot.querySelector('.menu-item-actions__trigger');
    var panel = menuRoot.querySelector('.menu-item-actions__menu');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    if (panel) panel.hidden = false;
  }

  function toggleMenu(menuRoot) {
    if (!menuRoot) return;
    if (menuRoot.classList.contains(OPEN_CLASS)) {
      closeMenu(menuRoot);
      return;
    }
    openMenu(menuRoot);
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

  function refreshAuthVisibility() {
    if (window.AuthMiddleware && typeof AuthMiddleware.toggleAuthElements === 'function') {
      AuthMiddleware.toggleAuthElements();
    }
    syncActionsMenuVisibility();
  }

  function syncActionsMenuVisibility() {
    document.querySelectorAll('[data-menu-item-actions]').forEach(function (menu) {
      var editBtn = menu.querySelector('.menu-item-actions__option--edit');
      var trigger = menu.querySelector('.menu-item-actions__trigger');
      if (!trigger) return;
      var editVisible =
        editBtn &&
        hasAdminSiteAccess() &&
        !editBtn.hidden &&
        editBtn.classList.contains('is-auth-visible');
      menu.style.display = editVisible ? '' : 'none';
      trigger.style.display = editVisible ? '' : 'none';
    });
  }

  function onEditClick(menuRoot) {
    if (!hasAdminSiteAccess()) return;
    closeMenu(menuRoot);
    if (
      window.TTMSMenuItemEditModal &&
      typeof window.TTMSMenuItemEditModal.open === 'function' &&
      window.TTMSMenuItemEditModal.open(menuRoot)
    ) {
      return;
    }
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
        }
        if (adId) sessionStorage.setItem(FOCUS_PROMO_ID_KEY, adId);
      } else if (kind === 'section-header') {
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
      } else {
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
      }
    } catch (err) {
      /* ignore */
    }
    window.location.href = '/edit-menu-colors/panel/?embed=panel';
  }

  function onDocumentClick(e) {
    var trigger = e.target.closest('.menu-item-actions__trigger');
    if (trigger) {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu(trigger.closest('.menu-item-actions'));
      return;
    }

    var editBtn = e.target.closest('.menu-item-actions__option--edit');
    if (editBtn && !editBtn.disabled && !editBtn.hidden) {
      e.preventDefault();
      e.stopPropagation();
      onEditClick(editBtn.closest('.menu-item-actions'));
      return;
    }

    var commentBtn = e.target.closest('.menu-item-actions__option--comment');
    if (commentBtn) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (!e.target.closest('.menu-item-actions')) {
      closeAllMenus();
    }
  }

  function onDocumentKeydown(e) {
    if (e.key === 'Escape') closeAllMenus();
  }

  function bindDocumentHandlers() {
    document.removeEventListener('click', onDocumentClick, true);
    document.addEventListener('click', onDocumentClick, true);
    document.removeEventListener('keydown', onDocumentKeydown, true);
    document.addEventListener('keydown', onDocumentKeydown, true);
  }

  function init() {
    bindDocumentHandlers();
    ensureAdsReelsSlideHeaders(document);
    ensureMenuHeaderActions(document);
    refreshAuthVisibility();
    if (window.TTMSMenuFavorites && typeof window.TTMSMenuFavorites.refresh === 'function') {
      window.TTMSMenuFavorites.refresh();
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
  window.addEventListener('adsPopulated', init);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.TTMSMenuItemActions = {
    init: init,
    refreshVisibility: refreshAuthVisibility,
    buildMarkup: buildMarkup,
    buildPromotionHeaderMarkup: buildPromotionHeaderMarkup,
    ensureAdsReelsSlideHeaders: ensureAdsReelsSlideHeaders,
    ensureMenuHeaderActions: ensureMenuHeaderActions,
    closeAll: closeAllMenus,
  };

  function registerBarbaHook() {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(init);
    }
  }

  if (window.TTMSBarba) {
    registerBarbaHook();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerBarbaHook);
  } else {
    registerBarbaHook();
  }
})();
