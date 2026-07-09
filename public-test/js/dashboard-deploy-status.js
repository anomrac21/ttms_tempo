/**

 * Cluster deploy status — CMS SSE stream + build-info.json fallback (no polling).

 */

(function (global) {

  'use strict';



  var CMS_CLIENT_ID = '';

  var streamController = null;

  var streamReconnectTimer = null;

  var streamBackoffMs = 2000;

  var cachedEvents = [];



  function cmsApiBase() {

    return String(global.CMS_API_URL || 'https://cms.ttmenus.com/api').replace(/\/+$/, '');

  }



  function clientId() {

    if (global.DashboardClientContext && typeof global.DashboardClientContext.cmsClientId === 'function') {
      var resolved = global.DashboardClientContext.cmsClientId();
      if (resolved) return resolved;
    }

    return CMS_CLIENT_ID || global.CLIENT_ID || global.SITE_CLIENT_ID || '_ttms_menu_demo';

  }



  function shortSha(sha) {

    sha = String(sha || '').trim();

    if (!sha) return '';

    return sha.length > 7 ? sha.slice(0, 7) : sha;

  }



  function isAdmin() {

    return global.AuthClient && typeof global.AuthClient.isAdmin === 'function' && global.AuthClient.isAdmin();

  }



  function applyBadge(summary, buildInfo) {

    var badge = document.getElementById('dashboardDeployStatusBadge');

    var dot = document.getElementById('dashboardDeployStatusDot');

    if (!badge) return;



    var state = (summary && summary.state) || 'unknown';

    var label = (summary && summary.label) || 'Live';

    var detailText = (summary && summary.detail) || '';



    if (!detailText && buildInfo && buildInfo.commit && (!summary || !summary.live_commit)) {

      detailText = 'Live build ' + shortSha(buildInfo.commit) + ' (from build-info.json)';

    } else if (!detailText && summary && summary.live_commit) {

      detailText = 'Commit ' + shortSha(summary.live_commit) + ' on cluster';

    }



    badge.textContent = label;

    badge.setAttribute('data-state', state);

    badge.title = detailText || label;

    badge.setAttribute('aria-label', label + (detailText ? ': ' + detailText : ''));



    if (dot) {

      dot.setAttribute('data-state', state);

    }

  }



  function fetchBuildInfo() {

    return fetch('/build-info.json', { cache: 'no-store', credentials: 'same-origin' })

      .then(function (res) {

        if (!res.ok) return null;

        return res.json();

      })

      .catch(function () {

        return null;

      });

  }



  function fetchDeployStatus() {

    if (!isAdmin() || !global.AuthClient || typeof global.AuthClient.authenticatedRequest !== 'function') {

      return Promise.resolve(null);

    }

    return global.AuthClient.authenticatedRequest(

      cmsApiBase() + '/clients/' + encodeURIComponent(clientId()) + '/deployments/status',

      { method: 'GET' }

    ).then(function (result) {

      if (result && result.success && result.data) return result.data;

      return null;

    });

  }



  function refresh() {

    return Promise.all([fetchDeployStatus(), fetchBuildInfo()]).then(function (parts) {

      applyBadge(parts[0], parts[1]);

    });

  }



  function fetchDeployHistory(limit) {

    if (!isAdmin() || !global.AuthClient || typeof global.AuthClient.authenticatedRequest !== 'function') {

      return Promise.resolve([]);

    }

    var url =

      cmsApiBase() +

      '/clients/' +

      encodeURIComponent(clientId()) +

      '/deployments?limit=' +

      encodeURIComponent(String(limit || 50));

    return global.AuthClient.authenticatedRequest(url, { method: 'GET' }).then(function (result) {

      if (result && result.success && result.data && Array.isArray(result.data.events)) {

        return result.data.events;

      }

      return [];

    });

  }



  function formatTimestamp(ts) {

    if (!ts) return '—';

    try {

      return new Date(ts).toLocaleString();

    } catch (e) {

      return ts;

    }

  }



  function statusClass(status) {

    status = String(status || '').toLowerCase();

    if (status === 'success') return 'is-success';

    if (status === 'failure') return 'is-failure';

    if (status === 'running') return 'is-running';

    return 'is-neutral';

  }



  function renderHistoryTable(events) {

    var tbody = document.getElementById('dashboardDeployHistoryBody');

    var empty = document.getElementById('dashboardDeployHistoryEmpty');

    if (!tbody) return;

    tbody.innerHTML = '';

    if (!events || !events.length) {

      if (empty) empty.classList.remove('hidden');

      return;

    }

    if (empty) empty.classList.add('hidden');



    events.forEach(function (ev) {

      tbody.appendChild(buildHistoryRow(ev));

    });

  }



  function buildHistoryRow(ev) {

    var tr = document.createElement('tr');

    tr.setAttribute('data-event-id', ev.id || '');

    tr.innerHTML =

      '<td>' +

      formatTimestamp(ev.timestamp) +

      '</td>' +

      '<td><span class="dashboard-deploy-phase">' +

      (ev.phase || '—') +

      '</span></td>' +

      '<td><span class="dashboard-deploy-status-pill ' +

      statusClass(ev.status) +

      '">' +

      (ev.status || '—') +

      '</span></td>' +

      '<td><code class="dashboard-deploy-sha">' +

      (shortSha(ev.live_commit || ev.commit_sha) || '—') +

      '</code></td>' +

      '<td>' +

      (ev.message || '—') +

      '</td>' +

      '<td>' +

      (ev.workflow_run_url

        ? '<a href="' +

          ev.workflow_run_url +

          '" target="_blank" rel="noopener" class="dashboard-deploy-run-link">Run</a>'

        : '—') +

      '</td>';

    return tr;

  }



  function prependHistoryEvent(ev) {

    if (!ev) return;

    var tbody = document.getElementById('dashboardDeployHistoryBody');

    var empty = document.getElementById('dashboardDeployHistoryEmpty');

    if (!tbody) return;



    if (ev.id) {

      var existing = tbody.querySelector('tr[data-event-id="' + ev.id + '"]');

      if (existing) return;

    }



    cachedEvents.unshift(ev);

    if (cachedEvents.length > 100) cachedEvents.length = 100;



    if (empty) empty.classList.add('hidden');

    tbody.insertBefore(buildHistoryRow(ev), tbody.firstChild);



    var statusEl = document.getElementById('dashboardDeployHistoryStatus');

    if (statusEl) {

      statusEl.textContent = cachedEvents.length + ' event(s) · live updates enabled';

    }

  }



  function parseSSEChunk(buffer, onEvent) {

    var parts = buffer.split('\n\n');

    var rest = parts.pop() || '';

    parts.forEach(function (block) {

      block = block.trim();

      if (!block || block.indexOf(':') === 0) return;

      var eventType = 'message';

      var dataLines = [];

      block.split('\n').forEach(function (line) {

        if (line.indexOf('event:') === 0) {

          eventType = line.slice(6).trim();

        } else if (line.indexOf('data:') === 0) {

          dataLines.push(line.slice(5).trim());

        }

      });

      if (!dataLines.length) return;

      try {

        onEvent(eventType, JSON.parse(dataLines.join('\n')));

      } catch (e) {

        /* ignore malformed */

      }

    });

    return rest;

  }



  function handleStreamPayload(eventType, data) {

    if (eventType === 'status') {

      fetchBuildInfo().then(function (buildInfo) {

        applyBadge(data, buildInfo);

      });

      return;

    }

    if (eventType === 'deploy_event') {

      prependHistoryEvent(data);

    }

  }



  function stopDeployStream() {

    if (streamReconnectTimer) {

      clearTimeout(streamReconnectTimer);

      streamReconnectTimer = null;

    }

    if (streamController) {

      streamController.abort();

      streamController = null;

    }

  }



  function scheduleStreamReconnect() {

    if (streamReconnectTimer) return;

    streamReconnectTimer = setTimeout(function () {

      streamReconnectTimer = null;

      connectDeployStream();

      streamBackoffMs = Math.min(streamBackoffMs * 2, 60000);

    }, streamBackoffMs);

  }



  function connectDeployStream() {

    if (!isAdmin() || !global.AuthClient || typeof global.AuthClient.getAccessToken !== 'function') {

      return;

    }



    stopDeployStream();

    var token = global.AuthClient.getAccessToken();

    if (!token) {

      scheduleStreamReconnect();

      return;

    }



    streamController = new AbortController();

    var url = cmsApiBase() + '/clients/' + encodeURIComponent(clientId()) + '/deployments/stream';



    fetch(url, {

      method: 'GET',

      headers: {

        Authorization: 'Bearer ' + token,

        Accept: 'text/event-stream',

      },

      credentials: 'include',

      signal: streamController.signal,

    })

      .then(function (res) {

        if (!res.ok || !res.body) {

          throw new Error('Stream HTTP ' + res.status);

        }

        streamBackoffMs = 2000;

        var reader = res.body.getReader();

        var decoder = new TextDecoder();

        var buffer = '';



        function pump() {

          return reader.read().then(function (result) {

            if (result.done) {

              scheduleStreamReconnect();

              return;

            }

            buffer += decoder.decode(result.value, { stream: true });

            buffer = parseSSEChunk(buffer, handleStreamPayload);

            return pump();

          });

        }

        return pump();

      })

      .catch(function (err) {

        if (err && err.name === 'AbortError') return;

        scheduleStreamReconnect();

      });

  }



  function initHistoryPage() {

    var page = document.getElementById('dashboardDeploymentsPage');

    if (!page) return;

    var statusEl = document.getElementById('dashboardDeployHistoryStatus');

    if (statusEl) statusEl.textContent = 'Loading deploy history…';



    var ready =

      global.AuthClient && typeof global.AuthClient.whenReady === 'function'

        ? global.AuthClient.whenReady()

        : Promise.resolve();



    ready

      .then(function () {

        return Promise.all([fetchDeployStatus(), fetchDeployHistory(100), fetchBuildInfo()]);

      })

      .then(function (parts) {

        cachedEvents = parts[1] || [];

        applyBadge(parts[0], parts[2]);

        renderHistoryTable(cachedEvents);

        if (statusEl) {

          statusEl.textContent =

            cachedEvents.length > 0

              ? cachedEvents.length + ' event(s) · live updates enabled'

              : 'No deploy events yet — they appear when the Hugo cluster pipeline runs.';

        }

        connectDeployStream();

      })

      .catch(function () {

        if (statusEl) statusEl.textContent = 'Could not load deploy history.';

      });

  }



  function initHeader() {

    CMS_CLIENT_ID = clientId();

    var ready =

      global.AuthClient && typeof global.AuthClient.whenReady === 'function'

        ? global.AuthClient.whenReady()

        : Promise.resolve();

    ready.then(function () {

      refresh().then(function () {

        connectDeployStream();

      });

    });

  }



  function init() {

    if (document.getElementById('dashboardDeploymentsPage')) {

      initHistoryPage();

    } else if (document.getElementById('dashboardDeployStatusBadge')) {

      initHeader();

    }

  }



  global.DashboardDeployStatus = {

    init: init,

    refresh: refresh,

    fetchDeployHistory: fetchDeployHistory,

    connectDeployStream: connectDeployStream,

    stopDeployStream: stopDeployStream,

  };



  global.addEventListener('beforeunload', stopDeployStream);

})(typeof window !== 'undefined' ? window : this);


