/**
 * Menu dish & promotion favorites — auth-service /api/v1/me/favorites (requires params.auth.enabled + signed-in user).
 */
(function () {
  'use strict';

  var FAVORITE_KINDS = ['dish'];
  var PROMOTION_FAVORITE_KIND = 'promotion';
  var favoriteKeySets = {
    dish: new Set(),
    promotion: new Set(),
  };

  function authReady() {
    return window.AuthClient && typeof AuthClient.getFavorites === 'function';
  }

  function isLoggedIn() {
    return authReady() && AuthClient.isAuthenticated();
  }

  function clientId() {
    return (
      (typeof window.SITE_CLIENT_ID === 'string' && window.SITE_CLIENT_ID) ||
      (typeof window.CLIENT_ID === 'string' && window.CLIENT_ID) ||
      ''
    );
  }

  function keysForKind(kind) {
    var k = kind || 'dish';
    if (!favoriteKeySets[k]) favoriteKeySets[k] = new Set();
    return favoriteKeySets[k];
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function favoriteIconMarkup(kind) {
    var icons = window.TTMS_MENU_FAVORITE_ICONS;
    if (icons && icons[kind]) return icons[kind];
    return '';
  }

  function promoSlugFromAdId(adId) {
    return String(adId || '')
      .replace(/^menu-ad-/, '')
      .replace(/-\d+$/, '');
  }

  function promoImagePathFromSlide(slide) {
    if (!slide || !slide.querySelector) return '';
    var img = slide.querySelector('img.ad-portrait, img.ad-portrait-bg');
    if (!img) return '';
    var src = img.getAttribute('src') || '';
    return src.replace(/^https?:\/\/[^/]+/i, '').replace(/^\//, '');
  }

  function buildSectionFavoriteMarkup(section) {
    if (!window.AUTH_CONFIG) return '';
    var cid = clientId();
    var url = (section && section.url) || '';
    var path = String(url).replace(/^\//, '');
    if (!cid || !path) return '';
    var title = (section && (section.title || section.linkTitle)) || '';
    var sectionSlug = (section && section.sectionSlug) || '';
    var image = (section && section.image) || '';
    var itemKey = cid + '|' + path;
    return (
      '<button type="button" class="menu-favorite-btn"' +
      ' data-favorite-kind="dish"' +
      ' data-favorite-key="' +
      escapeHtml(itemKey) +
      '"' +
      ' data-favorite-title="' +
      escapeHtml(title) +
      '"' +
      ' data-favorite-url="' +
      escapeHtml(url) +
      '"' +
      ' data-favorite-image="' +
      escapeHtml(image) +
      '"' +
      ' data-favorite-section="' +
      escapeHtml(sectionSlug) +
      '"' +
      ' aria-pressed="false"' +
      ' aria-label="Save ' +
      escapeHtml(title) +
      ' to favorites"' +
      ' title="Save to favorites">' +
      '<span class="menu-favorite-btn__icon menu-favorite-btn__icon--outline" aria-hidden="true">' +
      favoriteIconMarkup('outline') +
      '</span>' +
      '<span class="menu-favorite-btn__icon menu-favorite-btn__icon--filled" aria-hidden="true">' +
      favoriteIconMarkup('filled') +
      '</span></button>'
    );
  }

  function buildPromoFavoriteMarkup(promo) {
    if (!window.AUTH_CONFIG) return '';
    var cid = clientId();
    var adId = (promo && promo.adId) || '';
    var slug = promoSlugFromAdId(adId);
    if (!cid || !slug) return '';
    var title = (promo && (promo.title || promo.linkTitle || promo.name)) || '';
    var promoUrl =
      (promo && promo.promoUrl) ||
      (slug ? '/promotions/' + slug + '/' : promo && promo.url) ||
      '';
    var image = (promo && promo.image) || '';
    var itemKey = cid + '|promotions/' + slug;
    return (
      '<button type="button" class="menu-favorite-btn"' +
      ' data-favorite-kind="promotion"' +
      ' data-favorite-key="' +
      escapeHtml(itemKey) +
      '"' +
      ' data-favorite-title="' +
      escapeHtml(title) +
      '"' +
      ' data-favorite-url="' +
      escapeHtml(promoUrl) +
      '"' +
      ' data-favorite-image="' +
      escapeHtml(image) +
      '"' +
      ' data-favorite-section="promotions"' +
      ' aria-pressed="false"' +
      ' aria-label="Save ' +
      escapeHtml(title) +
      ' to favorites"' +
      ' title="Save to favorites">' +
      '<span class="menu-favorite-btn__icon menu-favorite-btn__icon--outline" aria-hidden="true">' +
      favoriteIconMarkup('outline') +
      '</span>' +
      '<span class="menu-favorite-btn__icon menu-favorite-btn__icon--filled" aria-hidden="true">' +
      favoriteIconMarkup('filled') +
      '</span></button>'
    );
  }

  function showToast(message) {
    var el = document.getElementById('menu-favorites-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'menu-favorites-toast';
      el.className = 'menu-favorites-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      el.classList.remove('is-visible');
    }, 2600);
  }

  function promptLoginForFavorites() {
    showToast('Create an account and log in to save favorites.');
    if (typeof window.confirm !== 'function') {
      return;
    }
    var goLogin = window.confirm(
      'You need a TT Menus account to save favorites.\n\nWould you like to go to the login page?'
    );
    if (!goLogin) {
      return;
    }
    window.dispatchEvent(new CustomEvent('ttms:favorite-login-prompt'));
    try {
      sessionStorage.setItem('ttmenus_redirect_after_login', window.location.pathname);
    } catch (err) {
      /* ignore */
    }
    window.location.href = '/login/';
  }

  function setButtonState(btn, favorited) {
    btn.classList.toggle('is-favorited', !!favorited);
    btn.setAttribute('aria-pressed', favorited ? 'true' : 'false');
    btn.setAttribute(
      'aria-label',
      favorited ? 'Remove from favorites' : 'Save to favorites'
    );
    btn.title = favorited ? 'Remove from favorites' : 'Save to favorites';
  }

  async function refreshFavoriteStates() {
    FAVORITE_KINDS.forEach(function (kind) {
      favoriteKeySets[kind] = new Set();
    });

    if (!isLoggedIn()) {
      document.querySelectorAll('.menu-favorite-btn').forEach(function (btn) {
        setButtonState(btn, false);
      });
      return;
    }

    for (var i = 0; i < FAVORITE_KINDS.length; i++) {
      var kind = FAVORITE_KINDS[i];
      var result = await AuthClient.getFavorites(kind);
      if (result.success && result.data && Array.isArray(result.data.favorites)) {
        result.data.favorites.forEach(function (f) {
          if (f && f.item_key) {
            keysForKind(kind).add(String(f.item_key));
          }
        });
      }
    }

    document.querySelectorAll('.menu-favorite-btn').forEach(function (btn) {
      var kind = btn.getAttribute('data-favorite-kind') || 'dish';
      var key = btn.getAttribute('data-favorite-key') || '';
      setButtonState(btn, keysForKind(kind).has(key));
    });
  }

  async function toggleFavorite(btn) {
    var kind = btn.getAttribute('data-favorite-kind') || 'dish';
    var itemKey = btn.getAttribute('data-favorite-key') || '';
    if (!itemKey) {
      return;
    }

    var keys = keysForKind(kind);
    var favorited = keys.has(itemKey);
    btn.classList.add('is-busy');

    var result;
    if (favorited) {
      result = await AuthClient.removeFavorite(kind, itemKey);
    } else {
      var imagePath = btn.getAttribute('data-favorite-image') || '';
      var imageUrl = imagePath
        ? new URL('/' + String(imagePath).replace(/^\//, ''), window.location.origin).href
        : '';
      result = await AuthClient.addFavorite({
        kind: kind,
        item_key: itemKey,
        title: btn.getAttribute('data-favorite-title') || '',
        url: btn.getAttribute('data-favorite-url') || '',
        image_url: imageUrl,
        meta: {
          client_id: clientId(),
          section: btn.getAttribute('data-favorite-section') || '',
          menu_url: window.location.origin + '/',
        },
      });
    }

    btn.classList.remove('is-busy');

    if (!result.success) {
      showToast(result.error || 'Could not update favorite.');
      return;
    }

    if (favorited) {
      keys.delete(itemKey);
    } else {
      keys.add(itemKey);
    }
    var nowFavorited = keys.has(itemKey);
    document.querySelectorAll('.menu-favorite-btn').forEach(function (b) {
      if (
        (b.getAttribute('data-favorite-kind') || 'dish') === kind &&
        (b.getAttribute('data-favorite-key') || '') === itemKey
      ) {
        setButtonState(b, nowFavorited);
      }
    });

    if (favorited) {
      showToast('Removed from favorites.');
      window.dispatchEvent(new CustomEvent('ttms:favorite-toggled', {
        detail: {
          action: 'Remove',
          item_key: itemKey,
          title: btn.getAttribute('data-favorite-title') || ''
        }
      }));
    } else {
      showToast('Saved to favorites.');
      window.dispatchEvent(new CustomEvent('ttms:favorite-toggled', {
        detail: {
          action: 'Add',
          item_key: itemKey,
          title: btn.getAttribute('data-favorite-title') || ''
        }
      }));
    }
  }

  function onFavoriteClick(e) {
    var btn = e.target.closest('.menu-favorite-btn');
    if (!btn) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn()) {
      promptLoginForFavorites();
      return;
    }
    toggleFavorite(btn);
  }

  function bindButtons() {
    document.removeEventListener('click', onFavoriteClick, true);
    document.addEventListener('click', onFavoriteClick, true);
  }

  function init() {
    bindButtons();
    if (authReady()) {
      refreshFavoriteStates();
    } else {
      document.querySelectorAll('.menu-favorite-btn').forEach(function (btn) {
        setButtonState(btn, false);
      });
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
  window.addEventListener('ttms:favorites-changed', refreshFavoriteStates);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.addEventListener('storage', function (e) {
    if (
      e.key === 'auth_token' ||
      e.key === 'ttmenus_access_token' ||
      e.key === 'user_data' ||
      e.key === 'ttmenus_user'
    ) {
      refreshFavoriteStates();
    }
  });

  window.TTMSMenuFavorites = {
    init: init,
    refresh: refreshFavoriteStates,
    buildSectionFavoriteMarkup: buildSectionFavoriteMarkup,
    buildPromoFavoriteMarkup: buildPromoFavoriteMarkup,
    promoImagePathFromSlide: promoImagePathFromSlide,
  };

  function registerBarbaFavorites() {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(init);
    }
  }

  if (window.TTMSBarba) {
    registerBarbaFavorites();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerBarbaFavorites);
  } else {
    registerBarbaFavorites();
  }
})();
