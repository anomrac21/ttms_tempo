/**
 * Menu reels — same scroll model as #ads-reels-track (dedicated snap container, header visible).
 */
(function () {
  'use strict';

  var observer = null;
  var scrollHandler = null;
  var scrollSyncPending = false;
  var initReelsScheduled = null;
  var initReelsRunning = false;
  var RATIO_THRESHOLD = 0.45;
  var lastDominantSlide = null;
  var lastSyncedMenublockSectionId = null;
  var lastMenublockActiveId = null;
  var menublockNavToken = 0;
  var menublockNavLockUntil = 0;
  var menublockFinalizeTimer = null;
  var MENUBLOCK_ALIGN_PX = 8;

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

  function getTrack() {
    return document.getElementById('menu-reels-track');
  }

  function isVisibleReelSlide(slide) {
    if (!slide || slide.hidden) return false;
    if (slide.classList.contains('ads-loading') || slide.classList.contains('ads-reels-slide--hidden')) {
      return false;
    }
    return true;
  }

  function getSlides(track) {
    if (!track) return [];
    return Array.from(
      track.querySelectorAll('.menu-reels-slide, .ads-reels-slide:not(.ads-loading)')
    ).filter(isVisibleReelSlide);
  }

  function getDominantSlide(track) {
    if (!track) return null;
    if (isSmoothNavMode()) {
      var viewportTop = getHeaderScrollOffset();
      var viewportBottom = window.innerHeight;
      var viewportHeight = Math.max(1, viewportBottom - viewportTop);
      var best = null;
      var bestVisible = 0;
      getSlides(track).forEach(function (slide) {
        var sr = slide.getBoundingClientRect();
        var visibleTop = Math.max(sr.top, viewportTop);
        var visibleBottom = Math.min(sr.bottom, viewportBottom);
        var visible = Math.max(0, visibleBottom - visibleTop);
        if (visible > bestVisible) {
          bestVisible = visible;
          best = slide;
        }
      });
      if (lastDominantSlide && lastDominantSlide.isConnected) {
        var lr = lastDominantSlide.getBoundingClientRect();
        var lastVisible = Math.max(
          0,
          Math.min(lr.bottom, viewportBottom) - Math.max(lr.top, viewportTop)
        );
        var lastRatio = lastVisible / viewportHeight;
        if (lastRatio > 0.35) {
          if (!best || best === lastDominantSlide || bestVisible <= lastVisible * 1.12) {
            return lastDominantSlide;
          }
        }
      }
      lastDominantSlide = best;
      return best;
    }
    var top;
    var bottom;
    var midY;
    var tr = track.getBoundingClientRect();
    top = tr.top;
    bottom = tr.bottom;
    midY = tr.top + tr.height / 2;
    var bestSnap = null;
    var bestDist = Infinity;
    getSlides(track).forEach(function (slide) {
      var sr = slide.getBoundingClientRect();
      if (sr.bottom <= top || sr.top >= bottom) return;
      var center = (sr.top + sr.bottom) / 2;
      var dist = Math.abs(center - midY);
      if (dist < bestDist) {
        bestDist = dist;
        bestSnap = slide;
      }
    });
    return bestSnap;
  }

  function normalizeMenublockSectionId(value) {
    if (value == null || value === '') return '';
    try {
      return decodeURIComponent(String(value).replace(/\+/g, ' '));
    } catch (_) {
      return String(value);
    }
  }

  function menublockSectionIdFromHref(href) {
    if (!href || href.charAt(0) !== '#') return '';
    return normalizeMenublockSectionId(href.slice(1));
  }

  function sectionIdFromSlide(slide) {
    if (!slide) return null;
    if (slide.classList.contains('ads-reels-slide')) return 'Promotions';
    var explicit = slide.getAttribute('data-reel-section');
    if (explicit) return explicit;
    var anchor = slide.querySelector('.menu-anchor[id]');
    return anchor ? anchor.id : null;
  }

  function resolveSectionIdForSlide(slide, slides) {
    if (!slide) return null;
    var id = sectionIdFromSlide(slide);
    if (id) return id;
    if (!slides || !slides.length) return null;
    var idx = slides.indexOf(slide);
    if (idx < 0) return null;
    for (var i = idx; i >= 0; i--) {
      id = sectionIdFromSlide(slides[i]);
      if (id) return id;
    }
    return null;
  }

  function setMenublockActive(sectionId, options) {
    options = options || {};
    var menublock = document.getElementById('menublock');
    if (!menublock) return;

    var targetId = normalizeMenublockSectionId(sectionId);

    menublock.querySelectorAll('.menublock-item').forEach(function (li) {
      if (li.classList.contains('menublock-item--search') || li.classList.contains('menublock-item--tags')) return;
      var link = li.querySelector('.menublock-link');
      if (!link) return;
      var href = link.getAttribute('href') || '';
      var isMatch = !!(targetId && menublockSectionIdFromHref(href) === targetId);
      li.classList.toggle('active', isMatch);
      if (isMatch) {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'location');
        if (
          !options.skipMenublockScroll &&
          typeof window.scrollMenublockLinkIntoView === 'function'
        ) {
          window.scrollMenublockLinkIntoView(link);
        }
      } else {
        link.classList.remove('is-active');
        link.removeAttribute('aria-current');
      }
    });
  }

  function syncFooterFromTrack() {
    var track = getTrack();
    if (!track) {
      document.body.classList.remove('menu-reels-intro-active');
      document.body.classList.remove('menu-reels-contact-active');
      return;
    }
    var dom = getDominantSlide(track);
    var onIntro = !!(dom && dom.classList.contains('menu-reels-slide--intro'));
    var onContact = !!(dom && dom.classList.contains('menu-reels-slide--contact'));
    document.body.classList.toggle('menu-reels-intro-active', onIntro);
    document.body.classList.toggle('menu-reels-contact-active', onContact);
    if ((onIntro || onContact) && typeof window.closeFooterSettings === 'function') {
      window.closeFooterSettings();
    }
  }

  function syncMenublockFromTrack() {
    if (pendingMenublockScrollId || Date.now() < menublockNavLockUntil) return;
    var track = getTrack();
    if (!track) return;
    var slides = getSlides(track);
    var dom = getDominantSlide(track);
    syncFooterFromTrack();
    if (!dom) {
      var scrollPos = isSmoothNavMode() ? window.scrollY : track.scrollTop;
      if (scrollPos < 40) {
        lastSyncedMenublockSectionId = null;
        if (lastMenublockActiveId !== null) {
          lastMenublockActiveId = null;
          setMenublockActive(null);
        }
      }
      return;
    }
    var id = resolveSectionIdForSlide(dom, slides);
    if (id === 'Sponsored') {
      lastSyncedMenublockSectionId = 'Sponsored';
      return;
    }
    if (id && id !== lastSyncedMenublockSectionId) {
      lastSyncedMenublockSectionId = id;
      if (!isSmoothNavMode() && typeof window.loadHomeMenuForSectionId === 'function') {
        window.loadHomeMenuForSectionId(id);
      }
    }
    if (id !== lastMenublockActiveId) {
      lastMenublockActiveId = id || null;
      if (id) setMenublockActive(id);
    }
  }

  function cssEscapeAttr(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(String(value));
    }
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function findSlideForSectionId(id) {
    var track = getTrack();
    if (!track || !id) return null;
    var targetId = normalizeMenublockSectionId(id);

    var headers = track.querySelectorAll('.menu-header.menu-reels-slide');
    var i;
    for (i = 0; i < headers.length; i++) {
      var header = headers[i];
      if (normalizeMenublockSectionId(header.getAttribute('data-reel-section')) === targetId) {
        return header;
      }
      var anchor = header.querySelector('.menu-anchor[id]');
      if (anchor && normalizeMenublockSectionId(anchor.id) === targetId) {
        return header;
      }
    }

    return null;
  }

  function getSnapSlideStride(track) {
    if (!track || isSmoothNavMode()) return 0;
    var children = getTrackSlideChildren(track);
    if (children.length >= 2) {
      var delta = children[1].offsetTop - children[0].offsetTop;
      if (delta > 0) return delta;
    }
    if (children.length === 1) {
      var one = children[0].offsetHeight;
      if (one > 0) return one;
    }
    return track.clientHeight || 0;
  }

  function getSlideIndex(track, slide) {
    if (!track || !slide) return -1;
    return getSlides(track).indexOf(slide);
  }

  function slideScrollTop(track, slide) {
    if (isSmoothNavMode()) {
      return slide.getBoundingClientRect().top + window.scrollY - getHeaderScrollOffset();
    }
    if (!track || !slide) return 0;
    if (slide.parentElement === track) {
      return slide.offsetTop;
    }
    var tr = track.getBoundingClientRect();
    var sr = slide.getBoundingClientRect();
    return track.scrollTop + (sr.top - tr.top);
  }

  function isMenublockNavToSection(sectionId) {
    if (!pendingMenublockScrollId) return false;
    return (
      normalizeMenublockSectionId(pendingMenublockScrollId) ===
      normalizeMenublockSectionId(sectionId)
    );
  }

  function isSlideAlignedByScroll(track, slide) {
    if (!track || !slide || !slide.isConnected) return false;
    var targetTop = slideScrollTop(track, slide);
    var current = isSmoothNavMode() ? window.scrollY : track.scrollTop;
    return Math.abs(current - targetTop) <= MENUBLOCK_ALIGN_PX;
  }

  function isSectionNavSlideReady(slide) {
    if (!slide || !slide.isConnected) return false;
    if (!slide.classList.contains('menu-header')) return true;
    if (!slide.hasAttribute('data-home-menu-lazy')) return true;
    return slide.dataset.homeMenuLoaded === '1';
  }

  function isSlideAligned(track, slide, targetId) {
    if (!track || !slide || !slide.isConnected) return false;
    if (!isSlideAlignedByScroll(track, slide)) return false;

    var dom = getDominantSlide(track);
    if (!dom) return true;
    if (dom === slide) return true;

    var targetSection = normalizeMenublockSectionId(targetId || sectionIdFromSlide(slide));
    var slides = getSlides(track);
    var domSection = normalizeMenublockSectionId(resolveSectionIdForSlide(dom, slides));

    if (slide.classList.contains('menu-header')) {
      return domSection === targetSection;
    }

    if (!isSmoothNavMode() && slide.classList.contains('menu-item-card')) {
      return domSection === targetSection;
    }

    return isSmoothNavMode() ? domSection === targetSection : false;
  }

  function applySnapTrackScroll(track, slide) {
    if (!track || !slide) return;
    var top = slideScrollTop(track, slide);
    var prevSnap = track.style.scrollSnapType;
    track.style.scrollSnapType = 'none';
    track.scrollTop = top;
    requestAnimationFrame(function () {
      track.scrollTop = slideScrollTop(track, slide);
      requestAnimationFrame(function () {
        track.scrollTop = slideScrollTop(track, slide);
        track.style.scrollSnapType = prevSnap || '';
      });
    });
  }

  function ensureFlatTrackForNav() {
    var track = getTrack();
    if (!track) return;
    flattenReelsTrack(track);
  }

  function nudgeMenublockScrollToSection(id, behavior) {
    if (!id || !isMenublockNavToSection(id)) return;
    var targetId = normalizeMenublockSectionId(id);
    var token = menublockNavToken;
    scheduleMenublockScrollFinalize(targetId, behavior || 'auto', token);
    scheduleMenublockScrollRetry(targetId, behavior || 'auto', token);
  }

  function clearMenublockFinalizeTimer() {
    if (menublockFinalizeTimer) {
      clearTimeout(menublockFinalizeTimer);
      menublockFinalizeTimer = null;
    }
  }

  function markMenublockNavComplete(targetId) {
    if (pendingMenublockScrollId && normalizeMenublockSectionId(pendingMenublockScrollId) === targetId) {
      pendingMenublockScrollId = null;
    }
    if (pendingHashSectionId && normalizeMenublockSectionId(pendingHashSectionId) === targetId) {
      pendingHashSectionId = null;
    }
  }

  function scrollToSlide(slide, behavior) {
    var track = getTrack();
    if (!track || !slide) return;
    var resolvedBehavior = behavior || 'smooth';
    if (pendingMenublockScrollId || Date.now() < menublockNavLockUntil) {
      lastDominantSlide = slide;
    }
    if (isSmoothNavMode()) {
      window.scrollTo({
        top: Math.max(0, slideScrollTop(track, slide)),
        left: 0,
        behavior: resolvedBehavior
      });
    } else if (resolvedBehavior === 'auto') {
      applySnapTrackScroll(track, slide);
    } else {
      track.scrollTo({
        top: slideScrollTop(track, slide),
        left: 0,
        behavior: resolvedBehavior
      });
    }
    window.setTimeout(syncMenublockFromTrack, resolvedBehavior === 'auto' ? 50 : 400);
  }

  function compareDocumentOrder(a, b) {
    if (a === b) return 0;
    var pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  }

  function sectionSlugFromItemCard(card) {
    if (!card) return '';
    var slug = card.getAttribute('data-section-slug');
    if (slug) return slug;
    var btn = card.querySelector('.menu-favorite-btn[data-favorite-section]');
    if (btn) return btn.getAttribute('data-favorite-section') || '';
    var url = card.getAttribute('data-item-url') || '';
    var match = url.match(/^\/([^/]+)\//);
    return match ? match[1] : '';
  }

  function getItemsForSection(track, slug) {
    if (!slug) return [];
    return Array.from(track.querySelectorAll('.menu-item-card.menu-reels-slide')).filter(function (card) {
      return sectionSlugFromItemCard(card) === slug;
    }).sort(compareDocumentOrder);
  }

  function dedupeAdSlides(track) {
    var byId = {};
    track.querySelectorAll('.ads-reels-slide').forEach(function (slide) {
      var id = slide.getAttribute('data-ad-id') || slide.id;
      if (!id) return;
      if (!byId[id]) {
        byId[id] = slide;
        return;
      }
      var keep = byId[id];
      var keepIdx = parseInt(keep.getAttribute('data-catalog-index'), 10) || 0;
      var slideIdx = parseInt(slide.getAttribute('data-catalog-index'), 10) || 0;
      if (slideIdx < keepIdx) {
        keep.remove();
        byId[id] = slide;
      } else {
        slide.remove();
      }
    });
  }

  function collectSlidesInReelOrder(track) {
    dedupeAdSlides(track);

    var ordered = [];
    var seen = new Set();
    var push = function (el) {
      if (!el || seen.has(el)) return;
      seen.add(el);
      ordered.push(el);
    };

    push(track.querySelector('.menu-reels-slide--hero'));
    push(track.querySelector('.menu-reels-slide--contact'));
    push(track.querySelector('.menu-reels-slide--intro'));

    track.querySelectorAll('.menu-reels-slide--section-title').forEach(function (el) {
      push(el);
    });

    Array.from(track.querySelectorAll('.ads-reels-slide'))
      .filter(isVisibleReelSlide)
      .sort(function (a, b) {
        return (
          (parseInt(a.getAttribute('data-catalog-index'), 10) || 0) -
          (parseInt(b.getAttribute('data-catalog-index'), 10) || 0)
        );
      })
      .forEach(push);

    Array.from(track.querySelectorAll('.menu-header.menu-reels-slide'))
      .sort(function (a, b) {
        return (
          (parseInt(a.getAttribute('data-weight'), 10) || 999) -
          (parseInt(b.getAttribute('data-weight'), 10) || 999)
        );
      })
      .forEach(function (header) {
        push(header);
        var slug = header.getAttribute('data-section-slug') || '';
        getItemsForSection(track, slug).forEach(push);
      });

    track.querySelectorAll('.menu-reels-slide, .ads-reels-slide').forEach(function (slide) {
      if (!isVisibleReelSlide(slide)) return;
      if (slide.classList.contains('menu-reels-slide--bottom-ads')) return;
      push(slide);
    });

    push(track.querySelector('.menu-reels-slide--bottom-ads'));

    return ordered;
  }

  function cleanupTrackShells(track) {
    var adsContainer = track.querySelector('#homepage-ads-container');
    if (adsContainer) {
      adsContainer.querySelectorAll('.ads-loading').forEach(function (el) {
        el.remove();
      });
    }
    ['#packery-container', '.main-body'].forEach(function (sel) {
      var el = track.querySelector(sel);
      if (!el) return;
      if (!el.querySelector('.menu-reels-slide, .ads-reels-slide')) el.remove();
    });
    if (adsContainer && !adsContainer.querySelector('.menu-reels-slide, .ads-reels-slide')) {
      if (!adsContainer.querySelector('.ads-loading') && !adsContainer.textContent.trim()) {
        adsContainer.remove();
      }
    }
    track.querySelectorAll('.main-menu-bg').forEach(function (bg) {
      if (!bg.querySelector('.menu-reels-slide, .ads-reels-slide')) bg.remove();
    });
    track.querySelectorAll('a.menu-anchor#ads-section').forEach(function (anchor) {
      if (!anchor.classList.contains('menu-reels-slide')) anchor.remove();
    });
  }

  function insertAdsPlaceholderAfterPromotions(track, placeholder) {
    if (!track || !placeholder) return;
    var promo = track.querySelector(
      '.menu-reels-slide[data-reel-section="Promotions"]'
    );
    if (promo && promo.nextSibling !== placeholder) {
      track.insertBefore(placeholder, promo.nextSibling);
      return;
    }
    if (!promo && !track.contains(placeholder)) {
      track.appendChild(placeholder);
    }
  }

  /** Move .bottomads / #pageadscontainer into the reels track as the final snap slide. */
  function mountBottomAdsInTrack(track) {
    if (!track) return null;

    var existingSlide = track.querySelector('.menu-reels-slide--bottom-ads');
    if (existingSlide) {
      if (existingSlide !== track.lastElementChild) {
        track.appendChild(existingSlide);
      }
      var existingWrap = existingSlide.querySelector('.bottomads');
      if (existingWrap) {
        existingWrap.classList.add('menu-reels-bottom-ads-in-track');
      }
      return existingSlide;
    }

    var container = document.getElementById('pageadscontainer');
    if (!container) return null;

    if (track.contains(container)) {
      var slideFromContainer = container.closest('.menu-reels-slide--bottom-ads');
      if (slideFromContainer) return slideFromContainer;
    }

    var bottomads = document.querySelector('.bottomads');
    if (!bottomads || !bottomads.contains(container)) {
      bottomads = container.parentElement;
      if (
        !bottomads ||
        bottomads === track ||
        bottomads.classList.contains('menu-reels-slide--bottom-ads')
      ) {
        bottomads = document.createElement('div');
        bottomads.className = 'bottomads';
        if (container.parentElement) {
          container.parentElement.insertBefore(bottomads, container);
        }
        bottomads.appendChild(container);
      }
    }

    var slide = document.createElement('section');
    slide.className = 'menu-reels-slide menu-reels-slide--bottom-ads';
    slide.setAttribute('data-reel-section', 'Sponsored');
    slide.id = 'menu-reels-sponsored-ads';

    if (bottomads.parentElement) {
      bottomads.parentElement.removeChild(bottomads);
    }

    slide.appendChild(bottomads);
    track.appendChild(slide);
    bottomads.classList.add('menu-reels-bottom-ads-in-track');
    bottomads.dataset.mountedInReelsTrack = '1';
    return slide;
  }

  function getTrackSlideChildren(track) {
    return Array.from(track.children).filter(function (child) {
      if (child.id === 'homepage-ads-container') return false;
      return (
        (child.classList.contains('menu-reels-slide') || child.classList.contains('ads-reels-slide')) &&
        isVisibleReelSlide(child)
      );
    });
  }

  /** True when slides are nested or out of canonical order (full rebuild required). */
  function trackNeedsFlatten(track) {
    if (!track) return false;
    if (track.querySelector('#packery-container, .main-body, .main-menu-bg')) return true;

    var expected = collectSlidesInReelOrder(track);
    var i;
    for (i = 0; i < expected.length; i++) {
      if (expected[i].parentElement !== track) return true;
    }

    var actual = getTrackSlideChildren(track);
    if (actual.length !== expected.length) return true;
    for (i = 0; i < expected.length; i++) {
      if (actual[i] !== expected[i]) return true;
    }
    return false;
  }

  /** Move every reel slide to direct children of the track in canonical order. */
  function flattenReelsTrack(track, options) {
    options = options || {};
    if (!track) return false;

    if (!options.force && !trackNeedsFlatten(track)) {
      cleanupTrackShells(track);
      mountBottomAdsInTrack(track);
      return false;
    }

    var restoreScrollY = null;
    var restoreTrackScrollTop = null;
    var navTargetId = pendingMenublockScrollId || pendingHashSectionId;
    var navLocked = Date.now() < menublockNavLockUntil;
    var anchorSlide = navTargetId ? findSlideForSectionId(navTargetId) : null;
    if (!navTargetId && !navLocked && !anchorSlide) {
      anchorSlide = getDominantSlide(track);
    }
    if (navTargetId || navLocked) {
      restoreScrollY = null;
      restoreTrackScrollTop = null;
    } else if (isSmoothNavMode()) {
      if (anchorSlide && anchorSlide.isConnected) {
        restoreScrollY = slideScrollTop(track, anchorSlide);
      } else {
        restoreScrollY = window.scrollY;
      }
    } else if (track) {
      if (anchorSlide && anchorSlide.isConnected) {
        restoreTrackScrollTop = slideScrollTop(track, anchorSlide);
      } else {
        restoreTrackScrollTop = track.scrollTop;
      }
    }

    var bottomAdsSlide = track.querySelector('.menu-reels-slide--bottom-ads');
    if (bottomAdsSlide && bottomAdsSlide.parentElement === track) {
      bottomAdsSlide.parentElement.removeChild(bottomAdsSlide);
    }

    var slides = collectSlidesInReelOrder(track);
    if (bottomAdsSlide && slides.indexOf(bottomAdsSlide) === -1) {
      slides.push(bottomAdsSlide);
    }
    var adsPlaceholder = track.querySelector('#homepage-ads-container');
    var keepAdsPlaceholder =
      adsPlaceholder && !adsPlaceholder.querySelector('.ads-reels-slide');

    while (track.firstChild) {
      track.removeChild(track.firstChild);
    }

    var insertedAdsPlaceholder = false;
    slides.forEach(function (slide) {
      track.appendChild(slide);
      if (
        keepAdsPlaceholder &&
        !insertedAdsPlaceholder &&
        slide.getAttribute('data-reel-section') === 'Promotions'
      ) {
        track.appendChild(adsPlaceholder);
        insertedAdsPlaceholder = true;
      }
    });

    if (keepAdsPlaceholder && !insertedAdsPlaceholder) {
      insertAdsPlaceholderAfterPromotions(track, adsPlaceholder);
    }

    cleanupTrackShells(track);

    mountBottomAdsInTrack(track);

    if (restoreScrollY != null) {
      var y = restoreScrollY;
      var anchor = anchorSlide;
      requestAnimationFrame(function () {
        if (anchor && anchor.isConnected) {
          window.scrollTo({ top: slideScrollTop(track, anchor), left: 0, behavior: 'auto' });
        } else {
          window.scrollTo({ top: Math.max(0, y), left: 0, behavior: 'auto' });
        }
      });
    } else if (restoreTrackScrollTop != null) {
      var savedTop = restoreTrackScrollTop;
      var snapAnchor = anchorSlide;
      requestAnimationFrame(function () {
        if (snapAnchor && snapAnchor.isConnected) {
          track.scrollTop = slideScrollTop(track, snapAnchor);
        } else {
          track.scrollTop = savedTop;
        }
        syncMenublockFromTrack();
      });
    }

    try {
      var win = track.ownerDocument && track.ownerDocument.defaultView;
      if (win) win.dispatchEvent(new CustomEvent('menuReelsFlattened'));
    } catch (e) { /* ignore */ }
    return true;
  }

  function teardownTrackScroll(track) {
    if (!track) return;
    if (track._ttmsReelsTrackAbort) {
      track._ttmsReelsTrackAbort.abort();
      track._ttmsReelsTrackAbort = null;
    }
    if (scrollHandler) {
      track.removeEventListener('scroll', scrollHandler);
      if (track._ttmsReelsWindowScrollBound) {
        window.removeEventListener('scroll', scrollHandler);
        track._ttmsReelsWindowScrollBound = false;
      }
    }
    track._ttmsReelsTrackBound = false;
  }

  var pendingHashSectionId = null;
  var pendingMenublockScrollId = null;
  var hashRetryBound = false;
  var menublockScrollRetryTimer = null;
  var menublockScrollAttempts = 0;

  function clearMenublockScrollRetryOnly() {
    if (menublockScrollRetryTimer) {
      clearTimeout(menublockScrollRetryTimer);
      menublockScrollRetryTimer = null;
    }
    menublockScrollAttempts = 0;
  }

  function clearMenublockScrollRetry() {
    clearMenublockScrollRetryOnly();
    clearMenublockFinalizeTimer();
  }

  function finalizeMenublockScroll(id, behavior, navToken) {
    if (!id) return false;
    if (navToken && navToken !== menublockNavToken) return false;

    var track = getTrack();
    var targetId = normalizeMenublockSectionId(id);
    var slide = findSlideForSectionId(targetId);
    if (!slide) return false;
    if (!isSectionNavSlideReady(slide)) return false;

    if (isSlideAligned(track, slide, targetId)) {
      setMenublockActive(targetId, { skipMenublockScroll: true });
      markMenublockNavComplete(targetId);
      menublockNavLockUntil = 0;
      return true;
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (navToken && navToken !== menublockNavToken) return;
        var liveTrack = getTrack();
        var liveSlide = findSlideForSectionId(targetId);
        if (!liveTrack || !liveSlide) return;
        scrollToSlide(liveSlide, behavior || 'auto');
        setMenublockActive(targetId, { skipMenublockScroll: true });
        window.setTimeout(function () {
          if (navToken && navToken !== menublockNavToken) return;
          var settledTrack = getTrack();
          var settledSlide = findSlideForSectionId(targetId);
          if (!settledTrack || !settledSlide) return;
        if (!isSlideAligned(settledTrack, settledSlide, targetId)) {
          applySnapTrackScroll(settledTrack, settledSlide);
        }
          if (isSlideAligned(settledTrack, settledSlide, targetId)) {
            markMenublockNavComplete(targetId);
            menublockNavLockUntil = 0;
          }
        }, 100);
      });
    });
    return false;
  }

  function scheduleMenublockScrollFinalize(id, behavior, navToken) {
    clearMenublockFinalizeTimer();
    menublockFinalizeTimer = setTimeout(function () {
      menublockFinalizeTimer = null;
      finalizeMenublockScroll(id, behavior, navToken);
    }, 16);
  }

  function armMenublockScrollAfterLayout(id, behavior, navToken) {
    function run() {
      if (navToken && navToken !== menublockNavToken) return;
      scheduleMenublockScrollFinalize(id, behavior, navToken);
      scheduleMenublockScrollRetry(id, behavior, navToken);
    }

    run();
    window.addEventListener('menuReelsUpdated', run, { once: true });
    window.addEventListener('menuReelsFlattened', run, { once: true });
  }

  function scheduleMenublockScrollRetry(id, behavior, navToken) {
    clearMenublockScrollRetryOnly();
    var targetId = normalizeMenublockSectionId(id);
    if (!targetId) return;

    function attempt() {
      if (navToken && navToken !== menublockNavToken) return;
      menublockScrollAttempts += 1;
      if (finalizeMenublockScroll(targetId, behavior, navToken)) {
        clearMenublockScrollRetry();
        return;
      }
      if (menublockScrollAttempts < 16) {
        menublockScrollRetryTimer = setTimeout(attempt, menublockScrollAttempts < 4 ? 100 : 180);
      } else {
        markMenublockNavComplete(targetId);
        menublockNavLockUntil = 0;
      }
    }

    attempt();
  }

  function scrollToSectionId(id, options) {
    options = options || {};
    if (!id) return Promise.resolve(false);

    var targetId = normalizeMenublockSectionId(id);
    menublockNavToken += 1;
    var navToken = menublockNavToken;
    menublockNavLockUntil = Date.now() + 4000;
    pendingMenublockScrollId = targetId;
    pendingHashSectionId = targetId;
    lastDominantSlide = null;
    lastSyncedMenublockSectionId = null;
    clearMenublockScrollRetry();

    var scrollBehavior = options.behavior || 'auto';

    function onSectionReady(e) {
      if (navToken !== menublockNavToken) return;
      if (e && e.detail && e.detail.sectionId) {
        if (normalizeMenublockSectionId(e.detail.sectionId) !== targetId) return;
      }
      ensureFlatTrackForNav();
      armMenublockScrollAfterLayout(targetId, scrollBehavior, navToken);
    }

    window.addEventListener('ttms:section-menu-loaded', onSectionReady);
    window.setTimeout(function () {
      window.removeEventListener('ttms:section-menu-loaded', onSectionReady);
    }, 5000);

    ensureFlatTrackForNav();
    var initialSlide = findSlideForSectionId(targetId);
    if (initialSlide && options.prefetchScroll !== false) {
      scrollToSlide(initialSlide, 'auto');
    }

    var loadPromise =
      typeof window.loadHomeMenuForSectionId === 'function'
        ? Promise.resolve(window.loadHomeMenuForSectionId(targetId))
        : Promise.resolve();

    return loadPromise
      .catch(function () {
        return null;
      })
      .then(function () {
        if (navToken !== menublockNavToken) return false;
        ensureFlatTrackForNav();
        armMenublockScrollAfterLayout(targetId, scrollBehavior, navToken);
      });
  }

  function scrollToHashSectionIfPresent(behavior) {
    if (!window.location.hash) return false;
    var hashId = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (!hashId) return false;

    pendingHashSectionId = hashId;
    scrollToSectionId(hashId, { behavior: behavior || 'auto' });
    return true;
  }

  function retryPendingHashNavigation() {
    if (Date.now() < menublockNavLockUntil) return;
    var id = pendingMenublockScrollId || pendingHashSectionId;
    if (!id) return;
    var navToken = menublockNavToken;
    if (finalizeMenublockScroll(id, 'auto', navToken)) return;
    scheduleMenublockScrollRetry(id, 'auto', navToken);
  }

  function bindHashRetryOnMenuReady() {
    if (hashRetryBound) return;
    hashRetryBound = true;

    ['ttms:home-menu-ready', 'menuReelsUpdated'].forEach(function (eventName) {
      window.addEventListener(eventName, retryPendingHashNavigation);
    });
  }

  function cancelMenublockNavigation() {
    menublockNavToken += 1;
    pendingMenublockScrollId = null;
    pendingHashSectionId = null;
    menublockNavLockUntil = 0;
    clearMenublockScrollRetry();
  }

  function scrollTrackToTop(behavior) {
    cancelMenublockNavigation();
    unlockReelsTrackScroll();

    var scrollBehavior = behavior || 'auto';
    var track = getTrack();

    if (window.scrollTo) {
      window.scrollTo({ top: 0, left: 0, behavior: scrollBehavior });
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    if (track) {
      var prevSnap = track.style.scrollSnapType;
      track.style.scrollSnapType = 'none';
      if (track.scrollTo) {
        track.scrollTo({ top: 0, left: 0, behavior: scrollBehavior });
      }
      track.scrollTop = 0;
      requestAnimationFrame(function () {
        track.scrollTop = 0;
        track.style.scrollSnapType = prevSnap || '';
        syncFooterFromTrack();
      });
    }

    setMenublockActive(null, { skipMenublockScroll: true });
  }

  function bindMenublockReelsNav() {
    if (document.documentElement._ttmsReelsNavBound) {
      return;
    }
    document.documentElement._ttmsReelsNavBound = true;

    document.addEventListener('click', function (e) {
      var link = e.target.closest('#menublock .menublock-link[href^="#"]');
      if (!link) return;
      var hash = link.getAttribute('href');
      if (!hash || hash === '#') return;
      var id = decodeURIComponent(hash.slice(1));
      if (e.cancelable) {
        e.preventDefault();
      }
      e.stopPropagation();
      if (typeof closeCart === 'function') closeCart();
      if (typeof window.closeMenublockDropdown === 'function') {
        window.closeMenublockDropdown();
      }
      history.replaceState(null, '', window.location.pathname + window.location.search + '#' + id);
      scrollToSectionId(id, { behavior: 'auto' });
    });
  }

  function isInnerScrollSlide(slide) {
    if (!slide) return false;
    if (document.body.classList.contains('menu-reels-item-modal-open')) return false;
    return (
      slide.classList.contains('menu-item-card') &&
      slide.getAttribute('data-item-expanded') === 'true'
    );
  }

  function lockReelsTrackScroll() {
    var track = getTrack();
    if (!track) return;
    track._ttmsLockedScrollTop = track.scrollTop;
    track.classList.add('menu-reels-track--locked');
  }

  function unlockReelsTrackScroll() {
    var track = getTrack();
    if (!track) return;
    if (typeof track._ttmsLockedScrollTop === 'number') {
      track.scrollTop = track._ttmsLockedScrollTop;
    }
    delete track._ttmsLockedScrollTop;
    track.classList.remove('menu-reels-track--locked');
  }

  function scrollToAdjacentSlide(track, slide, delta) {
    var slides = getSlides(track);
    var idx = slides.indexOf(slide);
    if (idx < 0) return false;
    var next = delta > 0 ? slides[idx + 1] : slides[idx - 1];
    if (!next) return false;
    scrollToSlide(next, 'smooth');
    return true;
  }

  function getInnerScrollSlide(target, track) {
    if (!target || !target.closest) return null;
    var slide = target.closest(
      '.contactinfobg.menu-reels-slide, .hero-content.menu-reels-slide, .menu-item-card.menu-reels-slide'
    );
    if (!slide || !track.contains(slide) || !isInnerScrollSlide(slide)) return null;
    return slide;
  }

  function shouldChainScrollToTrack(slide, delta) {
    if (!delta) return false;
    var canScrollInside = slide.scrollHeight > slide.clientHeight + 2;
    if (!canScrollInside) return true;
    var atTop = slide.scrollTop <= 1;
    var atBottom = slide.scrollTop + slide.clientHeight >= slide.scrollHeight - 2;
    return (delta < 0 && atTop) || (delta > 0 && atBottom);
  }

  function bindTrackScroll() {
    var track = getTrack();
    if (!track || track._ttmsReelsTrackBound) return;

    teardownTrackScroll(track);
    track._ttmsReelsTrackBound = true;

    scrollHandler = function () {
      if (scrollSyncPending) return;
      scrollSyncPending = true;
      requestAnimationFrame(function () {
        scrollSyncPending = false;
        syncMenublockFromTrack();
      });
    };

    if (isSmoothNavMode()) {
      window.addEventListener('scroll', scrollHandler, { passive: true });
      track._ttmsReelsWindowScrollBound = true;
      return;
    }

    var trackAbort = new AbortController();
    track._ttmsReelsTrackAbort = trackAbort;
    var signal = trackAbort.signal;

    track.addEventListener('scroll', scrollHandler, { passive: true, signal: signal });

    track.addEventListener(
      'wheel',
      function (e) {
        if (document.body.classList.contains('menu-reels-item-modal-open')) {
          e.preventDefault();
          return;
        }
        var slide = getInnerScrollSlide(e.target, track);
        if (!slide || !shouldChainScrollToTrack(slide, e.deltaY)) return;
        e.preventDefault();
        if (!scrollToAdjacentSlide(track, slide, e.deltaY)) {
          track.scrollTop += e.deltaY;
        }
      },
      { passive: false, capture: true, signal: signal }
    );

    var touchState = { slide: null, lastY: 0 };
    track.addEventListener(
      'touchstart',
      function (e) {
        touchState.slide = getInnerScrollSlide(e.target, track);
        touchState.lastY = e.touches[0] ? e.touches[0].clientY : 0;
      },
      { passive: true, signal: signal }
    );
    track.addEventListener(
      'touchmove',
      function (e) {
        if (window.TTMS_PTR_PULLING) return;
        if (document.body.classList.contains('menu-reels-item-modal-open')) {
          e.preventDefault();
          return;
        }
        if (!touchState.slide || !e.touches[0]) return;
        var y = e.touches[0].clientY;
        var delta = touchState.lastY - y;
        touchState.lastY = y;
        if (!shouldChainScrollToTrack(touchState.slide, delta)) return;
        e.preventDefault();
        if (!scrollToAdjacentSlide(track, touchState.slide, delta)) {
          track.scrollTop += delta;
        }
      },
      { passive: false, capture: true, signal: signal }
    );
    track.addEventListener(
      'touchend',
      function () {
        touchState.slide = null;
      },
      { passive: true, signal: signal }
    );

    track.addEventListener(
      'click',
      function (e) {
        var card = e.target.closest('.menu-item-card.menu-reels-slide');
        if (!card || e.target.closest('.menu-favorite-btn')) return;
        var savedTop = track.scrollTop;
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () {
            if (document.body.classList.contains('menu-reels-item-modal-open')) {
              if (typeof track._ttmsLockedScrollTop === 'number') {
                track.scrollTop = track._ttmsLockedScrollTop;
              }
              return;
            }
            if (Math.abs(track.scrollTop - savedTop) > 8) {
              track.scrollTop = savedTop;
            }
          });
        });
      },
      { capture: true, signal: signal }
    );
  }

  function shouldOpenMenuItemOrderFromEvent(e) {
    if (!e || !e.target || !e.target.closest) return false;

    if (
      e.target.closest(
        '.menu-favorite-btn, .menu-add-photo-btn, .menu-image-add-btn, .menu-image-actions, [data-smash-action], .menu-smash-pass-card__counts, .menu-smash-pass-card__title-link'
      )
    ) {
      return false;
    }

    if (e.target.closest('.menu-item-row-top')) {
      return true;
    }

    if (e.target.closest('.menu-smash-pass-card.is-local, .menu-smash-pass-card--add-photo, .menu-smash-pass__empty-state')) {
      return true;
    }

    if (e.target.closest('.menu-smash-pass-card:not(.is-local)')) {
      return !!e.target.closest('.menu-item-card.menu-reels-slide .menu-item-smash-pass');
    }

    return !!e.target.closest('.menu-item-card.menu-reels-slide');
  }

  function openReelsMenuItemOrder(card, url, event) {
    if (!card || !url) return;

    var root = document.documentElement;
    if (
      root._ttmsMenuItemOrderLast &&
      root._ttmsMenuItemOrderLast.card === card &&
      Date.now() - root._ttmsMenuItemOrderLast.at < 450
    ) {
      return;
    }
    root._ttmsMenuItemOrderLast = { card: card, at: Date.now() };

    if (typeof window.toggleItemExpansion === 'function') {
      window.toggleItemExpansion(card, url, event);
      return;
    }

    console.error('[menu-reels] toggleItemExpansion is not available — main.js may have failed to load');

    if (typeof window.openMenuReelsItemModal === 'function') {
      window.openMenuReelsItemModal(card);
    }
  }

  function bindMenuItemReelsClicks() {
    var root = document.documentElement;
    if (root._ttmsMenuItemReelsClickBound) return;
    root._ttmsMenuItemReelsClickBound = true;

    document.addEventListener(
      'click',
      function (e) {
        var track = getTrack();
        if (!track) return;
        if (!shouldOpenMenuItemOrderFromEvent(e)) return;

        var card = e.target.closest('.menu-item-card.menu-reels-slide');
        if (!card || !track.contains(card)) return;

        var url = card.getAttribute('data-item-url');
        if (!url) return;

        openReelsMenuItemOrder(card, url, e);
      },
      false
    );
  }

  function observeSections(track) {
    if (observer) observer.disconnect();
    var slides = getSlides(track).filter(function (slide) {
      if (slide.classList.contains('menu-item-card')) return false;
      return !!sectionIdFromSlide(slide);
    });
    if (!slides.length) return;

    observer = new IntersectionObserver(
      function () {
        syncMenublockFromTrack();
      },
      {
        root: isSmoothNavMode() ? null : track,
        rootMargin: '0px',
        threshold: [0, 0.35, 0.55, 0.75, 1]
      }
    );
    slides.forEach(function (slide) {
      observer.observe(slide);
    });
  }

  function runInitMenuReels(forceFlatten) {
    if (initReelsRunning) return;
    initReelsRunning = true;

    var track = getTrack();
    if (!track) {
      document.documentElement.classList.remove('menu-reels-mode');
      document.body.classList.remove('menu-reels-mode');
      document.body.classList.remove('menu-reels-intro-active');
      document.body.classList.remove('menu-reels-contact-active');
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      initReelsRunning = false;
      return;
    }

    mountBottomAdsInTrack(track);

    document.documentElement.classList.add('menu-reels-mode');
    document.body.classList.add('menu-reels-mode');

    bindMenuItemReelsClicks();

    var ssrAdsPending =
      track.querySelector('#homepage-ads-container .ads-reels-slide') &&
      !track.querySelector(':scope > .ads-reels-slide');
    if (
      ssrAdsPending &&
      window.adManager &&
      typeof window.adManager.populateHomepage === 'function' &&
      !window.adManager.hasPopulatedHome
    ) {
      window.adManager.populateHomepage();
    }

    var finishInit = function () {
      try {
        flattenReelsTrack(track, { force: !!forceFlatten });
        bindMenublockReelsNav();
        bindTrackScroll();
        observeSections(track);
        syncMenublockFromTrack();

        bindHashRetryOnMenuReady();
        if (window.location.hash) {
          scrollToHashSectionIfPresent('auto');
        } else if (!track._ttmsReelsScrolledToStart) {
          track._ttmsReelsScrolledToStart = true;
          requestAnimationFrame(function () {
            if (isSmoothNavMode()) {
              window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            } else {
              track.scrollTop = 0;
            }
            setMenublockActive(null);
          });
        }
      } finally {
        initReelsRunning = false;
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(finishInit);
    } else {
      setTimeout(finishInit, 0);
    }
  }

  function initMenuReels(options) {
    options = options || {};
    if (options.immediate) {
      if (initReelsScheduled) {
        clearTimeout(initReelsScheduled);
        initReelsScheduled = null;
      }
      runInitMenuReels(options.forceFlatten);
      return;
    }
    if (initReelsScheduled) clearTimeout(initReelsScheduled);
    initReelsScheduled = setTimeout(function () {
      initReelsScheduled = null;
      runInitMenuReels(options.forceFlatten);
    }, 50);
  }

  /** Lighter refresh after lazy-loaded menu cards — avoids full track rebuild when order is already correct. */
  function refreshMenuReelsLayout(options) {
    options = options || {};
    var track = getTrack();
    if (!track) return;
    if (initReelsScheduled) {
      clearTimeout(initReelsScheduled);
      initReelsScheduled = null;
    }
    var didFlatten = flattenReelsTrack(track);
    if (pendingMenublockScrollId) {
      var pendingId = pendingMenublockScrollId;
      var token = menublockNavToken;
      requestAnimationFrame(function () {
        scheduleMenublockScrollFinalize(pendingId, 'auto', token);
        scheduleMenublockScrollRetry(pendingId, 'auto', token);
      });
    } else if (Date.now() < menublockNavLockUntil && (pendingHashSectionId || pendingMenublockScrollId)) {
      var lockedId = pendingMenublockScrollId || pendingHashSectionId;
      var lockedToken = menublockNavToken;
      requestAnimationFrame(function () {
        scheduleMenublockScrollFinalize(lockedId, 'auto', lockedToken);
        scheduleMenublockScrollRetry(lockedId, 'auto', lockedToken);
      });
    } else if (!options.skipTrackSync && Date.now() >= menublockNavLockUntil) {
      observeSections(track);
      syncMenublockFromTrack();
    } else if (didFlatten) {
      observeSections(track);
    }
    if (!didFlatten) {
      try {
        window.dispatchEvent(new CustomEvent('menuReelsUpdated'));
      } catch (e) { /* ignore */ }
    }
  }

  function syncReelsShellClasses() {
    var track = getTrack();
    var isHome = !!track;
    document.documentElement.classList.toggle('menu-reels-mode', isHome);
    document.body.classList.toggle('menu-reels-mode', isHome);
    if (!isHome) {
      document.body.classList.remove('menu-reels-intro-active');
      document.body.classList.remove('menu-reels-contact-active');
    }
  }

  function registerLifecycle() {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(function () {
        syncReelsShellClasses();
        document.documentElement._ttmsReelsNavBound = false;
        var track = getTrack();
        if (track) {
          teardownTrackScroll(track);
          track._ttmsReelsScrolledToStart = false;
        }
        resetScrollSyncState();
        initMenuReels({ immediate: true, forceFlatten: false });
        bindMenuReelsItemModal();
      });
    }
  }

  var activeReelsItemCard = null;

  function getMenuReelsItemModal() {
    return document.getElementById('menu-reels-item-modal');
  }

  function isActiveReelsCardLive(card) {
    card = card || activeReelsItemCard;
    return !!(card && card.isConnected && card.closest && card.closest('#menu-reels-track'));
  }

  function resetReelsItemCardState(card) {
    if (!card || !card.isConnected) return;
    card.setAttribute('aria-expanded', 'false');
    card.classList.remove('expanded');
    var expandedContent = card.querySelector('.menu-item-expanded-content');
    if (expandedContent) expandedContent.style.display = 'none';
  }

  function forceCloseMenuReelsItemModal() {
    var modal = getMenuReelsItemModal();
    if (activeReelsItemCard) {
      resetReelsItemCardState(activeReelsItemCard);
    }
    activeReelsItemCard = null;

    if (!modal) return;

    var data = modal.querySelector('.menu-reels-item-modal__data');
    var loading = modal.querySelector('.menu-reels-item-modal__loading');
    if (data) {
      data.innerHTML = '';
      data.style.display = 'none';
    }
    if (loading) loading.style.display = 'none';

    var favSlot = modal.querySelector('#menuReelsItemModalFavoriteSlot');
    if (favSlot) favSlot.innerHTML = '';

    var actionsSlot = modal.querySelector('#menuReelsItemModalActionsSlot');
    if (actionsSlot) actionsSlot.innerHTML = '';

    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('is-open');
    document.body.classList.remove('menu-reels-item-modal-open');
    unlockReelsTrackScroll();
  }

  function navigateFromMenuReelsItemModal(href) {
    if (!href) return;
    if (typeof window.closeAllPanelsBeforeNavigation === 'function') {
      window.closeAllPanelsBeforeNavigation();
    } else {
      forceCloseMenuReelsItemModal();
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
      } catch (err) { /* fall through */ }
    }
    window.location.assign(href);
  }

  function syncMenuReelsModalFavoriteButton(card, modal) {
    if (!card || !modal) return;
    var slot = modal.querySelector('#menuReelsItemModalFavoriteSlot');
    if (!slot) return;
    slot.innerHTML = '';
    var cardBtn = card.querySelector('.menu-item-title-row .menu-favorite-btn, .menu-favorite-btn');
    if (!cardBtn) return;
    var btn = cardBtn.cloneNode(true);
    btn.classList.remove('is-busy');
    slot.appendChild(btn);
    if (window.TTMSMenuFavorites && typeof window.TTMSMenuFavorites.refresh === 'function') {
      window.TTMSMenuFavorites.refresh();
    }
  }

  function syncMenuReelsModalActionsMenu(card, modal) {
    if (!card || !modal) return;
    var slot = modal.querySelector('#menuReelsItemModalActionsSlot');
    if (!slot) return;
    slot.innerHTML = '';
    var cardMenu = card.querySelector('.menu-item-title-row .menu-item-actions, .menu-item-actions');
    if (!cardMenu) return;
    var menu = cardMenu.cloneNode(true);
    menu.classList.remove('is-open');
    var trigger = menu.querySelector('.menu-item-actions__trigger');
    var panel = menu.querySelector('.menu-item-actions__menu');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (panel) panel.hidden = true;
    slot.appendChild(menu);
    if (window.TTMSMenuItemActions && typeof window.TTMSMenuItemActions.init === 'function') {
      window.TTMSMenuItemActions.init();
    }
  }

  function openMenuReelsItemModal(card) {
    var modal = getMenuReelsItemModal();
    if (!modal || !card) return;

    lockReelsTrackScroll();
    activeReelsItemCard = card;
    card.setAttribute('aria-expanded', 'true');

    var titleEl = modal.querySelector('.menu-reels-item-modal__title');
    var titleLinkEl = modal.querySelector('.menu-reels-item-modal__title-link');
    var itemUrl = card.getAttribute('data-item-url') || '';
    var titleText = '';
    var cardTitleText = card.querySelector('.menu-item-title-text');
    var cardTitleLink = card.querySelector('.menu-item-title a');
    if (cardTitleText) {
      titleText = cardTitleText.textContent.trim();
    } else if (cardTitleLink) {
      titleText = cardTitleLink.textContent.trim();
    } else {
      var titleNode = card.querySelector('.menu-item-title');
      if (titleNode) titleText = titleNode.textContent.trim();
    }
    if (titleLinkEl) {
      titleLinkEl.textContent = titleText;
      if (itemUrl) {
        titleLinkEl.href = itemUrl;
        titleLinkEl.removeAttribute('aria-hidden');
      } else {
        titleLinkEl.removeAttribute('href');
        titleLinkEl.setAttribute('aria-hidden', 'true');
      }
    }

    syncMenuReelsModalFavoriteButton(card, modal);
    syncMenuReelsModalActionsMenu(card, modal);

    var loading = modal.querySelector('.menu-reels-item-modal__loading');
    var data = modal.querySelector('.menu-reels-item-modal__data');
    if (loading) loading.style.display = '';
    if (data) {
      data.style.display = 'none';
      data.innerHTML = '';
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('is-open');
    document.body.classList.add('menu-reels-item-modal-open');

    var closeBtn = modal.querySelector('.menu-reels-item-modal__close');
    if (closeBtn) closeBtn.focus();
  }

  function closeMenuReelsItemModal(card) {
    if (card && activeReelsItemCard && card !== activeReelsItemCard) return;
    forceCloseMenuReelsItemModal();
  }

  function getMenuReelsModalActiveCard() {
    return activeReelsItemCard;
  }

  function getMenuReelsItemModalTargets() {
    var modal = getMenuReelsItemModal();
    if (!modal) {
      return { container: null, loading: null, data: null };
    }
    return {
      container: modal.querySelector('.menu-reels-item-modal__body'),
      loading: modal.querySelector('.menu-reels-item-modal__loading'),
      data: modal.querySelector('.menu-reels-item-modal__data'),
    };
  }

  function getMenuReelsItemModalDataRoot() {
    var modal = getMenuReelsItemModal();
    return modal ? modal.querySelector('.menu-reels-item-modal__data') : null;
  }

  function closeActiveReelsItemModalFromUI() {
    if (isActiveReelsCardLive() && typeof window.collapseMenuItemCard === 'function') {
      window.collapseMenuItemCard(activeReelsItemCard);
      var modal = getMenuReelsItemModal();
      if (modal && !modal.classList.contains('is-open')) return;
    }
    forceCloseMenuReelsItemModal();
  }

  function ensureMenuReelsItemModalClosed() {
    var modal = getMenuReelsItemModal();
    if (!modal || !modal.classList.contains('is-open')) {
      if (!isActiveReelsCardLive()) activeReelsItemCard = null;
      return;
    }
    closeActiveReelsItemModalFromUI();
  }

  function closeAllUiPanels(options) {
    options = options || {};

    if (!options.skipReelsModal) {
      forceCloseMenuReelsItemModal();
    }

    if (!options.keepCart && typeof window.closeCart === 'function') {
      window.closeCart();
    }
    if (!options.keepDashboard && typeof window.closeDashboard === 'function') {
      window.closeDashboard();
    }
    if (!options.keepAccountDashboard && typeof window.closeAccountDashboard === 'function') {
      window.closeAccountDashboard();
    }
    if (!options.keepSearch) {
      if (typeof window.closeSearch === 'function') {
        window.closeSearch();
      } else if (typeof window.toggleSearch === 'function') {
        var search = document.getElementById('search');
        if (search && !search.classList.contains('hide-search')) {
          window.toggleSearch();
        }
      }
    }
    if (!options.keepSettings && typeof window.closeFooterSettings === 'function') {
      window.closeFooterSettings();
    }
    if (!options.keepMenublock) {
      if (typeof window.closeMenublockDropdown === 'function') {
        window.closeMenublockDropdown();
      } else {
        document.body.classList.remove('menublock-dropdown-open');
        var mainHeader = document.querySelector('.main-header');
        if (mainHeader) {
          mainHeader.classList.remove('menublock-dropdown-open');
        }
      }
    }

    if (!options.keepDashboard && !options.keepAccountDashboard) {
      document.body.classList.remove('modal-open');
    }
    if (!options.keepAccountDashboard) {
      document.body.classList.remove('account-dashboard-open');
    }
    if (!options.skipReelsModal) {
      document.body.classList.remove('menu-reels-item-modal-open');
    }
  }

  function clearStaleNavigationState() {
    [
      'cart-open',
      'modal-open',
      'table-modal-open',
      'menu-reels-item-modal-open',
      'ads-reels-open',
      'account-dashboard-open',
    ].forEach(function (cls) {
      document.body.classList.remove(cls);
    });

    unlockReelsTrackScroll();
    var track = getTrack();
    if (track) {
      track.classList.remove('menu-reels-track--locked');
      delete track._ttmsLockedScrollTop;
    }

    if (window.TTMSViewport && typeof window.TTMSViewport.forceClearScrollLock === 'function') {
      window.TTMSViewport.forceClearScrollLock();
    } else if (window.TTMSViewport && typeof window.TTMSViewport.refreshScrollLock === 'function') {
      window.TTMSViewport.refreshScrollLock();
    }

    if (typeof window.hideLoader === 'function') {
      window.hideLoader();
    }
  }

  function forceClearNavigationUiState() {
    closeAllUiPanels({ skipReelsModal: false });
    clearStaleNavigationState();
  }

  function closeAllPanelsBeforeNavigation(options) {
    closeAllUiPanels(Object.assign({ skipReelsModal: false }, options || {}));
    clearStaleNavigationState();
  }

  function isSameOriginNavigationHref(href) {
    if (!href || href.charAt(0) === '#') return false;
    if (/^(javascript:|mailto:|tel:)/i.test(href)) return false;
    try {
      return new URL(href, window.location.href).origin === window.location.origin;
    } catch (e) {
      return false;
    }
  }

  function bindMenuReelsItemModal() {
    var modal = getMenuReelsItemModal();
    if (!modal || modal._ttmsReelsItemModalBound) return;
    modal._ttmsReelsItemModalBound = true;

    modal.querySelectorAll('[data-close-reels-item-modal]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeActiveReelsItemModalFromUI();
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!modal.classList.contains('is-open')) return;
      e.preventDefault();
      closeActiveReelsItemModalFromUI();
    });

    modal.addEventListener('click', function (e) {
      if (!modal.classList.contains('is-open')) return;
      var link = e.target.closest && e.target.closest('a[href]');
      if (!link || link.hasAttribute('data-close-reels-item-modal')) return;
      if (link.classList.contains('dashboard-new-item-placeholder-link')) return;
      if (!isSameOriginNavigationHref(link.getAttribute('href'))) return;
      e.preventDefault();
      e.stopPropagation();
      navigateFromMenuReelsItemModal(link.getAttribute('href'));
    }, true);
  }

  function resetScrollSyncState() {
    lastDominantSlide = null;
    lastSyncedMenublockSectionId = null;
    lastMenublockActiveId = null;
  }

  function scrollToSponsoredAds(behavior) {
    var slide =
      document.getElementById('menu-reels-sponsored-ads') ||
      document.querySelector('.menu-reels-slide--bottom-ads');
    scrollToSlide(slide, behavior || 'smooth');
  }

  function refreshMenuNavScrollBindings() {
    var track = getTrack();
    if (!track) return;
    lastDominantSlide = null;
    teardownTrackScroll(track);
    bindTrackScroll();
    observeSections(track);
    syncMenublockFromTrack();
  }

  /** Re-anchor snap scroll after visualViewport resize (Samsung URL bar hide/show). */
  function syncReelsViewportHeight() {
    if (!document.body.classList.contains('menu-reels-mode') || isSmoothNavMode()) return;
    if (pendingMenublockScrollId || Date.now() < menublockNavLockUntil) return;
    var track = getTrack();
    if (!track) return;
    var anchor = getDominantSlide(track);
    var savedTop = track.scrollTop;
    requestAnimationFrame(function () {
      if (anchor && anchor.isConnected) {
        track.scrollTop = slideScrollTop(track, anchor);
      } else {
        track.scrollTop = savedTop;
      }
      syncMenublockFromTrack();
    });
  }

  function scrollToMenuReelsCard(card, behavior) {
    scrollToSlide(card, behavior || 'smooth');
  }

  window.refreshMenuNavScrollBindings = refreshMenuNavScrollBindings;
  window.scrollToMenuReelsCard = scrollToMenuReelsCard;
  window.openReelsMenuItemOrder = openReelsMenuItemOrder;
  window.getMenuReelsTrack = getTrack;
  window.scrollMenuReelTo = scrollToSectionId;
  window.TTMSMenublockNav = {
    scrollToSection: scrollToSectionId,
    resync: finalizeMenublockScroll,
    isNavigatingTo: isMenublockNavToSection,
    nudgeToSection: nudgeMenublockScrollToSection,
    cancelNavigation: cancelMenublockNavigation,
  };
  window.scrollToSponsoredAds = scrollToSponsoredAds;
  window.scrollMenuReelsToTop = scrollTrackToTop;
  window.initMenuReels = initMenuReels;
  window.refreshMenuReelsLayout = refreshMenuReelsLayout;
  window.mountBottomAdsInTrack = mountBottomAdsInTrack;
  window.shouldOpenMenuItemOrderFromEvent = shouldOpenMenuItemOrderFromEvent;
  window.openMenuReelsItemModal = openMenuReelsItemModal;
  window.closeMenuReelsItemModal = closeMenuReelsItemModal;
  window.ensureMenuReelsItemModalClosed = ensureMenuReelsItemModalClosed;
  window.closeAllUiPanels = closeAllUiPanels;
  window.closeAllPanelsBeforeNavigation = closeAllPanelsBeforeNavigation;
  window.forceClearNavigationUiState = forceClearNavigationUiState;
  window.scrollToHashSectionIfPresent = scrollToHashSectionIfPresent;
  window.getMenuReelsModalActiveCard = getMenuReelsModalActiveCard;
  window.getMenuReelsItemModalTargets = getMenuReelsItemModalTargets;
  window.getMenuReelsItemModalDataRoot = getMenuReelsItemModalDataRoot;

  window.addEventListener('adsPopulated', function () {
    if (typeof window.refreshMenuReelsLayout === 'function') {
      window.refreshMenuReelsLayout();
    } else {
      initMenuReels();
    }
  });

  window.addEventListener('adManagerReady', function () {
    initMenuReels();
  });

  window.addEventListener('ttms:viewport-change', syncReelsViewportHeight);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncReelsViewportHeight);
  }

  window.addEventListener('ttms:nav-mode-change', function () {
    resetScrollSyncState();
    refreshMenuNavScrollBindings();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initMenuReels({ immediate: true });
      bindMenuReelsItemModal();
      registerLifecycle();
    });
  } else {
    initMenuReels({ immediate: true });
    bindMenuReelsItemModal();
    registerLifecycle();
  }
})();
