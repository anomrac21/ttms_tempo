/**
 * Homepage menu reels — lazy-load menu item cards from /api/menu-items.json.
 * Loads a section when its header slide is near the reels viewport (scroll or nav).
 */
(function () {
  'use strict';

  var menuBySection = null;
  var fetchPromise = null;
  var headerObserver = null;
  var reelsRefreshTimer = null;
  var proximityTick = false;
  var loaderConfig = null;
  var loaderStarted = false;
  var countAnimations = new WeakMap();
  var titleCountObserver = null;
  var headerCountObserver = null;
  var headerCountSeen = new WeakSet();
  var headerCountAnimated = new WeakSet();
  var sectionLoadPromises = Object.create(null);

  function isPromoSectionHeader(section) {
    if (!section) return false;
    if (section.getAttribute('data-promo-section') === '1') return true;
    if (section.getAttribute('data-section-slug') === 'promotions') return true;
    if (section.getAttribute('data-reel-section') === 'Promotions') return true;
    return false;
  }

  function getPromoSlideCount() {
    var track = getTrack();
    if (!track) return 0;
    var container = track.querySelector('#homepage-ads-container');
    if (!container) return 0;
    return container.querySelectorAll('.ads-reels-slide:not(.menu-ad-scroll-end)').length;
  }

  function getPromoSectionItemCount(section) {
    var fromAttr = getTargetItemCount(section);
    if (fromAttr > 0) return fromAttr;
    var slides = getPromoSlideCount();
    return slides > 0 ? slides : fromAttr;
  }

  function getTargetItemCount(section) {
    if (!section) return 0;
    var n = parseInt(section.getAttribute('data-item-count'), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function getCountRoot(section) {
    return section ? section.querySelector('.menu-header__item-count') : null;
  }

  function getCurrentCount(section) {
    var root = getCountRoot(section);
    if (!root) return 0;
    var valueEl = root.querySelector('.menu-header__item-count__value');
    if (valueEl) {
      var parsed = parseInt(valueEl.textContent, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    var match = (root.textContent || '').match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  function setCountSuffix(root, count) {
    var suffix = root && root.querySelector('.menu-header__item-count__suffix');
    if (suffix) suffix.textContent = count === 1 ? 'item' : 'items';
  }

  function updateSectionCountDisplay(section, count, loading) {
    var root = getCountRoot(section);
    if (!root) return;
    var valueEl = root.querySelector('.menu-header__item-count__value');
    if (valueEl) {
      valueEl.textContent = String(count);
    } else {
      root.textContent = count + (count === 1 ? ' item' : ' items');
    }
    setCountSuffix(root, count);
    root.classList.toggle('is-count-loading', !!loading);
    root.classList.toggle('is-count-pending', !!loading);
    section.classList.toggle('is-section-loading', !!loading);
  }

  function stopSectionCountAnimation(section) {
    var anim = countAnimations.get(section);
    if (!anim) return;
    if (anim.raf) cancelAnimationFrame(anim.raf);
    countAnimations.delete(section);
  }

  function isSectionCountStuck(section) {
    if (!section) return false;
    var root = getCountRoot(section);
    if (!root || !root.classList.contains('is-count-pending')) return false;
    return getCurrentCount(section) === 0 && getTargetItemCount(section) > 0;
  }

  function isSlideNearViewport(slide, track) {
    if (!slide) return false;
    if (isSmoothNavMode()) {
      var headerOffset = getHeaderScrollOffset();
      var viewportBottom = window.innerHeight;
      var range = viewportBottom * PROXIMITY_VIEWPORTS;
      var slideRect = slide.getBoundingClientRect();
      return slideRect.bottom >= headerOffset - range && slideRect.top <= viewportBottom + range;
    }
    if (!track) return false;
    var trackRect = track.getBoundingClientRect();
    var slideRect = slide.getBoundingClientRect();
    var range = trackRect.height * PROXIMITY_VIEWPORTS;
    return slideRect.bottom >= trackRect.top - range && slideRect.top <= trackRect.bottom + range;
  }

  function animateSectionItemCount(section, options) {
    if (!section) return;
    options = options || {};
    var target = options.target != null ? options.target : getTargetItemCount(section);
    var from = options.from != null ? options.from : getCurrentCount(section);
    var duration = options.duration || 1100;
    var clearLoadingOnComplete = !!options.clearLoadingOnComplete;
    var onComplete = typeof options.onComplete === 'function' ? options.onComplete : null;

    stopSectionCountAnimation(section);
    updateSectionCountDisplay(section, from, true);

    var startTime = null;
    function tick(now) {
      if (!section.isConnected) {
        stopSectionCountAnimation(section);
        section.removeAttribute('data-section-count-done');
        return;
      }
      if (!startTime) startTime = now;
      var progress = Math.min(1, (now - startTime) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(from + (target - from) * eased);
      updateSectionCountDisplay(section, current, true);
      if (progress < 1) {
        countAnimations.set(section, { raf: requestAnimationFrame(tick) });
        return;
      }
      countAnimations.delete(section);
      if (clearLoadingOnComplete) {
        updateSectionCountDisplay(section, target, false);
      }
      if (onComplete) onComplete();
    }

    countAnimations.set(section, { raf: requestAnimationFrame(tick) });
  }

  function playSectionTitleCount(section) {
    if (!section) return;
    if (isPromoSectionHeader(section)) {
      section.removeAttribute('data-home-menu-loaded');
      section.removeAttribute('data-home-menu-rendered-count');
      var promoCount = getPromoSectionItemCount(section);
      section.setAttribute('data-item-count', String(promoCount));
      updateSectionCountDisplay(section, promoCount, false);
      section.classList.remove('is-section-loading');
      section.dataset.sectionCountDone = '1';
      return;
    }
    if (section.dataset.sectionCountDone === '1' && !isSectionCountStuck(section)) {
      updateSectionCountDisplay(section, getTargetItemCount(section), false);
      section.classList.remove('is-section-loading');
      return;
    }

    section.removeAttribute('data-section-count-done');
    stopSectionCountAnimation(section);
    if (titleCountObserver) titleCountObserver.unobserve(section);

    var target = getTargetItemCount(section);
    if (target <= 0) {
      updateSectionCountDisplay(section, 0, false);
      section.dataset.sectionCountDone = '1';
      return;
    }

    animateSectionItemCount(section, {
      from: 0,
      target: target,
      duration: 900,
      clearLoadingOnComplete: true,
      onComplete: function () {
        section.dataset.sectionCountDone = '1';
      },
    });
  }

  function syncPendingSectionTitleCounts() {
    var track = getTrack();
    if (!track) return;
    track.querySelectorAll('.menu-reels-slide--section-title[data-item-count]').forEach(function (section) {
      if (section.dataset.sectionCountDone === '1' && !isSectionCountStuck(section)) return;
      if (isSlideNearViewport(section, track)) {
        playSectionTitleCount(section);
      }
    });
  }

  function countRenderedCardsAfterHeader(header) {
    if (!header) return 0;
    var count = 0;
    var el = header.nextElementSibling;
    while (el) {
      if (el.classList.contains('menu-header')) break;
      if (el.classList.contains('menu-item-card')) count++;
      el = el.nextElementSibling;
    }
    return count;
  }

  function getAccurateItemCount(header, grouped) {
    if (!header) return 0;

    var stored = parseInt(header.getAttribute('data-home-menu-rendered-count'), 10);
    if (Number.isFinite(stored) && stored >= 0) return stored;

    if (header.dataset.homeMenuLoaded === '1') {
      return countRenderedCardsAfterHeader(header);
    }

    if (grouped) {
      var slug = header.getAttribute('data-section-slug');
      return slug ? (grouped[slug] || []).length : 0;
    }

    return getTargetItemCount(header);
  }

  function playHeaderCountAnimation(header, grouped, options) {
    if (!header || !headerCountSeen.has(header)) return;

    options = options || {};
    var target = options.target != null ? options.target : getAccurateItemCount(header, grouped);
    var from = options.from != null ? options.from : getCurrentCount(header);
    var duration = options.duration != null ? options.duration : 1100;
    var force = !!options.force;

    if (headerCountAnimated.has(header) && !force) {
      updateSectionCountDisplay(header, target, false);
      header.classList.remove('is-section-loading');
      return;
    }

    headerCountAnimated.add(header);
    animateSectionItemCount(header, {
      from: from,
      target: target,
      duration: duration,
      clearLoadingOnComplete: true,
    });
  }

  function onHeaderEnteredView(header) {
    if (!header) return;
    headerCountSeen.add(header);

    if (header.dataset.homeMenuLoaded === '1') {
      playHeaderCountAnimation(header, menuBySection);
      return;
    }

    updateSectionCountDisplay(header, 0, true);

    if (loaderConfig) {
      var slug = header.getAttribute('data-section-slug');
      if (slug) loadSectionBySlug(slug, loaderConfig);
    }
  }

  function observeHeaderCounts() {
    var track = getTrack();
    if (!track) return;

    if (headerCountObserver) headerCountObserver.disconnect();

    var headers = track.querySelectorAll('.menu-header.menu-reels-slide[data-home-menu-lazy]');
    if (!headers.length) return;

    headerCountObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          onHeaderEnteredView(entry.target);
        });
      },
      { root: track, threshold: 0.35 }
    );

    headers.forEach(function (header) {
      if (headerCountAnimated.has(header)) {
        headerCountObserver.observe(header);
        return;
      }
      if (header.dataset.homeMenuLoaded === '1' && headerCountSeen.has(header)) {
        playHeaderCountAnimation(header, menuBySection);
      } else if (!headerCountSeen.has(header)) {
        updateSectionCountDisplay(header, 0, true);
      }
      headerCountObserver.observe(header);
    });
  }

  function finalizeSectionItemCount(section, actualCount) {
    if (!section) return;
    stopSectionCountAnimation(section);
    var count =
      actualCount != null && Number.isFinite(actualCount)
        ? actualCount
        : getAccurateItemCount(section, menuBySection);

    section.setAttribute('data-home-menu-rendered-count', String(count));
    section.setAttribute('data-item-count', String(count));

    if (headerCountSeen.has(section)) {
      if (headerCountAnimated.has(section)) {
        updateSectionCountDisplay(section, count, false);
      } else {
        playHeaderCountAnimation(section, menuBySection, { target: count, from: 0 });
      }
    } else {
      updateSectionCountDisplay(section, 0, true);
    }

    section.classList.remove('is-section-loading');
  }

  function initPendingSectionCounts() {
    var track = getTrack();
    if (!track) return;
    track.querySelectorAll('.menu-header.menu-reels-slide[data-home-menu-lazy]').forEach(function (header) {
      if (header.dataset.homeMenuLoaded === '1') return;
      updateSectionCountDisplay(header, 0, true);
    });
  }

  function observeSectionTitleCounts() {
    var track = getTrack();
    if (!track) return;

    if (titleCountObserver) titleCountObserver.disconnect();

    var titles = track.querySelectorAll('.menu-reels-slide--section-title[data-item-count]');
    if (!titles.length) return;

    titleCountObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          playSectionTitleCount(entry.target);
        });
      },
      {
        root: track,
        rootMargin: '40% 0px 40% 0px',
        threshold: 0,
      }
    );

    titles.forEach(function (section) {
      stopSectionCountAnimation(section);
      if (isPromoSectionHeader(section)) {
        section.removeAttribute('data-home-menu-loaded');
        section.removeAttribute('data-home-menu-rendered-count');
        var promoCount = getPromoSectionItemCount(section);
        section.setAttribute('data-item-count', String(promoCount));
        updateSectionCountDisplay(section, promoCount, false);
        section.classList.remove('is-section-loading');
        section.dataset.sectionCountDone = '1';
        titleCountObserver.observe(section);
        return;
      }
      if (section.dataset.sectionCountDone === '1' && !isSectionCountStuck(section)) {
        updateSectionCountDisplay(section, getTargetItemCount(section), false);
        section.classList.remove('is-section-loading');
        return;
      }
      section.removeAttribute('data-section-count-done');
      updateSectionCountDisplay(section, 0, true);
      titleCountObserver.observe(section);
    });

    syncPendingSectionTitleCounts();
  }

  function beginSectionLoadFeedback(header) {
    if (!header || header.dataset.homeMenuLoaded === '1') return;
    if (!headerCountSeen.has(header)) {
      updateSectionCountDisplay(header, 0, true);
    }
  }

  var PROXIMITY_VIEWPORTS = 0.85;

  function isSmoothNavMode() {
    return (
      document.documentElement.classList.contains('menu-nav-smooth') ||
      (document.body && document.body.classList.contains('menu-nav-smooth')) ||
      (typeof window.getMenuNavMode === 'function' && window.getMenuNavMode() === 'smooth')
    );
  }

  function getHeaderScrollOffset() {
    var raw = (getComputedStyle(document.documentElement).getPropertyValue('--ttms-header-height') || '5em').trim();
    var rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    var emMatch = raw.match(/^([\d.]+)em$/);
    if (emMatch) return parseFloat(emMatch[1]) * rootPx;
    var pxMatch = raw.match(/^([\d.]+)px$/);
    if (pxMatch) return parseFloat(pxMatch[1]);
    return rootPx * 5;
  }

  function getProximityScrollRoot() {
    return isSmoothNavMode() ? null : getTrack();
  }

  function getConfigRoot() {
    return (
      document.getElementById('menu-reels-viewport') ||
      document.getElementById('packery-container')
    );
  }

  function getTrack() {
    return document.getElementById('menu-reels-track');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function stripHtml(html) {
    if (!html) return '';
    var el = document.createElement('div');
    el.innerHTML = html;
    return (el.textContent || el.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function truncate(text, max) {
    if (!text || text.length <= max) return text;
    return text.slice(0, max - 1).trim() + '…';
  }

  function formatMoney(amount) {
    var n = parseFloat(amount);
    if (Number.isNaN(n)) return '0';
    return n.toFixed(2).replace(/\.00$/, '');
  }

  function priceNumbers(item) {
    var nums = [];
    var prices = item.prices || [];
    for (var i = 2; i < prices.length; i += 3) {
      var val = parseFloat(prices[i]);
      if (!Number.isNaN(val)) nums.push(val);
    }
    return nums.sort(function (a, b) {
      return a - b;
    });
  }

  function buildPriceHtml(item) {
    var nums = priceNumbers(item);
    if (!nums.length) return '';
    if (nums[0] === nums[nums.length - 1]) {
      return '$' + formatMoney(nums[0]);
    }
    return (
      '$' +
      formatMoney(nums[0]) +
      ' | $' +
      formatMoney(nums[nums.length - 1])
    );
  }

  function filterOptionValues(values) {
    return (values || []).filter(function (value) {
      return value && value !== '-' && value !== 'None';
    });
  }

  function buildListHtml(values) {
    return filterOptionValues(values)
      .map(function (value) {
        return '<li>' + escapeHtml(value) + '</li>';
      })
      .join('');
  }

  function imagePath(item) {
    var images = item.images || [];
    if (!images.length) return '';
    var first = images[0];
    if (typeof first === 'string') return first;
    if (first && first.image) return first.image;
    return '';
  }

  function favoriteIconMarkup(kind) {
    var icons = window.TTMS_MENU_FAVORITE_ICONS;
    if (icons && icons[kind]) return icons[kind];
    return '';
  }

  function buildFavoriteBtn(item, authEnabled) {
    if (!authEnabled) return '';
    var clientId = window.SITE_CLIENT_ID || '';
    var path = String(item.url || '').replace(/^\//, '').replace(/\/$/, '');
    var itemKey = clientId + '|' + path;
    var img = imagePath(item);
    var title = item.linkTitle || item.name || '';
    return (
      '<button type="button" class="menu-favorite-btn"' +
      ' data-favorite-kind="dish"' +
      ' data-favorite-key="' +
      escapeHtml(itemKey) +
      '"' +
      ' data-favorite-title="' +
      escapeHtml(title) +
      '"' +
      ' data-favorite-url="' +
      escapeHtml(item.url || '') +
      '"' +
      ' data-favorite-image="' +
      escapeHtml(img) +
      '"' +
      ' data-favorite-section="' +
      escapeHtml(item.section || '') +
      '"' +
      ' aria-pressed="false"' +
      ' aria-label="Save ' +
      escapeHtml(title) +
      ' to favorites"' +
      ' title="Save to favorites">' +
      '<span class="menu-favorite-btn__icon menu-favorite-btn__icon--outline" aria-hidden="true">' +
      favoriteIconMarkup('outline') +
      '</span>' +
      '<span class="menu-favorite-btn__icon menu-favorite-btn__icon--filled" aria-hidden="true">' +
      favoriteIconMarkup('filled') +
      '</span></button>'
    );
  }

  function menuImageClientId() {
    return (
      (window.MENU_IMAGE_CONFIG && window.MENU_IMAGE_CONFIG.clientId) ||
      window.SITE_CLIENT_ID ||
      '_ttms_menu_demo'
    );
  }

  function buildSmashPassMarkup(item, menuImagesEnabled) {
    if (!menuImagesEnabled) return '';
    var clientId = menuImageClientId();
    var path = item.url || '';
    if (typeof window.buildMenuSmashPassMarkup === 'function') {
      return window.buildMenuSmashPassMarkup({
        clientId: clientId,
        menuItemPath: path,
      });
    }
    return (
      '<div class="menu-smash-pass menu-item-smash-pass"' +
      ' data-client-id="' +
      escapeHtml(clientId) +
      '"' +
      ' data-menu-item-path="' +
      escapeHtml(path) +
      '">' +
      '<p class="menu-smash-pass__error hidden" role="alert"></p>' +
      '<p class="menu-smash-pass__empty hidden">No community photos yet — check back after guests upload and admins approve.</p>' +
      '<div class="menu-smash-pass__reel hidden">' +
      '<div class="menu-smash-pass__stack" aria-live="polite"></div>' +
      '</div></div>'
    );
  }

  function buildAvailabilityScheduleHtml(avail) {
    if (!avail) return '';
    var msg = '';
    if (typeof window.TTMSFormatAvailabilityMessage === 'function') {
      msg = window.TTMSFormatAvailabilityMessage(avail);
    } else if (avail.days && avail.time_start && avail.time_finish) {
      msg =
        'Available ' +
        avail.days.join(', ') +
        ' · ' +
        avail.time_start +
        '–' +
        avail.time_finish;
    }
    if (!msg) return '';
    return (
      '<div class="menu-item-availability">' +
      '<i class="fa fa-clock-o" aria-hidden="true"></i>' +
      '<span class="menu-item-availability__text">' +
      escapeHtml(msg) +
      '</span></div>'
    );
  }

  function buildActionsMenu(item) {
    if (window.TTMSMenuItemActions && typeof window.TTMSMenuItemActions.buildMarkup === 'function') {
      return window.TTMSMenuItemActions.buildMarkup(item);
    }
    var url = String(item.url || '').trim();
    var title = item.linkTitle || item.name || '';
    return (
      '<div class="menu-item-actions" data-menu-item-actions data-item-url="' +
      escapeHtml(url) +
      '" data-item-title="' +
      escapeHtml(title) +
      '">' +
      '<button type="button" class="menu-item-actions__trigger" aria-haspopup="menu" aria-expanded="false" aria-label="More options for ' +
      escapeHtml(title) +
      '" title="More options">' +
      '<i class="fa fa-ellipsis-v" aria-hidden="true"></i>' +
      '</button>' +
      '<div class="menu-item-actions__menu" role="menu" hidden>' +
      '<button type="button" class="menu-item-actions__option menu-item-actions__option--comment" role="menuitem" disabled aria-disabled="true">Comment</button>' +
      '<button type="button" class="menu-item-actions__option menu-item-actions__option--edit" role="menuitem" data-auth="admin-site" hidden>Edit</button>' +
      '</div></div>'
    );
  }

  function buildTitleRow(item, titleHtml, authEnabled) {
    if (!titleHtml) return '';
    return (
      '<div class="menu-item-title-row">' +
      buildFavoriteBtn(item, authEnabled) +
      titleHtml +
      buildActionsMenu(item) +
      '</div>'
    );
  }

  function buildCard(item, category, config) {
    var title = item.linkTitle || item.name || '';
    var summary = truncate(stripHtml(item.summary), 120);
    var v1 = filterOptionValues(item.variable1_values);
    var v2 = filterOptionValues(item.variable2_values);
    var defaultV1 = v1[0] || '-';
    var defaultV2 = v2[0] || '-';
    var pricesArray = item.prices || [];
    var images = item.images || [];
    var firstImage = imagePath(item);
    var showImage = !!firstImage && !config.menuImages;
    var sizesHtml = buildListHtml(item.variable1_values);
    var flavoursHtml = buildListHtml(item.variable2_values);
    var imageSrc = firstImage;
    if (typeof window.TtmsThumbor !== 'undefined' && window.TtmsThumbor.menuImageSrc) {
      imageSrc = window.TtmsThumbor.menuImageSrc(firstImage, 'card') || firstImage;
    }
    if (imageSrc && !/^https?:\/\//i.test(imageSrc) && imageSrc.charAt(0) !== '/') {
      imageSrc = '/' + imageSrc.replace(/^\//, '');
    }
    var imageHtml = showImage
      ? '<a href="' +
        escapeHtml(item.url || '#') +
        '" class="menu-item-image-link" aria-label="View ' +
        escapeHtml(title) +
        '"><div class="menu-item-image"><img src="' +
        escapeHtml(imageSrc) +
        '" data-src-path="' +
        escapeHtml(firstImage.replace(/^\//, '')) +
        '" alt="' +
        escapeHtml(title) +
        '" loading="lazy" decoding="async" width="480" height="480" class="menu-item-img" onerror="window.TtmsThumbor&&window.TtmsThumbor.fallbackImg(this)"></div></a>'
      : '';
    var titleHtml =
      '<h3 class="menu-item-title"><span class="menu-item-title-text">' +
      escapeHtml(title) +
      '</span></h3>';
    var smashPassHtml = buildSmashPassMarkup(item, config.menuImages);
    var titleRowHtml = buildTitleRow(item, titleHtml, config.authEnabled);
    var availabilityAttr = item.availability ? JSON.stringify(item.availability) : '';
    var availabilityHtml = buildAvailabilityScheduleHtml(item.availability);

    return (
      '<section class="menu-item-card menu-reels-slide' +
      (showImage ? ' menu-item-card--has-image' : '') +
      '"' +
      ' data-reel-section="' +
      escapeHtml(category) +
      '"' +
      ' data-section-slug="' +
      escapeHtml(item.section || '') +
      '"' +
      ' data-item-url="' +
      escapeHtml(item.url || '') +
      '"' +
      ' role="button" tabindex="0" aria-expanded="false" data-item-expanded="false"' +
      (availabilityAttr
        ? ' data-availability="' + escapeHtml(availabilityAttr) + '"'
        : '') +
      ' data-prices-array="' +
      escapeHtml(JSON.stringify(pricesArray)) +
      '"' +
      ' data-active-promo-percent="0"' +
      ' data-selected-variable1="' +
      escapeHtml(defaultV1) +
      '"' +
      ' data-selected-variable2="' +
      escapeHtml(defaultV2) +
      '"' +
      ' data-side-categories="' +
      escapeHtml(JSON.stringify(item.side_categories || [])) +
      '"' +
      ' data-modifications="' +
      escapeHtml(JSON.stringify(item.modifications || [])) +
      '"' +
      ' data-additions="' +
      escapeHtml(JSON.stringify(item.additions || [])) +
      '"' +
      ' data-images-array="' +
      escapeHtml(JSON.stringify(images)) +
      '"' +
      ' data-regular-images-array="' +
      escapeHtml(JSON.stringify(images)) +
      '"' +
      ' data-promotions="' +
      escapeHtml(JSON.stringify(item.promotions || [])) +
      '"' +
      ' data-tags="' +
      escapeHtml(JSON.stringify(item.tags || [])) +
      '"' +
      ' data-ingredients="' +
      escapeHtml(JSON.stringify(item.ingredients || [])) +
      '"' +
      ' data-cookingmethods="' +
      escapeHtml(JSON.stringify(item.cookingmethods || [])) +
      '"' +
      ' data-types="' +
      escapeHtml(JSON.stringify(item.types || [])) +
      '"' +
      ' data-events="' +
      escapeHtml(JSON.stringify(item.events || [])) +
      '">' +
      (smashPassHtml ? titleRowHtml : '') +
      smashPassHtml +
      '<div class="menu-item-row-top">' +
      imageHtml +
      '<div class="menu-item-header-content">' +
      (smashPassHtml ? '' : titleRowHtml) +
      '<div class="menu-item-row-middle">' +
      availabilityHtml +
      '<div class="menu-item-description">' +
      escapeHtml(summary) +
      '</div>' +
      '<div class="menu-item-price">' +
      buildPriceHtml(item) +
      '</div></div>' +
      '<div class="menu-item-options">' +
      (sizesHtml ? '<ul class="sizes">' + sizesHtml + '</ul>' : '') +
      (flavoursHtml ? '<ul class="flavours">' + flavoursHtml + '</ul>' : '') +
      '</div></div></div></section>'
    );
  }

  function groupMenuItems(items) {
    var grouped = {};
    (items || []).forEach(function (item) {
      if (!item || !item.section || item.section === 'promotions') return;
      if (!grouped[item.section]) grouped[item.section] = [];
      grouped[item.section].push(item);
    });
    return grouped;
  }

  function fetchMenuItems(apiUrl) {
    if (menuBySection) return Promise.resolve(menuBySection);
    if (fetchPromise) return fetchPromise;

    fetchPromise = fetch(apiUrl, { credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('Menu items fetch failed: ' + response.status);
        return response.json();
      })
      .then(function (payload) {
        menuBySection = groupMenuItems(payload.menu_items || []);
        return menuBySection;
      })
      .catch(function (error) {
        fetchPromise = null;
        console.error('Home menu loader:', error);
        throw error;
      });

    return fetchPromise;
  }

  function scheduleReelsRefresh(options) {
    options = options || {};
    if (reelsRefreshTimer) window.clearTimeout(reelsRefreshTimer);
    reelsRefreshTimer = window.setTimeout(function () {
      reelsRefreshTimer = null;
      if (typeof window.refreshMenuReelsLayout === 'function') {
        window.refreshMenuReelsLayout({ partial: !!options.partial, skipTrackSync: !!options.partial });
      } else if (typeof window.initMenuReels === 'function') {
        window.initMenuReels();
      }
      if (typeof window.initMenuSmashPass === 'function') {
        window.initMenuSmashPass();
      }
      if (!options.partial) {
        var deferIdle =
          typeof requestIdleCallback === 'function'
            ? function (fn, timeout) {
                requestIdleCallback(fn, { timeout: timeout || 4000 });
              }
            : function (fn) {
                setTimeout(fn, 400);
              };
        deferIdle(function () {
          if (typeof window.initMenuImageIntegration === 'function') {
            window.initMenuImageIntegration();
          }
          if (typeof window.applyDayBasedPromos === 'function') {
            window.applyDayBasedPromos();
          }
          if (
            window.TTMSMenuFavorites &&
            typeof window.TTMSMenuFavorites.refresh === 'function'
          ) {
            window.TTMSMenuFavorites.refresh();
          }
        }, 5000);
        try {
          window.dispatchEvent(new CustomEvent('homeMenuItemsLoaded'));
          window.dispatchEvent(new CustomEvent('ttms:home-menu-ready'));
        } catch (_) { /* ignore */ }
      }
    }, options.partial ? 80 : 150);
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(String(value));
    }
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function getHeaderForSlug(slug) {
    var track = getTrack();
    if (!track || !slug) return null;
    return track.querySelector(
      '.menu-header.menu-reels-slide[data-section-slug="' + cssEscape(slug) + '"]'
    );
  }

  function notifySectionMenuLoaded(header, slug) {
    if (!header) return;
    var category = header.getAttribute('data-reel-section') || '';
    var isNavTarget =
      window.TTMSMenublockNav &&
      typeof window.TTMSMenublockNav.isNavigatingTo === 'function' &&
      window.TTMSMenublockNav.isNavigatingTo(category);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        try {
          window.dispatchEvent(
            new CustomEvent('ttms:section-menu-loaded', {
              detail: {
                sectionId: category,
                slug: slug || header.getAttribute('data-section-slug') || '',
              },
            })
          );
        } catch (_) { /* ignore */ }
        if (
          isNavTarget &&
          window.TTMSMenublockNav &&
          typeof window.TTMSMenublockNav.nudgeToSection === 'function'
        ) {
          window.TTMSMenublockNav.nudgeToSection(category, 'auto');
        }
      });
    });
  }

  function renderSectionAfterHeader(header, items, config) {
    if (!header || header.dataset.homeMenuLoaded === '1') return;
    var category = header.getAttribute('data-reel-section') || '';
    var parent = header.parentElement;
    if (!parent) return;

    var track = getTrack();
    var isNavTarget =
      window.TTMSMenublockNav &&
      typeof window.TTMSMenublockNav.isNavigatingTo === 'function' &&
      window.TTMSMenublockNav.isNavigatingTo(category);
    var preserveScrollY = !isNavTarget && isSmoothNavMode() ? window.scrollY : null;
    var preserveTrackScrollTop = !isNavTarget && !isSmoothNavMode() && track ? track.scrollTop : null;

    var fragment = document.createDocumentFragment();
    items.forEach(function (item) {
      var wrap = document.createElement('div');
      wrap.innerHTML = buildCard(item, category, config);
      if (wrap.firstElementChild) {
        fragment.appendChild(wrap.firstElementChild);
      }
    });

    var anchor = header.nextSibling;
    while (fragment.firstChild) {
      parent.insertBefore(fragment.firstChild, anchor);
    }

    header.removeAttribute('aria-busy');
    header.dataset.homeMenuLoaded = '1';
    finalizeSectionItemCount(header, items.length);
    if (preserveScrollY != null) {
      requestAnimationFrame(function () {
        window.scrollTo({ top: preserveScrollY, left: 0, behavior: 'auto' });
      });
    } else if (preserveTrackScrollTop != null && track) {
      requestAnimationFrame(function () {
        track.scrollTop = preserveTrackScrollTop;
      });
    }
    if (config.menuImages && typeof window.initMenuSmashPassRootsIn === 'function') {
      window.initMenuSmashPassRootsIn(parent);
    }
    notifySectionMenuLoaded(header);
    scheduleReelsRefresh({ partial: true });
    if (config.menuImages && typeof window.refreshLazyItemSmashPass === 'function') {
      window.refreshLazyItemSmashPass();
    }
  }

  function loadSectionBySlug(slug, config) {
    if (!slug || !config) return Promise.resolve();
    if (slug === 'promotions') return Promise.resolve();
    var header = getHeaderForSlug(slug);
    if (!header) return Promise.resolve();
    if (header.dataset.homeMenuLoaded === '1') return Promise.resolve();
    if (isPromoSectionHeader(header)) return Promise.resolve();
    if (sectionLoadPromises[slug]) return sectionLoadPromises[slug];

    beginSectionLoadFeedback(header);

    sectionLoadPromises[slug] = fetchMenuItems(config.apiUrl)
      .then(function (grouped) {
        if (header.dataset.homeMenuLoaded === '1') return;
        var items = grouped[slug] || [];
        header.setAttribute('data-item-count', String(items.length));
        if (!items.length) {
          header.removeAttribute('aria-busy');
          header.dataset.homeMenuLoaded = '1';
          finalizeSectionItemCount(header, 0);
          notifySectionMenuLoaded(header, slug);
          return;
        }
        renderSectionAfterHeader(header, items, config);
      })
      .finally(function () {
        delete sectionLoadPromises[slug];
      });

    return sectionLoadPromises[slug];
  }

  function isHeaderNearViewport(header, track) {
    if (!header) return false;
    if (isSmoothNavMode()) {
      return isSlideNearViewport(header, track);
    }
    if (!track) return false;
    var trackRect = track.getBoundingClientRect();
    var headerRect = header.getBoundingClientRect();
    var range = trackRect.height * PROXIMITY_VIEWPORTS;
    var topDelta = headerRect.top - trackRect.top;
    var bottomDelta = headerRect.bottom - trackRect.bottom;
    return topDelta <= range && bottomDelta >= -range;
  }

  function checkProximityLoads() {
    if (!loaderConfig) return;
    var track = getTrack();
    if (!track) return;

    track.querySelectorAll('.menu-header.menu-reels-slide[data-home-menu-lazy]').forEach(function (header) {
      var slug = header.getAttribute('data-section-slug');
      if (!slug || header.dataset.homeMenuLoaded === '1') return;
      if (isHeaderNearViewport(header, track)) {
        loadSectionBySlug(slug, loaderConfig);
      }
    });
  }

  function scheduleProximityCheck() {
    if (proximityTick) return;
    proximityTick = true;
    requestAnimationFrame(function () {
      proximityTick = false;
      checkProximityLoads();
      syncPendingSectionTitleCounts();
    });
  }

  function observeSectionHeaders(config) {
    var track = getTrack();
    if (!track) return;

    if (headerObserver) headerObserver.disconnect();

    var headers = track.querySelectorAll(
      '.menu-header.menu-reels-slide[data-home-menu-lazy]:not([data-home-menu-loaded])'
    );
    if (!headers.length) return;

    headerObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var header = entry.target;
          var slug = header.getAttribute('data-section-slug');
          loadSectionBySlug(slug, config);
        });
      },
      {
        root: getProximityScrollRoot(),
        rootMargin: Math.round(PROXIMITY_VIEWPORTS * 100) + '% 0px ' + Math.round(PROXIMITY_VIEWPORTS * 100) + '% 0px',
        threshold: 0,
      }
    );

    headers.forEach(function (header) {
      headerObserver.observe(header);
    });
  }

  function bindTrackProximity(config) {
    var track = getTrack();
    if (!track || track._ttmsHomeMenuProximityBound) return;
    track._ttmsHomeMenuProximityBound = true;
    track.addEventListener('scroll', scheduleProximityCheck, { passive: true });
    if (isSmoothNavMode()) {
      window.addEventListener('scroll', scheduleProximityCheck, { passive: true });
    }
  }

  function bindMenublockPreload(config) {
    var menublock = document.getElementById('menublock');
    if (!menublock || menublock._ttmsHomeMenuPreloadBound) return;
    menublock._ttmsHomeMenuPreloadBound = true;

    menublock.addEventListener('pointerenter', function (e) {
      var link = e.target.closest('.menublock-link[href^="#"]');
      if (!link) return;
      var hash = link.getAttribute('href');
      if (!hash || hash === '#') return;
      var sectionId = decodeURIComponent(hash.slice(1));
      loadHomeMenuForSectionId(sectionId);
    }, true);
  }

  function loadHomeMenuForSectionId(sectionId) {
    if (!loaderConfig || !sectionId) return Promise.resolve();
    if (String(sectionId).trim() === 'Promotions') return Promise.resolve();

    var track = getTrack();
    var header = null;
    if (track) {
      var anchor = document.getElementById(sectionId);
      if (anchor) {
        header = anchor.closest('.menu-header.menu-reels-slide');
      }
      if (!header) {
        header = track.querySelector(
          '.menu-header.menu-reels-slide[data-reel-section="' + cssEscape(sectionId) + '"]'
        );
      }
    }

    var slug = header ? header.getAttribute('data-section-slug') : '';
    if (!slug) return Promise.resolve();
    return loadSectionBySlug(slug, loaderConfig);
  }

  function preloadFromLocationHash() {
    if (!loaderConfig || !window.location.hash) return;
    var hashId = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (!hashId) return;
    loadHomeMenuForSectionId(hashId);
  }

  function startHomeMenuLoader(config) {
    loaderConfig = config;
    if (loaderStarted) {
      initPendingSectionCounts();
      observeSectionTitleCounts();
      observeHeaderCounts();
      observeSectionHeaders(config);
      scheduleProximityCheck();
      preloadFromLocationHash();
      return;
    }
    loaderStarted = true;

    initPendingSectionCounts();
    observeSectionTitleCounts();
    observeHeaderCounts();
    observeSectionHeaders(config);
    bindTrackProximity(config);
    bindMenublockPreload(config);
    scheduleProximityCheck();
    preloadFromLocationHash();
  }

  function initHomeMenuLoader() {
    var root = getConfigRoot();
    if (!root || !root.hasAttribute('data-home-menu-api')) return;

    var config = {
      apiUrl: root.getAttribute('data-home-menu-api') || '/api/menu-items.json',
      authEnabled: root.getAttribute('data-auth-enabled') === 'true',
      menuImages: root.getAttribute('data-menu-images') === 'true',
    };

    startHomeMenuLoader(config);
  }

  function waitForHomeMenuBootstrap() {
    var root = getConfigRoot();
    if (!root || !root.hasAttribute('data-home-menu-api')) {
      return Promise.resolve(null);
    }
    var apiUrl = root.getAttribute('data-home-menu-api') || '/api/menu-items.json';
    return fetchMenuItems(apiUrl).then(function (data) {
      try {
        window.dispatchEvent(new CustomEvent('ttms:home-menu-ready'));
      } catch (_) { /* ignore */ }
      return data;
    });
  }

  function resetHomeMenuLoader() {
    menuBySection = null;
    fetchPromise = null;
    loaderStarted = false;
    loaderConfig = null;
    sectionLoadPromises = Object.create(null);
    headerCountSeen = new WeakSet();
    headerCountAnimated = new WeakSet();
    if (headerObserver) {
      headerObserver.disconnect();
      headerObserver = null;
    }
    if (titleCountObserver) {
      titleCountObserver.disconnect();
      titleCountObserver = null;
    }
    if (headerCountObserver) {
      headerCountObserver.disconnect();
      headerCountObserver = null;
    }
    var track = getTrack();
    if (track) {
      track.querySelectorAll('.menu-header.menu-reels-slide[data-home-menu-lazy]').forEach(function (header) {
        stopSectionCountAnimation(header);
      });
      track.querySelectorAll('.menu-reels-slide--section-title[data-item-count]').forEach(function (section) {
        stopSectionCountAnimation(section);
        section.removeAttribute('data-section-count-done');
      });
      track._ttmsHomeMenuProximityBound = false;
    }
    var menublock = document.getElementById('menublock');
    if (menublock) menublock._ttmsHomeMenuPreloadBound = false;
  }

  function registerLifecycle() {
    if (!window.TTMSBarba) return;
    window.TTMSBarba.register(function () {
      resetHomeMenuLoader();
      initHomeMenuLoader();
    });
  }

  window.initHomeMenuLoader = initHomeMenuLoader;
  window.loadHomeMenuForSectionId = loadHomeMenuForSectionId;
  window.waitForHomeMenuBootstrap = waitForHomeMenuBootstrap;

  window.addEventListener('menuReelsFlattened', function () {
    if (!loaderConfig) {
      var root = getConfigRoot();
      if (!root || !root.hasAttribute('data-home-menu-api')) return;
      loaderConfig = {
        apiUrl: root.getAttribute('data-home-menu-api') || '/api/menu-items.json',
        authEnabled: root.getAttribute('data-auth-enabled') === 'true',
        menuImages: root.getAttribute('data-menu-images') === 'true',
      };
    }
    observeSectionHeaders(loaderConfig);
    observeSectionTitleCounts();
    observeHeaderCounts();
    scheduleProximityCheck();
  });

  window.addEventListener('menuReelsUpdated', function () {
    if (!loaderConfig) return;
    observeSectionHeaders(loaderConfig);
    observeSectionTitleCounts();
    scheduleProximityCheck();
  });

  function deferHomeMenuLoaderStart(fn) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(fn, { timeout: 2500 });
    } else {
      setTimeout(fn, 300);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      deferHomeMenuLoaderStart(function () {
        initHomeMenuLoader();
        registerLifecycle();
      });
    });
  } else {
    deferHomeMenuLoaderStart(function () {
      initHomeMenuLoader();
      registerLifecycle();
    });
  }
})();
