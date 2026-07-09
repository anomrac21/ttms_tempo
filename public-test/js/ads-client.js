/**
 * TTMenus Ads Client
 * Handles all ad loading operations with the ads-service backend
 */

// Prevent duplicate declarations (in case script is loaded multiple times)
(function() {
  'use strict';
  if (typeof window.AdsClient !== 'undefined') {
    console.warn('⚠️ AdsClient already exists, skipping re-initialization');
    return;
  }

  var S = window.TTMSAdsShared || {};

  const AdsClient = {
  // Configuration
  config: {
    adsServiceUrl: 'https://ads.ttmenus.com',
    clientId: 'ttmenus',
  },

  isHomeSmoothNavMode() {
    return (
      document.documentElement.classList.contains('menu-nav-smooth') ||
      (document.body && document.body.classList.contains('menu-nav-smooth')) ||
      (typeof window.getMenuNavMode === 'function' && window.getMenuNavMode() === 'smooth')
    );
  },

  getHomeReelsScrollRoot() {
    if (this.isHomeSmoothNavMode()) return null;
    const track = document.getElementById('menu-reels-track');
    if (!track || !track.querySelector('#pageadscontainer')) return null;
    return track;
  },

  getHeaderScrollOffset() {
    const raw = (getComputedStyle(document.documentElement).getPropertyValue('--ttms-header-height') || '5em').trim();
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const emMatch = raw.match(/^([\d.]+)em$/);
    if (emMatch) return parseFloat(emMatch[1]) * rootPx;
    const pxMatch = raw.match(/^([\d.]+)px$/);
    if (pxMatch) return parseFloat(pxMatch[1]);
    return rootPx * 5;
  },

  // Get user's location if available
  userLocation: '',
  _displayGeneration: 0,
  _serviceFetchTimeoutMs: 6000,

  /**
   * Initialize ads client
   */
  init() {
    console.log('Ads Client initialized');
    this.loadConfig();
    if (!document.getElementById('pageadscontainer')) return;
    if (document.getElementById('menu-reels-viewport')) {
      this.deferLoadUntilAdsSlideVisible();
      return;
    }
    this.loadAds();
  },

  deferLoadUntilAdsSlideVisible() {
    if (this._deferredAdsBound) return;
    this._deferredAdsBound = true;

    var self = this;
    var loaded = false;
    var run = function () {
      if (loaded) return;
      loaded = true;
      self.loadAds();
    };

    var slide = document.getElementById('menu-reels-sponsored-ads');
    var target = slide || document.getElementById('pageadscontainer');
    var scrollRoot = self.getHomeReelsScrollRoot();

    if (!target || typeof IntersectionObserver === 'undefined') {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 12000 });
      } else {
        setTimeout(run, 8000);
      }
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          observer.disconnect();
          run();
        });
      },
      scrollRoot
        ? { root: scrollRoot, rootMargin: '80% 0px', threshold: 0.01 }
        : { root: null, rootMargin: '120px 0px', threshold: 0.01 }
    );
    observer.observe(target);
  },

  /**
   * Load configuration from DOM data attributes
   */
  loadConfig() {
    const container = document.getElementById('pageadscontainer');
    if (!container) return;

    this.config.adsServiceUrl = container.getAttribute('data-ads-service-url') || 'https://ads.ttmenus.com';
    this.config.clientId = container.getAttribute('data-client-id') || 'ttmenus';
  },

  /**
   * Get config from data attributes - re-read on each call for Barba.js compatibility
   */
  getConfig() {
    const container = document.getElementById('pageadscontainer');
    if (!container) return null;
    
    const menuUrlAttr = container.getAttribute('data-menu-url');
    const menuUrl = menuUrlAttr || (window.location.origin + '/');

    return {
      container: container,
      clientId: container.getAttribute('data-client-id') || this.config.clientId,
      adsServiceUrl: container.getAttribute('data-ads-service-url') || this.config.adsServiceUrl,
      menuUrl: menuUrl,
      noCompetitorAds: container.getAttribute('data-no-competitor-ads') === 'true',
      currentDay: new Date().toLocaleDateString('en-US', { weekday: 'long' })
    };
  },

  resolveSiteOrigin() {
    return S.resolveSiteOrigin ? S.resolveSiteOrigin() : '';
  },

  resolveMenuBaseUrl(menuUrl) {
    const origin = this.resolveSiteOrigin();
    if (!menuUrl) return origin ? `${origin}/` : '/';
    let base = menuUrl;
    if (base.startsWith('//')) {
      base = `${window.location.protocol}${base}`;
    }
    return base.endsWith('/') ? base : `${base}/`;
  },

  absolutizeAssetUrl(url) {
    return S.absolutizeAssetUrl ? S.absolutizeAssetUrl(url) : url;
  },

  /** Resolve image/link paths returned by ads-service (not the menu site). */
  resolveServiceAssetUrl(url, adsServiceUrl) {
    return S.resolveServiceAssetUrl
      ? S.resolveServiceAssetUrl(url, adsServiceUrl || this.config.adsServiceUrl)
      : url;
  },

  getServiceFetchTimeoutMs(adsServiceUrl) {
    return S.getServiceFetchTimeoutMs
      ? S.getServiceFetchTimeoutMs(adsServiceUrl)
      : 20000;
  },

  fetchWithTimeout(url, options = {}, timeoutMs) {
    const ms = timeoutMs || this._serviceFetchTimeoutMs;
    if (S.fetchWithTimeout) {
      return S.fetchWithTimeout(url, options, ms);
    }
    return fetch(url, options);
  },

  _parseTime(str) {
    return S.parseTime ? S.parseTime(str) : null;
  },

  /** Prefer today's scheduled menu promos; fall back to full list if none match. */
  filterAdsByDay(ads) {
    return S.filterAdsByDay ? S.filterAdsByDay(ads) : ads;
  },

  /** Normalize ads-service payload so reels display can read images/links. */
  normalizeServiceAds(ads, adsServiceUrl) {
    if (!Array.isArray(ads)) return [];
    const serviceBase = adsServiceUrl || this.config.adsServiceUrl;
    return ads.map((ad) => {
      const images = [];
      (ad.images || []).forEach((img) => {
        const raw = typeof img === 'string'
          ? img
          : (img.image_url || img.imageUrl || img.url || img.src || img.image);
        if (!raw) return;
        const url = this.resolveServiceAssetUrl(raw, serviceBase);
        images.push({
          image_url: url,
          imageUrl: url,
          url,
          image: url,
          alt_text: ad.title || 'Advertisement',
        });
      });
      let linkUrl = ad.link_url || ad.link || '#';
      if (linkUrl && linkUrl !== '#' && !linkUrl.startsWith('http')) {
        linkUrl = this.resolveServiceAssetUrl(
          linkUrl.startsWith('/') ? linkUrl : `/${linkUrl}`,
          serviceBase
        );
      }
      return {
        ...ad,
        images,
        link_url: linkUrl || '#',
        _source: 'service',
      };
    }).filter((ad) => ad.images.length > 0);
  },

  /** Merge menu + service ads, dedupe by id, shuffle for reels rotation. */
  mergeAdSources(menuAds, serviceAds, adsServiceUrl) {
    const seen = new Set();
    const merged = [];
    const push = (ad) => {
      if (!ad || !ad.images || ad.images.length === 0) return;
      const key = ad.id || `${ad.title || ''}:${ad.link_url || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(ad);
    };
    (menuAds || []).forEach(push);
    this.normalizeServiceAds(serviceAds, adsServiceUrl).forEach(push);
    return this._shuffleArray(merged);
  },

  /**
   * Fetch active ads from ads.ttmenus.com (ads-service).
   * clientId is optional — omit for network-wide ads.
   */
  async fetchServiceAds(adsServiceUrl, options = {}) {
    const { clientId, location, day } = options;
    const params = [];
    if (clientId) params.push(`client_id=${encodeURIComponent(clientId)}`);
    if (location) params.push(`location=${encodeURIComponent(location)}`);
    if (day) params.push(`day=${encodeURIComponent(day)}`);
    const qs = params.length ? `?${params.join('&')}` : '';
    const base = (adsServiceUrl || this.config.adsServiceUrl || '').replace(/\/$/, '');
    const url = `${base}/api/v1/active-ads${qs}`;
    const timeoutMs = this.getServiceFetchTimeoutMs(base);

    try {
      console.log('📡 Fetching ads-service:', url);
      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        mode: 'cors',
        credentials: 'omit',
      }, timeoutMs);
      if (!response.ok) {
        console.warn(`Ads service returned ${response.status} for ${url}`);
        return [];
      }
      const result = await response.json();
      const count = Array.isArray(result.data) ? result.data.length : (result.count || 0);
      if (result.success && Array.isArray(result.data)) {
        console.log(`✅ Ads-service returned ${count} ad(s) for ${clientId || 'network'}`);
        if (count === 0) {
          console.log('ℹ️ No active ads-service ads (check client_id, schedule/day, images in DB)');
        }
        return result.data;
      }
      console.warn('Ads service response missing data array:', result);
    } catch (error) {
      if (error && error.name === 'AbortError') {
        console.warn(`Ads service timed out (${timeoutMs}ms): ${url}`);
      } else if (error && error.message === 'Failed to fetch') {
        console.warn(`Ads service unreachable at ${url} — is it running? (go run . in ads-service)`);
      } else {
        console.warn('Failed to fetch ads from service:', error);
      }
    }
    return [];
  },

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    return S.escapeHtml ? S.escapeHtml(text) : '';
  },

  /**
   * Get device type
   */
  getDeviceType() {
    return S.getDeviceType ? S.getDeviceType('width') : 'desktop';
  },

  /** Ads-service persists impressions keyed by UUID; menu JSON placeholders (e.g. menu-ad-0-…) must not call tracking. */
  isUuid(adId) {
    return S.isUuid ? S.isUuid(adId) : false;
  },

  /**
   * Track ad impression
   */
  async trackImpression(adId, adsServiceUrl, clientId) {
    try {
      if (!this.isUuid(adId)) {
        return;
      }
      await fetch(`${adsServiceUrl}/api/v1/tracking/impression`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ad_id: adId,
          client_id: clientId,
          device_type: this.getDeviceType(),
          location: this.userLocation || null,
          viewed_at: new Date().toISOString()
        }),
        mode: 'cors',
        credentials: 'omit',
        keepalive: true,
      });
    } catch (error) {
      if (!window.__ttmsImpressionTrackWarned) {
        window.__ttmsImpressionTrackWarned = true;
        console.debug('Ad impression tracking unavailable:', error);
      }
    }
  },

  /**
   * Track ad click
   */
  async trackClick(adId, adsServiceUrl) {
    try {
      if (!this.isUuid(adId)) {
        return;
      }
      await fetch(`${adsServiceUrl}/api/v1/tracking/click`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ad_id: adId,
          clicked_at: new Date().toISOString(),
          referrer: document.referrer || window.location.href,
          device_type: this.getDeviceType()
        })
      });
    } catch (error) {
      console.error('Error tracking click:', error);
    }
  },

  /** Homepage: 3-card preview; fullscreen vertical feed */
  REELS_PREVIEW_COUNT: 1,
  _reelsCatalog: null,
  _reelsConfig: null,
  _reelsAppendBase: 0,
  _reelsImpressionObserver: null,
  _reelsScrollHandler: null,
  _reelsKeyHandler: null,
  _slideImpressionTracked: null,
  /** After user unmutes once, new in-frame videos stay unmuted until they mute again */
  _reelsUserWantsSound: false,
  _previewScrollHandler: null,
  _reelsLastCatalogIndex: 0,
  _previewAutoTimer: null,
  _previewEndedHandler: null,
  _previewFullscreenScrollHandler: null,
  _reelsFullscreenOpenTriggered: false,
  _reelsAutoOpenSuppressed: false,
  _lastReelsPreviewScrollProgress: 0,
  _previewFullscreenScrollTicking: false,
  _previewFullscreenObserver: null,

  resolveAdMeta(adId) {
    if (!adId) return null;
    const catalog = this._reelsCatalog || [];
    for (let i = 0; i < catalog.length; i++) {
      const item = catalog[i];
      if (item && item.ad && item.ad.id === adId) {
        return {
          id: item.ad.id,
          title: item.ad.title || item.ad.name || '',
          url: item.linkUrl || item.ad.link || item.ad.url || item.ad.link_url || '',
        };
      }
    }
    try {
      const el = document.querySelector(
        '[data-ad-id="' + String(adId).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]'
      );
      if (el) {
        return {
          id: adId,
          title: el.getAttribute('data-ad-title') || '',
          url: el.getAttribute('data-ad-url') || el.getAttribute('data-ad-link') || '',
        };
      }
    } catch (_) { /* ignore */ }
    return null;
  },

  shouldUseReelsMode() {
    // Reels-style preview + fullscreen viewer is used on every page that
    // renders the dynamic ads container (homepage hero + client/location
    // pages all share #pageadscontainer.frontpageads).
    return !!document.querySelector('#pageadscontainer.frontpageads');
  },

  clearReelsPreviewClasses() {
    this.teardownReelsFullscreenAutoOpen();
    const adsList = document.getElementById('ads-list');
    if (adsList) {
      adsList.classList.remove('ads-list--preview');
    }
    document.querySelector('#pageadscontainer section.menu-ad--reels-preview')?.classList.remove('menu-ad--reels-preview');
  },

  isReelsPreviewFullscreen() {
    return this.getReelsPreviewScrollProgress() >= 98;
  },

  /**
   * Same progress model as ad-scroll-progress.js: 0% when section enters viewport,
   * 100% when its top reaches the viewport top (sticky fullscreen).
   */
  getReelsPreviewScrollProgress() {
    const section = document.querySelector('#pageadscontainer.frontpageads section.menu-ad--reels-preview');
    if (!section) return 0;

    const track = document.getElementById('menu-reels-track');
    if (track && track.contains(section) && !this.isHomeSmoothNavMode()) {
      const trackRect = track.getBoundingClientRect();
      const sectionRect = section.getBoundingClientRect();
      const vh = trackRect.height;
      if (!vh) return 0;
      if (sectionRect.top <= trackRect.top + 8) return 100;
      if (sectionRect.top >= trackRect.bottom) return 0;
      return ((trackRect.bottom - sectionRect.top) / vh) * 100;
    }

    const rect = section.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!vh) return 0;
    const rootTop = this.isHomeSmoothNavMode() ? this.getHeaderScrollOffset() : 0;
    if (rect.top <= rootTop + 8) return 100;
    if (rect.top >= vh) return 0;
    return ((vh - rect.top) / (vh - rootTop)) * 100;
  },

  updateReelsPreviewScrollProgressBar() {
    const section = document.querySelector('#pageadscontainer.frontpageads section.menu-ad--reels-preview');
    const fill = section?.querySelector('.scroll-progress-fill');
    if (!fill) return;
    fill.style.width = `${this.getReelsPreviewScrollProgress().toFixed(2)}%`;
  },

  maybeOpenReelsFromPreviewScroll(forceProgress) {
    const overlay = document.getElementById('ads-reels-overlay');
    if (overlay && !overlay.hasAttribute('hidden')) return;

    const progress = typeof forceProgress === 'number'
      ? forceProgress
      : this.getReelsPreviewScrollProgress();

    this.updateReelsPreviewScrollProgressBar();

    if (this.isHomeSmoothNavMode() && this._reelsAutoOpenSuppressed) {
      if (progress < 50) {
        this._reelsAutoOpenSuppressed = false;
      }
      return;
    }

    if (progress < 75) {
      if (!this.isHomeSmoothNavMode() || !this._reelsAutoOpenSuppressed) {
        this._reelsFullscreenOpenTriggered = false;
      }
      this._lastReelsPreviewScrollProgress = progress;
      return;
    }

    const crossedFullscreen =
      this._lastReelsPreviewScrollProgress < 98 && progress >= 98;
    this._lastReelsPreviewScrollProgress = progress;

    if (!crossedFullscreen && progress < 98) return;
    if (this._reelsFullscreenOpenTriggered) return;
    if (!this._reelsCatalog || !this._reelsCatalog.length) return;

    const idx = this.getCurrentReelsPreviewCatalogIndex();
    this.openReelsViewer(idx, { userActivatedSound: true, fromScrollAutoOpen: true });
    this._reelsFullscreenOpenTriggered = true;
  },

  getCurrentReelsPreviewCatalogIndex() {
    const panel = document.querySelector('#ads-list li.ad-panel--preview');
    const raw = panel?.dataset?.reelsPreviewIndex;
    if (raw != null && raw !== '') {
      const idx = parseInt(raw, 10);
      if (!Number.isNaN(idx)) return idx;
    }
    return this._reelsLastCatalogIndex || 0;
  },

  teardownReelsFullscreenAutoOpen() {
    const track = document.getElementById('menu-reels-track');
    if (this._previewFullscreenScrollHandler) {
      if (track) {
        track.removeEventListener('scroll', this._previewFullscreenScrollHandler);
      }
      window.removeEventListener('scroll', this._previewFullscreenScrollHandler, true);
      document.removeEventListener('scroll', this._previewFullscreenScrollHandler, true);
      window.removeEventListener('resize', this._previewFullscreenScrollHandler);
      this._previewFullscreenScrollHandler = null;
    }
    if (this._previewFullscreenObserver) {
      this._previewFullscreenObserver.disconnect();
      this._previewFullscreenObserver = null;
    }
    this._previewFullscreenScrollTicking = false;
    this._reelsFullscreenOpenTriggered = false;
    this._reelsAutoOpenSuppressed = false;
    this._lastReelsPreviewScrollProgress = 0;
  },

  /**
   * After closing fullscreen in smooth home scroll, nudge up so preview progress
   * is not locked at 100% (which re-triggers auto-open).
   */
  releaseSmoothPreviewScrollLock() {
    if (!this.isHomeSmoothNavMode()) return;

    const slide =
      document.getElementById('menu-reels-sponsored-ads') ||
      document.querySelector('.menu-reels-slide--bottom-ads');
    if (!slide) return;

    const headerOffset = this.getHeaderScrollOffset();
    const slideDocTop = slide.getBoundingClientRect().top + window.scrollY;
    const releaseY = slideDocTop - headerOffset - window.innerHeight * 0.22;

    window.scrollTo({
      top: Math.max(0, releaseY),
      left: 0,
      behavior: 'auto',
    });
    this._lastReelsPreviewScrollProgress = Math.min(
      this._lastReelsPreviewScrollProgress,
      60
    );
    this.updateReelsPreviewScrollProgressBar();
  },

  setupReelsFullscreenAutoOpen() {
    if (!this.shouldUseReelsMode()) return;
    this.teardownReelsFullscreenAutoOpen();

    const scrollRoot = this.getHomeReelsScrollRoot();

    this._previewFullscreenScrollHandler = () => {
      const progress = this.getReelsPreviewScrollProgress();
      const crossedFullscreen =
        this._lastReelsPreviewScrollProgress < 98 && progress >= 98;

      // Open on the scroll gesture (sync) so unmuted autoplay is allowed when possible.
      if (crossedFullscreen) {
        this.maybeOpenReelsFromPreviewScroll(progress);
        return;
      }

      if (this._previewFullscreenScrollTicking) return;
      this._previewFullscreenScrollTicking = true;
      requestAnimationFrame(() => {
        this._previewFullscreenScrollTicking = false;
        this.maybeOpenReelsFromPreviewScroll();
      });
    };

    if (scrollRoot) {
      scrollRoot.addEventListener('scroll', this._previewFullscreenScrollHandler, { passive: true });
    } else {
      window.addEventListener('scroll', this._previewFullscreenScrollHandler, { passive: true, capture: true });
      document.addEventListener('scroll', this._previewFullscreenScrollHandler, { passive: true, capture: true });
    }
    window.addEventListener('resize', this._previewFullscreenScrollHandler, { passive: true });

    const section = document.querySelector('#pageadscontainer.frontpageads section.menu-ad--reels-preview');
    if (section && typeof IntersectionObserver !== 'undefined') {
      const headerOffset = this.isHomeSmoothNavMode() ? this.getHeaderScrollOffset() : 0;
      this._previewFullscreenObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const top = entry.boundingClientRect.top;
            const rootTop = scrollRoot
              ? scrollRoot.getBoundingClientRect().top
              : headerOffset;
            if (entry.intersectionRatio >= 0.92 && top <= rootTop + 4) {
              this.maybeOpenReelsFromPreviewScroll(100);
            }
          }
        },
        scrollRoot
          ? { root: scrollRoot, threshold: [0, 0.5, 0.92, 1] }
          : { root: null, threshold: [0, 0.5, 0.92, 1], rootMargin: `-${headerOffset}px 0px 0px 0px` }
      );
      this._previewFullscreenObserver.observe(section);
    }

    requestAnimationFrame(() => {
      this.updateReelsPreviewScrollProgressBar();
      this.maybeOpenReelsFromPreviewScroll();
    });
  },

  prepareAdsForDisplay(ads) {
    // Randomize each load (Instagram/reels style). If you want weight bias later,
    // do a weighted shuffle here instead of a pure shuffle.
    const sorted = this._shuffleArray([...ads]);
    const items = [];
    for (const ad of sorted) {
      if (!ad.images || ad.images.length === 0) continue;
      const firstMedia = ad.images[0];
      const mediaUrl = firstMedia.image_url || firstMedia.imageUrl || firstMedia.url || firstMedia.src || firstMedia.image;
      if (!mediaUrl) continue;
      const isVideo = /\.(mp4|webm|ogg)$/i.test(mediaUrl);
      const linkUrl = ad.link_url || '#';
      items.push({ ad, firstMedia, mediaUrl, isVideo, linkUrl });
    }
    return items;
  },

  _shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  /**
   * iOS Safari requires playsinline + webkit-playsinline and the playsInline property
   * for muted inline autoplay; attribute-only autoplay is unreliable.
   */
  configureInlineVideoEl(video) {
    if (!video || video.tagName !== 'VIDEO') return;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.playsInline = true;
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('muted', '');
  },

  /** Muted autoplay retry chain for preview strip (iOS often needs delayed/canplay play()). */
  tryMutedPreviewPlay(video) {
    if (!video) return;
    this.configureInlineVideoEl(video);
    const attempt = () => {
      video.muted = true;
      const p = video.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    };
    attempt();
    if (video.readyState < 2) {
      const oncePlay = () => attempt();
      video.addEventListener('loadedmetadata', oncePlay, { once: true });
      video.addEventListener('loadeddata', oncePlay, { once: true });
      video.addEventListener('canplay', oncePlay, { once: true });
      video.addEventListener('canplaythrough', oncePlay, { once: true });
    }
    setTimeout(attempt, 60);
    setTimeout(attempt, 320);
  },

  _unmuteIconSvgMuted() {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16.5 12C16.5 10.23 15.48 8.71 14 7.97V10.18L16.45 12.63C16.48 12.43 16.5 12.22 16.5 12ZM19 12C19 12.94 18.8 13.82 18.46 14.64L19.97 16.15C20.62 14.91 21 13.5 21 12C21 7.72 18.01 4.14 14 3.23V5.29C16.89 6.15 19 8.83 19 12ZM4.27 3L3 4.27L7.73 9H3V15H7L12 20V13.27L16.25 17.53C15.58 18.04 14.83 18.46 14 18.7V20.76C15.38 20.45 16.63 19.82 17.68 18.96L19.73 21L21 19.73L12 10.73L4.27 3ZM12 4L9.91 6.09L12 8.18V4Z" fill="currentColor"/>
          </svg>`;
  },

  _unmuteIconSvgUnmuted() {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 9V15H7L12 20V4L7 9H3ZM16.5 12C16.5 10.23 15.48 8.71 14 7.97V16.03C15.48 15.29 16.5 13.77 16.5 12ZM14 3.23V5.29C16.89 6.15 19 8.83 19 12C19 15.17 16.89 17.85 14 18.71V20.77C18.01 19.86 21 16.28 21 12C21 7.72 18.01 4.14 14 3.23Z" fill="currentColor"/>
          </svg>`;
  },

  _resetUnmuteButtonUi(btn) {
    if (!btn) return;
    btn.innerHTML = this._unmuteIconSvgMuted();
    btn.setAttribute('aria-label', 'Unmute video');
    btn.setAttribute('title', 'Click to unmute video');
    btn.classList.remove('unmuted');
  },

  /**
   * Slide whose vertical center is closest to the reels viewport center (snapped “in frame” item).
   */
  _getDominantReelsSlide(track) {
    if (!track) return null;
    const tr = track.getBoundingClientRect();
    const midY = tr.top + tr.height / 2;
    let best = null;
    let bestDist = Infinity;
    track.querySelectorAll('.ads-reels-slide').forEach((slide) => {
      const sr = slide.getBoundingClientRect();
      if (sr.bottom <= tr.top || sr.top >= tr.bottom) return;
      const center = (sr.top + sr.bottom) / 2;
      const dist = Math.abs(center - midY);
      if (dist < bestDist) {
        bestDist = dist;
        best = slide;
      }
    });
    return best;
  },

  _getDominantPreviewPanel(adsList) {
    if (!adsList) return null;
    const tr = adsList.getBoundingClientRect();
    let best = null;
    let bestRatio = 0;
    adsList.querySelectorAll('li.ad-panel').forEach((panel) => {
      const pr = panel.getBoundingClientRect();
      const visibleLeft = Math.max(pr.left, tr.left);
      const visibleRight = Math.min(pr.right, tr.right);
      const visible = Math.max(0, visibleRight - visibleLeft);
      const total = Math.max(1, pr.right - pr.left);
      const ratio = visible / total;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = panel;
      }
    });
    return best;
  },

  _syncPreviewDominantMedia(adsList) {
    if (!adsList) return;
    const dom = this._getDominantPreviewPanel(adsList);
    adsList.querySelectorAll('li.ad-panel video.ad-video').forEach((v) => {
      const panel = v.closest('li.ad-panel');
      if (!panel) return;
      if (panel === dom) {
        this.tryMutedPreviewPlay(v);
      } else {
        v.muted = true;
        v.pause();
      }
    });
  },

  /**
   * Play/pause + mute only the in-frame (dominant) reel; keep in sync with scroll-snap.
   * IntersectionObserver is unreliable here with nested scroll + full-viewport slides.
   */
  _syncReelsDominantMedia(track) {
    if (!track) return;
    const overlay = document.getElementById('ads-reels-overlay');
    if (overlay?.hasAttribute('hidden')) return;

    const dom = this._getDominantReelsSlide(track);
    if (dom) {
      const idx = parseInt(dom.dataset.catalogIndex || '', 10);
      if (!Number.isNaN(idx)) this._reelsLastCatalogIndex = idx;
    }
    track.querySelectorAll('.ads-reels-slide').forEach((slide) => {
      const v = slide.querySelector('video.ad-video');
      if (!v) return;
      if (slide === dom) {
        if (this._reelsUserWantsSound) {
          v.setAttribute('playsinline', '');
          v.setAttribute('webkit-playsinline', '');
          v.playsInline = true;
          v.muted = false;
          v.defaultMuted = false;
          v.removeAttribute('muted');
        } else {
          this.configureInlineVideoEl(v);
          v.muted = true;
        }
        const p = v.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            if (this._reelsUserWantsSound) {
              v.muted = true;
              v.setAttribute('muted', '');
              this._reelsUserWantsSound = false;
              const btn = slide.querySelector('.ad-unmute-btn');
              this._resetUnmuteButtonUi(btn);
              v.play().catch(() => {});
            }
          });
        }
      } else {
        v.muted = true;
        v.pause();
      }
    });

    track.querySelectorAll('.ad-unmute-btn').forEach((btn) => this._resetUnmuteButtonUi(btn));
    if (dom && this._reelsUserWantsSound) {
      const v = dom.querySelector('video.ad-video');
      const btn = dom.querySelector('.ad-unmute-btn');
      if (v && !v.muted && btn) {
        btn.innerHTML = this._unmuteIconSvgUnmuted();
        btn.setAttribute('aria-label', 'Mute video');
        btn.setAttribute('title', 'Click to mute video');
        btn.classList.add('unmuted');
      }
    }
  },

  /**
   * Wire unmute: preview/location panels use this card’s video.
   * Fullscreen reels: scroll tapped slide into view, then sync audio for the in-frame clip.
   */
  attachVideoUnmute(container) {
    const unmuteBtn = container.querySelector('.ad-unmute-btn');
    if (!unmuteBtn) return;
    unmuteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const track = container.closest('#ads-reels-track');
      const videoPanel = container.matches?.('.ads-reels-slide')
        ? container
        : container.closest('.ads-reels-slide');

      if (track && videoPanel) {
        const vid = videoPanel.querySelector('video.ad-video');
        if (!vid) return;
        this._reelsUserWantsSound = !!vid.muted;
        videoPanel.scrollIntoView({ block: 'start', behavior: 'auto' });
        requestAnimationFrame(() => {
          requestAnimationFrame(() => this._syncReelsDominantMedia(track));
        });
        return;
      }

      const previewLi = container.closest('li.ad-panel--preview');
      const previewIdxRaw = previewLi?.dataset?.reelsPreviewIndex;
      if (previewLi != null && previewIdxRaw != null && previewIdxRaw !== '') {
        const idx = parseInt(previewIdxRaw, 10);
        if (!Number.isNaN(idx)) {
          this.openReelsViewer(idx, { userActivatedSound: true, userInitiated: true });
        }
        return;
      }

      const video = container.querySelector('video.ad-video');
      const btnForUi = container.querySelector('.ad-unmute-btn');
      if (!video || !btnForUi) return;

      if (video.muted) {
        video.muted = false;
        btnForUi.innerHTML = this._unmuteIconSvgUnmuted();
        btnForUi.setAttribute('aria-label', 'Mute video');
        btnForUi.setAttribute('title', 'Click to mute video');
        btnForUi.classList.add('unmuted');
        video.play().catch(() => {});
      } else {
        video.muted = true;
        this._resetUnmuteButtonUi(btnForUi);
      }
    });
  },

  mountAdCreative(rootEl, item, config, opts) {
    const { ad, firstMedia, mediaUrl, isVideo, linkUrl } = item;
    const displayMediaUrl =
      !isVideo && typeof window !== 'undefined' && window.TtmsThumbor && window.TtmsThumbor.menuImageSrc
        ? window.TtmsThumbor.menuImageSrc(mediaUrl, 'ad')
        : mediaUrl;
    const {
      videoSuffix = '',
      trackImpressionNow = true,
      mode = 'panel',
      previewStrip = false,
      showTitleRow = false,
    } = opts;

    if (trackImpressionNow) {
      this.trackImpression(ad.id, config.adsServiceUrl, config.clientId);
    }

    const videoId = `video-ad-${ad.id}${videoSuffix}`;
    const safeAlt = this.escapeHtml(firstMedia.alt_text || ad.title || 'Advertisement');
    const ext = (mediaUrl.split('.').pop() || 'mp4').toLowerCase();

    let mediaHTML = '';
    if (isVideo) {
      const videoInner = `
        <video id="${videoId}" class="ad-portrait ad-video" autoplay muted loop playsinline webkit-playsinline preload="none">
          <source src="${this.escapeHtml(mediaUrl)}" type="video/${ext}">
          Your browser does not support the video tag.
        </video>`;
      const unmuteBtn = `
        <button type="button" class="ad-unmute-btn" aria-label="Unmute video" title="Click to unmute video">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16.5 12C16.5 10.23 15.48 8.71 14 7.97V10.18L16.45 12.63C16.48 12.43 16.5 12.22 16.5 12ZM19 12C19 12.94 18.8 13.82 18.46 14.64L19.97 16.15C20.62 14.91 21 13.5 21 12C21 7.72 18.01 4.14 14 3.23V5.29C16.89 6.15 19 8.83 19 12ZM4.27 3L3 4.27L7.73 9H3V15H7L12 20V13.27L16.25 17.53C15.58 18.04 14.83 18.46 14 18.7V20.76C15.38 20.45 16.63 19.82 17.68 18.96L19.73 21L21 19.73L12 10.73L4.27 3ZM12 4L9.91 6.09L12 8.18V4Z" fill="currentColor"/>
          </svg>
        </button>`;
      if (previewStrip) {
        mediaHTML = `
        <div class="ad-preview-media">
          <div class="ad-preview-throbber" aria-busy="true" aria-label="Loading video"></div>
          ${videoInner}
        </div>${unmuteBtn}`;
      } else {
        mediaHTML = `${videoInner}${unmuteBtn}`;
      }
    } else {
      mediaHTML = `
        <img src="${this.escapeHtml(displayMediaUrl)}" class="ad-portrait-bg" alt="${safeAlt}">
        <img src="${this.escapeHtml(displayMediaUrl)}" class="ad-portrait" alt="${safeAlt}">`;
    }

    if (ad.title) rootEl.setAttribute('data-ad-title', ad.title);
    if (linkUrl && linkUrl !== '#') rootEl.setAttribute('data-ad-url', linkUrl);
    if (ad.id) rootEl.setAttribute('data-ad-id', ad.id);

    var promoHeaderHTML = '';
    if (
      mode === 'reel' &&
      showTitleRow &&
      window.TTMSMenuItemActions &&
      typeof window.TTMSMenuItemActions.buildPromotionHeaderMarkup === 'function'
    ) {
      promoHeaderHTML = window.TTMSMenuItemActions.buildPromotionHeaderMarkup({
        title: ad.title || '',
        url: linkUrl || '',
        promoUrl:
          (ad.title &&
            '/promotions/' +
              String(ad.title)
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '') +
              '/') ||
          linkUrl ||
          '',
        catalogIndex: rootEl.getAttribute('data-catalog-index') || '',
        adId: ad.id || rootEl.getAttribute('data-ad-id') || '',
        image: String(mediaUrl || '')
          .replace(/^https?:\/\/[^/]+/i, '')
          .replace(/^\//, ''),
      });
    }

    rootEl.innerHTML = promoHeaderHTML + `<span>Sponsored</span>${mediaHTML}`;

    if (mode === 'reel' && linkUrl && linkUrl !== '#') {
      rootEl.addEventListener('click', (e) => {
        if (e.target.closest('.ad-unmute-btn, .menu-item-actions, .menu-favorite-btn, .ads-reels-slide__title-row')) return;
        const t = e.target;
        const onVideo = t.matches?.('video.ad-video');
        const onImg =
          t.tagName === 'IMG' &&
          (t.classList.contains('ad-portrait') || t.classList.contains('ad-portrait-bg'));
        if (!onVideo && !onImg) return;
        e.preventDefault();
        this.trackClick(ad.id, config.adsServiceUrl);
        window.open(linkUrl, '_blank');
      });
    }

    if (isVideo) {
      const vidEl = rootEl.querySelector('video.ad-video');
      if (vidEl) {
        this.configureInlineVideoEl(vidEl);
      }
      if (previewStrip && vidEl) {
        const throbber = rootEl.querySelector('.ad-preview-throbber');
        const hideThrobber = () => {
          if (throbber) {
            throbber.classList.add('ad-preview-throbber--hidden');
            throbber.setAttribute('aria-busy', 'false');
          }
        };
        vidEl.addEventListener('loadeddata', hideThrobber, { once: true });
        vidEl.addEventListener('canplay', hideThrobber, { once: true });
        vidEl.addEventListener('playing', hideThrobber, { once: true });
        vidEl.addEventListener('error', hideThrobber, { once: true });
        setTimeout(hideThrobber, 12000);
      }
      this.attachVideoUnmute(rootEl);
    }
  },

  buildAdPanelLi(item, config, options = {}) {
    const {
      primaryClick = null,
      videoSuffix = '',
      trackImpressionNow = true,
      reelsPreviewIndex = null,
      previewStrip = false,
    } = options;
    const { linkUrl, ad } = item;
    const li = document.createElement('li');
    li.className = 'ad-panel';
    li.setAttribute('data-ad-id', item.ad.id);
    if (ad.title) li.setAttribute('data-ad-title', ad.title);
    if (linkUrl && linkUrl !== '#') {
      li.setAttribute('data-ad-url', linkUrl);
      li.setAttribute('data-ad-link', linkUrl);
    }
    if (reelsPreviewIndex != null) {
      li.setAttribute('data-reels-preview-index', String(reelsPreviewIndex));
    }
    this.mountAdCreative(li, item, config, {
      videoSuffix,
      trackImpressionNow,
      mode: 'panel',
      previewStrip,
    });
    li.onclick = (e) => {
      if (e.target.closest('.ad-unmute-btn')) return;
      if (primaryClick) {
        primaryClick(e);
        return;
      }
      this.trackClick(ad.id, config.adsServiceUrl);
      if (linkUrl && linkUrl !== '#') {
        window.open(linkUrl, '_blank');
      }
    };
    return li;
  },

  ensureReelsOverlay() {
    let el = document.getElementById('ads-reels-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'ads-reels-overlay';
    el.className = 'ads-reels-overlay';
    el.setAttribute('hidden', '');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Featured promotions');
    el.innerHTML = `
      <button type="button" class="ads-reels-close ttms-icon-btn ttms-icon-btn--on-dark" aria-label="Close promotions"><img class="dashboard-header-close-img" src="https://cdn.ttmenus.com/icons/ui/close.svg" alt="" width="28" height="28" decoding="async"></button>
      <div class="ads-reels-track" id="ads-reels-track"></div>`;
    document.body.appendChild(el);
    el.querySelector('.ads-reels-close').addEventListener('click', () => this.closeReelsViewer());
    return el;
  },

  observeReelSlide(slide) {
    const track = slide.closest('#ads-reels-track');
    if (!track) return;

    if (!this._reelsImpressionObserver) {
      this._slideImpressionTracked = this._slideImpressionTracked || new WeakSet();
      this._reelsImpressionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const slideEl = entry.target;
            const ratio = entry.intersectionRatio;
            if (ratio >= 0.5 && !this._slideImpressionTracked.has(slideEl)) {
              this._slideImpressionTracked.add(slideEl);
              const id = slideEl.dataset.adId;
              const cfg = this._reelsConfig;
              if (id && cfg) {
                this.trackImpression(id, cfg.adsServiceUrl, cfg.clientId);
              }
            }
          }
        },
        {
          root: track,
          rootMargin: '0px',
          threshold: [0, 0.35, 0.5, 0.65, 1],
        }
      );
    }
    this._reelsImpressionObserver.observe(slide);
  },

  appendMoreReelSlides(n) {
    const track = document.getElementById('ads-reels-track');
    const catalog = this._reelsCatalog;
    const config = this._reelsConfig;
    if (!track || !catalog || !catalog.length || !config) return;
    const maxDom = 80;
    if (track.children.length >= maxDom) return;

    for (let i = 0; i < n; i++) {
      if (track.children.length >= maxDom) break;
      const ci = this._reelsAppendBase % catalog.length;
      const item = catalog[ci];
      const slide = document.createElement('article');
      slide.className = 'ads-reels-slide';
      slide.dataset.adId = item.ad.id;
      slide.dataset.catalogIndex = String(ci);
      this.mountAdCreative(slide, item, config, {
        mode: 'reel',
        videoSuffix: `-reel-more-${this._reelsAppendBase}-${i}`,
        trackImpressionNow: false,
      });
      track.appendChild(slide);
      this.observeReelSlide(slide);
      this._reelsAppendBase++;
    }
    this._syncReelsDominantMedia(track);
  },

  openReelsViewer(startIndex, options = {}) {
    const userActivatedSound = !!options.userActivatedSound;
    const catalog = this._reelsCatalog;
    const config = this._reelsConfig;
    if (!catalog || !catalog.length || !config) return;

    if (options.userInitiated) {
      this._reelsAutoOpenSuppressed = false;
    }

    const overlay = this.ensureReelsOverlay();
    const track = document.getElementById('ads-reels-track');
    if (!track) return;

    if (this._reelsImpressionObserver) {
      this._reelsImpressionObserver.disconnect();
      this._reelsImpressionObserver = null;
    }
    this._slideImpressionTracked = new WeakSet();
    this._reelsUserWantsSound = userActivatedSound;
    this._reelsLastCatalogIndex = Math.max(0, Math.min(startIndex, catalog.length - 1));

    track.innerHTML = '';
    this._reelsAppendBase = 0;

    catalog.forEach((item, i) => {
      const slide = document.createElement('article');
      slide.className = 'ads-reels-slide';
      slide.dataset.adId = item.ad.id;
      slide.dataset.catalogIndex = String(i);
      this.mountAdCreative(slide, item, config, {
        mode: 'reel',
        videoSuffix: `-reel-init-${i}`,
        trackImpressionNow: false,
      });
      track.appendChild(slide);
      this.observeReelSlide(slide);
      this._reelsAppendBase++;
    });

    overlay.removeAttribute('hidden');
    document.body.classList.add('ads-reels-open');

    if (this._reelsScrollHandler) {
      track.removeEventListener('scroll', this._reelsScrollHandler);
    }
    this._reelsScrollHandler = () => {
      if (!track || overlay.hasAttribute('hidden')) return;
      this._syncReelsDominantMedia(track);
      const threshold = window.innerHeight * 2;
      if (track.scrollHeight - track.scrollTop - track.clientHeight < threshold) {
        this.appendMoreReelSlides(4);
      }
    };
    track.addEventListener('scroll', this._reelsScrollHandler, { passive: true });

    if (this._reelsKeyHandler) {
      document.removeEventListener('keydown', this._reelsKeyHandler);
    }
    this._reelsKeyHandler = (e) => {
      if (e.key === 'Escape') this.closeReelsViewer();
    };
    document.addEventListener('keydown', this._reelsKeyHandler);

    requestAnimationFrame(() => {
      const target = track.children[Math.min(startIndex, track.children.length - 1)];
      if (target) {
        target.scrollIntoView({ block: 'start' });
      }
      this._reelsScrollHandler();
      requestAnimationFrame(() => {
        this._syncReelsDominantMedia(track);
      });
    });
  },

  closeReelsViewer() {
    const overlay = document.getElementById('ads-reels-overlay');
    const track = document.getElementById('ads-reels-track');
    if (this._reelsImpressionObserver) {
      this._reelsImpressionObserver.disconnect();
      this._reelsImpressionObserver = null;
    }
    if (track) {
      track.querySelectorAll('video').forEach((v) => v.pause());
      if (this._reelsScrollHandler) {
        track.removeEventListener('scroll', this._reelsScrollHandler);
        this._reelsScrollHandler = null;
      }
    }
    if (this._reelsKeyHandler) {
      document.removeEventListener('keydown', this._reelsKeyHandler);
      this._reelsKeyHandler = null;
    }
    overlay?.setAttribute('hidden', '');
    document.body.classList.remove('ads-reels-open');
    this._reelsFullscreenOpenTriggered = true;

    if (this.isHomeSmoothNavMode()) {
      this._reelsAutoOpenSuppressed = true;
      this._lastReelsPreviewScrollProgress = 0;
    }

    // After closing reels, update the homepage preview to show the last viewed ad.
    if (this.shouldUseReelsMode()) {
      this.updateReelsPreviewToCatalogIndex(this._reelsLastCatalogIndex);
    }

    if (this.isHomeSmoothNavMode()) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.releaseSmoothPreviewScrollLock();
        });
      });
    }
  },

  updateReelsPreviewToCatalogIndex(catalogIndex) {
    const adsList = document.getElementById('ads-list');
    const items = this._reelsCatalog;
    const config = this._reelsConfig;
    if (!adsList || !items || !items.length || !config) return;
    const idx = ((catalogIndex % items.length) + items.length) % items.length;
    adsList.innerHTML = '';
    const item = items[idx];
    const li = this.buildAdPanelLi(item, config, {
      primaryClick: (e) => {
        e.preventDefault();
        this.openReelsViewer(idx, { userActivatedSound: true, userInitiated: true });
      },
      videoSuffix: `-pv-${idx}`,
      reelsPreviewIndex: idx,
      previewStrip: true,
    });
    li.classList.add('ad-panel--preview');
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');
    li.setAttribute('aria-label', `Open promotions, starting at ad ${idx + 1}`);
    li.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        this.openReelsViewer(idx, { userActivatedSound: true, userInitiated: true });
      }
    });
    adsList.appendChild(li);
    this._syncPreviewDominantMedia(adsList);
    this._startPreviewAutoplay(idx);
  },

  _clearPreviewAutoplay() {
    if (this._previewAutoTimer) {
      clearTimeout(this._previewAutoTimer);
      this._previewAutoTimer = null;
    }
    const adsList = document.getElementById('ads-list');
    if (adsList && this._previewEndedHandler) {
      adsList.querySelectorAll('video.ad-video').forEach((v) => {
        v.removeEventListener('ended', this._previewEndedHandler);
      });
    }
    this._previewEndedHandler = null;
  },

  _startPreviewAutoplay(currentIndex) {
    this._clearPreviewAutoplay();
    const adsList = document.getElementById('ads-list');
    const items = this._reelsCatalog;
    if (!adsList || !items || !items.length) return;
    const nextIndex = (currentIndex + 1) % items.length;
    const panel = adsList.querySelector('li.ad-panel--preview');
    const v = panel?.querySelector('video.ad-video');
    const img = panel?.querySelector('img.ad-portrait');

    if (v) {
      // In preview we want "when finished -> next", so disable looping.
      v.loop = false;
      this.configureInlineVideoEl(v);
      this._previewEndedHandler = () => this.updateReelsPreviewToCatalogIndex(nextIndex);
      v.addEventListener('ended', this._previewEndedHandler, { once: true });
      this.tryMutedPreviewPlay(v);
      return;
    }

    if (img) {
      this._previewAutoTimer = setTimeout(() => {
        this.updateReelsPreviewToCatalogIndex(nextIndex);
      }, 30000);
    }
  },

  displayAdsReelsMode(ads, config) {
    try {
      const adsList = document.getElementById('ads-list');
      if (!adsList) {
        console.error('❌ Ads list container not found!');
        return;
      }
      this.clearReelsPreviewClasses();
      adsList.innerHTML = '';
      adsList.classList.add('ads-list--preview');
      const section = adsList.closest('section.ads') || adsList.closest('section');
      if (section) {
        section.classList.add('menu-ad--reels-preview');
        if (!section.querySelector('.scroll-progress-bar')) {
          const bar = document.createElement('div');
          bar.className = 'scroll-progress-bar';
          bar.setAttribute('aria-hidden', 'true');
          bar.innerHTML = '<div class="scroll-progress-fill"></div>';
          section.insertBefore(bar, section.firstChild);
        }
      }

      const items = this.prepareAdsForDisplay(ads);
      if (items.length === 0) {
        console.log('ℹ️ No displayable ads for reels preview');
        return;
      }

      this._reelsCatalog = items;
      this._reelsConfig = config;

      const start = Math.max(0, Math.min(this._reelsLastCatalogIndex, items.length - 1));
      const n = Math.min(this.REELS_PREVIEW_COUNT, items.length);
      for (let i = 0; i < n; i++) {
        const catalogIndex = (start + i) % items.length;
        const item = items[catalogIndex];
        const li = this.buildAdPanelLi(item, config, {
          primaryClick: (e) => {
            e.preventDefault();
            this.openReelsViewer(catalogIndex, { userActivatedSound: true, userInitiated: true });
          },
          videoSuffix: `-pv-${catalogIndex}`,
          reelsPreviewIndex: catalogIndex,
          previewStrip: true,
        });
        li.classList.add('ad-panel--preview');
        li.setAttribute('role', 'button');
        li.setAttribute('tabindex', '0');
        li.setAttribute('aria-label', `Open promotions, starting at ad ${catalogIndex + 1}`);
        li.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            this.openReelsViewer(catalogIndex, { userActivatedSound: true, userInitiated: true });
          }
        });
        adsList.appendChild(li);
      }

      // Preview strip: only play the card that's in-frame (centered) to avoid multiple autoplaying videos.
      if (this._previewScrollHandler) {
        adsList.removeEventListener('scroll', this._previewScrollHandler);
        window.removeEventListener('resize', this._previewScrollHandler);
      }
      this._previewScrollHandler = () => {
        this._syncPreviewDominantMedia(adsList);
      };
      adsList.addEventListener('scroll', this._previewScrollHandler, { passive: true });
      window.addEventListener('resize', this._previewScrollHandler, { passive: true });
      requestAnimationFrame(() => {
        this._syncPreviewDominantMedia(adsList);
        // Retry shortly after load in case AOS/layout shift changes widths.
        setTimeout(() => this._syncPreviewDominantMedia(adsList), 150);
      });

      // Single preview card: auto-advance (video end or 30s for images)
      this._startPreviewAutoplay(start);

      console.log(`✅ Reels preview: ${n} of ${items.length} ad(s)`);
      if (typeof window.initMenuReels === 'function') {
        window.initMenuReels();
      }
      this.setupReelsFullscreenAutoOpen();
    } catch (error) {
      console.error('Error displaying reels ads:', error);
    }
  },

  /**
   * Display ads in the list
   */
  displayAds(ads, config) {
    try {
      const adsList = document.getElementById('ads-list');
      if (!adsList) {
        console.error('❌ Ads list container not found!');
        return;
      }

      this.clearReelsPreviewClasses();

      if (this.shouldUseReelsMode()) {
        this.displayAdsReelsMode(ads, config);
        return;
      }

      adsList.innerHTML = '';
      console.log('🎨 Displaying ads:', ads);

      const items = this.prepareAdsForDisplay(ads);
      let skippedCount = ads.length - items.length;

      items.forEach((item) => {
        const li = this.buildAdPanelLi(item, config, {});
        adsList.appendChild(li);
      });

      console.log(`✅ Displayed ${items.length} ad(s) out of ${ads.length} total`);
      if (skippedCount > 0) {
        console.warn(`⚠️ Skipped ${skippedCount} ad(s) due to missing images`);
      }
    } catch (error) {
      console.error('Error displaying ads:', error);
    }
  },

  /**
   * Fetch active ads (client_id is optional - if not provided, returns all active ads)
   */
  async loadActiveAds() {
    try {
      const config = this.getConfig();
      if (!config) {
        console.warn('⚠️ Ads container not found, skipping ad load');
        return;
      }
      
      const { clientId, adsServiceUrl } = config;

      let url = `${adsServiceUrl}/api/v1/active-ads`;
      const params = [];

      if (clientId) {
        params.push(`client_id=${encodeURIComponent(clientId)}`);
      }
      if (this.userLocation) {
        params.push(`location=${encodeURIComponent(this.userLocation)}`);
      }

      if (params.length > 0) {
        url += '?' + params.join('&');
      }
      
      console.log('📡 Fetching ads from:', url);
      
      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        mode: 'cors',
        credentials: 'omit'
      });
      
      if (!response.ok) {
        let errorText = '';
        let errorData = null;
        try {
          errorText = await response.text();
          try {
            errorData = JSON.parse(errorText);
          } catch (e) {
            // Not JSON, use text as-is
          }
        } catch (e) {
          errorText = 'Could not read error response';
        }
        console.error('Failed to fetch ads:', response.status, response.statusText, errorText);
        
        // Show error message in the ads list if it's a server error
        const adsList = document.getElementById('ads-list');
        if (adsList && response.status >= 500) {
          const errorMsg = errorData?.details || errorData?.error || errorText || 'Server error';
          adsList.innerHTML = `<li class="ad-panel" style="padding: 2rem; text-align: center; color: #666;">
            <p>⚠️ Unable to load ads at this time.</p>
            <p style="font-size: 0.9em; margin-top: 0.5rem;">Error: ${this.escapeHtml(errorMsg)}</p>
            <p style="font-size: 0.8em; margin-top: 0.5rem; color: #999;">Please try refreshing the page.</p>
          </li>`;
        }
        return;
      }
      
      const result = await response.json();
      console.log('Ads response:', result);
      
      if (result.success && result.data && result.data.length > 0) {
        console.log(`✅ Found ${result.data.length} active ad(s)`);
        this.displayAds(result.data, config);
      } else {
        console.log('ℹ️ No active ads found');
      }
    } catch (error) {
      // Handle network errors (CORS, connection refused, etc.)
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
        const config = this.getConfig();
        const adsServiceUrl = config ? config.adsServiceUrl : this.config.adsServiceUrl;
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const isProductionAdsService = adsServiceUrl.includes('https://ads.ttmenus.com');
        
        if (isLocalhost && isProductionAdsService) {
          console.warn('⚠️ Local development detected: Trying to fetch from production ads-service');
        } else {
          console.warn('Failed to fetch ads - this may be a CORS issue or the ads service is not available.');
        }
      } else {
        console.error('Error loading ads:', error);
      }
    }
  },

  /**
   * Transform menu JSON ad format to ads-client format
   */
  transformMenuAds(menuAds, menuBaseUrl = '') {
    if (!Array.isArray(menuAds)) {
      return [];
    }
    
    return menuAds.map((ad, index) => {
      // Transform images array
      const images = [];
      if (ad.images && Array.isArray(ad.images)) {
        ad.images.forEach(img => {
          const imageUrl = typeof img === 'string' ? img : (img.image || img.url || img.src || img.image_url);
          if (imageUrl) {
            // Store URL as-is, will be made absolute later with menu base URL
            images.push({
              image_url: imageUrl,
              imageUrl: imageUrl,
              url: imageUrl,
              image: imageUrl,
              alt_text: ad.title || 'Advertisement'
            });
          }
        });
      }
      
      // Generate ID if not present
      const adId = ad.id || `menu-ad-${index}-${(ad.title || '').toLowerCase().replace(/\s+/g, '-')}`;
      
      // Determine link URL - use ad.link, ad.url, or default to menu URL
      let linkUrl = ad.link || ad.url || '';
      if (!linkUrl || linkUrl === '#') {
        linkUrl = '#';
      } else if (!linkUrl.startsWith('http')) {
        linkUrl = this.absolutizeAssetUrl(linkUrl.startsWith('/') ? linkUrl : `/${linkUrl}`);
      }
      
      return {
        id: adId,
        title: ad.title || '',
        images: images,
        link_url: linkUrl,
        weight: ad.weight || 0,
        body: ad.body || '',
        daysofweek: ad.daysofweek || [],
        time_start: ad.time_start,
        time_finish: ad.time_finish,
      };
    });
  },

  /**
   * Load promotions from menu site's promotions/index.json
   */
  async loadMenuAds(menuUrl) {
    try {
      const urls = [];
      const origin = this.resolveSiteOrigin();
      if (origin) {
        urls.push(`${origin}/promotions/index.json`);
      }
      if (menuUrl) {
        const baseUrl = this.resolveMenuBaseUrl(menuUrl);
        const remoteUrl = `${baseUrl}promotions/index.json`;
        if (!urls.includes(remoteUrl)) {
          urls.push(remoteUrl);
        }
      }

      let adsData = null;
      let lastStatus = 0;
      for (const url of urls) {
        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-store',
          });
          if (response.ok) {
            adsData = await response.json();
            break;
          }
          lastStatus = response.status;
        } catch (err) {
          if (!window.__ttmsPromotionsFetchWarned) {
            console.debug('Promotions JSON unavailable:', url, err);
          }
        }
      }

      if (!adsData) {
        if (!window.__ttmsPromotionsFetchWarned) {
          window.__ttmsPromotionsFetchWarned = true;
          if (lastStatus === 404) {
            console.info('ℹ️ No promotions/index.json on this site yet — using ads-service only');
          } else if (lastStatus) {
            console.warn(`⚠️ Promotions fetch failed: ${lastStatus}`);
          }
        }
        return [];
      }
      
      let allAds = [];
      if (Array.isArray(adsData)) {
        allAds = adsData;
      } else if (adsData && typeof adsData === 'object') {
        allAds = adsData.items || adsData.promotions || adsData.ads || adsData.data || [];
      }
      
      console.log(`✅ Found ${allAds.length} ad(s) in menu JSON`);

      const transformedAds = this.transformMenuAds(allAds);
      
      transformedAds.forEach((ad) => {
        ad.images.forEach((img) => {
          if (!img.image_url) return;
          const absolute = this.absolutizeAssetUrl(img.image_url);
          const display =
            typeof window !== 'undefined' && window.TtmsThumbor && window.TtmsThumbor.menuImageSrc
              ? window.TtmsThumbor.menuImageSrc(absolute, 'ad')
              : absolute;
          img.image_url = display;
          img.imageUrl = display;
          img.url = display;
          img.image = display;
        });
      });
      
      return transformedAds;
    } catch (error) {
      console.error('Error loading menu ads:', error);
      return [];
    }
  },

  /**
   * Load client-specific ads (menu JSON + ads-service), mixed in reels catalog.
   */
  async loadClientAds(clientId) {
    return this._loadClientAdsImpl(clientId);
  },

  async _loadClientAdsImpl(clientId) {
    const displayGen = ++this._displayGeneration;

    try {
      const config = this.getConfig();
      if (!config) {
        console.log('⚠️ Ads container not found, skipping client ad load');
        return;
      }

      const adsServiceUrl = config.adsServiceUrl || this.config.adsServiceUrl;
      const location = this.userLocation || '';
      const resolvedClientId = clientId || config.clientId;

      console.log('📡 Loading ads for client:', resolvedClientId);

      // Start ads-service fetch immediately (non-blocking for menu promos)
      const clientServicePromise = this.fetchServiceAds(adsServiceUrl, {
        clientId: resolvedClientId,
        location,
      });

      // Menu promotions from same-origin /promotions/index.json (fast)
      const menuAdsRaw = await this.loadMenuAds(config.menuUrl || null);
      const menuAds = this.filterAdsByDay(menuAdsRaw);

      if (displayGen !== this._displayGeneration) return;

      if (menuAds.length > 0) {
        console.log(`✅ Showing ${menuAds.length} menu promotion(s) while ads-service loads…`);
        if (config.container) {
          config.container.style.display = '';
          config.container.style.visibility = 'visible';
        }
        this.displayAds(this.mergeAdSources(menuAds, [], adsServiceUrl), config);
      }

      let serviceAds = await clientServicePromise;

      if (displayGen !== this._displayGeneration) return;

      if (serviceAds.length === 0 && !config.noCompetitorAds) {
        console.log('ℹ️ No client ads from service — trying network ads');
        serviceAds = await this.fetchServiceAds(adsServiceUrl, { location });
      }

      if (displayGen !== this._displayGeneration) return;

      const normalizedService = this.normalizeServiceAds(serviceAds, adsServiceUrl);
      const allAds = this.mergeAdSources(menuAds, serviceAds, adsServiceUrl);

      if (allAds.length > 0) {
        console.log(
          `✅ Mixed reels catalog: ${allAds.length} ad(s) (${menuAds.length} menu, ${normalizedService.length} service)`
        );
        if (config.container) {
          config.container.style.display = '';
          config.container.style.visibility = 'visible';
        }
        this.displayAds(allAds, config);
        window.dispatchEvent(new CustomEvent('adsPopulated'));
      } else if (menuAds.length === 0) {
        console.log(`ℹ️ No ads found for client ${resolvedClientId}`);
      }
    } catch (error) {
      console.error('Error loading client ads:', error);
    }
  },

  /**
   * Load ads function - exposed globally for Barba.js
   * This function re-reads the DOM each time to work with Barba.js
   */
  loadAds() {
    try {
      const config = this.getConfig();
      if (!config) {
        console.log('⚠️ Ads container not found, skipping ad load');
        return;
      }

      if (config.clientId) {
        return this.loadClientAds(config.clientId);
      }

      this.clearReelsPreviewClasses();
      const adsList = document.getElementById('ads-list');
      if (adsList) {
        adsList.innerHTML = '';
      }

      this.loadActiveAds();
    } catch (error) {
      console.error('Error loading ads:', error);
    }
  },
};

  // Initialize ads client when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AdsClient.init());
  } else {
    AdsClient.init();
  }

  // Export for use in other scripts
  window.AdsClient = AdsClient;
  window.loadFrontPageAds = () => AdsClient.loadAds();
  window.loadClientPageAds = () => {
    const container = document.getElementById('pageadscontainer');
    if (container) {
      const clientId = container.getAttribute('data-client-id') || 'ttmenus';
      AdsClient.loadClientAds(clientId);
    }
  };

  // Barba transitions re-load ads after navigation
  function loadClientPageAdsIfPresent() {
    const container = document.getElementById('pageadscontainer');
    if (!container) return;
    if (document.getElementById('menu-reels-viewport')) return;
    if (typeof window.AdsClient !== 'undefined' && typeof window.AdsClient.loadAds === 'function') {
      window.AdsClient.loadAds();
    } else {
      window.loadClientPageAds();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadClientPageAdsIfPresent);
  } else {
    loadClientPageAdsIfPresent();
  }

  function registerBarbaAdsClient() {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(loadClientPageAdsIfPresent);
    }
  }

  if (window.TTMSBarba) {
    registerBarbaAdsClient();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerBarbaAdsClient);
  } else {
    registerBarbaAdsClient();
  }

  window.addEventListener('ttms:nav-mode-change', function () {
    if (typeof AdsClient.setupReelsFullscreenAutoOpen === 'function') {
      AdsClient.setupReelsFullscreenAutoOpen();
    }
  });
})();

