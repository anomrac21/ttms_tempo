/**
 * Lightweight menu rearrange page — section + item list (no live menu iframe).
 */
(function (global) {
  'use strict';

  var CMS_CLIENT_ID = '';
  var CMS_SERVICE_URL = '';
  var CMS_API_URL = '';
  var MIN_ITEM_WEIGHT = 1;
  var PINNED_SECTION_SLUGS = ['promotions'];
  var PINNED_SECTION_WEIGHT = 1;
  var MIN_MOVABLE_SECTION_WEIGHT = 2;
  var sections = [];
  var dirty = false;
  var reordered = false;
  var saving = false;
  var baselineOrder = null;
  var liveOrderSnapshot = null;
  var draftOrderChanges = { sections: {}, items: {} };
  var sectionCollapsed = {};
  var SAVE_BATCH_SIZE = 8;

  function cmsApiBase() {
    var api = (CMS_API_URL || global.CMS_API_URL || '').replace(/\/+$/, '');
    if (api) return api;
    var svc = (CMS_SERVICE_URL || global.CMS_SERVICE_URL || 'https://cms.ttmenus.com').replace(/\/+$/, '');
    return /\/api$/i.test(svc) ? svc : svc + '/api';
  }

  function cmsClientPath(suffix) {
    return (
      cmsApiBase() +
      '/clients/' +
      encodeURIComponent(CMS_CLIENT_ID) +
      (suffix.charAt(0) === '/' ? suffix : '/' + suffix)
    );
  }

  function getAccessToken() {
    if (global.AuthClient && typeof global.AuthClient.getAccessToken === 'function') {
      var t = global.AuthClient.getAccessToken();
      if (t) return t;
    }
    try {
      return localStorage.getItem('ttmenus_access_token') || localStorage.getItem('auth_token');
    } catch (e) {
      return null;
    }
  }

  function authHeaders(json) {
    var h = { Accept: 'application/json' };
    if (json) h['Content-Type'] = 'application/json';
    var token = getAccessToken();
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  function ensureAccessToken() {
    if (getAccessToken()) return Promise.resolve(getAccessToken());
    if (global.AuthClient && typeof global.AuthClient.ensureAccessToken === 'function') {
      return global.AuthClient.ensureAccessToken().then(function () {
        return getAccessToken();
      });
    }
    return Promise.resolve(null);
  }

  function cmsGet(path) {
    return fetch(cmsApiBase() + path, {
      method: 'GET',
      credentials: 'include',
      headers: authHeaders(),
    }).then(function (res) {
      if (!res.ok) throw new Error('CMS ' + res.status);
      return res.json();
    });
  }

  function cmsPost(path, body) {
    return fetch(cmsApiBase() + path, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(true),
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error(t || 'CMS ' + res.status);
        });
      }
      return res.json().catch(function () {
        return {};
      });
    });
  }

  function normalizeUrl(url) {
    var u = String(url || '').trim();
    if (!u) return '';
    if (u.charAt(0) !== '/') u = '/' + u;
    return u.replace(/\/+$/, '') + '/';
  }

  function slugFromUrl(url) {
    var parts = normalizeUrl(url).split('/').filter(Boolean);
    return parts[0] || '';
  }

  function itemContentPath(url) {
    return 'content' + normalizeUrl(url).replace(/\/$/, '') + '.md';
  }

  function hasAdminAccess() {
    if (!global.AuthClient || !global.AuthClient.isAuthenticated() || !global.AuthClient.isAdmin()) {
      return false;
    }
    return (
      global.AuthClientAccess &&
      typeof global.AuthClientAccess.hasClientAccess === 'function' &&
      global.AuthClientAccess.hasClientAccess()
    );
  }

  function setSaveChip(text, kind) {
    var el = document.getElementById('dashboardRearrangeSaveChip');
    if (!el) return;
    if (!text) {
      el.textContent = '';
      el.className = 'dashboard-rearrange-save-chip hidden';
      return;
    }
    el.textContent = text;
    el.className =
      'dashboard-rearrange-save-chip' +
      (kind === 'saving' ? ' dashboard-rearrange-save-chip--saving' : '') +
      (kind === 'error' ? ' dashboard-rearrange-save-chip--error' : '') +
      (kind === 'saved' ? ' dashboard-rearrange-save-chip--saved' : '') +
      (kind === 'pending' ? ' dashboard-rearrange-save-chip--pending' : '');
  }

  function setStatus(msg, kind) {
    var el = document.getElementById('dashboardRearrangeStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className =
      'dashboard-rearrange-status' +
      (kind === 'error' ? ' dashboard-rearrange-status--error' : '') +
      (kind === 'success' ? ' dashboard-rearrange-status--success' : '') +
      (kind === 'loading' ? ' dashboard-rearrange-status--loading' : '');
  }

  function captureOrderSnapshot(list) {
    var itemsBySection = {};
    list.forEach(function (sec) {
      itemsBySection[sec.slug] = sec.items.map(function (item) {
        return itemContentPath(item.url);
      });
    });
    return {
      sections: list.map(function (sec) {
        return sec.slug;
      }),
      itemsBySection: itemsBySection,
    };
  }

  function cloneOrderSnapshot(snap) {
    var itemsBySection = {};
    Object.keys(snap.itemsBySection || {}).forEach(function (slug) {
      itemsBySection[slug] = (snap.itemsBySection[slug] || []).slice();
    });
    return {
      sections: (snap.sections || []).slice(),
      itemsBySection: itemsBySection,
    };
  }

  function computeOrderDiff(fromSnap, toSnap) {
    var changedSections = {};
    var changedItems = {};
    if (!fromSnap || !toSnap) return { sections: changedSections, items: changedItems };

    var fromSec = fromSnap.sections || [];
    var toSec = toSnap.sections || [];
    var fromSecIndex = {};
    fromSec.forEach(function (slug, i) {
      fromSecIndex[slug] = i;
    });
    toSec.forEach(function (slug, i) {
      if (fromSecIndex[slug] !== i) changedSections[slug] = true;
    });

    var slugs = {};
    fromSec.concat(toSec).forEach(function (slug) {
      if (slug) slugs[slug] = true;
    });
    Object.keys(slugs).forEach(function (slug) {
      var fromItems = (fromSnap.itemsBySection && fromSnap.itemsBySection[slug]) || [];
      var toItems = (toSnap.itemsBySection && toSnap.itemsBySection[slug]) || [];
      var fromItemIndex = {};
      fromItems.forEach(function (path, i) {
        fromItemIndex[path] = i;
      });
      toItems.forEach(function (path, i) {
        if (fromItemIndex[path] !== i) changedItems[path] = true;
      });
    });
    return { sections: changedSections, items: changedItems };
  }

  function createPositionMeta(position, weight) {
    var meta = document.createElement('span');
    meta.className = 'dashboard-rearrange-position-meta';
    meta.textContent = '#' + position + ' · w' + weight;
    meta.title = 'List position ' + position + ', Hugo weight ' + weight;
    return meta;
  }

  function countChangedInSection(sessionDiff, sec) {
    var n = 0;
    if (!sec || !sec.items || !sessionDiff || !sessionDiff.items) return 0;
    sec.items.forEach(function (item) {
      if (sessionDiff.items[itemContentPath(item.url)]) n += 1;
    });
    return n;
  }

  function isSectionCollapsed(sec, hasSessionChanges) {
    if (sectionCollapsed[sec.slug] != null) return !!sectionCollapsed[sec.slug];
    return !hasSessionChanges;
  }

  function toggleSectionCollapsed(slug) {
    var sec = null;
    for (var ti = 0; ti < sections.length; ti++) {
      if (sections[ti].slug === slug) {
        sec = sections[ti];
        break;
      }
    }
    var hasChanges = false;
    if (sec && baselineOrder) {
      var snap = captureOrderSnapshot(sections);
      var diff = computeOrderDiff(baselineOrder, snap);
      hasChanges = !!(diff.sections[slug] || countChangedInSection(diff, sec));
    }
    var current =
      sectionCollapsed[slug] != null ? !!sectionCollapsed[slug] : !hasChanges;
    sectionCollapsed[slug] = !current;
    renderList();
  }

  function hasUnsavedChanges() {
    return dirty;
  }

  function markUnsavedChanges() {
    var current = captureOrderSnapshot(sections);
    var diff = baselineOrder
      ? computeOrderDiff(baselineOrder, current)
      : { sections: {}, items: {} };
    if (!Object.keys(diff.sections).length && !Object.keys(diff.items).length) {
      return;
    }
    dirty = true;
    reordered = true;
    updateStatusSummary();
  }

  function previewAffectsOrder(payload, fm) {
    var kind = String(payload.kind || '').toLowerCase();
    if (
      kind === 'theme-css' ||
      kind === 'home' ||
      kind === 'slideshow' ||
      kind === 'promotion'
    ) {
      return false;
    }
    if (kind === 'menu-item' || kind === 'section' || kind === 'section-header') {
      return fm.weight != null;
    }
    return fm.weight != null;
  }

  function buildWeightMapFromSections(list) {
    var map = {};
    list.forEach(function (sec) {
      map[sectionContentPath(sec.slug)] = sec.weight;
      sec.items.forEach(function (item) {
        map[itemContentPath(item.url)] = item.weight;
      });
    });
    return map;
  }

  function promptLeaveAndSave() {
    return new Promise(function (resolve) {
      if (!hasUnsavedChanges()) {
        resolve(true);
        return;
      }
      if (saving) {
        resolve(false);
        return;
      }
      var saveFirst = confirm(
        'Save menu order as CMS drafts before leaving?\n\nOK — save and leave\nCancel — more options'
      );
      if (saveFirst) {
        persistDrafts()
          .then(function () {
            resolve(true);
          })
          .catch(function () {
            resolve(false);
          });
        return;
      }
      var discard = confirm('Leave without saving your menu order changes?');
      if (discard) dirty = false;
      resolve(discard);
    });
  }

  function goToContentEditor(opts) {
    opts = opts || {};
    if (!hasUnsavedChanges()) {
      navigateContentEditor(opts);
      return;
    }
    promptLeaveAndSave().then(function (ok) {
      if (ok) navigateContentEditor(opts);
    });
  }

  function navigateContentEditor(opts) {
    try {
      sessionStorage.setItem('editMenuLiveMode', 'content');
      sessionStorage.removeItem('editMenuPendingAddSection');
      sessionStorage.removeItem('editMenuPendingAddItemSection');
      if (opts.addSection) sessionStorage.setItem('editMenuPendingAddSection', '1');
      if (opts.addItemSection) {
        sessionStorage.setItem('editMenuPendingAddItemSection', String(opts.addItemSection));
      }
    } catch (e) {}
    global.location.href = '/?edit=content';
  }

  function createAddItemBar(sectionSlug) {
    var bar = document.createElement('div');
    bar.className = 'dashboard-rearrange-add-bar';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dashboard-rearrange-add-btn';
    btn.innerHTML = '<i class="fa fa-plus" aria-hidden="true"></i> Add item';
    btn.setAttribute('aria-label', 'Add item to ' + sectionSlug);
    btn.addEventListener('click', function () {
      goToContentEditor({ addItemSection: sectionSlug });
    });
    bar.appendChild(btn);
    return bar;
  }

  function createAddSectionBar() {
    var bar = document.createElement('div');
    bar.className = 'dashboard-rearrange-add-bar dashboard-rearrange-add-bar--section';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dashboard-rearrange-add-btn dashboard-rearrange-add-btn--section';
    btn.innerHTML = '<i class="fa fa-plus" aria-hidden="true"></i> Add section';
    btn.setAttribute('aria-label', 'Add menu section in content editor');
    btn.addEventListener('click', function () {
      goToContentEditor({ addSection: true });
    });
    bar.appendChild(btn);
    return bar;
  }

  function updateStatusSummary() {
    if (!sections.length) return;
    var current = captureOrderSnapshot(sections);
    var sessionDiff = baselineOrder
      ? computeOrderDiff(baselineOrder, current)
      : { sections: {}, items: {} };
    var sessionSectionMoves = Object.keys(sessionDiff.sections).length;
    var sessionItemMoves = Object.keys(sessionDiff.items).length;
    var draftSectionMoves = Object.keys(draftOrderChanges.sections || {}).length;
    var draftItemMoves = Object.keys(draftOrderChanges.items || {}).length;

    if (saving) {
      setSaveChip('Saving…', 'saving');
    } else if (dirty) {
      setSaveChip('Unsaved', 'pending');
    } else {
      setSaveChip('', null);
    }

    var parts = [sections.length + ' sections'];
    if (sessionSectionMoves || sessionItemMoves) {
      var moveParts = [];
      if (sessionSectionMoves) {
        moveParts.push(sessionSectionMoves + ' section' + (sessionSectionMoves === 1 ? '' : 's'));
      }
      if (sessionItemMoves) {
        moveParts.push(sessionItemMoves + ' item' + (sessionItemMoves === 1 ? '' : 's'));
      }
      parts.push(moveParts.join(', ') + ' reordered — save when you leave');
    } else if (draftSectionMoves || draftItemMoves) {
      parts.push('showing draft order — publish when ready');
    } else {
      parts.push('tap arrows to reorder · saved when you leave');
    }
    setStatus(parts.join(' · '), 'success');
  }

  function isPinnedSection(sec) {
    return !!(sec && sec.slug && PINNED_SECTION_SLUGS.indexOf(sec.slug) >= 0);
  }

  function ensurePinnedSectionOrder(list) {
    var pinned = [];
    var movable = [];
    list.forEach(function (sec) {
      if (isPinnedSection(sec)) pinned.push(sec);
      else movable.push(sec);
    });
    pinned.sort(function (a, b) {
      if (a.slug === 'promotions') return -1;
      if (b.slug === 'promotions') return 1;
      return (a.weight || 0) - (b.weight || 0);
    });
    movable.sort(function (a, b) {
      return (a.weight || 0) - (b.weight || 0) || a.title.localeCompare(b.title);
    });
    return pinned.concat(movable);
  }

  function hugoItemToState(raw, weightHint) {
    var url = normalizeUrl(raw.url || raw.RelPermalink);
    var title = String(raw.name || raw.title || raw.linkTitle || 'Untitled').trim();
    return {
      id: raw.id || url,
      title: title,
      url: url,
      weight: typeof raw.weight === 'number' ? raw.weight : weightHint,
      raw: raw,
    };
  }

  function sectionContentPath(slug) {
    return 'content/' + slug + '/_index.md';
  }

  function normalizeContentPath(cp) {
    cp = String(cp || '').trim().replace(/\\/g, '/');
    if (!cp) return '';
    var idx = cp.indexOf('content/');
    if (idx >= 0) cp = cp.slice(idx);
    return cp.indexOf('content/') === 0 ? cp : '';
  }

  function parseWeightValue(val, fallback) {
    if (val == null || val === '') return fallback;
    var n = parseInt(val, 10);
    return isNaN(n) ? fallback : n;
  }

  function normalizePreviewsList(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (data.previews && Array.isArray(data.previews)) return data.previews;
    if (data.Previews && Array.isArray(data.Previews)) return data.Previews;
    return [];
  }

  function dedupePreviewsByContentPath(previews) {
    if (!previews || !previews.length) return [];
    var best = {};
    previews.forEach(function (p) {
      var payload = p.payload || p.Payload || {};
      var path = normalizeContentPath(
        p.content_path ||
          payload.contentPath ||
          payload.content_path ||
          ''
      );
      if (!path) return;
      var cur = best[path];
      var t = new Date(p.updated_at || p.UpdatedAt || 0).getTime();
      if (!cur || t >= new Date(cur.updated_at || cur.UpdatedAt || 0).getTime()) {
        best[path] = p;
      }
    });
    return Object.keys(best).map(function (k) {
      return best[k];
    });
  }

  function cloneSectionList(list) {
    return list.map(function (sec) {
      return {
        slug: sec.slug,
        title: sec.title,
        url: sec.url,
        summary: sec.summary || '',
        image: sec.imagePrimary || '',
        icon: sec.icon || '',
        imageSecondary: sec.imageSecondary || '',
        imagePrimary: sec.imagePrimary || '',
        weight: sec.weight,
        items: sec.items.map(function (item) {
          return {
            id: item.id,
            title: item.title,
            url: item.url,
            weight: item.weight,
            raw: item.raw,
          };
        }),
      };
    });
  }

  function collectContentPaths(list) {
    var paths = [];
    list.forEach(function (sec) {
      paths.push(sectionContentPath(sec.slug));
      sec.items.forEach(function (item) {
        paths.push(itemContentPath(item.url));
      });
    });
    return paths;
  }

  function batchFetchContentFiles(paths) {
    if (!paths.length) return Promise.resolve({});
    return cmsPost(
      '/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/files/batch',
      { paths: paths }
    )
      .then(function (data) {
        return data && (data.files || data.Files) ? data.files || data.Files : {};
      })
      .catch(function (err) {
        console.warn('Live content batch fetch failed; using Hugo weights', err);
        return {};
      });
  }

  function applySectionFrontMatter(sec, fm, body) {
    if (!fm) return;
    if (fm.title != null && fm.title !== '') sec.title = String(fm.title);
    if (isPinnedSection(sec)) {
      sec.weight = PINNED_SECTION_WEIGHT;
    } else if (fm.weight != null) {
      sec.weight = parseWeightValue(fm.weight, sec.weight);
    }
    if (fm.icon) sec.icon = String(fm.icon);
    var imgs = fm.images;
    if (fm.image && !(imgs && imgs.primary)) sec.imagePrimary = String(fm.image);
    if (imgs && typeof imgs === 'object') {
      if (imgs.primary) sec.imagePrimary = String(imgs.primary);
      if (imgs.secondary) sec.imageSecondary = String(imgs.secondary);
    }
    if (body && String(body).trim()) sec.summary = String(body).trim();
    else if (fm.summary) sec.summary = String(fm.summary);
  }

  function applyLiveFileWeights(list, filesMap) {
    list.forEach(function (sec) {
      var secFile = filesMap[sectionContentPath(sec.slug)];
      if (secFile) {
        applySectionFrontMatter(sec, secFile.frontMatter || secFile.FrontMatter, secFile.body);
      }
      sec.items.forEach(function (item, idx) {
        var ip = itemContentPath(item.url);
        var itemFile = filesMap[ip];
        if (!itemFile) return;
        var ifm = itemFile.frontMatter || itemFile.FrontMatter || {};
        if (ifm.title != null && ifm.title !== '') item.title = String(ifm.title);
        if (ifm.weight != null) {
          item.weight = parseWeightValue(ifm.weight, item.weight);
        } else if (item.weight == null) {
          item.weight = MIN_ITEM_WEIGHT + idx;
        }
      });
    });
    sortSectionsAndItems(list);
  }

  function sortSectionsAndItems(list) {
    var ordered = ensurePinnedSectionOrder(list);
    list.length = 0;
    ordered.forEach(function (sec) {
      list.push(sec);
    });
    list.forEach(function (sec) {
      sec.items.sort(function (a, b) {
        return (a.weight || 0) - (b.weight || 0) || a.title.localeCompare(b.title);
      });
    });
  }

  function buildSkeletonFromHugo(hugoApi) {
    var hugoItems = (hugoApi && hugoApi.menu_items) || [];
    var grouped = {};
    hugoItems.forEach(function (raw) {
      var slug = String(raw.section || slugFromUrl(raw.categoryUrl || raw.url) || '').trim();
      if (!slug) return;
      if (!grouped[slug]) {
        var secWeight =
          typeof raw.section_weight === 'number'
            ? raw.section_weight
            : MIN_MOVABLE_SECTION_WEIGHT;
        grouped[slug] = {
          slug: slug,
          title: String(raw.category || slug).trim(),
          url: normalizeUrl(raw.categoryUrl || '/' + slug + '/'),
          summary: '',
          image: '',
          weight: slug === 'promotions' ? PINNED_SECTION_WEIGHT : secWeight,
          items: [],
        };
      }
      var itemWeight =
        typeof raw.weight === 'number'
          ? raw.weight
          : MIN_ITEM_WEIGHT + grouped[slug].items.length;
      grouped[slug].items.push(hugoItemToState(raw, itemWeight));
    });
    return Object.keys(grouped).map(function (k) {
      return grouped[k];
    });
  }

  function mergePreviewWeights(list, previews, liveRef) {
    previews = dedupePreviewsByContentPath(previews);
    if (!previews.length) return;
    var liveWeights = liveRef ? buildWeightMapFromSections(liveRef) : {};
    var secByPath = {};
    var itemByPath = {};
    list.forEach(function (sec) {
      secByPath[sectionContentPath(sec.slug)] = sec;
      sec.items.forEach(function (item) {
        itemByPath[itemContentPath(item.url)] = item;
      });
    });
    previews.forEach(function (p) {
      var payload = p.payload || p.Payload || {};
      var fm = payload.frontMatter || payload.front_matter || {};
      if (!previewAffectsOrder(payload, fm)) return;
      var cp = normalizeContentPath(
        p.content_path ||
          payload.contentPath ||
          payload.content_path ||
          ''
      );
      if (!cp) return;
      var previewWeight = parseWeightValue(fm.weight, null);
      if (previewWeight != null && liveWeights[cp] === previewWeight) return;
      if (cp.indexOf('/_index.md') !== -1 && secByPath[cp]) {
        var sec = secByPath[cp];
        if (isPinnedSection(sec)) {
          sec.weight = PINNED_SECTION_WEIGHT;
        } else if (previewWeight != null) {
          var sw = previewWeight;
          if (sw <= PINNED_SECTION_WEIGHT) sw = MIN_MOVABLE_SECTION_WEIGHT;
          sec.weight = sw;
        }
        if (fm.title != null && fm.title !== '') sec.title = String(fm.title);
      }
      if (itemByPath[cp]) {
        if (previewWeight != null) {
          itemByPath[cp].weight = previewWeight;
        }
        if (fm.title != null && fm.title !== '') {
          itemByPath[cp].title = String(fm.title);
        }
      }
    });
    sortSectionsAndItems(list);
  }

  function reindexWeights(list) {
    var pinned = [];
    var movable = [];
    list.forEach(function (sec) {
      if (isPinnedSection(sec)) pinned.push(sec);
      else movable.push(sec);
    });
    pinned.sort(function (a, b) {
      if (a.slug === 'promotions') return -1;
      if (b.slug === 'promotions') return 1;
      return (a.weight || 0) - (b.weight || 0);
    });
    list.length = 0;
    pinned.forEach(function (sec) {
      list.push(sec);
    });
    movable.forEach(function (sec) {
      list.push(sec);
    });
    var nextMovableWeight = MIN_MOVABLE_SECTION_WEIGHT;
    list.forEach(function (sec) {
      if (isPinnedSection(sec)) {
        sec.weight = PINNED_SECTION_WEIGHT;
      } else {
        sec.weight = nextMovableWeight;
        nextMovableWeight += 1;
      }
      sec.items.forEach(function (item, ii) {
        item.weight = MIN_ITEM_WEIGHT + ii;
      });
    });
  }

  function loadStructure() {
    setStatus('Loading menu structure…', 'loading');
    return ensureAccessToken()
      .then(function () {
        return Promise.all([
          fetch('/api/menu-items.json', { credentials: 'same-origin' })
            .then(function (r) {
              return r.ok ? r.json() : { menu_items: [] };
            })
            .catch(function () {
              return { menu_items: [] };
            }),
          cmsGet('/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/previews').catch(
            function () {
              return { previews: [] };
            }
          ),
        ]);
      })
      .then(function (results) {
        var hugoApi = results[0];
        var previews = dedupePreviewsByContentPath(normalizePreviewsList(results[1]));
        var skeleton = buildSkeletonFromHugo(hugoApi);
        if (!skeleton.length) {
          sections = [];
          setStatus('No menu sections found. Add menu content first, then return here.', 'error');
          renderList();
          return;
        }
        var paths = collectContentPaths(skeleton);
        return batchFetchContentFiles(paths).then(function (filesMap) {
          var liveSections = cloneSectionList(skeleton);
          applyLiveFileWeights(liveSections, filesMap);
          liveOrderSnapshot = captureOrderSnapshot(liveSections);

          sections = cloneSectionList(liveSections);
          mergePreviewWeights(sections, previews, liveSections);
          reindexWeights(sections);

          draftOrderChanges = computeOrderDiff(
            liveOrderSnapshot,
            captureOrderSnapshot(sections)
          );
          baselineOrder = cloneOrderSnapshot(captureOrderSnapshot(sections));
          dirty = false;
          reordered = false;
          updateStatusSummary();
          renderList();
        });
      })
      .catch(function (err) {
        console.error(err);
        setStatus('Could not load menu: ' + (err.message || err), 'error');
      });
  }

  function flatPricesFromRaw(raw) {
    var prices = [];
    var src = (raw && raw.prices) || [];
    if (!Array.isArray(src)) return prices;
    src.forEach(function (row) {
      if (!Array.isArray(row) || row.length < 3) return;
      prices.push({
        variable1: row[0] != null ? String(row[0]) : '-',
        variable2: row[1] != null ? String(row[1]) : '-',
        price: typeof row[2] === 'number' ? row[2] : parseFloat(row[2]) || 0,
      });
    });
    return prices;
  }

  function sectionPayload(sec) {
    var fm = {
      title: sec.title,
      weight: sec.weight,
    };
    if (sec.icon) fm.icon = sec.icon;
    var secondary = sec.imageSecondary || '';
    var primary = sec.imagePrimary || '';
    if (secondary || primary) {
      fm.images = {};
      if (secondary) fm.images.secondary = secondary;
      if (primary) fm.images.primary = primary;
    }
    return {
      payload: {
        kind: 'section',
        clientId: CMS_CLIENT_ID,
        contentPath: 'content/' + sec.slug + '/_index.md',
        siteConfigPath: CMS_CLIENT_ID + '/hugo.toml',
        frontMatter: fm,
        body: sec.summary || '',
      },
    };
  }

  function itemPayload(item) {
    var raw = item.raw || {};
    var fm = {
      title: item.title,
      weight: item.weight,
    };
    var images = Array.isArray(raw.images)
      ? raw.images.map(function (p) {
          if (p && typeof p === 'object' && p.image) return { image: p.image };
          return { image: p };
        })
      : [];
    if (images.length) fm.images = images;
    return {
      payload: {
        kind: 'menu-item',
        clientId: CMS_CLIENT_ID,
        contentPath: itemContentPath(item.url),
        siteConfigPath: CMS_CLIENT_ID + '/hugo.toml',
        frontMatter: fm,
        body: '',
      },
    };
  }

  function runSaveJobs(jobs) {
    var index = 0;
    function nextBatch() {
      var batch = jobs.slice(index, index + SAVE_BATCH_SIZE);
      index += SAVE_BATCH_SIZE;
      if (!batch.length) return Promise.resolve();
      return Promise.all(batch.map(function (job) { return job(); })).then(nextBatch);
    }
    return nextBatch();
  }

  function buildSaveJobsFromDiff() {
    var path = '/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/previews';
    var current = captureOrderSnapshot(sections);
    var diff = baselineOrder
      ? computeOrderDiff(baselineOrder, current)
      : { sections: {}, items: {} };
    var jobs = [];
    sections.forEach(function (sec) {
      if (diff.sections[sec.slug]) {
        jobs.push(function () {
          return cmsPost(path, sectionPayload(sec));
        });
      }
      sec.items.forEach(function (item) {
        var ip = itemContentPath(item.url);
        if (diff.items[ip]) {
          jobs.push(function () {
            return cmsPost(path, itemPayload(item));
          });
        }
      });
    });
    return jobs;
  }

  function persistDrafts() {
    if (saving || !sections.length) return Promise.resolve();
    var jobs = buildSaveJobsFromDiff();
    if (!jobs.length) {
      dirty = false;
      updateStatusSummary();
      return Promise.resolve();
    }
    saving = true;
    updateStatusSummary();
    return runSaveJobs(jobs)
      .then(function () {
        dirty = false;
        baselineOrder = cloneOrderSnapshot(captureOrderSnapshot(sections));
        setSaveChip('Saved', 'saved');
        updateStatusSummary();
        renderList();
      })
      .catch(function (err) {
        console.error(err);
        setSaveChip('Save failed', 'error');
        setStatus('Could not save drafts: ' + (err.message || err), 'error');
      })
      .finally(function () {
        saving = false;
        updateStatusSummary();
      });
  }

  function moveInArray(arr, index, action) {
    if (index < 0 || index >= arr.length) return false;
    if (action === 'top') {
      if (index === 0) return false;
      arr.unshift(arr.splice(index, 1)[0]);
      return true;
    }
    if (action === 'up') {
      if (index <= 0) return false;
      var tmp = arr[index - 1];
      arr[index - 1] = arr[index];
      arr[index] = tmp;
      return true;
    }
    if (action === 'down') {
      if (index >= arr.length - 1) return false;
      var tmp2 = arr[index + 1];
      arr[index + 1] = arr[index];
      arr[index] = tmp2;
      return true;
    }
    if (action === 'bottom') {
      if (index >= arr.length - 1) return false;
      arr.push(arr.splice(index, 1)[0]);
      return true;
    }
    return false;
  }

  function onSectionMove(sectionSlug, action) {
    var secIndex = -1;
    var sec = null;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].slug === sectionSlug) {
        secIndex = i;
        sec = sections[i];
        break;
      }
    }
    if (!sec || isPinnedSection(sec)) return;
    var movableIndices = [];
    sections.forEach(function (s, i) {
      if (!isPinnedSection(s)) movableIndices.push(i);
    });
    var posInMovable = movableIndices.indexOf(secIndex);
    if (posInMovable < 0) return;
    var movableSecs = movableIndices.map(function (i) {
      return sections[i];
    });
    if (!moveInArray(movableSecs, posInMovable, action)) return;
    var rebuilt = [];
    sections.forEach(function (s) {
      if (isPinnedSection(s)) rebuilt.push(s);
    });
    movableSecs.forEach(function (s) {
      rebuilt.push(s);
    });
    sections.length = 0;
    rebuilt.forEach(function (s) {
      sections.push(s);
    });
    reindexWeights(sections);
    sectionCollapsed[sectionSlug] = false;
    renderList();
    markUnsavedChanges();
  }

  function onItemMove(secIndex, itemIndex, action) {
    var sec = sections[secIndex];
    if (!sec || !sec.items) return;
    if (moveInArray(sec.items, itemIndex, action)) {
      reindexWeights(sections);
      sectionCollapsed[sec.slug] = false;
      renderList();
      markUnsavedChanges();
    }
  }

  function createMoveButtons(kind, secIndex, itemIndex, indexInList, listLength, sectionSlug) {
    var wrap = document.createElement('div');
    wrap.className = 'dashboard-rearrange-move';
    if (kind === 'section' && isPinnedSection(sections[secIndex])) {
      return wrap;
    }
    var specs = [
      { action: 'top', icon: 'fa-angle-double-up', label: 'Move to top', jump: true },
      { action: 'up', icon: 'fa-angle-up', label: 'Move up', jump: false },
      { action: 'down', icon: 'fa-angle-down', label: 'Move down', jump: false },
      { action: 'bottom', icon: 'fa-angle-double-down', label: 'Move to bottom', jump: true },
    ];
    specs.forEach(function (spec) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'dashboard-rearrange-move-btn' +
        (spec.jump ? ' dashboard-rearrange-move-btn--jump' : '');
      btn.setAttribute('aria-label', spec.label);
      btn.title = spec.label;
      btn.innerHTML = '<i class="fa ' + spec.icon + '" aria-hidden="true"></i>';
      if (spec.action === 'top' || spec.action === 'up') {
        if (indexInList <= 0) btn.disabled = true;
      }
      if (spec.action === 'down' || spec.action === 'bottom') {
        if (indexInList >= listLength - 1) btn.disabled = true;
      }
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        if (kind === 'section') {
          onSectionMove(sectionSlug || sections[secIndex].slug, spec.action);
        } else {
          onItemMove(secIndex, itemIndex, spec.action);
        }
      });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function movableSectionIndex(secIndex) {
    var movableIndices = [];
    sections.forEach(function (s, i) {
      if (!isPinnedSection(s)) movableIndices.push(i);
    });
    return movableIndices.indexOf(secIndex);
  }

  function movableSectionCount() {
    var n = 0;
    sections.forEach(function (s) {
      if (!isPinnedSection(s)) n += 1;
    });
    return n;
  }

  function renderList() {
    var root = document.getElementById('dashboardRearrangeList');
    if (!root) return;
    root.textContent = '';
    if (!sections.length) return;

    var currentSnap = captureOrderSnapshot(sections);
    var sessionDiff = baselineOrder
      ? computeOrderDiff(baselineOrder, currentSnap)
      : { sections: {}, items: {} };
    var hasSessionChanges =
      Object.keys(sessionDiff.sections).length > 0 ||
      Object.keys(sessionDiff.items).length > 0;
    var highlightDiff = sessionDiff;
    if (!hasSessionChanges && draftOrderChanges) {
      highlightDiff = draftOrderChanges;
    }

    sections.forEach(function (sec, si) {
      var sectionSessionMoved = !!highlightDiff.sections[sec.slug];
      var sectionItemMoves = countChangedInSection(highlightDiff, sec);
      var sectionHasChanges = sectionSessionMoved || sectionItemMoves > 0;
      var collapsed = isSectionCollapsed(sec, sectionHasChanges);

      var block = document.createElement('section');
      block.className = 'dashboard-rearrange-section';
      if (collapsed) block.classList.add('dashboard-rearrange-section--collapsed');
      if (isPinnedSection(sec)) {
        block.classList.add('dashboard-rearrange-section--pinned');
      }
      if (sectionHasChanges) {
        block.classList.add('dashboard-rearrange-section--changed');
      }

      var head = document.createElement('div');
      head.className = 'dashboard-rearrange-section-head';

      var headToggle = document.createElement('button');
      headToggle.type = 'button';
      headToggle.className = 'dashboard-rearrange-section-head-toggle';
      headToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      headToggle.setAttribute(
        'aria-label',
        (collapsed ? 'Expand' : 'Collapse') + ' ' + sec.title + ' section'
      );
      var chevron = document.createElement('span');
      chevron.className = 'dashboard-rearrange-section-toggle-chevron';
      chevron.innerHTML = '<i class="fa fa-chevron-down" aria-hidden="true"></i>';
      headToggle.appendChild(chevron);

      var headMain = document.createElement('div');
      headMain.className = 'dashboard-rearrange-section-head-main';
      var title = document.createElement('h2');
      title.className = 'dashboard-rearrange-section-title';
      title.textContent = sec.title;
      var headMeta = document.createElement('p');
      headMeta.className = 'dashboard-rearrange-section-submeta';
      var subParts = [
        '#' + (si + 1),
        'w' + sec.weight,
        sec.items.length + ' item' + (sec.items.length === 1 ? '' : 's'),
      ];
      if (isPinnedSection(sec)) subParts.push('pinned');
      if (sectionHasChanges) {
        if (sectionSessionMoved) subParts.push('section moved');
        else {
          subParts.push(
            sectionItemMoves + ' item' + (sectionItemMoves === 1 ? '' : 's') + ' moved'
          );
        }
      }
      headMeta.textContent = subParts.join(' · ');
      headMain.appendChild(title);
      headMain.appendChild(headMeta);
      headToggle.appendChild(headMain);

      if (isPinnedSection(sec)) {
        var pinNote = document.createElement('span');
        pinNote.className = 'dashboard-rearrange-section-pin-note';
        pinNote.textContent = 'Fixed';
        headToggle.appendChild(pinNote);
      }

      headToggle.addEventListener('click', function () {
        toggleSectionCollapsed(sec.slug);
      });
      head.appendChild(headToggle);

      if (!isPinnedSection(sec)) {
        var headActions = document.createElement('div');
        headActions.className = 'dashboard-rearrange-section-head-actions';
        headActions.addEventListener('click', function (ev) {
          ev.stopPropagation();
        });
        headActions.appendChild(
          createMoveButtons(
            'section',
            si,
            -1,
            movableSectionIndex(si),
            movableSectionCount(),
            sec.slug
          )
        );
        head.appendChild(headActions);
      }
      block.appendChild(head);

      var body = document.createElement('div');
      body.className = 'dashboard-rearrange-section-body';

      var list = document.createElement('ul');
      list.className = 'dashboard-rearrange-items';
      sec.items.forEach(function (item, ii) {
        var itemPath = itemContentPath(item.url);
        var itemMoved = !!highlightDiff.items[itemPath];
        var li = document.createElement('li');
        li.className = 'dashboard-rearrange-item';
        if (itemMoved) li.classList.add('dashboard-rearrange-item--changed');

        var main = document.createElement('div');
        main.className = 'dashboard-rearrange-item-main';
        var label = document.createElement('span');
        label.className = 'dashboard-rearrange-item-label';
        label.textContent = item.title;
        main.appendChild(label);
        main.appendChild(createPositionMeta(ii + 1, item.weight));
        li.appendChild(main);

        li.appendChild(
          createMoveButtons('item', si, ii, ii, sec.items.length)
        );
        list.appendChild(li);
      });
      body.appendChild(list);
      body.appendChild(createAddItemBar(sec.slug));
      block.appendChild(body);
      root.appendChild(block);
    });
    root.appendChild(createAddSectionBar());
    updateStatusSummary();
  }

  function buildMenuDataSnapshot() {
    var categories = sections.map(function (sec) {
      return {
        title: sec.title,
        url: sec.url,
        weight: sec.weight,
        summary: sec.summary || '',
        image: sec.imagePrimary || '',
      };
    });
    var menuItems = [];
    sections.forEach(function (sec) {
      sec.items.forEach(function (item, idx) {
        menuItems.push({
          id: item.id || item.url,
          title: item.title,
          url: item.url,
          category: sec.title,
          categoryUrl: sec.url,
          weight: item.weight,
        });
      });
    });
    return {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      metadata: { siteTitle: '', baseURL: '' },
      categories: categories,
      menuItems: menuItems,
      locations: [],
    };
  }

  function saveSnapshotOnLeave() {
    var now = new Date();
    var name =
      'Rearrange · ' +
      now.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    return cmsPost('/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/menu-versions', {
      name: name,
      description: 'Automatic snapshot when leaving the rearrange menu page.',
      menu_data: buildMenuDataSnapshot(),
    }).catch(function (err) {
      console.warn('snapshot failed', err);
      return null;
    });
  }

  function init() {
    CMS_CLIENT_ID = global.CLIENT_ID || global.SITE_CLIENT_ID || '_ttms_menu_demo';
    CMS_SERVICE_URL = (global.CMS_SERVICE_URL || 'https://cms.ttmenus.com').replace(/\/+$/, '');
    CMS_API_URL = (global.CMS_API_URL || '').replace(/\/+$/, '');

    if (!hasAdminAccess()) {
      setStatus('Admin access required.', 'error');
      return;
    }

    var backBtn = document.getElementById('btnDashboardBack');
    if (backBtn) {
      backBtn.addEventListener('click', function (ev) {
        if (!hasUnsavedChanges() && !reordered) return;
        ev.preventDefault();
        promptLeaveAndSave().then(function (ok) {
          if (!ok) return;
          backBtn.classList.add('dashboard-edit-header-back--saving');
          backBtn.setAttribute('aria-busy', 'true');
          var snapChain = reordered ? saveSnapshotOnLeave() : Promise.resolve();
          snapChain.finally(function () {
            global.location.href = '/dashboard/';
          });
        });
      });
    }

    global.addEventListener('beforeunload', function (ev) {
      if (!hasUnsavedChanges() || saving) return;
      ev.preventDefault();
      ev.returnValue = '';
    });

    loadStructure();
  }

  function start() {
    if (global.AuthClient && typeof global.AuthClient.whenReady === 'function') {
      global.AuthClient.whenReady().then(init);
      return;
    }
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof window !== 'undefined' ? window : this);
