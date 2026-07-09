/**
 * Shared ad utilities — used by ads-client.js and client-ad-manager.js.
 */
(function () {
  'use strict';

  if (window.TTMSAdsShared) return;

  function parseTime(str) {
    if (!str || typeof str !== 'string') return null;
    var m = String(str).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  }

  function filterAdsByDay(ads, day, nowMins, fallbackToAll) {
    if (!Array.isArray(ads) || ads.length === 0) return ads;
    var weekday = day || new Date().toLocaleDateString('en-US', { weekday: 'long' });
    var mins = nowMins;
    if (mins == null) {
      var now = new Date();
      mins = now.getHours() * 60 + now.getMinutes();
    }
    var filtered = ads.filter(function (ad) {
      if (!ad.daysofweek || ad.daysofweek.length === 0) return true;
      if (!ad.daysofweek.includes(weekday)) return false;
      if (ad.time_start != null || ad.time_finish != null) {
        var start = parseTime(String(ad.time_start || '00:00'));
        var finish = parseTime(String(ad.time_finish || '23:59'));
        if (start == null || finish == null) return false;
        if (start <= finish) return mins >= start && mins <= finish;
        return mins >= start || mins <= finish;
      }
      return true;
    });
    if (filtered.length > 0) return filtered;
    return fallbackToAll !== false ? ads : filtered;
  }

  function getDeviceType(mode) {
    if (mode === 'ua') {
      var ua = navigator.userAgent;
      if (/mobile/i.test(ua)) return 'mobile';
      if (/tablet/i.test(ua)) return 'tablet';
      return 'desktop';
    }
    var width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  function resolveImageUrl(img) {
    if (!img) return '';
    if (typeof img === 'string') return img;
    return img.image_url || img.imageUrl || img.url || img.src || img.image || '';
  }

  function normalizeImagePath(path) {
    if (!path) return '';
    var raw = String(path).trim();
    if (typeof window !== 'undefined' && window.TtmsThumbor && typeof window.TtmsThumbor.menuImageSrc === 'function') {
      return window.TtmsThumbor.menuImageSrc(raw, 'ad');
    }
    if (/^\//.test(raw) || /^https?:\/\//i.test(raw)) return raw;
    return '/' + raw;
  }

  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function isUuid(adId) {
    if (!adId || typeof adId !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(adId);
  }

  function resolveSiteOrigin() {
    return (typeof window !== 'undefined' && window.location && window.location.origin)
      ? window.location.origin
      : '';
  }

  function absolutizeAssetUrl(url) {
    if (!url) return url;
    var origin = resolveSiteOrigin();
    if (/^https?:\/\/(localhost|127\.0\.0\.1):\d+/i.test(url) && origin) {
      try {
        var parsed = new URL(url);
        return origin + parsed.pathname + parsed.search;
      } catch (_) { /* fall through */ }
    }
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return window.location.protocol + url;
    if (url.startsWith('/')) return origin + url;
    return origin + '/' + url;
  }

  function resolveServiceAssetUrl(url, adsServiceUrl) {
    if (!url) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return window.location.protocol + url;
    var base = (adsServiceUrl || '').replace(/\/$/, '');
    if (!base) return absolutizeAssetUrl(url);
    if (url.startsWith('/')) return base + url;
    return base + '/' + url;
  }

  function getServiceFetchTimeoutMs(adsServiceUrl) {
    var url = adsServiceUrl || '';
    if (/localhost|127\.0\.0\.1/.test(url)) return 15000;
    return 20000;
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    var ms = timeoutMs || 6000;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, ms);
    return fetch(url, Object.assign({}, options || {}, { signal: controller.signal }))
      .finally(function () { clearTimeout(timer); });
  }

  function hasValidImages(ad) {
    var imgs = ad.images || [];
    return imgs.some(function (img) {
      var path = resolveImageUrl(img);
      return path && String(path).trim() !== '';
    });
  }

  window.TTMSAdsShared = {
    parseTime: parseTime,
    filterAdsByDay: filterAdsByDay,
    getDeviceType: getDeviceType,
    resolveImageUrl: resolveImageUrl,
    normalizeImagePath: normalizeImagePath,
    escapeHtml: escapeHtml,
    isUuid: isUuid,
    resolveSiteOrigin: resolveSiteOrigin,
    absolutizeAssetUrl: absolutizeAssetUrl,
    resolveServiceAssetUrl: resolveServiceAssetUrl,
    getServiceFetchTimeoutMs: getServiceFetchTimeoutMs,
    fetchWithTimeout: fetchWithTimeout,
    hasValidImages: hasValidImages,
  };
})();
