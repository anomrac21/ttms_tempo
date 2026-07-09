/**
 * Block loopback / LAN service URLs on public *.ttmenus.com hosts (Chrome LNA prompt).
 * Load synchronously before AUTH_CONFIG / NOTIFY_CONFIG / CMS_* scripts in head.html.
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    authApiV1: 'https://auth.ttmenus.com/api/v1',
    notifyService: 'https://notify.ttmenus.com',
    notifyApiV1: 'https://notify.ttmenus.com/api/v1',
    notifyWs: 'wss://notify.ttmenus.com/api/v1/ws/connect',
    cmsService: 'https://cms.ttmenus.com',
    cmsApi: 'https://cms.ttmenus.com/api',
    menuImagesApi: 'https://menu-images.ttmenus.com/api/v1',
    adsService: 'https://ads.ttmenus.com',
  };

  function ttmsIsLocalDevHost() {
    if (!global.location) return false;
    var h = global.location.hostname || '';
    return h === 'localhost' || h === '127.0.0.1' || /\.local$/i.test(h);
  }

  function ttmsIsLoopbackHost(host) {
    var h = String(host || '').toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || /\.local$/i.test(h);
  }

  function ttmsIsPrivateIPv4Host(host) {
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(host || ''));
    if (!m) return false;
    var a = +m[1];
    var b = +m[2];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }

  /** True for localhost, private LAN, or .local URLs — triggers LNA on HTTPS public sites. */
  function ttmsIsLocalNetworkUrl(url) {
    var s = String(url || '').trim();
    if (!s) return false;
    if (/^(https?|wss?):\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(s)) return true;
    try {
      var base = global.location && global.location.origin ? global.location.origin : 'https://example.com';
      var u = new URL(s, base);
      var host = u.hostname || '';
      if (ttmsIsLoopbackHost(host)) return true;
      if (ttmsIsPrivateIPv4Host(host)) return true;
    } catch (e) {
      /* ignore parse errors */
    }
    return false;
  }

  function ttmsSanitizeRemoteUrl(url, fallback) {
    if (!url) return url;
    if (ttmsIsLocalDevHost()) return url;
    if (ttmsIsLocalNetworkUrl(url)) return fallback || '';
    return url;
  }

  function ttmsSanitizeNotifyConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return cfg;
    if (cfg.apiUrl) {
      cfg.apiUrl = ttmsSanitizeRemoteUrl(cfg.apiUrl, DEFAULTS.notifyApiV1) || DEFAULTS.notifyApiV1;
    }
    if (cfg.websocketUrl) {
      cfg.websocketUrl =
        ttmsSanitizeRemoteUrl(cfg.websocketUrl, DEFAULTS.notifyWs) || DEFAULTS.notifyWs;
    }
    if (cfg.serviceUrl) {
      cfg.serviceUrl =
        ttmsSanitizeRemoteUrl(cfg.serviceUrl, DEFAULTS.notifyService) || DEFAULTS.notifyService;
    }
    return cfg;
  }

  function ttmsSanitizePageServiceConfigs() {
    if (ttmsIsLocalDevHost()) return;

    if (global.AUTH_CONFIG && global.AUTH_CONFIG.apiUrl) {
      global.AUTH_CONFIG.apiUrl =
        ttmsSanitizeRemoteUrl(global.AUTH_CONFIG.apiUrl, DEFAULTS.authApiV1) || DEFAULTS.authApiV1;
    }
    if (global.AUTH_SERVICE_URL) {
      global.AUTH_SERVICE_URL =
        ttmsSanitizeRemoteUrl(global.AUTH_SERVICE_URL, DEFAULTS.authApiV1) || DEFAULTS.authApiV1;
    }
    if (global.APP_CONFIG && global.APP_CONFIG.authServiceUrl) {
      global.APP_CONFIG.authServiceUrl =
        ttmsSanitizeRemoteUrl(global.APP_CONFIG.authServiceUrl, DEFAULTS.authApiV1) ||
        DEFAULTS.authApiV1;
    }

    if (global.NOTIFY_CONFIG) {
      if (typeof global.NOTIFY_CONFIG === 'string') {
        try {
          global.NOTIFY_CONFIG = JSON.parse(global.NOTIFY_CONFIG);
        } catch (e) {
          global.NOTIFY_CONFIG = {};
        }
      }
      ttmsSanitizeNotifyConfig(global.NOTIFY_CONFIG);
    }

    if (global.CMS_SERVICE_URL) {
      global.CMS_SERVICE_URL =
        ttmsSanitizeRemoteUrl(global.CMS_SERVICE_URL, DEFAULTS.cmsService) || DEFAULTS.cmsService;
    }
    if (global.CMS_API_URL) {
      global.CMS_API_URL =
        ttmsSanitizeRemoteUrl(global.CMS_API_URL, DEFAULTS.cmsApi) || DEFAULTS.cmsApi;
    }
    if (global.UPDATE_API_URL) {
      global.UPDATE_API_URL =
        ttmsSanitizeRemoteUrl(global.UPDATE_API_URL, DEFAULTS.cmsApi) || DEFAULTS.cmsApi;
    }

    if (global.MENU_IMAGE_CONFIG && global.MENU_IMAGE_CONFIG.apiUrl) {
      global.MENU_IMAGE_CONFIG.apiUrl =
        ttmsSanitizeRemoteUrl(global.MENU_IMAGE_CONFIG.apiUrl, DEFAULTS.menuImagesApi) ||
        DEFAULTS.menuImagesApi;
    }

    if (global.SiteConfig) {
      if (global.SiteConfig.notifyServiceUrl) {
        global.SiteConfig.notifyServiceUrl =
          ttmsSanitizeRemoteUrl(global.SiteConfig.notifyServiceUrl, DEFAULTS.notifyService) ||
          DEFAULTS.notifyService;
      }
    }
  }

  function ttmsSyncNotifyUrlToServiceWorker(serviceUrl) {
    if (!('serviceWorker' in navigator)) return;
    var url =
      ttmsSanitizeRemoteUrl(serviceUrl, DEFAULTS.notifyService) || DEFAULTS.notifyService;
    var payload = { type: 'SET_NOTIFY_CONFIG', serviceUrl: url };
    try {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage(payload);
      }
    } catch (e) {
      /* ignore */
    }
  }

  global.TTMSNetworkGuard = {
    DEFAULTS: DEFAULTS,
    ttmsIsLocalDevHost: ttmsIsLocalDevHost,
    ttmsIsLocalNetworkUrl: ttmsIsLocalNetworkUrl,
    ttmsSanitizeRemoteUrl: ttmsSanitizeRemoteUrl,
    ttmsSanitizeNotifyConfig: ttmsSanitizeNotifyConfig,
    ttmsSanitizePageServiceConfigs: ttmsSanitizePageServiceConfigs,
    ttmsSyncNotifyUrlToServiceWorker: ttmsSyncNotifyUrlToServiceWorker,
  };
})(typeof window !== 'undefined' ? window : this);
