/**
 * Google OAuth redirect helpers for auth pages.
 * Loaded separately so deploys are not blocked by cached auth-client.js.
 */
(function (window) {
  'use strict';

  function normalizeAuthApiV1Base(raw) {
    var s = String(raw == null ? '' : raw)
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/\/+$/, '');
    if (!s || !/^https?:\/\//i.test(s)) {
      return 'https://auth.ttmenus.com/api/v1';
    }
    if (/\/api\/v1$/i.test(s)) {
      return s;
    }
    return s + '/api/v1';
  }

  function resolveAuthApiUrl() {
    if (window.AuthClient && window.AuthClient.config && window.AuthClient.config.apiUrl) {
      return normalizeAuthApiV1Base(window.AuthClient.config.apiUrl);
    }
    if (window.APP_CONFIG && window.APP_CONFIG.authServiceUrl) {
      return normalizeAuthApiV1Base(window.APP_CONFIG.authServiceUrl);
    }
    if (window.AUTH_CONFIG && window.AUTH_CONFIG.apiUrl) {
      return normalizeAuthApiV1Base(window.AUTH_CONFIG.apiUrl);
    }
    if (window.AUTH_SERVICE_URL) {
      return normalizeAuthApiV1Base(window.AUTH_SERVICE_URL);
    }
    return 'https://auth.ttmenus.com/api/v1';
  }

  function loginWithGoogle(options) {
    options = options || {};
    var params = new URLSearchParams();
    params.set('return_to', options.returnTo || window.location.href);
    params.set('action', options.action === 'signup' ? 'signup' : 'login');
    if (options.acceptLegal) {
      params.set('accept_legal', '1');
    }
    window.location.href = resolveAuthApiUrl() + '/oauth/google?' + params.toString();
  }

  function parseOAuthRedirectMessage() {
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
  }

  function clearOAuthRedirectParams() {
    try {
      var url = new URL(window.location.href);
      if (!url.searchParams.has('oauth') && !url.searchParams.has('oauth_error')) {
        return;
      }
      url.searchParams.delete('oauth');
      url.searchParams.delete('oauth_error');
      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    } catch (e) {}
  }

  window.TTMSGoogleAuth = {
    loginWithGoogle: loginWithGoogle,
    parseOAuthRedirectMessage: parseOAuthRedirectMessage,
    clearOAuthRedirectParams: clearOAuthRedirectParams,
  };

  if (window.AuthClient) {
    window.AuthClient.loginWithGoogle = loginWithGoogle;
    window.AuthClient.parseOAuthRedirectMessage = parseOAuthRedirectMessage;
    window.AuthClient.clearOAuthRedirectParams = clearOAuthRedirectParams;
  }
})(window);
