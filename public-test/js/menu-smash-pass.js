/**
 * Smash or pass — Tinder-style stack (intro feed + per-menu-item instances on reels).
 */
(function () {
  'use strict';

  var VOTER_KEY = 'ttmenus_smash_voter_id';
  var VOTES_KEY = 'ttmenus_smash_votes';
  var SWIPE_THRESHOLD = 72;
  var DRAG_LOCK_THRESHOLD = 16;
  var ROTATION_MAX = 14;

  var instances = new WeakMap();
  var initScheduled = null;
  var globalGen = 0;
  var lazyInitObserver = null;
  var sharedFeedSnapshot = null;
  var feedCache = {
    promise: null,
    data: null,
    gen: 0,
    abort: null,
  };

  function cfg() {
    return typeof window.MENU_IMAGE_CONFIG !== 'undefined' ? window.MENU_IMAGE_CONFIG : null;
  }

  function apiBase() {
    var c = cfg();
    return c && c.apiUrl ? String(c.apiUrl).replace(/\/+$/, '') : '';
  }

  function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizePath(path) {
    var p = String(path || '').trim();
    if (!p) return '';
    if (p.charAt(0) !== '/') p = '/' + p;
    p = p.replace(/\/+$/, '');
    return p || '/';
  }

  function normalizeImagePath(path) {
    return String(path || '').trim().replace(/^\/+/, '');
  }

  function itemSourcePath(item) {
    if (!item) return '';
    var url = item.url || item.image_url || item.imageUrl || '';
    if (/^https?:\/\//i.test(url)) return url;
    return normalizeImagePath(url);
  }

  function parseJsonAttr(el, name) {
    if (!el) return [];
    try {
      var raw = el.getAttribute(name);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  var ADD_PHOTO_ITEM_ID = 'add-photo';

  function isLocalItem(item) {
    return !!(item && (item.local || String(item.id || '').indexOf('local:') === 0));
  }

  function isAddPhotoItem(item) {
    return !!(item && (item.addPhoto || item.id === ADD_PHOTO_ITEM_ID));
  }

  function createAddPhotoDeckItem() {
    return { id: ADD_PHOTO_ITEM_ID, addPhoto: true, local: true };
  }

  function appendAddPhotoToItemDeck(deck) {
    var items = (deck || []).slice();
    items.splice(Math.min(2, items.length), 0, createAddPhotoDeckItem());
    return items;
  }

  function isDraftAssetPath(path) {
    return normalizeImagePath(path).indexOf('draft-assets/') === 0;
  }

  function getLocalImageSource(inst) {
    if (inst.root.classList.contains('menu-smash-pass--modal')) {
      if (typeof window.getMenuReelsModalActiveCard === 'function') {
        var active = window.getMenuReelsModalActiveCard();
        if (active) return active;
      }
    }
    return inst.root.closest('.menu-item-card');
  }

  function collectLocalImagesFromCard(card) {
    if (!card) return [];
    var seen = {};
    var paths = [];

    function add(path) {
      if (path && typeof path === 'object') {
        path = path.image || path.url || '';
      }
      var p = normalizeImagePath(path);
      if (!p || seen[p] || isDraftAssetPath(p)) return;
      seen[p] = true;
      paths.push(p);
    }

    try {
      var promos = JSON.parse(card.getAttribute('data-promotions') || '[]');
      if (Array.isArray(promos)) {
        promos.forEach(function (promo) {
          if (promo && promo.image) add(promo.image);
        });
      }
    } catch (e) { /* ignore */ }

    parseJsonAttr(card, 'data-images-array').forEach(add);
    parseJsonAttr(card, 'data-regular-images-array').forEach(add);

    return paths;
  }

  function localImageToItem(path, menuItemPath) {
    var normalized = normalizeImagePath(path);
    return {
      id: 'local:' + normalized,
      local: true,
      source: 'menu',
      url: normalized,
      menu_item_path: menuItemPath,
      like_count: 0,
      dislike_count: 0,
      user_vote: '',
    };
  }

  function mergeItemDeck(inst, feedItems) {
    var feed = (feedItems || [])
      .map(normalizeItem)
      .filter(function (item) {
        return !!item;
      });

    if (!inst.isItemScoped) {
      return sortItems(feed);
    }

    var card = getLocalImageSource(inst);
    var localItems = collectLocalImagesFromCard(card).map(function (path) {
      return localImageToItem(path, inst.menuItemPath);
    });

    return appendAddPhotoToItemDeck(localItems.concat(sortItems(feed)));
  }

  function getVoterId() {
    try {
      var id = localStorage.getItem(VOTER_KEY);
      if (!id) {
        id = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(VOTER_KEY, id);
      }
      return id;
    } catch (e) {
      return 'v_anon_' + Date.now();
    }
  }

  function getCachedVotes() {
    try {
      var raw = localStorage.getItem(VOTES_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function cacheVote(id, vote) {
    try {
      var votes = getCachedVotes();
      votes[id] = vote;
      localStorage.setItem(VOTES_KEY, JSON.stringify(votes));
    } catch (e) { /* ignore */ }
  }

  function getUserVote(item) {
    if (!item) return '';
    if (item.user_vote) return item.user_vote;
    if (item.userVote) return item.userVote;
    return getCachedVotes()[item.id] || '';
  }

  function normalizeItem(item) {
    if (!item || !item.id) return null;
    var vote = getUserVote(item);
    if (vote) item.user_vote = vote;
    return item;
  }

  function sortItems(list) {
    return list.slice().sort(function (a, b) {
      var aRated = !!getUserVote(a);
      var bRated = !!getUserVote(b);
      if (aRated !== bRated) return aRated ? 1 : -1;
      return 0;
    });
  }

  function clientIdForRoot(root) {
    return (
      (root && root.getAttribute('data-client-id')) ||
      window.CLIENT_ID ||
      (cfg() && cfg().clientId) ||
      '_ttms_menu_demo'
    );
  }

  function queryRoots() {
    return Array.prototype.slice.call(document.querySelectorAll('.menu-smash-pass'));
  }

  function isItemScopedRoot(root) {
    return !!(root && root.classList.contains('menu-item-smash-pass'));
  }

  function shouldInitItemRootImmediately(root) {
    return !!(
      root &&
      isItemScopedRoot(root) &&
      (root.classList.contains('menu-smash-pass--modal') ||
        root.classList.contains('menu-smash-pass--single-page'))
    );
  }

  function isRootInitialized(root) {
    return root && root.getAttribute('data-smash-pass-inited') === '1';
  }

  function markRootInitialized(root) {
    if (root) root.setAttribute('data-smash-pass-inited', '1');
  }

  function clearInitializedMarkers() {
    queryRoots().forEach(function (root) {
      root.removeAttribute('data-smash-pass-inited');
    });
  }

  function disconnectLazyObserver() {
    if (lazyInitObserver) {
      lazyInitObserver.disconnect();
      lazyInitObserver = null;
    }
  }

  function initRootWithFeed(root, feed, generation) {
    if (!root || isRootInitialized(root)) return;
    initInstanceNow(getInstance(root), feed, generation);
    markRootInitialized(root);
  }

  function isCardNearViewport(card, track) {
    if (!card) return false;
    var trackRect = track ? track.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    var cardRect = card.getBoundingClientRect();
    var buffer = track ? trackRect.height * 1.25 : window.innerHeight * 1.25;
    return cardRect.bottom > trackRect.top - buffer && cardRect.top < trackRect.bottom + buffer;
  }

  function setupLazyItemSmashPass(feed, generation) {
    disconnectLazyObserver();
    if (generation !== globalGen) return;

    var track = document.getElementById('menu-reels-track');
    var pendingRoots = queryRoots().filter(function (root) {
      return isItemScopedRoot(root) && !isRootInitialized(root);
    });
    if (!pendingRoots.length) return;

    pendingRoots.forEach(function (root) {
      if (shouldInitItemRootImmediately(root)) {
        initRootWithFeed(root, feed, generation);
        return;
      }
      var card = root.closest('.menu-item-card.menu-reels-slide');
      if (isCardNearViewport(card, track)) {
        initRootWithFeed(root, feed, generation);
      }
    });

    var remaining = pendingRoots.filter(function (root) {
      return !isRootInitialized(root);
    });
    if (!remaining.length) return;

    lazyInitObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var card = entry.target;
          var root = card.querySelector('.menu-item-smash-pass');
          if (!root || isRootInitialized(root)) return;
          var snap = sharedFeedSnapshot;
          var feed = snap ? snap.feed : [];
          var generation = snap ? snap.generation : globalGen;
          initRootWithFeed(root, feed, generation);
          lazyInitObserver.unobserve(card);
        });
      },
      {
        root: track || null,
        rootMargin: '100% 0px',
        threshold: 0.01,
      }
    );

    remaining.forEach(function (root) {
      if (shouldInitItemRootImmediately(root)) return;
      var card = root.closest('.menu-item-card.menu-reels-slide');
      if (card) lazyInitObserver.observe(card);
    });
  }

  function initMenuSmashPassRoot(root) {
    if (!root || !cfg() || !cfg().enabled || isRootInitialized(root)) return;

    var generation = globalGen;
    if (sharedFeedSnapshot && sharedFeedSnapshot.generation === generation) {
      initRootWithFeed(root, sharedFeedSnapshot.feed, generation);
      return;
    }

    fetchSharedFeed()
      .then(function (feed) {
        if (generation !== globalGen) return;
        sharedFeedSnapshot = { feed: feed, generation: generation };
        initRootWithFeed(root, feed, generation);
      })
      .catch(function () {
        if (generation !== globalGen) return;
        sharedFeedSnapshot = { feed: [], generation: generation };
        initRootWithFeed(root, [], generation);
      });
  }

  function createInstance(root) {
    return {
      root: root,
      items: [],
      deckIndex: 0,
      busy: false,
      dragState: null,
      gen: 0,
      menuItemPath: normalizePath(root.getAttribute('data-menu-item-path') || ''),
      isItemScoped: root.classList.contains('menu-item-smash-pass'),
    };
  }

  function getInstance(root) {
    if (!root) return null;
    if (!instances.has(root)) {
      instances.set(root, createInstance(root));
    }
    return instances.get(root);
  }

  function q(inst, sel) {
    return inst.root ? inst.root.querySelector(sel) : null;
  }

  function currentItem(inst) {
    if (!inst.items.length) return null;
    return inst.items[inst.deckIndex % inst.items.length];
  }

  function nextItem(inst) {
    if (!inst.items.length) return null;
    return inst.items[(inst.deckIndex + 1) % inst.items.length];
  }

  function advanceDeck(inst) {
    if (!inst.items.length) return;
    inst.deckIndex = (inst.deckIndex + 1) % inst.items.length;
  }

  function menuItemTitle(path) {
    var p = String(path || '').replace(/\/$/, '');
    var slug = p.split('/').filter(Boolean).pop() || 'Menu item';
    return slug.replace(/-/g, ' ').replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  function menuItemHref(path) {
    var p = String(path || '').trim();
    if (!p) return '#';
    if (p.charAt(0) !== '/') p = '/' + p;
    return p;
  }

  function thumbUrl(item) {
    if (item.thumbor_url || item.thumborUrl) {
      return item.thumbor_url || item.thumborUrl;
    }
    var url = item.url || '';
    if (!url) return '';
    if (isLocalItem(item) && typeof window.TtmsThumbor !== 'undefined') {
      if (window.TtmsThumbor.resolvePreviewSrc) {
        return (
          window.TtmsThumbor.resolvePreviewSrc(url, { width: 400, height: 500 }) ||
          window.TtmsThumbor.menuImageSrc(url, 'smash') ||
          ''
        );
      }
      if (window.TtmsThumbor.menuImageSrc) {
        return window.TtmsThumbor.menuImageSrc(url, 'smash') || '';
      }
      return url.charAt(0) === '/' ? url : '/' + url;
    }
    if (typeof window.TtmsThumbor !== 'undefined' && window.TtmsThumbor.menuImageSrc) {
      return window.TtmsThumbor.menuImageSrc(url, 'smash') || url;
    }
    return url;
  }

  var ADD_PHOTO_BTN_HTML =
    '<button type="button" class="menu-image-add-btn" style="display:none;" title="Add a photo for this menu item" aria-label="Add a photo for this menu item">' +
    '<i class="fa fa-camera" aria-hidden="true"></i><span class="menu-image-add-btn__label">Add photo</span></button>';

  function buildItemEmptyStateHtml() {
    return '';
  }

  function buildAddPhotoCardHtml(stackIndex, compact) {
    var depth = stackIndex === 0 ? ' is-top' : ' is-behind';
    return (
      '<article class="menu-smash-pass-card menu-smash-pass-card--add-photo is-local is-unrated' +
      depth +
      '" data-image-id="' +
      ADD_PHOTO_ITEM_ID +
      '" role="button" tabindex="0" aria-label="Add a photo for this menu item">' +
      '<div class="menu-smash-pass-card__media menu-smash-pass-card__add-photo-media">' +
      '<div class="menu-smash-pass-card__add-photo-bg" aria-hidden="true"></div>' +
      '<div class="menu-smash-pass-card__add-photo-body">' +
      '<span class="menu-smash-pass-card__add-photo-ring" aria-hidden="true"><i class="fa fa-camera"></i></span>' +
      '<p class="menu-smash-pass-card__add-photo-title">Share your shot</p>' +
      '<p class="menu-smash-pass-card__add-photo-hint">Be the first to add a photo</p>' +
      '<div class="menu-image-actions menu-image-actions--standalone">' +
      ADD_PHOTO_BTN_HTML +
      '</div>' +
      '</div>' +
      '</div>' +
      (compact
        ? ''
        : '<div class="menu-smash-pass-card__info menu-smash-pass-card__info--add-photo">' +
          '<p class="menu-smash-pass-card__add-photo-swipe">Swipe to browse · tap to upload</p>' +
          '</div>') +
      '</article>'
    );
  }

  function bindItemAddPhoto(inst) {
    if (!inst || !inst.isItemScoped || !inst.root) return;
    if (typeof window.bindMenuImageAddButton !== 'function') return;
    window.bindMenuImageAddButton(
      inst.root,
      clientIdForRoot(inst.root),
      inst.menuItemPath || inst.root.getAttribute('data-menu-item-path') || ''
    );
  }

  function showError(inst, msg) {
    var err = q(inst, '.menu-smash-pass__error');
    var reel = q(inst, '.menu-smash-pass__reel');
    var empty = q(inst, '.menu-smash-pass__empty');
    var emptyState = q(inst, '.menu-smash-pass__empty-state');
    if (err) {
      err.textContent = msg || '';
      err.classList.toggle('hidden', !msg);
    }
    if (reel) reel.classList.add('hidden');
    if (empty) empty.classList.add('hidden');
    if (emptyState) emptyState.classList.add('hidden');
    inst.root.classList.remove('menu-smash-pass--no-photos');
    updateVoteActions(inst);
  }

  function showEmpty(inst) {
    var empty = q(inst, '.menu-smash-pass__empty');
    var emptyState = q(inst, '.menu-smash-pass__empty-state');
    var reel = q(inst, '.menu-smash-pass__reel');
    var err = q(inst, '.menu-smash-pass__error');
    if (err) err.classList.add('hidden');
    if (inst.isItemScoped) {
      inst.items = appendAddPhotoToItemDeck([]);
      inst.deckIndex = 0;
      renderStack(inst);
      return;
    }
    if (reel) reel.classList.add('hidden');
    inst.root.classList.remove('menu-smash-pass--no-photos');
    if (emptyState) emptyState.classList.add('hidden');
    if (empty) empty.classList.remove('hidden');
    updateVoteActions(inst);
  }

  function showReel(inst) {
    var empty = q(inst, '.menu-smash-pass__empty');
    var emptyState = q(inst, '.menu-smash-pass__empty-state');
    var reel = q(inst, '.menu-smash-pass__reel');
    var err = q(inst, '.menu-smash-pass__error');
    if (err) err.classList.add('hidden');
    if (empty) empty.classList.add('hidden');
    if (emptyState) emptyState.classList.add('hidden');
    if (reel) reel.classList.remove('hidden');
    inst.root.classList.remove('menu-smash-pass--no-photos');
    updateVoteActions(inst);
  }

  function isModalSmashPass(inst) {
    return !!(
      inst &&
      inst.root &&
      (inst.root.classList.contains('menu-smash-pass--modal') ||
        inst.root.classList.contains('menu-smash-pass--single-page'))
    );
  }

  function hasVoteActions(inst) {
    return !!(inst && !inst.isItemScoped);
  }

  function updateVoteActions(inst) {
    if (!hasVoteActions(inst)) return;
    var actions = q(inst, '.menu-smash-pass__actions');
    var hint = q(inst, '.menu-smash-pass__vote-hint');
    var reel = q(inst, '.menu-smash-pass__reel');
    var visible =
      !!inst.items.length &&
      reel &&
      !reel.classList.contains('hidden') &&
      !inst.root.classList.contains('menu-smash-pass--no-photos');

    if (actions) actions.classList.toggle('hidden', !visible);
    if (hint) hint.classList.toggle('hidden', !visible);
    if (actions) {
      actions.querySelectorAll('[data-smash-action]').forEach(function (btn) {
        btn.disabled = inst.busy || !visible;
      });
    }
  }

  function bindVoteActions(inst) {
    if (!hasVoteActions(inst) || inst.root._ttmsVoteActionsBound) return;
    inst.root._ttmsVoteActionsBound = true;

    inst.root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-smash-action]');
      if (!btn || !inst.root.contains(btn) || inst.busy) return;
      var action = btn.getAttribute('data-smash-action');
      if (action === 'like') {
        commitVote(inst, 'like', 'like');
      } else if (action === 'dislike') {
        commitVote(inst, 'dislike', 'dislike');
      }
    });
  }

  function updateProgress(inst) {
    if (inst.isItemScoped) return;
    var progress = q(inst, '.menu-smash-pass__progress');
    if (!progress) return;
    if (!inst.items.length) {
      progress.textContent = '';
      return;
    }
    var unrated = inst.items.filter(function (item) {
      return !isLocalItem(item) && !getUserVote(item);
    }).length;
    var position = (inst.deckIndex % inst.items.length) + 1;
    progress.textContent =
      position + ' of ' + inst.items.length + (unrated ? ' · ' + unrated + ' to rate' : '');
  }

  function buildImageTag(preview, srcPath, isDraft, className, lazy) {
    if (!preview && !srcPath) return '';
    return (
      '<img' +
      (preview ? ' src="' + escapeHtml(preview) + '"' : '') +
      (srcPath ? ' data-src-path="' + escapeHtml(srcPath) + '"' : '') +
      (isDraft && !preview ? ' data-draft-pending="1"' : '') +
      (lazy ? ' loading="lazy"' : ' loading="eager"') +
      ' alt="" class="' +
      className +
      '" draggable="false" decoding="async" onerror="window.TtmsThumbor&&window.TtmsThumbor.fallbackImg(this)">'
    );
  }

  function canViewSmashPassDislikes() {
    if (typeof AuthClient === 'undefined' || !AuthClient.isAuthenticated()) return false;
    if (AuthClient.isSuperadmin && AuthClient.isSuperadmin()) return true;
    if (!AuthClient.isAdmin || !AuthClient.isAdmin()) return false;
    var c = cfg();
    var siteClient =
      (c && c.clientId) || window.SITE_CLIENT_ID || window.CLIENT_ID || '_ttms_menu_demo';
    var user = AuthClient.getCurrentUser && AuthClient.getCurrentUser();
    if (!user || !siteClient) return false;
    var assigned = String(user.client_id || '')
      .split(',')
      .map(function (s) {
        return s.trim();
      });
    if (assigned.indexOf(siteClient) !== -1) return true;
    if (typeof AuthClientAccess !== 'undefined' && AuthClientAccess.hasClientAccess) {
      return AuthClientAccess.hasClientAccess();
    }
    return false;
  }

  function buildDislikesCountHtml(dislikes) {
    if (!canViewSmashPassDislikes()) return '';
    return (
      '<button type="button" class="menu-smash-pass-card__dislikes" data-count="dislikes" data-smash-admin-delete="1" aria-label="Delete photo (' +
      dislikes +
      ' dislikes)" title="Admin: delete this photo">✕ ' +
      dislikes +
      '</button>'
    );
  }

  function siteClientId() {
    var c = cfg();
    return (c && c.clientId) || window.SITE_CLIENT_ID || window.CLIENT_ID || '_ttms_menu_demo';
  }

  function getAuthToken() {
    if (typeof AuthClient !== 'undefined' && AuthClient.getAccessToken) {
      return AuthClient.getAccessToken();
    }
    try {
      return localStorage.getItem('ttmenus_access_token');
    } catch (e) {
      return null;
    }
  }

  function findItemInInstance(inst, imageId) {
    if (!inst || !inst.items || !imageId) return null;
    for (var i = 0; i < inst.items.length; i++) {
      if (inst.items[i].id === imageId) return inst.items[i];
    }
    return null;
  }

  function removePhotoFromInstances(imageId) {
    queryRoots().forEach(function (root) {
      var inst = getInstance(root);
      if (!inst || !inst.items.length) return;

      var hadItem = false;
      inst.items = inst.items.filter(function (item) {
        if (item.id === imageId) {
          hadItem = true;
          return false;
        }
        return true;
      });

      if (!hadItem) return;

      if (!inst.items.length) {
        inst.deckIndex = 0;
      } else if (inst.deckIndex >= inst.items.length) {
        inst.deckIndex = 0;
      }

      inst.busy = false;
      renderStack(inst);
    });
  }

  function refreshMenuImagesForItem(item) {
    if (!item || !item.menu_item_path) return;
    var targetPath = normalizePath(item.menu_item_path);
    document.querySelectorAll('[data-menu-item-path]').forEach(function (host) {
      if (normalizePath(host.getAttribute('data-menu-item-path')) !== targetPath) return;
      if (typeof window.refreshMenuItemImages === 'function') {
        window.refreshMenuItemImages(host);
      }
    });
  }

  function promptDeleteSmashPassPhoto(inst, imageId) {
    if (!canViewSmashPassDislikes()) return;

    var item = findItemInInstance(inst, imageId);
    if (!item || isLocalItem(item) || isAddPhotoItem(item)) return;

    if (
      !window.confirm(
        'Delete this community photo? It will be removed from the menu and cannot be undone.'
      )
    ) {
      return;
    }

    deleteSmashPassPhoto(item);
  }

  async function deleteSmashPassPhoto(item) {
    if (!item || !item.id || isLocalItem(item)) return;

    var token = getAuthToken();
    if (!token) {
      alert('Please sign in as a menu admin to delete photos.');
      return;
    }

    var base = apiBase();
    if (!base) {
      alert('Menu image service is not configured.');
      return;
    }

    queryRoots().forEach(function (root) {
      var inst = getInstance(root);
      if (!inst) return;
      inst.busy = true;
      updateVoteActions(inst);
    });

    var deleteUrl =
      base +
      '/admin/menu-images/' +
      encodeURIComponent(item.id) +
      '?client_id=' +
      encodeURIComponent(siteClientId());

    try {
      var res = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json',
        },
      });
      var json = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        throw new Error(json.error || 'Failed to delete photo.');
      }

      if (feedCache.data) {
        feedCache.data = feedCache.data.filter(function (entry) {
          return entry.id !== item.id;
        });
      }

      removePhotoFromInstances(item.id);
      refreshMenuImagesForItem(item);
    } catch (err) {
      alert(err.message || 'Could not delete photo. Try again.');
      queryRoots().forEach(function (root) {
        var inst = getInstance(root);
        if (!inst) return;
        inst.busy = false;
        updateVoteActions(inst);
      });
    }
  }

  function bindAdminDeleteActions(inst) {
    if (!canViewSmashPassDislikes()) return;
    if (!inst.root || inst.root._ttmsAdminDeleteBound) return;
    inst.root._ttmsAdminDeleteBound = true;

    inst.root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-smash-admin-delete]');
      if (!btn || !inst.root.contains(btn) || inst.busy) return;
      e.preventDefault();
      e.stopPropagation();

      var card = btn.closest('.menu-smash-pass-card');
      if (!card) return;
      var imageId = card.getAttribute('data-image-id');
      if (!imageId) return;

      promptDeleteSmashPassPhoto(inst, imageId);
    });
  }

  function buildMediaHtml(preview, srcPath, isDraft, layered) {
    if (!preview && !srcPath) return '';
    if (layered) {
      var baseClass = 'menu-smash-pass-card__img';
      return (
        '<div class="menu-smash-pass-card__img-stage">' +
        buildImageTag(preview, srcPath, isDraft, baseClass + ' menu-smash-pass-card__img--backdrop', true) +
        buildImageTag(preview, srcPath, isDraft, baseClass + ' menu-smash-pass-card__img--front', false) +
        '</div>'
      );
    }
    return buildImageTag(preview, srcPath, isDraft, 'menu-smash-pass-card__img', true);
  }

  function buildCardHtml(item, stackIndex, compact) {
    if (isAddPhotoItem(item)) {
      return buildAddPhotoCardHtml(stackIndex, compact);
    }
    var preview = thumbUrl(item);
    var srcPath = itemSourcePath(item);
    if (!preview && srcPath) {
      if (typeof window.TtmsThumbor !== 'undefined' && window.TtmsThumbor.resolvePreviewSrc) {
        preview =
          window.TtmsThumbor.resolvePreviewSrc(srcPath, { width: 400, height: 500 }) ||
          window.TtmsThumbor.menuImageSrc(srcPath, 'smash') ||
          '';
      }
      if (!preview) {
        preview = /^https?:\/\//i.test(srcPath) ? srcPath : '/' + srcPath.replace(/^\/+/, '');
      }
    }
    var isDraft = srcPath.indexOf('draft-assets/') === 0;
    var title = menuItemTitle(item.menu_item_path);
    var likes = item.like_count != null ? item.like_count : item.likeCount || 0;
    var dislikes = item.dislike_count != null ? item.dislike_count : item.dislikeCount || 0;
    var userVote = getUserVote(item);
    var local = isLocalItem(item);
    var depth = stackIndex === 0 ? ' is-top' : ' is-behind';
    var ratedClass = local
      ? ' is-local'
      : userVote === 'like'
        ? ' is-rated-smash'
        : userVote === 'dislike'
          ? ' is-rated-pass'
          : ' is-unrated';

    var infoHtml = '';
    var itemHref = !local && item.menu_item_path ? menuItemHref(item.menu_item_path) : '';
    if (!compact) {
      infoHtml =
        '<div class="menu-smash-pass-card__info">' +
        '<p class="menu-smash-pass-card__title">' +
        '<a class="menu-smash-pass-card__title-link" href="' +
        escapeHtml(itemHref) +
        '">' +
        escapeHtml(title) +
        '</a></p>' +
        '<div class="menu-smash-pass-card__counts">' +
        '<span class="menu-smash-pass-card__likes" data-count="likes">♥ ' +
        likes +
        '</span>' +
        buildDislikesCountHtml(dislikes) +
        '</div>' +
        '</div>';
    } else if (!local) {
      infoHtml =
        '<div class="menu-smash-pass-card__info menu-smash-pass-card__info--compact">' +
        '<div class="menu-smash-pass-card__counts">' +
        '<span class="menu-smash-pass-card__likes" data-count="likes">♥ ' +
        likes +
        '</span>' +
        buildDislikesCountHtml(dislikes) +
        '</div>' +
        '</div>';
    }

    var imgHtml = buildMediaHtml(preview, srcPath, isDraft, compact);

    return (
      '<article class="menu-smash-pass-card' +
      depth +
      ratedClass +
      '" data-image-id="' +
      escapeHtml(item.id) +
      '"' +
      (local ? ' data-local-image="1"' : '') +
      (itemHref ? ' data-menu-item-href="' + escapeHtml(itemHref) + '"' : '') +
      '>' +
      (local
        ? ''
        : '<div class="menu-smash-pass-card__stamp menu-smash-pass-card__stamp--smash" aria-hidden="true"><i class="fa fa-heart"></i> LIKE</div>' +
          '<div class="menu-smash-pass-card__stamp menu-smash-pass-card__stamp--pass" aria-hidden="true"><i class="fa fa-thumbs-down"></i> PASS</div>') +
      '<div class="menu-smash-pass-card__media">' +
      imgHtml +
      '</div>' +
      infoHtml +
      '</article>'
    );
  }

  function setCardDragStyles(card, dx, dy) {
    if (!card) return;
    var rot = Math.max(-ROTATION_MAX, Math.min(ROTATION_MAX, dx * 0.08));
    card.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) rotate(' + rot + 'deg)';
    if (
      !card.classList.contains('is-local') &&
      !card.classList.contains('menu-smash-pass-card--add-photo')
    ) {
      card.style.setProperty('--smash-stamp-opacity', String(Math.min(1, Math.max(0, dx / SWIPE_THRESHOLD))));
      card.style.setProperty('--pass-stamp-opacity', String(Math.min(1, Math.max(0, -dx / SWIPE_THRESHOLD))));
    }
  }

  function clearCardDragStyles(card) {
    if (!card) return;
    card.style.transform = '';
    card.style.removeProperty('--smash-stamp-opacity');
    card.style.removeProperty('--pass-stamp-opacity');
  }

  function flyOffCard(card, direction, done) {
    if (!card) {
      if (done) done();
      return;
    }
    card.classList.add('is-exiting');
    card.classList.add(direction === 'like' ? 'is-exit-smash' : 'is-exit-pass');
    setTimeout(function () {
      if (done) done();
    }, 320);
  }

  async function postVote(id, vote) {
    var base = apiBase();
    if (!base) throw new Error('Menu image service is not configured.');
    var res = await fetch(base + '/menu-images/' + encodeURIComponent(id) + '/vote', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        voter_id: getVoterId(),
        vote: vote,
      }),
    });
    var json = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      throw new Error(json.error || 'Could not save your vote.');
    }
    return json.data || {};
  }

  function advanceDeckWithoutVote(inst, direction) {
    if (inst.busy || !inst.items.length) return;
    var stack = q(inst, '.menu-smash-pass__stack');
    var card = stack && stack.querySelector('.menu-smash-pass-card.is-top');
    inst.busy = true;
    updateVoteActions(inst);

    if (card) {
      var dx = direction === 'like' ? window.innerWidth * 0.35 : -window.innerWidth * 0.35;
      setCardDragStyles(card, dx, 0);
    }

    flyOffCard(card, direction, function () {
      advanceDeck(inst);
      renderStack(inst);
      inst.busy = false;
      updateVoteActions(inst);
    });
  }

  function commitVote(inst, vote, direction) {
    if (inst.busy || !inst.items.length) return;
    var item = currentItem(inst);
    if (!item) return;

    if (isAddPhotoItem(item) || (inst.isItemScoped && isLocalItem(item))) {
      advanceDeckWithoutVote(inst, direction);
      return;
    }

    var stack = q(inst, '.menu-smash-pass__stack');
    var card = stack && stack.querySelector('.menu-smash-pass-card.is-top');
    inst.busy = true;
    updateVoteActions(inst);

    if (card) {
      var dx = direction === 'like' ? window.innerWidth * 0.35 : -window.innerWidth * 0.35;
      setCardDragStyles(card, dx, 0);
    }

    flyOffCard(card, direction, function () {
      postVote(item.id, vote)
        .then(function (data) {
          window.dispatchEvent(new CustomEvent('ttms:smash-vote', {
            detail: {
              vote: vote,
              itemId: item.id,
              likeCount: data.like_count != null ? data.like_count : item.like_count
            }
          }));
          item.user_vote = vote;
          item.like_count = data.like_count != null ? data.like_count : item.like_count;
          item.dislike_count = data.dislike_count != null ? data.dislike_count : item.dislike_count;
          cacheVote(item.id, vote);
          advanceDeck(inst);
          renderStack(inst);
        })
        .catch(function (err) {
          showError(inst, err.message || 'Vote failed.');
          if (card) {
            card.classList.remove('is-exiting', 'is-exit-smash', 'is-exit-pass');
            clearCardDragStyles(card);
          }
          renderStack(inst);
        })
        .finally(function () {
          inst.busy = false;
          updateVoteActions(inst);
        });
    });
  }

  function clearCardDragState(inst, card, pointerId) {
    if (!card) return;
    card.classList.remove('is-dragging');
    try {
      if (pointerId != null) card.releasePointerCapture(pointerId);
    } catch (err) {}
    clearCardDragStyles(card);
    if (inst.dragState && inst.dragState.card === card) {
      inst.dragState = null;
    }
  }

  function lockCardDrag(inst, card, e) {
    if (!inst.dragState || inst.dragState.card !== card || inst.dragState.locked) return;
    inst.dragState.locked = true;
    card.classList.add('is-dragging');
    try {
      card.setPointerCapture(e.pointerId);
    } catch (err) {}
  }

  function suppressCardClickAfterSwipe(card) {
    if (!card) return;
    card._ttmsSmashSuppressClick = true;
    setTimeout(function () {
      card._ttmsSmashSuppressClick = false;
    }, 420);
  }

  function isSmashPassNonDragTarget(el) {
    return !!(el && el.closest && el.closest('.menu-smash-pass-card__counts'));
  }

  function hasCommunityPhotos(inst) {
    if (!inst || !inst.items || !inst.items.length) return false;
    for (var i = 0; i < inst.items.length; i += 1) {
      if (!isLocalItem(inst.items[i])) return true;
    }
    return false;
  }

  function isPointerTapOnCard(inst, card, e) {
    if (!inst.dragState || inst.dragState.card !== card) return false;
    var dx = e.clientX - inst.dragState.startX;
    var dy = e.clientY - inst.dragState.startY;
    if (Math.abs(dx) >= DRAG_LOCK_THRESHOLD || Math.abs(dy) >= DRAG_LOCK_THRESHOLD) {
      return false;
    }
    if (isSmashPassNonDragTarget(e.target)) return false;
    return true;
  }

  function isAddPhotoCardTap(inst, card, e) {
    if (!inst.isItemScoped || !card.classList.contains('menu-smash-pass-card--add-photo')) return false;
    return isPointerTapOnCard(inst, card, e);
  }

  function isLocalItemOrderTap(inst, card, e) {
    if (!inst.isItemScoped || !card.classList.contains('is-local')) return false;
    if (card.classList.contains('menu-smash-pass-card--add-photo')) return false;
    if (isModalSmashPass(inst)) return false;
    return isPointerTapOnCard(inst, card, e);
  }

  function isItemCommunityPhotoOrderTap(inst, card, e) {
    if (!inst.isItemScoped || card.classList.contains('is-local')) return false;
    if (isModalSmashPass(inst)) return false;
    return isPointerTapOnCard(inst, card, e);
  }

  function isSmashPassTap(inst, card, e) {
    if (!isPointerTapOnCard(inst, card, e)) return false;
    return !!card.getAttribute('data-menu-item-href');
  }

  function openItemOrderFromSmashPass(inst, e) {
    var itemCard = getLocalImageSource(inst);
    if (!itemCard) return;
    var url = itemCard.getAttribute('data-item-url');
    if (!url) return;
    if (typeof window.openReelsMenuItemOrder === 'function') {
      window.openReelsMenuItemOrder(itemCard, url, e);
    } else if (typeof window.toggleItemExpansion === 'function') {
      window.toggleItemExpansion(itemCard, url, e);
    }
  }

  function navigateSmashPassCardItem(card) {
    if (!card || card.classList.contains('is-local')) return;
    var href = card.getAttribute('data-menu-item-href');
    if (!href || href === '#') return;
    if (typeof window.closeAllPanelsBeforeNavigation === 'function') {
      window.closeAllPanelsBeforeNavigation();
    } else if (typeof window.ensureMenuReelsItemModalClosed === 'function') {
      window.ensureMenuReelsItemModalClosed();
    }
    if (window.TTMSBarba && typeof window.TTMSBarba.navigate === 'function') {
      window.TTMSBarba.navigate(href);
      return;
    }
    if (typeof window.barba !== 'undefined' && typeof window.barba.go === 'function') {
      try {
        var url = new URL(href, window.location.href);
        window.barba.go(url.pathname + url.search + url.hash);
        return;
      } catch (err) {}
    }
    window.location.assign(href);
  }

  function bindCardDrag(inst, card) {
    if (!card || card._ttmsSmashDragBound) return;
    card._ttmsSmashDragBound = true;

    card.addEventListener(
      'click',
      function (e) {
        if (!card._ttmsSmashSuppressClick) return;
        e.preventDefault();
        e.stopPropagation();
        card._ttmsSmashSuppressClick = false;
      },
      true
    );

    function onPointerDown(e) {
      if (inst.busy || e.button > 0) return;
      if (isSmashPassNonDragTarget(e.target)) return;
      inst.dragState = {
        card: card,
        startX: e.clientX,
        startY: e.clientY,
        pointerId: e.pointerId,
        locked: false,
      };
    }

    function onPointerMove(e) {
      if (!inst.dragState || inst.dragState.card !== card) return;

      var dx = e.clientX - inst.dragState.startX;
      var dy = e.clientY - inst.dragState.startY;
      var absDx = Math.abs(dx);
      var absDy = Math.abs(dy);

      if (!inst.dragState.locked) {
        if (absDy > absDx && absDy >= DRAG_LOCK_THRESHOLD) {
          clearCardDragState(inst, card, null);
          return;
        }
        if (absDx < DRAG_LOCK_THRESHOLD && absDy < DRAG_LOCK_THRESHOLD) {
          return;
        }
        if (absDx <= absDy) {
          clearCardDragState(inst, card, null);
          return;
        }
        lockCardDrag(inst, card, e);
      }

      setCardDragStyles(card, dx, dy * 0.35);
    }

    function onPointerUp(e) {
      if (!inst.dragState || inst.dragState.card !== card) return;

      if (!inst.dragState.locked) {
        if (isAddPhotoCardTap(inst, card, e)) {
          suppressCardClickAfterSwipe(card);
          var addBtn = card.querySelector('.menu-image-add-btn');
          if (addBtn) addBtn.click();
        } else if (isLocalItemOrderTap(inst, card, e) || isItemCommunityPhotoOrderTap(inst, card, e)) {
          suppressCardClickAfterSwipe(card);
          openItemOrderFromSmashPass(inst, e);
        } else if (isSmashPassTap(inst, card, e) && !inst.isItemScoped) {
          suppressCardClickAfterSwipe(card);
          navigateSmashPassCardItem(card);
        }
        clearCardDragState(inst, card, null);
        return;
      }

      var dx = e.clientX - inst.dragState.startX;
      card.classList.remove('is-dragging');
      try {
        card.releasePointerCapture(e.pointerId);
      } catch (err) {}

      if (dx > SWIPE_THRESHOLD) {
        suppressCardClickAfterSwipe(card);
        commitVote(inst, 'like', 'like');
      } else if (dx < -SWIPE_THRESHOLD) {
        suppressCardClickAfterSwipe(card);
        commitVote(inst, 'dislike', 'dislike');
      } else {
        card.classList.add('is-snapping-back');
        clearCardDragStyles(card);
        setTimeout(function () {
          card.classList.remove('is-snapping-back');
        }, 280);
      }
      inst.dragState = null;
    }

    card.addEventListener('pointerdown', onPointerDown);
    card.addEventListener('pointermove', onPointerMove);
    card.addEventListener('pointerup', onPointerUp);
    card.addEventListener('pointercancel', onPointerUp);
  }

  function renderStack(inst) {
    var stack = q(inst, '.menu-smash-pass__stack');
    if (!stack) return;

    if (!inst.items.length) {
      stack.innerHTML = '';
      showEmpty(inst);
      updateProgress(inst);
      return;
    }

    showReel(inst);
    updateProgress(inst);

    var top = currentItem(inst);
    var behind = inst.items.length > 1 ? nextItem(inst) : null;
    var html = buildCardHtml(top, 0, inst.isItemScoped);
    if (behind && behind.id !== top.id) {
      html += buildCardHtml(behind, 1, inst.isItemScoped);
    }

    stack.innerHTML = html;

    var topCard = stack.querySelector('.menu-smash-pass-card.is-top');
    if (topCard) bindCardDrag(inst, topCard);
    hydrateStackImages(stack);
    if (window.TTMSImageLoader && typeof window.TTMSImageLoader.scan === 'function') {
      window.TTMSImageLoader.scan(stack);
    }
    if (inst.isItemScoped) bindItemAddPhoto(inst);
    updateVoteActions(inst);
  }

  function hydrateStackImages(stack) {
    if (!stack) return;
    var imgs = stack.querySelectorAll(
      '.menu-smash-pass-card__img--front[data-src-path], .menu-smash-pass-card__img[data-src-path]'
    );
    imgs.forEach(function (img) {
      var path = img.getAttribute('data-src-path') || '';
      if (path.indexOf('draft-assets/') !== 0) return;
      if (typeof window.hydrateAuthenticatedDraftAssetImg === 'function') {
        window.hydrateAuthenticatedDraftAssetImg(img);
      }
      var stage = img.closest('.menu-smash-pass-card__img-stage');
      if (!stage) return;
      var backdrop = stage.querySelector('.menu-smash-pass-card__img--backdrop');
      if (backdrop && img.src && backdrop.src !== img.src) {
        backdrop.src = img.src;
        backdrop.removeAttribute('data-draft-pending');
      }
    });
  }

  function filterFeedForInstance(inst, feed) {
    if (!inst.menuItemPath) return feed;
    return feed.filter(function (item) {
      return normalizePath(item.menu_item_path || item.menuItemPath) === inst.menuItemPath;
    });
  }

  async function fetchSharedFeed(signal) {
    if (feedCache.data && feedCache.gen === globalGen) {
      return feedCache.data;
    }
    if (feedCache.promise && feedCache.gen === globalGen) {
      return feedCache.promise;
    }

    var base = apiBase();
    if (!base) throw new Error('Menu image service is not configured.');

    if (feedCache.abort) {
      feedCache.abort.abort();
    }
    feedCache.abort = new AbortController();
    var mergedSignal = signal || feedCache.abort.signal;

    var clientID = clientIdForRoot(queryRoots()[0] || null);
    var url =
      base +
      '/menu-images/feed?client_id=' +
      encodeURIComponent(clientID) +
      '&voter_id=' +
      encodeURIComponent(getVoterId());

    feedCache.gen = globalGen;
    feedCache.promise = fetch(url, {
      headers: { Accept: 'application/json' },
      signal: mergedSignal,
    })
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        }).then(function (json) {
          if (!res.ok) {
            throw new Error(json.error || 'Could not load community photos.');
          }
          feedCache.data = json.data || [];
          return feedCache.data;
        });
      })
      .finally(function () {
        feedCache.promise = null;
      });

    return feedCache.promise;
  }

  function resetUiState(inst) {
    var err = q(inst, '.menu-smash-pass__error');
    var reel = q(inst, '.menu-smash-pass__reel');
    var empty = q(inst, '.menu-smash-pass__empty');
    var emptyState = q(inst, '.menu-smash-pass__empty-state');
    var progress = q(inst, '.menu-smash-pass__progress');
    if (err) {
      err.textContent = '';
      err.classList.add('hidden');
    }
    if (empty) empty.classList.add('hidden');
    if (emptyState) emptyState.classList.add('hidden');
    if (reel) reel.classList.add('hidden');
    if (progress) progress.textContent = '';
    inst.root.classList.add('menu-smash-pass--no-photos');
    updateVoteActions(inst);
  }

  function destroyInstance(inst) {
    inst.gen += 1;
    inst.busy = false;
    inst.dragState = null;
    inst.items = [];
    inst.deckIndex = 0;
    var stack = q(inst, '.menu-smash-pass__stack');
    if (stack) stack.innerHTML = '';
    resetUiState(inst);
  }

  function destroyMenuSmashPass() {
    globalGen += 1;
    feedCache.data = null;
    feedCache.promise = null;
    sharedFeedSnapshot = null;
    disconnectLazyObserver();
    clearInitializedMarkers();
    if (feedCache.abort) {
      feedCache.abort.abort();
      feedCache.abort = null;
    }
    if (initScheduled) {
      clearTimeout(initScheduled);
      initScheduled = null;
    }
    queryRoots().forEach(function (root) {
      destroyInstance(getInstance(root));
    });
  }

  async function initInstanceNow(inst, feed, generation) {
    if (!inst.root || !inst.root.isConnected) return;
    if (generation !== globalGen) return;

    bindVoteActions(inst);
    bindAdminDeleteActions(inst);
    inst.gen += 1;
    var localGen = inst.gen;
    inst.busy = false;
    inst.dragState = null;
    inst.items = [];
    inst.deckIndex = 0;

    try {
      var scoped = filterFeedForInstance(inst, feed);
      if (localGen !== inst.gen || generation !== globalGen) return;
      inst.items = mergeItemDeck(inst, scoped);
      inst.deckIndex = 0;
      renderStack(inst);
    } catch (err) {
      if (localGen !== inst.gen || generation !== globalGen) return;
      if (err && err.name === 'AbortError') return;
      if (inst.isItemScoped) {
        inst.items = mergeItemDeck(inst, []);
        if (inst.items.length) {
          inst.deckIndex = 0;
          renderStack(inst);
          return;
        }
      }
      showError(inst, err.message || 'Could not load photos.');
    }
  }

  function initMenuSmashPassRootsIn(container) {
    if (!cfg() || !cfg().enabled) return;
    var scope = container && container.querySelectorAll ? container : document;
    var pending = scope.querySelectorAll('.menu-item-smash-pass:not([data-smash-pass-inited])');
    if (!pending.length) return;

    var snap = sharedFeedSnapshot;
    if (!snap && !feedCache.data && !feedCache.promise) {
      fetchSharedFeed()
        .then(function (loaded) {
          if (!sharedFeedSnapshot) {
            sharedFeedSnapshot = { feed: loaded || [], generation: globalGen };
          }
          initMenuSmashPassRootsIn(container);
        })
        .catch(function () {
          if (!sharedFeedSnapshot) {
            sharedFeedSnapshot = { feed: [], generation: globalGen };
          }
          initMenuSmashPassRootsIn(container);
        });
      return;
    }

    if (!snap && !feedCache.data && feedCache.promise) {
      feedCache.promise
        .then(function (loaded) {
          if (!sharedFeedSnapshot) {
            sharedFeedSnapshot = { feed: loaded || [], generation: globalGen };
          }
          initMenuSmashPassRootsIn(container);
        })
        .catch(function () {
          if (!sharedFeedSnapshot) {
            sharedFeedSnapshot = { feed: [], generation: globalGen };
          }
          initMenuSmashPassRootsIn(container);
        });
      return;
    }

    var feed = snap ? snap.feed : feedCache.data || [];
    var generation = snap ? snap.generation : globalGen;

    pending.forEach(function (root) {
      initRootWithFeed(root, feed, generation);
    });
  }

  function refreshLazyItemSmashPass() {
    if (!cfg() || !cfg().enabled) return;

    if (sharedFeedSnapshot) {
      setupLazyItemSmashPass(sharedFeedSnapshot.feed, sharedFeedSnapshot.generation);
      return;
    }

    if (feedCache.promise) {
      feedCache.promise
        .then(function (feed) {
          if (!sharedFeedSnapshot) {
            sharedFeedSnapshot = { feed: feed || [], generation: globalGen };
          }
          setupLazyItemSmashPass(sharedFeedSnapshot.feed, sharedFeedSnapshot.generation);
        })
        .catch(function () {
          if (!sharedFeedSnapshot) {
            sharedFeedSnapshot = { feed: [], generation: globalGen };
          }
          setupLazyItemSmashPass([], sharedFeedSnapshot.generation);
        });
      return;
    }

    initMenuSmashPass();
  }

  function stripReelsCardThumbnails() {
    if (!cfg() || !cfg().enabled) return;
    document.querySelectorAll('.menu-item-card.menu-reels-slide .menu-item-image-link').forEach(function (link) {
      link.remove();
    });
  }

  async function initMenuSmashPassNow() {
    if (!cfg() || !cfg().enabled) return;

    stripReelsCardThumbnails();

    var roots = queryRoots();
    if (!roots.length) return;

    var generation = globalGen;
    var introRoots = roots.filter(function (root) {
      return !isItemScopedRoot(root);
    });

    try {
      var feed;
      if (sharedFeedSnapshot && sharedFeedSnapshot.generation === globalGen) {
        feed = sharedFeedSnapshot.feed;
      } else {
        feed = await fetchSharedFeed();
        if (generation !== globalGen) return;
        sharedFeedSnapshot = { feed: feed, generation: generation };
      }

      introRoots.forEach(function (root) {
        initRootWithFeed(root, feed, generation);
      });

      setupLazyItemSmashPass(feed, generation);
    } catch (err) {
      if (generation !== globalGen) return;
      if (err && err.name === 'AbortError') return;
      sharedFeedSnapshot = { feed: [], generation: generation };
      introRoots.forEach(function (root) {
        initRootWithFeed(root, [], generation);
      });
      setupLazyItemSmashPass([], generation);
    }
  }

  function initMenuSmashPass() {
    if (initScheduled) {
      clearTimeout(initScheduled);
    }
    initScheduled = setTimeout(function () {
      initScheduled = null;
      initMenuSmashPassNow();
    }, 0);
  }

  function registerBarbaLifecycle() {
    if (!window.TTMSBarba) return;
    window.TTMSBarba.register(initMenuSmashPass);
  }

  function buildVoteActionsHtml() {
    return (
      '<p class="menu-smash-pass__vote-hint hidden">Swipe left or right, or tap Pass / Like</p>' +
      '<div class="menu-smash-pass__actions hidden" role="group" aria-label="Rate this photo">' +
      '<button type="button" class="contact-cta menu-smash-pass__btn menu-smash-pass__btn--pass" data-smash-action="dislike" aria-label="Pass this photo">' +
      '<span class="contact-cta__icon" aria-hidden="true"><i class="fa fa-thumbs-down"></i></span>' +
      '<span class="contact-cta__title">Pass</span>' +
      '</button>' +
      '<button type="button" class="contact-cta menu-smash-pass__btn menu-smash-pass__btn--smash" data-smash-action="like" aria-label="Like this photo">' +
      '<span class="contact-cta__icon" aria-hidden="true"><i class="fa fa-heart"></i></span>' +
      '<span class="contact-cta__title">Like</span>' +
      '</button>' +
      '</div>'
    );
  }

  function buildMenuSmashPassMarkup(options) {
    options = options || {};
    var client = options.clientId || clientIdForRoot(null) || '_ttms_menu_demo';
    var path = options.menuItemPath || '';
    var extra = '';
    if (options.modal) {
      extra = ' menu-smash-pass--modal';
    } else if (options.singlePage) {
      extra = ' menu-smash-pass--single-page';
    } else if (options.extraClass) {
      extra = ' ' + options.extraClass;
    }
    var showVoteUi = !path;
    var reelInner =
      (showVoteUi ? '<p class="menu-smash-pass__progress"></p>' : '') +
      (showVoteUi ? buildVoteActionsHtml() : '') +
      '<div class="menu-smash-pass__stack" aria-live="polite"></div>';

    return (
      '<div class="menu-smash-pass menu-item-smash-pass' +
      extra +
      '" data-client-id="' +
      escapeHtml(client) +
      '"' +
      (path ? ' data-menu-item-path="' + escapeHtml(path) + '"' : '') +
      '>' +
      '<p class="menu-smash-pass__error hidden" role="alert"></p>' +
      '<p class="menu-smash-pass__empty hidden">No community photos yet — check back after guests upload and admins approve.</p>' +
      (path ? buildItemEmptyStateHtml() : '') +
      '<div class="menu-smash-pass__reel hidden">' +
      reelInner +
      '</div></div>'
    );
  }

  function invalidateMenuSmashPassFeed() {
    feedCache.data = null;
    feedCache.promise = null;
    sharedFeedSnapshot = null;
    if (feedCache.abort) {
      feedCache.abort.abort();
      feedCache.abort = null;
    }
  }

  window.buildMenuSmashPassMarkup = buildMenuSmashPassMarkup;
  window.invalidateMenuSmashPassFeed = invalidateMenuSmashPassFeed;
  window.initMenuSmashPass = initMenuSmashPass;
  window.initMenuSmashPassRoot = initMenuSmashPassRoot;
  window.initMenuSmashPassRootsIn = initMenuSmashPassRootsIn;
  window.refreshLazyItemSmashPass = refreshLazyItemSmashPass;
  window.destroyMenuSmashPass = destroyMenuSmashPass;

  function registerSmashPassAuthWatch() {
    var refresh = function () {
      clearInitializedMarkers();
      initMenuSmashPass();
    };
    document.addEventListener('auth:login', refresh);
    document.addEventListener('auth:logout', refresh);
    if (typeof AuthClient !== 'undefined' && AuthClient.whenReady) {
      AuthClient.whenReady().then(refresh);
    }
  }

  function deferHomeSmashPassInit() {
    var started = false;
    var run = function () {
      if (started) return;
      started = true;
      initMenuSmashPass();
    };

    var track = document.getElementById('menu-reels-track');
    var introSlide = document.querySelector('.hero-content.menu-reels-slide--intro');

    if (introSlide && track && typeof IntersectionObserver !== 'undefined') {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            observer.disconnect();
            run();
          });
        },
        { root: track, rootMargin: '40% 0px', threshold: 0.01 }
      );
      observer.observe(introSlide);
      return;
    }

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 10000 });
    } else {
      setTimeout(run, 6000);
    }
  }

  function bootMenuSmashPass() {
    if (document.getElementById('menu-reels-viewport')) {
      deferHomeSmashPassInit();
    } else {
      initMenuSmashPass();
    }
    registerBarbaLifecycle();
    registerSmashPassAuthWatch();
  }

  if (window.TTMSBarba) {
    bootMenuSmashPass();
  } else {
    document.addEventListener('DOMContentLoaded', bootMenuSmashPass);
  }

  document.addEventListener('menuReelsFlattened', initMenuSmashPass);
  window.addEventListener('homeMenuItemsLoaded', refreshLazyItemSmashPass);
})();
