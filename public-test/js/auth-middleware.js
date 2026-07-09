/**
 * TTMenus Authentication Middleware
 * Protects pages that require authentication
 */

const AuthMiddleware = {
  /**
   * Protect current page - redirect to login if not authenticated
   */
  async protectPage(options = {}) {
    const {
      redirectUrl = '/login/',
      requireAdmin = false,
      onUnauthorized = null,
    } = options;

    if (typeof AuthClient.whenReady === 'function') {
      await AuthClient.whenReady();
    }

    if (!AuthClient.isAuthenticated()) {
      console.log('User not authenticated, redirecting to login');

      if (onUnauthorized && typeof onUnauthorized === 'function') {
        onUnauthorized();
      } else {
        sessionStorage.setItem('ttmenus_redirect_after_login', window.location.pathname);
        window.location.href = redirectUrl;
      }
      return false;
    }

    if (requireAdmin && !AuthClient.isAdmin()) {
      console.log('User is not admin, access denied');

      if (onUnauthorized && typeof onUnauthorized === 'function') {
        onUnauthorized();
      } else {
        try {
          sessionStorage.setItem(
            'ttmenus_auth_flash',
            JSON.stringify({
              type: 'error',
              message: 'You do not have permission to access this page.',
            })
          );
        } catch (e) { /* ignore */ }
        window.location.href = '/';
      }
      return false;
    }

    return true;
  },

  resolvePostLoginRedirect(options = {}) {
    const defaultGuestUrl = options.defaultGuestUrl || '/';
    const defaultAdminUrl = options.defaultAdminUrl || '/dashboard/';
    const saved = sessionStorage.getItem('ttmenus_redirect_after_login');
    sessionStorage.removeItem('ttmenus_redirect_after_login');

    const hasAdminSiteAccess =
      window.AuthClientAccess &&
      typeof window.AuthClientAccess.hasClientAccess === 'function' &&
      window.AuthClientAccess.hasClientAccess();

    if (saved) {
      const path = String(saved).split('?')[0] || saved;
      const wantsProtectedArea =
        path.indexOf('/dashboard') === 0 ||
        path.indexOf('/deployments') === 0 ||
        path.indexOf('/admin') === 0 ||
        path.indexOf('/login') === 0;
      if (wantsProtectedArea && !hasAdminSiteAccess) {
        return defaultGuestUrl;
      }
      return saved;
    }

    return hasAdminSiteAccess ? defaultAdminUrl : defaultGuestUrl;
  },

  redirectAfterLogin(defaultUrl = '/') {
    window.location.href = this.resolvePostLoginRedirect({ defaultGuestUrl: defaultUrl });
  },

  toggleAuthElements() {
    const isAuth = AuthClient.isAuthenticated();
    const isAdmin = AuthClient.isAdmin();

    document.querySelectorAll('[data-auth]').forEach((el) => {
      if (el.classList.contains('menu-favorite-btn')) {
        return;
      }
      const authType = el.getAttribute('data-auth');

      switch (authType) {
        case 'required':
          el.style.display = isAuth ? '' : 'none';
          break;
        case 'guest':
          el.style.display = isAuth ? 'none' : '';
          break;
        case 'admin':
          el.style.display = isAdmin ? '' : 'none';
          break;
        case 'admin-site':
          if (authType === 'admin-site' && el.classList.contains('menu-item-actions__option--edit')) {
            var showAdminSite =
              isAdmin &&
              window.AuthClientAccess &&
              typeof window.AuthClientAccess.hasClientAccess === 'function' &&
              window.AuthClientAccess.hasClientAccess();
            el.style.display = '';
            el.classList.toggle('is-auth-visible', showAdminSite);
            el.hidden = !showAdminSite;
            break;
          }
          el.style.display =
            isAdmin &&
            window.AuthClientAccess &&
            typeof window.AuthClientAccess.hasClientAccess === 'function' &&
            window.AuthClientAccess.hasClientAccess()
              ? ''
              : 'none';
          break;
      }
    });
  },

  setupLogoutButtons() {
    document.querySelectorAll('[data-logout]').forEach((btn) => {
      if (btn.dataset.logoutBound === '1') return;
      btn.dataset.logoutBound = '1';
      btn.addEventListener('click', async (e) => {
        e.preventDefault();

        await AuthClient.logout({ redirect: true, redirectUrl: '/' });
      });
    });
  },

  displayUserInfo() {
    const user = AuthClient.getCurrentUser();

    if (!user) return;

    document.querySelectorAll('[data-user-email]').forEach((el) => {
      el.textContent = user.email || '';
    });

    document.querySelectorAll('[data-user-name]').forEach((el) => {
      const name =
        user.first_name && user.last_name
          ? `${user.first_name} ${user.last_name}`
          : user.email;
      el.textContent = name;
    });

    document.querySelectorAll('[data-user-role]').forEach((el) => {
      const roles = AuthClient._normalizeRoles
        ? AuthClient._normalizeRoles(user.roles)
        : user.roles || [];
      el.textContent = roles.join(', ');
    });
  },

  updateSettingsLoginLink() {
    const loginEl = document.getElementById('settingsLoginOrDashboard');
    const accountEl = document.getElementById('settingsAccountLink');
    const hubAccount = 'https://www.ttmenus.com/account/';

    if (!loginEl && !accountEl) return;

    const isAuth = AuthClient.isAuthenticated();
    const hasAdminAccess =
      isAuth &&
      window.AuthClientAccess &&
      typeof window.AuthClientAccess.hasClientAccess === 'function' &&
      window.AuthClientAccess.hasClientAccess();

    function setLinkContent(el, iconClass, label) {
      if (!el) return;
      const labelEl = el.querySelector('.footer-settings-popover__btn-label');
      const iconEl = el.querySelector('.footer-settings-popover__btn-icon i');
      if (iconEl) {
        iconEl.className = 'fa ' + iconClass;
      }
      if (labelEl) {
        labelEl.textContent = label;
      }
    }

    if (accountEl) {
      accountEl.removeAttribute('data-barba');
      accountEl.removeAttribute('target');
      accountEl.removeAttribute('rel');

      if (hasAdminAccess) {
        accountEl.href = '/dashboard/';
        accountEl.setAttribute('data-barba', 'prevent');
        setLinkContent(accountEl, 'fa-th-large', 'Dashboard');
      } else {
        accountEl.href = hubAccount;
        accountEl.target = '_blank';
        accountEl.rel = 'noopener noreferrer';
        setLinkContent(accountEl, 'fa-user', 'My account');
      }
    }

    if (loginEl && !accountEl) {
      const labelEl = loginEl.querySelector('.footer-settings-popover__btn-label');
      const iconEl = loginEl.querySelector('.footer-settings-popover__btn-icon i');

      function setLegacyLinkContent(iconClass, label) {
        if (iconEl) {
          iconEl.className = 'fa ' + iconClass;
        } else {
          loginEl.innerHTML =
            '<span class="footer-settings-popover__btn-icon" aria-hidden="true"><i class="fa ' +
            iconClass +
            '"></i></span><span class="footer-settings-popover__btn-label">' +
            label +
            '</span>';
          return;
        }
        if (labelEl) {
          labelEl.textContent = label;
        }
      }

      loginEl.removeAttribute('target');
      loginEl.removeAttribute('rel');

      if (!isAuth) {
        loginEl.href = '/login/';
        loginEl.setAttribute('data-barba', 'prevent');
        setLegacyLinkContent('fa-user', 'Login');
        return;
      }

      if (hasAdminAccess) {
        loginEl.href = '/dashboard/';
        loginEl.setAttribute('data-barba', 'prevent');
        setLegacyLinkContent('fa-th-large', 'Dashboard');
      } else {
        loginEl.href = hubAccount;
        loginEl.removeAttribute('data-barba');
        loginEl.target = '_blank';
        loginEl.rel = 'noopener noreferrer';
        setLegacyLinkContent('fa-user', 'My account');
      }
    }
  },

  init() {
    this.toggleAuthElements();
    this.setupLogoutButtons();
    this.displayUserInfo();
    this.updateSettingsLoginLink();
    if (window.TTMSMenuFavorites && typeof window.TTMSMenuFavorites.refresh === 'function') {
      window.TTMSMenuFavorites.refresh();
    }
  },

  applyMenuAuthState() {
    if (!window.AuthClient) {
      return;
    }

    this.init();

    if (window.TTMSMenuItemActions && typeof window.TTMSMenuItemActions.refreshVisibility === 'function') {
      window.TTMSMenuItemActions.refreshVisibility();
    }

    if (typeof window.syncBodyAuthClasses === 'function') {
      window.syncBodyAuthClasses(AuthClient.isAuthenticated());
    }

    if (typeof window.fetchAndUpdateUserInfo === 'function') {
      window.fetchAndUpdateUserInfo();
    }

    document.querySelectorAll('.client-access-warning').forEach((el) => {
      el.remove();
    });
  },
};

var menuAuthBootstrapTimer = null;
var menuAuthBootstrapInFlight = null;
var lastMenuAuthBootstrapAt = 0;

async function bootstrapMenuAuth(source) {
  if (!window.AuthClient) {
    return;
  }

  if (menuAuthBootstrapInFlight) {
    return menuAuthBootstrapInFlight;
  }

  menuAuthBootstrapInFlight = (async function () {
    try {
      if (typeof AuthClient.refreshMenuSession === 'function') {
        await AuthClient.refreshMenuSession();
      } else if (typeof AuthClient.whenReady === 'function') {
        await AuthClient.whenReady();
      }
      AuthMiddleware.applyMenuAuthState();
    } catch (err) {
      console.error('[Auth] Menu bootstrap failed (' + (source || 'unknown') + '):', err);
      AuthMiddleware.applyMenuAuthState();
    } finally {
      menuAuthBootstrapInFlight = null;
      lastMenuAuthBootstrapAt = Date.now();
    }
  })();

  return menuAuthBootstrapInFlight;
}

function scheduleBootstrapMenuAuth(source) {
  var lowPriority = source === 'focus' || source === 'visible';
  if (lowPriority && Date.now() - lastMenuAuthBootstrapAt < 3000) {
    return;
  }

  if (menuAuthBootstrapTimer) {
    clearTimeout(menuAuthBootstrapTimer);
  }
  menuAuthBootstrapTimer = setTimeout(function () {
    menuAuthBootstrapTimer = null;
    bootstrapMenuAuth(source);
  }, lowPriority ? 250 : 80);
}

function runAuthMiddlewareInit() {
  AuthMiddleware.applyMenuAuthState();
}

window.addEventListener('ttms:auth-ready', runAuthMiddlewareInit);
if (window.AuthClient && AuthClient._readyPromise) {
  AuthClient._readyPromise.then(runAuthMiddlewareInit);
}

window.bootstrapMenuAuth = bootstrapMenuAuth;

if (window.TTMSBarba) {
  window.TTMSBarba.register(function () {
    scheduleBootstrapMenuAuth('barba');
  });
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(function () {
        scheduleBootstrapMenuAuth('barba');
      });
    }
  });
}

document.addEventListener('ttms:page-enter', function () {
  scheduleBootstrapMenuAuth('page-enter');
});

window.addEventListener('pageshow', function (event) {
  if (event.persisted) {
    scheduleBootstrapMenuAuth('pageshow');
  }
});

window.addEventListener('focus', function () {
  scheduleBootstrapMenuAuth('focus');
});

document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') {
    scheduleBootstrapMenuAuth('visible');
  }
});

window.addEventListener('storage', function (event) {
  if (event.key === 'ttmenus_user_profile') {
    scheduleBootstrapMenuAuth('storage');
  }
});

window.AuthMiddleware = AuthMiddleware;
