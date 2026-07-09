/**
 * Account panel for menu sites (hub-aligned UI, auth-service session).
 */
(function () {
  'use strict';

  function syncBodyAuthClasses(isAuthenticated) {
    document.body.classList.toggle('ttms-logged-in', !!isAuthenticated);
    document.body.classList.toggle('ttms-logged-out', !isAuthenticated);
  }

  function escapeHtmlFav(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function favoriteUrl(fav) {
    if (fav.url || fav.menu_url) {
      return fav.url || fav.menu_url;
    }
    var key = fav.item_key || '';
    if (key.indexOf('|') !== -1) {
      var path = key.split('|').slice(1).join('|');
      if (path) {
        return path.charAt(0) === '/' ? path : '/' + path;
      }
    }
    return '#';
  }

  function favoriteIdentity(fav) {
    var kind = String(fav.kind || 'dish').toLowerCase();
    var itemKey = fav.item_key || fav.menu_id || '';
    return { kind: kind, itemKey: String(itemKey) };
  }

  function showDashboardToast(message) {
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
    clearTimeout(showDashboardToast._t);
    showDashboardToast._t = setTimeout(function () {
      el.classList.remove('is-visible');
    }, 2600);
  }

  function renderFavoriteLink(fav) {
    var identity = favoriteIdentity(fav);
    if (!identity.itemKey) {
      return '';
    }
    var url = favoriteUrl(fav);
    var name = fav.title || fav.menu_name || fav.item_key || fav.menu_id || 'Saved item';
    var img = fav.image_url
      ? '<img src="' + escapeHtmlFav(fav.image_url) + '" alt="">'
      : '';
    return (
      '<div class="account-dashboard-favorites__row">' +
      '<a class="account-dashboard-btn account-dashboard-favorites__link" href="' +
      escapeHtmlFav(url) +
      '" onclick="if(typeof closeAll===\'function\')closeAll();"><span class="fav-item">' +
      img +
      '<span>' +
      escapeHtmlFav(name) +
      '</span></span></a>' +
      '<button type="button" class="account-dashboard-favorites__remove" ' +
      'data-favorite-kind="' +
      escapeHtmlFav(identity.kind) +
      '" data-favorite-key="' +
      escapeHtmlFav(identity.itemKey) +
      '" aria-label="Remove ' +
      escapeHtmlFav(name) +
      ' from favorites" title="Remove from favorites">' +
      '<span aria-hidden="true">×</span></button></div>'
    );
  }

  async function removeDashboardFavorite(btn) {
    if (!window.AuthClient || !AuthClient.isAuthenticated()) {
      return;
    }
    var kind = btn.getAttribute('data-favorite-kind') || 'dish';
    var itemKey = btn.getAttribute('data-favorite-key') || '';
    if (!itemKey) {
      return;
    }

    btn.disabled = true;
    btn.classList.add('is-busy');

    try {
      var result = await AuthClient.removeFavorite(kind, itemKey);
      if (!result.success) {
        showDashboardToast(result.error || 'Could not remove favorite.');
        return;
      }

      var row = btn.closest('.account-dashboard-favorites__row');
      if (row) {
        row.remove();
      }

      var container = document.getElementById('account-dashboard-favorites');
      var emptyEl = document.getElementById('account-dashboard-favorites-empty');
      if (container && !container.querySelector('.account-dashboard-favorites__row')) {
        container.innerHTML = '';
        if (emptyEl) {
          emptyEl.style.display = 'block';
          emptyEl.textContent =
            'No favorites yet. Tap ♡ on dishes while browsing menus.';
        }
      }

      if (window.TTMSMenuFavorites && typeof TTMSMenuFavorites.refresh === 'function') {
        TTMSMenuFavorites.refresh();
      }
      try {
        window.dispatchEvent(new CustomEvent('ttms:favorites-changed'));
      } catch (e) {}

      showDashboardToast('Removed from favorites.');
    } catch (err) {
      console.error('[ACCOUNT DASHBOARD] Remove favorite failed:', err);
      showDashboardToast('Could not remove favorite.');
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-busy');
    }
  }

  function bindFavoriteRemoveHandlers() {
    var container = document.getElementById('account-dashboard-favorites');
    if (!container || container._ttmsRemoveBound) {
      return;
    }
    container._ttmsRemoveBound = true;
    container.addEventListener('click', function (e) {
      var btn = e.target.closest('.account-dashboard-favorites__remove');
      if (!btn) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      removeDashboardFavorite(btn);
    });
  }

  function renderFavoriteGroup(label, items) {
    if (!items || !items.length) return '';
    return (
      '<div class="account-dashboard-favorites-group">' +
      '<h4 class="account-dashboard-favorites-group__title">' +
      escapeHtmlFav(label) +
      '</h4>' +
      '<div class="account-dashboard-favorites-group__items">' +
      items.map(renderFavoriteLink).join('') +
      '</div></div>'
    );
  }

  function updateAccountDashboardAuthState(isAuthenticated, userData) {
    syncBodyAuthClasses(isAuthenticated);

    var userInfoEl = document.getElementById('account-dashboard-user-info');
    var loginPromptEl = document.getElementById('account-dashboard-login-prompt');
    var logoutBtnEl = document.getElementById('account-dashboard-logout-btn');
    var headerPlaceholderTitleEl = document.getElementById(
      'account-dashboard-header-placeholder-title'
    );

    if (!userInfoEl || !loginPromptEl || !logoutBtnEl) {
      return;
    }

    if (isAuthenticated && userData) {
      userInfoEl.style.display = 'block';
      if (headerPlaceholderTitleEl) headerPlaceholderTitleEl.style.display = 'none';
      loginPromptEl.style.display = 'none';
      logoutBtnEl.style.display = 'block';

      var userDataSection = document.getElementById('account-dashboard-user-data');
      if (userDataSection) userDataSection.style.display = 'block';
      fetchAndDisplayUserData();

      var usernameEl = document.getElementById('account-dashboard-username');
      var emailEl = document.getElementById('account-dashboard-email');
      var displayName = userData.username || userData.email || 'User';
      var email = userData.email || '';
      if (usernameEl) {
        usernameEl.textContent = displayName;
      }
      if (emailEl) {
        emailEl.textContent = email;
        var showEmail = email && email !== displayName;
        emailEl.style.display = showEmail ? '' : 'none';
      }
    } else {
      userInfoEl.style.display = 'none';
      if (headerPlaceholderTitleEl) headerPlaceholderTitleEl.style.display = '';
      loginPromptEl.style.display = 'block';
      logoutBtnEl.style.display = 'none';
      var userDataSectionOff = document.getElementById('account-dashboard-user-data');
      if (userDataSectionOff) userDataSectionOff.style.display = 'none';
      var favContainer = document.getElementById('account-dashboard-favorites');
      if (favContainer) favContainer.innerHTML = '';
    }
  }

  async function fetchAndDisplayUserData() {
    if (!window.AuthClient || typeof AuthClient.getFavorites !== 'function') {
      return;
    }
    if (!AuthClient.isAuthenticated()) {
      return;
    }

    var container = document.getElementById('account-dashboard-favorites');
    var emptyEl = document.getElementById('account-dashboard-favorites-empty');
    if (!container) return;

    try {
      var result = await AuthClient.getFavorites();
      if (!result.success) {
        if (emptyEl) {
          emptyEl.style.display = 'block';
          emptyEl.textContent = 'Unable to load favorites.';
        }
        container.innerHTML = '';
        return;
      }

      var grouped = (result.data && result.data.grouped) || {};
      var venues = grouped.venues || [];
      var locations = grouped.locations || [];
      var dishes = grouped.dishes || [];
      var recipes = grouped.recipes || [];
      var total =
        venues.length + locations.length + dishes.length + recipes.length;

      if (total === 0) {
        var flat = (result.data && result.data.favorites) || [];
        flat.forEach(function (fav) {
          var kind = (fav.kind || 'venue').toLowerCase();
          if (kind === 'location') locations.push(fav);
          else if (kind === 'dish') dishes.push(fav);
          else if (kind === 'recipe') recipes.push(fav);
          else venues.push(fav);
        });
        total =
          venues.length + locations.length + dishes.length + recipes.length;
      }

      if (total === 0) {
        if (emptyEl) {
          emptyEl.style.display = 'block';
          emptyEl.textContent =
            'No favorites yet. Tap ♡ on dishes while browsing menus.';
        }
        container.innerHTML = '';
        return;
      }

      if (emptyEl) emptyEl.style.display = 'none';
      container.innerHTML =
        renderFavoriteGroup('Venues', venues) +
        renderFavoriteGroup('Locations', locations) +
        renderFavoriteGroup('Dishes', dishes) +
        renderFavoriteGroup('Recipes', recipes);
    } catch (err) {
      console.error('[ACCOUNT DASHBOARD] Error loading favorites:', err);
      if (emptyEl) {
        emptyEl.style.display = 'block';
        emptyEl.textContent = 'Unable to load favorites.';
      }
    }
  }

  async function fetchAndUpdateUserInfo(options) {
    options = options || {};
    if (fetchAndUpdateUserInfo._inFlight) {
      return fetchAndUpdateUserInfo._inFlight;
    }

    fetchAndUpdateUserInfo._inFlight = (async function () {
      var retries = 0;
      while (retries < 10) {
        if (
          document.getElementById('account-dashboard-user-info') &&
          document.getElementById('account-dashboard-login-prompt')
        ) {
          break;
        }
        retries++;
        await new Promise(function (r) {
          setTimeout(r, 100);
        });
      }

      if (!window.AuthClient || typeof AuthClient.whenReady !== 'function') {
        return;
      }

      await AuthClient.whenReady();

      if (options.syncSession && typeof AuthClient.syncHubSession === 'function') {
        var session = await AuthClient.syncHubSession();
        if (session.success && session.user) {
          updateAccountDashboardAuthState(true, session.user);
          return;
        }
      }

      var cachedUser = AuthClient.getCurrentUser();
      if (cachedUser && AuthClient.isAuthenticated()) {
        updateAccountDashboardAuthState(true, cachedUser);
        return;
      }

      if (options.syncSession && AuthClient.isAuthenticated()) {
        var profile = await AuthClient.getProfile();
        if (profile.success && profile.user) {
          updateAccountDashboardAuthState(true, profile.user);
          return;
        }
      }

      updateAccountDashboardAuthState(false, null);
    })();

    try {
      return await fetchAndUpdateUserInfo._inFlight;
    } finally {
      fetchAndUpdateUserInfo._inFlight = null;
    }
  }

  async function menuAccountLogout(e) {
    if (e) {
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
    }

    if (typeof window.closeCart === 'function') {
      window.closeCart();
    }

    if (window.AuthClient && typeof AuthClient.logout === 'function') {
      await AuthClient.logout();
    } else if (typeof updateAccountDashboardAuthState === 'function') {
      updateAccountDashboardAuthState(false, null);
    }
    closeAll();
  }

  function bindAccountSignupButton() {
    document.querySelectorAll('[data-account-signup]').forEach(function (btn) {
      if (btn._ttmsAccountSignupBound) return;
      btn._ttmsAccountSignupBound = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof closeAll === 'function') closeAll();
        if (window.AuthClient && typeof AuthClient.loginWithGoogle === 'function') {
          AuthClient.loginWithGoogle({
            action: 'signup',
            returnTo: window.location.href,
            acceptLegal: true,
          });
          return;
        }
        window.location.href = '/login/';
      });
    });
  }

  function bindAccountLogoutButton() {
    document.querySelectorAll('[data-account-logout]').forEach(function (btn) {
      if (btn._ttmsAccountLogoutBound) {
        return;
      }
      btn._ttmsAccountLogoutBound = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!window.confirm('Log out of TT Menus?')) {
          return;
        }
        var runLogout = function () {
          if (typeof window.menuAccountLogout === 'function') {
            window.menuAccountLogout();
          }
        };
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(runLogout);
        } else {
          setTimeout(runLogout, 0);
        }
      });
    });
  }

  function toggleAccountDashboard() {
    var panel = document.getElementById('account-dashboard');
    if (!panel) return;

    if (panel.classList.contains('loader-hide-right')) {
      if (typeof window.closeAllUiPanels === 'function') {
        window.closeAllUiPanels({ keepAccountDashboard: true, skipReelsModal: true });
      } else {
        if (typeof window.closeCart === 'function') {
          window.closeCart();
        }
        if (typeof window.closeDashboard === 'function') {
          window.closeDashboard();
        }
      }
      panel.classList.remove('loader-hide-right');
      document.body.classList.add('modal-open');
      document.body.classList.add('account-dashboard-open');
      setTimeout(function () {
        fetchAndUpdateUserInfo({ syncSession: true });
      }, 200);
    } else {
      closeAccountDashboard();
    }
  }

  function closeAccountDashboard() {
    var panel = document.getElementById('account-dashboard');
    if (panel) panel.classList.add('loader-hide-right');
    document.body.classList.remove('account-dashboard-open');
    var dash = document.getElementById('dashboard');
    var accountOpen =
      panel && !panel.classList.contains('loader-hide-right');
    var menuOpen = dash && !dash.classList.contains('loader-hide-left');
    if (!accountOpen && !menuOpen) {
      document.body.classList.remove('modal-open');
    }
  }

  function closeAll() {
    if (typeof window.closeAllUiPanels === 'function') {
      window.closeAllUiPanels();
      return;
    }
    if (typeof window.ensureMenuReelsItemModalClosed === 'function') {
      window.ensureMenuReelsItemModalClosed();
    }
    if (typeof window.closeDashboard === 'function') {
      window.closeDashboard();
    }
    if (typeof window.closeCart === 'function') {
      window.closeCart();
    }
    closeAccountDashboard();
    document.body.classList.remove('modal-open');
    document.body.classList.remove('account-dashboard-open');
  }

  window.updateAccountDashboardAuthState = updateAccountDashboardAuthState;
  window.fetchAndUpdateUserInfo = fetchAndUpdateUserInfo;
  window.fetchAndDisplayUserData = fetchAndDisplayUserData;
  window.toggleAccountDashboard = toggleAccountDashboard;
  window.closeAccountDashboard = closeAccountDashboard;
  window.closeAll = closeAll;
  window.menuAccountLogout = menuAccountLogout;
  window.syncBodyAuthClasses = syncBodyAuthClasses;

  var origToggleDashboard = window.toggleDashboard;
  function wrapToggleDashboard() {
    if (typeof window.toggleDashboard !== 'function') return;
    if (window.toggleDashboard.__ttmsAccountWrapped) return;

    origToggleDashboard = window.toggleDashboard;
    window.toggleDashboard = function () {
      closeAccountDashboard();
      return origToggleDashboard.apply(this, arguments);
    };
    window.toggleDashboard.__ttmsAccountWrapped = true;
  }

  wrapToggleDashboard();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wrapToggleDashboard);
  }
  if (window.TTMSBarba) {
    window.TTMSBarba.register(wrapToggleDashboard);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (window.TTMSBarba) window.TTMSBarba.register(wrapToggleDashboard);
    });
  }

  function scheduleRefresh() {
    fetchAndUpdateUserInfo();
  }

  function initAccountDashboardUi() {
    bindFavoriteRemoveHandlers();
    bindAccountLogoutButton();
    bindAccountSignupButton();
    scheduleRefresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAccountDashboardUi);
  } else {
    initAccountDashboardUi();
  }

  function registerBarbaAccountDashboard() {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(initAccountDashboardUi);
    }
  }

  if (window.TTMSBarba) {
    registerBarbaAccountDashboard();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerBarbaAccountDashboard);
  } else {
    registerBarbaAccountDashboard();
  }

  window.addEventListener('ttms:auth-ready', function () {
    fetchAndUpdateUserInfo();
  });
  document.addEventListener('auth:login', function () {
    fetchAndUpdateUserInfo({ syncSession: true });
  });
  document.addEventListener('auth:logout', function () {
    updateAccountDashboardAuthState(false, null);
  });
})();
