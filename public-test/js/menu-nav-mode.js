/**
 * Home navigation mode — snap (reels) vs smooth (regular page scroll).
 */
(function () {
  'use strict';

  var PREF_KEY = 'homeNavMode';
  var MODES = { snap: 'snap', smooth: 'smooth' };

  function readPreference() {
    try {
      if (window.LocalStorageManager && LocalStorageManager.preferences) {
        var mode = LocalStorageManager.preferences.get(PREF_KEY, 'snap');
        return mode === MODES.smooth ? MODES.smooth : MODES.snap;
      }
      var raw = localStorage.getItem('userPreferences');
      if (raw) {
        var prefs = JSON.parse(raw);
        if (prefs && prefs[PREF_KEY] === MODES.smooth) return MODES.smooth;
      }
    } catch (e) { /* ignore */ }
    return MODES.snap;
  }

  function writePreference(mode) {
    var value = mode === MODES.smooth ? MODES.smooth : MODES.snap;
    try {
      if (window.LocalStorageManager && LocalStorageManager.preferences) {
        LocalStorageManager.preferences.update(PREF_KEY, value);
        return;
      }
      var prefs = {};
      try {
        var raw = localStorage.getItem('userPreferences');
        if (raw) prefs = JSON.parse(raw) || {};
      } catch (e2) { /* ignore */ }
      prefs[PREF_KEY] = value;
      localStorage.setItem('userPreferences', JSON.stringify(prefs));
    } catch (e) { /* ignore */ }
  }

  function applyDomClass(mode) {
    var smooth = mode === MODES.smooth;
    document.documentElement.classList.toggle('menu-nav-smooth', smooth);
    if (document.body) {
      document.body.classList.toggle('menu-nav-smooth', smooth);
    }
  }

  function syncToggleUi(mode) {
    var row = document.getElementById('settingsNavModeRow');
    if (!row) return;
    row.querySelectorAll('[data-nav-mode]').forEach(function (btn) {
      var active = btn.getAttribute('data-nav-mode') === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function preserveScrollForModeChange(nextMode) {
    var track = document.getElementById('menu-reels-track');
    if (!track) {
      applyDomClass(nextMode);
      return;
    }

    var current = getMenuNavMode();
    if (current === nextMode) {
      applyDomClass(nextMode);
      return;
    }

    if (current === MODES.snap && nextMode === MODES.smooth) {
      var trackDocTop = track.getBoundingClientRect().top + window.scrollY;
      var targetY = trackDocTop + track.scrollTop;
      applyDomClass(nextMode);
      requestAnimationFrame(function () {
        window.scrollTo({ top: Math.max(0, targetY), left: 0, behavior: 'auto' });
        if (typeof window.refreshMenuNavScrollBindings === 'function') {
          window.refreshMenuNavScrollBindings();
        }
      });
      return;
    }

    if (current === MODES.smooth && nextMode === MODES.snap) {
      var pageY = window.scrollY;
      applyDomClass(nextMode);
      requestAnimationFrame(function () {
        var trackTop = track.getBoundingClientRect().top + window.scrollY;
        track.scrollTop = Math.max(0, pageY - trackTop);
        if (typeof window.refreshMenuNavScrollBindings === 'function') {
          window.refreshMenuNavScrollBindings();
        }
      });
      return;
    }

    applyDomClass(nextMode);
    if (typeof window.refreshMenuNavScrollBindings === 'function') {
      window.refreshMenuNavScrollBindings();
    }
  }

  function setMenuNavMode(mode, options) {
    options = options || {};
    var next = mode === MODES.smooth ? MODES.smooth : MODES.snap;
    writePreference(next);
    syncToggleUi(next);
    if (options.skipScrollPreserve) {
      applyDomClass(next);
      if (typeof window.refreshMenuNavScrollBindings === 'function') {
        window.refreshMenuNavScrollBindings();
      }
    } else {
      preserveScrollForModeChange(next);
    }
    try {
      window.dispatchEvent(
        new CustomEvent('ttms:nav-mode-change', { detail: { mode: next } })
      );
    } catch (e) { /* ignore */ }
  }

  function getMenuNavMode() {
    if (document.documentElement.classList.contains('menu-nav-smooth')) {
      return MODES.smooth;
    }
    return readPreference();
  }

  function bindNavModeToggle() {
    var row = document.getElementById('settingsNavModeRow');
    if (!row || row._ttmsNavModeBound) return;
    row._ttmsNavModeBound = true;

    row.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-nav-mode]');
      if (!btn) return;
      var mode = btn.getAttribute('data-nav-mode');
      if (!mode || mode === getMenuNavMode()) return;
      setMenuNavMode(mode);
    });
  }

  function initMenuNavMode() {
    var mode = readPreference();
    applyDomClass(mode);
    syncToggleUi(mode);
    bindNavModeToggle();
  }

  window.getMenuNavMode = getMenuNavMode;
  window.setMenuNavMode = setMenuNavMode;
  window.initMenuNavMode = initMenuNavMode;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMenuNavMode);
  } else {
    initMenuNavMode();
  }

  if (window.TTMSBarba) {
    window.TTMSBarba.register(initMenuNavMode);
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      if (window.TTMSBarba) {
        window.TTMSBarba.register(initMenuNavMode);
      }
    });
  }
})();
