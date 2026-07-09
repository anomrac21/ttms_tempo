/**
 * TT Menus side dashboard panel — open/close + trigger binding.
 * Kept outside main.js so toggles survive Barba transitions and load reliably.
 */
(function () {
  'use strict';

  var HIDDEN_CLASS = 'loader-hide-left';

  function getDashboard() {
    return document.getElementById('dashboard');
  }

  function syncDashboardBtnExpanded() {
    var btn = document.getElementById('dashboardBtn');
    var dashboard = getDashboard();
    if (!btn || !dashboard) return;
    var isOpen = !dashboard.classList.contains(HIDDEN_CLASS);
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  function closeDashboard() {
    var dashboard = getDashboard();
    if (!dashboard) return;

    dashboard.classList.add(HIDDEN_CLASS);
    dashboard.setAttribute('aria-hidden', 'true');

    var accountPanel = document.getElementById('account-dashboard');
    var accountOpen =
      accountPanel && !accountPanel.classList.contains('loader-hide-right');
    if (!accountOpen) {
      document.body.classList.remove('modal-open');
    }

    syncDashboardBtnExpanded();
  }

  function toggleDashboard() {
    var dashboard = getDashboard();
    if (!dashboard) return;

    if (dashboard.classList.contains(HIDDEN_CLASS)) {
      if (typeof window.closeAllUiPanels === 'function') {
        window.closeAllUiPanels({ keepDashboard: true, skipReelsModal: true });
      } else {
        if (typeof window.closeCart === 'function') {
          window.closeCart();
        }
        var search = document.getElementById('search');
        if (
          search &&
          !search.classList.contains('hide-search') &&
          typeof window.toggleSearch === 'function'
        ) {
          window.toggleSearch();
        }
        if (typeof window.closeAccountDashboard === 'function') {
          window.closeAccountDashboard();
        }
      }

      dashboard.classList.remove(HIDDEN_CLASS);
      dashboard.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    } else {
      closeDashboard();
    }

    syncDashboardBtnExpanded();
  }

  function handleDashboardTriggerClick(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (typeof window.showDashboardControl === 'function') {
      window.showDashboardControl(false);
    }

    toggleDashboard();
    return false;
  }

  function bindDashboardTriggers() {
    document.querySelectorAll('#dashboardBtn, [data-dashboard-toggle]').forEach(function (el) {
      if (el._ttmsDashboardTriggerBound) return;
      el._ttmsDashboardTriggerBound = true;
      el.addEventListener('click', handleDashboardTriggerClick);
    });
    syncDashboardBtnExpanded();
  }

  function initDashboardPanel() {
    bindDashboardTriggers();
  }

  window.toggleDashboard = toggleDashboard;
  window.closeDashboard = closeDashboard;
  window.bindDashboardTriggers = bindDashboardTriggers;
  window.bindDashboardBtn = bindDashboardTriggers;
  window.syncDashboardBtnExpanded = syncDashboardBtnExpanded;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboardPanel);
  } else {
    initDashboardPanel();
  }

  function registerBarbaDashboardPanel() {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(initDashboardPanel);
    }
  }

  if (window.TTMSBarba) {
    registerBarbaDashboardPanel();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerBarbaDashboardPanel);
  } else {
    registerBarbaDashboardPanel();
  }
})();
