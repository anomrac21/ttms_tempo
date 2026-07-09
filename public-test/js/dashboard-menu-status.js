/**
 * Dashboard Edit menu card — menu snapshots (CMS menu-versions), content drafts, publish.
 */
(function (global) {
  'use strict';

  var CMS_SERVICE_URL = '';
  var CMS_API_URL = '';
  var CMS_CLIENT_ID = '';
  var cachedPreviews = [];
  var cachedVersions = [];
  var snapshotLoadState = 'idle';
  var draftLoadState = 'idle';
  var snapshotLoadError = '';
  var draftLoadError = '';
  var refreshInFlight = null;
  var omittedDraftIds = new Set();
  var draftAnalyses = {};
  var draftAnalysisInFlight = null;
  var draftGroupCollapsed = {};
  var statusBlockCollapsed = {};
  var STATUS_BLOCK_KEYS = ['snapshots', 'drafts', 'publish'];
  var STATUS_BLOCK_DEFAULT_COLLAPSED = { snapshots: true, drafts: true, publish: true };

  function statusBlockCollapsedStorageKey() {
    return 'ttmenus_menu_status_blocks_collapsed_' + CMS_CLIENT_ID;
  }

  function loadStatusBlockCollapsed() {
    statusBlockCollapsed = Object.assign({}, STATUS_BLOCK_DEFAULT_COLLAPSED);
    try {
      var raw = localStorage.getItem(statusBlockCollapsedStorageKey());
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          STATUS_BLOCK_KEYS.forEach(function (key) {
            if (parsed[key] != null) statusBlockCollapsed[key] = !!parsed[key];
          });
        }
      }
    } catch (e) {
      statusBlockCollapsed = Object.assign({}, STATUS_BLOCK_DEFAULT_COLLAPSED);
    }
  }

  function saveStatusBlockCollapsed() {
    try {
      localStorage.setItem(statusBlockCollapsedStorageKey(), JSON.stringify(statusBlockCollapsed));
    } catch (e) {}
  }

  function isStatusBlockCollapsed(blockKey) {
    return !!statusBlockCollapsed[blockKey];
  }

  function toggleStatusBlockCollapsed(blockKey) {
    statusBlockCollapsed[blockKey] = !isStatusBlockCollapsed(blockKey);
    saveStatusBlockCollapsed();
  }

  function draftGroupCollapsedStorageKey() {
    return 'ttmenus_draft_groups_collapsed_' + CMS_CLIENT_ID;
  }

  function loadDraftGroupCollapsed() {
    draftGroupCollapsed = {};
    try {
      var raw = localStorage.getItem(draftGroupCollapsedStorageKey());
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') draftGroupCollapsed = parsed;
      }
    } catch (e) {
      draftGroupCollapsed = {};
    }
  }

  function saveDraftGroupCollapsed() {
    try {
      localStorage.setItem(draftGroupCollapsedStorageKey(), JSON.stringify(draftGroupCollapsed));
    } catch (e) {}
  }

  function isDraftGroupCollapsed(groupKey) {
    return !!draftGroupCollapsed[groupKey];
  }

  function toggleDraftGroupCollapsed(groupKey) {
    draftGroupCollapsed[groupKey] = !isDraftGroupCollapsed(groupKey);
    saveDraftGroupCollapsed();
  }

  function previewIdFromPreview(p) {
    if (!p) return '';
    var id = p.id || p.preview_id || p.previewId || p.ID;
    return id != null ? String(id).trim() : '';
  }

  function omittedDraftStorageKey() {
    return 'ttmenus_omitted_drafts_' + CMS_CLIENT_ID;
  }

  function draftOmitKey(p) {
    if (!p) return '';
    var id = previewIdFromPreview(p);
    if (id) return 'id:' + id;
    var path = draftContentPathFromPreview(p);
    if (path) return 'path:' + path;
    return '';
  }

  function clearOmitKeysForPreview(p) {
    if (!p) return;
    var key = draftOmitKey(p);
    if (key) omittedDraftIds.delete(key);
    var id = previewIdFromPreview(p);
    if (id) {
      omittedDraftIds.delete('id:' + id);
      omittedDraftIds.delete(id);
    }
    var path = draftContentPathFromPreview(p);
    if (path) omittedDraftIds.delete('path:' + path);
  }

  function loadOmittedDraftIds() {
    omittedDraftIds = new Set();
    if (!CMS_CLIENT_ID) return;
    try {
      var raw = localStorage.getItem(omittedDraftStorageKey());
      if (!raw) return;
      var list = JSON.parse(raw);
      if (!Array.isArray(list)) return;
      list.forEach(function (entry) {
        if (!entry) return;
        var s = String(entry);
        if (s.indexOf('id:') === 0 || s.indexOf('path:') === 0) {
          omittedDraftIds.add(s);
        } else {
          omittedDraftIds.add('id:' + s);
        }
      });
    } catch (e) { /* ignore */ }
  }

  function saveOmittedDraftIds() {
    if (!CMS_CLIENT_ID) return;
    try {
      localStorage.setItem(
        omittedDraftStorageKey(),
        JSON.stringify(Array.from(omittedDraftIds))
      );
    } catch (e) { /* ignore */ }
  }

  function pruneOmittedDraftIds() {
    if (!omittedDraftIds.size) return;
    var validKeys = new Set();
    cachedPreviews.forEach(function (p) {
      var key = draftOmitKey(p);
      if (key) validKeys.add(key);
      var id = previewIdFromPreview(p);
      if (id) validKeys.add('id:' + id);
      var path = draftContentPathFromPreview(p);
      if (path) validKeys.add('path:' + path);
    });
    omittedDraftIds.forEach(function (stored) {
      if (!validKeys.has(stored)) omittedDraftIds.delete(stored);
    });
    saveOmittedDraftIds();
  }

  function isDraftOmitted(p) {
    var key = draftOmitKey(p);
    if (key && omittedDraftIds.has(key)) return true;
    var id = previewIdFromPreview(p);
    if (id && omittedDraftIds.has(id)) return true;
    var path = draftContentPathFromPreview(p);
    return !!(path && omittedDraftIds.has('path:' + path));
  }

  function getPublishablePreviews() {
    return cachedPreviews.filter(function (p) {
      return !isDraftOmitted(p);
    });
  }

  function omitDraftFromPublish(p) {
    var key = draftOmitKey(p);
    if (!key) return;
    omittedDraftIds.add(key);
    saveOmittedDraftIds();
  }

  function restoreDraftToPublish(p) {
    clearOmitKeysForPreview(p);
    saveOmittedDraftIds();
  }

  function deleteDraftFromCms(previewId) {
    if (!previewId) return Promise.reject(new Error('Missing draft id'));
    var delUrl = cmsClientPath('/content/previews/' + encodeURIComponent(previewId));
    return fetch(delUrl, {
      method: 'DELETE',
      credentials: 'include',
      headers: getAuthHeaders(),
    }).then(function (res) {
      if (!res.ok && res.status !== 204) {
        return res.text().then(function (t) {
          throw new Error(t || res.statusText || 'Delete failed');
        });
      }
      return res;
    });
  }

  function createDraftManageButton(preview, opts) {
    opts = opts || {};
    var previewId = previewIdFromPreview(preview);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dashboard-menu-status-draft-remove';
    btn.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';

    function syncBtnState() {
      var omitted = isDraftOmitted(preview);
      btn.classList.toggle('is-omitted', omitted);
      btn.setAttribute(
        'aria-label',
        omitted ? 'Delete draft permanently (requires confirmation)' : 'Omit from publish'
      );
      btn.title = omitted ? 'Click again to delete this draft' : 'Omit from publish';
    }

    syncBtnState();

    btn.addEventListener('click', function () {
      var omitKey = draftOmitKey(preview);
      if (!omitKey && !previewId) return;
      if (!isDraftOmitted(preview)) {
        omitDraftFromPublish(preview);
        syncBtnState();
        if (typeof opts.onOmit === 'function') opts.onOmit(preview);
        return;
      }
      var label = truncateMiddle(previewSummaryLabel(preview), 72);
      if (
        !confirm(
          'Delete this draft permanently? It will not be published.\n\n' + label
        )
      ) {
        return;
      }
      btn.disabled = true;
      deleteDraftFromCms(previewId)
        .then(function () {
          clearOmitKeysForPreview(preview);
          saveOmittedDraftIds();
          if (typeof opts.onDelete === 'function') opts.onDelete(preview);
        })
        .catch(function (err) {
          console.error('Delete draft failed', err);
          alert('Could not delete saved change: ' + (err.message || err));
          btn.disabled = false;
        });
    });

    return btn;
  }

  /** API root (single /api segment) — avoids double /api when serviceUrl already ends with /api. */
  function cmsApiBase() {
    var api = (CMS_API_URL || global.CMS_API_URL || '').replace(/\/+$/, '');
    if (api) return api;
    var svc = (CMS_SERVICE_URL || global.CMS_SERVICE_URL || 'https://cms.ttmenus.com').replace(
      /\/+$/,
      ''
    );
    if (/\/api$/i.test(svc)) return svc;
    return svc + '/api';
  }

  function cmsClientPath(suffix) {
    return (
      cmsApiBase() +
      '/clients/' +
      encodeURIComponent(CMS_CLIENT_ID) +
      (suffix.charAt(0) === '/' ? suffix : '/' + suffix)
    );
  }

  function getAccessTokenForCms() {
    var ac = global.AuthClient;
    if (ac && ac.getAccessToken) {
      var t = ac.getAccessToken();
      if (ac._tokenLooksValid && typeof ac._tokenLooksValid === 'function') {
        if (ac._tokenLooksValid(t)) return t;
      } else if (t) {
        return t;
      }
    }
    var keys = ['auth_token', 'ttmenus_access_token'];
    var i;
    var v;
    for (i = 0; i < keys.length; i++) {
      if (typeof localStorage !== 'undefined' && localStorage.getItem) {
        v = localStorage.getItem(keys[i]);
        if (v && String(v).trim()) {
          if (ac && ac._tokenLooksValid && !ac._tokenLooksValid(v)) continue;
          return v;
        }
      }
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem) {
        v = sessionStorage.getItem(keys[i]);
        if (v && String(v).trim()) {
          if (ac && ac._tokenLooksValid && !ac._tokenLooksValid(v)) continue;
          return v;
        }
      }
    }
    return null;
  }

  function getAuthHeaders() {
    var token = getAccessTokenForCms();
    var h = { Accept: 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  /** Hub cookie sessions may lack a stored JWT until sync/refresh — obtain one for CMS Bearer auth. */
  function ensureAccessTokenForCms() {
    var existing = getAccessTokenForCms();
    if (existing) return Promise.resolve(existing);
    var ac = global.AuthClient;
    if (!ac) return Promise.resolve(null);
    if (typeof ac.ensureAccessToken === 'function') {
      return ac.ensureAccessToken().then(function (result) {
        if (result && result.success) return getAccessTokenForCms();
        return null;
      });
    }
    var chain = Promise.resolve();
    if (typeof ac.syncHubSession === 'function') {
      chain = chain.then(function () {
        return ac.syncHubSession();
      });
    }
    return chain.then(function () {
      var token = getAccessTokenForCms();
      if (token) return token;
      if (typeof ac.refreshToken !== 'function') return null;
      return ac.refreshToken().then(function () {
        return getAccessTokenForCms();
      });
    });
  }

  function redirectToLoginIfUnauthenticated() {
    if (
      global.AuthClient &&
      global.AuthClient.isAuthenticated &&
      !global.AuthClient.isAuthenticated()
    ) {
      try {
        sessionStorage.setItem('ttmenus_redirect_after_login', global.location.pathname);
      } catch (e) {}
      global.location.href = '/login/';
      return true;
    }
    return false;
  }

  function cmsAuthFailureMessage(res) {
    if (res.status === 401 || res.status === 403) {
      if (redirectToLoginIfUnauthenticated()) return '';
      return 'CMS session expired. Sign out and sign in again to reload snapshots and drafts.';
    }
    return cmsErrorMessage(res.status, res.data, 'Request failed');
  }

  function lastPublishStorageKey() {
    return 'ttmenus_last_publish_' + CMS_CLIENT_ID;
  }

  function truncateMiddle(str, maxLen) {
    str = String(str || '');
    if (str.length <= maxLen) return str;
    return str.slice(0, Math.max(8, maxLen - 14)) + '…' + str.slice(-10);
  }

  function persistLastPublishRecord(obj) {
    try {
      localStorage.setItem(lastPublishStorageKey(), JSON.stringify(obj));
    } catch (e) {}
  }

  function previewDisplayTitle(p) {
    var payload = p.payload || p.Payload || {};
    var kind = payload.kind || p.kind || 'content';
    var path =
      payload.contentPath ||
      p.content_path ||
      payload.content_path ||
      payload.siteConfigPath ||
      '';
    var fm = payload.frontMatter || payload.front_matter || {};
    var title =
      fm.title != null && fm.title !== ''
        ? String(fm.title)
        : path
          ? path
              .replace(/^content\//, '')
              .replace(/\/_index\.md$/, '')
              .replace(/\.md$/, '')
              .split('/')
              .pop()
          : '';
    if (kind === 'theme-css' || path === 'static/css/colors.css') {
      return 'Theme colors';
    }
    var kindLabel =
      kind === 'menu-item'
        ? 'Menu item'
        : kind === 'section-header' || kind === 'section'
          ? 'Section'
          : kind === 'promotion'
            ? 'Promotion'
            : kind === 'home'
              ? 'Home'
              : kind === 'slideshow'
                ? 'Slideshow'
                : kind;
    if (!title) return kindLabel;
    return kindLabel + ': ' + title;
  }

  function previewSummaryLabel(p) {
    var payload = p.payload || p.Payload || {};
    var kind = payload.kind || p.kind || 'content';
    var path = payload.contentPath || p.content_path || '';
    var display = previewDisplayTitle(p);
    if (kind === 'theme-css') {
      return display + (path ? ' (' + path + ')' : '');
    }
    if (!path) return display;
    return display + ' (' + path + ')';
  }

  function normalizeStoredFileLabel(label) {
    label = String(label || '');
    var themeDup = /^Theme colors:\s*(.+?)\s*\(\1\)$/i;
    var m = label.match(themeDup);
    if (m) return 'Theme colors (' + m[1].trim() + ')';
    return label.replace(/\s*\(([^)]+)\)\s*\(\1\)\s*$/, ' ($1)');
  }

  function normalizePreviewsPayload(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (data.previews && Array.isArray(data.previews)) return data.previews;
    if (data.Previews && Array.isArray(data.Previews)) return data.Previews;
    if (data.data && Array.isArray(data.data)) return data.data;
    return [];
  }

  function dedupePreviewsByContentPath(previews) {
    if (!previews || !previews.length) return [];
    var best = {};
    previews.forEach(function (p) {
      var payload = p.payload || p.Payload || {};
      var path =
        p.content_path ||
        p.contentPath ||
        payload.contentPath ||
        payload.content_path ||
        payload.siteConfigPath ||
        '';
      var key = path || (p.id ? 'id:' + p.id : '');
      if (!key) return;
      var cur = best[key];
      var t = new Date(p.updated_at || p.UpdatedAt || 0).getTime();
      if (!cur || t >= new Date(cur.updated_at || cur.UpdatedAt || 0).getTime()) {
        best[key] = p;
      }
    });
    return Object.keys(best).map(function (k) {
      return best[k];
    });
  }

  function cmsGetJson(url) {
    return fetch(url, { method: 'GET', credentials: 'include', headers: getAuthHeaders() }).then(
      function (res) {
        return res.text().then(function (text) {
          var data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (e) {
            if (!res.ok) {
              throw new Error(
                (res.status ? res.status + ' ' : '') + (text || '').slice(0, 120) || res.statusText
              );
            }
          }
          return { ok: res.ok, status: res.status, data: data, text: text };
        });
      }
    );
  }

  function cmsGetJsonWithAuth(url) {
    return ensureAccessTokenForCms().then(function () {
      return cmsGetJson(url);
    }).then(function (res) {
      if (res.ok || (res.status !== 401 && res.status !== 403)) return res;
      var ac = global.AuthClient;
      if (!ac || typeof ac.refreshToken !== 'function') return res;
      return ac.refreshToken().then(function (rr) {
        if (!rr || !rr.success) return res;
        return cmsGetJson(url);
      });
    });
  }

  function cmsErrorMessage(status, data, fallback) {
    return (
      (data && (data.error || data.message)) ||
      fallback ||
      (status ? 'Request failed (' + status + ')' : 'Request failed')
    );
  }

  function normalizeVersionsPayload(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (data.versions && Array.isArray(data.versions)) return data.versions;
    if (data.data && Array.isArray(data.data)) return data.data;
    if (data.menu_versions && Array.isArray(data.menu_versions)) return data.menu_versions;
    if (data.MenuVersions && Array.isArray(data.MenuVersions)) return data.MenuVersions;
    return [];
  }

  function versionIdFromRecord(v) {
    if (v == null || typeof v !== 'object') return '';
    var id =
      v.id ||
      v.ID ||
      v.version_id ||
      v.VersionId ||
      v.menu_version_id ||
      v.MenuVersionId ||
      v.uuid ||
      v.UUID ||
      v.snapshot_id ||
      v.SnapshotId;
    return id != null ? String(id).trim() : '';
  }

  function versionNameFromRecord(v) {
    if (v == null || typeof v !== 'object') return '';
    var n = v.name || v.label || v.title || v.Name || v.Label;
    return n != null ? String(n).trim() : '';
  }

  function versionSortKey(v) {
    var u = v.updated_at || v.updatedAt || v.UpdatedAt;
    var c = v.created_at || v.createdAt || v.CreatedAt;
    var t = u || c;
    return t ? new Date(t).getTime() : 0;
  }

  function formatVersionWhen(v) {
    var t =
      v.updated_at ||
      v.updatedAt ||
      v.UpdatedAt ||
      v.created_at ||
      v.createdAt ||
      v.CreatedAt;
    if (!t) return '';
    try {
      return new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
      return String(t);
    }
  }

  function snapshotDisplayParts(v) {
    var name = versionNameFromRecord(v) || 'Menu snapshot';
    var when = formatVersionWhen(v);
    var split = name.match(/^(.+?)\s*·\s*(.+)$/);
    if (split) {
      var title = split[1].trim();
      var embedded = split[2].trim();
      return { title: title, when: when || embedded };
    }
    return { title: name, when: when || '' };
  }

  function computeClientSnapshotSummaryFromMenuData(md) {
    if (!md) return { fileLabels: [] };
    var cats = (md.categories || md.Categories || []).length;
    var items = (md.menuItems || md.menu_items || md.MenuItems || []).length;
    var locs = (md.locations || md.Locations || []).length;
    var overrides = md.themeColorOverrides || md.theme_color_overrides || {};
    var themeCount = 0;
    Object.keys(overrides).forEach(function (k) {
      if (String(k).trim() && String(overrides[k]).trim()) themeCount++;
    });
    var layoutLabel =
      'data/menu.json — layout (' + cats + ' categories, ' + items + ' items';
    if (locs) layoutLabel += ', ' + locs + ' locations';
    layoutLabel += ')';
    var fileLabels = [layoutLabel];
    if (themeCount) {
      fileLabels.push('static/css/colors.css — ' + themeCount + ' theme variables');
    }
    return {
      categoryCount: cats,
      menuItemCount: items,
      locationCount: locs,
      themeVarCount: themeCount,
      fileLabels: fileLabels,
    };
  }

  function versionSummaryFromRecord(v) {
    var s = v.summary || v.Summary;
    if (s && s.fileLabels && s.fileLabels.length) return s;
    var md = v.menu_data || v.menuData || v.MenuData;
    if (md) return computeClientSnapshotSummaryFromMenuData(md);
    return { fileLabels: ['data/menu.json — layout (details unavailable)'] };
  }

  function normalizeMenuUrl(url) {
    var u = String(url || '').trim();
    if (!u) return '';
    if (u.charAt(0) !== '/') u = '/' + u;
    return u.replace(/\/+$/, '') + '/';
  }

  function slugFromMenuUrl(url) {
    var parts = normalizeMenuUrl(url).split('/').filter(Boolean);
    return parts[0] || '';
  }

  function menuItemUrlToContentPath(url) {
    var norm = normalizeMenuUrl(url);
    if (!norm || norm === '/') return '';
    return 'content' + norm.replace(/\/$/, '') + '.md';
  }

  function themeOverridesToCssBody(overrides) {
    if (!overrides || typeof overrides !== 'object') return '';
    var keys = Object.keys(overrides).filter(function (k) {
      return String(k).trim() && String(overrides[k]).trim();
    });
    if (!keys.length) return '';
    return (
      ':root {\n' +
      keys
        .map(function (k) {
          var name = k.indexOf('--') === 0 ? k : '--' + k;
          return '  ' + name + ': ' + String(overrides[k]).trim() + ';';
        })
        .join('\n') +
      '\n}\n'
    );
  }

  function buildSnapshotLiveMapFromMenuData(md) {
    var map = {};
    if (!md) return map;
    var overrides = md.themeColorOverrides || md.theme_color_overrides || {};
    var cssBody = themeOverridesToCssBody(overrides);
    if (cssBody) {
      map['static/css/colors.css'] = {
        contentPath: 'static/css/colors.css',
        frontMatter: {},
        body: cssBody,
      };
    }
    var cats = md.categories || md.Categories || [];
    cats.forEach(function (cat) {
      var slug = slugFromMenuUrl(cat.url || cat.URL);
      if (!slug) return;
      var fm = { title: cat.title || cat.Title || slug };
      var w = cat.weight != null ? cat.weight : cat.Weight;
      if (w != null) fm.weight = w;
      map['content/' + slug + '/_index.md'] = {
        contentPath: 'content/' + slug + '/_index.md',
        frontMatter: fm,
        body: String(cat.summary || cat.Summary || '').trim(),
      };
    });
    var items = md.menuItems || md.menu_items || md.MenuItems || [];
    items.forEach(function (item) {
      var path = menuItemUrlToContentPath(item.url || item.URL);
      if (!path) return;
      var fm = { title: item.title || item.Title || 'Item' };
      var iw = item.weight != null ? item.weight : item.Weight;
      if (iw != null) fm.weight = iw;
      map[path] = {
        contentPath: path,
        frontMatter: fm,
        body: String(item.summary || item.Summary || '').trim(),
      };
    });
    return map;
  }

  function draftContentPathFromPreview(p) {
    var payload = p.payload || p.Payload || {};
    return (
      p.content_path ||
      p.contentPath ||
      payload.contentPath ||
      payload.content_path ||
      payload.siteConfigPath ||
      ''
    );
  }

  function draftKindKey(p) {
    var payload = p.payload || p.Payload || {};
    return payload.kind || p.kind || 'content';
  }

  function draftKindPluralLabel(kind, count) {
    if (kind === 'theme-css') return count === 1 ? 'theme file' : 'theme files';
    if (kind === 'menu-item') return count === 1 ? 'menu item' : 'menu items';
    if (kind === 'section-header' || kind === 'section') return count === 1 ? 'section' : 'sections';
    if (kind === 'promotion') return count === 1 ? 'promotion' : 'promotions';
    if (kind === 'home') return count === 1 ? 'home page' : 'home pages';
    if (kind === 'slideshow') return count === 1 ? 'slideshow' : 'slideshows';
    if (kind === 'location') return count === 1 ? 'location' : 'locations';
    return count === 1 ? 'file' : 'files';
  }

  function summarizeDraftKinds(previews) {
    var tallies = {};
    previews.forEach(function (p) {
      var k = draftKindKey(p);
      tallies[k] = (tallies[k] || 0) + 1;
    });
    return Object.keys(tallies).map(function (k) {
      return tallies[k] + ' ' + draftKindPluralLabel(k, tallies[k]);
    });
  }

  function analysisClientId() {
    return CMS_CLIENT_ID || global.CLIENT_ID || global.SITE_CLIENT_ID || '_ttms_menu_demo';
  }

  function overlayValueIsEmpty(v) {
    if (v == null) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') return Object.keys(v).length === 0;
    return false;
  }

  function mergeFrontMatterClient(base, overlay) {
    base = base && typeof base === 'object' ? base : {};
    overlay = overlay && typeof overlay === 'object' ? overlay : {};
    var out = {};
    Object.keys(base).forEach(function (k) {
      out[k] = base[k];
    });
    Object.keys(overlay).forEach(function (k) {
      if (overlay[k] == null) return;
      if (overlayValueIsEmpty(overlay[k]) && out[k] != null) return;
      if (
        out[k] &&
        typeof out[k] === 'object' &&
        !Array.isArray(out[k]) &&
        typeof overlay[k] === 'object' &&
        !Array.isArray(overlay[k])
      ) {
        out[k] = mergeFrontMatterClient(out[k], overlay[k]);
      } else if (!overlayValueIsEmpty(overlay[k])) {
        out[k] = overlay[k];
      }
    });
    return out;
  }

  function yamlScalar(value) {
    if (value == null) return '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    var s = String(value);
    if (s.indexOf('\n') >= 0) return JSON.stringify(s);
    if (/[:#\[\]{}&*!|>'"%@`,]/.test(s) || /^\s/.test(s) || /\s$/.test(s)) {
      return JSON.stringify(s);
    }
    return s;
  }

  function yamlLine(key, value, indent) {
    indent = indent || '';
    if (value == null) return '';
    if (Array.isArray(value)) {
      if (!value.length) return indent + key + ': []';
      return value
        .map(function (v) {
          return indent + key + ':\n' + indent + '  - ' + yamlScalar(v);
        })
        .join('\n');
    }
    if (typeof value === 'object') {
      var lines = [indent + key + ':'];
      Object.keys(value).forEach(function (sk) {
        var child = yamlLine(sk, value[sk], indent + '  ');
        if (child) lines.push(child);
      });
      return lines.join('\n');
    }
    return indent + key + ': ' + yamlScalar(value);
  }

  function frontMatterToYaml(fm) {
    if (!fm || typeof fm !== 'object') return '';
    return Object.keys(fm)
      .sort()
      .map(function (k) {
        return yamlLine(k, fm[k], '');
      })
      .filter(Boolean)
      .join('\n');
  }

  function previewPayloadFromPreview(p) {
    var payload = p.payload || p.Payload || {};
    return {
      kind: payload.kind || p.kind || 'content',
      contentPath:
        p.content_path ||
        payload.contentPath ||
        payload.content_path ||
        payload.siteConfigPath ||
        '',
      frontMatter: payload.frontMatter || payload.front_matter || {},
      body: payload.body != null ? String(payload.body) : '',
    };
  }

  function buildMergedFileText(payload, live) {
    if (!payload) return '';
    if (payload.kind === 'theme-css' || payload.contentPath === 'static/css/colors.css') {
      var body = String(payload.body || '').trim();
      if (!body && live && live.body) body = String(live.body);
      return body;
    }
    var mergedFM = mergeFrontMatterClient(live && live.frontMatter, payload.frontMatter);
    var body = String(payload.body || '').trim();
    if (!body && live && live.body) body = String(live.body);
    var parts = ['---'];
    var yaml = frontMatterToYaml(mergedFM);
    if (yaml) parts.push(yaml);
    parts.push('---', '');
    if (body) parts.push(body);
    return parts.join('\n').replace(/\n+$/, '') + '\n';
  }

  function lineDiffStats(oldText, newText) {
    oldText = String(oldText || '');
    newText = String(newText || '');
    if (oldText === newText) return { added: 0, removed: 0 };
    var oldLines = oldText.split('\n');
    var newLines = newText.split('\n');
    var oldCount = {};
    var newCount = {};
    oldLines.forEach(function (l) {
      oldCount[l] = (oldCount[l] || 0) + 1;
    });
    newLines.forEach(function (l) {
      newCount[l] = (newCount[l] || 0) + 1;
    });
    var removed = 0;
    var added = 0;
    Object.keys(oldCount).forEach(function (l) {
      var n = newCount[l] || 0;
      if (oldCount[l] > n) removed += oldCount[l] - n;
    });
    Object.keys(newCount).forEach(function (l) {
      var o = oldCount[l] || 0;
      if (newCount[l] > o) added += newCount[l] - o;
    });
    return { added: added, removed: removed };
  }

  function valuesEqual(a, b) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (e) {
      return a === b;
    }
  }

  var REORDER_FM_KEYS = ['title', 'weight', 'date'];

  function normalizeContentFileResponse(data) {
    if (!data) return null;
    if (data.frontMatter != null || data.body !== undefined || data.contentPath) return data;
    if (data.data && typeof data.data === 'object') return normalizeContentFileResponse(data.data);
    return null;
  }

  function mergedPayloadState(payload, live) {
    var liveFM = (live && live.frontMatter) || {};
    var mergedFM = mergeFrontMatterClient(liveFM, payload.frontMatter || {});
    var liveBody = String((live && live.body) || '').trim();
    var draftBody = String(payload.body || '').trim();
    var mergedBody = draftBody || liveBody;
    return { liveFM: liveFM, mergedFM: mergedFM, liveBody: liveBody, mergedBody: mergedBody };
  }

  function classifyDraftChangeWithoutLive(payload) {
    if (!payload) return 'content';
    if (payload.kind === 'theme-css' || payload.contentPath === 'static/css/colors.css') {
      return 'theme';
    }
    var fm = payload.frontMatter || {};
    var keys = Object.keys(fm).filter(function (k) {
      return !overlayValueIsEmpty(fm[k]);
    });
    if (String(payload.body || '').trim()) return 'content';
    if (!keys.length) return 'rearrange';
    var reorderShapeKeys = ['title', 'weight', 'date', 'icon', 'images'];
    var hasNonReorderShape = keys.some(function (k) {
      return reorderShapeKeys.indexOf(k) < 0;
    });
    if (!hasNonReorderShape) return 'rearrange';
    // Reorder saves may still carry Hugo API metadata (prices, tags, etc.) without body edits.
    if (keys.indexOf('weight') >= 0) {
      var reorderBatchKeys = reorderShapeKeys.concat([
        'prices',
        'tags',
        'ingredients',
        'cookingmethods',
        'types',
        'events',
        'promotions',
        'side_categories',
      ]);
      var onlyReorderBatch = keys.every(function (k) {
        return reorderBatchKeys.indexOf(k) >= 0;
      });
      if (onlyReorderBatch) return 'rearrange';
    }
    return 'content';
  }

  function classifyDraftChange(payload, live) {
    if (!payload) return 'content';
    if (payload.kind === 'theme-css' || payload.contentPath === 'static/css/colors.css') {
      return 'theme';
    }
    if (!live) return classifyDraftChangeWithoutLive(payload);
    var state = mergedPayloadState(payload, live);
    var hasBodyEdit =
      String(payload.body || '').trim() && state.mergedBody !== state.liveBody;
    if (hasBodyEdit) return 'content';

    if (!String(payload.body || '').trim()) {
      var intentFM = {};
      REORDER_FM_KEYS.forEach(function (k) {
        var v = (payload.frontMatter || {})[k];
        if (v != null && !overlayValueIsEmpty(v)) intentFM[k] = v;
      });
      var intentMergedFM = mergeFrontMatterClient(state.liveFM, intentFM);
      var intentNonReorder = false;
      var allIntentKeys = {};
      Object.keys(state.liveFM).forEach(function (k) {
        allIntentKeys[k] = true;
      });
      Object.keys(intentMergedFM).forEach(function (k) {
        allIntentKeys[k] = true;
      });
      Object.keys(allIntentKeys).forEach(function (k) {
        if (valuesEqual(state.liveFM[k], intentMergedFM[k])) return;
        if (REORDER_FM_KEYS.indexOf(k) < 0) intentNonReorder = true;
      });
      if (!intentNonReorder) return 'rearrange';
    }

    var allKeySet = {};
    Object.keys(state.liveFM).forEach(function (k) {
      allKeySet[k] = true;
    });
    Object.keys(state.mergedFM).forEach(function (k) {
      allKeySet[k] = true;
    });
    var nonReorderChange = false;
    var reorderChange = false;
    Object.keys(allKeySet).forEach(function (k) {
      if (valuesEqual(state.liveFM[k], state.mergedFM[k])) return;
      if (REORDER_FM_KEYS.indexOf(k) >= 0) reorderChange = true;
      else nonReorderChange = true;
    });
    if (nonReorderChange) return 'content';
    if (reorderChange) return 'rearrange';
    return 'rearrange';
  }

  function computeDraftDiffStats(payload, live, category) {
    if (category === 'theme') {
      var liveBody = live ? String(live.body || '') : '';
      var mergedBody = String(payload.body || '').trim() || liveBody;
      return lineDiffStats(liveBody, mergedBody);
    }
    if (!live) return { added: 0, removed: 0 };
    var state = mergedPayloadState(payload, live);
    if (category === 'rearrange') {
      var added = 0;
      var removed = 0;
      REORDER_FM_KEYS.forEach(function (k) {
        if (!valuesEqual(state.liveFM[k], state.mergedFM[k])) {
          removed += 1;
          added += 1;
        }
      });
      if (state.mergedBody !== state.liveBody) {
        removed += 1;
        added += 1;
      }
      return { added: added, removed: removed };
    }
    var liveText = buildMergedFileText(
      {
        kind: payload.kind,
        contentPath: payload.contentPath,
        frontMatter: state.liveFM,
        body: state.liveBody,
      },
      null
    );
    var mergedText = buildMergedFileText(payload, live);
    return lineDiffStats(liveText, mergedText);
  }

  function changeCategoryLabel(category) {
    if (category === 'theme') return 'Theme';
    if (category === 'rearrange') return 'Item Position';
    return 'Content';
  }

  var DRAFT_GROUP_ORDER = ['rearrange', 'theme', 'content'];

  function sectionSlugFromDraftPath(path) {
    if (!path) return '';
    var parts = String(path).split('/');
    if (parts.length >= 2 && parts[0] === 'content') return parts[1];
    return '';
  }

  function isSectionIndexDraftPath(path) {
    return /\/_index\.md$/i.test(String(path || ''));
  }

  function isMenuItemDraftPath(path) {
    if (!path || isSectionIndexDraftPath(path)) return false;
    if (path === 'static/css/colors.css') return false;
    return /^content\/[^/]+\/.+\.md$/i.test(String(path));
  }

  function draftWeightFromPreview(p) {
    var payload = previewPayloadFromPreview(p);
    var fm = payload.frontMatter || {};
    var w = fm.weight;
    if (typeof w === 'number') return w;
    var n = parseInt(w, 10);
    return isNaN(n) ? 9999 : n;
  }

  function buildSectionWeightMapFromPreviews(previews) {
    var map = {};
    previews.forEach(function (p) {
      var path = draftContentPathFromPreview(p);
      if (!path || !isSectionIndexDraftPath(path)) return;
      var slug = sectionSlugFromDraftPath(path);
      if (slug) map[slug] = draftWeightFromPreview(p);
    });
    return map;
  }

  function comparePreviewsByMenuPublishOrder(a, b, sectionWeights) {
    var pathA = draftContentPathFromPreview(a);
    var pathB = draftContentPathFromPreview(b);
    var slugA = sectionSlugFromDraftPath(pathA);
    var slugB = sectionSlugFromDraftPath(pathB);
    var secWA =
      sectionWeights[slugA] != null
        ? sectionWeights[slugA]
        : isSectionIndexDraftPath(pathA)
          ? draftWeightFromPreview(a)
          : 9999;
    var secWB =
      sectionWeights[slugB] != null
        ? sectionWeights[slugB]
        : isSectionIndexDraftPath(pathB)
          ? draftWeightFromPreview(b)
          : 9999;
    if (secWA !== secWB) return secWA - secWB;
    var isSecA = isSectionIndexDraftPath(pathA);
    var isSecB = isSectionIndexDraftPath(pathB);
    if (isSecA && !isSecB) return -1;
    if (!isSecA && isSecB) return 1;
    var wA = draftWeightFromPreview(a);
    var wB = draftWeightFromPreview(b);
    if (wA !== wB) return wA - wB;
    return String(pathA || '').localeCompare(String(pathB || ''));
  }

  function sortDraftRowElementsByMenuOrder(rowElements, sectionWeights) {
    return rowElements.slice().sort(function (liA, liB) {
      var idxA = parseInt(liA.getAttribute('data-draft-index') || '', 10);
      var idxB = parseInt(liB.getAttribute('data-draft-index') || '', 10);
      if (isNaN(idxA) || isNaN(idxB)) return 0;
      return comparePreviewsByMenuPublishOrder(
        cachedPreviews[idxA],
        cachedPreviews[idxB],
        sectionWeights
      );
    });
  }

  function formatFieldLabel(key) {
    var labels = {
      weight: 'Position',
      title: 'Title',
      date: 'Date',
      prices: 'Prices',
      images: 'Images',
      tags: 'Tags',
      icon: 'Icon',
      ingredients: 'Ingredients',
      cookingmethods: 'Cooking methods',
      types: 'Types',
      events: 'Events',
      promotions: 'Promotions',
      side_categories: 'Side categories',
    };
    return labels[key] || String(key).replace(/_/g, ' ');
  }

  function formatChangeValue(v) {
    if (v == null) return '—';
    if (typeof v === 'string') {
      var t = v.trim();
      return t.length > 44 ? t.slice(0, 41) + '…' : t;
    }
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try {
      var s = JSON.stringify(v);
      return s.length > 52 ? s.slice(0, 49) + '…' : s;
    } catch (e) {
      return String(v);
    }
  }

  function computeProvisionalChangeDetails(payload, category) {
    var details = [];
    var fm = payload.frontMatter || {};
    if (category === 'theme') {
      details.push('Theme colors updated');
      return details;
    }
    if (category !== 'rearrange') {
      if (String(payload.body || '').trim()) details.push('Description edited');
      Object.keys(fm).forEach(function (k) {
        if (overlayValueIsEmpty(fm[k])) return;
        if (REORDER_FM_KEYS.indexOf(k) >= 0) return;
        details.push(formatFieldLabel(k) + ' updated');
      });
      return details.length ? details : ['Content updated'];
    }
    REORDER_FM_KEYS.forEach(function (k) {
      if (fm[k] == null || overlayValueIsEmpty(fm[k])) return;
      if (k === 'weight') {
        details.push('Position → weight ' + formatChangeValue(fm[k]));
      } else {
        details.push(formatFieldLabel(k) + ': ' + formatChangeValue(fm[k]));
      }
    });
    return details.length ? details : ['Position updated'];
  }

  function computeDraftChangeDetails(payload, live, category) {
    if (category === 'theme') {
      var draftBody = String(payload.body || '').trim();
      if (live && draftBody && draftBody !== String(live.body || '')) {
        return ['Theme CSS: ' + formatDiffStats(lineDiffStats(live.body, draftBody))];
      }
      return draftBody ? ['Theme colors updated'] : ['Theme unchanged'];
    }
    if (!live) return computeProvisionalChangeDetails(payload, category);

    var state = mergedPayloadState(payload, live);
    var details = [];
    if (String(payload.body || '').trim() && state.mergedBody !== state.liveBody) {
      details.push(
        'Description: ' + formatDiffStats(lineDiffStats(state.liveBody, state.mergedBody))
      );
    }
    REORDER_FM_KEYS.forEach(function (k) {
      if (valuesEqual(state.liveFM[k], state.mergedFM[k])) return;
      if (k === 'weight') {
        details.push(
          'Position: ' +
            formatChangeValue(state.liveFM[k]) +
            ' → ' +
            formatChangeValue(state.mergedFM[k])
        );
      } else {
        details.push(
          formatFieldLabel(k) +
            ': ' +
            formatChangeValue(state.liveFM[k]) +
            ' → ' +
            formatChangeValue(state.mergedFM[k])
        );
      }
    });
    if (category === 'content') {
      var skip = { title: true, date: true, weight: true };
      var seen = {};
      Object.keys(state.liveFM).forEach(function (k) {
        seen[k] = true;
      });
      Object.keys(state.mergedFM).forEach(function (k) {
        seen[k] = true;
      });
      Object.keys(seen).forEach(function (k) {
        if (skip[k]) return;
        if (valuesEqual(state.liveFM[k], state.mergedFM[k])) return;
        details.push(formatFieldLabel(k) + ' updated');
      });
    }
    return details.length
      ? details
      : category === 'rearrange'
        ? ['No position change vs Git']
        : ['Updated'];
  }

  function buildDraftAnalysis(payload, live) {
    var category = classifyDraftChange(payload, live);
    var diff = computeDraftDiffStats(payload, live, category);
    var changes = live
      ? computeDraftChangeDetails(payload, live, category)
      : computeProvisionalChangeDetails(payload, category);
    return {
      category: category,
      diff: diff,
      changes: changes,
    };
  }

  function formatDiffStats(diff) {
    if (!diff) return '';
    if (!diff.added && !diff.removed) return 'no line changes';
    return '+' + diff.added + ' \u2212' + diff.removed + ' lines';
  }

  function summarizeChangeCategories(previews) {
    var counts = { rearrange: 0, theme: 0, content: 0 };
    var pending = 0;
    previews.forEach(function (p) {
      var path = draftContentPathFromPreview(p);
      if (!path) {
        pending += 1;
        return;
      }
      var analysis = draftAnalyses[path];
      if (!analysis) {
        pending += 1;
        return;
      }
      var cat = analysis.category || 'content';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    var parts = [];
    if (counts.rearrange) parts.push(counts.rearrange + ' item position');
    if (counts.theme) parts.push(counts.theme + ' theme');
    if (counts.content) parts.push(counts.content + ' content');
    if (pending && !parts.length) return [];
    return parts;
  }

  function cmsPostJsonWithAuth(url, body) {
    return ensureAccessTokenForCms().then(function () {
      return fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
        body: JSON.stringify(body || {}),
      }).then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (e) {
            if (!res.ok) {
              throw new Error(
                (res.status ? res.status + ' ' : '') + (text || '').slice(0, 120) || res.statusText
              );
            }
          }
          return { ok: res.ok, status: res.status, data: data, text: text };
        });
      });
    }).then(function (res) {
      if (res.ok || (res.status !== 401 && res.status !== 403)) return res;
      var ac = global.AuthClient;
      if (!ac || typeof ac.refreshToken !== 'function') return res;
      return ac.refreshToken().then(function (rr) {
        if (!rr || !rr.success) return res;
        return fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
          body: JSON.stringify(body || {}),
        }).then(function (res2) {
          return res2.text().then(function (text) {
            var data = null;
            try {
              data = text ? JSON.parse(text) : null;
            } catch (e2) {
              /* ignore */
            }
            return { ok: res2.ok, status: res2.status, data: data, text: text };
          });
        });
      });
    });
  }

  function applyProvisionalDraftAnalyses() {
    cachedPreviews.forEach(function (p) {
      var path = draftContentPathFromPreview(p);
      if (!path) return;
      var payload = previewPayloadFromPreview(p);
      payload.contentPath = path;
      var built = buildDraftAnalysis(payload, null);
      draftAnalyses[path] = {
        category: built.category,
        diff: built.diff,
        changes: built.changes,
        provisional: true,
      };
    });
  }

  function applyDraftAnalysesFromLiveMap(liveByPath) {
    liveByPath = liveByPath || {};
    cachedPreviews.forEach(function (p) {
      var path = draftContentPathFromPreview(p);
      if (!path) return;
      var payload = previewPayloadFromPreview(p);
      payload.contentPath = path;
      var live = liveByPath[path];
      var built = buildDraftAnalysis(payload, live);
      draftAnalyses[path] = {
        category: built.category,
        diff: built.diff,
        changes: built.changes,
        provisional: false,
      };
    });
  }

  function fetchLiveContentFilesBatch(paths) {
    if (!paths.length) return Promise.resolve({});
    var url =
      cmsApiBase() +
      '/clients/' +
      encodeURIComponent(analysisClientId()) +
      '/content/files/batch';
    return cmsPostJsonWithAuth(url, { paths: paths }).then(function (res) {
      if (!res.ok) {
        console.warn('Batch content file read failed', res.status);
        return {};
      }
      var files = (res.data && res.data.files) || {};
      var liveByPath = {};
      paths.forEach(function (path) {
        var entry = files[path];
        liveByPath[path] = entry ? normalizeContentFileResponse(entry) : null;
      });
      return liveByPath;
    });
  }

  function getDraftChangeDetails(path) {
    var a = draftAnalyses[path];
    return a && a.changes ? a.changes.slice() : null;
  }

  function findPreviewForPath(path) {
    for (var i = 0; i < cachedPreviews.length; i++) {
      if (draftContentPathFromPreview(cachedPreviews[i]) === path) return cachedPreviews[i];
    }
    return null;
  }

  function registerDraftPreviewsForAnalysis(previews) {
    if (!previews || !previews.length) return Promise.resolve();
    cachedPreviews = dedupePreviewsByContentPath(cachedPreviews.concat(previews));
    var paths = [];
    var seen = {};
    previews.forEach(function (p) {
      var path = draftContentPathFromPreview(p);
      if (!path || seen[path]) return;
      seen[path] = true;
      paths.push(path);
    });
    if (!paths.length) return Promise.resolve();
    paths.forEach(function (path) {
      var p = findPreviewForPath(path);
      if (!p) return;
      var payload = previewPayloadFromPreview(p);
      payload.contentPath = path;
      var built = buildDraftAnalysis(payload, null);
      draftAnalyses[path] = {
        category: built.category,
        diff: built.diff,
        changes: built.changes,
        provisional: true,
      };
    });
    return ensureAccessTokenForCms().then(function () {
      return fetchLiveContentFilesBatch(paths).then(function (liveByPath) {
        paths.forEach(function (path) {
          var p = findPreviewForPath(path);
          if (!p) return;
          var payload = previewPayloadFromPreview(p);
          payload.contentPath = path;
          var live = liveByPath[path];
          var built = buildDraftAnalysis(payload, live);
          draftAnalyses[path] = {
            category: built.category,
            diff: built.diff,
            changes: built.changes,
            provisional: !live,
          };
        });
      });
    }).catch(function (err) {
      console.warn('registerDraftPreviewsForAnalysis', err);
    });
  }

  function createStatusStatPill(count, singular, plural) {
    var pill = document.createElement('span');
    pill.className = 'dashboard-menu-status-stat';
    var n = document.createElement('span');
    n.className = 'dashboard-menu-status-stat-num';
    n.textContent = String(count);
    pill.appendChild(n);
    pill.appendChild(document.createTextNode(' ' + (count === 1 ? singular : plural)));
    return pill;
  }

  function appendStatusRows(container, items, max) {
    var list = document.createElement('ul');
    list.className = 'dashboard-menu-status-rows';
    var cap = Math.min(max || 4, items.length);
    for (var i = 0; i < cap; i++) {
      list.appendChild(items[i]);
    }
    if (items.length > cap) {
      var more = document.createElement('li');
      more.className = 'dashboard-menu-status-row dashboard-menu-status-row--more';
      if (typeof arguments[3] === 'function') {
        var moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'dashboard-menu-status-more-btn';
        moreBtn.textContent =
          arguments[4] || 'View all ' + items.length + ' snapshots…';
        moreBtn.addEventListener('click', arguments[3]);
        more.appendChild(moreBtn);
      } else {
        more.textContent =
          '… and ' + (items.length - cap) + ' more';
      }
      list.appendChild(more);
    }
    container.appendChild(list);
  }

  function navigateEditDraftsWithVersion(versionId) {
    sessionStorage.setItem('editPreviewMode', 'drafts');
    if (versionId) {
      sessionStorage.setItem('editMenuVersionId', versionId);
      global.location.href =
        '/edit-menu-colors/?load=drafts&menu_version=' + encodeURIComponent(versionId);
    } else {
      sessionStorage.removeItem('editMenuVersionId');
      global.location.href = '/edit-menu-colors/?load=drafts';
    }
  }

  function navigateEditLive() {
    sessionStorage.setItem('editPreviewMode', 'live');
    sessionStorage.removeItem('editMenuVersionId');
    global.location.href = '/edit-menu-colors/';
  }

  function init(cfg) {
    cfg = cfg || {};
    CMS_SERVICE_URL = (cfg.cmsUrl || global.CMS_SERVICE_URL || 'https://cms.ttmenus.com').replace(
      /\/+$/,
      ''
    );
    CMS_API_URL = (cfg.cmsApiUrl || global.CMS_API_URL || '').replace(/\/+$/, '');
    CMS_CLIENT_ID = cfg.clientId
      || (global.DashboardClientContext && global.DashboardClientContext.cmsClientId && global.DashboardClientContext.cmsClientId())
      || global.CLIENT_ID
      || global.SITE_CLIENT_ID
      || '_ttms_menu_demo';
    loadOmittedDraftIds();
    loadDraftGroupCollapsed();
    loadStatusBlockCollapsed();

    var draftStatusClickBound = false;
    function bindDraftStatusClick() {
      if (!draftStatusEl || draftStatusClickBound) return;
      draftStatusClickBound = true;
      draftStatusEl.addEventListener('click', function (ev) {
        var groupToggle = ev.target.closest('[data-draft-group-toggle]');
        if (groupToggle) {
          ev.preventDefault();
          var groupKey = groupToggle.getAttribute('data-draft-group-toggle');
          if (!groupKey) return;
          toggleDraftGroupCollapsed(groupKey);
          renderDraftStatusSummary();
          return;
        }
        var restoreBtn = ev.target.closest('[data-draft-action="restore"]');
        if (!restoreBtn) return;
        ev.preventDefault();
        ev.stopPropagation();
        var idx = parseInt(restoreBtn.getAttribute('data-draft-index') || '', 10);
        if (isNaN(idx) || idx < 0 || idx >= cachedPreviews.length) return;
        restoreDraftToPublish(cachedPreviews[idx]);
        syncPublishButton();
        renderDraftStatusSummary();
      });
    }

    var editLink = document.getElementById('cardEditMenu');
    var contentLink = document.getElementById('cardEditMenuContent');
    var publishBtn = document.getElementById('cardPublishDrafts');
    var snapshotStatusEl = document.getElementById('dashboardSnapshotStatusSummary');
    var draftStatusEl = document.getElementById('dashboardDraftStatusSummary');
    var lastPublishEl = document.getElementById('dashboardLastPublishSummary');
    var publishFlashEl = document.getElementById('dashboardPublishFlash');

    function setStatusBlockSummary(blockKey, text) {
      var id =
        blockKey === 'snapshots'
          ? 'dashboardSnapshotBlockSummary'
          : blockKey === 'drafts'
            ? 'dashboardDraftBlockSummary'
            : 'dashboardLastPublishBlockSummary';
      var el = document.getElementById(id);
      if (!el) return;
      el.textContent = text || '';
    }

    function syncStatusBlockUI(blockKey) {
      var block = document.querySelector('[data-menu-status-block="' + blockKey + '"]');
      if (!block) return;
      var collapsed = isStatusBlockCollapsed(blockKey);
      block.classList.toggle('is-collapsed', collapsed);
      var toggle = block.querySelector('[data-menu-status-block-toggle="' + blockKey + '"]');
      if (toggle) toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }

    function syncAllStatusBlockUI() {
      STATUS_BLOCK_KEYS.forEach(syncStatusBlockUI);
    }

    function bindStatusBlockToggles() {
      STATUS_BLOCK_KEYS.forEach(function (blockKey) {
        var toggle = document.querySelector(
          '[data-menu-status-block-toggle="' + blockKey + '"]'
        );
        if (!toggle || toggle.__ttmsStatusBlockBound) return;
        toggle.__ttmsStatusBlockBound = true;
        toggle.addEventListener('click', function () {
          toggleStatusBlockCollapsed(blockKey);
          syncStatusBlockUI(blockKey);
        });
      });
    }

    var SNAPSHOT_MAX = 3;
    var SNAPSHOT_LIST_CAP = 3;
    var selectedSnapshotId = null;
    var snapshotListExpanded = false;

    function snapshotSelectionStorageKey() {
      return 'ttmenus_active_snapshot_' + CMS_CLIENT_ID;
    }

    function loadPersistedSnapshotSelection() {
      try {
        var v = localStorage.getItem(snapshotSelectionStorageKey());
        if (!v || v === 'live') return null;
        return String(v).trim();
      } catch (e) {
        return null;
      }
    }

    function persistSnapshotSelection() {
      try {
        localStorage.setItem(
          snapshotSelectionStorageKey(),
          selectedSnapshotId || 'live'
        );
      } catch (e) {}
    }

    function getSelectedSnapshotVersion() {
      if (!selectedSnapshotId) return null;
      for (var i = 0; i < cachedVersions.length; i++) {
        if (versionIdFromRecord(cachedVersions[i]) === selectedSnapshotId) {
          return cachedVersions[i];
        }
      }
      return null;
    }

    function getSnapshotSlotIndex(versionId) {
      for (var si = 0; si < cachedVersions.length; si++) {
        if (versionIdFromRecord(cachedVersions[si]) === versionId) return si + 1;
      }
      return 0;
    }

    function activeSnapshotSlotLabel() {
      if (!selectedSnapshotId) return 'Live menu';
      var idx = getSnapshotSlotIndex(selectedSnapshotId);
      var ver = getSelectedSnapshotVersion();
      var parts = ver ? snapshotDisplayParts(ver) : { title: 'Snapshot' };
      return 'Slot ' + idx + ' · ' + parts.title;
    }

    function syncEditorLinks() {
      var rearrangeLink = document.getElementById('cardRearrangeMenu');
      try {
        if (selectedSnapshotId) {
          sessionStorage.setItem('editPreviewMode', 'drafts');
          sessionStorage.setItem('editMenuVersionId', selectedSnapshotId);
        } else {
          sessionStorage.setItem('editPreviewMode', 'live');
          sessionStorage.removeItem('editMenuVersionId');
        }
      } catch (e) {}
      if (editLink) {
        editLink.classList.toggle(
          'dashboard-menu-status-editor-linked',
          !!selectedSnapshotId
        );
        editLink.setAttribute(
          'title',
          selectedSnapshotId
            ? 'Open theme editor with ' + activeSnapshotSlotLabel()
            : 'Open live menu in theme editor'
        );
      }
      if (rearrangeLink) {
        rearrangeLink.classList.toggle(
          'dashboard-menu-status-editor-linked',
          !!selectedSnapshotId
        );
        rearrangeLink.setAttribute(
          'title',
          selectedSnapshotId
            ? 'Rearrange menu from ' + activeSnapshotSlotLabel()
            : 'Rearrange live menu order'
        );
      }
      if (contentLink) {
        contentLink.classList.toggle(
          'dashboard-menu-status-editor-linked',
          !!selectedSnapshotId
        );
      }
    }

    function applySnapshotSelection(versionId) {
      selectedSnapshotId = versionId || null;
      if (
        selectedSnapshotId &&
        !cachedVersions.some(function (v) {
          return versionIdFromRecord(v) === selectedSnapshotId;
        })
      ) {
        selectedSnapshotId = null;
      }
      persistSnapshotSelection();
      syncEditorLinks();
      renderSnapshotStatusSummary();
      renderDraftStatusSummary();
      analyzeDraftsAgainstBaseline();
    }

    function showPublishFlashMessage(msg) {
      if (!publishFlashEl) return;
      publishFlashEl.textContent = msg;
      publishFlashEl.classList.remove('hidden');
      if (global.__ttmsPublishFlashTimer) clearTimeout(global.__ttmsPublishFlashTimer);
      global.__ttmsPublishFlashTimer = setTimeout(function () {
        publishFlashEl.classList.add('hidden');
      }, 9000);
    }

    function renderSnapshotStatusSummary() {
      if (!snapshotStatusEl) return;
      snapshotStatusEl.textContent = '';
      if (snapshotLoadState === 'loading' || snapshotLoadState === 'idle') {
        setStatusBlockSummary('snapshots', 'Loading…');
        var pLoad = document.createElement('p');
        pLoad.className = 'dashboard-menu-status-muted dashboard-menu-status-loading';
        pLoad.textContent = 'Loading menu snapshots…';
        snapshotStatusEl.appendChild(pLoad);
        return;
      }
      if (snapshotLoadState === 'auth') {
        setStatusBlockSummary(
          'snapshots',
          snapshotLoadError ? truncateMiddle(snapshotLoadError, 72) : 'Sign in required'
        );
        var pAuth = document.createElement('p');
        pAuth.className = 'dashboard-menu-status-error';
        pAuth.textContent =
          snapshotLoadError || 'Could not load menu snapshots. Sign out and sign in again.';
        snapshotStatusEl.appendChild(pAuth);
        return;
      }
      if (snapshotLoadState === 'error') {
        setStatusBlockSummary(
          'snapshots',
          snapshotLoadError ? truncateMiddle(snapshotLoadError, 72) : 'Could not load snapshots'
        );
        var pErr = document.createElement('p');
        pErr.className = 'dashboard-menu-status-error';
        pErr.textContent =
          snapshotLoadError || 'Could not load menu snapshots. Refresh the page or try again.';
        snapshotStatusEl.appendChild(pErr);
        return;
      }
      var n = cachedVersions.length;
      if (n === 0) {
        setStatusBlockSummary('snapshots', 'No snapshots saved');
        var p0 = document.createElement('p');
        p0.className = 'dashboard-menu-status-muted';
        p0.textContent =
          'No saved menu snapshots on the CMS. In the theme editor, use Save → Save snapshot (CMS only), or leave the editor to auto-save one (up to ' +
          SNAPSHOT_MAX +
          ' kept).';
        snapshotStatusEl.appendChild(p0);
        selectedSnapshotId = null;
        return;
      }
      setStatusBlockSummary(
        'snapshots',
        selectedSnapshotId
          ? activeSnapshotSlotLabel() + ' active'
          : n + ' snapshot' + (n === 1 ? '' : 's') + ' saved (max ' + SNAPSHOT_MAX + ')'
      );
      if (
        selectedSnapshotId &&
        !cachedVersions.some(function (v) {
          return versionIdFromRecord(v) === selectedSnapshotId;
        })
      ) {
        selectedSnapshotId = null;
      }
      var intro = document.createElement('p');
      intro.className = 'dashboard-menu-status-intro';
      intro.appendChild(createStatusStatPill(n, 'snapshot', 'snapshots'));
      intro.appendChild(
        document.createTextNode(
          ' saved on the CMS (max ' +
            SNAPSHOT_MAX +
            ') — menu layout in data/menu.json and theme colors.'
        )
      );
      snapshotStatusEl.appendChild(intro);
      var hint = document.createElement('p');
      hint.className = 'dashboard-menu-status-muted';
      hint.textContent =
        'Pick a save slot to load that snapshot on the dashboard. Edit theme, rearrange, and draft comparisons use the active slot until you switch back to Live.';
      snapshotStatusEl.appendChild(hint);
      if (n >= SNAPSHOT_MAX) {
        var capNote = document.createElement('p');
        capNote.className = 'dashboard-menu-status-muted';
        capNote.textContent =
          'Oldest snapshots are removed automatically when a new one is saved.';
        snapshotStatusEl.appendChild(capNote);
      }

      var slotGrid = document.createElement('div');
      slotGrid.className = 'dashboard-menu-status-slot-grid';
      slotGrid.setAttribute('role', 'listbox');
      slotGrid.setAttribute('aria-label', 'Menu save slots');

      var liveBtn = document.createElement('button');
      liveBtn.type = 'button';
      liveBtn.className = 'dashboard-menu-status-slot dashboard-menu-status-slot--live';
      liveBtn.setAttribute('role', 'option');
      if (!selectedSnapshotId) {
        liveBtn.classList.add('dashboard-menu-status-slot--active');
        liveBtn.setAttribute('aria-selected', 'true');
      } else {
        liveBtn.setAttribute('aria-selected', 'false');
      }
      liveBtn.innerHTML =
        '<span class="dashboard-menu-status-slot-label">Live</span>' +
        '<span class="dashboard-menu-status-slot-title">Published menu</span>' +
        '<span class="dashboard-menu-status-slot-when">Git + live site</span>';
      liveBtn.addEventListener('click', function () {
        applySnapshotSelection(null);
      });
      slotGrid.appendChild(liveBtn);

      for (var slotNum = 1; slotNum <= SNAPSHOT_MAX; slotNum++) {
        var version = cachedVersions[slotNum - 1];
        var slotBtn = document.createElement('button');
        slotBtn.type = 'button';
        slotBtn.className = 'dashboard-menu-status-slot';
        slotBtn.setAttribute('role', 'option');
        if (!version) {
          slotBtn.classList.add('dashboard-menu-status-slot--empty');
          slotBtn.disabled = true;
          slotBtn.setAttribute('aria-selected', 'false');
          slotBtn.innerHTML =
            '<span class="dashboard-menu-status-slot-label">Slot ' +
            slotNum +
            '</span>' +
            '<span class="dashboard-menu-status-slot-title">Empty</span>' +
            '<span class="dashboard-menu-status-slot-when">No snapshot saved</span>';
        } else {
          var parts = snapshotDisplayParts(version);
          var vid = versionIdFromRecord(version);
          if (vid && vid === selectedSnapshotId) {
            slotBtn.classList.add('dashboard-menu-status-slot--active');
            slotBtn.setAttribute('aria-selected', 'true');
          } else {
            slotBtn.setAttribute('aria-selected', 'false');
          }
          slotBtn.innerHTML =
            '<span class="dashboard-menu-status-slot-label">Slot ' +
            slotNum +
            '</span>' +
            '<span class="dashboard-menu-status-slot-title">' +
            truncateMiddle(parts.title, 42) +
            '</span>' +
            (parts.when
              ? '<span class="dashboard-menu-status-slot-when">' + parts.when + '</span>'
              : '');
          slotBtn.addEventListener('click', function (id) {
            return function () {
              applySnapshotSelection(id);
            };
          }(vid));
        }
        slotGrid.appendChild(slotBtn);
      }
      snapshotStatusEl.appendChild(slotGrid);

      if (selectedSnapshotId) {
        var selectedVersion = null;
        for (var sv = 0; sv < cachedVersions.length; sv++) {
          if (versionIdFromRecord(cachedVersions[sv]) === selectedSnapshotId) {
            selectedVersion = cachedVersions[sv];
            break;
          }
        }
        if (selectedVersion) {
          var summary = versionSummaryFromRecord(selectedVersion);
          var labels = summary.fileLabels || [];
          var detail = document.createElement('div');
          detail.className = 'dashboard-menu-status-snapshot-detail';
          var detailTitle = document.createElement('p');
          detailTitle.className = 'dashboard-menu-status-snapshot-detail-title';
          detailTitle.textContent = 'Repo files in this snapshot';
          detail.appendChild(detailTitle);
          if (labels.length) {
            var filesUl = document.createElement('ul');
            filesUl.className = 'dashboard-menu-status-snapshot-files';
            labels.forEach(function (label) {
              var fileLi = document.createElement('li');
              fileLi.className = 'dashboard-menu-status-snapshot-file';
              fileLi.textContent = label;
              filesUl.appendChild(fileLi);
            });
            detail.appendChild(filesUl);
          } else {
            var noFiles = document.createElement('p');
            noFiles.className = 'dashboard-menu-status-muted';
            noFiles.textContent = 'No file summary available for this snapshot.';
            detail.appendChild(noFiles);
          }
          var restoreBtn = document.createElement('button');
          restoreBtn.type = 'button';
          restoreBtn.className =
            'btn-dash btn-dash-secondary dashboard-menu-status-snapshot-restore';
          restoreBtn.innerHTML =
            '<i class="fa fa-paint-brush" aria-hidden="true"></i> Open in theme editor';
          restoreBtn.addEventListener('click', function () {
            navigateEditDraftsWithVersion(selectedSnapshotId);
          });
          detail.appendChild(restoreBtn);
          snapshotStatusEl.appendChild(detail);
        }
      }
    }

    function draftBlockSummaryText(n, publishableCount) {
      if (n === 0) return 'No unpublished drafts';
      if (publishableCount === n) {
        return n + ' draft' + (n === 1 ? '' : 's') + ' ready to publish';
      }
      if (publishableCount === 0) {
        return n + ' draft' + (n === 1 ? '' : 's') + ' saved — all omitted';
      }
      return (
        n +
        ' saved · ' +
        publishableCount +
        ' ready to publish'
      );
    }

    function renderDraftStatusSummary() {
      if (!draftStatusEl) return;
      bindDraftStatusClick();
      draftStatusEl.textContent = '';
      if (draftLoadState === 'loading' || draftLoadState === 'idle') {
        setStatusBlockSummary('drafts', 'Loading…');
        var pLoadD = document.createElement('p');
        pLoadD.className = 'dashboard-menu-status-muted dashboard-menu-status-loading';
        pLoadD.textContent = 'Loading content drafts…';
        draftStatusEl.appendChild(pLoadD);
        return;
      }
      if (draftLoadState === 'auth') {
        setStatusBlockSummary(
          'drafts',
          draftLoadError ? truncateMiddle(draftLoadError, 72) : 'Sign in required'
        );
        var pAuthD = document.createElement('p');
        pAuthD.className = 'dashboard-menu-status-error';
        pAuthD.textContent =
          draftLoadError || 'Could not load content drafts. Sign out and sign in again.';
        draftStatusEl.appendChild(pAuthD);
        return;
      }
      if (draftLoadState === 'error') {
        setStatusBlockSummary(
          'drafts',
          draftLoadError ? truncateMiddle(draftLoadError, 72) : 'Could not load drafts'
        );
        var pErrD = document.createElement('p');
        pErrD.className = 'dashboard-menu-status-error';
        pErrD.textContent =
          draftLoadError || 'Could not load content drafts. Refresh the page or try again.';
        draftStatusEl.appendChild(pErrD);
        return;
      }
      var n = cachedPreviews.length;
      var publishable = getPublishablePreviews();
      var publishableCount = publishable.length;
      setStatusBlockSummary('drafts', draftBlockSummaryText(n, publishableCount));
      if (n === 0) {
        var p0 = document.createElement('p');
        p0.className = 'dashboard-menu-status-muted';
        p0.textContent =
          'No unpublished content drafts. Edits to menu items, sections, and promotions appear here after you save from the live menu editor. Theme color drafts appear when you save from Edit theme.';
        draftStatusEl.appendChild(p0);
        return;
      }
      var introD = document.createElement('p');
      introD.className = 'dashboard-menu-status-intro';
      if (publishableCount === n) {
        introD.appendChild(createStatusStatPill(n, 'draft', 'drafts'));
        introD.appendChild(document.createTextNode(' ready to publish.'));
      } else if (publishableCount === 0) {
        introD.appendChild(createStatusStatPill(n, 'draft', 'drafts'));
        introD.appendChild(document.createTextNode(' saved — all omitted from publish.'));
      } else {
        introD.appendChild(createStatusStatPill(n, 'draft', 'drafts'));
        introD.appendChild(document.createTextNode(' saved · '));
        introD.appendChild(createStatusStatPill(publishableCount, 'draft', 'drafts'));
        introD.appendChild(document.createTextNode(' ready to publish.'));
      }
      draftStatusEl.appendChild(introD);
      if (selectedSnapshotId) {
        var snapBanner = document.createElement('p');
        snapBanner.className = 'dashboard-menu-status-snapshot-active-banner';
        snapBanner.textContent =
          'Drafts compared against ' +
          activeSnapshotSlotLabel() +
          '. Publish still updates live Git.';
        draftStatusEl.appendChild(snapBanner);
      } else {
        var liveBanner = document.createElement('p');
        liveBanner.className = 'dashboard-menu-status-muted';
        liveBanner.textContent =
          'Drafts compared against the live published menu. Select a snapshot slot to compare against a saved layout instead.';
        draftStatusEl.appendChild(liveBanner);
      }
      var hintD = document.createElement('p');
      hintD.className = 'dashboard-menu-status-muted';
      hintD.textContent =
        'Click × to omit from publish. Use Include to restore an omitted draft. Click × again on an omitted draft to delete (with confirmation).';
      draftStatusEl.appendChild(hintD);
      var groupedRows = { rearrange: [], theme: [], content: [] };
      for (var di = 0; di < n; di++) {
        var preview = cachedPreviews[di];
        var liD = document.createElement('li');
        liD.className = 'dashboard-menu-status-row dashboard-menu-status-draft-row';
        liD.setAttribute('data-draft-index', String(di));
        if (isDraftOmitted(preview)) {
          liD.classList.add('is-omitted-from-publish');
        }
        var chip = document.createElement('div');
        chip.className = 'dashboard-menu-status-draft-chip';
        if (isDraftOmitted(preview)) {
          chip.classList.add('is-omitted-from-publish');
        }
        var path = draftContentPathFromPreview(preview);
        var analysis = path && draftAnalyses[path];
        if (isMenuItemDraftPath(path)) {
          liD.classList.add('dashboard-menu-status-draft-row--nested');
        }
        var titleSpan = document.createElement('span');
        titleSpan.className = 'dashboard-menu-status-draft-chip-title';
        titleSpan.textContent = truncateMiddle(previewDisplayTitle(preview), 96);
        chip.appendChild(titleSpan);
        if (path) {
          var pathSpan = document.createElement('span');
          pathSpan.className = 'dashboard-menu-status-draft-chip-path';
          pathSpan.textContent = path;
          chip.appendChild(pathSpan);
        }
        if (analysis && analysis.changes && analysis.changes.length) {
          var changesSpan = document.createElement('span');
          changesSpan.className = 'dashboard-menu-status-draft-chip-changes';
          changesSpan.textContent = analysis.changes.join(' · ');
          chip.appendChild(changesSpan);
        }
        if (analysis && !analysis.provisional) {
          var diffSpan = document.createElement('span');
          diffSpan.className = 'dashboard-menu-status-draft-chip-diff';
          diffSpan.textContent = formatDiffStats(analysis.diff);
          chip.appendChild(diffSpan);
        }
        if (isDraftOmitted(preview)) {
          var omittedNote = document.createElement('span');
          omittedNote.className = 'dashboard-menu-status-draft-omitted-note';
          omittedNote.textContent = 'Omitted from publish';
          chip.appendChild(omittedNote);
        }
        liD.appendChild(chip);

        var actions = document.createElement('div');
        actions.className = 'dashboard-menu-status-draft-actions';
        if (isDraftOmitted(preview)) {
          var restoreBtn = document.createElement('button');
          restoreBtn.type = 'button';
          restoreBtn.className = 'dashboard-menu-status-draft-restore';
          restoreBtn.setAttribute('data-draft-action', 'restore');
          restoreBtn.setAttribute('data-draft-index', String(di));
          restoreBtn.setAttribute('aria-label', 'Include in publish');
          restoreBtn.title = 'Include in publish';
          restoreBtn.innerHTML = '<i class="fa fa-undo" aria-hidden="true"></i>';
          actions.appendChild(restoreBtn);
        }
        actions.appendChild(
          createDraftManageButton(preview, {
            onOmit: function () {
              syncPublishButton();
              renderDraftStatusSummary();
            },
            onDelete: function () {
              fetchPreviews();
            },
          })
        );
        liD.appendChild(actions);
        var groupKey =
          analysis && analysis.category && groupedRows[analysis.category]
            ? analysis.category
            : 'content';
        groupedRows[groupKey].push(liD);
      }
      var sectionWeightMap = buildSectionWeightMapFromPreviews(cachedPreviews);
      if (groupedRows.rearrange.length) {
        groupedRows.rearrange = sortDraftRowElementsByMenuOrder(
          groupedRows.rearrange,
          sectionWeightMap
        );
      }
      var rowsD = [];
      DRAFT_GROUP_ORDER.forEach(function (groupKey) {
        var items = groupedRows[groupKey];
        if (!items.length) return;
        var collapsed = isDraftGroupCollapsed(groupKey);
        var headerLi = document.createElement('li');
        headerLi.className =
          'dashboard-menu-status-draft-group-header dashboard-menu-status-draft-group-header--' +
          groupKey +
          (collapsed ? ' is-collapsed' : '');
        var toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'dashboard-menu-status-draft-group-toggle';
        toggleBtn.setAttribute('data-draft-group-toggle', groupKey);
        toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        var chevron = document.createElement('span');
        chevron.className = 'dashboard-menu-status-draft-group-toggle-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.innerHTML = '<i class="fa fa-chevron-down"></i>';
        toggleBtn.appendChild(chevron);
        var headerBadge = document.createElement('span');
        headerBadge.className =
          'dashboard-menu-status-draft-chip-badge dashboard-menu-status-draft-chip-badge--' +
          groupKey;
        headerBadge.textContent = changeCategoryLabel(groupKey);
        toggleBtn.appendChild(headerBadge);
        var countSpan = document.createElement('span');
        countSpan.className = 'dashboard-menu-status-draft-group-count';
        countSpan.textContent =
          items.length + ' file' + (items.length === 1 ? '' : 's');
        toggleBtn.appendChild(countSpan);
        headerLi.appendChild(toggleBtn);
        rowsD.push(headerLi);
        items.forEach(function (row) {
          row.setAttribute('data-draft-group', groupKey);
          if (collapsed) row.classList.add('dashboard-menu-status-draft-row--collapsed');
          rowsD.push(row);
        });
      });
      appendStatusRows(draftStatusEl, rowsD, rowsD.length);
    }

    function analyzeDraftsAgainstBaseline() {
      if (draftAnalysisInFlight) return draftAnalysisInFlight;
      draftAnalyses = {};
      var paths = [];
      var seen = {};
      cachedPreviews.forEach(function (p) {
        var path = draftContentPathFromPreview(p);
        if (!path || seen[path]) return;
        seen[path] = true;
        paths.push(path);
      });
      if (!paths.length) return Promise.resolve();
      var snapVer = getSelectedSnapshotVersion();
      var md =
        snapVer && (snapVer.menu_data || snapVer.menuData || snapVer.MenuData);
      var snapshotMap = buildSnapshotLiveMapFromMenuData(md);
      applyProvisionalDraftAnalyses();
      renderDraftStatusSummary();
      draftAnalysisInFlight = fetchLiveContentFilesBatch(paths)
        .then(function (liveByPath) {
          var merged = {};
          Object.keys(liveByPath || {}).forEach(function (p) {
            merged[p] = liveByPath[p];
          });
          Object.keys(snapshotMap).forEach(function (p) {
            merged[p] = snapshotMap[p];
          });
          applyDraftAnalysesFromLiveMap(merged);
          renderDraftStatusSummary();
        })
        .catch(function (err) {
          console.warn('Draft analysis failed', err);
        })
        .finally(function () {
          draftAnalysisInFlight = null;
          renderDraftStatusSummary();
        });
      return draftAnalysisInFlight;
    }

    function lastPublishBlockSummaryText() {
      var raw = null;
      try {
        raw = localStorage.getItem(lastPublishStorageKey());
      } catch (e) {}
      if (!raw) return 'No publish record yet';
      var data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        data = null;
      }
      if (!data || !data.at) return 'No publish record yet';
      var when = data.at;
      try {
        when = new Date(data.at).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        });
      } catch (e2) {}
      var ok = data.ok !== false;
      var parts = [(ok ? 'Publish succeeded' : 'Publish failed') + ' · ' + when];
      if (data.count != null) {
        parts.push(data.count + ' file' + (data.count === 1 ? '' : 's'));
      }
      if (data.commitHash) parts.push('Git ' + String(data.commitHash).slice(0, 7));
      return parts.join(' · ');
    }

    function renderLastPublishSummary() {
      if (!lastPublishEl) return;
      setStatusBlockSummary('publish', lastPublishBlockSummaryText());
      lastPublishEl.textContent = '';
      var raw = null;
      try {
        raw = localStorage.getItem(lastPublishStorageKey());
      } catch (e) {}
      if (!raw) {
        var ph = document.createElement('p');
        ph.className = 'dashboard-menu-status-muted';
        ph.textContent =
          'When you publish content drafts, this shows the time, file count, what changed, and the Git commit when the server returns it.';
        lastPublishEl.appendChild(ph);
        return;
      }
      var data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        data = null;
      }
      if (!data || !data.at) {
        var pb = document.createElement('p');
        pb.className = 'dashboard-menu-status-muted';
        pb.textContent = 'No publish record found.';
        lastPublishEl.appendChild(pb);
        return;
      }
      var when = data.at;
      try {
        when = new Date(data.at).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        });
      } catch (e2) {}
      var ok = data.ok !== false;
      var line1 = document.createElement('p');
      line1.className = ok ? 'dashboard-menu-status-success' : 'dashboard-menu-status-error';
      line1.textContent = (ok ? 'Publish succeeded' : 'Publish failed') + ' · ' + when;
      lastPublishEl.appendChild(line1);
      var metaParts = [];
      if (data.count != null) metaParts.push(data.count + ' file' + (data.count === 1 ? '' : 's'));
      if (data.commitHash) metaParts.push('Git ' + String(data.commitHash).slice(0, 7));
      if (metaParts.length) {
        var line2 = document.createElement('p');
        line2.className = 'dashboard-menu-status-muted';
        line2.textContent = metaParts.join(' · ');
        lastPublishEl.appendChild(line2);
      }
      if (data.fileLabels && data.fileLabels.length) {
        var publishRows = [];
        var maxL = 5;
        for (var j = 0; j < Math.min(maxL, data.fileLabels.length); j++) {
          var liP = document.createElement('li');
          liP.className = 'dashboard-menu-status-row';
          var chipP = document.createElement('span');
          chipP.className = 'dashboard-menu-status-publish-chip';
          chipP.textContent = truncateMiddle(normalizeStoredFileLabel(data.fileLabels[j]), 88);
          liP.appendChild(chipP);
          publishRows.push(liP);
        }
        if (data.fileLabels.length > maxL) {
          var liMoreP = document.createElement('li');
          liMoreP.className = 'dashboard-menu-status-row dashboard-menu-status-row--more';
          liMoreP.textContent = '… and ' + (data.fileLabels.length - maxL) + ' more';
          publishRows.push(liMoreP);
        }
        appendStatusRows(lastPublishEl, publishRows, maxL + 1);
      }
    }

    function syncPublishButton() {
      if (!publishBtn) return;
      var publishable = getPublishablePreviews();
      if (cachedPreviews.length > 0) {
        publishBtn.classList.remove('hidden');
        publishBtn.classList.add('btn-dash-publish');
        publishBtn.disabled = publishable.length === 0;
        var label = publishBtn.querySelector('.card-publish-btn-label');
        var countText =
          'Publish' +
          (publishable.length > 1 ? ' (' + publishable.length + ')' : publishable.length === 0 ? ' (0)' : '');
        if (label) label.textContent = countText;
        else publishBtn.textContent = countText;
      } else {
        publishBtn.disabled = false;
        publishBtn.classList.add('hidden');
      }
    }

    function fetchMenuVersions() {
      snapshotLoadState = 'loading';
      snapshotLoadError = '';
      renderSnapshotStatusSummary();
      return cmsGetJsonWithAuth(cmsClientPath('/menu-versions'))
        .then(function (res) {
          if (!res.ok) {
            snapshotLoadState = res.status === 401 || res.status === 403 ? 'auth' : 'error';
            snapshotLoadError = cmsAuthFailureMessage(res);
            if (snapshotLoadError === '') return [];
            cachedVersions = [];
            renderSnapshotStatusSummary();
            return [];
          }
          var raw = normalizeVersionsPayload(res.data);
          cachedVersions = raw.slice().sort(function (a, b) {
            return versionSortKey(b) - versionSortKey(a);
          });
          snapshotLoadState = 'ok';
          snapshotLoadError = '';
          var persisted = loadPersistedSnapshotSelection();
          if (
            persisted &&
            cachedVersions.some(function (v) {
              return versionIdFromRecord(v) === persisted;
            })
          ) {
            selectedSnapshotId = persisted;
          } else {
            selectedSnapshotId = null;
          }
          syncEditorLinks();
          renderSnapshotStatusSummary();
          return cachedVersions;
        })
        .catch(function (err) {
          snapshotLoadState = 'error';
          snapshotLoadError = (err && err.message) || 'Network error loading snapshots';
          cachedVersions = [];
          renderSnapshotStatusSummary();
          return [];
        });
    }

    function fetchPreviews() {
      draftLoadState = 'loading';
      draftLoadError = '';
      renderDraftStatusSummary();
      return cmsGetJsonWithAuth(cmsClientPath('/content/previews'))
        .then(function (res) {
          if (!res.ok) {
            draftLoadState = res.status === 401 || res.status === 403 ? 'auth' : 'error';
            draftLoadError = cmsAuthFailureMessage(res);
            if (draftLoadError === '') return [];
            cachedPreviews = [];
            syncPublishButton();
            renderDraftStatusSummary();
            return [];
          }
          var raw = normalizePreviewsPayload(res.data);
          cachedPreviews = dedupePreviewsByContentPath(raw);
          pruneOmittedDraftIds();
          draftLoadState = 'ok';
          draftLoadError = '';
          syncPublishButton();
          renderDraftStatusSummary();
          return cachedPreviews;
        })
        .catch(function (err) {
          draftLoadState = 'error';
          draftLoadError = (err && err.message) || 'Network error loading drafts';
          cachedPreviews = [];
          syncPublishButton();
          renderDraftStatusSummary();
          return [];
        });
    }

    function refreshMenuCard() {
      if (refreshInFlight) return refreshInFlight;
      if (redirectToLoginIfUnauthenticated()) {
        return Promise.resolve();
      }
      snapshotLoadState = 'loading';
      draftLoadState = 'loading';
      renderSnapshotStatusSummary();
      renderDraftStatusSummary();
      refreshInFlight = ensureAccessTokenForCms()
        .then(function () {
          if (redirectToLoginIfUnauthenticated()) return;
          return Promise.all([fetchMenuVersions(), fetchPreviews()]).then(function () {
            analyzeDraftsAgainstBaseline();
          });
        })
        .finally(function () {
          refreshInFlight = null;
        });
      return refreshInFlight;
    }

    if (editLink) {
      editLink.addEventListener('click', function (ev) {
        ev.preventDefault();
        if (selectedSnapshotId) navigateEditDraftsWithVersion(selectedSnapshotId);
        else navigateEditLive();
      });
    }

    var rearrangeLink = document.getElementById('cardRearrangeMenu');
    if (rearrangeLink) {
      rearrangeLink.addEventListener('click', function (ev) {
        if (selectedSnapshotId) {
          ev.preventDefault();
          try {
            sessionStorage.setItem('editPreviewMode', 'drafts');
            sessionStorage.setItem('editMenuVersionId', selectedSnapshotId);
          } catch (e) {}
          global.location.href = '/edit-menu-rearrange/';
        }
      });
    }

    var publishSummaryModal = document.getElementById('dashboardPublishSummaryModal');
    var publishSummaryList = document.getElementById('dashboardPublishSummaryList');
    var publishSummaryCount = document.getElementById('dashboardPublishSummaryCount');
    var publishSummaryCancel = document.getElementById('dashboardPublishSummaryCancel');
    var publishSummaryConfirm = document.getElementById('dashboardPublishSummaryConfirm');

    function closePublishSummaryModal() {
      if (!publishSummaryModal) return;
      publishSummaryModal.classList.add('hidden');
      publishSummaryModal.setAttribute('aria-hidden', 'true');
    }

    if (publishSummaryModal) {
      var publishSummaryBackdrop = publishSummaryModal.querySelector(
        '.dashboard-publish-summary-backdrop'
      );
      if (publishSummaryBackdrop) {
        publishSummaryBackdrop.addEventListener('click', closePublishSummaryModal);
      }
      document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Escape') return;
        if (publishSummaryModal.classList.contains('hidden')) return;
        closePublishSummaryModal();
        ev.preventDefault();
      });
    }

    if (publishBtn) {
      publishBtn.addEventListener('click', function () {
        var publishable = getPublishablePreviews();
        if (publishable.length === 0) {
          if (cachedPreviews.length > 0) {
            alert(
              'No drafts selected for publish. Restore omitted drafts with × or save new edits.'
            );
          }
          return;
        }
        var pending = publishable.slice();
        function renderSummary() {
          if (!publishSummaryList || !publishSummaryCount) return;
          publishSummaryList.innerHTML = '';
          var countBase =
            pending.length === 0
              ? 'No files selected'
              : pending.length === 1
                ? '1 file ready to publish to Git'
                : pending.length + ' files ready to publish to Git';
          var catParts = summarizeChangeCategories(pending);
          publishSummaryCount.textContent =
            catParts.length ? countBase + ' (' + catParts.join(' · ') + ')' : countBase;
          if (publishSummaryConfirm) {
            publishSummaryConfirm.disabled = pending.length === 0;
            if (pending.length === 0) {
              publishSummaryConfirm.textContent = 'Nothing to publish';
            } else {
              publishSummaryConfirm.innerHTML =
                '<i class="fa fa-cloud-upload" aria-hidden="true"></i> Publish';
            }
          }
          pending.forEach(function (p) {
            var rowId = previewIdFromPreview(p);
            var li = document.createElement('li');
            li.className = 'dashboard-publish-summary-item';
            if (isDraftOmitted(p)) {
              li.classList.add('is-omitted-from-publish');
            }
            var label = document.createElement('span');
            label.className = 'dashboard-publish-summary-label';
            var path = draftContentPathFromPreview(p);
            var analysis = path && draftAnalyses[path];
            if (analysis) {
              var badge = document.createElement('span');
              badge.className =
                'dashboard-menu-status-draft-chip-badge dashboard-menu-status-draft-chip-badge--' +
                analysis.category;
              badge.textContent = changeCategoryLabel(analysis.category);
              label.appendChild(badge);
              label.appendChild(document.createTextNode(' '));
            }
            label.appendChild(document.createTextNode(previewDisplayTitle(p)));
            if (analysis) {
              var meta = document.createElement('span');
              meta.className = 'dashboard-publish-summary-meta';
              var metaParts = [];
              if (path) metaParts.push(path);
              if (analysis.changes && analysis.changes.length) {
                metaParts.push(analysis.changes.join(' · '));
              }
              if (!analysis.provisional) metaParts.push(formatDiffStats(analysis.diff));
              meta.textContent = metaParts.join(' · ');
              label.appendChild(meta);
            }
            var removeBtn = createDraftManageButton(p, {
              onOmit: function (preview) {
                var idx = pending.findIndex(function (x) {
                  return previewIdFromPreview(x) === previewIdFromPreview(preview);
                });
                if (idx !== -1) pending.splice(idx, 1);
                renderSummary();
                syncPublishButton();
                renderDraftStatusSummary();
              },
              onDelete: function (preview) {
                var idx = pending.findIndex(function (x) {
                  return previewIdFromPreview(x) === previewIdFromPreview(preview);
                });
                if (idx !== -1) pending.splice(idx, 1);
                renderSummary();
                fetchPreviews();
                if (pending.length === 0) closePublishSummaryModal();
              },
            });
            removeBtn.classList.add('dashboard-publish-summary-revert');
            li.appendChild(label);
            li.appendChild(removeBtn);
            publishSummaryList.appendChild(li);
          });
        }
        renderSummary();
        if (publishSummaryModal) {
          publishSummaryModal.classList.remove('hidden');
          publishSummaryModal.setAttribute('aria-hidden', 'false');
        }
        if (publishSummaryCancel) {
          publishSummaryCancel.onclick = closePublishSummaryModal;
        }
        if (publishSummaryConfirm) {
          publishSummaryConfirm.onclick = function () {
            if (pending.length === 0) return;
            publishSummaryConfirm.disabled = true;
            ensureAccessTokenForCms().then(function (token) {
              if (!token) {
                alert('CMS session expired. Sign out and sign in again.');
                publishSummaryConfirm.disabled = false;
                return;
              }
            var changes = pending.map(function (p) {
              var o = { payload: p.payload || p.Payload || {} };
              if (p.id) o.previewId = p.id;
              return o;
            });
            var body = {
              changes: changes,
              commitMessage: 'Publish ' + pending.length + ' change(s)',
            };
            var applyUrl = cmsClientPath('/content/apply-batch');
            var headers = getAuthHeaders();
            headers['Content-Type'] = 'application/json';
            fetch(applyUrl, {
              method: 'POST',
              credentials: 'include',
              headers: headers,
              body: JSON.stringify(body),
            })
              .then(function (res) {
                if (!res.ok)
                  return res.text().then(function (t) {
                    throw new Error(t);
                  });
                return res.json();
              })
              .then(function (resp) {
                var hash = resp && resp.commit && resp.commit.hash ? String(resp.commit.hash) : '';
                pending.forEach(function (p) {
                  clearOmitKeysForPreview(p);
                });
                saveOmittedDraftIds();
                var labels = pending.map(previewSummaryLabel);
                persistLastPublishRecord({
                  at: new Date().toISOString(),
                  ok: true,
                  count: pending.length,
                  commitHash: hash,
                  fileLabels: labels.slice(0, 24),
                });
                renderLastPublishSummary();
                var flashMsg =
                  'Success — ' +
                  pending.length +
                  ' file' +
                  (pending.length === 1 ? '' : 's') +
                  ' published to your live site.';
                if (hash) flashMsg += ' Git commit ' + hash.slice(0, 7) + '.';
                showPublishFlashMessage(flashMsg);
                closePublishSummaryModal();
                publishSummaryConfirm.disabled = false;
                publishSummaryConfirm.innerHTML =
                  '<i class="fa fa-cloud-upload" aria-hidden="true"></i> Publish';
                return refreshMenuCard();
              })
              .catch(function (err) {
                console.error('Publish failed', err);
                alert('Publish failed: ' + (err.message || err));
                publishSummaryConfirm.disabled = false;
              });
            });
          };
        }
      });
    }

    var refreshScheduleTimer = null;
    function scheduleRefreshMenuCard() {
      if (refreshScheduleTimer) clearTimeout(refreshScheduleTimer);
      refreshScheduleTimer = setTimeout(function () {
        refreshScheduleTimer = null;
        if (document.getElementById('dashboardMenuStatusPanel')) refreshMenuCard();
      }, 350);
    }

    bindStatusBlockToggles();
    syncAllStatusBlockUI();
    renderLastPublishSummary();
    refreshMenuCard();

    global.addEventListener('pageshow', scheduleRefreshMenuCard);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') scheduleRefreshMenuCard();
    });

    global.addEventListener('ttms:auth-ready', scheduleRefreshMenuCard);

    if (contentLink) {
      contentLink.addEventListener('click', function () {
        try {
          sessionStorage.setItem('editMenuLiveMode', 'content');
          if (selectedSnapshotId) {
            sessionStorage.setItem('editPreviewMode', 'drafts');
            sessionStorage.setItem('editMenuVersionId', selectedSnapshotId);
          } else {
            sessionStorage.setItem('editPreviewMode', 'live');
            sessionStorage.removeItem('editMenuVersionId');
          }
        } catch (e) { /* ignore */ }
      });
    }

    global.__ttmsMenuStatusRefresh = refreshMenuCard;

    return { refresh: refreshMenuCard };
  }

  global.DashboardMenuStatus = {
    init: init,
    refresh: function () {
      if (typeof global.__ttmsMenuStatusRefresh === 'function') return global.__ttmsMenuStatusRefresh();
      return Promise.resolve();
    },
    getDraftChangeDetails: getDraftChangeDetails,
    registerDraftPreviewsForAnalysis: registerDraftPreviewsForAnalysis,
  };
})(typeof window !== 'undefined' ? window : this);
