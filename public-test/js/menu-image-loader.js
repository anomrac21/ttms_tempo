/**
 * Menu image load states — CSS throbber on parent, Thumbor fallback on error.
 */
(function () {
  'use strict';

  var SELECTOR =
    'img.menu-item-img, img.menu-smash-pass-card__img--front, img#bg, .menu-header__link img.food, .ads-reels-slide img.ad-portrait:not(.ad-portrait-bg)';

  var trackObserver = null;
  var dynamicEventsBound = false;

  function loadHost(img) {
    if (!img) return null;
    return (
      img.closest('.menu-item-image') ||
      img.closest('.menu-smash-pass-card__img-stage') ||
      img.closest('.menu-smash-pass-card__media') ||
      img.closest('.hero_logo_container') ||
      img.parentElement
    );
  }

  function setLoading(img, loading) {
    var host = loadHost(img);
    if (!host) return;
    host.classList.toggle('is-loading', !!loading);
    if (!loading) host.classList.remove('is-error');
  }

  function setError(img) {
    var host = loadHost(img);
    if (!host) return;
    host.classList.remove('is-loading');
    host.classList.add('is-error');
  }

  function directSrcFromPath(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    if (path.charAt(0) === '/') return path;
    return '/' + path.replace(/^\/+/, '');
  }

  function bindImg(img) {
    if (!img || img.tagName !== 'IMG' || img.dataset.ttmsImgBound === '1') return;
    img.dataset.ttmsImgBound = '1';

    function onLoad() {
      if (img.naturalWidth > 0) setLoading(img, false);
    }

    function onError() {
      if (img.dataset.ttmsImgRetry !== '1') {
        img.dataset.ttmsImgRetry = '1';
        if (window.TtmsThumbor && typeof window.TtmsThumbor.fallbackImg === 'function') {
          window.TtmsThumbor.fallbackImg(img);
          if (img.complete && img.naturalWidth > 0) {
            setLoading(img, false);
            return;
          }
        }
        var path = img.getAttribute('data-src-path') || '';
        var direct = directSrcFromPath(path);
        if (direct && img.src !== direct) {
          img.src = direct;
          return;
        }
      }
      setError(img);
    }

    img.addEventListener('load', onLoad);
    img.addEventListener('error', onError);

    if (img.complete) {
      if (img.naturalWidth > 0) setLoading(img, false);
      else onError();
    } else {
      setLoading(img, true);
    }
  }

  function scan(root) {
    var scope = root && root.querySelectorAll ? root : document;
    if (root && root.tagName === 'IMG') {
      bindImg(root);
      return;
    }
    scope.querySelectorAll(SELECTOR).forEach(bindImg);
  }

  function onDynamicContent() {
    scan(document);
  }

  function disconnectTrackObserver() {
    if (trackObserver) {
      trackObserver.disconnect();
      trackObserver = null;
    }
  }

  function bindTrackObserver() {
    disconnectTrackObserver();
    if (typeof MutationObserver === 'undefined') return;

    var track = document.getElementById('menu-reels-track');
    if (!track) return;

    var pending = false;
    trackObserver = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        scan(track);
      });
    });
    trackObserver.observe(track, { childList: true, subtree: true });
  }

  function bindDynamicEvents() {
    if (dynamicEventsBound) return;
    dynamicEventsBound = true;

    ['menuReelsUpdated', 'menuReelsFlattened', 'homeMenuItemsLoaded', 'adsPopulated'].forEach(
      function (name) {
        window.addEventListener(name, onDynamicContent);
      }
    );
  }

  function init() {
    scan(document);
    bindDynamicEvents();
    bindTrackObserver();

    if (window.TTMSBarba) {
      window.TTMSBarba.register(function () {
        disconnectTrackObserver();
        scan(document);
        bindTrackObserver();
      });
    }
  }

  window.TTMSImageLoader = {
    scan: scan,
    bindImg: bindImg,
    teardown: disconnectTrackObserver,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
