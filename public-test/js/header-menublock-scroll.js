/**
 * Hide TT Menus dashboard control when category nav (#menublock) is scrolled right;
 * keep venue logo visible and show signed-in badge on the logo (.account-badge--on-logo).
 */
(function () {
  'use strict';

  /** Hide only after ~1.5 category icons; show again when nearly back at start */
  var HIDE_AT_PX = 96;
  var SHOW_AT_PX = 40;
  var LOGO_SWIPE_THRESHOLD = 40;
  var LOGO_SWIPE_LOCK_PX = 12;
  var DASHBOARD_SLIDE_MS = 680;
  var scrollRaf = 0;
  var MOBILE_MENUBLOCK_MQ =
    '(max-width: 768px), ((max-width: 1024px) and (hover: none) and (pointer: coarse))';
  var mobileMenublockMq = window.matchMedia(MOBILE_MENUBLOCK_MQ);

  function syncMobileMenublockClass() {
    document.documentElement.classList.toggle('ttms-mobile-menublock', mobileMenublockMq.matches);
  }

  function isMobileMenublockMode() {
    return (
      document.documentElement.classList.contains('ttms-mobile-menublock') ||
      mobileMenublockMq.matches
    );
  }

  function getMenublockToggle() {
    return document.getElementById('menublockToggle');
  }

  function getMenublockBackdrop() {
    return document.getElementById('menublockBackdrop');
  }

  function setMenublockDropdownOpen(open) {
    var mainHeader = document.querySelector('.main-header');
    var toggle = getMenublockToggle();
    var backdrop = getMenublockBackdrop();

    if (mainHeader) {
      mainHeader.classList.toggle('menublock-dropdown-open', open);
    }
    document.body.classList.toggle('menublock-dropdown-open', open);

    if (toggle) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu categories' : 'Open menu categories');
    }

    if (backdrop) {
      backdrop.hidden = !open;
      backdrop.classList.toggle('is-visible', open);
      backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
  }

  function closeMenublockDropdown() {
    setMenublockDropdownOpen(false);
  }

  function openMenublockDropdown() {
    if (!isMobileMenublockMode()) {
      return;
    }
    if (typeof window.closeAllUiPanels === 'function') {
      window.closeAllUiPanels({ keepMenublock: true, skipReelsModal: true });
    }
    setMenublockDropdownOpen(true);
  }

  function toggleMenublockDropdown() {
    if (!isMobileMenublockMode()) {
      return;
    }
    var mainHeader = document.querySelector('.main-header');
    var isOpen = !!(mainHeader && mainHeader.classList.contains('menublock-dropdown-open'));
    if (!isOpen && typeof window.closeAllUiPanels === 'function') {
      window.closeAllUiPanels({ keepMenublock: true, skipReelsModal: true });
    }
    setMenublockDropdownOpen(!isOpen);
  }

  function invokeMenublockToggle(sourceEvent) {
    if (sourceEvent) {
      sourceEvent.preventDefault();
    }
    if (!isMobileMenublockMode()) {
      return;
    }
    toggleMenublockDropdown();
  }

  function bindMenublockDropdownGlobals() {
    if (window._ttmsMenublockDropdownGlobalsBound) {
      return;
    }
    window._ttmsMenublockDropdownGlobalsBound = true;

    var lastToggleAt = 0;

    function handleToggleActivation(e) {
      if (!e.target.closest('#menublockToggle')) {
        return;
      }
      var now = Date.now();
      if (now - lastToggleAt < 400) {
        if (e.cancelable) {
          e.preventDefault();
        }
        return;
      }
      lastToggleAt = now;
      invokeMenublockToggle(e);
    }

    document.addEventListener('click', handleToggleActivation, true);

    // iOS Safari sometimes skips synthetic click on buttons; pointerup is reliable.
    document.addEventListener(
      'pointerup',
      function (e) {
        if (e.pointerType === 'mouse') {
          return;
        }
        handleToggleActivation(e);
      },
      true
    );

    document.addEventListener(
      'click',
      function (e) {
        if (e.target.closest('#menublockToggle')) {
          return;
        }

        if (e.target.closest('#menublockBackdrop.is-visible')) {
          closeMenublockDropdown();
          return;
        }

        if (!isMobileMenublockMode()) {
          return;
        }

        var link = e.target.closest('#menublock .menublock-link');
        if (link) {
          closeMenublockDropdown();
        }
      },
      true
    );

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') {
        return;
      }
      closeMenublockDropdown();
    });

    if (typeof mobileMenublockMq.addEventListener === 'function') {
      mobileMenublockMq.addEventListener('change', function () {
        syncMobileMenublockClass();
        closeMenublockDropdown();
        updateHeaderMenublockScroll();
        var menublock = document.getElementById('menublock');
        if (menublock) {
          menublock._ttmsTouchNavBound = false;
        }
        bindMenublockTouchNav();
      });
    } else if (typeof mobileMenublockMq.addListener === 'function') {
      mobileMenublockMq.addListener(function () {
        syncMobileMenublockClass();
        closeMenublockDropdown();
        updateHeaderMenublockScroll();
        var menublock = document.getElementById('menublock');
        if (menublock) {
          menublock._ttmsTouchNavBound = false;
        }
        bindMenublockTouchNav();
      });
    }
  }

  function bindMenublockDropdown() {
    bindMenublockDropdownGlobals();
  }

  function resetMenublockDropdownBindings() {
    closeMenublockDropdown();
  }

  function markDashboardSlideAnimating() {
    var btn = document.getElementById('dashboardBtn');
    if (!btn) {
      return;
    }
    btn.style.willChange = 'transform';
    if (btn._ttmsSlideClearTimer) {
      window.clearTimeout(btn._ttmsSlideClearTimer);
    }
    btn._ttmsSlideClearTimer = window.setTimeout(function () {
      btn.style.willChange = '';
      btn._ttmsSlideClearTimer = 0;
    }, DASHBOARD_SLIDE_MS);
  }

  function setMenublockScrolledRight(mainHeader, hidden) {
    var isHidden = mainHeader.classList.contains('menublock-scrolled-right');
    if (hidden === isHidden) {
      return;
    }
    if (hidden) {
      mainHeader.classList.add('menublock-scrolled-right');
    } else {
      mainHeader.classList.remove('menublock-scrolled-right');
    }
    markDashboardSlideAnimating();
  }

  function updateMenublockScrollHints() {
    if (isMobileMenublockMode()) {
      return;
    }
    var menublock = document.getElementById('menublock');
    var nav = menublock && menublock.closest('.header-nav');
    if (!menublock || !nav) {
      return;
    }
    var maxScroll = Math.max(0, menublock.scrollWidth - menublock.clientWidth);
    var scrollLeft = menublock.scrollLeft;
    nav.classList.toggle('menublock-can-scroll-left', scrollLeft > 4);
    nav.classList.toggle('menublock-can-scroll-right', scrollLeft < maxScroll - 4);
  }

  function updateHeaderMenublockScroll() {
    var menublock = document.getElementById('menublock');
    var mainHeader = document.querySelector('.main-header');
    if (!menublock || !mainHeader) {
      return;
    }
    if (isMobileMenublockMode()) {
      setMenublockScrolledRight(mainHeader, false);
      return;
    }
    var scrollLeft = menublock.scrollLeft;
    var isHidden = mainHeader.classList.contains('menublock-scrolled-right');
    if (isHidden) {
      if (scrollLeft <= SHOW_AT_PX) {
        setMenublockScrolledRight(mainHeader, false);
      }
    } else if (scrollLeft >= HIDE_AT_PX) {
      setMenublockScrolledRight(mainHeader, true);
    }
    updateMenublockScrollHints();
  }

  function scheduleHeaderMenublockScrollUpdate() {
    if (scrollRaf) {
      return;
    }
    scrollRaf = window.requestAnimationFrame(function () {
      scrollRaf = 0;
      updateHeaderMenublockScroll();
    });
  }

  function bindMenublockTouchNav() {
    // Mobile dropdown uses vertical scroll; suppressing "accidental" clicks breaks iOS taps.
    if (isMobileMenublockMode()) {
      return;
    }

    var menublock = document.getElementById('menublock');
    if (!menublock || menublock._ttmsTouchNavBound) {
      return;
    }
    menublock._ttmsTouchNavBound = true;

    var startX = 0;
    var startY = 0;
    var tracking = false;
    var suppressClick = false;
    var MOVE_THRESHOLD = 10;

    menublock.addEventListener(
      'pointerdown',
      function (e) {
        if (e.button > 0) return;
        startX = e.clientX;
        startY = e.clientY;
        tracking = true;
        suppressClick = false;
      },
      { passive: true }
    );

    menublock.addEventListener(
      'pointermove',
      function (e) {
        if (!tracking) return;
        var dx = Math.abs(e.clientX - startX);
        var dy = Math.abs(e.clientY - startY);
        // Only suppress link activation after horizontal scroll intent (desktop nav strip).
        if (dx >= MOVE_THRESHOLD && dx > dy) {
          suppressClick = true;
        }
      },
      { passive: true }
    );

    menublock.addEventListener(
      'click',
      function (e) {
        if (!suppressClick) return;
        var link = e.target.closest('.menublock-link');
        if (!link) return;
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
      },
      true
    );

    function finishPointer() {
      tracking = false;
    }

    menublock.addEventListener('pointerup', finishPointer, { passive: true });
    menublock.addEventListener('pointercancel', finishPointer, { passive: true });
  }

  function bindMenublockDropdownTouchScroll() {
    if (document.documentElement._ttmsMenublockDropdownTouchScrollBound) {
      return;
    }
    document.documentElement._ttmsMenublockDropdownTouchScrollBound = true;

    var activeEl = null;
    var axis = null;
    var startPrimary = 0;
    var startScroll = 0;
    var moved = false;

    function getMobileScrollTarget(target) {
      if (!isMobileMenublockMode()) {
        return null;
      }
      if (!document.body.classList.contains('menublock-dropdown-open')) {
        return null;
      }
      var menublock = document.getElementById('menublock');
      if (!menublock || !menublock.contains(target)) {
        return null;
      }
      if (menublock.scrollHeight <= menublock.clientHeight + 1) {
        return null;
      }
      return menublock;
    }

    function getDesktopScrollTarget(target) {
      if (isMobileMenublockMode()) {
        return null;
      }
      var menublock = document.getElementById('menublock');
      if (!menublock || !menublock.contains(target)) {
        return null;
      }
      if (menublock.scrollWidth <= menublock.clientWidth + 1) {
        return null;
      }
      return menublock;
    }

    function resetTouchScroll() {
      activeEl = null;
      axis = null;
      moved = false;
    }

    document.addEventListener(
      'touchstart',
      function (e) {
        if (!e.touches || e.touches.length !== 1) {
          return;
        }
        var mobileTarget = getMobileScrollTarget(e.target);
        var desktopTarget = getDesktopScrollTarget(e.target);
        activeEl = mobileTarget || desktopTarget;
        if (!activeEl) {
          return;
        }
        axis = mobileTarget ? 'y' : 'x';
        startPrimary = axis === 'y' ? e.touches[0].clientY : e.touches[0].clientX;
        startScroll = axis === 'y' ? activeEl.scrollTop : activeEl.scrollLeft;
        moved = false;
      },
      { passive: true, capture: true }
    );

    document.addEventListener(
      'touchmove',
      function (e) {
        if (!activeEl || !e.touches || e.touches.length !== 1) {
          return;
        }
        var primary = axis === 'y' ? e.touches[0].clientY : e.touches[0].clientX;
        var delta = startPrimary - primary;
        if (Math.abs(delta) < 4) {
          return;
        }
        moved = true;
        if (axis === 'y') {
          var maxTop = activeEl.scrollHeight - activeEl.clientHeight;
          activeEl.scrollTop = Math.max(0, Math.min(maxTop, startScroll + delta));
        } else {
          var maxLeft = activeEl.scrollWidth - activeEl.clientWidth;
          activeEl.scrollLeft = Math.max(0, Math.min(maxLeft, startScroll + delta));
        }
        if (e.cancelable) {
          e.preventDefault();
        }
      },
      { passive: false, capture: true }
    );

    ['touchend', 'touchcancel'].forEach(function (eventName) {
      document.addEventListener(
        eventName,
        function () {
          resetTouchScroll();
        },
        { passive: true, capture: true }
      );
    });
  }

  function bindMenublockScroll() {
    var menublock = document.getElementById('menublock');
    if (!menublock || menublock._ttmsMenublockScrollBound) {
      updateHeaderMenublockScroll();
      return;
    }
    menublock._ttmsMenublockScrollBound = true;
    menublock.addEventListener(
      'scroll',
      scheduleHeaderMenublockScrollUpdate,
      { passive: true }
    );
    updateHeaderMenublockScroll();
  }

  function scrollPageAndMenublockToTop() {
    if (typeof closeCart === 'function') {
      closeCart();
    }

    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    if (window.TTMSMenublockNav && typeof window.TTMSMenublockNav.cancelNavigation === 'function') {
      window.TTMSMenublockNav.cancelNavigation();
    }

    var menublock = document.getElementById('menublock');
    if (menublock) {
      if (menublock.scrollTo) {
        menublock.scrollTo({ left: 0, behavior: 'auto' });
      } else {
        menublock.scrollLeft = 0;
      }
      updateHeaderMenublockScroll();
    }

    if (typeof window.scrollMenuReelsToTop === 'function' && document.getElementById('menu-reels-track')) {
      window.scrollMenuReelsToTop('auto');
    } else {
      if (window.scrollTo) {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  }

  /** Home page venue logo — scroll page + category nav back to start */
  function headerLogoActivate(event) {
    if (event) {
      event.preventDefault();
    }
    var run = function () {
      scrollPageAndMenublockToTop();
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 0);
    }
    return false;
  }

  function scrollMenublockTo(left, smooth) {
    var menublock = document.getElementById('menublock');
    if (!menublock) return;
    var behavior = smooth ? 'smooth' : 'auto';
    if (menublock.scrollTo) {
      menublock.scrollTo({ left: left, behavior: behavior });
    } else {
      menublock.scrollLeft = left;
    }
    updateHeaderMenublockScroll();
  }

  function showDashboardControl(smooth) {
    if (isMobileMenublockMode()) {
      return;
    }
    var mainHeader = document.querySelector('.main-header');
    if (mainHeader) {
      setMenublockScrolledRight(mainHeader, false);
    }
    scrollMenublockTo(0, smooth);
  }

  function hideDashboardControl(smooth) {
    if (isMobileMenublockMode()) {
      return;
    }
    scrollMenublockTo(HIDE_AT_PX, smooth);
  }

  function isLogoSwipeSurface(target) {
    if (!target || !target.closest) return false;
    if (target.closest('#dashboardBtn')) return false;
    return !!target.closest('.header-leading .header-logo');
  }

  function bindHeaderLogoSwipe() {
    document.querySelectorAll('.header-leading a.header-logo').forEach(function (logo) {
      if (logo._ttmsHeaderLogoSwipeBound) return;
      logo._ttmsHeaderLogoSwipeBound = true;

      var startX = 0;
      var startY = 0;
      var tracking = false;
      var locked = false;
      var suppressClick = false;

      logo.addEventListener(
        'click',
        function (event) {
          if (!suppressClick) return;
          event.preventDefault();
          event.stopPropagation();
          suppressClick = false;
        },
        true
      );

      logo.addEventListener('pointerdown', function (e) {
        if (e.button > 0 || !isLogoSwipeSurface(e.target)) return;
        startX = e.clientX;
        startY = e.clientY;
        tracking = true;
        locked = false;
        suppressClick = false;
      });

      logo.addEventListener('pointermove', function (e) {
        if (!tracking) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        var absDx = Math.abs(dx);
        var absDy = Math.abs(dy);

        if (!locked) {
          if (absDy > absDx && absDy >= LOGO_SWIPE_LOCK_PX) {
            tracking = false;
            return;
          }
          if (absDx < LOGO_SWIPE_LOCK_PX && absDy < LOGO_SWIPE_LOCK_PX) {
            return;
          }
          if (absDx <= absDy) {
            tracking = false;
            return;
          }
          locked = true;
        }
      });

      function finishSwipe(e) {
        if (!tracking) return;
        tracking = false;
        if (!locked) return;

        var dx = e.clientX - startX;
        var mainHeader = document.querySelector('.main-header');
        if (!mainHeader) return;

        if (dx >= LOGO_SWIPE_THRESHOLD) {
          suppressClick = true;
          showDashboardControl(true);
          return;
        }
        if (dx <= -LOGO_SWIPE_THRESHOLD) {
          suppressClick = true;
          hideDashboardControl(true);
        }
      }

      logo.addEventListener('pointerup', finishSwipe);
      logo.addEventListener('pointercancel', finishSwipe);
    });
  }

  function bindHeaderLogoClick() {
    document.querySelectorAll('.header-leading a.header-logo[href="#"]').forEach(function (logo) {
      if (logo._ttmsHeaderLogoBound) {
        return;
      }
      logo._ttmsHeaderLogoBound = true;
      logo.addEventListener('click', function (event) {
        headerLogoActivate(event);
      });
    });
  }

  window.updateHeaderMenublockScroll = updateHeaderMenublockScroll;
  window.bindMenublockScroll = bindMenublockScroll;
  window.headerLogoActivate = headerLogoActivate;
  window.scrollPageAndMenublockToTop = scrollPageAndMenublockToTop;

  function scrollMenublockLinkIntoView(link) {
    if (!link || isMobileMenublockMode()) return;
    var menublock = document.getElementById('menublock');
    if (!menublock) return;

    var linkRect = link.getBoundingClientRect();
    var blockRect = menublock.getBoundingClientRect();
    var linkCenter = linkRect.left + linkRect.width / 2;
    var blockCenter = blockRect.left + blockRect.width / 2;
    var targetLeft = menublock.scrollLeft + (linkCenter - blockCenter);
    var maxScroll = Math.max(0, menublock.scrollWidth - menublock.clientWidth);
    targetLeft = Math.max(0, Math.min(maxScroll, targetLeft));

    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    scrollMenublockTo(targetLeft, !(reducedMotion || coarsePointer));
  }

  window.scrollMenublockLinkIntoView = scrollMenublockLinkIntoView;
  window.closeMenublockDropdown = closeMenublockDropdown;
  window.toggleMenublockDropdown = toggleMenublockDropdown;

  function resetHeaderLogoBindings() {
    document.querySelectorAll('.header-leading a.header-logo').forEach(function (logo) {
      logo._ttmsHeaderLogoBound = false;
      logo._ttmsHeaderLogoSwipeBound = false;
    });
  }

  function fixMenublockIconPaths() {
    var menublock = document.getElementById('menublock');
    if (!menublock) return;

    menublock.querySelectorAll('img.icon').forEach(function (img) {
      var src = (img.getAttribute('src') || '').trim();
      var path = (img.getAttribute('data-src-path') || '').trim();

      if (!path && src && !/^https?:\/\//i.test(src)) {
        path = src.replace(/^\/+/, '');
        img.setAttribute('data-src-path', path);
      }

      if (path && window.TtmsThumbor && typeof window.TtmsThumbor.resolvePreviewSrc === 'function') {
        var resolved = window.TtmsThumbor.resolvePreviewSrc(path, { width: 320, height: 320 });
        if (resolved && img.getAttribute('src') !== resolved) {
          img.setAttribute('src', resolved);
        }
        return;
      }

      if (src && !/^https?:\/\//i.test(src) && src.charAt(0) !== '/') {
        img.setAttribute('src', '/' + src.replace(/^\/+/, ''));
      }
    });
  }

  window.fixMenublockIconPaths = fixMenublockIconPaths;

  function reinitHeaderMenublock() {
    syncMobileMenublockClass();
    fixMenublockIconPaths();

    var menublock = document.getElementById('menublock');
    if (menublock) {
      menublock._ttmsMenublockScrollBound = false;
      menublock._ttmsTouchNavBound = false;
    }

    if (isMobileMenublockMode()) {
      var mainHeader = document.querySelector('.main-header');
      if (mainHeader) {
        mainHeader.classList.remove('menublock-scrolled-right');
      }
      if (menublock) {
        menublock.scrollLeft = 0;
      }
    }

    resetMenublockDropdownBindings();
    resetHeaderLogoBindings();

    bindMenublockDropdown();
    bindMenublockDropdownTouchScroll();
    bindMenublockScroll();
    bindMenublockTouchNav();
    bindHeaderLogoClick();
    bindHeaderLogoSwipe();

    if (typeof window.bindDashboardTriggers === 'function') {
      window.bindDashboardTriggers();
    }

    updateHeaderMenublockScroll();
  }

  var reinitHeaderMenublockTimer = null;

  function scheduleReinitHeaderMenublock(source, attempt) {
    attempt = attempt || 0;
    if (reinitHeaderMenublockTimer) {
      clearTimeout(reinitHeaderMenublockTimer);
    }

    reinitHeaderMenublockTimer = setTimeout(function () {
      reinitHeaderMenublockTimer = null;
      reinitHeaderMenublock();

      if (!getMenublockToggle() && attempt < 16) {
        scheduleReinitHeaderMenublock(source, attempt + 1);
      }
    }, attempt === 0 ? 0 : 60);
  }

  window.reinitHeaderMenublock = reinitHeaderMenublock;
  window.scheduleReinitHeaderMenublock = scheduleReinitHeaderMenublock;

  function initHeaderMenublock() {
    syncMobileMenublockClass();
    reinitHeaderMenublock();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeaderMenublock);
  } else {
    initHeaderMenublock();
  }

  window.addEventListener(
    'resize',
    function () {
      updateMenublockScrollHints();
    },
    { passive: true }
  );

  function registerBarbaMenublockScroll() {
    if (!window.TTMSBarba || window._ttmsMenublockBarbaRegistered) {
      return;
    }
    window._ttmsMenublockBarbaRegistered = true;
    window.TTMSBarba.register(function () {
      scheduleReinitHeaderMenublock('barba');
    });
  }

  function ensureBarbaMenublockRegistration(attempt) {
    attempt = attempt || 0;
    registerBarbaMenublockScroll();
    if (!window._ttmsMenublockBarbaRegistered && attempt < 50) {
      window.setTimeout(function () {
        ensureBarbaMenublockRegistration(attempt + 1);
      }, 40);
    }
  }

  function bindBarbaMenublockBeforeLeave() {
    if (window._ttmsMenublockBarbaBeforeBound) {
      return;
    }
    window._ttmsMenublockBarbaBeforeBound = true;

    function onBarbaLeave() {
      document.body.classList.remove('menublock-dropdown-open');
      closeMenublockDropdown();
    }

    if (window.barba && window.barba.hooks && typeof window.barba.hooks.beforeLeave === 'function') {
      window.barba.hooks.beforeLeave(onBarbaLeave);
    }
    if (window.barba && window.barba.hooks && typeof window.barba.hooks.before === 'function') {
      window.barba.hooks.before(onBarbaLeave);
    }

    ['barba:beforeLeave', 'barba:before'].forEach(function (eventName) {
      document.addEventListener(eventName, onBarbaLeave);
    });
  }

  if (window.TTMSBarba) {
    ensureBarbaMenublockRegistration();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureBarbaMenublockRegistration);
  } else {
    ensureBarbaMenublockRegistration();
  }

  document.addEventListener('ttms:page-enter', function () {
    scheduleReinitHeaderMenublock('page-enter');
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindBarbaMenublockBeforeLeave);
  } else {
    bindBarbaMenublockBeforeLeave();
  }
})();
