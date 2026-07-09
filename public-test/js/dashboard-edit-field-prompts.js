/**
 * Edit-menu field validation + color prompts (onboarding-style).
 * Tuned for performance: debounced updates, incremental refresh, lazy enable.
 */
(function (global) {
  'use strict';

  var FIELD_PROMPT = ['dashboard-edit-field--prompt-empty', 'dashboard-edit-field--prompt-required', 'dashboard-edit-field--prompt-complete'];
  var PANEL_PROMPT = [
    'dashboard-menu-item-wizard-panel--prompt-empty',
    'dashboard-menu-item-wizard-panel--prompt-required',
    'dashboard-menu-item-wizard-panel--prompt-complete',
  ];
  var TAB_PROMPT = ['dashboard-wizard-tab--prompt-empty', 'dashboard-wizard-tab--prompt-required', 'dashboard-wizard-tab--prompt-complete'];
  var WRAP_PROMPT = [
    'dashboard-menu-item-wizard-panels--prompt-empty',
    'dashboard-menu-item-wizard-panels--prompt-required',
    'dashboard-menu-item-wizard-panels--prompt-complete',
    'dashboard-menu-item-wizard-panels--prompt-progress',
  ];

  var DEBOUNCE_MS = 120;
  var bound = false;
  var enabled = false;
  var refreshTimer = null;
  var rafId = null;
  var observer = null;
  var cachedFields = null;
  var wizardCache = null;
  var promoWizardCache = null;
  var locationWizardCache = null;
  var sectionWizardCache = null;

  function shouldStyleControl(input) {
    if (!input || input.disabled || input.type === 'hidden') return false;
    if (input.getAttribute('aria-hidden') === 'true' || input.classList.contains('hidden')) return false;
    return true;
  }

  function controlIsEmpty(input) {
    if (!input) return true;
    if (input.type === 'file') return !(input.files && input.files.length);
    if (input.type === 'checkbox' || input.type === 'radio') return !input.checked;
    if (input.tagName === 'SELECT') return !String(input.value != null ? input.value : '').trim();
    return !String(input.value != null ? input.value : '').trim();
  }

  function getFieldControl(host) {
    if (!host) return null;
    var file = host.querySelector('input[type=file]:not(.hidden)');
    if (file) return file;
    var required = host.querySelector('input:not([type=hidden]):required, textarea:required, select:required');
    if (required) return required;
    return host.querySelector('input:not([type=hidden]):not([readonly]), textarea:not([readonly]), select');
  }

  function fieldHostInActiveEditor(host) {
    if (!host || !host.isConnected || host.classList.contains('hidden')) return false;
    var form = host.closest('#dashboardEditForm');
    if (!form || form.classList.contains('hidden')) return false;
    if (host.closest('.dashboard-edit-field-group.hidden')) return false;
    if (host.closest('.dashboard-edit-section-basics.hidden')) return false;
    if (host.closest('.dashboard-edit-section-fields.hidden')) return false;
    if (host.closest('.dashboard-edit-menuitem-fields.hidden')) return false;
    return true;
  }

  function fieldHostIsVisible(host) {
    if (!fieldHostInActiveEditor(host)) return false;
    var wizPanel = host.closest('.dashboard-menu-item-wizard-panel');
    if (wizPanel && wizPanel.classList.contains('hidden')) return false;
    return true;
  }

  /** Field belongs to an active wizard panel (counts for tab prompts even when panel is hidden). */
  function fieldHostInWizardPanel(host) {
    if (!fieldHostInActiveEditor(host)) return false;
    return !!host.closest('.dashboard-menu-item-wizard-panel');
  }

  function getPanelFieldsForWizardPrompts(panel) {
    var out = [];
    if (!panel) return out;
    var panelFields = panel.querySelectorAll('.dashboard-edit-field');
    for (var f = 0; f < panelFields.length; f++) {
      if (fieldHostInWizardPanel(panelFields[f])) out.push(panelFields[f]);
    }
    return out;
  }

  function setPromptClass(el, classes, next) {
    if (!el) return;
    var cur = null;
    for (var i = 0; i < classes.length; i++) {
      if (el.classList.contains(classes[i])) {
        cur = classes[i];
        break;
      }
    }
    var nextClass = next ? classes[classes.indexOf(next)] || next : null;
    if (cur === nextClass) return;
    for (var j = 0; j < classes.length; j++) el.classList.remove(classes[j]);
    if (nextClass) el.classList.add(nextClass);
  }

  function inferCompositeKind(host) {
    var explicit = host.getAttribute('data-dashboard-composite');
    if (explicit) return explicit;
    if (!host) return null;
    if (host.querySelector('.dashboard-menu-item-promotions-ui')) return 'menu-item-promotions';
    if (host.querySelector('.dashboard-side-categories-ui')) return 'side-categories';
    if (host.querySelector('.dashboard-pairs-ui')) return 'pairs';
    if (host.querySelector('.dashboard-list-ui')) return 'list-values';
    if (host.querySelector('.dashboard-prices-ui')) return 'prices';
    if (host.querySelector('.dashboard-menu-item-images-ui')) return 'menu-item-images';
    if (host.querySelector('#dashboardEditSectionIcon')) return 'section-icon';
    return null;
  }

  function listValuesFilled(host) {
    var inputs = host.querySelectorAll('.list-value');
    for (var i = 0; i < inputs.length; i++) {
      if (!controlIsEmpty(inputs[i])) return true;
    }
    return false;
  }

  function pairsFilled(host) {
    var rows = host.querySelectorAll('.dashboard-pair-row');
    for (var i = 0; i < rows.length; i++) {
      var nameInp = rows[i].querySelector('.pair-name');
      var priceInp = rows[i].querySelector('.pair-price');
      if ((nameInp && !controlIsEmpty(nameInp)) || (priceInp && !controlIsEmpty(priceInp))) return true;
    }
    return false;
  }

  function sideCategoriesFilled(host) {
    var blocks = host.querySelectorAll('.side-cat-block');
    for (var b = 0; b < blocks.length; b++) {
      var block = blocks[b];
      var catName = block.querySelector('.side-cat-name');
      var displayName = block.querySelector('.side-cat-display-name');
      if ((catName && !controlIsEmpty(catName)) || (displayName && !controlIsEmpty(displayName))) return true;
      var items = block.querySelectorAll('.side-item-name');
      for (var j = 0; j < items.length; j++) {
        if (!controlIsEmpty(items[j])) return true;
      }
    }
    return false;
  }

  function menuItemPromotionsFilled(host) {
    var rows = host.querySelectorAll('.dashboard-menu-item-promo-row');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (
        (row.querySelector('.menu-item-promo-days') && !controlIsEmpty(row.querySelector('.menu-item-promo-days'))) ||
        (row.querySelector('.menu-item-promo-label') && !controlIsEmpty(row.querySelector('.menu-item-promo-label'))) ||
        (row.querySelector('.menu-item-promo-value') && !controlIsEmpty(row.querySelector('.menu-item-promo-value'))) ||
        (row.querySelector('.menu-item-promo-image') && !controlIsEmpty(row.querySelector('.menu-item-promo-image')))
      ) {
        return true;
      }
    }
    return false;
  }

  function compositeFilled(host, kind) {
    if (kind === 'menu-item-images' || kind === 'slideshow-images' || kind === 'promo-images') {
      return !!host.querySelector('.dashboard-menu-item-image-row');
    }
    if (kind === 'hero-image' || kind === 'section-image-top' || kind === 'section-image-bottom') {
      var inp =
        host.querySelector('#dashboardEditHeroImage') ||
        host.querySelector('#dashboardEditSectionImageTop') ||
        host.querySelector('#dashboardEditSectionImageBottom');
      return inp ? !controlIsEmpty(inp) : false;
    }
    if (kind === 'section-icon') {
      var iconInp = host.querySelector('#dashboardEditSectionIcon');
      return iconInp ? !controlIsEmpty(iconInp) : false;
    }
    if (kind === 'prices') {
      var rows = host.querySelectorAll('.dashboard-price-row .price-price');
      for (var i = 0; i < rows.length; i++) {
        if (!controlIsEmpty(rows[i])) return true;
      }
      return false;
    }
    if (kind === 'opening-hours') {
      var ta = host.querySelector('#dashboardEditLocationOpeningHours');
      var raw = ta ? String(ta.value || '').trim() : '';
      if (!raw) return false;
      try {
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return false;
        var dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        for (var d = 0; d < dayKeys.length; d++) {
          var arr = parsed[dayKeys[d]];
          if (!Array.isArray(arr)) continue;
          var openTime = null;
          for (var i = 0; i < arr.length; i++) {
            var item = arr[i];
            if (!item || !item.type || !item.time) continue;
            if (item.type === 'Open') openTime = item.time;
            else if (item.type === 'Close' && openTime) {
              if (String(openTime) !== String(item.time)) return true;
              openTime = null;
            }
          }
        }
        return false;
      } catch (_) {
        return false;
      }
    }
    if (kind === 'list-values') return listValuesFilled(host);
    if (kind === 'pairs') return pairsFilled(host);
    if (kind === 'side-categories') return sideCategoriesFilled(host);
    if (kind === 'menu-item-promotions') return menuItemPromotionsFilled(host);
    return false;
  }

  function hostWantsRequiredWhenEmpty(host) {
    return host.getAttribute('data-dashboard-required') === 'true' || !!host.querySelector('[required]');
  }

  function computeFieldPromptState(host, opts) {
    opts = opts || {};
    var inWizard = fieldHostInWizardPanel(host);
    if (opts.wizardPanel) {
      if (!inWizard) return null;
    } else if (!fieldHostIsVisible(host)) {
      return null;
    }
    var composite = inferCompositeKind(host);
    if (composite) {
      if (compositeFilled(host, composite)) return 'dashboard-edit-field--prompt-complete';
      return hostWantsRequiredWhenEmpty(host)
        ? 'dashboard-edit-field--prompt-required'
        : 'dashboard-edit-field--prompt-empty';
    }
    var input = getFieldControl(host);
    if (!shouldStyleControl(input)) return null;
    if (!controlIsEmpty(input)) return 'dashboard-edit-field--prompt-complete';
    if (input.readOnly) return null;
    return input.required || host.getAttribute('data-dashboard-required') === 'true'
      ? 'dashboard-edit-field--prompt-required'
      : 'dashboard-edit-field--prompt-empty';
  }

  function fieldPromptState(host) {
    return computeFieldPromptState(host, { wizardPanel: false });
  }

  function fieldPromptStateForWizard(host) {
    return computeFieldPromptState(host, { wizardPanel: true });
  }

  function applyFieldPromptState(host) {
    setPromptClass(host, FIELD_PROMPT, fieldPromptState(host));
  }

  function applyFieldPromptStateForWizard(host) {
    setPromptClass(host, FIELD_PROMPT, fieldPromptStateForWizard(host));
  }

  function getCachedFields(scope) {
    var root = scope || document.getElementById('dashboardEditPage');
    if (!root) return [];
    if (!cachedFields || cachedFields._root !== root) {
      cachedFields = { _root: root, list: root.querySelectorAll('.dashboard-edit-field') };
    }
    return cachedFields.list;
  }

  function invalidateFieldCache() {
    cachedFields = null;
    wizardCache = null;
    promoWizardCache = null;
    locationWizardCache = null;
    sectionWizardCache = null;
  }

  function getWizardCache(scope) {
    var root = scope || document.getElementById('dashboardEditPage');
    if (!wizardCache || wizardCache._root !== root) {
      var wizardRoot = root && root.querySelector('#dashboardMenuItemWizardRoot');
      wizardCache = {
        _root: root,
        root: wizardRoot,
        panelsWrap: wizardRoot ? wizardRoot.querySelector('.dashboard-menu-item-wizard-panels') : null,
        panels: wizardRoot ? wizardRoot.querySelectorAll('.dashboard-menu-item-wizard-panel') : [],
        tabs: wizardRoot ? wizardRoot.querySelectorAll('.dashboard-wizard-tab') : [],
      };
    }
    return wizardCache;
  }

  function getPromoWizardCache(scope) {
    var root = scope || document.getElementById('dashboardEditPage');
    if (!promoWizardCache || promoWizardCache._root !== root) {
      var promoRoot = root && root.querySelector('#dashboardPromotionWizardRoot');
      var promoGroup = root && root.querySelector('#dashboardEditFieldsPromotion');
      promoWizardCache = {
        _root: root,
        root: promoRoot,
        visible: promoGroup && !promoGroup.classList.contains('hidden'),
        panelsWrap: promoRoot ? promoRoot.querySelector('.dashboard-menu-item-wizard-panels') : null,
        panels: promoRoot ? promoRoot.querySelectorAll('.dashboard-promotion-wizard-panel') : [],
        tabs: promoRoot ? promoRoot.querySelectorAll('.dashboard-wizard-tab[data-promo-wizard-index]') : [],
      };
    }
    return promoWizardCache;
  }

  function getLocationWizardCache(scope) {
    var root = scope || document.getElementById('dashboardEditPage');
    if (!locationWizardCache || locationWizardCache._root !== root) {
      var locRoot = root && root.querySelector('#dashboardLocationWizardRoot');
      var locGroup = root && root.querySelector('#dashboardEditFieldsLocation');
      locationWizardCache = {
        _root: root,
        root: locRoot,
        visible: locGroup && !locGroup.classList.contains('hidden'),
        panelsWrap: locRoot ? locRoot.querySelector('.dashboard-menu-item-wizard-panels') : null,
        panels: locRoot ? locRoot.querySelectorAll('.dashboard-location-wizard-panel') : [],
        tabs: locRoot ? locRoot.querySelectorAll('.dashboard-wizard-tab[data-location-wizard-index]') : [],
      };
    }
    return locationWizardCache;
  }

  function getSectionWizardCache(scope) {
    var root = scope || document.getElementById('dashboardEditPage');
    if (!sectionWizardCache || sectionWizardCache._root !== root) {
      var secRoot = root && root.querySelector('#dashboardSectionWizardRoot');
      sectionWizardCache = {
        _root: root,
        root: secRoot,
        visible: secRoot && !secRoot.classList.contains('hidden'),
        panelsWrap: secRoot ? secRoot.querySelector('.dashboard-menu-item-wizard-panels') : null,
        panels: secRoot ? secRoot.querySelectorAll('.dashboard-section-wizard-panel') : [],
        tabs: secRoot ? secRoot.querySelectorAll('.dashboard-wizard-tab[data-section-wizard-index]') : [],
      };
    }
    return sectionWizardCache;
  }

  function refreshSectionWizardPanelAndTabPrompts(scope) {
    var wiz = getSectionWizardCache(scope);
    if (!wiz.root || !wiz.visible) return;

    var panelStates = [];
    for (var p = 0; p < wiz.panels.length; p++) {
      var panel = wiz.panels[p];
      var fields = getPanelFieldsForWizardPrompts(panel);
      for (var fi = 0; fi < fields.length; fi++) applyFieldPromptStateForWizard(fields[fi]);
      var state = panelPromptStateFromFields(fields);
      panelStates[p] = state;
      var panelClass =
        state === 'progress' ? 'dashboard-menu-item-wizard-panel--prompt-empty' : 'dashboard-menu-item-wizard-panel--prompt-' + state;
      setPromptClass(panel, PANEL_PROMPT, panelClass);
    }

    for (var t = 0; t < wiz.tabs.length; t++) {
      var tab = wiz.tabs[t];
      var idx = parseInt(tab.getAttribute('data-section-wizard-index'), 10);
      var state = panelStates[idx];
      if (state == null) {
        setPromptClass(tab, TAB_PROMPT, null);
        continue;
      }
      var tabClass =
        state === 'progress' ? 'dashboard-wizard-tab--prompt-empty' : 'dashboard-wizard-tab--prompt-' + state;
      setPromptClass(tab, TAB_PROMPT, tabClass);
    }

    if (wiz.panelsWrap) {
      var wrapRequired = false;
      var wrapComplete = 0;
      for (var w = 0; w < panelStates.length; w++) {
        if (panelStates[w] === 'required') wrapRequired = true;
        if (panelStates[w] === 'complete') wrapComplete++;
      }
      var wrapClass = 'dashboard-menu-item-wizard-panels--prompt-empty';
      if (wrapRequired) wrapClass = 'dashboard-menu-item-wizard-panels--prompt-required';
      else if (wrapComplete === wiz.panels.length && wiz.panels.length) wrapClass = 'dashboard-menu-item-wizard-panels--prompt-complete';
      else if (wrapComplete > 0) wrapClass = 'dashboard-menu-item-wizard-panels--prompt-progress';
      setPromptClass(wiz.panelsWrap, WRAP_PROMPT, wrapClass);
    }
  }

  function refreshLocationWizardPanelAndTabPrompts(scope) {
    var wiz = getLocationWizardCache(scope);
    if (!wiz.root || !wiz.visible) return;

    var panelStates = [];
    for (var p = 0; p < wiz.panels.length; p++) {
      var panel = wiz.panels[p];
      var fields = getPanelFieldsForWizardPrompts(panel);
      for (var fi = 0; fi < fields.length; fi++) applyFieldPromptStateForWizard(fields[fi]);
      var state = panelPromptStateFromFields(fields);
      panelStates[p] = state;
      var panelClass =
        state === 'progress' ? 'dashboard-menu-item-wizard-panel--prompt-empty' : 'dashboard-menu-item-wizard-panel--prompt-' + state;
      setPromptClass(panel, PANEL_PROMPT, panelClass);
    }

    for (var t = 0; t < wiz.tabs.length; t++) {
      var tab = wiz.tabs[t];
      var idx = parseInt(tab.getAttribute('data-location-wizard-index'), 10);
      var state = panelStates[idx];
      if (state == null) {
        setPromptClass(tab, TAB_PROMPT, null);
        continue;
      }
      var tabClass =
        state === 'progress' ? 'dashboard-wizard-tab--prompt-empty' : 'dashboard-wizard-tab--prompt-' + state;
      setPromptClass(tab, TAB_PROMPT, tabClass);
    }

    if (wiz.panelsWrap) {
      var wrapRequired = false;
      var wrapComplete = 0;
      for (var w = 0; w < panelStates.length; w++) {
        if (panelStates[w] === 'required') wrapRequired = true;
        if (panelStates[w] === 'complete') wrapComplete++;
      }
      var wrapClass = 'dashboard-menu-item-wizard-panels--prompt-empty';
      if (wrapRequired) wrapClass = 'dashboard-menu-item-wizard-panels--prompt-required';
      else if (wrapComplete === wiz.panels.length && wiz.panels.length) wrapClass = 'dashboard-menu-item-wizard-panels--prompt-complete';
      else if (wrapComplete > 0) wrapClass = 'dashboard-menu-item-wizard-panels--prompt-progress';
      setPromptClass(wiz.panelsWrap, WRAP_PROMPT, wrapClass);
    }
  }

  function refreshPromoWizardPanelAndTabPrompts(scope) {
    var wiz = getPromoWizardCache(scope);
    if (!wiz.root || !wiz.visible) return;

    var panelStates = [];
    for (var p = 0; p < wiz.panels.length; p++) {
      var panel = wiz.panels[p];
      var fields = getPanelFieldsForWizardPrompts(panel);
      for (var fi = 0; fi < fields.length; fi++) applyFieldPromptStateForWizard(fields[fi]);
      var state = panelPromptStateFromFields(fields);
      panelStates[p] = state;
      var panelClass =
        state === 'progress' ? 'dashboard-menu-item-wizard-panel--prompt-empty' : 'dashboard-menu-item-wizard-panel--prompt-' + state;
      setPromptClass(panel, PANEL_PROMPT, panelClass);
    }

    for (var t = 0; t < wiz.tabs.length; t++) {
      var tab = wiz.tabs[t];
      var idx = parseInt(tab.getAttribute('data-promo-wizard-index'), 10);
      var state = panelStates[idx];
      if (state == null) {
        setPromptClass(tab, TAB_PROMPT, null);
        continue;
      }
      var tabClass =
        state === 'progress' ? 'dashboard-wizard-tab--prompt-empty' : 'dashboard-wizard-tab--prompt-' + state;
      setPromptClass(tab, TAB_PROMPT, tabClass);
    }

    if (wiz.panelsWrap) {
      var wrapRequired = false;
      var wrapComplete = 0;
      for (var w = 0; w < panelStates.length; w++) {
        if (panelStates[w] === 'required') wrapRequired = true;
        if (panelStates[w] === 'complete') wrapComplete++;
      }
      var wrapClass = 'dashboard-menu-item-wizard-panels--prompt-empty';
      if (wrapRequired) wrapClass = 'dashboard-menu-item-wizard-panels--prompt-required';
      else if (wrapComplete === wiz.panels.length && wiz.panels.length) wrapClass = 'dashboard-menu-item-wizard-panels--prompt-complete';
      else if (wrapComplete > 0) wrapClass = 'dashboard-menu-item-wizard-panels--prompt-progress';
      setPromptClass(wiz.panelsWrap, WRAP_PROMPT, wrapClass);
    }
  }

  function panelPromptStateFromFields(fields) {
    if (!fields.length) return 'empty';
    var anyRequired = false;
    var allComplete = true;
    var anyComplete = false;
    for (var i = 0; i < fields.length; i++) {
      var host = fields[i];
      if (host.classList.contains('dashboard-edit-field--prompt-required')) anyRequired = true;
      if (host.classList.contains('dashboard-edit-field--prompt-complete')) anyComplete = true;
      if (!host.classList.contains('dashboard-edit-field--prompt-complete')) allComplete = false;
    }
    if (anyRequired) return 'required';
    if (allComplete) return 'complete';
    if (anyComplete) return 'progress';
    return 'empty';
  }

  function refreshWizardPanelAndTabPrompts(scope) {
    var wiz = getWizardCache(scope);
    if (!wiz.root || wiz.root.classList.contains('hidden')) return;

    var panelStates = [];
    for (var p = 0; p < wiz.panels.length; p++) {
      var panel = wiz.panels[p];
      var fields = getPanelFieldsForWizardPrompts(panel);
      for (var fi = 0; fi < fields.length; fi++) applyFieldPromptStateForWizard(fields[fi]);
      var state = panelPromptStateFromFields(fields);
      panelStates[p] = state;
      var panelClass =
        state === 'progress' ? 'dashboard-menu-item-wizard-panel--prompt-empty' : 'dashboard-menu-item-wizard-panel--prompt-' + state;
      setPromptClass(panel, PANEL_PROMPT, panelClass);
    }

    for (var t = 0; t < wiz.tabs.length; t++) {
      var tab = wiz.tabs[t];
      var idx = parseInt(tab.getAttribute('data-wizard-index'), 10);
      var state = panelStates[idx];
      if (state == null) {
        setPromptClass(tab, TAB_PROMPT, null);
        continue;
      }
      var tabClass =
        state === 'progress' ? 'dashboard-wizard-tab--prompt-empty' : 'dashboard-wizard-tab--prompt-' + state;
      setPromptClass(tab, TAB_PROMPT, tabClass);
    }

    if (wiz.panelsWrap) {
      var wrapRequired = false;
      var wrapComplete = 0;
      for (var w = 0; w < panelStates.length; w++) {
        if (panelStates[w] === 'required') wrapRequired = true;
        if (panelStates[w] === 'complete') wrapComplete++;
      }
      var wrapClass = 'dashboard-menu-item-wizard-panels--prompt-empty';
      if (wrapRequired) wrapClass = 'dashboard-menu-item-wizard-panels--prompt-required';
      else if (wrapComplete === wiz.panels.length && wiz.panels.length) wrapClass = 'dashboard-menu-item-wizard-panels--prompt-complete';
      else if (wrapComplete > 0) wrapClass = 'dashboard-menu-item-wizard-panels--prompt-progress';
      setPromptClass(wiz.panelsWrap, WRAP_PROMPT, wrapClass);
    }
  }

  function refreshFields(hosts) {
    if (!enabled) return;
    var list = hosts;
    if (!list) {
      list = getCachedFields();
    } else if (!list.length && list.nodeType === 1) {
      list = [list];
    }
    for (var i = 0; i < list.length; i++) {
      applyFieldPromptState(list[i]);
    }
    refreshWizardPanelAndTabPrompts();
    refreshPromoWizardPanelAndTabPrompts();
    refreshLocationWizardPanelAndTabPrompts();
    refreshSectionWizardPanelAndTabPrompts();
  }

  function refresh(root) {
    if (!enabled) return;
    invalidateFieldCache();
    var scope = root || document.getElementById('dashboardEditPage');
    if (!scope) return;
    var form = scope.querySelector('#dashboardEditForm');
    if (!form || form.classList.contains('hidden')) return;
    refreshFields(getCachedFields(scope));
  }

  function scheduleRefresh(host) {
    if (!enabled) return;
    if (host) {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(function () {
        refreshTimer = null;
        refreshFields(host);
      }, DEBOUNCE_MS);
      return;
    }
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      refreshTimer = null;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(function () {
        rafId = null;
        refresh();
      });
    }, DEBOUNCE_MS);
  }

  function onInputEvent(e) {
    if (!enabled || !e.target || !e.target.closest) return;
    if (!e.target.closest('.dashboard-edit-page, .dashboard-edit-color-aside')) return;
    var host = e.target.closest('.dashboard-edit-field');
    scheduleRefresh(host || undefined);
  }

  function labelForHost(host) {
    var lab = host.querySelector('label');
    if (!lab) return 'This field';
    var t = (lab.textContent || '').trim().replace(/\s*\(optional\)\s*/gi, '').replace(/\s*\*+\s*$/, '').trim();
    return t || 'This field';
  }

  function hostIsInvalid(host, opts) {
    opts = opts || {};
    if (opts.wizardPanel) {
      if (!fieldHostInWizardPanel(host)) return false;
    } else if (!fieldHostIsVisible(host)) {
      return false;
    }
    var composite = inferCompositeKind(host);
    if (composite) {
      if (!hostWantsRequiredWhenEmpty(host)) return false;
      return !compositeFilled(host, composite);
    }
    var input = getFieldControl(host);
    return !!(input && input.required && controlIsEmpty(input));
  }

  function collectPanelValidation(panel) {
    var fields = getPanelFieldsForWizardPrompts(panel);
    var missing = [];
    var firstHost = null;
    for (var i = 0; i < fields.length; i++) {
      var host = fields[i];
      applyFieldPromptStateForWizard(host);
      if (hostIsInvalid(host, { wizardPanel: true })) {
        missing.push(labelForHost(host));
        if (!firstHost) firstHost = host;
      }
    }
    return { fields: fields, missing: missing, firstHost: firstHost };
  }

  function validateWizardPanel(panel) {
    if (!panel) {
      return { ok: true, missing: [], firstHost: null, message: '' };
    }
    refresh();
    var result = collectPanelValidation(panel);
    if (!result.missing.length) {
      return { ok: true, missing: [], firstHost: null, message: '' };
    }
    var message =
      result.missing.length === 1
        ? 'Fill in required field: ' + result.missing[0] + '.'
        : 'Fill in required fields: ' + result.missing.slice(0, 4).join(', ') + (result.missing.length > 4 ? '…' : '') + '.';
    return { ok: false, missing: result.missing, firstHost: result.firstHost, message: message };
  }

  function focusFieldHost(host) {
    if (!host) return;
    var panel = host.closest('.dashboard-menu-item-wizard-panel');
    if (panel) {
      var locIdx = panel.getAttribute('data-location-wizard-index');
      if (locIdx != null && locIdx !== '' && typeof global.__dashboardFocusLocationWizardStep === 'function') {
        global.__dashboardFocusLocationWizardStep(parseInt(locIdx, 10));
      } else {
        var secIdx = panel.getAttribute('data-section-wizard-index');
        if (secIdx != null && secIdx !== '' && typeof global.__dashboardFocusSectionWizardStep === 'function') {
          global.__dashboardFocusSectionWizardStep(parseInt(secIdx, 10));
        } else {
          var promoIdx = panel.getAttribute('data-promo-wizard-index');
          if (promoIdx != null && promoIdx !== '' && typeof global.__dashboardFocusPromoWizardStep === 'function') {
            global.__dashboardFocusPromoWizardStep(parseInt(promoIdx, 10));
          } else {
            var menuIdx = panel.getAttribute('data-wizard-index');
            if (menuIdx != null && menuIdx !== '' && typeof global.__dashboardFocusMenuItemWizardStep === 'function') {
              global.__dashboardFocusMenuItemWizardStep(parseInt(menuIdx, 10));
            }
          }
        }
      }
    }
    window.setTimeout(function() {
      if (host.scrollIntoView) host.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      var input = getFieldControl(host);
      if (input && typeof input.focus === 'function') input.focus();
    }, 80);
  }

  function validateVisibleForm() {
    var form = document.getElementById('dashboardEditForm');
    if (!form || form.classList.contains('hidden')) {
      return { ok: true, missing: [], firstHost: null, message: '' };
    }
    refresh();
    var missing = [];
    var firstHost = null;
    var fields = getCachedFields();
    for (var i = 0; i < fields.length; i++) {
      var host = fields[i];
      if (!fieldHostIsVisible(host)) continue;
      if (hostIsInvalid(host)) {
        missing.push(labelForHost(host));
        if (!firstHost) firstHost = host;
      }
    }
    if (!missing.length) {
      return { ok: true, missing: [], firstHost: null, message: '' };
    }
    var message =
      missing.length === 1
        ? 'Fill in required field: ' + missing[0] + '.'
        : 'Fill in required fields: ' + missing.slice(0, 4).join(', ') + (missing.length > 4 ? '…' : '') + '.';
    return { ok: false, missing: missing, firstHost: firstHost, message: message };
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener('input', onInputEvent, true);
    document.addEventListener('change', onInputEvent, true);
    var fieldsRoot = document.getElementById('dashboardEditFormFields');
    var colorFields = document.getElementById('dashboardEditColorFields');
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(function (mutations) {
        if (!enabled) return;
        var structural = false;
        for (var i = 0; i < mutations.length; i++) {
          if (mutations[i].type === 'childList') {
            structural = true;
            break;
          }
        }
        if (structural) {
          invalidateFieldCache();
          scheduleRefresh();
        }
      });
      if (fieldsRoot) observer.observe(fieldsRoot, { childList: true, subtree: true });
      if (colorFields) observer.observe(colorFields, { childList: true, subtree: true });
    }
  }

  function enable() {
    if (!bound) bind();
    enabled = true;
    refresh();
  }

  function disable() {
    enabled = false;
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function init() {
    bind();
  }

  global.DashboardEditFieldPrompts = {
    refresh: refresh,
    validateVisibleForm: validateVisibleForm,
    validateWizardPanel: validateWizardPanel,
    focusFieldHost: focusFieldHost,
    bind: bind,
    enable: enable,
    disable: disable,
    init: init,
    invalidate: invalidateFieldCache,
  };
})(typeof window !== 'undefined' ? window : globalThis);
