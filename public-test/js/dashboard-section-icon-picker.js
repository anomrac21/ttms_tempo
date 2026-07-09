/**
 * Section icon / image picker — CDN icon library + site image paths.
 * Supports multiple bound inputs (section icon + section secondary image).
 */
(function (global) {
  'use strict';

  var ICON_CDN_BASE = 'https://cdn.ttmenus.com/icons';
  var ICON_CATEGORY_ORDER = ['activities', 'business', 'drink', 'food', 'socialmedia', 'ui', 'white'];
  var SEARCH_DEBOUNCE_MS = 160;
  var ICONS_PAGE_SIZE = 24;

  var shared = {
    iconsAll: [],
    categories: ICON_CATEGORY_ORDER.slice(),
    loadPromise: null,
    loadFailed: false,
    manifestSource: '',
    instances: [],
  };

  function iconManifestUrl() {
    if (global.CDN_CONFIG && typeof global.CDN_CONFIG.getIconsApiUrl === 'function') {
      return global.CDN_CONFIG.getIconsApiUrl();
    }
    return 'https://cdn.ttmenus.com/api/list-icons/index.json';
  }

  function normalizeUrl(url) {
    return String(url || '').trim();
  }

  function isCdnIconLibraryUrl(url) {
    var u = normalizeUrl(url);
    if (!u) return false;
    if (u.indexOf(ICON_CDN_BASE) === 0) return true;
    if (u.indexOf('/icons/') >= 0 && (u.indexOf('cdn.ttmenus.com') >= 0 || u.indexOf('ct.ttmenus.com') >= 0)) {
      return true;
    }
    return false;
  }

  function resolveSiteImagePreviewUrl(path) {
    var p = normalizeUrl(path);
    if (!p) return '';
    if (global.DashboardEditImagePreview && typeof global.DashboardEditImagePreview.resolve === 'function') {
      return global.DashboardEditImagePreview.resolve(p);
    }
    if (p.indexOf('http://') === 0 || p.indexOf('https://') === 0) return p;
    return p.indexOf('/') === 0 ? p : '/' + p;
  }

  function normalizeIconCdnUrl(url) {
    var u = normalizeUrl(url);
    if (!u) return u;
    return u
      .replace(/^https?:\/\/ct\.ttmenus\.com\/icons\//i, ICON_CDN_BASE + '/')
      .replace(/^\/\/ct\.ttmenus\.com\/icons\//i, ICON_CDN_BASE + '/');
  }

  function normalizeManifestIcon(icon) {
    if (!icon || typeof icon !== 'object') return icon;
    return {
      url: normalizeIconCdnUrl(icon.url),
      category: icon.category,
      name: icon.name,
      filename: icon.filename,
      format: icon.format,
    };
  }

  function normalizeManifest(data) {
    if (!data || !Array.isArray(data.icons)) return data;
    return {
      success: data.success,
      count: data.count,
      categories: data.categories,
      baseUrl: data.baseUrl || ICON_CDN_BASE,
      icons: data.icons.map(normalizeManifestIcon),
    };
  }

  function iconFilename(url) {
    var u = normalizeUrl(url);
    if (!u) return '';
    var parts = u.split('/');
    return (parts[parts.length - 1] || '').toLowerCase();
  }

  function iconUrlsMatch(a, b) {
    a = normalizeUrl(a);
    b = normalizeUrl(b);
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a === b) return true;
    var fa = iconFilename(a);
    var fb = iconFilename(b);
    return !!(fa && fb && fa === fb);
  }

  function findIconByUrl(url) {
    var u = normalizeUrl(url);
    if (!u) return null;
    for (var i = 0; i < shared.iconsAll.length; i++) {
      if (iconUrlsMatch(shared.iconsAll[i].url, u)) return shared.iconsAll[i];
    }
    return null;
  }

  function findAlternateIconUrl(filename, failedUrl) {
    var fn = String(filename || iconFilename(failedUrl)).toLowerCase();
    if (!fn) return '';
    var failed = normalizeUrl(failedUrl);
    for (var i = 0; i < shared.iconsAll.length; i++) {
      var icon = shared.iconsAll[i];
      var iconFn = String(icon.filename || iconFilename(icon.url)).toLowerCase();
      if (iconFn !== fn || normalizeUrl(icon.url) === failed) continue;
      return icon.url;
    }
    return '';
  }

  function wireIconImage(img, url, filename, onResolved) {
    if (!img) return;
    var tried = [];
    function tryUrl(nextUrl) {
      var u = normalizeUrl(nextUrl);
      if (!u || tried.indexOf(u) >= 0) {
        if (typeof onResolved === 'function') onResolved(null);
        return;
      }
      tried.push(u);
      img.onload = function () {
        img.onerror = null;
        if (typeof onResolved === 'function') onResolved(u);
      };
      img.onerror = function () {
        var alt = findAlternateIconUrl(filename, u);
        if (alt) tryUrl(alt);
        else if (typeof onResolved === 'function') onResolved(null);
      };
      img.src = u;
    }
    tryUrl(url);
  }

  function capitalizeCategory(c) {
    if (!c) return c;
    return c.charAt(0).toUpperCase() + c.slice(1);
  }

  function sortCategories(list) {
    var out = [];
    for (var i = 0; i < ICON_CATEGORY_ORDER.length; i++) {
      if (list.indexOf(ICON_CATEGORY_ORDER[i]) >= 0) out.push(ICON_CATEGORY_ORDER[i]);
    }
    for (var j = 0; j < list.length; j++) {
      if (out.indexOf(list[j]) < 0) out.push(list[j]);
    }
    return out;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  function createSectionIconPickerInstance(cfg) {
    cfg = cfg || {};
    var ids = {
      input: cfg.inputId || 'dashboardEditSectionIcon',
      search: cfg.searchId || 'dashboardSectionIconSearch',
      tabs: cfg.tabsId || 'dashboardSectionIconCategoryTabs',
      grid: cfg.gridId || 'dashboardSectionIconGrid',
      pager: cfg.pagerId || 'dashboardSectionIconPager',
      pagerPrev: cfg.pagerPrevId || 'dashboardSectionIconPagerPrev',
      pagerNext: cfg.pagerNextId || 'dashboardSectionIconPagerNext',
      pagerLabel: cfg.pagerLabelId || 'dashboardSectionIconPagerLabel',
      status: cfg.statusId || 'dashboardSectionIconStatus',
      previewWrap: cfg.previewWrapId || 'dashboardSectionIconSelectedPreview',
      previewImg: cfg.previewImgId || 'dashboardSectionIconPreviewImg',
      selectedLabel: cfg.selectedLabelId || 'dashboardSectionIconSelectedLabel',
    };

    var iconsFiltered = [];
    var iconsPage = [];
    var activeCategory = ICON_CATEGORY_ORDER[0];
    var iconPageIndex = 0;
    var searchTimer = null;
    var eventsBound = false;

    var inputUrl;
    var inputSearch;
    var tabsEl;
    var gridEl;
    var pagerEl;
    var pagerPrev;
    var pagerNext;
    var pagerLabel;
    var statusEl;
    var previewWrap;
    var previewImg;
    var selectedLabel;

    function bind() {
      inputUrl = document.getElementById(ids.input);
      inputSearch = document.getElementById(ids.search);
      tabsEl = document.getElementById(ids.tabs);
      gridEl = document.getElementById(ids.grid);
      pagerEl = document.getElementById(ids.pager);
      pagerPrev = document.getElementById(ids.pagerPrev);
      pagerNext = document.getElementById(ids.pagerNext);
      pagerLabel = document.getElementById(ids.pagerLabel);
      statusEl = document.getElementById(ids.status);
      previewWrap = document.getElementById(ids.previewWrap);
      previewImg = document.getElementById(ids.previewImg);
      selectedLabel = document.getElementById(ids.selectedLabel);
      if (!tabsEl && !gridEl) return false;
      bindEvents();
      if (tabsEl && !tabsEl.childElementCount) renderCategoryTabs();
      return true;
    }

    function setStatus(text) {
      if (statusEl) statusEl.textContent = text || '';
    }

    function iconsExcludingSelected(icons, selectedUrl) {
      if (!selectedUrl) return icons.slice();
      return icons.filter(function (icon) {
        return !iconUrlsMatch(icon.url, selectedUrl);
      });
    }

    function getTotalPages(count) {
      if (!count) return 0;
      return Math.ceil(count / ICONS_PAGE_SIZE);
    }

    function hideBrokenGridOption(btn) {
      if (!btn || btn.classList.contains('dashboard-section-icon-option--broken')) return;
      btn.classList.add('dashboard-section-icon-option--broken');
      btn.setAttribute('hidden', 'hidden');
      btn.setAttribute('aria-hidden', 'true');
      updateGridStatus();
    }

    function updateGridStatus() {
      if (!statusEl) return;
      var total = iconsFiltered.length;
      var pages = getTotalPages(total);
      var visible = gridEl
        ? gridEl.querySelectorAll('.dashboard-section-icon-option:not(.dashboard-section-icon-option--broken):not([hidden])').length
        : iconsPage.length;
      var current = normalizeUrl(inputUrl ? inputUrl.value : '');
      var selectedNote = current && findIconByUrl(current) ? ' · selected shown above' : '';
      if (!total) {
        setStatus('0 icons');
        return;
      }
      if (pages > 1) {
        setStatus(
          visible +
            ' on page ' +
            (iconPageIndex + 1) +
            ' of ' +
            pages +
            ' · ' +
            total +
            ' in ' +
            capitalizeCategory(activeCategory) +
            selectedNote
        );
        return;
      }
      setStatus(total + ' in ' + capitalizeCategory(activeCategory) + selectedNote);
    }

    function renderPager() {
      if (!pagerEl) return;
      var total = iconsFiltered.length;
      var pages = getTotalPages(total);
      if (pages <= 1) {
        pagerEl.classList.add('hidden');
        return;
      }
      pagerEl.classList.remove('hidden');
      if (pagerLabel) pagerLabel.textContent = 'Page ' + (iconPageIndex + 1) + ' of ' + pages;
      if (pagerPrev) pagerPrev.disabled = iconPageIndex <= 0;
      if (pagerNext) pagerNext.disabled = iconPageIndex >= pages - 1;
    }

    function wireGridImages() {
      if (!gridEl) return;
      var buttons = gridEl.querySelectorAll('.dashboard-section-icon-option');
      for (var i = 0; i < buttons.length; i++) {
        (function (btn) {
          var img = btn.querySelector('img');
          if (!img) return;
          var url = btn.getAttribute('data-icon-url') || img.getAttribute('src') || '';
          var filename = iconFilename(url);
          wireIconImage(img, url, filename, function (resolved) {
            if (!resolved) {
              hideBrokenGridOption(btn);
              return;
            }
            if (resolved !== url) {
              btn.setAttribute('data-icon-url', resolved);
              img.src = resolved;
              var current = normalizeUrl(inputUrl ? inputUrl.value : '');
              if (current && iconUrlsMatch(url, current)) {
                inputUrl.value = resolved;
                dispatchUrlInput();
              }
            }
          });
        })(buttons[i]);
      }
    }

    function resolveDisplayUrl(url) {
      var match = findIconByUrl(url);
      if (match) return match.url;
      if (!isCdnIconLibraryUrl(url)) return resolveSiteImagePreviewUrl(url);
      return normalizeIconCdnUrl(normalizeUrl(url));
    }

    function showCdnUnavailableMessage() {
      var url = iconManifestUrl();
      if (gridEl) {
        gridEl.innerHTML =
          '<p class="dashboard-section-icon-grid-empty">The icon library is unavailable from the CDN. Check your connection and try again later.<br><a href="' +
          escapeAttr(url) +
          '" target="_blank" rel="noopener">cdn.ttmenus.com</a></p>';
      }
      setStatus('Icon library unavailable');
      if (pagerEl) pagerEl.classList.add('hidden');
    }

    function updateSelectedUi() {
      bind();
      var url = normalizeUrl(inputUrl ? inputUrl.value : '');
      var has = !!url;
      var displayUrl = has ? resolveDisplayUrl(url) : '';
      if (previewWrap) {
        previewWrap.classList.toggle('dashboard-section-icon-selected-preview--empty', !has);
        previewWrap.setAttribute('aria-hidden', has ? 'false' : 'true');
      }
      if (previewImg) {
        if (has && displayUrl) {
          previewImg.alt = '';
          if (isCdnIconLibraryUrl(url)) {
            wireIconImage(previewImg, displayUrl, iconFilename(url), function (resolved) {
              if (!resolved) {
                previewImg.removeAttribute('src');
                if (selectedLabel) selectedLabel.textContent = 'Icon unavailable on CDN';
              }
            });
          } else {
            previewImg.src = displayUrl;
            previewImg.onerror = function () {
              previewImg.removeAttribute('src');
              if (selectedLabel) selectedLabel.textContent = 'Image preview unavailable';
            };
          }
        } else {
          previewImg.removeAttribute('src');
          previewImg.alt = '';
        }
      }
      if (selectedLabel) {
        if (!has) {
          selectedLabel.textContent = 'Select an icon below or add your own image';
        } else if (
          selectedLabel.textContent !== 'Icon unavailable on CDN' &&
          selectedLabel.textContent !== 'Image preview unavailable'
        ) {
          var match = findIconByUrl(url);
          selectedLabel.textContent = match ? match.name + ' (' + match.category + ')' : url;
        }
      }
      if (gridEl && shared.iconsAll.length) {
        var buttons = gridEl.querySelectorAll('.dashboard-section-icon-option');
        for (var b = 0; b < buttons.length; b++) {
          var btn = buttons[b];
          var btnUrl = btn.getAttribute('data-icon-url') || '';
          var on = has && iconUrlsMatch(btnUrl, url);
          btn.classList.toggle('dashboard-section-icon-option--selected', on);
          btn.setAttribute('aria-selected', on ? 'true' : 'false');
        }
      }
      if (window.DashboardEditFieldPrompts && typeof window.DashboardEditFieldPrompts.refresh === 'function') {
        window.DashboardEditFieldPrompts.refresh();
      }
    }

    function dispatchUrlInput() {
      if (!inputUrl) return;
      inputUrl.dispatchEvent(new Event('input', { bubbles: true }));
      inputUrl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function selectIcon(url) {
      if (!inputUrl) return;
      var normalized = normalizeIconCdnUrl(normalizeUrl(url));
      var match = findIconByUrl(normalized);
      inputUrl.value = match ? match.url : normalized;
      if (match && match.category) {
        activeCategory = match.category;
        renderCategoryTabs();
      }
      updateSelectedUi();
      applyFilters(true);
      dispatchUrlInput();
    }

    function syncFromInput() {
      bind();
      var raw = normalizeUrl(inputUrl ? inputUrl.value : '');
      if (raw && inputUrl && isCdnIconLibraryUrl(raw)) {
        raw = normalizeIconCdnUrl(raw);
        if (raw !== inputUrl.value) inputUrl.value = raw;
        var match = findIconByUrl(raw);
        if (match) {
          if (match.url !== raw) inputUrl.value = match.url;
          activeCategory = match.category || activeCategory;
        } else if (raw.indexOf('/icons/') >= 0) {
          var parts = raw.split('/icons/');
          if (parts[1]) activeCategory = parts[1].split('/')[0] || activeCategory;
        }
        renderCategoryTabs();
      }
      updateSelectedUi();
      if (shared.iconsAll.length) applyFilters(true);
    }

    function renderCategoryTabs() {
      if (!tabsEl) return;
      var cats = shared.categories.length ? shared.categories : ICON_CATEGORY_ORDER.slice();
      var html = '';
      for (var i = 0; i < cats.length; i++) {
        var cat = cats[i];
        var count = 0;
        for (var k = 0; k < shared.iconsAll.length; k++) {
          if (shared.iconsAll[k].category === cat) count++;
        }
        var on = cat === activeCategory;
        html +=
          '<button type="button" class="dashboard-section-icon-category-tab' +
          (on ? ' dashboard-section-icon-category-tab-active' : '') +
          '" role="tab" data-icon-category="' +
          escapeAttr(cat) +
          '" aria-selected="' +
          (on ? 'true' : 'false') +
          '" aria-controls="' +
          escapeAttr(ids.grid) +
          '">' +
          escapeHtml(capitalizeCategory(cat)) +
          (shared.iconsAll.length ? ' <span class="dashboard-section-icon-category-count">' + count + '</span>' : '') +
          '</button>';
      }
      tabsEl.innerHTML = html;
    }

    function setIconPage(index, scrollGrid) {
      var total = getTotalPages(iconsFiltered.length);
      if (!total) {
        iconPageIndex = 0;
      } else {
        iconPageIndex = Math.max(0, Math.min(index, total - 1));
      }
      var start = iconPageIndex * ICONS_PAGE_SIZE;
      iconsPage = iconsFiltered.slice(start, start + ICONS_PAGE_SIZE);
      renderGridPage(scrollGrid);
      renderPager();
    }

    function applyFilters(scrollToSelected) {
      var q = inputSearch ? String(inputSearch.value || '').trim().toLowerCase() : '';
      var cat = activeCategory || '';
      var matched = shared.iconsAll.filter(function (icon) {
        if (cat && icon.category !== cat) return false;
        if (q && iconSearchHaystack(icon).indexOf(q) === -1) return false;
        return true;
      });
      var current = normalizeUrl(inputUrl ? inputUrl.value : '');
      iconsFiltered = iconsExcludingSelected(matched, current);
      setIconPage(0, scrollToSelected);
    }

    function iconSearchHaystack(icon) {
      return [icon.name, icon.filename, icon.category, icon.url].join(' ').toLowerCase();
    }

    function renderGridPage(scrollToTop) {
      if (!gridEl) return;
      if (!shared.iconsAll.length) {
        if (shared.loadFailed) {
          showCdnUnavailableMessage();
        } else {
          gridEl.innerHTML = '<p class="dashboard-section-icon-grid-empty">Loading icons from CDN…</p>';
        }
        if (pagerEl) pagerEl.classList.add('hidden');
        return;
      }
      if (!iconsFiltered.length) {
        var current = normalizeUrl(inputUrl ? inputUrl.value : '');
        if (current && findIconByUrl(current)) {
          gridEl.innerHTML =
            '<p class="dashboard-section-icon-grid-empty">Selected icon is shown above. No other icons match' +
            (inputSearch && inputSearch.value.trim() ? ' your search' : '') +
            ' in this category.</p>';
        } else {
          gridEl.innerHTML =
            '<p class="dashboard-section-icon-grid-empty">No icons in this category' +
            (inputSearch && inputSearch.value.trim() ? ' match your search' : '') +
            '.</p>';
        }
        if (pagerEl) pagerEl.classList.add('hidden');
        updateGridStatus();
        return;
      }
      var html = '';
      var selectedUrl = normalizeUrl(inputUrl ? inputUrl.value : '');
      for (var i = 0; i < iconsPage.length; i++) {
        var icon = iconsPage[i];
        var isSelected = selectedUrl && iconUrlsMatch(icon.url, selectedUrl);
        html +=
          '<button type="button" class="dashboard-section-icon-option' +
          (isSelected ? ' dashboard-section-icon-option--selected' : '') +
          '" role="option" data-icon-url="' +
          escapeAttr(icon.url) +
          '" aria-selected="' +
          (isSelected ? 'true' : 'false') +
          '" title="' +
          escapeAttr(icon.name + ' · ' + icon.category) +
          '">' +
          '<img src="' +
          escapeAttr(icon.url) +
          '" alt="" width="40" height="40" loading="lazy" decoding="async">' +
          '<span class="dashboard-section-icon-option-name">' +
          escapeHtml(icon.name) +
          '</span>' +
          '</button>';
      }
      gridEl.innerHTML = html;
      wireGridImages();
      updateGridStatus();
      if (scrollToTop) gridEl.scrollTop = 0;
    }

    function onSharedManifestLoaded() {
      if (shared.categories.indexOf(activeCategory) < 0) {
        activeCategory = shared.categories[0] || ICON_CATEGORY_ORDER[0];
      }
      renderCategoryTabs();
      applyFilters(true);
      syncFromInput();
    }

    function scheduleFilter() {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        searchTimer = null;
        applyFilters(false);
      }, SEARCH_DEBOUNCE_MS);
    }

    function bindEvents() {
      if (eventsBound) return;
      eventsBound = true;
      if (tabsEl) {
        tabsEl.addEventListener('click', function (e) {
          var tab = e.target && e.target.closest ? e.target.closest('[data-icon-category]') : null;
          if (!tab) return;
          activeCategory = tab.getAttribute('data-icon-category') || activeCategory;
          renderCategoryTabs();
          applyFilters(true);
        });
      }
      if (gridEl) {
        gridEl.addEventListener('click', function (e) {
          var btn = e.target && e.target.closest ? e.target.closest('.dashboard-section-icon-option') : null;
          if (!btn) return;
          selectIcon(btn.getAttribute('data-icon-url') || '');
        });
      }
      if (inputSearch) {
        inputSearch.addEventListener('input', scheduleFilter);
      }
      if (pagerPrev) {
        pagerPrev.addEventListener('click', function () {
          setIconPage(iconPageIndex - 1, true);
        });
      }
      if (pagerNext) {
        pagerNext.addEventListener('click', function () {
          setIconPage(iconPageIndex + 1, true);
        });
      }
    }

    function init() {
      try {
        bind();
        loadSharedIcons(false);
      } catch (err) {
        shared.loadFailed = true;
        bind();
        showCdnUnavailableMessage();
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[Section icon picker] init failed', err);
        }
      }
    }

    function ensureLoaded() {
      bind();
      if (shared.iconsAll.length) {
        renderCategoryTabs();
        applyFilters(false);
        syncFromInput();
        return Promise.resolve();
      }
      return loadSharedIcons(shared.loadFailed).then(function () {
        syncFromInput();
      });
    }

    return {
      init: init,
      ensureLoaded: ensureLoaded,
      syncFromInput: syncFromInput,
      onSharedManifestLoaded: onSharedManifestLoaded,
    };
  }

  function applySharedManifest(data, source) {
    shared.loadFailed = false;
    shared.manifestSource = source || shared.manifestSource;
    data = normalizeManifest(data);
    var list = data && Array.isArray(data.icons) ? data.icons : [];
    shared.iconsAll = list
      .filter(function (icon) {
        return icon && icon.url;
      })
      .slice()
      .sort(function (a, b) {
        return ((a.category || '') + (a.name || '')).localeCompare((b.category || '') + (b.name || ''));
      });
    var cats = data && Array.isArray(data.categories) ? data.categories.slice() : [];
    if (!cats.length) {
      var seen = {};
      shared.iconsAll.forEach(function (icon) {
        if (icon.category && !seen[icon.category]) {
          seen[icon.category] = true;
          cats.push(icon.category);
        }
      });
    }
    shared.categories = sortCategories(cats.length ? cats : ICON_CATEGORY_ORDER.slice());
    for (var i = 0; i < shared.instances.length; i++) {
      shared.instances[i].onSharedManifestLoaded();
    }
  }

  function fetchManifestFrom(url) {
    return fetch(url, { credentials: 'omit', cache: 'default' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function loadSharedIcons(force) {
    if (shared.loadPromise && !force) return shared.loadPromise;

    shared.loadPromise = fetchManifestFrom(iconManifestUrl())
      .then(function (data) {
        if (!data || !Array.isArray(data.icons) || !data.icons.length) {
          throw new Error('empty CDN manifest');
        }
        applySharedManifest(data, 'cdn.ttmenus.com');
      })
      .catch(function (err) {
        shared.loadFailed = true;
        shared.iconsAll = [];
        shared.loadPromise = null;
        for (var j = 0; j < shared.instances.length; j++) {
          var inst = shared.instances[j];
          inst.ensureLoaded();
        }
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[Section icon picker] CDN unavailable', err);
        }
      });
    return shared.loadPromise;
  }

  var sectionIconPicker = createSectionIconPickerInstance({
    inputId: 'dashboardEditSectionIcon',
    searchId: 'dashboardSectionIconSearch',
    tabsId: 'dashboardSectionIconCategoryTabs',
    gridId: 'dashboardSectionIconGrid',
    pagerId: 'dashboardSectionIconPager',
    pagerPrevId: 'dashboardSectionIconPagerPrev',
    pagerNextId: 'dashboardSectionIconPagerNext',
    pagerLabelId: 'dashboardSectionIconPagerLabel',
    statusId: 'dashboardSectionIconStatus',
    previewWrapId: 'dashboardSectionIconSelectedPreview',
    previewImgId: 'dashboardSectionIconPreviewImg',
    selectedLabelId: 'dashboardSectionIconSelectedLabel',
  });

  var sectionSecondaryImagePicker = createSectionIconPickerInstance({
    inputId: 'dashboardEditSectionImageTop',
    searchId: 'dashboardSectionSecondaryImageSearch',
    tabsId: 'dashboardSectionSecondaryImageCategoryTabs',
    gridId: 'dashboardSectionSecondaryImageGrid',
    pagerId: 'dashboardSectionSecondaryImagePager',
    pagerPrevId: 'dashboardSectionSecondaryImagePagerPrev',
    pagerNextId: 'dashboardSectionSecondaryImagePagerNext',
    pagerLabelId: 'dashboardSectionSecondaryImagePagerLabel',
    statusId: 'dashboardSectionSecondaryImageStatus',
    previewWrapId: 'dashboardSectionSecondaryImageSelectedPreview',
    previewImgId: 'dashboardSectionSecondaryImagePreviewImg',
    selectedLabelId: 'dashboardSectionSecondaryImageSelectedLabel',
  });

  shared.instances.push(sectionIconPicker, sectionSecondaryImagePicker);

  global.DashboardSectionIconPicker = sectionIconPicker;
  global.DashboardSectionSecondaryImagePicker = sectionSecondaryImagePicker;
  global.DashboardSectionIconPicker.loadIcons = function () {
    return loadSharedIcons(true);
  };
  global.DashboardSectionIconPicker.ICON_CDN_BASE = ICON_CDN_BASE;
  global.DashboardSectionIconPicker.ICON_CATEGORY_ORDER = ICON_CATEGORY_ORDER;

  function scheduleInit() {
    function boot() {
      sectionIconPicker.init();
      if (document.getElementById('dashboardSectionSecondaryImageGrid')) {
        sectionSecondaryImagePicker.init();
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

  scheduleInit();
})(typeof window !== 'undefined' ? window : this);
