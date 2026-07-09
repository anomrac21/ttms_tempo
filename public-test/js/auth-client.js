/**
 * TTMenus Authentication Client — Hub SSO
 *
 * Cross-subdomain SSO via HttpOnly cookies on .ttmenus.com:
 * - Access token: in-memory only (never localStorage)
 * - Refresh token: HttpOnly cookie only (never JS-accessible)
 * - User profile: in-memory (+ sessionStorage for UI within tab)
 *
 * Login on any *.ttmenus.com site authenticates all menus/services.
 * Logout clears hub cookies server-side; other tabs detect via /session poll.
 */

function ttmsNormalizeAuthApiV1Base(raw) {
  var s = String(raw == null ? '' : raw)
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\/+$/, '');
  if (!s || !/^https?:\/\//i.test(s)) {
    return '';
  }
  if (/\/api\/v1$/i.test(s)) {
    return s;
  }
  return s + '/api/v1';
}

var TTMS_PRODUCTION_AUTH_API = 'https://auth.ttmenus.com/api/v1';
var TTMS_LOCAL_AUTH_API = 'http://localhost:8080/api/v1';

function ttmsIsLocalDevHost() {
  if (typeof window === 'undefined' || !window.location) return false;
  var h = window.location.hostname || '';
  return h === 'localhost' || h === '127.0.0.1' || /\.local$/i.test(h);
}

function ttmsDefaultAuthApiV1Base() {
  return ttmsIsLocalDevHost() ? TTMS_LOCAL_AUTH_API : TTMS_PRODUCTION_AUTH_API;
}

/** Never use loopback auth URLs on public menu domains (triggers Chrome/Edge LNA prompt). */
function ttmsSanitizeAuthApiUrl(url) {
  if (!url) return url;
  if (!ttmsIsLocalDevHost() && /localhost|127\.0\.0\.1/i.test(url)) {
    return TTMS_PRODUCTION_AUTH_API;
  }
  return url;
}

var TTMS_LEGACY_TOKEN_KEYS = ['auth_token', 'ttmenus_access_token'];
var TTMS_LEGACY_REFRESH_KEYS = ['refresh_token', 'ttmenus_refresh_token'];
var TTMS_LEGACY_USER_KEYS = ['user_data', 'ttmenus_user'];
var TTMS_USER_PROFILE_KEY = 'ttmenus_user_profile';
var TTMS_LOGOUT_LATCH_KEY = 'ttmenus_logout_latch';
var TTMS_LOGOUT_LATCH_MS = 20000;

const AuthClient = {
  /** In-memory access JWT — never persisted to localStorage. */
  _accessToken: null,
  /** In-memory user object. */
  _currentUser: null,
  /** True when session is valid via hub .ttmenus.com HttpOnly cookie. */
  _sessionFromCookie: false,
  _readyPromise: null,
  _sessionPollTimer: null,
  _lastSessionState: null,
  _resolveSessionPromise: null,

  config: {
    sessionPollMs: 45000,
    get apiUrl() {
      if (typeof window !== 'undefined') {
        var fromApp = ttmsSanitizeAuthApiUrl(
          ttmsNormalizeAuthApiV1Base(window.APP_CONFIG && window.APP_CONFIG.authServiceUrl)
        );
        if (fromApp) return fromApp;
        var fromAuth = ttmsSanitizeAuthApiUrl(
          ttmsNormalizeAuthApiV1Base(window.AUTH_CONFIG && window.AUTH_CONFIG.apiUrl)
        );
        if (fromAuth) return fromAuth;
        var fromSvc = ttmsSanitizeAuthApiUrl(ttmsNormalizeAuthApiV1Base(window.AUTH_SERVICE_URL));
        if (fromSvc) return fromSvc;
      }
      return ttmsDefaultAuthApiV1Base();
    },
  },

  init() {
    this._purgeLegacyStorage();
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('logout') === '1') {
        this._setLogoutLatch();
        params.delete('logout');
        var clean =
          window.location.pathname +
          (params.toString() ? '?' + params.toString() : '') +
          window.location.hash;
        window.history.replaceState({}, document.title, clean);
      }
    } catch (e) {}
    this._readyPromise = this.checkAuthStatus();
    this._startSessionPolling();
    return this._readyPromise;
  },

  whenReady() {
    if (!this._readyPromise) {
      this._readyPromise = this.checkAuthStatus();
    }
    return this._readyPromise;
  },

  _purgeLegacyStorage() {
    var allKeys = TTMS_LEGACY_TOKEN_KEYS.concat(
      TTMS_LEGACY_REFRESH_KEYS,
      TTMS_LEGACY_USER_KEYS
    );
    allKeys.forEach(function (key) {
      try {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      } catch (e) {}
    });
  },

  _notifyAuthReady() {
    try {
      window.dispatchEvent(new CustomEvent('ttms:auth-ready'));
    } catch (e) {}
  },

  _tokenLooksValid(token) {
    if (!token) return false;
    try {
      const payload = this.parseJWT(token);
      const now = Math.floor(Date.now() / 1000);
      return payload.exp > now;
    } catch (e) {
      return false;
    }
  },

  isAuthenticated() {
    if (this._tokenLooksValid(this._accessToken)) return true;
    if (this._sessionFromCookie) return true;
    if (this._currentUser || this.getCurrentUser()) return true;
    return false;
  },

  parseJWT(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error('Failed to parse JWT:', e);
      return null;
    }
  },

  getAccessToken() {
    if (this._tokenLooksValid(this._accessToken)) {
      return this._accessToken;
    }
    return null;
  },

  getRefreshToken() {
    return null;
  },

  getCurrentUser() {
    if (this._currentUser) return this._currentUser;
    try {
      var cached = sessionStorage.getItem(TTMS_USER_PROFILE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  },

  _storeUserProfile(user) {
    this._currentUser = user || null;
    try {
      if (user) {
        sessionStorage.setItem(TTMS_USER_PROFILE_KEY, JSON.stringify(user));
      } else {
        sessionStorage.removeItem(TTMS_USER_PROFILE_KEY);
      }
    } catch (e) {}
  },

  storeAuth(accessToken, _refreshToken, user) {
    if (accessToken) {
      this._accessToken = accessToken;
    }
    if (user) {
      this._storeUserProfile(user);
    }
    this._sessionFromCookie = true;
    this._lastSessionState = true;
  },

  _clearAuthSessionExtras() {
    var sessionKeys = ['ttmenus_redirect_after_login', 'ttmenus_ws_connection_id'];
    var localKeys = ['ttmenus_user_id', 'ttmenus_notification_subscription'];
    sessionKeys.concat(localKeys).forEach(function (key) {
      try {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
      } catch (e) {}
    });
  },

  _setLogoutLatch() {
    try {
      sessionStorage.setItem(TTMS_LOGOUT_LATCH_KEY, String(Date.now()));
    } catch (e) {}
  },

  _clearLogoutLatch() {
    try {
      sessionStorage.removeItem(TTMS_LOGOUT_LATCH_KEY);
    } catch (e) {}
  },

  _isLogoutLatched() {
    try {
      var raw = sessionStorage.getItem(TTMS_LOGOUT_LATCH_KEY);
      if (!raw) return false;
      var ts = parseInt(raw, 10);
      if (!Number.isFinite(ts) || Date.now() - ts > TTMS_LOGOUT_LATCH_MS) {
        sessionStorage.removeItem(TTMS_LOGOUT_LATCH_KEY);
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  },

  _stopSessionPolling() {
    if (this._sessionPollTimer) {
      clearInterval(this._sessionPollTimer);
      this._sessionPollTimer = null;
    }
  },

  _authApiIsLocalDev() {
    return ttmsIsLocalDevHost() || /localhost|127\.0\.0\.1/i.test(this.config.apiUrl || '');
  },

  _resolveLogoutReturnUrl(redirectUrl) {
    var path = redirectUrl || window.location.pathname + window.location.search || '/';
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    return window.location.origin + (path.charAt(0) === '/' ? path : '/' + path);
  },

  clearAuth(force) {
    var wasAuthed =
      !!this._accessToken ||
      !!this._currentUser ||
      this._sessionFromCookie ||
      this._lastSessionState ||
      !!this.getCurrentUser();

    if (!force && !wasAuthed) {
      return;
    }

    this._accessToken = null;
    this._currentUser = null;
    this._sessionFromCookie = false;
    this._lastSessionState = false;
    this._purgeLegacyStorage();
    try {
      sessionStorage.removeItem(TTMS_USER_PROFILE_KEY);
    } catch (e) {}
    this._clearAuthSessionExtras();
    try {
      if (typeof window.syncBodyAuthClasses === 'function') {
        window.syncBodyAuthClasses(false);
      } else {
        document.body.classList.remove('ttms-logged-in');
        document.body.classList.add('ttms-logged-out');
      }
      window.dispatchEvent(new CustomEvent('auth:logout'));
    } catch (e) {}
  },

  async _fetchMe(opts) {
    const cookieOnly = !!(opts && opts.cookieOnly);
    const headers = { Accept: 'application/json' };
    if (!cookieOnly) {
      const token = this.getAccessToken();
      if (token) {
        headers.Authorization = 'Bearer ' + token;
      }
    }
    const response = await fetch(this.config.apiUrl + '/me', {
      method: 'GET',
      credentials: 'include',
      headers: headers,
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (parseErr) {
      data = {};
    }
    return { response: response, data: data };
  },

  async syncHubSession() {
    return this._resolveSessionFromServer();
  },

  async _resolveSessionFromServer() {
    if (this._resolveSessionPromise) {
      return this._resolveSessionPromise;
    }

    this._resolveSessionPromise = this._resolveSessionFromServerNow().finally(() => {
      this._resolveSessionPromise = null;
    });
    return this._resolveSessionPromise;
  },

  async _resolveSessionFromServerNow() {
    if (this._isLogoutLatched()) {
      this.clearAuth(true);
      return { success: false, error: 'Logged out' };
    }

    try {
      if (!this._tokenLooksValid(this._accessToken)) {
        const sessionProbe = await this._fetchSession();
        if (sessionProbe.accessToken) {
          this._hydrateAccessToken(sessionProbe.accessToken);
        }
        if (!this._tokenLooksValid(this._accessToken)) {
          const refreshResult = await this.refreshToken();
          if (!refreshResult.success) {
            if (!sessionProbe.authenticated) {
              this.clearAuth();
              return { success: false, error: 'Not authenticated' };
            }
            this._sessionFromCookie = true;
            this._lastSessionState = true;
            if (sessionProbe.user) {
              this._storeUserProfile(sessionProbe.user);
            }
          }
        }
      }

      let result = await this._fetchMe();

      if (result.response.status === 401) {
        const refreshResult = await this.refreshToken();
        if (refreshResult.success) {
          result = await this._fetchMe();
        } else {
          const sessionProbe = await this._fetchSession();
          if (sessionProbe.accessToken) {
            this._hydrateAccessToken(sessionProbe.accessToken);
          }
          if (this.getAccessToken()) {
            result = await this._fetchMe();
          } else {
            result = await this._fetchMe({ cookieOnly: true });
          }
        }
      }

      if (result.response.ok && result.data) {
        this._clearLogoutLatch();
        this._sessionFromCookie = true;
        this._lastSessionState = true;
        const userPayload = result.data.user || result.data;
        this._storeUserProfile(userPayload);
        if (!this.getAccessToken()) {
          const tokenResult = await this.ensureAccessToken();
          if (!tokenResult.success) {
            this.clearAuth();
            return { success: false, error: tokenResult.error || 'Session expired' };
          }
        }
        return { success: true, user: userPayload };
      }

      this._sessionFromCookie = false;
      this.clearAuth();
      return {
        success: false,
        error: (result.data && result.data.error) || 'Not authenticated',
      };
    } catch (error) {
      console.error('Session resolve failed:', error);
      this._sessionFromCookie = false;
      if (!this._tokenLooksValid(this._accessToken)) {
        this.clearAuth();
      }
      return { success: false, error: error.message };
    }
  },

  async _fetchSession() {
    if (this._isLogoutLatched()) {
      return { authenticated: false, user: null, accessToken: null };
    }
    try {
      const response = await fetch(this.config.apiUrl + '/session', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data = await response.json();
      return {
        authenticated: !!data.authenticated,
        user: data.user || null,
        accessToken: data.access_token || null,
      };
    } catch (e) {
      return { authenticated: false, user: null, accessToken: null };
    }
  },

  _hydrateAccessToken(token) {
    if (token && this._tokenLooksValid(token)) {
      this._accessToken = token;
      return true;
    }
    return false;
  },

  async ensureAccessToken() {
    if (this.getAccessToken()) {
      return { success: true, accessToken: this.getAccessToken() };
    }
    const sessionProbe = await this._fetchSession();
    if (sessionProbe.accessToken && this._hydrateAccessToken(sessionProbe.accessToken)) {
      this._sessionFromCookie = true;
      this._lastSessionState = true;
      if (sessionProbe.user) {
        this._storeUserProfile(sessionProbe.user);
      }
      return { success: true, accessToken: this.getAccessToken() };
    }
    if (!this.isAuthenticated() && !sessionProbe.authenticated) {
      return { success: false, error: 'Not authenticated' };
    }
    const refreshResult = await this.refreshToken();
    if (refreshResult.success && this.getAccessToken()) {
      return { success: true, accessToken: this.getAccessToken() };
    }
    if (sessionProbe.authenticated) {
      const retry = await this._fetchSession();
      if (retry.accessToken && this._hydrateAccessToken(retry.accessToken)) {
        return { success: true, accessToken: this.getAccessToken() };
      }
    }
    return { success: false, error: (refreshResult && refreshResult.error) || 'No access token' };
  },

  _startSessionPolling() {
    if (this._sessionPollTimer || typeof window === 'undefined') return;

    var self = this;
    this._sessionPollTimer = setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      self._pollSessionState();
    }, this.config.sessionPollMs);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        self._pollSessionState();
      }
    });
  },

  async _pollSessionState() {
    const wasAuth = this._lastSessionState;
    const probe = await this._fetchSession();

    if (probe.authenticated) {
      this._lastSessionState = true;
      if (!this.isAuthenticated()) {
        await this._resolveSessionFromServer();
        this._notifyAuthReady();
      }
      return;
    }

    if (wasAuth || this.isAuthenticated()) {
      this.clearAuth();
      if (window.AuthMiddleware && typeof AuthMiddleware.applyMenuAuthState === 'function') {
        AuthMiddleware.applyMenuAuthState();
      } else if (window.AuthMiddleware && typeof AuthMiddleware.applyHubAuthState === 'function') {
        AuthMiddleware.applyHubAuthState();
      }
    }
  },

  async login(email, password, rememberMe) {
    try {
      const response = await fetch(this.config.apiUrl + '/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      this.storeAuth(data.access_token, null, data.user);
      this._lastSessionState = true;

      try {
        if (typeof window.syncBodyAuthClasses === 'function') {
          window.syncBodyAuthClasses(true);
        }
        window.dispatchEvent(new CustomEvent('auth:login', { detail: { user: data.user } }));
      } catch (e) {}

      return { success: true, user: data.user };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Redirect to auth-service Google OAuth. Sets hub SSO cookies on callback.
   * @param {{ returnTo?: string, action?: 'login'|'signup', acceptLegal?: boolean }} options
   */
  loginWithGoogle(options) {
    options = options || {};
    var params = new URLSearchParams();
    params.set('return_to', options.returnTo || window.location.href);
    params.set('action', options.action === 'signup' ? 'signup' : 'login');
    if (options.acceptLegal) {
      params.set('accept_legal', '1');
    }
    window.location.href = AuthClient.config.apiUrl + '/oauth/google?' + params.toString();
  },

  parseOAuthRedirectMessage() {
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('oauth') === 'success') {
        return { type: 'success', message: 'Signed in with Google successfully.' };
      }
      var err = params.get('oauth_error');
      if (err) {
        return { type: 'error', message: err };
      }
    } catch (e) {}
    return null;
  },

  clearOAuthRedirectParams() {
    try {
      var url = new URL(window.location.href);
      if (!url.searchParams.has('oauth') && !url.searchParams.has('oauth_error')) {
        return;
      }
      url.searchParams.delete('oauth');
      url.searchParams.delete('oauth_error');
      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    } catch (e) {}
  },

  async signup(userData) {
    try {
      const response = await fetch(this.config.apiUrl + '/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Signup failed');
      return { success: true, message: data.message, userId: data.user_id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async logout(options) {
    options = options || {};
    var redirect = options.redirect !== false;
    var redirectUrl = options.redirectUrl || window.location.pathname + window.location.search || '/';
    var returnTo = this._resolveLogoutReturnUrl(redirectUrl);

    this._setLogoutLatch();
    this._stopSessionPolling();
    this.clearAuth(true);

    if (window.AuthMiddleware && typeof AuthMiddleware.toggleAuthElements === 'function') {
      AuthMiddleware.toggleAuthElements();
    }
    if (typeof window.updateAccountDashboardAuthState === 'function') {
      window.updateAccountDashboardAuthState(false, null);
    }

    var apiUrl = this.config.apiUrl;

    if (redirect && !this._authApiIsLocalDev()) {
      window.location.replace(
        apiUrl + '/sso/logout?return_to=' + encodeURIComponent(returnTo)
      );
      return { success: true };
    }

    var token = this.getAccessToken();
    try {
      var headers = { Accept: 'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      await fetch(apiUrl + '/logout', {
        method: 'POST',
        credentials: 'include',
        headers: headers,
      });
    } catch (error) {
      console.error('Logout error:', error);
    }

    this._clearLogoutLatch();

    if (redirect) {
      window.location.replace(returnTo);
    } else {
      this._startSessionPolling();
    }

    return { success: true };
  },

  async refreshToken() {
    try {
      const response = await fetch(this.config.apiUrl + '/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Token refresh failed');
      }

      if (data.access_token) {
        this._accessToken = data.access_token;
      }
      this._sessionFromCookie = true;
      this._lastSessionState = true;

      return { success: true, accessToken: data.access_token };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async getProfile() {
    const token = this.getAccessToken();
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;

    try {
      const response = await fetch(this.config.apiUrl + '/me', {
        method: 'GET',
        credentials: 'include',
        headers: headers,
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          const refreshResult = await this.refreshToken();
          if (refreshResult.success) return this.getProfile();
        }
        throw new Error(data.error || 'Failed to get profile');
      }

      this._sessionFromCookie = true;
      this._storeUserProfile(data);

      return { success: true, user: data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async updateProfile(updates) {
    const token = this.getAccessToken();
    if (!token) return { success: false, error: 'Not authenticated' };

    try {
      const response = await fetch(this.config.apiUrl + '/me', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update profile');
      if (data.user) this._storeUserProfile(data.user);
      return { success: true, message: data.message, user: data.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async changePassword(currentPassword, newPassword, confirmPassword) {
    const token = this.getAccessToken();
    if (!token) return { success: false, error: 'Not authenticated' };

    try {
      const response = await fetch(this.config.apiUrl + '/change-password', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to change password');
      return { success: true, message: data.message };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async forgotPassword(email) {
    try {
      const response = await fetch(this.config.apiUrl + '/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to request password reset');
      return { success: true, message: data.message };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async resetPassword(token, newPassword, confirmPassword) {
    try {
      const response = await fetch(this.config.apiUrl + '/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to reset password');
      return { success: true, message: data.message };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async verifyEmail(token) {
    try {
      const response = await fetch(this.config.apiUrl + '/verify-email?token=' + encodeURIComponent(token), {
        method: 'GET',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to verify email');
      return { success: true, message: data.message };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async checkAuthStatus() {
    await this._resolveSessionFromServer();
    this._notifyAuthReady();
  },

  async refreshMenuSession() {
    await this._resolveSessionFromServer();
    this._notifyAuthReady();
  },

  _normalizeRoles(roles) {
    if (!roles) return [];
    if (Array.isArray(roles)) return roles;
    if (typeof roles === 'string') {
      return roles.split(',').map(function (r) { return r.trim(); }).filter(Boolean);
    }
    return [];
  },

  hasRole(role) {
    const user = this.getCurrentUser();
    return user && this._normalizeRoles(user.roles).includes(role);
  },

  isAdmin() {
    return this.hasRole('admin') || this.hasRole('superadmin');
  },

  isSuperadmin() {
    return this.hasRole('superadmin');
  },

  hasPermission(resource, action) {
    const user = this.getCurrentUser();
    if (!user || !user.permissions) return false;
    var target = resource + ':' + action;
    return user.permissions.indexOf(target) !== -1;
  },

  async authenticatedRequest(url, options, _retried) {
    options = options || {};
    if (!this.isAuthenticated()) {
      const synced = await this.syncHubSession();
      if (!synced.success) return { success: false, error: 'Not authenticated' };
    }

    if (!this.getAccessToken()) {
      const tokenResult = await this.ensureAccessToken();
      if (!tokenResult.success) {
        return { success: false, error: tokenResult.error || 'Not authenticated' };
      }
    }

    const token = this.getAccessToken();
    const headers = Object.assign({}, options.headers || {});
    if (token) headers.Authorization = 'Bearer ' + token;

    try {
      const response = await fetch(url, Object.assign({}, options, {
        headers: headers,
        credentials: 'include',
      }));

      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        data = {};
      }

      if (!response.ok) {
        if (response.status === 401 && !_retried) {
          const refreshResult = await this.refreshToken();
          if (refreshResult.success) {
            return this.authenticatedRequest(url, options, true);
          }
          const synced = await this.syncHubSession();
          if (synced.success) {
            return this.authenticatedRequest(url, options, true);
          }
        }
        if (response.status === 429 && !options._ttms429RetriesDone) {
          const ra = Number(data && data.retry_after);
          const sec = Number.isFinite(ra) && ra > 0 ? ra : 2;
          const ms = Math.min(60000, Math.max(500, sec * 1000));
          await new Promise(function (resolve) { setTimeout(resolve, ms); });
          return this.authenticatedRequest(
            url,
            Object.assign({}, options, { _ttms429RetriesDone: true }),
            _retried
          );
        }
        var errMsg = data.error || data.message || 'Request failed';
        if (response.status) errMsg = errMsg + ' (HTTP ' + response.status + ')';
        throw new Error(errMsg);
      }

      return { success: true, data: data };
    } catch (error) {
      console.error('Authenticated request error:', error);
      return { success: false, error: error.message };
    }
  },

  async getFavorites(kind) {
    const q = kind ? '?kind=' + encodeURIComponent(kind) : '';
    return this.authenticatedRequest(this.config.apiUrl + '/me/favorites' + q, { method: 'GET' });
  },

  async addFavorite(payload) {
    return this.authenticatedRequest(this.config.apiUrl + '/me/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
  },

  async removeFavorite(kind, itemKey) {
    var params = new URLSearchParams();
    params.set('kind', kind || '');
    params.set('item_key', itemKey || '');
    return this.authenticatedRequest(
      this.config.apiUrl + '/me/favorites?' + params.toString(),
      { method: 'DELETE' }
    );
  },

  async addFavoriteVenue(menuId, menuName, menuUrl, imageUrl) {
    return this.addFavorite({
      kind: 'venue',
      item_key: menuId,
      title: menuName || menuId,
      url: menuUrl || '',
      image_url: imageUrl || '',
    });
  },
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { AuthClient.init(); });
} else {
  AuthClient.init();
}

window.AuthClient = AuthClient;
