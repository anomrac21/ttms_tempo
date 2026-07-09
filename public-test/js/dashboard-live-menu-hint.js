/**
 * Shows a one-time hint on the live menu when opened from the dashboard “Edit menu content” action.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'editMenuLiveMode';
  var LAUNCH_KEY = 'editMenuLiveHintLaunch';
  var DISMISSED_KEY = 'editMenuLiveHintDismissed';
  var PARAM_KEY = 'edit';
  var hintResizeObserver = null;
  var activeLaunchId = null;

  function readLaunchId() {
    try {
      return sessionStorage.getItem(LAUNCH_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function isLaunchDismissed(launchId) {
    if (!launchId) return false;
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === launchId;
    } catch (e) {
      return false;
    }
  }

  /** Fresh ?edit=content or dashboard click starts a new launch id (once per page load). */
  function ensureLaunchId() {
    try {
      var fromUrl = new URLSearchParams(window.location.search).get(PARAM_KEY) === 'content';
      var fromStorage = sessionStorage.getItem(STORAGE_KEY) === 'content';
      if (fromUrl || fromStorage) {
        if (!activeLaunchId) {
          activeLaunchId = String(Date.now());
          sessionStorage.setItem(LAUNCH_KEY, activeLaunchId);
        }
        return activeLaunchId;
      }
      activeLaunchId = readLaunchId();
      return activeLaunchId;
    } catch (e) {
      return '';
    }
  }

  function shouldShowContentHint() {
    var launchId = ensureLaunchId();
    if (!launchId || isLaunchDismissed(launchId)) return false;
    return true;
  }

  function stripContentHintFromUrl() {
    try {
      var url = new URL(window.location.href);
      if (url.searchParams.get(PARAM_KEY) !== 'content') return;
      url.searchParams.delete(PARAM_KEY);
      var next = url.pathname + url.search + url.hash;
      window.history.replaceState(window.history.state, '', next);
    } catch (e) { /* ignore */ }
  }

  function clearContentHintFlag() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
    stripContentHintFromUrl();
  }

  function markHintDismissed() {
    var launchId = readLaunchId() || activeLaunchId;
    try {
      if (launchId) sessionStorage.setItem(DISMISSED_KEY, launchId);
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(LAUNCH_KEY);
    } catch (e) { /* ignore */ }
    activeLaunchId = null;
    stripContentHintFromUrl();
  }

  function hasAdminSiteAccess() {
    if (!window.AuthClient || !AuthClient.isAuthenticated() || !AuthClient.isAdmin()) return false;
    return (
      window.AuthClientAccess &&
      typeof AuthClientAccess.hasClientAccess === 'function' &&
      AuthClientAccess.hasClientAccess()
    );
  }

  function syncHintLayout() {
    var banner = document.querySelector('.dashboard-live-menu-hint');
    var root = document.documentElement;
    if (!banner) {
      root.classList.remove('has-dashboard-live-menu-hint');
      root.style.removeProperty('--dashboard-live-menu-hint-height');
      if (hintResizeObserver) {
        hintResizeObserver.disconnect();
        hintResizeObserver = null;
      }
      return;
    }
    root.classList.add('has-dashboard-live-menu-hint');
    root.style.setProperty('--dashboard-live-menu-hint-height', banner.getBoundingClientRect().height + 'px');
  }

  function observeHintLayout(banner) {
    syncHintLayout();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncHintLayout);
      return;
    }
    if (hintResizeObserver) hintResizeObserver.disconnect();
    hintResizeObserver = new ResizeObserver(syncHintLayout);
    hintResizeObserver.observe(banner);
  }

  function mountBanner() {
    if (!shouldShowContentHint()) return;
    if (document.querySelector('.dashboard-live-menu-hint')) return;
    clearContentHintFlag();

    var banner = document.createElement('div');
    banner.className = 'dashboard-live-menu-hint';
    banner.setAttribute('role', 'status');
    banner.innerHTML =
      '<div class="dashboard-live-menu-hint__inner">' +
      '<p class="dashboard-live-menu-hint__text">' +
      '<strong>Edit menu content</strong> — tap <span class="dashboard-live-menu-hint__icon" aria-hidden="true"><i class="fa fa-ellipsis-v"></i></span> ' +
      'on any <strong>menu item</strong>, <strong>section heading</strong>, or <strong>promotion</strong>, then choose <strong>Edit</strong>. ' +
      'Finish with <strong>Save</strong> on the last step of the editor panel (or close the panel to save your draft). Publish drafts from the dashboard <strong>Publish</strong> button.' +
      '</p>' +
      '<button type="button" class="dashboard-live-menu-hint__close" aria-label="Dismiss">' +
      '<i class="fa fa-times" aria-hidden="true"></i></button>' +
      '</div>';

    var closeBtn = banner.querySelector('.dashboard-live-menu-hint__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        markHintDismissed();
        banner.remove();
        syncHintLayout();
      });
    }

    var header = document.querySelector('header');
    if (header && header.parentNode) {
      header.parentNode.insertBefore(banner, header.nextSibling);
    } else if (document.body.firstChild) {
      document.body.insertBefore(banner, document.body.firstChild);
    } else {
      document.body.appendChild(banner);
    }

    observeHintLayout(banner);
    requestAnimationFrame(syncHintLayout);
  }

  function boot() {
    if (window.AuthClient && typeof AuthClient.whenReady === 'function') {
      AuthClient.whenReady().then(function () {
        if (!shouldShowContentHint()) return;
        if (hasAdminSiteAccess()) mountBanner();
        else clearContentHintFlag();
      });
      return;
    }
    if (!shouldShowContentHint()) return;
    if (hasAdminSiteAccess()) mountBanner();
    else clearContentHintFlag();
  }

  window.addEventListener('ttms:auth-ready', boot);
  document.addEventListener('ttms:page-enter', boot);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
