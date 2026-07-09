/**
 * Resolves CMS client id + notify domain for dashboard pages.
 * Prefers Hugo data-* attributes on the page root, then SiteConfig, then globals.
 */
(function (global) {
  'use strict';

  function dashboardRoot() {
    return (
      document.getElementById('dashboardControlRoom') ||
      document.getElementById('dashboardAnalyticsPage') ||
      document.getElementById('dashboardNotificationsPage') ||
      document.getElementById('dashboardDeploymentsPage')
    );
  }

  function readAttr(name) {
    var root = dashboardRoot();
    if (!root) return '';
    return String(root.getAttribute(name) || '').trim();
  }

  function cmsClientId() {
    var fromDom = readAttr('data-cms-client-id');
    if (fromDom) return fromDom;

    var sc = global.SiteConfig || {};
    if (sc.contentManagement && sc.contentManagement.clientId) {
      return String(sc.contentManagement.clientId).trim();
    }
    if (sc.clientId) return String(sc.clientId).trim();

    return String(
      global.CLIENT_ID || global.SITE_CLIENT_ID || global.CMS_CLIENT_ID || ''
    ).trim();
  }

  function notifyClientDomain() {
    var fromDom = readAttr('data-notify-client-domain');
    if (fromDom) return fromDom;

    var cfg = global.NOTIFY_CONFIG;
    if (typeof cfg === 'string') {
      try {
        cfg = JSON.parse(cfg);
      } catch (e) {
        cfg = null;
      }
    }
    if (cfg && cfg.clientDomain) return String(cfg.clientDomain).trim();
    if (global.SiteConfig && global.SiteConfig.notifyClientDomain) {
      return String(global.SiteConfig.notifyClientDomain).trim();
    }
    return global.location && global.location.hostname ? global.location.hostname : '';
  }

  function analyticsId() {
    var fromDom = readAttr('data-analytics-id');
    if (fromDom && fromDom !== '0') return fromDom;
    if (global.SiteConfig && global.SiteConfig.analyticsId != null) {
      return String(global.SiteConfig.analyticsId);
    }
    return '';
  }

  function gitRepoUrl() {
    var fromDom = readAttr('data-git-repo');
    if (fromDom) return fromDom;
    var sc = global.SiteConfig || {};
    if (sc.contentManagement && sc.contentManagement.gitRepo) {
      return String(sc.contentManagement.gitRepo).trim();
    }
    var cid = cmsClientId();
    if (cid && cid !== '_ttms_menu_demo') {
      return 'https://github.com/anomrac21/' + cid + '.git';
    }
    return '';
  }

  global.DashboardClientContext = {
    dashboardRoot: dashboardRoot,
    cmsClientId: cmsClientId,
    notifyClientDomain: notifyClientDomain,
    analyticsId: analyticsId,
    gitRepoUrl: gitRepoUrl,
  };
})(typeof window !== 'undefined' ? window : this);
