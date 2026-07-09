/**
 * Menu photo approval — swipe reel (approve / decline).
 */
(function () {
  'use strict';

  var queue = [];
  var busy = false;
  var dragState = null;

  var SWIPE_THRESHOLD = 72;
  var ROTATION_MAX = 14;

  function cfg() {
    return typeof window.MENU_IMAGE_CONFIG !== 'undefined' ? window.MENU_IMAGE_CONFIG : null;
  }

  function clientId() {
    return (
      window.CLIENT_ID ||
      window.SITE_CLIENT_ID ||
      (cfg() && cfg().clientId) ||
      '_ttms_menu_demo'
    );
  }

  function apiBase() {
    var c = cfg();
    return c && c.apiUrl ? String(c.apiUrl).replace(/\/+$/, '') : '';
  }

  function getToken() {
    if (typeof AuthClient !== 'undefined' && AuthClient.getAccessToken) {
      return AuthClient.getAccessToken();
    }
    return null;
  }

  async function ensureToken() {
    if (getToken()) return getToken();
    if (typeof AuthClient !== 'undefined' && typeof AuthClient.ensureAccessToken === 'function') {
      var result = await AuthClient.ensureAccessToken();
      if (result.success) return getToken();
    }
    return null;
  }

  function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatWhen(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch (e) {
      return String(iso);
    }
  }

  function menuItemHref(path) {
    var p = String(path || '').trim();
    if (!p) return '#';
    if (p.charAt(0) !== '/') p = '/' + p;
    return p;
  }

  function menuItemTitle(path) {
    var p = String(path || '').replace(/\/$/, '');
    var slug = p.split('/').filter(Boolean).pop() || 'Menu item';
    return slug.replace(/-/g, ' ').replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  function thumborReel(url) {
    if (!url) return '';
    if (typeof window.TtmsThumbor !== 'undefined' && window.TtmsThumbor.menuImageSrc) {
      return window.TtmsThumbor.menuImageSrc(url, 'carousel') || url;
    }
    var thumbor =
      (typeof window.MENU_IMAGE_THUMBOR_URL !== 'undefined' &&
        window.MENU_IMAGE_THUMBOR_URL) ||
      'https://thumbor.ttmenus.com';
    return (
      String(thumbor).replace(/\/+$/, '') +
      '/unsafe/fit-in/720x900/' +
      encodeURIComponent(url)
    );
  }

  function el(id) {
    return document.getElementById(id);
  }

  function setSnapshotCount(n) {
    var pending = el('dashboardCardMenuImagesPending');
    if (pending) pending.textContent = n > 0 ? String(n) : '0';
    var progress = el('dashboardMenuImagesReelProgress');
    if (progress) {
      progress.textContent =
        n > 0 ? 'Card 1 of ' + n : '';
    }
  }

  function showError(msg) {
    var err = el('dashboardMenuImagesError');
    var reel = el('dashboardMenuImagesReel');
    var empty = el('dashboardMenuImagesEmpty');
    if (err) {
      err.textContent = msg || '';
      err.classList.toggle('hidden', !msg);
    }
    if (reel) reel.classList.add('hidden');
    if (empty) empty.classList.add('hidden');
  }

  function showEmpty() {
    var empty = el('dashboardMenuImagesEmpty');
    var reel = el('dashboardMenuImagesReel');
    var err = el('dashboardMenuImagesError');
    if (err) err.classList.add('hidden');
    if (reel) reel.classList.add('hidden');
    if (empty) {
      empty.classList.remove('hidden');
      empty.textContent = "You're all caught up — no photos waiting for review.";
    }
    setSnapshotCount(0);
  }

  function showReel() {
    var empty = el('dashboardMenuImagesEmpty');
    var reel = el('dashboardMenuImagesReel');
    var err = el('dashboardMenuImagesError');
    if (err) err.classList.add('hidden');
    if (empty) empty.classList.add('hidden');
    if (reel) reel.classList.remove('hidden');
  }

  async function fetchPending() {
    var base = apiBase();
    var token = await ensureToken();
    if (!base || !token) {
      throw new Error('Sign in required to load photo approvals.');
    }
    if (typeof AuthClient !== 'undefined' && !AuthClient.isAdmin()) {
      throw new Error('Admin access required.');
    }
    var res = await fetch(base + '/admin/menu-images/pending', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + token,
      },
    });
    var json = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      throw new Error(json.error || 'Could not load pending photos.');
    }
    return (json.data || []).filter(function (sub) {
      return String(sub.client_id || '') === clientId();
    });
  }

  async function postAction(id, action) {
    var base = apiBase();
    var token = await ensureToken();
    if (!base || !token) {
      throw new Error('Sign in required.');
    }
    var res = await fetch(
      base + '/admin/menu-images/' + encodeURIComponent(id) + '/' + action,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer ' + token,
        },
      }
    );
    var json = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      throw new Error(json.error || 'Request failed.');
    }
    return json;
  }

  function buildCardHtml(sub, stackIndex) {
    var preview = thumborReel(sub.url) || sub.url || '';
    var pathLabel = sub.menu_item_path || '—';
    var title = menuItemTitle(sub.menu_item_path);
    var when = formatWhen(sub.created_at);
    var depth = stackIndex === 0 ? ' is-top' : ' is-behind';
    return (
      '<article class="dashboard-menu-images-card' +
      depth +
      '" data-submission-id="' +
      escapeHtml(sub.id) +
      '" data-stack-index="' +
      stackIndex +
      '">' +
      '<div class="dashboard-menu-images-card__stamp dashboard-menu-images-card__stamp--approve" aria-hidden="true">APPROVE</div>' +
      '<div class="dashboard-menu-images-card__stamp dashboard-menu-images-card__stamp--decline" aria-hidden="true">DECLINE</div>' +
      '<div class="dashboard-menu-images-card__media">' +
      (preview
        ? '<img src="' +
          escapeHtml(preview) +
          '" alt="" class="dashboard-menu-images-card__img" draggable="false" decoding="async">'
        : '<div class="dashboard-menu-images-card__img dashboard-menu-images-card__img--empty"></div>') +
      '</div>' +
      '<div class="dashboard-menu-images-card__info">' +
      '<h4 class="dashboard-menu-images-card__title">' +
      escapeHtml(title) +
      '</h4>' +
      '<a class="dashboard-menu-images-card__path" href="' +
      escapeHtml(menuItemHref(sub.menu_item_path)) +
      '" target="_blank" rel="noopener">' +
      escapeHtml(pathLabel) +
      '</a>' +
      '<span class="dashboard-menu-images-card__meta">' +
      escapeHtml(when) +
      '</span>' +
      '</div>' +
      '</article>'
    );
  }

  function updateProgress() {
    setSnapshotCount(queue.length);
    var progress = el('dashboardMenuImagesReelProgress');
    if (progress && queue.length) {
      progress.textContent = 'Reviewing 1 of ' + queue.length;
    }
  }

  function renderStack() {
    var stack = el('dashboardMenuImagesReelStack');
    if (!stack) return;

    if (!queue.length) {
      stack.innerHTML = '';
      showEmpty();
      setReelButtonsDisabled(true);
      return;
    }

    showReel();
    setReelButtonsDisabled(false);
    updateProgress();

    var slice = queue.slice(0, 2);
    stack.innerHTML = slice
      .map(function (sub, i) {
        return buildCardHtml(sub, i);
      })
      .join('');

    var top = stack.querySelector('.dashboard-menu-images-card.is-top');
    if (top) bindCardDrag(top);
  }

  function setReelButtonsDisabled(disabled) {
    var declineBtn = el('dashboardMenuImagesDeclineBtn');
    var approveBtn = el('dashboardMenuImagesApproveBtn');
    if (declineBtn) declineBtn.disabled = disabled || busy;
    if (approveBtn) approveBtn.disabled = disabled || busy;
  }

  function setCardDragStyles(card, dx, dy) {
    if (!card) return;
    var rot = Math.max(-ROTATION_MAX, Math.min(ROTATION_MAX, dx * 0.08));
    card.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) rotate(' + rot + 'deg)';
    var approveOpacity = Math.min(1, Math.max(0, dx / SWIPE_THRESHOLD));
    var declineOpacity = Math.min(1, Math.max(0, -dx / SWIPE_THRESHOLD));
    card.style.setProperty('--approve-stamp-opacity', String(approveOpacity));
    card.style.setProperty('--decline-stamp-opacity', String(declineOpacity));
  }

  function clearCardDragStyles(card) {
    if (!card) return;
    card.style.transform = '';
    card.style.removeProperty('--smash-stamp-opacity');
    card.style.removeProperty('--pass-stamp-opacity');
  }

  function bindCardDrag(card) {
    if (!card || card._ttmsReelDragBound) return;
    card._ttmsReelDragBound = true;

    function onPointerDown(e) {
      if (busy || e.button > 0) return;
      dragState = {
        card: card,
        startX: e.clientX,
        startY: e.clientY,
        pointerId: e.pointerId,
      };
      card.classList.add('is-dragging');
      try {
        card.setPointerCapture(e.pointerId);
      } catch (err) {}
    }

    function onPointerMove(e) {
      if (!dragState || dragState.card !== card) return;
      var dx = e.clientX - dragState.startX;
      var dy = (e.clientY - dragState.startY) * 0.35;
      setCardDragStyles(card, dx, dy);
    }

    function onPointerUp(e) {
      if (!dragState || dragState.card !== card) return;
      var dx = e.clientX - dragState.startX;
      card.classList.remove('is-dragging');
      try {
        card.releasePointerCapture(e.pointerId);
      } catch (err) {}

      if (dx > SWIPE_THRESHOLD) {
        commitSwipe('approve', 'approve');
      } else if (dx < -SWIPE_THRESHOLD) {
        commitSwipe('decline', 'decline');
      } else {
        card.classList.add('is-snapping-back');
        clearCardDragStyles(card);
        setTimeout(function () {
          card.classList.remove('is-snapping-back');
        }, 280);
      }
      dragState = null;
    }

    card.addEventListener('pointerdown', onPointerDown);
    card.addEventListener('pointermove', onPointerMove);
    card.addEventListener('pointerup', onPointerUp);
    card.addEventListener('pointercancel', onPointerUp);
  }

  function flyOffCard(card, direction, done) {
    if (!card) {
      if (done) done();
      return;
    }
    card.classList.add('is-exiting');
    card.classList.add(direction === 'approve' ? 'is-exit-approve' : 'is-exit-decline');
    setTimeout(function () {
      if (done) done();
    }, 320);
  }

  function commitSwipe(action, direction) {
    if (busy || !queue.length) return;
    var sub = queue[0];
    if (!sub) return;

    var stack = el('dashboardMenuImagesReelStack');
    var card = stack && stack.querySelector('.dashboard-menu-images-card.is-top');
    busy = true;
    setReelButtonsDisabled(true);

    if (card) {
      var dx = direction === 'approve' ? window.innerWidth : -window.innerWidth;
      setCardDragStyles(card, dx * 0.4, 0);
    }

    flyOffCard(card, direction, function () {
      postAction(sub.id, action)
        .then(function () {
          queue.shift();
          if (typeof window.showDashboardMenuImagesToast === 'function') {
            window.showDashboardMenuImagesToast(
              action === 'approve'
                ? 'Smash! Photo is live on the menu.'
                : 'Passed — photo declined.'
            );
          }
          renderStack();
        })
        .catch(function (err) {
          alert(err.message || 'Action failed.');
          if (card) {
            card.classList.remove('is-exiting', 'is-exit-approve', 'is-exit-decline');
            clearCardDragStyles(card);
          }
          renderStack();
        })
        .finally(function () {
          busy = false;
          setReelButtonsDisabled(queue.length === 0);
        });
    });
  }

  function bindReelActions() {
    var declineBtn = el('dashboardMenuImagesDeclineBtn');
    var approveBtn = el('dashboardMenuImagesApproveBtn');
    if (declineBtn && !declineBtn._ttmsBound) {
      declineBtn._ttmsBound = true;
      declineBtn.addEventListener('click', function () {
        commitSwipe('decline', 'decline');
      });
    }
    if (approveBtn && !approveBtn._ttmsBound) {
      approveBtn._ttmsBound = true;
      approveBtn.addEventListener('click', function () {
        commitSwipe('approve', 'approve');
      });
    }

    if (!document._ttmsReelKeyBound) {
      document._ttmsReelKeyBound = true;
      document.addEventListener('keydown', function (e) {
        var reel = el('dashboardMenuImagesReel');
        if (!reel || reel.classList.contains('hidden')) return;
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          commitSwipe('approve', 'approve');
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          commitSwipe('decline', 'decline');
        }
      });
    }
  }

  async function refresh() {
    var loading = el('dashboardMenuImagesLoading');
    if (loading) loading.classList.remove('hidden');
    try {
      queue = await fetchPending();
      renderStack();
    } catch (e) {
      console.warn('[dashboard-menu-images]', e);
      showError(e.message || 'Unable to load pending photos.');
      queue = [];
      setSnapshotCount(0);
    } finally {
      if (loading) loading.classList.add('hidden');
    }
  }

  function ensureToast() {
    if (document.getElementById('dashboard-menu-images-toast')) return;
    var node = document.createElement('div');
    node.id = 'dashboard-menu-images-toast';
    node.className = 'dashboard-menu-images-toast';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    document.body.appendChild(node);
    window.showDashboardMenuImagesToast = function (msg) {
      node.textContent = msg;
      node.classList.add('is-visible');
      clearTimeout(window.showDashboardMenuImagesToast._t);
      window.showDashboardMenuImagesToast._t = setTimeout(function () {
        node.classList.remove('is-visible');
      }, 2800);
    };
  }

  function init() {
    var card = el('dashboardCardMenuImages');
    if (!card || !cfg() || !cfg().enabled) return;
    if (typeof AuthClient === 'undefined') return;

    ensureToast();
    bindReelActions();

    var refreshBtn = el('dashboardMenuImagesRefresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        refresh();
      });
    }

    AuthClient.whenReady().then(function () {
      if (!AuthClient.isAuthenticated() || !AuthClient.isAdmin()) {
        card.classList.add('hidden');
        return;
      }
      card.classList.remove('hidden');
      return refresh();
    });

    document.addEventListener('ttms:pull-refresh', function () {
      if (el('dashboardCardMenuImages')) refresh();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
