/**
 * Thumbor URLs for menu content images (live site + dashboard editor).
 * Configure via window.MENU_IMAGE_THUMBOR_URL or SiteConfig.thumborUrl (hugo params.thumbor.url).
 * Exposed as window.TtmsThumbor and window.DashboardImageUtils.
 */
(function (global) {
  'use strict';

  function thumborBase() {
    var fromSite =
      global.SiteConfig && global.SiteConfig.thumborUrl
        ? global.SiteConfig.thumborUrl
        : '';
    return String(
      (typeof global.MENU_IMAGE_THUMBOR_URL !== 'undefined' &&
        global.MENU_IMAGE_THUMBOR_URL) ||
        fromSite ||
        'https://thumbor.ttmenus.com'
    ).replace(/\/+$/, '');
  }

  function siteOrigin() {
    var configured =
      (typeof global.MENU_IMAGE_SOURCE_BASE_URL !== 'undefined' &&
        global.MENU_IMAGE_SOURCE_BASE_URL) ||
      (global.SiteConfig && global.SiteConfig.menuImageSourceBaseUrl) ||
      '';
    if (configured) return String(configured).replace(/\/+$/, '');
    try {
      return String(global.location.origin || '').replace(/\/+$/, '');
    } catch (e) {
      return '';
    }
  }

  function menuImagesUseThumbor() {
    if (typeof global.MENU_IMAGES_USE_THUMBOR !== 'undefined') {
      return !!global.MENU_IMAGES_USE_THUMBOR;
    }
    if (global.SiteConfig && typeof global.SiteConfig.menuImagesUseThumbor !== 'undefined') {
      return !!global.SiteConfig.menuImagesUseThumbor;
    }
    return false;
  }

  /** Absolute URL for a site-relative path (images/foo.webp). */
  function absoluteSiteUrl(path) {
    var p = String(path || '').trim();
    if (!p) return '';
    if (/^https?:\/\//i.test(p)) return p;
    var rel = p.charAt(0) === '/' ? p : '/' + p;
    var origin = siteOrigin();
    return origin ? origin + rel : rel;
  }

  /**
   * Thumbor fit-in URL (unsafe). Source must be reachable by Thumbor (whitelist in chart values).
   */
  function thumborFitIn(sourceUrl, width, height) {
    var src = String(sourceUrl || '').trim();
    if (!src) return '';
    var w = Math.max(32, parseInt(width, 10) || 320);
    var h = Math.max(32, parseInt(height, 10) || 320);
    return (
      thumborBase() +
      '/unsafe/fit-in/' +
      w +
      'x' +
      h +
      '/' +
      encodeURIComponent(src)
    );
  }

  function resolveDraftAssetUrl(path, cmsServiceUrl, clientId) {
    var p = String(path || '').trim();
    if (p.indexOf('draft-assets/') !== 0) return '';
    var base = String(cmsServiceUrl || global.CMS_SERVICE_URL || '')
      .replace(/\/+$/, '');
    var cid = clientId || global.CMS_CLIENT_ID || global.CLIENT_ID || '';
    var name = p.replace(/^draft-assets\//, '');
    return (
      base +
      '/api/clients/' +
      encodeURIComponent(cid) +
      '/preview/draft-assets/' +
      encodeURIComponent(name)
    );
  }

  var SIZES = {
    thumb: [320, 320],
    card: [480, 480],
    carousel: [720, 900],
    hero: [1920, 1080],
    section: [640, 640],
    ad: [720, 900],
  };

  function shouldSkipThumbor(path) {
    var p = String(path || '').trim();
    if (!p) return true;
    if (p.indexOf('draft-assets/') === 0) return true;
    if (/^https?:\/\/([^/]*\.)?cdn\.ttmenus\.com\//i.test(p)) return true;
    if (/thumbor\.ttmenus\.com/i.test(p)) return true;
    if (/^\/?(branding|main)\//i.test(p) || /\/(branding|main)\//i.test(p)) return true;
    return false;
  }

  function menuImageSrc(path, size) {
    var dims = SIZES[size] || SIZES.card;
    return resolvePreviewSrc(path, { width: dims[0], height: dims[1] });
  }

  /** If Thumbor fails, load the direct site image path once. */
  function fallbackImg(imgEl) {
    if (!imgEl || imgEl.dataset.fellback) return;
    var path = imgEl.getAttribute('data-src-path') || '';
    if (!path) return;
    imgEl.dataset.fellback = '1';
    var direct = /^https?:\/\//i.test(path)
      ? path
      : absoluteSiteUrl(path);
    if (direct && imgEl.src !== direct) imgEl.src = direct;
  }

  function resolvePreviewSrc(path, opts) {
    opts = opts || {};
    var p = String(path || '').trim();
    if (!p) return '';
    if (p.indexOf('draft-assets/') === 0) {
      return resolveDraftAssetUrl(p, opts.cmsServiceUrl, opts.clientId) || '';
    }
    if (shouldSkipThumbor(p)) {
      if (/^https?:\/\//i.test(p)) return p;
      return p.charAt(0) === '/' ? p : '/' + p;
    }
    if (/^https?:\/\//i.test(p)) {
      return opts.useThumbor === false || !menuImagesUseThumbor()
        ? p
        : thumborFitIn(p, opts.width, opts.height);
    }
    if (opts.useThumbor === false || !menuImagesUseThumbor()) {
      return p.charAt(0) === '/' ? p : '/' + p;
    }
    return thumborFitIn(absoluteSiteUrl(p), opts.width, opts.height);
  }

  var api = {
    thumborBase: thumborBase,
    menuImagesUseThumbor: menuImagesUseThumbor,
    absoluteSiteUrl: absoluteSiteUrl,
    thumborFitIn: thumborFitIn,
    resolveDraftAssetUrl: resolveDraftAssetUrl,
    resolvePreviewSrc: resolvePreviewSrc,
    menuImageSrc: menuImageSrc,
    fallbackImg: fallbackImg,
    shouldSkipThumbor: shouldSkipThumbor,
    SIZES: SIZES,
  };

  global.TtmsThumbor = api;
  global.DashboardImageUtils = api;
})(typeof window !== 'undefined' ? window : this);
