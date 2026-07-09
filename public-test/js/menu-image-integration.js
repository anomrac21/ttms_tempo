/**
 * Menu Image Integration - fetches approved user-submitted images and allows upload (when logged in)
 * Uses Thumbor for optimized image delivery
 */
(function () {
  const CONFIG = typeof window.MENU_IMAGE_CONFIG !== 'undefined' ? window.MENU_IMAGE_CONFIG : {
    apiUrl: 'https://menu-images.ttmenus.com/api/v1',
    clientId: '_ttms_menu_demo',
    enabled: true
  };

  if (!CONFIG.enabled || !CONFIG.apiUrl) return;

  function getToken() {
    if (typeof AuthClient !== 'undefined' && AuthClient.getAccessToken) {
      return AuthClient.getAccessToken();
    }
    try {
      return localStorage.getItem('ttmenus_access_token');
    } catch (e) {
      return null;
    }
  }

  function isLoggedIn() {
    if (typeof AuthClient !== 'undefined' && AuthClient.isAuthenticated) {
      return AuthClient.isAuthenticated();
    }
    return !!getToken();
  }

  function findMenuImageHosts(root) {
    const scope = root && root.querySelectorAll ? root : document;
    if (root && root.matches && root.matches('[data-menu-item-path][data-menu-image-client-id]')) {
      return [root];
    }
    return Array.from(
      scope.querySelectorAll('[data-menu-item-path][data-menu-image-client-id]')
    );
  }

  function normalizeApprovedImage(img) {
    if (typeof img === 'string') {
      return { id: '', thumborUrl: img };
    }
    return {
      id: img.id || '',
      thumborUrl:
        img.thumborUrl || img.thumbor_url || img.thumborURL || img.url || ''
    };
  }

  function thumbUrlFromApproved(img) {
    return normalizeApprovedImage(img).thumborUrl;
  }

  function canRemoveMenuImages() {
    if (typeof AuthClient === 'undefined' || !AuthClient.isAuthenticated()) return false;
    if (AuthClient.isSuperadmin && AuthClient.isSuperadmin()) return true;
    if (!AuthClient.isAdmin || !AuthClient.isAdmin()) return false;
    const siteClient = CONFIG.clientId || window.SITE_CLIENT_ID || window.CLIENT_ID || '';
    const user = AuthClient.getCurrentUser && AuthClient.getCurrentUser();
    if (!user || !siteClient) return false;
    const assigned = String(user.client_id || '')
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

  function buildRemoveButtonHtml(submissionId) {
    if (!submissionId || !canRemoveMenuImages()) return '';
    const safeId = String(submissionId).replace(/"/g, '');
    return (
      '<button type="button" class="menu-image-remove-btn" data-submission-id="' +
      safeId +
      '" aria-label="Remove photo" title="Remove photo">' +
      '<i class="fa fa-times" aria-hidden="true"></i></button>'
    );
  }

  function menuItemPathVariants(menuItemPath) {
    const raw = String(menuItemPath || '').trim();
    const stripped = raw.replace(/\/$/, '') || '/';
    const variants = [stripped, raw];
    if (!raw.endsWith('/')) variants.push(stripped + '/');
    const seen = new Set();
    return variants.filter(function (p) {
      if (!p || seen.has(p)) return false;
      seen.add(p);
      return true;
    });
  }

  async function fetchApprovedImagesOnce(clientId, menuItemPath) {
    const url =
      CONFIG.apiUrl +
      '/menu-images?client_id=' +
      encodeURIComponent(clientId) +
      '&menu_item_path=' +
      encodeURIComponent(menuItemPath);
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    if (json.success === false) return [];
    return (json.data || []).map(normalizeApprovedImage).filter(function (rec) {
      return !!rec.thumborUrl;
    });
  }

  async function fetchApprovedImages(clientId, menuItemPath) {
    const paths = menuItemPathVariants(menuItemPath);
    for (let i = 0; i < paths.length; i++) {
      const results = await fetchApprovedImagesOnce(clientId, paths[i]);
      if (results.length) return results;
    }
    return [];
  }

  const approvedImagesCache = new Map();
  const approvedImagesInflight = new Map();

  function imagesCacheKey(clientId, pathForApi) {
    return String(clientId) + '::' + (String(pathForApi).replace(/\/$/, '') || '/');
  }

  function invalidateApprovedImagesCache(clientId, pathForApi) {
    approvedImagesCache.delete(imagesCacheKey(clientId, pathForApi));
  }

  function fetchApprovedImagesCached(clientId, pathForApi) {
    const key = imagesCacheKey(clientId, pathForApi);
    if (approvedImagesCache.has(key)) {
      return Promise.resolve(approvedImagesCache.get(key));
    }
    if (approvedImagesInflight.has(key)) {
      return approvedImagesInflight.get(key);
    }
    const promise = fetchApprovedImages(clientId, pathForApi)
      .then(function (images) {
        if (images.length) approvedImagesCache.set(key, images);
        return images;
      })
      .finally(function () {
        approvedImagesInflight.delete(key);
      });
    approvedImagesInflight.set(key, promise);
    return promise;
  }

  function hostPathForApi(host) {
    const menuItemPath = host.getAttribute('data-menu-item-path') || '';
    return menuItemPath.replace(/\/$/, '') || '/';
  }

  function hostClientId(host) {
    return (
      host.getAttribute('data-menu-image-client-id') ||
      host.getAttribute('data-client-id') ||
      CONFIG.clientId
    );
  }

  function shouldAutoInitHost(host) {
    if (!host || !host.isConnected) return false;
    if (host.classList.contains('single-page-content')) return true;
    const card = host.closest('.menu-item-card');
    if (!card) return false;
    return card.getAttribute('data-item-expanded') === 'true' || card.classList.contains('expanded');
  }

  function getCarouselTrack(carousel) {
    if (!carousel) return null;
    return carousel.querySelector(
      '.menu-item-slideshow-track, .expanded-image-carousel-container, .single-page-image-carousel-container'
    );
  }

  function countCarouselSlides(carousel) {
    const track = getCarouselTrack(carousel);
    if (!track) return 0;
    return track.querySelectorAll('.expanded-image-slide, .single-page-image-slide').length;
  }

  function clearCarouselHeightSync(carousel) {
    if (!carousel) return;
    carousel.classList.remove('is-height-synced');
    const track = getCarouselTrack(carousel);
    const view = carousel.querySelector('.expanded-image-carousel-view');
    if (track) {
      track.style.removeProperty('height');
      track.style.removeProperty('min-height');
    }
    if (view) view.style.removeProperty('min-height');
  }

  function syncExpandedCarouselNav(carousel) {
    if (!carousel) return;
    const slideCount = countCarouselSlides(carousel);

    const oldIndicators = carousel.querySelector('.expanded-image-indicators');
    if (oldIndicators) oldIndicators.remove();
    const oldNav = carousel.querySelector('.expanded-image-nav-buttons');
    if (oldNav) oldNav.remove();

    if (slideCount <= 1) {
      clearCarouselHeightSync(carousel);
      return;
    }

    let view = carousel.querySelector('.expanded-image-carousel-view');
    if (!view) {
      view = document.createElement('div');
      view.className = 'expanded-image-carousel-view';
      const track = getCarouselTrack(carousel);
      if (track) {
        view.appendChild(track);
        carousel.insertBefore(view, carousel.firstChild);
      }
    }

    const navWrap = document.createElement('div');
    navWrap.className = 'expanded-image-nav-buttons';
    navWrap.innerHTML =
      '<button type="button" class="expanded-image-nav expanded-image-nav-prev" onclick="navigateExpandedImage(this, -1, \'\', event)" aria-label="Previous image"><i class="fa fa-chevron-left" aria-hidden="true"></i></button>' +
      '<button type="button" class="expanded-image-nav expanded-image-nav-next" onclick="navigateExpandedImage(this, 1, \'\', event)" aria-label="Next image"><i class="fa fa-chevron-right" aria-hidden="true"></i></button>';
    view.appendChild(navWrap);

    const indicators = document.createElement('div');
    indicators.className = 'expanded-image-indicators';
    indicators.setAttribute('role', 'tablist');
    indicators.setAttribute('aria-label', 'Item images');
    for (let i = 0; i < slideCount; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'expanded-image-indicator' + (i === 0 ? ' active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-label', 'Image ' + (i + 1));
      btn.setAttribute('data-indicator-index', String(i));
      btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      btn.onclick = function (event) {
        if (typeof goToExpandedImage === 'function') goToExpandedImage(this, i, '', event);
      };
      indicators.appendChild(btn);
    }
    carousel.appendChild(indicators);
  }

  function ensureMenuImageLayout(host) {
    if (!host) return;
    const carousel = host.querySelector('.expanded-image-carousel');
    const actions = host.querySelector('.menu-image-actions:not(.menu-image-actions--standalone)');
    if (!carousel || !actions) return;
    if (carousel.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_PRECEDING) {
      host.insertBefore(carousel, actions);
    }
  }

  function syncCarouselUI(carousel) {
    if (!carousel) return;
    const slides = carousel.querySelectorAll('.expanded-image-slide');
    slides.forEach(function (slide, i) {
      slide.classList.toggle('active', i === 0);
    });
    carousel.setAttribute('data-current-image', '0');
    carousel.querySelectorAll('.expanded-image-indicator').forEach(function (ind, i) {
      const on = i === 0;
      ind.classList.toggle('active', on);
      ind.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (typeof bindExpandedCarouselImages === 'function') {
      bindExpandedCarouselImages(carousel);
    }
  }

  function applyApprovedThumbnailToCard(host, images) {
    if (!host || !images.length) return;
    const thumborUrls = images.map(thumbUrlFromApproved);
    const card = host.closest('.menu-item-card');
    if (!card) return;
    let menuImages = [];
    try {
      menuImages = JSON.parse(card.getAttribute('data-images-array') || '[]');
    } catch (e) {
      menuImages = [];
    }
    if (Array.isArray(menuImages) && menuImages.length > 0) return;

    const imgLink = card.querySelector('.menu-item-image-link');
    const img = imgLink && imgLink.querySelector('.menu-item-img');
    if (!img) return;

    img.src = thumborUrls[0];
    img.loading = 'lazy';
    imgLink.style.display = '';
  }

  function buildEmptyCarouselElement() {
    const carousel = document.createElement('div');
    carousel.className = 'expanded-image-carousel menu-item-slideshow';
    carousel.setAttribute('data-current-image', '0');

    const view = document.createElement('div');
    view.className = 'expanded-image-carousel-view';

    const container = document.createElement('div');
    container.className = 'expanded-image-carousel-container menu-item-slideshow-track';
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'Item photos');
    container.setAttribute('tabindex', '0');

    view.appendChild(container);
    carousel.appendChild(view);
    return carousel;
  }

  function createCarouselFromPlaceholder(host, placeholder) {
    if (!host || !placeholder) return null;

    const carousel = buildEmptyCarouselElement();

    const addBtn = placeholder.querySelector('.menu-image-add-btn');
    let actions = host.querySelector('.menu-image-actions:not(.menu-image-actions--standalone)');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'menu-image-actions';
    }
    if (addBtn && addBtn.parentNode !== actions) {
      actions.appendChild(addBtn);
    }

    host.insertBefore(carousel, placeholder);
    host.insertBefore(actions, carousel.nextSibling);
    placeholder.remove();
    return carousel;
  }

  function ensureCarouselForHost(host) {
    if (!host) return null;
    let carousel =
      host.querySelector('#singlePageImageCarousel') ||
      host.querySelector('.expanded-image-carousel');
    if (carousel) return carousel;

    const placeholder = host.querySelector('.expanded-media-placeholder');
    if (placeholder) {
      carousel = createCarouselFromPlaceholder(host, placeholder);
    } else {
      carousel = buildEmptyCarouselElement();
      let actions = host.querySelector('.menu-image-actions:not(.menu-image-actions--standalone)');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'menu-image-actions';
        const addBtn = host.querySelector('.menu-image-add-btn');
        if (addBtn) actions.appendChild(addBtn);
      }
      host.insertBefore(carousel, host.firstChild);
      if (actions && actions.parentNode === host) {
        host.insertBefore(actions, carousel.nextSibling);
      }
    }
    if (carousel) host.classList.remove('expanded-item-details--no-carousel');
    return carousel;
  }

  function refreshAdminRemoveButtons(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.expanded-image-slide[data-user-photo="1"]').forEach(function (slide) {
      const existing = slide.querySelector('.menu-image-remove-btn');
      const id = slide.getAttribute('data-submission-id') || '';
      const show = id && canRemoveMenuImages();
      if (show && !existing) {
        const panel = slide.querySelector('.content-panel') || slide;
        panel.insertAdjacentHTML('beforeend', buildRemoveButtonHtml(id));
      } else if (!show && existing) {
        existing.remove();
      }
    });
  }

  function bindAdminPhotoRemove(host, clientId, pathForApi) {
    if (!host || host._menuImageRemoveBound) return;
    host._menuImageRemoveBound = true;
    host.addEventListener('click', function (e) {
      const btn = e.target.closest('.menu-image-remove-btn');
      if (!btn || !canRemoveMenuImages()) return;
      e.preventDefault();
      e.stopPropagation();

      const submissionId = btn.getAttribute('data-submission-id');
      if (!submissionId) return;
      if (
        !window.confirm(
          'Remove this photo from the menu? Guests will no longer see it. This cannot be undone.'
        )
      ) {
        return;
      }

      const token = getToken();
      if (!token) {
        alert('Please sign in as a menu admin to remove photos.');
        return;
      }

      btn.disabled = true;
      const deleteUrl =
        CONFIG.apiUrl +
        '/admin/menu-images/' +
        encodeURIComponent(submissionId) +
        '?client_id=' +
        encodeURIComponent(clientId);

      fetch(deleteUrl, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token }
      })
        .then(function (res) {
          return res.json().then(function (body) {
            return { ok: res.ok, body: body };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            throw new Error((result.body && result.body.error) || 'Failed to remove photo');
          }
          invalidateApprovedImagesCache(clientId, pathForApi);
          loadMenuImagesForHost(host);
        })
        .catch(function (err) {
          btn.disabled = false;
          alert(err.message || 'Could not remove photo. Try again.');
        });
    });
  }

  function injectApprovedImages(carousel, images) {
    if (!carousel || !images.length) return 0;

    const container = getCarouselTrack(carousel);
    if (!container) return 0;

    const baseIndex = container.querySelectorAll('.expanded-image-slide, .single-page-image-slide').length;
    let injected = 0;
    images.forEach(function (img) {
      const rec = normalizeApprovedImage(img);
      const url = rec.thumborUrl;
      if (!url) return;
      const slide = document.createElement('div');
      const isFirst = baseIndex === 0 && injected === 0;
      slide.className =
        'expanded-image-slide menu-item-slideshow-slide' + (isFirst ? ' active' : '');
      slide.setAttribute('data-image-index', String(baseIndex + injected));
      slide.setAttribute('data-user-photo', '1');
      if (rec.id) slide.setAttribute('data-submission-id', rec.id);
      const safeUrl = String(url).replace(/'/g, '%27');
      slide.innerHTML =
        '<div class="content-panel" style="--ad-image: url(\'' +
        safeUrl +
        '\')">' +
        '<img src="' +
        safeUrl.replace(/"/g, '%22') +
        '" alt="User photo" loading="lazy" decoding="async" class="ad-portrait expanded-image-carousel-img">' +
        buildRemoveButtonHtml(rec.id) +
        '</div>';
      container.appendChild(slide);
      injected += 1;
    });

    syncExpandedCarouselNav(carousel);
    refreshAdminRemoveButtons(carousel);

    if (typeof bindExpandedCarouselImages === 'function') {
      bindExpandedCarouselImages(carousel);
    }
    return injected;
  }

  function resolveMenuImageAddContext(btn) {
    const host =
      btn.closest('.menu-item-smash-pass[data-menu-item-path]') ||
      btn.closest('[data-menu-item-path][data-menu-image-client-id]') ||
      btn.closest('.expanded-item-details[data-menu-item-path]') ||
      btn.closest('.single-page-content[data-menu-item-path]') ||
      btn.closest('[data-menu-item-path]');
    if (!host) {
      return { clientId: CONFIG.clientId, path: '/' };
    }
    return {
      clientId:
        host.getAttribute('data-menu-image-client-id') ||
        host.getAttribute('data-client-id') ||
        CONFIG.clientId,
      path: hostPathForApi(host),
    };
  }

  function bindAddPhotoButton(host) {
    const addBtn = host.querySelector('.menu-image-add-btn');
    if (!addBtn) return;
    addBtn.style.display = 'inline-flex';
  }

  function resolveAddPhotoContext(btn) {
    if (!btn) return null;
    if (btn.classList.contains('menu-add-photo-btn')) {
      return {
        clientId: btn.getAttribute('data-menu-image-client-id') || CONFIG.clientId,
        path:
          String(btn.getAttribute('data-menu-item-path') || '').replace(/\/$/, '') || '/',
      };
    }
    const host = btn.closest('[data-menu-item-path]');
    if (!host) return null;
    return {
      clientId: hostClientId(host),
      path: hostPathForApi(host),
    };
  }

  function restorePlaceholderIfNoSlides(host, carousel, clientId, pathForApi) {
    if (!carousel) return;
    const container = carousel.querySelector(
      '.menu-item-slideshow-track, .expanded-image-carousel-container, .single-page-image-carousel-container'
    );
    const slideCount = container
      ? container.querySelectorAll('.expanded-image-slide, .single-page-image-slide').length
      : 0;
    if (slideCount > 0) {
      syncCarouselUI(carousel);
      return;
    }

    const actions = host.querySelector('.menu-image-actions:not(.menu-image-actions--standalone)');
    const addBtn =
      (actions && actions.querySelector('.menu-image-add-btn')) ||
      host.querySelector('.menu-image-add-btn');
    syncExpandedCarouselNav(carousel);
    carousel.remove();
    host.classList.add('expanded-item-details--no-carousel');

    if (!host.querySelector('.expanded-media-placeholder')) {
      const ph = document.createElement('div');
      ph.className = 'expanded-media-placeholder';
      ph.setAttribute('role', 'region');
      ph.setAttribute('aria-label', 'Item photo');
      const standaloneActions = document.createElement('div');
      standaloneActions.className = 'menu-image-actions menu-image-actions--standalone';
      if (addBtn) standaloneActions.appendChild(addBtn);
      ph.appendChild(standaloneActions);
      const hint = document.createElement('p');
      hint.className = 'expanded-media-placeholder__hint';
      hint.textContent = 'No photo yet — be the first to add one';
      ph.appendChild(hint);
      host.insertBefore(ph, host.firstChild);
    }
    if (actions && actions.parentNode === host) actions.remove();
    bindAddPhotoButton(host, clientId, pathForApi);
  }

  function countExpandedSlides(host) {
    const carousel =
      host &&
      (host.querySelector('#singlePageImageCarousel') ||
        host.querySelector('.expanded-image-carousel'));
    if (!carousel) return 0;
    const container = carousel.querySelector(
      '.menu-item-slideshow-track, .expanded-image-carousel-container, .single-page-image-carousel-container'
    );
    if (!container) return 0;
    return container.querySelectorAll('.expanded-image-slide, .single-page-image-slide').length;
  }

  function removeUserPhotoSlides(carousel) {
    if (!carousel) return;
    const container = getCarouselTrack(carousel);
    if (!container) return;
    container.querySelectorAll('[data-user-photo]').forEach(function (slide) {
      slide.remove();
    });
  }

  function resolveImagesForRender(clientId, pathForApi, images) {
    if (images && images.length) return images;
    const cached = approvedImagesCache.get(imagesCacheKey(clientId, pathForApi));
    return cached && cached.length ? cached : images || [];
  }

  function hostUsesSmashPassModal(host) {
    return !!(
      host &&
      host.querySelector(
        '.menu-smash-pass--modal, .menu-smash-pass--single-page, .menu-item-smash-pass[data-menu-item-path]'
      )
    );
  }

  function refreshSmashPassForHost(host) {
    if (typeof window.invalidateMenuSmashPassFeed === 'function') {
      window.invalidateMenuSmashPassFeed();
    }
    var root =
      host &&
      host.querySelector(
        '.menu-smash-pass--modal, .menu-smash-pass--single-page, .menu-item-smash-pass[data-menu-item-path]'
      );
    if (root) {
      root.removeAttribute('data-smash-pass-inited');
    }
    if (root && typeof window.initMenuSmashPassRoot === 'function') {
      window.initMenuSmashPassRoot(root);
    } else if (typeof window.initMenuSmashPass === 'function') {
      window.initMenuSmashPass();
    }
  }

  function renderApprovedImagesToHost(host, clientId, pathForApi, images) {
    if (!host || !host.isConnected) return;

    if (hostUsesSmashPassModal(host)) {
      refreshSmashPassForHost(host);
      return;
    }

    images = resolveImagesForRender(clientId, pathForApi, images);

    try {
      let carousel =
        host.querySelector('#singlePageImageCarousel') ||
        host.querySelector('.expanded-image-carousel');

      if (!images || !images.length) {
        if (countExpandedSlides(host) > 0) {
          syncExpandedCarouselNav(carousel);
          return;
        }
        if (parseInt(host.dataset.menuImageSlideCount || '0', 10) > 0) {
          return;
        }
        removeUserPhotoSlides(carousel);
        syncExpandedCarouselNav(carousel);
        restorePlaceholderIfNoSlides(host, carousel, clientId, pathForApi);
        host.dataset.menuImageSlideCount = '0';
        return;
      }

      carousel = ensureCarouselForHost(host);
      if (!carousel) {
        console.warn('[MenuImages] Could not mount carousel for', pathForApi);
        return;
      }

      removeUserPhotoSlides(carousel);
      const injected = injectApprovedImages(carousel, images);
      if (injected === 0) {
        console.warn('[MenuImages] No slides injected for', pathForApi, images);
        if (countExpandedSlides(host) > 0) {
          syncExpandedCarouselNav(carousel);
          return;
        }
        syncExpandedCarouselNav(carousel);
        restorePlaceholderIfNoSlides(host, carousel, clientId, pathForApi);
        return;
      }

      host.dataset.menuImageSlideCount = String(injected);
      host.classList.remove('expanded-item-details--no-carousel');
      ensureMenuImageLayout(host);
      syncCarouselUI(carousel);
      applyApprovedThumbnailToCard(host, images);
    } catch (err) {
      console.error('[MenuImages] render failed for', pathForApi, err);
    }
  }

  function loadMenuImagesForHostNow(host) {
    if (!host || !host.isConnected) return Promise.resolve();

    const clientId = hostClientId(host);
    const pathForApi = hostPathForApi(host);
    if (!pathForApi) return Promise.resolve();

    return fetchApprovedImagesCached(clientId, pathForApi)
      .then(function (images) {
        if (!host.isConnected) return;
        renderApprovedImagesToHost(host, clientId, pathForApi, images);
      })
      .catch(function (err) {
        console.warn('[MenuImages] load failed:', pathForApi, err);
        if (!host.isConnected) return;
        const key = imagesCacheKey(clientId, pathForApi);
        const cached = approvedImagesCache.get(key);
        if (cached && cached.length) {
          renderApprovedImagesToHost(host, clientId, pathForApi, cached);
          return;
        }
        if (countExpandedSlides(host) > 0) return;
        if (parseInt(host.dataset.menuImageSlideCount || '0', 10) > 0) return;
        const carousel = host.querySelector('.expanded-image-carousel');
        restorePlaceholderIfNoSlides(host, carousel, clientId, pathForApi);
      });
  }

  function loadMenuImagesForHost(host) {
    if (!host) return Promise.resolve();
    if (host._menuImageHostLoadPromise) return host._menuImageHostLoadPromise;
    host._menuImageHostLoadPromise = loadMenuImagesForHostNow(host).finally(function () {
      host._menuImageHostLoadPromise = null;
    });
    return host._menuImageHostLoadPromise;
  }

  function scheduleMenuImageLoadForHost(host) {
    if (!host) return;
    loadMenuImagesForHost(host);
    if (host._menuImageRetryRaf) cancelAnimationFrame(host._menuImageRetryRaf);
    host._menuImageRetryRaf = requestAnimationFrame(function () {
      host._menuImageRetryRaf = null;
      if (!host.isConnected) return;
      if (countExpandedSlides(host) > 0) return;
      loadMenuImagesForHost(host);
    });
  }

  window.scheduleMenuImageLoadForHost = scheduleMenuImageLoadForHost;

  window.bindMenuImageAddButton = function (host, clientId, pathForApi) {
    if (!host) return;
    bindAddPhotoButton(
      host,
      clientId || host.getAttribute('data-client-id') || hostClientId(host) || CONFIG.clientId,
      pathForApi || host.getAttribute('data-menu-item-path') || hostPathForApi(host)
    );
  };

  function refreshSmashPassAddButtons() {
    document.querySelectorAll('.menu-item-smash-pass[data-menu-item-path]').forEach(function (root) {
      window.bindMenuImageAddButton(root);
    });
  }

  document.addEventListener('auth:login', refreshSmashPassAddButtons);
  document.addEventListener('auth:logout', refreshSmashPassAddButtons);

  function initMenuImageHost(host, options) {
    if (!host) return;

    const menuItemPath = host.getAttribute('data-menu-item-path') || '';
    if (!menuItemPath) return;

    const clientId = hostClientId(host);
    const pathForApi = hostPathForApi(host);

    if (!host.dataset.menuImageBound) {
      host.dataset.menuImageBound = '1';
      bindAdminPhotoRemove(host, clientId, pathForApi);
    }

    ensureMenuImageLayout(host);
    refreshAdminRemoveButtons(host);
    bindAddPhotoButton(host, clientId, pathForApi);

    const forceLoad = options && options.forceLoad;
    if (forceLoad || shouldAutoInitHost(host)) {
      loadMenuImagesForHost(host);
    }
  }

  function initMenuImageHostFromExpand(host) {
    if (!host) return;
    initMenuImageHost(host, { forceLoad: false });
  }

  function initPageMenuImages(root) {
    const scope = root && root.querySelectorAll ? root : document;
    findMenuImageHosts(scope).forEach(function (host) {
      if (host.classList.contains('single-page-content')) {
        initMenuImageHost(host, { forceLoad: true });
      }
    });
    setupLazyCardThumbnailPrefetch(scope);
  }

  var thumbPrefetchObserver = null;

  function disconnectThumbPrefetchObserver() {
    if (thumbPrefetchObserver) {
      thumbPrefetchObserver.disconnect();
      thumbPrefetchObserver = null;
    }
  }

  function prefetchCardThumbnail(card) {
    if (!card || card.dataset.menuImageThumbLoaded === '1') return;
    let menuImages = [];
    try {
      menuImages = JSON.parse(card.getAttribute('data-images-array') || '[]');
    } catch (e) {
      menuImages = [];
    }
    if (menuImages.length > 0) return;

    const path = String(card.getAttribute('data-item-url') || '').replace(/\/$/, '') || '/';
    const client = CONFIG.clientId;
    card.dataset.menuImageThumbLoaded = 'pending';
    fetchApprovedImagesCached(client, path).then(function (images) {
      if (!images.length) {
        card.dataset.menuImageThumbLoaded = '0';
        return;
      }
      card.dataset.menuImageThumbLoaded = '1';
      const imgLink = card.querySelector('.menu-item-image-link');
      const img = imgLink && imgLink.querySelector('.menu-item-img');
      if (!img) return;
      img.src = thumbUrlFromApproved(images[0]);
      img.loading = 'lazy';
      imgLink.style.display = '';
    });
  }

  function setupLazyCardThumbnailPrefetch(root) {
    disconnectThumbPrefetchObserver();
    const scope = root && root.querySelectorAll ? root : document;
    const cards = scope.querySelectorAll('.menu-item-card[data-item-url]');
    if (!cards.length) return;

    const track = document.getElementById('menu-reels-track');
    thumbPrefetchObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          prefetchCardThumbnail(entry.target);
          thumbPrefetchObserver.unobserve(entry.target);
        });
      },
      {
        root: track || null,
        rootMargin: '150% 0px',
        threshold: 0.01,
      }
    );

    cards.forEach(function (card) {
      if (card.dataset.menuImageThumbLoaded === '1') return;
      thumbPrefetchObserver.observe(card);
    });
  }

  function prefetchCardThumbnails(root) {
    setupLazyCardThumbnailPrefetch(root);
  }

  let uploadPreviewObjectUrl = null;

  function revokeUploadPreviewUrl() {
    if (uploadPreviewObjectUrl) {
      URL.revokeObjectURL(uploadPreviewObjectUrl);
      uploadPreviewObjectUrl = null;
    }
  }

  function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function isAllowedImageFile(file) {
    if (!file) return false;
    const type = (file.type || '').toLowerCase();
    if (/^image\/(jpeg|png|webp)$/i.test(type)) return true;
    if (/\.(jpe?g|png|webp)$/i.test(file.name || '')) return true;
    return false;
  }

  function setUploadStatus(modal, message, type) {
    const status = modal.querySelector('#menuImageUploadStatus');
    if (!status) return;
    status.textContent = message || '';
    status.className = 'menu-image-upload-status';
    if (type === 'success') status.classList.add('is-success');
    else if (type === 'error') status.classList.add('is-error');
    else if (type === 'muted') status.classList.add('is-muted');
  }

  function setUploadBusy(modal, busy) {
    const overlay = modal.querySelector('#menuImageUploadBusy');
    const throbber = modal.querySelector('#menuImageUploadThrobber');
    const changeBtn = modal.querySelector('#menuImageUploadChange');
    const submitBtn = modal.querySelector('#menuImageUploadSubmit');
    if (overlay) overlay.classList.toggle('is-hidden', !busy);
    if (throbber) throbber.classList.toggle('is-hidden', !busy);
    if (changeBtn) changeBtn.disabled = !!busy;
    if (submitBtn) {
      if (busy) {
        if (!submitBtn.dataset.defaultLabel) {
          submitBtn.dataset.defaultLabel = submitBtn.textContent.trim();
        }
        submitBtn.disabled = true;
        submitBtn.innerHTML =
          '<span class="menu-image-upload-throbber menu-image-upload-throbber--inline" aria-hidden="true"></span> Uploading…';
      } else if (submitBtn.dataset.defaultLabel) {
        submitBtn.textContent = submitBtn.dataset.defaultLabel;
      }
    }
    modal.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  function setUploadProgress(modal, percent, label) {
    const wrap = modal.querySelector('#menuImageUploadProgress');
    const fill = modal.querySelector('.menu-image-upload-progress__fill');
    const text = modal.querySelector('.menu-image-upload-progress__text');
    if (!wrap || !fill || !text) return;
    const pct = Math.max(0, Math.min(100, Math.round(percent)));
    wrap.classList.remove('is-hidden');
    fill.style.width = pct + '%';
    text.textContent = label || ('Uploading… ' + pct + '%');
  }

  function hideUploadProgress(modal) {
    const wrap = modal.querySelector('#menuImageUploadProgress');
    const fill = modal.querySelector('.menu-image-upload-progress__fill');
    const text = modal.querySelector('.menu-image-upload-progress__text');
    if (wrap) wrap.classList.add('is-hidden');
    if (fill) fill.style.width = '0%';
    if (text) text.textContent = 'Uploading… 0%';
    setUploadBusy(modal, false);
  }

  function showFilePreview(modal, file) {
    const preview = modal.querySelector('#menuImageUploadPreview');
    const picker = modal.querySelector('#menuImageUploadPicker');
    const img = modal.querySelector('#menuImagePreviewImg');
    const nameEl = modal.querySelector('#menuImagePreviewName');
    const sizeEl = modal.querySelector('#menuImagePreviewSize');
    const submitBtn = modal.querySelector('#menuImageUploadSubmit');
    if (!preview || !picker || !img || !file) return;

    revokeUploadPreviewUrl();
    uploadPreviewObjectUrl = URL.createObjectURL(file);
    img.src = uploadPreviewObjectUrl;
    if (nameEl) nameEl.textContent = file.name || 'Selected photo';
    if (sizeEl) sizeEl.textContent = formatFileSize(file.size);
    modal._selectedUploadFile = file;
    preview.classList.remove('is-hidden');
    picker.classList.add('is-hidden');
    if (submitBtn) submitBtn.disabled = false;
    setUploadStatus(modal, 'Ready to upload. An admin will review before it goes live.', 'muted');
    hideUploadProgress(modal);
  }

  function clearFilePreview(modal) {
    const preview = modal.querySelector('#menuImageUploadPreview');
    const picker = modal.querySelector('#menuImageUploadPicker');
    const img = modal.querySelector('#menuImagePreviewImg');
    const cameraInput = modal.querySelector('#menuImageFileInputCamera');
    const galleryInput = modal.querySelector('#menuImageFileInputGallery');
    const submitBtn = modal.querySelector('#menuImageUploadSubmit');
    revokeUploadPreviewUrl();
    modal._selectedUploadFile = null;
    if (img) img.removeAttribute('src');
    if (preview) preview.classList.add('is-hidden');
    if (picker) picker.classList.remove('is-hidden');
    if (cameraInput) cameraInput.value = '';
    if (galleryInput) galleryInput.value = '';
    if (submitBtn) submitBtn.disabled = true;
    hideUploadProgress(modal);
    setUploadStatus(modal, '', '');
  }

  function closeUploadModal(modal) {
    if (!modal) return;
    modal.classList.remove('is-open');
    clearFilePreview(modal);
  }

  function resetUploadModal(modal, clientId, menuItemPath) {
    modal.dataset.clientId = clientId;
    modal.dataset.menuItemPath = menuItemPath;
    clearFilePreview(modal);
    setUploadStatus(modal, 'Your photo will be reviewed before it appears on the menu.', 'muted');
  }

  function bindUploadModal(modal) {
    if (modal.dataset.uploadBound === '1') return;
    modal.dataset.uploadBound = '1';

    const cameraInput = modal.querySelector('#menuImageFileInputCamera');
    const galleryInput = modal.querySelector('#menuImageFileInputGallery');
    const takePhotoBtn = modal.querySelector('#menuImageTakePhoto');
    const chooseGalleryBtn = modal.querySelector('#menuImageChooseGallery');
    const changeBtn = modal.querySelector('#menuImageUploadChange');
    const cancelBtn = modal.querySelector('#menuImageUploadCancel');
    const closeBtn = modal.querySelector('#menuImageUploadClose');
    const submitBtn = modal.querySelector('#menuImageUploadSubmit');

    function onFileChosen(ev) {
      const input = ev.target;
      if (!input || !input.files || !input.files[0]) return;
      const file = input.files[0];
      if (!isAllowedImageFile(file)) {
        setUploadStatus(modal, 'Please use a JPEG, PNG, or WebP photo.', 'error');
        input.value = '';
        return;
      }
      showFilePreview(modal, file);
    }

    if (cameraInput) cameraInput.addEventListener('change', onFileChosen);
    if (galleryInput) galleryInput.addEventListener('change', onFileChosen);
    if (takePhotoBtn && cameraInput) {
      takePhotoBtn.addEventListener('click', function (e) {
        e.preventDefault();
        cameraInput.click();
      });
    }
    if (chooseGalleryBtn && galleryInput) {
      chooseGalleryBtn.addEventListener('click', function (e) {
        e.preventDefault();
        galleryInput.click();
      });
    }
    if (changeBtn) {
      changeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        clearFilePreview(modal);
        setUploadStatus(modal, 'Take a new photo or choose from your gallery.', 'muted');
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        closeUploadModal(modal);
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        closeUploadModal(modal);
      });
    }
    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        doUpload(modal);
      });
    }
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeUploadModal(modal);
    });
  }

  function ensureUploadBusyUi(modal) {
    const preview = modal.querySelector('#menuImageUploadPreview');
    if (preview && !modal.querySelector('#menuImageUploadBusy')) {
      const busy = document.createElement('div');
      busy.id = 'menuImageUploadBusy';
      busy.className = 'menu-image-upload-preview__busy is-hidden';
      busy.setAttribute('aria-hidden', 'true');
      busy.innerHTML =
        '<span class="menu-image-upload-throbber" aria-label="Uploading"></span>';
      preview.appendChild(busy);
    }

    const progressLabel = modal.querySelector('.menu-image-upload-progress__label');
    if (progressLabel && !modal.querySelector('#menuImageUploadThrobber')) {
      const throbber = document.createElement('span');
      throbber.id = 'menuImageUploadThrobber';
      throbber.className = 'menu-image-upload-throbber menu-image-upload-throbber--inline is-hidden';
      throbber.setAttribute('aria-hidden', 'true');
      const text = progressLabel.querySelector('.menu-image-upload-progress__text');
      if (text) {
        progressLabel.insertBefore(throbber, text);
      } else {
        const labelText = progressLabel.textContent;
        progressLabel.textContent = '';
        progressLabel.appendChild(throbber);
        const textEl = document.createElement('span');
        textEl.className = 'menu-image-upload-progress__text';
        textEl.textContent = labelText || 'Uploading… 0%';
        progressLabel.appendChild(textEl);
      }
    }
  }

  function ensureUploadModal() {
    let modal = document.getElementById('menuImageUploadModal');
    if (modal && !modal.querySelector('#menuImageTakePhoto')) {
      modal.remove();
      modal = null;
    }
    if (modal) {
      ensureUploadBusyUi(modal);
      return modal;
    }

    modal = document.createElement('div');
    modal.id = 'menuImageUploadModal';
    modal.className = 'menu-image-upload-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'menuImageUploadTitle');
    modal.innerHTML =
      '<div class="menu-image-upload-dialog">' +
      '<button type="button" class="menu-image-upload-close" id="menuImageUploadClose" aria-label="Close">×</button>' +
      '<h3 class="menu-image-upload-title" id="menuImageUploadTitle">Add photo for this item</h3>' +
      '<p class="menu-image-upload-hint">Share a real photo of this dish. It won&apos;t show on the menu until an admin approves it.</p>' +
      '<div class="menu-image-upload-preview is-hidden" id="menuImageUploadPreview">' +
      '<img class="menu-image-upload-preview__img" id="menuImagePreviewImg" alt="Photo preview">' +
      '<div class="menu-image-upload-preview__busy is-hidden" id="menuImageUploadBusy" aria-hidden="true">' +
      '<span class="menu-image-upload-throbber" aria-label="Uploading"></span></div>' +
      '<div class="menu-image-upload-preview__meta">' +
      '<span class="menu-image-upload-preview__name" id="menuImagePreviewName"></span>' +
      '<span class="menu-image-upload-preview__size" id="menuImagePreviewSize"></span>' +
      '<button type="button" class="menu-image-upload-change" id="menuImageUploadChange">Change</button>' +
      '</div></div>' +
      '<div class="menu-image-upload-picker" id="menuImageUploadPicker">' +
      '<div class="menu-image-upload-source-btns">' +
      '<button type="button" class="menu-image-upload-source menu-image-upload-source--camera" id="menuImageTakePhoto">' +
      '<i class="fa fa-camera" aria-hidden="true"></i><span>Take photo</span></button>' +
      '<button type="button" class="menu-image-upload-source menu-image-upload-source--gallery" id="menuImageChooseGallery">' +
      '<i class="fa fa-image" aria-hidden="true"></i><span>Gallery</span></button>' +
      '</div>' +
      '<input type="file" class="menu-image-upload-picker__input" id="menuImageFileInputCamera" accept="image/jpeg,image/png,image/webp" capture="environment">' +
      '<input type="file" class="menu-image-upload-picker__input" id="menuImageFileInputGallery" accept="image/jpeg,image/png,image/webp">' +
      '<span class="menu-image-upload-picker__hint">On your phone, Take photo opens the camera · JPEG, PNG, or WebP</span>' +
      '</div>' +
      '<div class="menu-image-upload-progress is-hidden" id="menuImageUploadProgress">' +
      '<div class="menu-image-upload-progress__track"><div class="menu-image-upload-progress__fill"></div></div>' +
      '<span class="menu-image-upload-progress__label">' +
      '<span class="menu-image-upload-throbber menu-image-upload-throbber--inline is-hidden" id="menuImageUploadThrobber" aria-hidden="true"></span>' +
      '<span class="menu-image-upload-progress__text">Uploading… 0%</span></span>' +
      '</div>' +
      '<div class="menu-image-upload-status is-muted" id="menuImageUploadStatus"></div>' +
      '<div class="menu-image-upload-actions">' +
      '<button type="button" class="menu-image-upload-btn menu-image-upload-btn--cancel" id="menuImageUploadCancel">Cancel</button>' +
      '<button type="button" class="menu-image-upload-btn menu-image-upload-btn--submit" id="menuImageUploadSubmit" disabled>Upload photo</button>' +
      '</div></div>';

    document.body.appendChild(modal);
    bindUploadModal(modal);
    return modal;
  }

  function uploadWithProgress(url, formData, token, onProgress) {
    return new Promise(function (resolve, reject) {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.upload.addEventListener('progress', function (e) {
        if (e.lengthComputable && onProgress) {
          onProgress(e.loaded / e.total);
        }
      });
      xhr.addEventListener('load', function () {
        let json = {};
        try {
          json = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        } catch (err) {
          json = {};
        }
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json: json });
      });
      xhr.addEventListener('error', function () {
        reject(new Error('Network error'));
      });
      xhr.addEventListener('abort', function () {
        reject(new Error('Upload cancelled'));
      });
      xhr.send(formData);
    });
  }

  function openUploadModal(clientId, menuItemPath) {
    if (!isLoggedIn()) {
      promptLoginForUpload();
      return;
    }
    const modal = ensureUploadModal();
    document.body.appendChild(modal);
    resetUploadModal(modal, clientId, menuItemPath);
    modal.classList.add('is-open');
  }

  async function doUpload(modal) {
    const file = modal._selectedUploadFile;
    const submitBtn = modal.querySelector('#menuImageUploadSubmit');
    const cancelBtn = modal.querySelector('#menuImageUploadCancel');

    if (!file) {
      setUploadStatus(modal, 'Take a photo or choose one from your gallery first.', 'error');
      return;
    }

    const token = getToken();
    if (!token) {
      setUploadStatus(modal, 'Please log in to upload.', 'error');
      return;
    }

    const form = new FormData();
    form.append('client_id', modal.dataset.clientId);
    form.append('menu_item_path', modal.dataset.menuItemPath);
    form.append('image', file);

    if (cancelBtn) cancelBtn.disabled = true;
    setUploadBusy(modal, true);
    setUploadProgress(modal, 0, 'Uploading… 0%');
    setUploadStatus(modal, '', '');

    try {
      const result = await uploadWithProgress(
        CONFIG.apiUrl + '/menu-images',
        form,
        token,
        function (ratio) {
          setUploadProgress(modal, ratio * 100);
        }
      );
      if (result.ok && result.json.success) {
        setUploadBusy(modal, false);
        setUploadProgress(modal, 100, 'Upload complete');
        setUploadStatus(modal, 'Submitted! An admin will approve it soon.', 'success');
        setTimeout(function () {
          closeUploadModal(modal);
        }, 2200);
      } else {
        hideUploadProgress(modal);
        setUploadStatus(modal, result.json.error || 'Upload failed. Please try again.', 'error');
        if (submitBtn) submitBtn.disabled = false;
      }
    } catch (e) {
      hideUploadProgress(modal);
      setUploadStatus(modal, 'Network error. Please try again.', 'error');
      if (submitBtn) submitBtn.disabled = false;
    } finally {
      if (cancelBtn) cancelBtn.disabled = false;
    }
  }

  window.initMenuImageIntegration = function (root) {
    if (root && root.matches && root.matches('[data-menu-item-path][data-menu-image-client-id]')) {
      initMenuImageHostFromExpand(root);
      return;
    }
    initPageMenuImages(root);
  };

  window.refreshMenuItemImages = function (host) {
    if (!host) return Promise.resolve();
    const clientId = hostClientId(host);
    const pathForApi = hostPathForApi(host);
    invalidateApprovedImagesCache(clientId, pathForApi);
    return loadMenuImagesForHost(host);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initPageMenuImages();
    });
  } else {
    initPageMenuImages();
  }

  function registerBarbaMenuImages() {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(function () {
        initPageMenuImages();
      });
    }
  }

  if (window.TTMSBarba) {
    registerBarbaMenuImages();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerBarbaMenuImages);
  } else {
    registerBarbaMenuImages();
  }

  document.addEventListener('ttms:page-enter', function () {
    initPageMenuImages();
  });

  function initAdminRemoveAuthWatch() {
    const refresh = function () {
      refreshAdminRemoveButtons(document);
    };
    if (typeof AuthClient !== 'undefined' && AuthClient.whenReady) {
      AuthClient.whenReady().then(refresh);
    }
    document.addEventListener('auth:login', refresh);
    document.addEventListener('auth:logout', refresh);
  }

  initAdminRemoveAuthWatch();

  document.addEventListener('auth:login', function () {
    approvedImagesCache.clear();
    document.querySelectorAll('[data-menu-item-path][data-menu-image-client-id]').forEach(function (host) {
      if (shouldAutoInitHost(host)) {
        refreshAdminRemoveButtons(host);
        loadMenuImagesForHost(host);
      }
    });
  });

  function promptLoginForUpload() {
    if (typeof window.confirm !== 'function') {
      return;
    }
    var goLogin = window.confirm(
      'You need a TT Menus account to add photos.\n\nWould you like to go to the login page?'
    );
    if (!goLogin) {
      return;
    }
    try {
      sessionStorage.setItem('ttmenus_redirect_after_login', window.location.pathname);
    } catch (err) {
      /* ignore */
    }
    window.location.href = '/login/';
  }

  function onAddPhotoClick(e) {
    var btn = e.target.closest('.menu-add-photo-btn, .menu-image-add-btn');
    if (!btn) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    var ctx = resolveAddPhotoContext(btn);
    if (!ctx) {
      return;
    }
    if (!isLoggedIn()) {
      promptLoginForUpload();
      return;
    }
    openUploadModal(ctx.clientId, ctx.path);
  }

  document.addEventListener('click', onAddPhotoClick, true);

  window.openMenuImageUploadModal = openUploadModal;
})();
