/**
 * Client dashboard — notify-service: metrics, send, recent history, reports.
 * Expects window.NOTIFY_CONFIG.apiUrl, AuthClient.getAccessToken, and AuthClientAccess (guard runs in page).
 */
(function () {
  'use strict';

  /** Hugo jsonify in application/json tags can double-encode; normalize once. */
  function resolveNotifyConfig() {
    var cfg = window.NOTIFY_CONFIG;
    if (typeof cfg === 'string') {
      try {
        cfg = JSON.parse(cfg);
      } catch (e) {
        cfg = null;
      }
    }
    if (cfg && typeof cfg === 'object') {
      window.NOTIFY_CONFIG = cfg;
      return cfg;
    }
    return window.NOTIFY_CONFIG || {};
  }

  function getApiBase() {
    var page = document.getElementById('dashboardNotificationsPage');
    var cfg = resolveNotifyConfig();
    var base =
      (page && page.getAttribute('data-notify-api-url')) ||
      (cfg && cfg.apiUrl) ||
      '';
    if (!base && window.SiteConfig && window.SiteConfig.notifyServiceUrl) {
      base = String(window.SiteConfig.notifyServiceUrl).replace(/\/+$/, '') + '/api/v1';
    }
    return String(base).replace(/\/+$/, '');
  }

  function setFormsApiDisabled(disabled) {
    ['dashboardNotifySendForm', 'dashboardNotifyWelcomeForm'].forEach(function (id) {
      var form = document.getElementById(id);
      if (!form) return;
      form.querySelectorAll('input, textarea, select, button').forEach(function (el) {
        el.disabled = disabled;
      });
    });
  }

  function getClientDomain() {
    if (window.DashboardClientContext && typeof DashboardClientContext.notifyClientDomain === 'function') {
      var resolved = DashboardClientContext.notifyClientDomain();
      if (resolved) return resolved;
    }
    var page = document.getElementById('dashboardNotificationsPage');
    var fromPage = page && page.getAttribute('data-notify-client-domain');
    if (fromPage) return fromPage;
    var cfg = resolveNotifyConfig();
    if (cfg && cfg.clientDomain) {
      return cfg.clientDomain;
    }
    return window.location.hostname || '';
  }

  function authHeaders() {
    var h = { Accept: 'application/json', 'Content-Type': 'application/json' };
    var token =
      (window.AuthClient && AuthClient.getAccessToken && AuthClient.getAccessToken());
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  async function ensureNotifyToken() {
    if (window.AuthClient && AuthClient.getAccessToken && AuthClient.getAccessToken()) {
      return AuthClient.getAccessToken();
    }
    if (window.AuthClient && typeof AuthClient.ensureAccessToken === 'function') {
      var result = await AuthClient.ensureAccessToken();
      if (result.success) return AuthClient.getAccessToken();
    }
    return null;
  }

  async function notifyFetch(path, options) {
    var base = getApiBase();
    if (!base) {
      throw new Error('Notification API URL is not configured (site notifications).');
    }
    await ensureNotifyToken();
    var url = base + path;
    var headers = Object.assign({}, authHeaders(), (options && options.headers) || {});
    var res = await fetch(url, Object.assign({ credentials: 'include' }, options || {}, { headers: headers }));
    if (res.status === 401) {
      if (window.AuthClient && AuthClient.logout) {
        await AuthClient.logout().catch(function () {});
      }
      window.location.href = '/login/';
      throw new Error('Session expired. Please sign in again.');
    }
    var text = await res.text();
    var data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      if (!res.ok) throw new Error(text || res.statusText);
    }
    if (!res.ok) {
      var msg =
        (data && (data.error || data.message)) || text || 'Request failed (' + res.status + ')';
      if (data && data.details) msg += ': ' + data.details;
      throw new Error(msg);
    }
    return data;
  }

  function formatNum(n) {
    if (n == null || isNaN(n)) return '—';
    return String(Math.round(Number(n) * 10) / 10);
  }

  function formatInt(n) {
    if (n == null || isNaN(n)) return '—';
    return String(Math.floor(Number(n)));
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setMetricMeta(id, text) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  }

  var OVERVIEW_METRIC_IDS = [
    'metricNotifySent30d',
    'metricNotifySubscribers',
    'metricNotifyArrived30d',
    'metricNotifyOpened30d',
    'metricNotifyNotArrived30d',
    'metricNotifyClicked30d',
    'metricNotifyNewSubscribers30d',
    'metricNotifyUnsubscribes30d',
  ];

  var metricAnimations = {};

  function stopMetricAnimation(id) {
    var state = metricAnimations[id];
    if (!state) return;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    delete metricAnimations[id];
    var el = document.getElementById(id);
    if (el) el.classList.remove('dashboard-analytics-card-value--counting');
  }

  function stopAllOverviewMetricAnimations() {
    OVERVIEW_METRIC_IDS.forEach(stopMetricAnimation);
  }

  function startMetricLoadingCount(id) {
    stopMetricAnimation(id);
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add('dashboard-analytics-card-value--counting');
    var phase = Math.random() * Math.PI * 2;
    var state = { loading: true, started: performance.now() };
    metricAnimations[id] = state;

    function tick(now) {
      if (metricAnimations[id] !== state || !state.loading) return;
      var t = (now - state.started) / 1000;
      var wave = (Math.sin(t * 4.2 + phase) + Math.sin(t * 2.1 + phase * 0.7)) * 0.5;
      var pseudo = Math.max(0, Math.floor((wave * 0.5 + 0.5) * 99));
      el.textContent = formatCount(pseudo);
      state.rafId = requestAnimationFrame(tick);
    }

    state.rafId = requestAnimationFrame(tick);
  }

  function animateMetricCount(id, target, options) {
    options = options || {};
    var duration = options.duration || 480;
    stopMetricAnimation(id);
    var el = document.getElementById(id);
    if (!el) return Promise.resolve();

    if (target == null || isNaN(target)) {
      el.textContent = '—';
      return Promise.resolve();
    }

    var endValue = Math.floor(Number(target));
    el.classList.add('dashboard-analytics-card-value--counting');
    var state = { loading: false, started: performance.now() };
    metricAnimations[id] = state;

    return new Promise(function (resolve) {
      function tick(now) {
        if (metricAnimations[id] !== state) {
          resolve();
          return;
        }
        var progress = Math.min(1, (now - state.started) / duration);
        var eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = formatCount(Math.round(eased * endValue));
        if (progress < 1) {
          state.rafId = requestAnimationFrame(tick);
          return;
        }
        el.textContent = formatCount(endValue);
        el.classList.remove('dashboard-analytics-card-value--counting');
        delete metricAnimations[id];
        resolve();
      }
      state.rafId = requestAnimationFrame(tick);
    });
  }

  var overviewLoading = {
    metrics: false,
    trends: false,
    subscribers: false,
  };

  function updateOverviewLoadingUI() {
    var panel = document.getElementById('notifyPanelOverview');
    var banner = document.getElementById('dashboardNotifyOverviewLoading');
    var busy =
      overviewLoading.metrics || overviewLoading.trends || overviewLoading.subscribers;
    if (panel) panel.classList.toggle('dashboard-notify-panel--loading', busy);
    if (banner) banner.hidden = !overviewLoading.metrics;
  }

  function setOverviewSectionLoading(section, loading) {
    if (!Object.prototype.hasOwnProperty.call(overviewLoading, section)) return;
    overviewLoading[section] = !!loading;
    updateOverviewLoadingUI();
  }

  function setMetricsLoading(loading) {
    setOverviewSectionLoading('metrics', loading);
    if (!loading) return;
    OVERVIEW_METRIC_IDS.forEach(startMetricLoadingCount);
    [
      'metricNotifySent30dMeta',
      'metricNotifyArrived30dMeta',
      'metricNotifyOpened30dMeta',
      'metricNotifyNotArrived30dMeta',
      'metricNotifyClicked30dMeta',
      'metricNotifyNewSubscribers30dMeta',
      'metricNotifyUnsubscribes30dMeta',
    ].forEach(function (id) {
      setMetricMeta(id, '');
    });
  }

  function setTrendsLoading(loading) {
    setOverviewSectionLoading('trends', loading);
    var wrap = document.querySelector('#dashboardNotifyTrendsSection .dashboard-notify-trends-chart-wrap');
    var chart = document.getElementById('dashboardNotifyTrendChart');
    var empty = document.getElementById('dashboardNotifyTrendEmpty');
    if (!wrap || !chart) return;
    if (loading) {
      wrap.classList.add('dashboard-notify-trends-chart-wrap--loading');
      chart.innerHTML =
        '<p class="dashboard-notify-trends-loading" role="status">' +
        '<i class="fa fa-spinner fa-spin" aria-hidden="true"></i> Loading chart…</p>';
      if (empty) empty.hidden = true;
      return;
    }
    wrap.classList.remove('dashboard-notify-trends-chart-wrap--loading');
  }

  function setSubscribersLoading(loading) {
    setOverviewSectionLoading('subscribers', loading);
    var tbody = document.getElementById('dashboardNotifySubscribersBody');
    var empty = document.getElementById('dashboardNotifySubscribersEmpty');
    var table = document.getElementById('dashboardNotifySubscribersTable');
    if (!tbody) return;
    if (loading) {
      if (table) table.hidden = false;
      if (empty) empty.hidden = true;
      tbody.innerHTML =
        '<tr class="dashboard-notify-table-loading-row">' +
        '<td colspan="5"><i class="fa fa-spinner fa-spin" aria-hidden="true"></i> Loading subscribers…</td>' +
        '</tr>';
    }
  }

  function formatPercent(value) {
    if (value == null || isNaN(value)) return '—';
    return Math.round(Number(value)) + '%';
  }

  function formatRateLabel(count, rate) {
    if (count == null) return '';
    if (rate == null || isNaN(rate)) return formatInt(count) + ' total';
    return formatPercent(rate) + ' of reached';
  }

  function formatCount(n) {
    if (n == null || n === '') return '—';
    try {
      return new Intl.NumberFormat(undefined).format(Number(n));
    } catch (e) {
      return String(n);
    }
  }

  function cardErrorMessage(status, data) {
    var err = (data && (data.error || data.message)) || String(status);
    if (status === 401) return 'Sign in to load notification stats.';
    if (status === 403) return 'You do not have access to notification stats for this site.';
    if (status === 404) {
      return 'Site not registered with notify service (check params.notifications.clientDomain).';
    }
    return 'Could not load notification stats (' + err + ').';
  }

  function fetchOverview(days) {
    days = days || 30;
    var domain = getClientDomain();
    var url =
      getApiBase() +
      '/analytics/overview?client_domain=' +
      encodeURIComponent(domain) +
      '&days=' +
      encodeURIComponent(String(days));
    return fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: authHeaders(),
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (e) {}
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  /**
   * Dashboard control-room card: subscribers + sent (30d).
   */
  function loadDashboardCard(options) {
    options = options || {};
    var days = options.days || 30;
    var subsEl = document.getElementById('dashboardCardNotifySubs');
    var sentEl = document.getElementById('dashboardCardNotifySent');
    var hint = document.getElementById('dashboardCardNotifyHint');
    var snap = document.getElementById('dashboardCardNotifySnapshot');
    if (!subsEl || !sentEl) return Promise.resolve();

    if (!getApiBase()) {
      if (hint) {
        hint.textContent = 'Notification API is not configured.';
        hint.classList.remove('hidden');
      }
      return Promise.resolve();
    }

    if (!authHeaders().Authorization) {
      if (hint) {
        hint.textContent = 'Sign in to load notification stats.';
        hint.classList.remove('hidden');
      }
      return Promise.resolve();
    }

    return fetchOverview(days)
      .then(function (x) {
        if (!x.ok) {
          if (hint) {
            hint.textContent = cardErrorMessage(x.status, x.data);
            hint.classList.remove('hidden');
          }
          if (snap) snap.setAttribute('aria-label', 'Notification snapshot unavailable');
          return;
        }
        var ov = (x.data && x.data.overview) || {};
        var sub = ov.subscriptions || {};
        var notif = ov.notifications || {};
        subsEl.textContent = formatCount(sub.active);
        sentEl.textContent = formatCount(notif.in_period);
        if (hint) hint.classList.add('hidden');
        if (snap) {
          snap.setAttribute(
            'aria-label',
            'Notification snapshot, last ' +
              days +
              ' days: ' +
              formatCount(sub.active) +
              ' subscribers, ' +
              formatCount(notif.in_period) +
              ' sent'
          );
        }
      })
      .catch(function () {
        if (hint) {
          hint.textContent = 'Could not load notification stats. Try again later.';
          hint.classList.remove('hidden');
        }
      });
  }

  function setStatus(el, msg, isError) {
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('dashboard-notify-status-error', !!isError);
  }

  function sumTrendField(rows, field) {
    return (rows || []).reduce(function (total, row) {
      return total + (Number(row && row[field]) || 0);
    }, 0);
  }

  var overviewBundleCache = null;
  var overviewBundlePromise = null;

  function invalidateOverviewBundle() {
    overviewBundleCache = null;
    overviewBundlePromise = null;
  }

  /** Shared parallel fetch for overview metrics + chart (dedupes concurrent callers). */
  function fetchOverviewBundle(options) {
    options = options || {};
    if (options.force) invalidateOverviewBundle();
    if (overviewBundleCache) return Promise.resolve(overviewBundleCache);
    if (overviewBundlePromise) return overviewBundlePromise;

    var domain = getClientDomain();
    var q = '?client_domain=' + encodeURIComponent(domain) + '&days=30';
    var headers = authHeaders();

    overviewBundlePromise = Promise.all([
      notifyFetch('/analytics/overview' + q, { headers: headers }),
      notifyFetch('/analytics/subscription-trends' + q, { headers: headers }).catch(function () {
        return { data: [] };
      }),
      notifyFetch('/analytics/engagement-trends' + q, { headers: headers }).catch(function () {
        return { data: [] };
      }),
    ])
      .then(function (results) {
        overviewBundleCache = {
          overview: results[0],
          subTrends: results[1],
          engagement: results[2],
        };
        return overviewBundleCache;
      })
      .finally(function () {
        overviewBundlePromise = null;
      });

    return overviewBundlePromise;
  }

  function applyOverviewMetrics(bundle) {
    var ov = (bundle.overview && bundle.overview.overview) || {};
    var sub = ov.subscriptions || {};
    var notif = ov.notifications || {};
    var trendRows = (bundle.subTrends && bundle.subTrends.data) || [];
    var newSubscribers = sumTrendField(trendRows, 'new_subscribed');
    var unsubscribes = sumTrendField(trendRows, 'new_unsubscribed');

    var attempts = Number(notif.delivery_attempts) || 0;
    var delivered = Number(notif.delivered) || 0;
    var notDelivered =
      notif.not_delivered != null
        ? Number(notif.not_delivered)
        : Math.max(0, attempts - delivered);

    return Promise.all([
      animateMetricCount('metricNotifySent30d', notif.in_period),
      animateMetricCount('metricNotifySubscribers', sub.active),
      animateMetricCount('metricNotifyArrived30d', delivered),
      animateMetricCount('metricNotifyOpened30d', notif.confirmed),
      animateMetricCount('metricNotifyNotArrived30d', notDelivered),
      animateMetricCount('metricNotifyClicked30d', notif.clicked),
      animateMetricCount('metricNotifyNewSubscribers30d', newSubscribers),
      animateMetricCount('metricNotifyUnsubscribes30d', unsubscribes),
    ]).then(function () {
      setMetricMeta(
        'metricNotifySent30dMeta',
        attempts ? formatInt(attempts) + ' delivery attempts' : ''
      );
      setMetricMeta(
        'metricNotifyArrived30dMeta',
        attempts
          ? formatPercent(notif.arrival_rate) + ' · ' + formatInt(attempts) + ' recipients'
          : ''
      );
      setMetricMeta(
        'metricNotifyOpened30dMeta',
        delivered ? formatRateLabel(notif.confirmed, notif.open_rate) : ''
      );
      setMetricMeta(
        'metricNotifyNotArrived30dMeta',
        attempts ? formatInt(notif.pending || 0) + ' pending · ' + formatInt(notif.failed || 0) + ' failed' : ''
      );
      setMetricMeta(
        'metricNotifyClicked30dMeta',
        delivered ? formatRateLabel(notif.clicked, notif.click_rate) : ''
      );
      setMetricMeta(
        'metricNotifyNewSubscribers30dMeta',
        sub.active != null ? formatInt(sub.active) + ' active now' : ''
      );
      setMetricMeta(
        'metricNotifyUnsubscribes30dMeta',
        newSubscribers || unsubscribes
          ? (newSubscribers >= unsubscribes ? '+' : '') +
              formatInt(newSubscribers - unsubscribes) +
              ' net change'
          : ''
      );
    });
  }

  async function loadMetrics() {
    setMetricsLoading(true);
    try {
      var bundle = await fetchOverviewBundle();
      setMetricsLoading(false);
      applyOverviewMetrics(bundle).catch(function () {});
    } catch (err) {
      stopAllOverviewMetricAnimations();
      setMetricsLoading(false);
      throw err;
    }
  }

  function formatShortDate(isoDate) {
    if (!isoDate) return '';
    try {
      var d = new Date(isoDate + 'T12:00:00');
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) {
      return isoDate.slice(5);
    }
  }

  function mergeNotifyTrendRows(engagementRows, subscriptionRows) {
    var byDate = {};

    function ensureRow(date) {
      if (!byDate[date]) {
        byDate[date] = {
          date: date,
          sent: 0,
          delivered: 0,
          confirmed: 0,
          clicked: 0,
          subscribed: 0,
          unsubscribed: 0,
        };
      }
      return byDate[date];
    }

    (engagementRows || []).forEach(function (row) {
      var merged = ensureRow(row.date);
      merged.sent = Number(row.sent) || 0;
      merged.delivered = Number(row.delivered) || 0;
      merged.confirmed = Number(row.confirmed) || 0;
      merged.clicked = Number(row.clicked) || 0;
    });

    (subscriptionRows || []).forEach(function (row) {
      var merged = ensureRow(row.date);
      merged.subscribed = Number(row.new_subscribed) || 0;
      merged.unsubscribed = Number(row.new_unsubscribed) || 0;
    });

    return Object.keys(byDate)
      .sort()
      .map(function (date) {
        return byDate[date];
      });
  }

  function renderNotifyTrendChart(rows) {
    var chart = document.getElementById('dashboardNotifyTrendChart');
    var empty = document.getElementById('dashboardNotifyTrendEmpty');
    if (!chart) return;

    rows = rows || [];
    var hasData = rows.some(function (r) {
      return (
        (r.sent || 0) +
          (r.delivered || 0) +
          (r.confirmed || 0) +
          (r.clicked || 0) +
          (r.subscribed || 0) +
          (r.unsubscribed || 0) >
        0
      );
    });

    if (!hasData) {
      chart.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    var width = 960;
    var height = 260;
    var pad = { top: 16, right: 12, bottom: 36, left: 40 };
    var innerW = width - pad.left - pad.right;
    var innerH = height - pad.top - pad.bottom;
    var maxVal = 1;

    rows.forEach(function (r) {
      maxVal = Math.max(
        maxVal,
        r.sent || 0,
        r.delivered || 0,
        r.confirmed || 0,
        r.clicked || 0,
        r.subscribed || 0,
        r.unsubscribed || 0
      );
    });

    var series = [
      { key: 'sent', label: 'Sent', className: 'dashboard-notify-trends-bar--sent' },
      { key: 'delivered', label: 'Arrived', className: 'dashboard-notify-trends-bar--delivered' },
      { key: 'confirmed', label: 'Opened', className: 'dashboard-notify-trends-bar--confirmed' },
      { key: 'clicked', label: 'Clicked', className: 'dashboard-notify-trends-bar--clicked' },
      { key: 'subscribed', label: 'Subscribers', className: 'dashboard-notify-trends-bar--subscribed' },
      { key: 'unsubscribed', label: 'Unsubscribed', className: 'dashboard-notify-trends-bar--unsubscribed' },
    ];
    var seriesCount = series.length;
    var barGroupW = innerW / rows.length;
    var barW = Math.max(2, Math.min(5, (barGroupW - 8) / seriesCount));

    var svg =
      '<svg class="dashboard-notify-trends-svg" viewBox="0 0 ' +
      width +
      ' ' +
      height +
      '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">';

    for (var g = 0; g <= 4; g++) {
      var y = pad.top + (innerH * g) / 4;
      var val = Math.round(maxVal * (1 - g / 4));
      svg +=
        '<line class="dashboard-notify-trends-grid" x1="' +
        pad.left +
        '" y1="' +
        y +
        '" x2="' +
        (width - pad.right) +
        '" y2="' +
        y +
        '"></line>';
      svg +=
        '<text class="dashboard-notify-trends-axis-y" x="' +
        (pad.left - 8) +
        '" y="' +
        (y + 4) +
        '" text-anchor="end">' +
        escapeHtml(String(val)) +
        '</text>';
    }

    rows.forEach(function (row, index) {
      var groupX = pad.left + index * barGroupW + barGroupW / 2;
      series.forEach(function (s, seriesIndex) {
        var value = Number(row[s.key]) || 0;
        var barH = maxVal ? (value / maxVal) * innerH : 0;
        var x = groupX - (barW * seriesCount + (seriesCount - 1) * 2) / 2 + seriesIndex * (barW + 2);
        var y = pad.top + innerH - barH;
        svg +=
          '<rect class="dashboard-notify-trends-bar ' +
          s.className +
          '" x="' +
          x +
          '" y="' +
          y +
          '" width="' +
          barW +
          '" height="' +
          barH +
          '" rx="1"><title>' +
          escapeHtml(formatShortDate(row.date)) +
          ' · ' +
          s.label +
          ': ' +
          value +
          '</title></rect>';
      });

      if (index % 5 === 0 || index === rows.length - 1) {
        svg +=
          '<text class="dashboard-notify-trends-axis-x" x="' +
          groupX +
          '" y="' +
          (height - 10) +
          '" text-anchor="middle">' +
          escapeHtml(formatShortDate(row.date)) +
          '</text>';
      }
    });

    svg += '</svg>';
    chart.innerHTML = svg;
    chart.setAttribute(
      'aria-label',
      'Notification activity chart for the last 30 days with daily sends, delivery outcomes, and subscriber changes'
    );
  }

  async function loadEngagementTrends() {
    setTrendsLoading(true);
    try {
      var bundle = await fetchOverviewBundle();
      renderNotifyTrendChart(
        mergeNotifyTrendRows(
          (bundle.engagement && bundle.engagement.data) || [],
          (bundle.subTrends && bundle.subTrends.data) || []
        )
      );
    } finally {
      setTrendsLoading(false);
    }
  }

  function deliveryStats(deliveries) {
    var stats = {
      sent: deliveries.length,
      arrived: 0,
      opened: 0,
      clicked: 0,
      notArrived: 0,
    };
    deliveries.forEach(function (d) {
      var status = (d && d.status) || '';
      if (status === 'delivered' || status === 'confirmed' || status === 'clicked') {
        stats.arrived++;
      }
      if (status === 'confirmed' || status === 'clicked') {
        stats.opened++;
      }
      if (status === 'clicked') {
        stats.clicked++;
      }
      if (status === 'failed' || status === 'pending') {
        stats.notArrived++;
      }
    });
    return stats;
  }

  function formatDeliveryStatus(status) {
    var labels = {
      delivered: 'Arrived',
      confirmed: 'Opened',
      clicked: 'Clicked',
      pending: 'Pending',
      failed: 'Not arrived',
      bounced: 'Bounced',
      unsubscribed: 'Unsubscribed',
    };
    return labels[status] || status || '—';
  }

  function renderNotificationDetail(container, data) {
    var deliveries = (data && data.deliveries) || [];
    var stats = deliveryStats(deliveries);

    var html =
      '<div class="dashboard-notify-detail-stats">' +
      '<span class="dashboard-notify-detail-stat"><strong>Sent:</strong> ' +
      formatInt(stats.sent) +
      '</span>' +
      '<span class="dashboard-notify-detail-stat"><strong>Arrived:</strong> ' +
      formatInt(stats.arrived) +
      '</span>' +
      '<span class="dashboard-notify-detail-stat"><strong>Opened:</strong> ' +
      formatInt(stats.opened) +
      '</span>' +
      '<span class="dashboard-notify-detail-stat"><strong>Not arrived:</strong> ' +
      formatInt(stats.notArrived) +
      '</span>' +
      (stats.clicked
        ? '<span class="dashboard-notify-detail-stat"><strong>Clicked:</strong> ' +
          formatInt(stats.clicked) +
          '</span>'
        : '') +
      '</div>';

    if (!deliveries.length) {
      html += '<p class="dashboard-notify-detail-empty">No delivery records for this notification.</p>';
      container.innerHTML = html;
      return;
    }

    html +=
      '<div class="dashboard-notify-table-wrap dashboard-notify-detail-table-wrap">' +
      '<table class="dashboard-notify-table dashboard-notify-detail-table" aria-label="Delivery details">' +
      '<thead><tr>' +
      '<th scope="col">Subscription ID</th>' +
      '<th scope="col">Status</th>' +
      '<th scope="col">Arrived</th>' +
      '<th scope="col">Opened</th>' +
      '<th scope="col">Error</th>' +
      '</tr></thead><tbody>';

    deliveries.forEach(function (d) {
      var subId = d.subscription_id || '—';
      var status = (d && d.status) || '';
      var arrivedAt = d.delivered_at ? new Date(d.delivered_at).toLocaleString() : '—';
      var openedAt = d.confirmed_at
        ? new Date(d.confirmed_at).toLocaleString()
        : d.clicked_at
          ? new Date(d.clicked_at).toLocaleString()
          : '—';
      var errMsg = (d.error_message || '').trim();
      html +=
        '<tr>' +
        '<td><code class="dashboard-notify-sub-id">' +
        escapeHtml(String(subId)) +
        '</code></td>' +
        '<td><span class="dashboard-notify-status-badge dashboard-notify-status-badge--' +
        escapeHtml(status) +
        '">' +
        escapeHtml(formatDeliveryStatus(status)) +
        '</span></td>' +
        '<td>' +
        escapeHtml(arrivedAt) +
        '</td>' +
        '<td>' +
        escapeHtml(openedAt) +
        '</td>' +
        '<td class="dashboard-notify-error-cell">' +
        (errMsg ? escapeHtml(errMsg) : '—') +
        '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  async function toggleNotificationDetail(li, notificationId) {
    var detail = li.querySelector('.dashboard-notify-history-detail');
    if (!detail) return;

    var isOpen = li.classList.contains('dashboard-notify-history-item--open');
    if (isOpen) {
      li.classList.remove('dashboard-notify-history-item--open');
      detail.hidden = true;
      return;
    }

    li.classList.add('dashboard-notify-history-item--open');
    detail.hidden = false;
    detail.innerHTML =
      '<p class="dashboard-notify-detail-loading"><i class="fa fa-spinner fa-spin" aria-hidden="true"></i> Loading delivery data…</p>';

    try {
      var data = await notifyFetch('/notifications/' + encodeURIComponent(notificationId), {
        headers: authHeaders(),
      });
      renderNotificationDetail(detail, data);
    } catch (err) {
      detail.innerHTML =
        '<p class="dashboard-notify-detail-error">' +
        escapeHtml(err.message || 'Could not load delivery details.') +
        '</p>';
    }
  }

  function isWelcomeNotification(n) {
    var data = n && n.data;
    if (!data) return false;
    if (data.welcome === true || data.welcome === 'true') return true;
    return false;
  }

  function isAdminPhotoNotification(n) {
    if (n && n.type === 'photo_review') return true;
    var data = n && n.data;
    if (!data) return false;
    if (data.photo_review === true || data.photo_review === 'true') return true;
    return false;
  }

  function renderNotificationHistoryItem(n) {
    var li = document.createElement('li');
    li.className = 'dashboard-notify-history-item';
    var title = n.title || '(no title)';
    var created = n.created_at || '';
    try {
      created = created ? new Date(created).toLocaleString() : '';
    } catch (e) {}
    var status = n.status || '';
    var notifId = n.id || '';

    li.innerHTML =
      '<button type="button" class="dashboard-notify-history-toggle" aria-expanded="false">' +
      '<span class="dashboard-notify-history-title">' +
      escapeHtml(title) +
      '</span>' +
      '<span class="dashboard-notify-history-meta">' +
      escapeHtml(created) +
      (status ? ' · ' + escapeHtml(status) : '') +
      '</span>' +
      '<span class="dashboard-notify-history-chevron" aria-hidden="true"><i class="fa fa-chevron-down"></i></span>' +
      '</button>' +
      '<div class="dashboard-notify-history-detail" hidden></div>';

    if (notifId) {
      li.setAttribute('data-notification-id', notifId);
      var btn = li.querySelector('.dashboard-notify-history-toggle');
      btn.addEventListener('click', function () {
        var open = li.classList.contains('dashboard-notify-history-item--open');
        toggleNotificationDetail(li, notifId);
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      });
    }

    return li;
  }

  async function loadNotificationHistory(options) {
    options = options || {};
    var filter = options.filter || 'sent';
    var listId = options.listId || 'dashboardNotifyRecentList';
    var emptyId = options.emptyId || 'dashboardNotifyRecentEmpty';

    var domain = getClientDomain();
    var path =
      '/notifications?client_domain=' + encodeURIComponent(domain) + '&limit=50';
    var data = await notifyFetch(path, { headers: authHeaders() });
    var list = document.getElementById(listId);
    var empty = document.getElementById(emptyId);
    if (!list) return;

    var items = (data && data.notifications) || [];
    if (filter === 'welcome') {
      items = items.filter(isWelcomeNotification);
    } else if (filter === 'sent') {
      items = items.filter(function (n) {
        return !isWelcomeNotification(n) && !isAdminPhotoNotification(n);
      });
    }

    list.innerHTML = '';
    if (!items.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    items.forEach(function (n) {
      list.appendChild(renderNotificationHistoryItem(n));
    });
  }

  async function loadRecent() {
    return loadNotificationHistory({
      filter: 'sent',
      listId: 'dashboardNotifyRecentList',
      emptyId: 'dashboardNotifyRecentEmpty',
    });
  }

  async function loadWelcomeHistory() {
    return loadNotificationHistory({
      filter: 'welcome',
      listId: 'dashboardNotifyWelcomeList',
      emptyId: 'dashboardNotifyWelcomeEmpty',
    });
  }

  function menuImageApiBase() {
    var cfg =
      typeof window.MENU_IMAGE_CONFIG !== 'undefined' ? window.MENU_IMAGE_CONFIG : null;
    return cfg && cfg.apiUrl ? String(cfg.apiUrl).replace(/\/+$/, '') : '';
  }

  function menuImageClientId() {
    var cfg =
      typeof window.MENU_IMAGE_CONFIG !== 'undefined' ? window.MENU_IMAGE_CONFIG : null;
    return (
      window.CLIENT_ID ||
      window.SITE_CLIENT_ID ||
      (cfg && cfg.clientId) ||
      ''
    );
  }

  function photoThumbUrl(url) {
    if (!url) return '';
    if (typeof window.TtmsThumbor !== 'undefined' && window.TtmsThumbor.menuImageSrc) {
      return window.TtmsThumbor.menuImageSrc(url, 'carousel') || url;
    }
    var thumbor =
      (typeof window.MENU_IMAGE_THUMBOR_URL !== 'undefined' &&
        window.MENU_IMAGE_THUMBOR_URL) ||
      'https://thumbor.ttmenus.com';
    return (
      String(thumbor).replace(/\/+$/, '') +
      '/unsafe/fit-in/240x300/' +
      encodeURIComponent(url)
    );
  }

  function menuItemTitle(path) {
    var p = String(path || '').replace(/\/$/, '');
    var slug = p.split('/').filter(Boolean).pop() || 'Menu item';
    return slug.replace(/-/g, ' ').replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  async function loadPhotoReviewPushHistory() {
    var list = document.getElementById('dashboardNotifyPhotoPushList');
    var empty = document.getElementById('dashboardNotifyPhotoPushEmpty');
    if (!list) return;

    list.innerHTML = '';
    if (empty) empty.hidden = true;

    try {
      var domain = getClientDomain();
      var data = await notifyFetch(
        '/notifications?client_domain=' + encodeURIComponent(domain) + '&limit=50',
        { headers: authHeaders() }
      );
      var items = ((data && data.notifications) || []).filter(isAdminPhotoNotification);
      if (!items.length) {
        if (empty) empty.hidden = false;
        return;
      }
      items.forEach(function (n) {
        list.appendChild(renderNotificationHistoryItem(n));
      });
    } catch (err) {
      if (empty) {
        empty.hidden = false;
        empty.textContent =
          (err && err.message ? err.message : 'Could not load photo approval alert history.') +
          ' Push alerts are still sent when customers upload photos.';
      }
    }
  }

  async function loadPhotoApprovals() {
    await loadPhotoReviewPushHistory().catch(function () {});
    var list = document.getElementById('dashboardNotifyPhotosList');
    var empty = document.getElementById('dashboardNotifyPhotosEmpty');
    var errEl = document.getElementById('dashboardNotifyPhotosError');
    if (!list) return;

    list.innerHTML = '';
    if (empty) empty.hidden = true;
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }

    var base = menuImageApiBase();
    if (!base || !(window.MENU_IMAGE_CONFIG && window.MENU_IMAGE_CONFIG.enabled)) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = 'Menu photo approvals are not enabled for this site.';
      }
      return;
    }

    try {
      await ensureNotifyToken();
      if (window.AuthClient && typeof AuthClient.isAdmin === 'function' && !AuthClient.isAdmin()) {
        if (empty) {
          empty.hidden = false;
          empty.textContent = 'Admin access is required to view pending photo approvals.';
        }
        return;
      }

      var res = await fetch(base + '/admin/menu-images/pending', {
        method: 'GET',
        headers: authHeaders(),
      });
      var json = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        throw new Error(json.error || 'Could not load pending photos.');
      }

      var clientId = menuImageClientId();
      var items = (json.data || []).filter(function (sub) {
        return String(sub.client_id || '') === String(clientId || '');
      });

      if (!items.length) {
        if (empty) empty.hidden = false;
        return;
      }

      items.forEach(function (sub) {
        var li = document.createElement('li');
        li.className = 'dashboard-notify-photos-item';
        var preview = photoThumbUrl(sub.url) || sub.url || '';
        var when = sub.created_at || '';
        try {
          when = when ? new Date(when).toLocaleString() : '';
        } catch (e) {}
        var title = menuItemTitle(sub.menu_item_path);
        var approveHref = '/dashboard/#dashboardCardMenuImages';

        li.innerHTML =
          '<a class="dashboard-notify-photos-link" href="' +
          escapeHtml(approveHref) +
          '">' +
          (preview
            ? '<span class="dashboard-notify-photos-thumb"><img src="' +
              escapeHtml(preview) +
              '" alt="" loading="lazy"></span>'
            : '<span class="dashboard-notify-photos-thumb dashboard-notify-photos-thumb--empty" aria-hidden="true"><i class="fa fa-image"></i></span>') +
          '<span class="dashboard-notify-photos-body">' +
          '<span class="dashboard-notify-photos-title">' +
          escapeHtml(title) +
          '</span>' +
          '<span class="dashboard-notify-photos-meta">' +
          escapeHtml(when) +
          (sub.submitter_email ? ' · ' + escapeHtml(sub.submitter_email) : '') +
          '</span>' +
          '<span class="dashboard-notify-photos-action">Review on dashboard <i class="fa fa-arrow-right" aria-hidden="true"></i></span>' +
          '</span>' +
          '</a>';
        list.appendChild(li);
      });
    } catch (err) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent =
          (err && err.message ? err.message : 'Could not load pending photos.') +
          ' Open the dashboard approval reel to review uploads.';
      }
    }
  }

  async function loadSubscribers() {
    var tbody = document.getElementById('dashboardNotifySubscribersBody');
    var empty = document.getElementById('dashboardNotifySubscribersEmpty');
    var errEl = document.getElementById('dashboardNotifySubscribersError');
    var table = document.getElementById('dashboardNotifySubscribersTable');
    if (!tbody) return;

    setSubscribersLoading(true);
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }

    try {
      var domain = getClientDomain();
      var data = await notifyFetch(
        '/subscribers?client_domain=' + encodeURIComponent(domain),
        { headers: authHeaders() }
      );

      var subs = (data && data.subscribers) || [];
      tbody.innerHTML = '';
      if (!subs.length) {
        if (table) table.hidden = true;
        if (empty) empty.hidden = false;
        return;
      }

      if (table) table.hidden = false;
      if (empty) empty.hidden = true;

      subs.forEach(function (s) {
      var tr = document.createElement('tr');
      var subscribed = s.subscribed_at || '';
      try {
        subscribed = subscribed ? new Date(subscribed).toLocaleString() : '—';
      } catch (e) {
        subscribed = '—';
      }
      tr.innerHTML =
        '<td><code class="dashboard-notify-sub-id">' +
        escapeHtml(s.id || '—') +
        '</code></td>' +
        '<td>' +
        escapeHtml(s.platform || '—') +
        '</td>' +
        '<td>' +
        (s.has_background_push
          ? '<span class="dashboard-notify-status-badge dashboard-notify-status-badge--delivered" title="Can receive alerts when app is closed">Ready</span>'
          : '<span class="dashboard-notify-status-badge dashboard-notify-status-badge--pending" title="User must open menu and re-subscribe">Missing keys</span>') +
        '</td>' +
        '<td>' +
        (s.is_active
          ? '<span class="dashboard-notify-status-badge dashboard-notify-status-badge--delivered">Active</span>'
          : '<span class="dashboard-notify-status-badge dashboard-notify-status-badge--failed">Inactive</span>') +
        '</td>' +
        '<td>' +
        escapeHtml(subscribed) +
        '</td>';
      tbody.appendChild(tr);
    });
    } catch (err) {
      tbody.innerHTML = '';
      throw err;
    } finally {
      setSubscribersLoading(false);
    }
  }

  async function sendNotification(ev) {
    ev.preventDefault();
    var form = document.getElementById('dashboardNotifySendForm');
    var statusEl = document.getElementById('dashboardNotifySendStatus');
    var submitBtn = document.getElementById('dashboardNotifySendSubmit');
    if (!form) return;

    var title = (document.getElementById('notifyTitle') || {}).value;
    var message = (document.getElementById('notifyMessage') || {}).value;
    var type = (document.getElementById('notifyType') || {}).value || 'general';
    var priority = (document.getElementById('notifyPriority') || {}).value || 'normal';
    var link = (document.getElementById('notifyLink') || {}).value;
    var icon = (document.getElementById('notifyIcon') || {}).value;
    var image = (document.getElementById('notifyImage') || {}).value;
    var broadcastEl = document.getElementById('notifyBroadcast');
    var isBroadcast = !!(broadcastEl && broadcastEl.checked);

    title = String(title || '').trim();
    message = String(message || '').trim();

    if (!title || !message) {
      setStatus(statusEl, 'Title and message are required.', true);
      return;
    }

    var body = {
      client_domain: getClientDomain(),
      is_broadcast: isBroadcast,
      title: title,
      message: message,
      type: type,
      priority: priority,
    };
    body.data = {};
    if (link) body.data.url = String(link).trim();
    if (icon) body.data.icon = String(icon).trim();
    if (image) body.data.image = String(image).trim();
    if (!Object.keys(body.data).length) delete body.data;

    submitBtn.disabled = true;
    setStatus(statusEl, 'Sending…', false);

    try {
      await notifyFetch('/notifications', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      setStatus(statusEl, 'Notification queued successfully.', false);
      form.reset();
      setNotifyImageField('notifyIcon', '');
      setNotifyImageField('notifyImage', '');
      var iconStatus = document.getElementById('notifyIconStatus');
      var imageStatus = document.getElementById('notifyImageStatus');
      if (iconStatus) iconStatus.textContent = '';
      if (imageStatus) imageStatus.textContent = '';
      refreshSendPlatformPreview();
      invalidateOverviewBundle();
      await loadMetrics();
      await loadEngagementTrends();
      await loadRecent();
      await loadSubscribers().catch(function () {});
    } catch (err) {
      setStatus(statusEl, err.message || 'Send failed.', true);
    } finally {
      submitBtn.disabled = false;
    }
  }

  function init() {
    if (!document.getElementById('dashboardNotificationsPage')) return;

    initNotifyTabs();
    initHistorySubTabs();
    initBroadcastOption();
    initNotifyImageUploads();
    initNotifyMediaTabs();
    initNotifyPlatformPreviews();
    setNotifyImageField('notifyDefaultIcon', getNotifyFieldValue('notifyDefaultIcon'));

    var errBanner = document.getElementById('dashboardNotifyConfigError');
    var hasApi = !!getApiBase();
    if (!hasApi) {
      if (errBanner) errBanner.removeAttribute('hidden');
      setFormsApiDisabled(true);
      return;
    }
    if (errBanner) errBanner.setAttribute('hidden', '');
    setFormsApiDisabled(false);

    loadMetrics().catch(function (err) {
      stopAllOverviewMetricAnimations();
      OVERVIEW_METRIC_IDS.forEach(function (id) {
        setText(id, '—');
      });
      [
        'metricNotifySent30dMeta',
        'metricNotifyArrived30dMeta',
        'metricNotifyOpened30dMeta',
        'metricNotifyNotArrived30dMeta',
        'metricNotifyClicked30dMeta',
        'metricNotifyNewSubscribers30dMeta',
        'metricNotifyUnsubscribes30dMeta',
      ].forEach(function (id) {
        setMetricMeta(id, '');
      });
      var note = document.getElementById('dashboardNotifyLoadError');
      if (note) {
        note.hidden = false;
        note.textContent =
          'Could not load notification stats. ' + (err && err.message ? err.message : 'Check that this site is registered with the notification service.');
      }
    });

    loadEngagementTrends().catch(function () {
      renderNotifyTrendChart([]);
    });

    loadSubscribers().catch(function (err) {
      var errEl = document.getElementById('dashboardNotifySubscribersError');
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent =
          'Could not load subscribers. ' + (err && err.message ? err.message : 'Try again later.');
      }
    });

    loadRecent().catch(function () {
      var note = document.getElementById('dashboardNotifyLoadError');
      if (note) {
        note.hidden = false;
        note.textContent =
          (note.textContent ? note.textContent + ' ' : '') +
          'Recent activity could not be loaded.';
      }
    });

    loadWelcomeHistory().catch(function () {});

    loadPhotoApprovals().catch(function () {});

    var form = document.getElementById('dashboardNotifySendForm');
    if (form) form.addEventListener('submit', sendNotification);

    initWelcomeForm();
    initAdminPhotoReviewAlerts();
  }

  async function refreshOverview() {
    var loadErr = document.getElementById('dashboardNotifyLoadError');
    if (loadErr) {
      loadErr.hidden = true;
      loadErr.textContent = '';
    }

    invalidateOverviewBundle();

    await Promise.allSettled([
      loadMetrics(),
      loadEngagementTrends(),
      loadSubscribers(),
      loadRecent(),
      loadWelcomeHistory(),
      loadPhotoApprovals(),
    ]);

    initAdminPhotoReviewAlerts();
  }

  function isDashboardAdminUser() {
    if (typeof AuthClient === 'undefined') return false;
    if (AuthClient.isSuperadmin && AuthClient.isSuperadmin()) return true;
    if (AuthClient.isAdmin && AuthClient.isAdmin()) return true;
    return false;
  }

  function getStoredNotifySubscriptionId() {
    try {
      var raw = localStorage.getItem('ttmenus_notification_subscription');
      if (!raw) return null;
      var sub = JSON.parse(raw);
      return sub && sub.id ? String(sub.id) : null;
    } catch (e) {
      return null;
    }
  }

  function isAuthLinkedNotifySubscription() {
    try {
      var raw = localStorage.getItem('ttmenus_notification_subscription');
      if (!raw) return false;
      var sub = JSON.parse(raw);
      return sub && typeof sub.user_id === 'string' && sub.user_id.indexOf('auth_') === 0;
    } catch (e) {
      return false;
    }
  }

  function applyPhotoReviewToggleState(enabled) {
    var toggle = document.getElementById('dashboardPhotoReviewAlertsToggle');
    if (toggle) toggle.checked = !!enabled;
    if (window.NotificationService && NotificationService.setPhotoReviewAlertsEnabled) {
      NotificationService.setPhotoReviewAlertsEnabled(!!enabled);
    } else {
      localStorage.setItem('ttmenus_photo_review_alerts', enabled ? '1' : '0');
    }
  }

  async function loadPhotoReviewPreferenceFromServer() {
    var subId = getStoredNotifySubscriptionId();
    if (!subId || !getApiBase()) return null;
    try {
      var data = await notifyFetch('/subscriptions/' + encodeURIComponent(subId));
      var prefs = data && data.preferences;
      if (prefs && prefs.enable_photo_review_alerts != null) {
        return !!prefs.enable_photo_review_alerts;
      }
    } catch (e) {
      /* use local default */
    }
    return null;
  }

  function initAdminPhotoReviewAlerts() {
    var section = document.getElementById('dashboardAdminPhotoAlertsSection');
    var toggle = document.getElementById('dashboardPhotoReviewAlertsToggle');
    var subscribeHint = document.getElementById('dashboardPhotoReviewSubscribeHint');
    if (!section || !toggle) return;

    if (!isDashboardAdminUser()) {
      section.setAttribute('hidden', '');
      return;
    }

    section.removeAttribute('hidden');

    var localEnabled =
      window.NotificationService && NotificationService.getPhotoReviewAlertsEnabled
        ? NotificationService.getPhotoReviewAlertsEnabled()
        : localStorage.getItem('ttmenus_photo_review_alerts') !== '0';
    applyPhotoReviewToggleState(localEnabled);

    loadPhotoReviewPreferenceFromServer().then(function (serverEnabled) {
      if (serverEnabled != null) applyPhotoReviewToggleState(serverEnabled);
    });

    if (
      !isAuthLinkedNotifySubscription() &&
      window.NotificationService &&
      NotificationService.relinkSubscriptionToAuthUser
    ) {
      NotificationService.relinkSubscriptionToAuthUser().then(function (result) {
        if (result.ok && subscribeHint) subscribeHint.setAttribute('hidden', '');
      });
    }

    if (subscribeHint) {
      if (isAuthLinkedNotifySubscription()) {
        subscribeHint.setAttribute('hidden', '');
      } else {
        subscribeHint.removeAttribute('hidden');
      }
    }

    var relinkBtn = document.getElementById('dashboardPhotoReviewRelinkBtn');
    if (relinkBtn && relinkBtn.getAttribute('data-relink-bound') !== 'true') {
      relinkBtn.setAttribute('data-relink-bound', 'true');
      relinkBtn.addEventListener('click', function () {
        relinkBtn.disabled = true;
        var finish = function (message, ok) {
          relinkBtn.disabled = false;
          if (subscribeHint) {
            var span = subscribeHint.querySelector('span');
            if (span && message) span.textContent = message;
          }
          if (ok && subscribeHint) subscribeHint.setAttribute('hidden', '');
        };
        if (
          window.NotificationService &&
          NotificationService.relinkSubscriptionToAuthUser
        ) {
          NotificationService.relinkSubscriptionToAuthUser().then(function (result) {
            if (result.ok) {
              finish('This device is linked to your admin account for photo approval alerts.', true);
              return;
            }
            if (result.reason === 'not_subscribed') {
              if (NotificationService.subscribe) {
                NotificationService.subscribe()
                  .then(function () {
                    return NotificationService.relinkSubscriptionToAuthUser();
                  })
                  .then(function (retry) {
                    if (retry.ok) {
                      finish('Push alerts enabled and linked to your admin account.', true);
                    } else {
                      finish(
                        'Subscribe from the menu bell while signed in, then click Link this device again.',
                        false
                      );
                    }
                  })
                  .catch(function () {
                    finish('Could not enable push alerts. Allow notifications in your browser and try again.', false);
                  });
              } else {
                finish('Use the menu bell to subscribe to push alerts while signed in as an admin.', false);
              }
              return;
            }
            finish('Sign in as an admin, enable push alerts from the menu bell, then try again.', false);
          });
          return;
        }
        finish('Open the public menu, tap the bell, allow notifications, then return here.', false);
      });
    }

    if (toggle.getAttribute('data-photo-review-bound') === 'true') return;
    toggle.setAttribute('data-photo-review-bound', 'true');

    toggle.addEventListener('change', function () {
      var enabled = !!toggle.checked;
      var hint = document.getElementById('dashboardPhotoReviewAlertsHint');
      if (window.NotificationService && NotificationService.updatePhotoReviewPreference) {
        NotificationService.updatePhotoReviewPreference(enabled).then(function (result) {
          if (!result.ok && hint) {
            hint.textContent = enabled
              ? 'Could not enable photo approval alerts on the server. Try subscribing to push while signed in.'
              : 'Could not save preference. Try again.';
          } else if (hint) {
            hint.textContent = enabled
              ? 'Notify me when a customer uploads a menu photo for review.'
              : 'Photo approval push alerts are off for this device.';
          }
        });
      } else {
        applyPhotoReviewToggleState(enabled);
      }
    });
  }

  function initNotifyTabs() {
    var root = document.getElementById('dashboardNotifyTabs');
    if (!root || root.getAttribute('data-notify-tabs-bound') === 'true') return;
    root.setAttribute('data-notify-tabs-bound', 'true');

    var tabs = Array.prototype.slice.call(
      root.querySelectorAll('.dashboard-notify-tablist [role="tab"]')
    );
    if (!tabs.length) return;

    var panels = tabs.map(function (tab) {
      var id = tab.getAttribute('aria-controls');
      return id ? document.getElementById(id) : null;
    });

    function selectTab(index) {
      if (index < 0 || index >= tabs.length) return;
      tabs.forEach(function (tab, i) {
        var selected = i === index;
        tab.setAttribute('aria-selected', selected ? 'true' : 'false');
        tab.classList.toggle('dashboard-notify-tab--active', selected);
        tab.tabIndex = selected ? 0 : -1;
        var panel = panels[i];
        if (!panel) return;
        if (selected) {
          panel.removeAttribute('hidden');
        } else {
          panel.setAttribute('hidden', '');
        }
      });
    }

    var initial = tabs.findIndex(function (tab) {
      return tab.getAttribute('aria-selected') === 'true';
    });
    if (initial < 0) initial = 0;
    selectTab(initial);

    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () {
        selectTab(index);
      });
      tab.addEventListener('keydown', function (ev) {
        var next = null;
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = (index + 1) % tabs.length;
        else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp')
          next = (index - 1 + tabs.length) % tabs.length;
        else if (ev.key === 'Home') next = 0;
        else if (ev.key === 'End') next = tabs.length - 1;
        else if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          selectTab(index);
          return;
        }
        if (next !== null) {
          ev.preventDefault();
          selectTab(next);
          tabs[next].focus();
        }
      });
    });
  }

  function getNotifyServiceRoot() {
    return String(getApiBase()).replace(/\/api\/v1\/?$/i, '');
  }

  function resolveNotifyImageUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return getNotifyServiceRoot() + (path.charAt(0) === '/' ? path : '/' + path);
  }

  function setNotifyImageField(targetId, urlPath, options) {
    options = options || {};
    var hidden = document.getElementById(targetId);
    var preview = document.getElementById(targetId + 'Preview');
    var placeholder = document.getElementById(targetId + 'Placeholder');
    var card = document.querySelector('[data-notify-media="' + targetId + '"]');
    var clearBtn = document.querySelector(
      '.dashboard-notify-clear-image[data-notify-target="' + targetId + '"]'
    );
    var value = String(urlPath || '').trim();
    var previewUrl = getNotifyMediaPreviewUrl(targetId, value);
    var isCustom = !!value;

    if (hidden) hidden.value = value;
    if (preview) {
      if (previewUrl) {
        preview.onerror = function () {
          if (!isCustom && targetId.indexOf('Icon') !== -1) {
            preview.onerror = null;
            preview.src = 'https://cdn.ttmenus.com/branding/ttmenus/ttmenus.gif';
          }
        };
        preview.src = previewUrl;
        preview.removeAttribute('hidden');
      } else {
        preview.onerror = null;
        preview.removeAttribute('src');
        preview.setAttribute('hidden', '');
      }
    }
    if (placeholder) {
      if (previewUrl) placeholder.setAttribute('hidden', '');
      else placeholder.removeAttribute('hidden');
    }
    if (card) {
      card.classList.toggle('dashboard-notify-media-card--has-image', !!previewUrl);
      card.classList.toggle('dashboard-notify-media-card--using-default', !!previewUrl && !isCustom);
    }
    if (clearBtn) {
      if (isCustom) clearBtn.removeAttribute('hidden');
      else clearBtn.setAttribute('hidden', '');
    }
    if (!options.skipLinkedRefresh) {
      if (targetId === 'notifyDefaultIcon') {
        setNotifyImageField('notifyDefaultBadge', getNotifyFieldValue('notifyDefaultBadge'), {
          skipLinkedRefresh: true,
        });
        setNotifyImageField('notifyIcon', getNotifyFieldValue('notifyIcon'), { skipLinkedRefresh: true });
      } else if (targetId === 'notifyDefaultImage') {
        setNotifyImageField('notifyImage', getNotifyFieldValue('notifyImage'), { skipLinkedRefresh: true });
      }
    }
    refreshNotifyPlatformPreviews();
  }

  function getNotifyFieldValue(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function getNotifyMediaPreviewUrl(targetId, storedValue) {
    var value = String(storedValue || '').trim();
    if (value) return resolveNotifyImageUrl(value);

    switch (targetId) {
      case 'notifyDefaultIcon':
        return getDefaultNotifyIconUrl();
      case 'notifyIcon': {
        var defaultIcon = getNotifyFieldValue('notifyDefaultIcon');
        return defaultIcon ? resolveNotifyImageUrl(defaultIcon) : getDefaultNotifyIconUrl();
      }
      case 'notifyDefaultBadge': {
        var iconPath = getNotifyFieldValue('notifyDefaultIcon');
        return iconPath ? resolveNotifyImageUrl(iconPath) : getDefaultNotifyIconUrl();
      }
      case 'notifyDefaultImage':
        return '';
      case 'notifyImage': {
        var defaultImage = getNotifyFieldValue('notifyDefaultImage');
        return defaultImage ? resolveNotifyImageUrl(defaultImage) : '';
      }
      default:
        return '';
    }
  }

  function truncatePreviewText(text, maxLen) {
    text = String(text || '').trim();
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 1) + '…';
  }

  function formatPreviewTime() {
    try {
      return new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      return '9:41 AM';
    }
  }

  function formatPreviewClock() {
    try {
      return new Date()
        .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        .replace(/\s*[ap]\.?m\.?/i, '');
    } catch (e) {
      return '9:41';
    }
  }

  function formatPreviewDay() {
    try {
      return new Date().toLocaleDateString(undefined, { weekday: 'long' });
    } catch (e) {
      return 'Wednesday';
    }
  }

  function getDefaultNotifyIconUrl() {
    var siteIcon = '/branding/favicon192.webp';
    if (siteIcon) {
      if (/^https?:\/\//i.test(siteIcon)) return siteIcon;
      var origin = window.location.origin || '';
      return origin + (siteIcon.charAt(0) === '/' ? siteIcon : '/' + siteIcon);
    }
    var link = document.querySelector(
      'link[rel="apple-touch-icon"], link[rel="shortcut icon"], link[rel="icon"]'
    );
    if (link && link.href) return link.href;
    return 'https://cdn.ttmenus.com/branding/ttmenus/ttmenus.gif';
  }

  function setPreviewIconWrap(wrap, iconUrl, useFallbackBell) {
    var img = wrap.querySelector('[data-preview-field="icon"]');
    if (!img) return;
    if (iconUrl && !useFallbackBell) {
      img.onerror = function () {
        setPreviewIconWrap(wrap, '', true);
      };
      img.src = iconUrl;
      img.removeAttribute('hidden');
      wrap.classList.add('dashboard-notify-mock-icon-wrap--has-img');
    } else {
      img.onerror = null;
      img.removeAttribute('src');
      img.setAttribute('hidden', '');
      wrap.classList.remove('dashboard-notify-mock-icon-wrap--has-img');
    }
  }

  function updateNotifyPlatformPreviewContainer(containerId, config) {
    var root = document.getElementById(containerId);
    if (!root) return;

    var title = truncatePreviewText(config.getTitle(), 120);
    var message = truncatePreviewText(config.getMessage(), 220);
    var iconPath = config.getIcon();
    var imagePath = config.getImage();
    var appName = truncatePreviewText(getClientDomain() || 'TTMenus', 48);
    var iconUrl = iconPath ? resolveNotifyImageUrl(iconPath) : getDefaultNotifyIconUrl();
    var imageUrl = imagePath ? resolveNotifyImageUrl(imagePath) : '';

    root.querySelectorAll('[data-preview-field="title"]').forEach(function (el) {
      el.textContent = title;
    });
    root.querySelectorAll('[data-preview-field="message"]').forEach(function (el) {
      el.textContent = message;
    });
    root.querySelectorAll('[data-preview-field="app"]').forEach(function (el) {
      el.textContent = appName;
    });
    root.querySelectorAll('[data-preview-field="time"]').forEach(function (el) {
      el.textContent = formatPreviewTime();
    });
    root.querySelectorAll('[data-preview-field="clock"]').forEach(function (el) {
      el.textContent = formatPreviewClock();
    });
    root.querySelectorAll('[data-preview-field="day"]').forEach(function (el) {
      el.textContent = formatPreviewDay();
    });

    root.querySelectorAll('[data-preview-icon-wrap]').forEach(function (wrap) {
      setPreviewIconWrap(wrap, iconUrl, false);
    });

    root.querySelectorAll('[data-preview-banner-wrap]').forEach(function (wrap) {
      var img = wrap.querySelector('[data-preview-field="banner"]');
      if (imageUrl) {
        if (img) img.src = imageUrl;
        wrap.removeAttribute('hidden');
      } else {
        if (img) img.removeAttribute('src');
        wrap.setAttribute('hidden', '');
      }
    });

    root.querySelectorAll('[data-preview-ios-expanded]').forEach(function (panel) {
      var img = panel.querySelector('[data-preview-field="banner"]');
      if (imageUrl) {
        if (img) img.src = imageUrl;
        panel.removeAttribute('hidden');
      } else {
        if (img) img.removeAttribute('src');
        panel.setAttribute('hidden', '');
      }
    });

    root.classList.toggle('dashboard-notify-previews--has-banner', !!imageUrl);
    root.classList.toggle('dashboard-notify-previews--has-icon', !!(iconPath || iconUrl));
  }

  function initNotifySubTabs(root, options) {
    if (!root) return;
    var boundKey = options.boundKey || 'data-notify-subtabs-bound';
    if (root.getAttribute(boundKey) === 'true') return;
    root.setAttribute(boundKey, 'true');

    var tabAttr = options.tabAttr;
    var paneAttr = options.paneAttr;
    var tabs = root.querySelectorAll(options.tabSelector);
    var panes = root.querySelectorAll(options.paneSelector);
    var order = options.order || [];
    var defaultName = options.defaultName || order[0];

    function selectTab(name) {
      if (!name) return;

      tabs.forEach(function (tab) {
        var active = tab.getAttribute(tabAttr) === name;
        tab.classList.toggle('dashboard-notify-preview-tab--active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.tabIndex = active ? 0 : -1;
      });

      panes.forEach(function (pane) {
        var show = pane.getAttribute(paneAttr) === name;
        pane.classList.toggle('dashboard-notify-preview-pane--active', show);
      });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function (ev) {
        ev.preventDefault();
        selectTab(tab.getAttribute(tabAttr));
      });

      if (!order.length) return;

      tab.addEventListener('keydown', function (ev) {
        var current = tab.getAttribute(tabAttr);
        var index = order.indexOf(current);
        if (index === -1) return;
        var next = null;
        if (ev.key === 'ArrowRight') next = order[(index + 1) % order.length];
        else if (ev.key === 'ArrowLeft') next = order[(index + order.length - 1) % order.length];
        else if (ev.key === 'Home') next = order[0];
        else if (ev.key === 'End') next = order[order.length - 1];
        if (!next) return;
        ev.preventDefault();
        selectTab(next);
        var nextTab = root.querySelector('[' + tabAttr + '="' + next + '"]');
        if (nextTab) nextTab.focus();
      });
    });

    selectTab(defaultName);
  }

  function initNotifyPreviewTabs(root) {
    initNotifySubTabs(root, {
      boundKey: 'data-preview-tabs-bound',
      tabSelector: '.dashboard-notify-preview-tabs [data-preview-tab]',
      paneSelector: '.dashboard-notify-preview-stage > [data-preview-pane]',
      tabAttr: 'data-preview-tab',
      paneAttr: 'data-preview-pane',
      order: ['web', 'android', 'ios'],
      defaultName: 'web',
    });
  }

  function initHistorySubTabs() {
    var root = document.getElementById('notifyHistorySubTabs');
    if (!root) return;

    initNotifySubTabs(root, {
      boundKey: 'data-history-tabs-bound',
      tabSelector: '.dashboard-notify-history-tablist [data-history-tab]',
      paneSelector: '.dashboard-notify-history-panels > [data-history-pane]',
      tabAttr: 'data-history-tab',
      paneAttr: 'data-history-pane',
      order: ['sent', 'welcome', 'photos'],
      defaultName: 'sent',
    });

    var tabs = root.querySelectorAll('.dashboard-notify-history-tablist [data-history-tab]');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var name = tab.getAttribute('data-history-tab');
        if (name === 'photos') {
          loadPhotoApprovals().catch(function () {});
        } else if (name === 'welcome') {
          loadWelcomeHistory().catch(function () {});
        }
      });
    });

    var params = new URLSearchParams(window.location.search);
    var historyTab = params.get('history');
    if (historyTab === 'photos' || historyTab === 'welcome' || historyTab === 'sent') {
      var target = root.querySelector('[data-history-tab="' + historyTab + '"]');
      if (target) target.click();
    }
  }

  function initNotifyMediaTabs() {
    initNotifySubTabs(document.getElementById('notifyWelcomeMediaTabs'), {
      boundKey: 'data-media-tabs-bound',
      tabSelector: '.dashboard-notify-media-tablist [data-media-tab]',
      paneSelector: '.dashboard-notify-media-panels > [data-media-pane]',
      tabAttr: 'data-media-tab',
      paneAttr: 'data-media-pane',
      order: ['icon', 'banner', 'badge'],
      defaultName: 'icon',
    });

    initNotifySubTabs(document.getElementById('notifySendMediaTabs'), {
      boundKey: 'data-media-tabs-bound',
      tabSelector: '.dashboard-notify-media-tablist [data-media-tab]',
      paneSelector: '.dashboard-notify-media-panels > [data-media-pane]',
      tabAttr: 'data-media-tab',
      paneAttr: 'data-media-pane',
      order: ['icon', 'banner'],
      defaultName: 'icon',
    });
  }

  function refreshWelcomePlatformPreview() {
    updateNotifyPlatformPreviewContainer('notifyWelcomePlatformPreviews', {
      getTitle: function () {
        return getNotifyFieldValue('notifyWelcomeTitle') || 'Welcome! 🎉';
      },
      getMessage: function () {
        return (
          getNotifyFieldValue('notifyWelcomeMessage') ||
          'Thanks for subscribing — we\'ll keep you updated on specials and menu changes.'
        );
      },
      getIcon: function () {
        return getNotifyFieldValue('notifyDefaultIcon');
      },
      getImage: function () {
        return getNotifyFieldValue('notifyDefaultImage');
      },
    });
  }

  function refreshSendPlatformPreview() {
    updateNotifyPlatformPreviewContainer('notifySendPlatformPreviews', {
      getTitle: function () {
        return getNotifyFieldValue('notifyTitle') || 'Notification title';
      },
      getMessage: function () {
        return getNotifyFieldValue('notifyMessage') || 'Your message appears here.';
      },
      getIcon: function () {
        return getNotifyFieldValue('notifyIcon') || getNotifyFieldValue('notifyDefaultIcon');
      },
      getImage: function () {
        return getNotifyFieldValue('notifyImage') || getNotifyFieldValue('notifyDefaultImage');
      },
    });
  }

  function refreshNotifyPlatformPreviews() {
    refreshWelcomePlatformPreview();
    refreshSendPlatformPreview();
  }

  function initNotifyPlatformPreviews() {
    ['notifyWelcomePlatformPreviews', 'notifySendPlatformPreviews'].forEach(function (id) {
      var root = document.getElementById(id);
      if (root) initNotifyPreviewTabs(root);
    });

    var welcomeIds = ['notifyWelcomeTitle', 'notifyWelcomeMessage'];
    var sendIds = ['notifyTitle', 'notifyMessage'];

    welcomeIds.concat(sendIds).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.getAttribute('data-notify-preview-bound') === 'true') return;
      el.setAttribute('data-notify-preview-bound', 'true');
      el.addEventListener('input', refreshNotifyPlatformPreviews);
      el.addEventListener('change', refreshNotifyPlatformPreviews);
    });

    refreshNotifyPlatformPreviews();
  }

  async function uploadNotifyImage(file, statusEl) {
    if (!file) throw new Error('No file selected.');
    if (file.size > 5 * 1024 * 1024) throw new Error('File is too large. Maximum size is 5 MB.');
    var allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (file.type && allowed.indexOf(file.type) === -1) {
      throw new Error('Invalid file type. Use JPG, PNG, GIF, or WebP.');
    }
    await ensureNotifyToken();
    var formData = new FormData();
    formData.append('image', file);
    if (statusEl) {
      statusEl.textContent = 'Uploading…';
      statusEl.classList.remove('dashboard-notify-upload-status--error');
    }
    var headers = { Accept: 'application/json' };
    var token = window.AuthClient && AuthClient.getAccessToken && AuthClient.getAccessToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    var res = await fetch(getApiBase() + '/upload/image', {
      method: 'POST',
      credentials: 'include',
      headers: headers,
      body: formData,
    });
    if (res.status === 401) {
      if (window.AuthClient && AuthClient.logout) await AuthClient.logout().catch(function () {});
      window.location.href = '/login/';
      throw new Error('Session expired. Please sign in again.');
    }
    var text = await res.text();
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) {
      if (!res.ok) throw new Error(text || res.statusText);
    }
    if (!res.ok) throw new Error((data && (data.error || data.message)) || text || 'Upload failed');
    var imageUrl = (data && (data.url || data.image_url)) || '';
    if (!imageUrl) throw new Error('Upload succeeded but no URL was returned.');
    return imageUrl;
  }

  function initNotifyImageUploads() {
    document.querySelectorAll('.dashboard-notify-image-file').forEach(function (input) {
      if (input.getAttribute('data-notify-upload-bound') === 'true') return;
      input.setAttribute('data-notify-upload-bound', 'true');
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        var targetId = input.getAttribute('data-notify-target');
        if (!file || !targetId) return;
        var statusEl = document.getElementById(targetId + 'Status');
        uploadNotifyImage(file, statusEl)
          .then(function (url) {
            setNotifyImageField(targetId, url);
            if (statusEl) statusEl.textContent = 'Uploaded.';
          })
          .catch(function (err) {
            if (statusEl) {
              statusEl.textContent = err.message || 'Upload failed.';
              statusEl.classList.add('dashboard-notify-upload-status--error');
            }
          })
          .finally(function () { input.value = ''; });
      });
    });
    document.querySelectorAll('.dashboard-notify-clear-image').forEach(function (btn) {
      if (btn.getAttribute('data-notify-clear-bound') === 'true') return;
      btn.setAttribute('data-notify-clear-bound', 'true');
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-notify-target');
        if (!targetId) return;
        setNotifyImageField(targetId, '');
        var statusEl = document.getElementById(targetId + 'Status');
        if (statusEl) {
          statusEl.textContent = 'Removed.';
          statusEl.classList.remove('dashboard-notify-upload-status--error');
        }
      });
    });
  }

  function initBroadcastOption() {
    var row = document.getElementById('dashboardNotifyBroadcastRow');
    if (!row) return;
    var domain = String(getClientDomain() || '').replace(/^www\./i, '').toLowerCase();
    if (domain === 'ttmenus.com') row.removeAttribute('hidden');
    else row.setAttribute('hidden', '');
  }

  function setWelcomeStatus(el, msg, isError) {
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('dashboard-notify-status-error', !!isError);
  }

  async function loadWelcomeSettings() {
    var titleEl = document.getElementById('notifyWelcomeTitle');
    var msgEl = document.getElementById('notifyWelcomeMessage');
    if (!titleEl && !msgEl) return;

    var domain = getClientDomain();
    var data = await notifyFetch('/clients/' + encodeURIComponent(domain) + '/settings', {
      method: 'GET',
      headers: authHeaders(),
    });
    var s = (data && data.settings) || {};
    if (titleEl) titleEl.value = s.welcome_title || '';
    if (msgEl) msgEl.value = s.welcome_message || '';
    setNotifyImageField('notifyDefaultIcon', s.notification_icon || '');
    setNotifyImageField('notifyDefaultImage', s.notification_image || '');
    setNotifyImageField('notifyDefaultBadge', s.notification_badge || '');
    setNotifyImageField('notifyIcon', getNotifyFieldValue('notifyIcon'));
    setNotifyImageField('notifyImage', getNotifyFieldValue('notifyImage'));
    refreshWelcomePlatformPreview();
  }

  async function saveWelcome(ev) {
    ev.preventDefault();
    var form = document.getElementById('dashboardNotifyWelcomeForm');
    var statusEl = document.getElementById('notifyWelcomeSaveStatus');
    var btn = document.getElementById('btnNotifyWelcomeSave');
    if (!form) return;

    var title = (document.getElementById('notifyWelcomeTitle') || {}).value;
    var message = (document.getElementById('notifyWelcomeMessage') || {}).value;
    var icon = (document.getElementById('notifyDefaultIcon') || {}).value;
    var image = (document.getElementById('notifyDefaultImage') || {}).value;
    var badge = (document.getElementById('notifyDefaultBadge') || {}).value;
    var payload = {
      welcome_title: String(title || '').trim(),
      welcome_message: String(message || '').trim(),
      notification_icon: String(icon || '').trim(),
      notification_image: String(image || '').trim(),
      notification_badge: String(badge || '').trim(),
    };

    if (btn) btn.disabled = true;
    setWelcomeStatus(statusEl, 'Saving…', false);

    try {
      await notifyFetch('/clients/' + encodeURIComponent(getClientDomain()) + '/settings', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      setWelcomeStatus(statusEl, 'Saved.', false);
    } catch (err) {
      setWelcomeStatus(statusEl, err.message || 'Save failed.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function initWelcomeForm() {
    var welcomeForm = document.getElementById('dashboardNotifyWelcomeForm');
    if (!welcomeForm || !getApiBase()) return;

    loadWelcomeSettings().catch(function (err) {
      var statusEl = document.getElementById('notifyWelcomeSaveStatus');
      setWelcomeStatus(
        statusEl,
        'Could not load welcome message: ' + (err && err.message ? err.message : 'unknown error'),
        true
      );
    });

    welcomeForm.addEventListener('submit', function (ev) {
      saveWelcome(ev);
    });

    initNotifyImageUploads();
  }

  window.DashboardNotifications = {
    init: init,
    initTabs: initNotifyTabs,
    loadDashboardCard: loadDashboardCard,
    fetchOverview: fetchOverview,
    refreshOverview: refreshOverview,
    refreshPlatformPreviews: refreshNotifyPlatformPreviews,
  };
})();
