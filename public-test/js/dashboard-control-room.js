/**
 * Dashboard control room — header site name and account line.
 */
(function (global) {
  'use strict';

  function cleanSiteName(s) {
    s = String(s || '').trim();
    s = s.replace(/^["']+|["']+$/g, '');
    return s.trim();
  }

  function isJunkSiteName(s) {
    s = cleanSiteName(s);
    if (!s || s === '—') return true;
    if (/^dashboard(\s*\|\s*)?$/i.test(s)) return true;
    if (/^dashboard\s*\|\s*$/i.test(s)) return true;
    return false;
  }

  function formatClientIdFallback() {
    var id = global.SITE_CLIENT_ID || global.CLIENT_ID || '';
    if (!id) return 'Your menu';
    return String(id)
      .replace(/^_/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
  }

  function resolveSiteDisplayName() {
    var candidates = [];
    if (global.SITE_DISPLAY_NAME) candidates.push(String(global.SITE_DISPLAY_NAME).trim());
    var userEl = document.getElementById('dashboardUserInfo');
    if (userEl) {
      candidates.push((userEl.getAttribute('data-business-name') || '').trim());
    }
    var siteNameEl = document.getElementById('dashboardHeaderSiteName');
    if (siteNameEl) candidates.push((siteNameEl.textContent || '').trim());
    var t = (document.title || '').trim();
    var pipe = t.match(/Dashboard\s*\|\s*(.+)/i);
    if (pipe && pipe[1]) candidates.push(pipe[1].trim());
    var stripped = t.replace(/^Dashboard\s*\|\s*/i, '').trim();
    if (stripped) candidates.push(stripped);
    candidates.push(formatClientIdFallback());
    for (var i = 0; i < candidates.length; i++) {
      candidates[i] = cleanSiteName(candidates[i]);
      if (!isJunkSiteName(candidates[i])) return candidates[i];
    }
    return 'Your menu';
  }

  function applyHeaderSiteName() {
    var siteName = resolveSiteDisplayName();
    var siteEl = document.getElementById('dashboardHeaderSiteName');
    if (siteEl) siteEl.textContent = siteName;
    var logoLink = document.getElementById('dashboardLogoLink');
    if (logoLink) {
      logoLink.setAttribute('title', 'View ' + siteName + ' menu site');
      logoLink.setAttribute('aria-label', siteName + ' — view live menu');
    }
    return siteName;
  }

  function hubAccountUrl() {
    var base = String(global.HUB_ACCOUNT_URL || 'https://ttmenus.com/account/').replace(/\/+$/, '');
    var id = global.SITE_CLIENT_ID || global.CLIENT_ID || '';
    if (id && id.indexOf('ttms_') !== 0) {
      id = 'ttms_' + String(id).replace(/^_ttms_/, '').replace(/^_/, '');
    }
    return id ? base + '/?client_id=' + encodeURIComponent(id) : base + '/';
  }

  function applyHeaderAccountLink() {
    var linkEl = document.getElementById('dashboardHeaderAccountLink');
    if (linkEl) linkEl.href = hubAccountUrl();
  }

  function applyHeaderUser() {
    var accountEl = document.getElementById('dashboardHeaderUserName');
    if (!accountEl) return;
    var user =
      global.AuthClient && global.AuthClient.getCurrentUser
        ? global.AuthClient.getCurrentUser()
        : null;
    if (!user) {
      accountEl.textContent = '—';
      accountEl.removeAttribute('title');
      applyHeaderAccountLink();
      return;
    }
    var username =
      user.username ||
      (user.first_name && user.last_name
        ? user.first_name + ' ' + user.last_name
        : null) ||
      user.email ||
      '—';
    accountEl.textContent = username;
    if (user.email && user.email !== username) {
      accountEl.setAttribute('title', user.email);
    } else {
      accountEl.setAttribute('title', username);
    }
    var linkEl = document.getElementById('dashboardHeaderAccountLink');
    if (linkEl) {
      linkEl.setAttribute('title', 'Open your TT Menus account');
      linkEl.setAttribute('aria-label', username + ' — open account');
    }
    applyHeaderAccountLink();
  }

  function init() {
    applyHeaderSiteName();
    applyHeaderAccountLink();
    applyHeaderUser();
    var logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn && global.AuthClient) {
      logoutBtn.addEventListener('click', function () {
        global.AuthClient.logout({ redirect: true, redirectUrl: '/' });
      });
    }
  }

  global.DashboardControlRoom = { init: init, resolveSiteDisplayName: resolveSiteDisplayName };
})(typeof window !== 'undefined' ? window : this);
