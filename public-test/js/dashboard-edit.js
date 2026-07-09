/** Menu editor (extracted from client-dashboard-edit layout). */

document.addEventListener('DOMContentLoaded', async function() {
  if (window.AuthClient && typeof AuthClient.whenReady === 'function') {
    await AuthClient.whenReady();
  }
  if (!window.AuthClientAccess || !(await AuthClientAccess.protectClientPage({ redirectUrl: '/login/', noAccessRedirect: '/' }))) {
    return;
  }

  var embedPanelMode = (function () {
    try {
      var path = window.location.pathname.replace(/\/+$/, '');
      if (path.endsWith('/edit-menu-colors/panel') || path.endsWith('/edit-menu/panel')) return true;
      return new URLSearchParams(window.location.search).get('embed') === 'panel' &&
        (path.endsWith('/edit-menu-colors') || path.endsWith('/edit-menu'));
    } catch (e) {
      return false;
    }
  })();

  if (!embedPanelMode) {
    try {
      var legacyEmbed = new URLSearchParams(window.location.search).get('embed') === 'panel';
      var pathNorm = window.location.pathname.replace(/\/+$/, '');
      var onLegacyThemePath = pathNorm.endsWith('/edit-menu');
      var onLegacyPanelPath = pathNorm.endsWith('/edit-menu/panel');
      if (legacyEmbed && onLegacyThemePath) {
        var qs = window.location.search || '?embed=panel';
        window.location.replace('/edit-menu-colors/panel/' + (qs.charAt(0) === '?' ? qs : '?' + qs));
        return;
      }
      if (legacyEmbed && onLegacyPanelPath) {
        var panelQs = window.location.search || '';
        window.location.replace('/edit-menu-colors/panel/' + (panelQs.charAt(0) === '?' ? panelQs : panelQs ? '?' + panelQs : ''));
        return;
      }
      if (!legacyEmbed && onLegacyThemePath) {
        window.location.replace('/edit-menu-colors/' + (window.location.search || '') + (window.location.hash || ''));
        return;
      }
    } catch (e) { /* ignore */ }
  }
  /** Theme and rearrange shell pages use an iframe preview; content edits use ?embed=panel from the live menu. */
  var editorShellPath = (function () {
    try {
      return window.location.pathname.replace(/\/+$/, '');
    } catch (e) {
      return '';
    }
  })();
  var themeOnlyMode = !embedPanelMode && editorShellPath.endsWith('/edit-menu-colors');
  var rearrangeOnlyMode = !embedPanelMode && editorShellPath.endsWith('/edit-menu-rearrange');
  var parentMenuWindow =
    embedPanelMode && window.parent && window.parent !== window ? window.parent : null;

  function getPreviewWinDoc() {
    if (embedPanelMode && parentMenuWindow) {
      return { win: parentMenuWindow, doc: parentMenuWindow.document };
    }
    return { win: iframe && iframe.contentWindow, doc: iframe && iframe.contentDocument };
  }

  function getEditorPreviewDocument() {
    var p = getPreviewWinDoc();
    return p && p.doc;
  }

  function isEmbedWizardSaveStep(step, baseLabels) {
    return embedPanelMode && step === baseLabels.length;
  }

  function embedWizardMaxStep(baseLabels) {
    return embedPanelMode ? baseLabels.length : baseLabels.length - 1;
  }

  function embedWizardStepLabel(step, baseLabels) {
    if (isEmbedWizardSaveStep(step, baseLabels)) return 'Save';
    return baseLabels[step] || '';
  }

  var embedChangesFilterKind = null;

  function mountChangesPanelToEmbedSaveHost(kind) {
    var host = document.querySelector('.dashboard-edit-save-tab-host[data-embed-save-host="' + kind + '"]');
    var mount = document.getElementById('dashboardEditChangesPanelMount');
    if (!host || !mount) return;
    embedChangesFilterKind = kind || null;
    host.appendChild(mount);
    mount.classList.remove('hidden');
    syncPendingChangesPanel();
  }

  function clearEmbedChangesFilterIfKind(kind) {
    if (embedChangesFilterKind !== kind) return;
    embedChangesFilterKind = null;
    syncPendingChangesPanelScopeNote(null, 0);
  }

  function syncEmbedWizardNextButton(btn, step, baseLabels) {
    if (!btn) return;
    if (!embedPanelMode) {
      btn.disabled = step >= baseLabels.length - 1;
      btn.textContent = 'Next';
      btn.classList.remove('dashboard-btn-primary', 'dashboard-wizard-save-btn', 'dashboard-wizard-save-btn--pending');
      btn.classList.add('dashboard-btn-secondary');
      btn.removeAttribute('aria-label');
      return;
    }
    var onSave = isEmbedWizardSaveStep(step, baseLabels);
    if (onSave) {
      btn.disabled = false;
      btn.innerHTML =
        '<i class="fa fa-cloud-upload" aria-hidden="true"></i>' +
        '<span class="dashboard-wizard-save-btn-label">Save snapshot</span>';
      btn.classList.add('dashboard-btn-primary', 'dashboard-wizard-save-btn');
      btn.classList.remove('dashboard-btn-secondary');
      btn.setAttribute('aria-label', 'Save draft and menu snapshot');
      syncEmbedWizardSaveButtonPendingState(btn);
    } else {
      btn.textContent = 'Next';
      btn.classList.remove('dashboard-btn-primary', 'dashboard-wizard-save-btn', 'dashboard-wizard-save-btn--pending');
      btn.classList.add('dashboard-btn-secondary');
      btn.disabled = false;
      btn.removeAttribute('aria-label');
    }
  }

  function syncEmbedWizardSaveButtonPendingState(btn) {
    if (!btn || !btn.classList.contains('dashboard-wizard-save-btn')) return;
    var pending = collectPendingMenuChanges().length > 0;
    if (embedChangesFilterKind) {
      pending = filterChangesForEmbedHost(collectPendingMenuChanges(), embedChangesFilterKind).length > 0;
    }
    btn.classList.toggle('dashboard-wizard-save-btn--pending', pending);
    btn.setAttribute(
      'aria-label',
      pending ? 'Save draft and menu snapshot — pending changes' : 'Save draft and menu snapshot'
    );
  }

  function syncAllEmbedWizardSaveButtons() {
    syncEmbedWizardSaveButtonPendingState(btnMenuItemWizardNext);
    syncEmbedWizardSaveButtonPendingState(btnSectionWizardNext);
    syncEmbedWizardSaveButtonPendingState(btnPromoWizardNext);
  }

  var _embedSaveInFlight = null;

  function fetchLatestMenuVersionMenuData() {
    var base = '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID);
    return getFromCMS(base + '/menu-versions').then(function(data) {
      var versions = data && data.versions;
      if (!versions || !versions.length) return getFromCMS(base + '/menu');
      var sorted = versions.slice().sort(function(a, b) {
        var ta = new Date(a.updated_at || a.created_at || 0).getTime();
        var tb = new Date(b.updated_at || b.created_at || 0).getTime();
        return tb - ta;
      });
      var vid = sorted[0].id || sorted[0].ID;
      if (!vid) return getFromCMS(base + '/menu');
      return getFromCMS(base + '/menu-versions/' + encodeURIComponent(vid)).then(function(v) {
        if (v && (v.menu_data || v.menuData)) return v.menu_data || v.menuData;
        return getFromCMS(base + '/menu');
      });
    }).catch(function() {
      return getFromCMS(base + '/menu');
    });
  }

  function saveEmbedPanelSnapshot() {
    if (_embedSaveInFlight) return _embedSaveInFlight;
    setEditStatus('Saving draft and snapshot…');
    _embedSaveInFlight = Promise.resolve()
      .then(function() {
        if (editFormDirty) applyEditToPreview();
        return persistCurrentDraftToCMS();
      })
      .then(function() {
        return saveMenuSnapshotToCMS({
          updateLiveMenu: false,
          mergeLatestSnapshot: true,
          name:
            'Live menu edit · ' +
            new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
          description:
            'Menu snapshot from live menu editor — merges latest CMS snapshot with current layout and drafts.',
        });
      })
      .then(function() {
        editFormDirty = false;
        setEditStatus('Saved to menu snapshot');
        syncPendingChangesPanel();
        try {
          if (parentMenuWindow) {
            parentMenuWindow.postMessage(
              { type: 'ttms:close-menu-item-edit-modal', reload: false },
              window.location.origin
            );
          }
        } catch (msgErr) { /* ignore */ }
        closeEmbedPanelEditor();
      })
      .catch(function(err) {
        setEditStatus('Save failed');
        console.warn('saveEmbedPanelSnapshot', err);
        alert('Could not save: ' + (err && err.message ? err.message : String(err)));
      })
      .finally(function() {
        _embedSaveInFlight = null;
      });
    return _embedSaveInFlight;
  }

  function closeEmbedPanelEditor() {
    if (!embedPanelMode || !parentMenuWindow) return;
    try {
      if (parentMenuWindow.TTMSMenuItemEditModal && typeof parentMenuWindow.TTMSMenuItemEditModal.close === 'function') {
        parentMenuWindow.TTMSMenuItemEditModal.close();
        return;
      }
      parentMenuWindow.postMessage({ type: 'ttms:close-menu-item-edit-modal' }, window.location.origin);
    } catch (e) { /* ignore */ }
  }

  if (window.DashboardEditFieldPrompts && typeof window.DashboardEditFieldPrompts.init === 'function') {
    window.DashboardEditFieldPrompts.init();
  }

  // CMS / content-management service configuration
  var CMS_SERVICE_URL = window.CMS_SERVICE_URL || 'https://cms.ttmenus.com';
  var CMS_CLIENT_ID = window.CLIENT_ID || window.SITE_CLIENT_ID || '_ttms_menu_demo';
  window.CMS_SERVICE_URL = CMS_SERVICE_URL;
  window.CMS_CLIENT_ID = CMS_CLIENT_ID;

  var page = document.getElementById('dashboardEditPage');
  if (page) page.setAttribute('data-edit-submode', 'content');
  function syncDashboardEditHeaderHeight() {
    var hdr = document.querySelector('.dashboard-edit-header');
    if (!hdr || !page) return;
    page.style.setProperty('--dashboard-edit-header-height', hdr.getBoundingClientRect().height + 'px');
  }
  syncDashboardEditHeaderHeight();
  if (typeof ResizeObserver !== 'undefined') {
    var editHdr = document.querySelector('.dashboard-edit-header');
    if (editHdr) new ResizeObserver(syncDashboardEditHeaderHeight).observe(editHdr);
  } else {
    window.addEventListener('resize', syncDashboardEditHeaderHeight);
  }
  var iframe = document.getElementById('menuPreviewFrame');
  var previewIframeLoaded = false;
  function ensurePreviewIframeLoaded() {
    if (!iframe || previewIframeLoaded) return;
    var src = iframe.getAttribute('data-preview-src') || '/';
    if (!src || iframe.getAttribute('src') === src) {
      previewIframeLoaded = true;
      return;
    }
    iframe.setAttribute('src', src);
    previewIframeLoaded = true;
  }
  var btnPreview = document.getElementById('btnModePreview');
  var btnEdit = document.getElementById('btnModeEdit');
  var promptEl = document.getElementById('dashboardEditPrompt');
  var formEl = document.getElementById('dashboardEditForm');
  var selectedTypeEl = document.getElementById('dashboardEditSelectedType');
  var inputTitle = document.getElementById('dashboardEditTitle');
  var inputDesc = document.getElementById('dashboardEditDescription');
  var inputSectionTitle = document.getElementById('dashboardEditSectionTitle');
  var sectionTitleWrapEl = document.getElementById('dashboardEditSectionTitleWrap');
  var inputSectionDesc = document.getElementById('dashboardEditSectionDescription');
  var inputSectionWeight = document.getElementById('dashboardEditSectionWeight');
  var inputSectionIcon = document.getElementById('dashboardEditSectionIcon');
  var inputSectionImageTop = document.getElementById('dashboardEditSectionImageTop');
  var inputSectionImageBottom = document.getElementById('dashboardEditSectionImageBottom');
  var inputMenuItemImages = document.getElementById('dashboardEditMenuItemImages');
  var menuItemImagesContainer = document.getElementById('dashboardEditMenuItemImagesContainer');
  var btnAddMenuItemImage = document.getElementById('btnAddMenuItemImage');
  var btnBrowseSiteMenuItemImages = document.getElementById('btnBrowseSiteMenuItemImages');
  var btnAddMenuItemImageFile = document.getElementById('btnAddMenuItemImageFile');
  var menuItemImagesUploadStatusEl = document.getElementById('dashboardMenuItemImagesUploadStatus');
  var pricesContainer = document.getElementById('dashboardEditPricesContainer');
  var btnAddPrice = document.getElementById('btnAddPrice');
  var sideCategoriesContainer = document.getElementById('dashboardEditSideCategoriesContainer');
  var btnAddSideCategory = document.getElementById('btnAddSideCategory');
  var modificationsContainer = document.getElementById('dashboardEditModificationsContainer');
  var btnAddModification = document.getElementById('btnAddModification');
  var additionsContainer = document.getElementById('dashboardEditAdditionsContainer');
  var btnAddAddition = document.getElementById('btnAddAddition');
  var tagsContainer = document.getElementById('dashboardEditTagsContainer');
  var btnAddTag = document.getElementById('btnAddTag');
  var ingredientsContainer = document.getElementById('dashboardEditIngredientsContainer');
  var btnAddIngredient = document.getElementById('btnAddIngredient');
  var cookingmethodsContainer = document.getElementById('dashboardEditCookingmethodsContainer');
  var btnAddCookingmethod = document.getElementById('btnAddCookingmethod');
  var typesContainer = document.getElementById('dashboardEditTypesContainer');
  var btnAddType = document.getElementById('btnAddType');
  var eventsContainer = document.getElementById('dashboardEditEventsContainer');
  var btnAddEvent = document.getElementById('btnAddEvent');
  var menuItemPromotionsContainer = document.getElementById('dashboardEditMenuItemPromotionsContainer');
  var btnAddMenuItemPromotion = document.getElementById('btnAddMenuItemPromotion');
  var btnMenuItemWizardPrev = document.getElementById('btnMenuItemWizardPrev');
  var btnMenuItemWizardNext = document.getElementById('btnMenuItemWizardNext');
  var dashboardMenuItemWizardProgress = document.getElementById('dashboardMenuItemWizardProgress');
  var menuItemWizardStep = 0;
  var promoWizardStep = 0;
  var locationWizardStep = 0;
  var sectionWizardStep = 0;
  var MENU_ITEM_WIZARD_LABELS = ['Main item', 'Sides', 'Mods & adds', 'Tags & search', 'Availability', 'Promotions'];
  var PROMO_WIZARD_LABELS = ['Main', 'Link', 'Availability'];
  var LOCATION_WIZARD_LABELS = ['Location', 'Ordering', 'Opening hours'];
  var SECTION_WIZARD_LABELS = ['Icon', 'Details'];
  var LOCATION_WIZARD_HOURS_INDEX = 2;
  var btnPromoWizardPrev = document.getElementById('btnPromoWizardPrev');
  var btnPromoWizardNext = document.getElementById('btnPromoWizardNext');
  var dashboardPromotionWizardProgress = document.getElementById('dashboardPromotionWizardProgress');
  var btnLocationWizardPrev = document.getElementById('btnLocationWizardPrev');
  var btnLocationWizardNext = document.getElementById('btnLocationWizardNext');
  var dashboardLocationWizardProgress = document.getElementById('dashboardLocationWizardProgress');
  var btnSectionWizardPrev = document.getElementById('btnSectionWizardPrev');
  var btnSectionWizardNext = document.getElementById('btnSectionWizardNext');
  var dashboardSectionWizardProgress = document.getElementById('dashboardSectionWizardProgress');
  var inputAvailabilityDays = document.getElementById('dashboardEditAvailabilityDays');
  var inputAvailabilityTimeStart = document.getElementById('dashboardEditAvailabilityTimeStart');
  var inputAvailabilityTimeFinish = document.getElementById('dashboardEditAvailabilityTimeFinish');
  var btnSave = document.getElementById('btnSave');
  var btnMarkForDeletion = document.getElementById('btnMarkForDeletion');
  var contentSourceEl = document.getElementById('dashboardEditContentSource');
  var statusEl = document.getElementById('dashboardEditStatus');
  var editFormFieldsEl = document.getElementById('dashboardEditFormFields');
  var editFormLoadingEl = document.getElementById('dashboardEditFormLoading');
  var editFormLoadingLabel = editFormLoadingEl ? editFormLoadingEl.querySelector('.dashboard-edit-form-loading-label') : null;
  var embedLoadingEl = document.getElementById('dashboardEditEmbedLoading');
  var embedLoadingLabel = embedLoadingEl ? embedLoadingEl.querySelector('.dashboard-edit-embed-loading-label') : null;
  var fieldsGeneric = document.getElementById('dashboardEditFieldsGeneric');
  var fieldsLocation = document.getElementById('dashboardEditFieldsLocation');
  var fieldsPromotion = document.getElementById('dashboardEditFieldsPromotion');
  var fieldsSlideshow = document.getElementById('dashboardEditFieldsSlideshow');
  var fieldsHomeHero = document.getElementById('dashboardEditFieldsHomeHero');
  var inputHomeHeroImage = document.getElementById('dashboardEditHeroImage');
  var btnHeroImageReplace = document.getElementById('btnHeroImageReplace');
  var btnHeroImageFile = document.getElementById('btnHeroImageFile');
  var btnHeroImageRemove = document.getElementById('btnHeroImageRemove');
  var btnHeroImageBrowseSite = document.getElementById('btnHeroImageBrowseSite');
  var heroSiteImageModal = document.getElementById('dashboardHeroSiteImageModal');
  var heroSiteImageModalBackdrop = document.getElementById('dashboardHeroSiteImageModalBackdrop');
  var heroSiteImageModalClose = document.getElementById('dashboardHeroSiteImageModalClose');
  var heroSiteImageGrid = document.getElementById('dashboardHeroSiteImageGrid');
  var heroSiteImageLoading = document.getElementById('dashboardHeroSiteImageLoading');
  var heroSiteImageError = document.getElementById('dashboardHeroSiteImageError');
  var heroSiteImageEmpty = document.getElementById('dashboardHeroSiteImageEmpty');
  var siteImagesListCache = null;
  var draftAssetsListCache = null;
  /** Set when opening site-image modal; invoked with relative path (e.g. images/foo.webp). Cleared on close. */
  var siteImagePickerOnPick = null;
  var dashboardHeroImageRow = document.getElementById('dashboardHeroImageRow');
  var dashboardHeroImageThumbWrap = document.getElementById('dashboardHeroImageThumbWrap');
  var heroImageThumbImg = document.getElementById('dashboardHeroImageThumb');
  var dashboardHeroImageDraftHint = document.getElementById('dashboardHeroImageDraftHint');
  var heroImageUploadStatusEl = document.getElementById('dashboardHeroImageUploadStatus');
  var homeHeroIndexCache = { frontMatter: null, body: '' };
  var HOME_HERO_CONTENT_PATH = 'content/_index.md';
  var homeHeroPrefetchPromise = null;
  var heroImageThumbLoadSeq = 0;
  var heroImageRowBlobUrl = null;
  var inputLocationAddress = document.getElementById('dashboardEditLocationAddress');
  var inputLocationCity = document.getElementById('dashboardEditLocationCity');
  var inputLocationIsland = document.getElementById('dashboardEditLocationIsland');
  var inputLocationSubcategories = document.getElementById('dashboardEditLocationSubcategories');
  var inputLocationLat = document.getElementById('dashboardEditLocationLat');
  var inputLocationLng = document.getElementById('dashboardEditLocationLng');
  var inputLocationPhone = document.getElementById('dashboardEditLocationPhone');
  var inputLocationWhatsapp = document.getElementById('dashboardEditLocationWhatsapp');
  var inputLocationOrderingtables = document.getElementById('dashboardEditLocationOrderingtables');
  var inputLocationFooddrop = document.getElementById('dashboardEditLocationFooddrop');
  var inputLocationOpeningHours = document.getElementById('dashboardEditLocationOpeningHours');
  var btnUseCurrentLocation = document.getElementById('btnUseCurrentLocation');
  var locationGeoStatusEl = document.getElementById('dashboardLocationGeoStatus');
  var locationPreviewApplyTimer = null;
  var hoursWeekView = document.getElementById('hoursWeekView');
  var hoursDayView = document.getElementById('hoursDayView');
  var hoursWeekTimeline = document.getElementById('hoursWeekTimeline');
  var hoursBackToWeek = document.getElementById('hoursBackToWeek');
  var hoursDayViewTitle = document.getElementById('hoursDayViewTitle');
  var hoursDeleteDayBtn = document.getElementById('hoursDeleteDayBtn');
  var hoursDayFill = document.getElementById('hoursDayFill');
  var hoursDayOpen = document.getElementById('hoursDayOpen');
  var hoursDayClose = document.getElementById('hoursDayClose');
  var hoursDayHandleOpen = document.getElementById('hoursDayHandleOpen');
  var hoursDayHandleClose = document.getElementById('hoursDayHandleClose');
  var hoursDayHandleOpenTime = document.getElementById('hoursDayHandleOpenTime');
  var hoursDayHandleCloseTime = document.getElementById('hoursDayHandleCloseTime');
  var hoursDayTrackWrap = document.getElementById('hoursDayTrackWrap');
  var hoursDayTrack = document.getElementById('hoursDayTrack');
  var hoursDaySelectedHandle = null;
  var HOURS_DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'];
  var HOURS_DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var HOURS_SLOTS_PER_DAY = 48;
  var HOURS_WEEK_SLOTS = 336;
  var hoursPerDayData = {};
  var hoursZoomedDayIndex = null;
  var hoursDayOpenSlot = 22;
  var hoursDayCloseSlot = 44;
  var inputPromoTitle = document.getElementById('dashboardEditPromoTitle');
  var inputPromoDescription = document.getElementById('dashboardEditPromoDescription');
  var inputPromoLink = document.getElementById('dashboardEditPromoLink');
  var inputPromoImages = document.getElementById('dashboardEditPromoImages');
  var promoImagesContainer = document.getElementById('dashboardEditPromoImagesContainer');
  var btnAddPromoImage = document.getElementById('btnAddPromoImage');
  var btnAddPromoImageFile = document.getElementById('btnAddPromoImageFile');
  var promoImagesUploadStatusEl = document.getElementById('dashboardPromoImagesUploadStatus');
  var inputPromoRecurring = document.getElementById('dashboardEditPromoRecurring');
  var promoDaysofweekContainer = document.getElementById('dashboardEditPromoDaysofweekContainer');
  var inputPromoWeight = document.getElementById('dashboardEditPromoWeight');
  var btnAddPromoDay = document.getElementById('btnAddPromoDay');
  var slideshowViewEl = document.getElementById('dashboardEditSlideshowView');
  var inputSlideshowImages = document.getElementById('dashboardEditSlideshowImages');
  var slideshowImagesContainer = document.getElementById('dashboardEditSlideshowImagesContainer');
  var btnAddSlideshowImage = document.getElementById('btnAddSlideshowImage');
  var btnBrowseSiteSlideshowImages = document.getElementById('btnBrowseSiteSlideshowImages');
  var btnAddSlideshowImageFile = document.getElementById('btnAddSlideshowImageFile');
  var btnSectionSecondaryImageBrowse = document.getElementById('btnSectionSecondaryImageBrowse');
  var btnSectionSecondaryImageUpload = document.getElementById('btnSectionSecondaryImageUpload');
  var btnSectionSecondaryImageFile = document.getElementById('btnSectionSecondaryImageFile');
  var sectionSecondaryImageUploadStatusEl = document.getElementById('dashboardSectionSecondaryImageUploadStatus');
  var btnSectionImageBottomBrowse = document.getElementById('btnSectionImageBottomBrowse');
  var btnSectionImageBottomUpload = document.getElementById('btnSectionImageBottomUpload');
  var btnSectionImageBottomFile = document.getElementById('btnSectionImageBottomFile');
  var btnSectionImageBottomRemove = document.getElementById('btnSectionImageBottomRemove');
  var sectionImageBottomThumb = document.getElementById('dashboardSectionImageBottomThumb');
  var sectionImageBottomThumbWrap = document.getElementById('dashboardSectionImageBottomThumbWrap');
  var sectionImageBottomRow = document.getElementById('dashboardSectionImageBottomRow');
  var btnSectionIconUpload = document.getElementById('btnSectionIconUpload');
  var btnSectionIconBrowse = document.getElementById('btnSectionIconBrowse');
  var btnSectionIconFile = document.getElementById('btnSectionIconFile');
  var sectionIconUploadStatusEl = document.getElementById('dashboardSectionIconUploadStatus');
  var btnPromoBrowseSiteImages = document.getElementById('btnPromoBrowseSiteImages');
  var slideshowImagesUploadStatusEl = document.getElementById('dashboardSlideshowImagesUploadStatus');
  var asideEl = document.getElementById('dashboardEditAside');
  var btnTogglePanel = document.getElementById('btnToggleEditPanel');
  var colorAsideEl = document.getElementById('dashboardEditColorAside');
  var btnToggleColorPanel = document.getElementById('btnToggleColorPanel');
  var submodeWrap = document.getElementById('dashboardEditSubmodeWrap');
  var btnSubmodeContent = document.getElementById('btnSubmodeContent');
  var btnSubmodeMove = document.getElementById('btnSubmodeMove');
  var btnSubmodeColor = document.getElementById('btnSubmodeColor');
  var colorPrompt = document.getElementById('dashboardEditColorPrompt');

  var colorSectionsEl = document.getElementById('dashboardEditColorSections');
  var colorForm = document.getElementById('dashboardEditColorForm');
  var colorAsideTitle = document.getElementById('dashboardEditColorAsideTitle');
  var colorAsideTitleIcon = document.getElementById('dashboardEditColorAsideTitleIcon');
  var btnCloseColorSection = document.getElementById('btnCloseColorSection');

  function setColorAsideHeaderTitle(label, sectionId) {
    if (colorAsideTitle) colorAsideTitle.textContent = label;
    if (!colorAsideTitleIcon) return;
    var iconClass = sectionId ? (COLOR_SECTION_ICONS[sectionId] || 'fa-paint-brush') : 'fa-paint-brush';
    colorAsideTitleIcon.innerHTML = '<i class="fa ' + iconClass + '" aria-hidden="true"></i>';
  }

  function setColorAsideToggleIcon(expanded) {
    if (!btnToggleColorPanel) return;
    var iconWrap = btnToggleColorPanel.querySelector('.dashboard-edit-color-aside-toggle-icon');
    if (!iconWrap) return;
    var chevron = expanded ? 'fa-chevron-left' : 'fa-chevron-right';
    iconWrap.innerHTML = '<i class="fa ' + chevron + '" aria-hidden="true"></i>';
  }
  var colorFieldsEl = document.getElementById('dashboardEditColorFields');
  var btnApplyColor = document.getElementById('btnApplyColor');
  var btnBackColorSections = document.getElementById('btnBackColorSections');

  var editMode = false;
  var editSubmode = 'content'; // 'content' | 'move' | 'color'
  var MIN_MENU_ITEM_WEIGHT = 2;
  var EDIT_PROMPT_CONTENT_HTML = 'Switch to <strong>Edit</strong> above, then click a menu item, heading, or other element in the preview to select it and edit or add information here.';
  var EDIT_PROMPT_MOVE_HTML = 'Click the <strong>grip button</strong> (<i class="fa fa-bars" aria-hidden="true"></i>) on a section, menu item, or promotion to expand move controls attached to that item. Switch back to <strong>Content</strong> to edit fields, then save your changes.';

  if (embedPanelMode) {
    document.body.classList.add('dashboard-edit-embed-panel');
    editMode = true;
    editSubmode = 'content';
    if (page) page.setAttribute('data-edit-submode', 'content');
    if (submodeWrap) submodeWrap.classList.add('hidden');
    if (asideEl) asideEl.classList.remove('dashboard-edit-options-collapsed');
    if (btnTogglePanel) {
      btnTogglePanel.setAttribute('aria-expanded', 'true');
      btnTogglePanel.setAttribute('aria-label', 'Collapse edit panel');
      var toggleIcon = btnTogglePanel.querySelector('.dashboard-edit-options-toggle-icon');
      if (toggleIcon) toggleIcon.textContent = '◀';
    }
    if (btnPreview) {
      btnPreview.classList.remove('active');
      btnPreview.setAttribute('aria-pressed', 'false');
    }
    if (btnEdit) {
      btnEdit.classList.add('active');
      btnEdit.setAttribute('aria-pressed', 'true');
    }
    if (promptEl) promptEl.classList.add('hidden');
    var embedBack = document.getElementById('btnDashboardBack');
    if (embedBack) {
      var embedBackIcon = embedBack.querySelector('.fa');
      if (embedBackIcon) embedBackIcon.className = 'fa fa-times';
      embedBack.setAttribute('title', 'Close editor');
      embedBack.setAttribute('aria-label', 'Close editor');
    }
    document.querySelectorAll('.dashboard-embed-save-tab').forEach(function(el) {
      el.classList.remove('hidden');
    });
    var changesMount = document.getElementById('dashboardEditChangesPanelMount');
    if (changesMount) changesMount.classList.add('hidden');
    setEmbedPanelLoading(true, 'Loading editor…');
  }

  if (themeOnlyMode) {
    document.body.classList.add('dashboard-edit-theme-only');
    var themeHeader = document.querySelector('.dashboard-edit-header--theme');
    if (themeHeader) themeHeader.setAttribute('aria-label', 'Theme editor toolbar');
  }

  if (rearrangeOnlyMode) {
    document.body.classList.add('dashboard-edit-rearrange-only');
    var rearrangeHeader = document.querySelector('.dashboard-edit-header--rearrange');
    if (rearrangeHeader) rearrangeHeader.setAttribute('aria-label', 'Rearrange menu toolbar');
  }

  function expandColorAsidePanel() {
    if (!colorAsideEl) return;
    colorAsideEl.classList.remove('hidden', 'dashboard-edit-color-aside-collapsed');
    if (btnToggleColorPanel) {
      btnToggleColorPanel.setAttribute('aria-expanded', 'true');
      btnToggleColorPanel.setAttribute('aria-label', 'Collapse color panel');
      setColorAsideToggleIcon(true);
      var textEl = btnToggleColorPanel.querySelector('.dashboard-edit-color-aside-toggle-text');
      if (textEl) textEl.textContent = 'Collapse';
    }
  }

  function iframeEditOverlayActive() {
    return editMode && (editSubmode === 'content' || editSubmode === 'move');
  }

  function updateEditPromptForSubmode() {
    if (!promptEl) return;
    var intro = promptEl.querySelector('.dashboard-edit-options-intro');
    if (!intro) return;
    intro.innerHTML = editSubmode === 'move' ? EDIT_PROMPT_MOVE_HTML : EDIT_PROMPT_CONTENT_HTML;
  }

  function syncIframeMoveModeFromSubmode() {
    try {
      var doc = iframe && iframe.contentDocument;
      var win = iframe && iframe.contentWindow;
      if (!doc || !doc.body || !win || !win.__dashboardEditMode) return;
      var moveOn = editSubmode === 'move';
      win.__dashboardMoveMode = moveOn;
      doc.body.classList.toggle('dashboard-edit-move-mode', moveOn);
      if (!moveOn) {
        closeAllMoveToolbarsInDoc(doc);
      }
    } catch (e) { /* ignore */ }
  }
  var selectedElement = null;
  var selectedInfo = null;
  var selectedColorSectionId = null;
  var editFormDirty = false;
  var savedDraftPreviewId = null;
  var draftContentPaths = new Set();
  var draftPreviewRecordsByPath = {};
  var draftChangeDetailsCache = {};
  var draftChangeDetailsProvisionalPaths = new Set();
  var markedForDeletionContentPaths = new Set();
  var loadDraftsOnLoad = (function() {
    var p = new URLSearchParams(window.location.search);
    var mode = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('editPreviewMode');
    return p.get('load') === 'drafts' || mode === 'drafts';
  })();
  var menuVersionFromUrl = new URLSearchParams(window.location.search).get('menu_version');
  /** Set from editor-snapshot when source is saved_version; updated after save-only. */
  var editorSnapshotVersionId = null;
  /** Git path for theme CSS (must match CMS allowlist and static/css/colors.css). */
  var THEME_COLORS_CONTENT_PATH = 'static/css/colors.css';
  /** @deprecated Legacy draft path; still loaded when applying old previews. */
  var THEME_OVERRIDES_LEGACY_PATH = 'static/css/theme-overrides.css';
  /** When > 0, applyColorOverrides does not queue a CMS theme draft (hydration load). */
  var themeColorSuppressPersist = 0;
  if (loadDraftsOnLoad && typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('editPreviewMode', 'drafts');
    if (menuVersionFromUrl) sessionStorage.setItem('editMenuVersionId', menuVersionFromUrl);
  }
  if (!loadDraftsOnLoad && typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('editMenuVersionId');
  }

  function setEditStatus(msg) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    syncSaveButtonAppearance();
  }

  function countPendingMenuChanges() {
    return collectPendingMenuChanges().length;
  }

  function hasPendingMenuChanges() {
    return countPendingMenuChanges() > 0;
  }

  function syncSaveButtonAppearance() {
    if (!btnSave) return;
    var count = countPendingMenuChanges();
    var pending = count > 0;
    var countEl = document.getElementById('btnSaveChangeCount');
    btnSave.classList.toggle('dashboard-edit-header-save--pending', pending);
    btnSave.classList.toggle('dashboard-edit-header-save--synced', !pending);
    if (countEl) {
      if (pending && count > 0) {
        countEl.textContent = String(count);
        countEl.classList.remove('hidden');
        countEl.setAttribute('aria-hidden', 'false');
      } else {
        countEl.textContent = '';
        countEl.classList.add('hidden');
        countEl.setAttribute('aria-hidden', 'true');
      }
    }
    if (pending) {
      btnSave.title = count === 1
        ? 'Save or publish 1 pending change'
        : 'Save or publish ' + count + ' pending changes';
      btnSave.setAttribute('aria-label', count === 1
        ? 'Save 1 pending menu change'
        : 'Save ' + count + ' pending menu changes');
    } else {
      btnSave.title = 'Menu matches live — save snapshot or publish';
      btnSave.setAttribute('aria-label', 'Save menu — in sync with live');
    }
    syncPendingChangesPanel();
  }

  function setEmbedPanelLoading(on, message) {
    if (!embedPanelMode) return;
    document.body.classList.toggle('dashboard-edit-embed-loading-active', !!on);
    if (!embedLoadingEl) return;
    embedLoadingEl.classList.toggle('hidden', !on);
    embedLoadingEl.setAttribute('aria-busy', on ? 'true' : 'false');
    if (embedLoadingLabel && message) embedLoadingLabel.textContent = message;
  }

  function notifyEmbedPanelFormReady() {
    if (!embedPanelMode) return;
    try {
      window.parent.postMessage({ type: 'ttms:embed-panel-form-ready' }, window.location.origin);
    } catch (e) { /* ignore */ }
  }

  function setEditFormLoading(on, message) {
    if (!editFormLoadingEl) return;
    if (on) {
      editFormLoadingEl.classList.remove('hidden');
      editFormLoadingEl.setAttribute('aria-busy', 'true');
      if (editFormFieldsEl) editFormFieldsEl.setAttribute('aria-busy', 'true');
      if (editFormLoadingLabel && message) editFormLoadingLabel.textContent = message;
    } else {
      editFormLoadingEl.classList.add('hidden');
      editFormLoadingEl.setAttribute('aria-busy', 'false');
      if (editFormFieldsEl) editFormFieldsEl.setAttribute('aria-busy', 'false');
    }
  }

  function scheduleEndEditFormLoad() {
    var finish = function() {
      setEditFormLoading(false);
      setEmbedPanelLoading(false);
      notifyEmbedPanelFormReady();
      if (window.DashboardEditFieldPrompts) {
        window.DashboardEditFieldPrompts.invalidate();
        window.DashboardEditFieldPrompts.enable();
      }
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(finish, { timeout: 180 });
    } else {
      setTimeout(finish, 0);
    }
  }

  function homeHeroHasCachedContent() {
    return !!(homeHeroIndexCache && homeHeroIndexCache.frontMatter &&
      typeof homeHeroIndexCache.frontMatter === 'object' &&
      Object.keys(homeHeroIndexCache.frontMatter).length);
  }

  function prefetchHomeHeroIndexContent() {
    if (homeHeroHasCachedContent()) return Promise.resolve(homeHeroIndexCache);
    if (homeHeroPrefetchPromise) return homeHeroPrefetchPromise;
    var filePath = '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/file?path=' + encodeURIComponent(HOME_HERO_CONTENT_PATH);
    homeHeroPrefetchPromise = getFromCMS(filePath).then(function(data) {
      homeHeroIndexCache = { frontMatter: data.frontMatter || {}, body: data.body || '' };
      return homeHeroIndexCache;
    }).catch(function() {
      homeHeroPrefetchPromise = null;
      return null;
    });
    return homeHeroPrefetchPromise;
  }

  if (formEl) {
    formEl.addEventListener('input', function() {
      editFormDirty = true;
      setEditStatus('Unsaved changes (not yet published)');
    });
    formEl.addEventListener('change', function() {
      editFormDirty = true;
      setEditStatus('Unsaved changes (not yet published)');
    });
  }
  if (inputTitle) {
    inputTitle.addEventListener('input', function() {
      scheduleSyncNewMenuItemPathFromTitle();
    });
    inputTitle.addEventListener('blur', function() {
      if (titlePathSyncTimer) {
        clearTimeout(titlePathSyncTimer);
        titlePathSyncTimer = null;
      }
      syncNewMenuItemPathFromTitle();
    });
  }

  // Maps to static/css/colors.css – section id -> { label, vars: [ { name, label } ] }
  var COLOR_SECTION_ICONS = {
    header: 'fa-navicon',
    hero: 'fa-picture-o',
    main: 'fa-columns',
    menu: 'fa-cutlery',
    buttons: 'fa-hand-pointer-o',
    footer: 'fa-ellipsis-h'
  };

  var COLOR_SECTIONS = [
    { id: 'header', label: 'Header', vars: [
      { name: '--header-bg-color', label: 'Background' },
      { name: '--header-text-color', label: 'Nav text' },
      { name: '--header-bordercolor-1', label: 'Border' }
    ]},
    { id: 'hero', label: 'Hero', vars: [
      { name: '--hero-bg-color', label: 'Background' },
      { name: '--hero-text-color', label: 'Text' }
    ]},
    { id: 'main', label: 'Main', vars: [
      { name: '--main-bg', label: 'Background' },
      { name: '--main-text-color', label: 'Text' }
    ]},
    { id: 'menu', label: 'Menu', vars: [
      { name: '--menu-bg-color-1', label: 'Background 1' },
      { name: '--menu-bg-color-2', label: 'Background 2' },
      { name: '--menu-text-color', label: 'Text' }
    ]},
    { id: 'buttons', label: 'Buttons', vars: [
      { name: '--button-color1', label: 'Button 1' },
      { name: '--button-color2', label: 'Button 2' },
      { name: '--button-text-color1', label: 'Button text' },
      { name: '--button-text-color2', label: 'Secondary text' },
      { name: '--selected-button-color1', label: 'Selected bg 1' },
      { name: '--selected-button-color2', label: 'Selected bg 2' },
      { name: '--selected-button-color3', label: 'Selected bg 3' },
      { name: '--selected-text-color1', label: 'Selected text' },
      { name: '--selected-text-color3', label: 'Accent text' }
    ]},
    { id: 'footer', label: 'Footer', vars: [
      { name: '--footer-bg-color', label: 'Background' },
      { name: '--footer-text-color', label: 'Text' },
      { name: '--modal-bg-container-color', label: 'Modal overlay' }
    ]}
  ];

  // Editable selectors (order: more specific first). Click target is matched against these or their descendants.
  var EDITABLE_SELECTORS = [
    { selector: '.menu-item-title, .menu-item-title a', type: 'Menu item name' },
    { selector: '.menu-item-description', type: 'Menu item description' },
    { selector: '.menu-item-price', type: 'Menu item price' },
    { selector: '.menu-item-card', type: 'Menu item' },
    { selector: '.menu-header h2, .menu-header h2 a, .menu-header__link h2', type: 'Section title' },
    { selector: '.menu-summary', type: 'Section summary' },
    { selector: '.headerstyle h1', type: 'Page title' },
    { selector: '#logo', type: 'Logo' },
    { selector: '.logo_container', type: 'Logo area' }
  ];

  function getEditableAncestor(elt) {
    if (!elt || !elt.closest) return null;
    for (var i = 0; i < EDITABLE_SELECTORS.length; i++) {
      var sel = EDITABLE_SELECTORS[i].selector;
      var match = elt.closest(sel);
      if (match) return { element: match, type: EDITABLE_SELECTORS[i].type };
    }
    return null;
  }

  function getTextContent(elt) {
    return elt ? (elt.textContent || '').trim() : '';
  }

  function promotionSlugFromLink(link) {
    if (!link) return '';
    var path = String(link).replace(/^https?:\/\/[^/]+/i, '').split('?')[0];
    var parts = path.split('/').filter(Boolean);
    if (parts[0] === 'promotions' && parts.length >= 2) return parts[1];
    if (parts.length) return parts[parts.length - 1];
    return '';
  }

  function promotionSlugFromElement(el) {
    if (!el) return '';
    var id = el.getAttribute('data-ad-id') || '';
    if (id.indexOf('menu-ad-') === 0) {
      var slug = id.replace(/^menu-ad-/, '').replace(/-\d+$/, '');
      if (slug) return slug;
    }
    var title = el.getAttribute('data-ad-title') || '';
    if (title) {
      var titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (titleSlug) return titleSlug;
    }
    var url = el.getAttribute('data-ad-url') || el.getAttribute('data-ad-link') || '';
    slug = promotionSlugFromLink(url);
    return slug;
  }

  function getReelsCatalog(win, doc) {
    if (win && win.AdsClient && win.AdsClient._reelsCatalog && win.AdsClient._reelsCatalog.length) {
      return win.AdsClient._reelsCatalog;
    }
    if (!doc) return [];
    var container = doc.getElementById('homepage-ads-container') || doc.getElementById('client-ads-container');
    if (!container) return [];
    var slides = Array.prototype.slice.call(
      container.querySelectorAll('article.ads-reels-slide[data-catalog-index], article.ads-reels-slide[data-ad-url]')
    );
    slides = slides.filter(function(s) { return !s.classList.contains('menu-ad-scroll-end'); });
    slides.sort(function(a, b) {
      return (parseInt(a.getAttribute('data-catalog-index'), 10) || 0) - (parseInt(b.getAttribute('data-catalog-index'), 10) || 0);
    });
    return slides.map(function(slide) {
      return {
        ad: { title: slide.getAttribute('data-ad-title') || '', id: slide.getAttribute('data-ad-id') || '' },
        linkUrl: slide.getAttribute('data-ad-url') || ''
      };
    });
  }

  function syncPromotionDataset(el, win, doc) {
    if (!el || !doc) return;
    var catalog = getReelsCatalog(win, doc);
    var idx = el.getAttribute('data-reels-preview-index');
    if (idx == null || idx === '' || isNaN(parseInt(idx, 10))) return;
    var item = catalog[parseInt(idx, 10)];
    if (!item) return;
    var title = (item.ad && item.ad.title) || '';
    var link = item.linkUrl || '';
    if (title && !el.getAttribute('data-ad-title')) el.setAttribute('data-ad-title', title);
    if (link) {
      el.setAttribute('data-ad-url', link);
      el.setAttribute('data-ad-link', link);
    }
  }

  function isPromotionReelsSlide(el) {
    if (!el || el.tagName !== 'ARTICLE') return false;
    if (!el.classList || !el.classList.contains('ads-reels-slide')) return false;
    if (el.classList.contains('menu-ad-scroll-end')) return false;
    return !!(el.getAttribute('data-ad-id') || el.getAttribute('data-ad-url') || el.getAttribute('data-catalog-index') != null || el.hasAttribute('data-dashboard-edit-new-promotion'));
  }

  function isPromotionPreviewPanel(el) {
    if (!el || el.tagName !== 'LI') return false;
    if (!el.classList || !el.classList.contains('ad-panel')) return false;
    if (!el.closest('#pageadscontainer')) return false;
    return el.hasAttribute('data-reels-preview-index') || el.hasAttribute('data-ad-id');
  }

  function isLegacyPromotionSection(el) {
    return el && el.tagName === 'SECTION' && el.classList && el.classList.contains('ads') && el.classList.contains('menu-ad')
      && !el.classList.contains('menu-ad--reels-preview') && !el.classList.contains('menu-ad-scroll-end');
  }

  function isPromotionEditableTarget(el) {
    return isPromotionReelsSlide(el) || isPromotionPreviewPanel(el) || isLegacyPromotionSection(el);
  }

  function promotionCatalogIndex(el) {
    if (!el) return null;
    var previewIdx = el.getAttribute('data-reels-preview-index');
    if (previewIdx != null && previewIdx !== '') return previewIdx;
    var catalogIdx = el.getAttribute('data-catalog-index');
    return catalogIdx != null && catalogIdx !== '' ? catalogIdx : null;
  }

  function findReelsSlideByCatalogIndex(doc, idx) {
    if (!doc || idx == null || idx === '') return null;
    return doc.querySelector(
      '#homepage-ads-container article.ads-reels-slide[data-catalog-index="' + idx + '"], ' +
      '#client-ads-container article.ads-reels-slide[data-catalog-index="' + idx + '"]'
    );
  }

  function promotionContentPathFromElement(el, win, doc) {
    if (win && doc) syncPromotionDataset(el, win, doc);
    var slug = promotionSlugFromElement(el);
    return slug ? 'content/promotions/' + slug + '.md' : null;
  }

  function injectPromotionEditButton(doc, el, win, opts) {
    opts = opts || {};
    var adWrapClass = 'dashboard-edit-ad-btn-wrap';
    var existingWrap = el.querySelector('.' + adWrapClass);
    syncPromotionDataset(el, win, doc);
    el.classList.add('dashboard-edit-ad-wrap');
    if (existingWrap) {
      if (opts.showMove) dashboardInjectMoveToolbarIntoWrap(existingWrap, doc, { promotion: true });
      return;
    }
    var div = doc.createElement('div');
    div.className = adWrapClass;
    div.setAttribute('data-dashboard-edit', '1');
    if (opts.showMove) div.appendChild(createDashboardMoveToolbar(doc, { promotion: true }));
    var editBtn = doc.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'dashboard-edit-btn';
    editBtn.setAttribute('aria-label', 'Edit promotion');
    editBtn.innerHTML = '<i class="fa fa-pencil" aria-hidden="true"></i>';
    div.appendChild(editBtn);
    el.insertBefore(div, el.firstChild);
  }

  function applyPromotionFieldsToElement(el, titleVal, descVal, linkVal, imagesArr) {
    if (!el) return;
    var adTitleEl = el.querySelector('.clientad-heading a, .clientad-heading, h2 a, h2');
    if (adTitleEl) {
      var inner = adTitleEl.querySelector('a');
      if (inner) inner.textContent = titleVal;
      else adTitleEl.textContent = titleVal;
    }
    el.setAttribute('data-ad-title', titleVal);
    el.setAttribute('data-ad-description', descVal);
    el.setAttribute('data-ad-link', linkVal);
    if (linkVal) el.setAttribute('data-ad-url', linkVal);
    el.setAttribute('data-ad-images', JSON.stringify(imagesArr));
    el.querySelectorAll('a[href]').forEach(function(a) {
      if (linkVal) a.setAttribute('href', linkVal);
    });
    var imgs = el.querySelectorAll('img.ad-portrait, img.ad-portrait-bg, .ad-panel img, .ad-preview-media img');
    var firstPath = imagesArr[0] || '';
    var firstSrc = firstPath ? (firstPath.indexOf('/') === 0 ? firstPath : '/' + firstPath) : '';
    imgs.forEach(function(img, i) {
      var path = imagesArr[i] || firstPath;
      if (path) {
        var src = path.indexOf('/') === 0 ? path : '/' + path;
        img.setAttribute('src', src);
        if (titleVal) img.setAttribute('alt', titleVal);
      }
    });
    if (firstSrc) {
      el.querySelectorAll('video.ad-video').forEach(function(vid) {
        var poster = vid.getAttribute('poster');
        if (!poster || poster.indexOf('ads.ttmenus.com') === -1) vid.setAttribute('poster', firstSrc);
      });
    }
  }

  // ----- Content payload builders -----

  function buildPromotionPayloadFromState() {
    if (!selectedElement) return null;
    var el = selectedElement;
    var title = inputPromoTitle ? (inputPromoTitle.value || '').trim() : '';
    var desc = inputPromoDescription ? (inputPromoDescription.value || '').trim() : '';
    var link = inputPromoLink ? (inputPromoLink.value || '').trim() : '';
    var imagesArr = promoImagesContainer ? gatherPromoImagePathsFromRows() : (inputPromoImages ? hoursParseStringList(inputPromoImages.value) : []);
    var recurring = !!(inputPromoRecurring && inputPromoRecurring.checked);
    var daysArr = promoDaysofweekContainer ? getStringListFromUI(promoDaysofweekContainer) : [];
    var weightVal = inputPromoWeight ? inputPromoWeight.value.trim() : '';
    var weightNum = weightVal ? parseInt(weightVal, 10) : 0;
    if (isNaN(weightNum)) weightNum = 0;

    // Derive slug/contentPath from link if possible, otherwise from title
    var slug = '';
    if (link) {
      var linkPath = link.replace(/^https?:\/\/[^/]+/, '');
      var parts = linkPath.split('/').filter(function (p) { return p; });
      if (parts.length) slug = parts[parts.length - 1];
    }
    if (!slug && title) {
      slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
    if (!slug) slug = 'promotion';

    return {
      kind: 'promotion',
      clientId: CMS_CLIENT_ID,
      contentPath: 'content/promotions/' + slug + '.md',
      siteConfigPath: CMS_CLIENT_ID + '/hugo.toml',
      frontMatter: {
        title: title,
        link: link || '/promotions/' + slug + '/',
        images: imagesArr.map(function (p) { return { image: p }; }),
        recurring: recurring,
        daysofweek: daysArr,
        weight: weightNum
      },
      body: desc || ''
    };
  }

  function buildMenuItemPayloadFromState() {
    if (!selectedInfo || !selectedElement) return null;
    var contentPath = (selectedInfo.contentPath || '').trim();
    if (!contentPath || contentPath.indexOf('content/') !== 0 || contentPath.indexOf('...') !== -1 || /\/_index\.md$/i.test(contentPath)) return null;
    var title = inputTitle ? (inputTitle.value || '').trim() : '';
    var desc = inputDesc ? (inputDesc.value || '').trim() : '';
    var imagesArr = inputMenuItemImages ? hoursParseStringList(inputMenuItemImages.value) : [];
    var pricesFlat = pricesContainer ? getPricesFromUI(pricesContainer) : [];
    var prices = [];
    for (var i = 0; i < pricesFlat.length; i += 3) {
      prices.push({
        variable1: (pricesFlat[i] != null ? String(pricesFlat[i]).trim() : '') || '-',
        variable2: (pricesFlat[i + 1] != null ? String(pricesFlat[i + 1]).trim() : '') || '-',
        price: typeof pricesFlat[i + 2] === 'number' ? pricesFlat[i + 2] : (parseFloat(pricesFlat[i + 2]) || 0)
      });
    }
    var sideCats = sideCategoriesContainer ? getSideCategoriesFromUI(sideCategoriesContainer) : [];
    var modsFlat = modificationsContainer ? getPairsFromUI(modificationsContainer) : [];
    var mods = [];
    for (var j = 0; j < modsFlat.length; j += 2) { mods.push({ name: String(modsFlat[j] || ''), price: modsFlat[j + 1] != null ? (typeof modsFlat[j + 1] === 'number' ? modsFlat[j + 1] : parseFloat(modsFlat[j + 1]) || 0) : 0 }); }
    var addsFlat = additionsContainer ? getPairsFromUI(additionsContainer) : [];
    var adds = [];
    for (var k = 0; k < addsFlat.length; k += 2) { adds.push({ name: String(addsFlat[k] || ''), price: addsFlat[k + 1] != null ? (typeof addsFlat[k + 1] === 'number' ? addsFlat[k + 1] : parseFloat(addsFlat[k + 1]) || 0) : 0 }); }
    var tags = tagsContainer ? getStringListFromUI(tagsContainer) : [];
    var ingredients = ingredientsContainer ? getStringListFromUI(ingredientsContainer) : [];
    var cookingmethods = cookingmethodsContainer ? getStringListFromUI(cookingmethodsContainer) : [];
    var types = typesContainer ? getStringListFromUI(typesContainer) : [];
    var events = eventsContainer ? getStringListFromUI(eventsContainer) : [];
    var menuItemPromos = menuItemPromotionsContainer ? getMenuItemPromotionsFromUI(menuItemPromotionsContainer) : [];
    var availObj = getMenuItemAvailabilityFromState();
    var weightVal = MIN_MENU_ITEM_WEIGHT;
    if (selectedElement && selectedElement.getAttribute) {
      weightVal = parseInt(selectedElement.getAttribute('data-weight') || String(MIN_MENU_ITEM_WEIGHT), 10);
    }
    if (isNaN(weightVal) || weightVal < MIN_MENU_ITEM_WEIGHT) weightVal = MIN_MENU_ITEM_WEIGHT;
    var frontMatter = {
      title: title || 'Untitled',
      date: new Date().toISOString(),
      images: imagesArr.map(function (p) { return { image: p }; }),
      prices: prices,
      tags: tags,
      specials: [],
      events: events,
      promotions: menuItemPromos,
      ingredients: ingredients,
      cookingmethods: cookingmethods,
      types: types,
      weight: weightVal
    };
    if (sideCats && sideCats.length) frontMatter.side_categories = sideCats;
    if (mods && mods.length) frontMatter.modifications = mods;
    if (adds && adds.length) frontMatter.additions = adds;
    if (availObj) frontMatter.availability = availObj;
    return {
      kind: 'menu-item',
      clientId: CMS_CLIENT_ID,
      contentPath: contentPath,
      siteConfigPath: CMS_CLIENT_ID + '/hugo.toml',
      frontMatter: frontMatter,
      body: desc || ''
    };
  }

  function sectionSlugFromHeaderEl(headerEl) {
    if (!headerEl) return '';
    return (headerEl.getAttribute('data-section-slug') || '').trim().toLowerCase();
  }

  function isPromotionsSectionHeader(headerEl) {
    return sectionSlugFromHeaderEl(headerEl) === 'promotions';
  }

  function lockedSectionTitleFromHeader(headerEl) {
    if (!headerEl) return '';
    var titleEl = headerEl.querySelector('.headerstyle h2 a, h2.center.title a, h2 a, h1, h2');
    return titleEl ? (titleEl.textContent || '').trim() : '';
  }

  function sectionTitleForPayload(headerEl) {
    if (isPromotionsSectionHeader(headerEl)) {
      return lockedSectionTitleFromHeader(headerEl);
    }
    return inputSectionTitle ? (inputSectionTitle.value || '').trim() : '';
  }

  function syncSectionTitleFieldLock(headerEl) {
    var locked = isPromotionsSectionHeader(headerEl);
    if (sectionTitleWrapEl) {
      sectionTitleWrapEl.classList.toggle('hidden', locked);
    }
    if (inputSectionTitle) {
      inputSectionTitle.disabled = locked;
      inputSectionTitle.required = !locked;
      if (locked) {
        var lockedTitle = lockedSectionTitleFromHeader(headerEl);
        if (lockedTitle) inputSectionTitle.value = lockedTitle;
      }
    }
    if (window.DashboardEditFieldPrompts && typeof window.DashboardEditFieldPrompts.refresh === 'function') {
      window.DashboardEditFieldPrompts.refresh();
    }
  }

  function buildSectionPayloadFromState() {
    if (!selectedInfo || !selectedElement) return null;
    var contentPath = (selectedInfo.contentPath || '').trim();
    if (!contentPath || contentPath.indexOf('content/') !== 0 || contentPath.indexOf('...') !== -1 || contentPath.slice(-'_index.md'.length) !== '_index.md') return null;
    var title = sectionTitleForPayload(selectedElement);
    var weightRaw = inputSectionWeight
      ? (inputSectionWeight.value || '').trim()
      : (selectedElement ? selectedElement.getAttribute('data-weight') : '') || '0';
    var weightVal = parseInt(weightRaw, 10);
    if (isNaN(weightVal)) weightVal = 0;
    var icon = inputSectionIcon ? (inputSectionIcon.value || '').trim() : '';
    var topImg = inputSectionImageTop ? (inputSectionImageTop.value || '').trim() : '';
    var bottomImg = inputSectionImageBottom ? (inputSectionImageBottom.value || '').trim() : '';
    var frontMatter = {
      title: title || 'Section',
      weight: weightVal,
      icon: icon || '',
      images: { primary: bottomImg || '', secondary: topImg || '' }
    };
    return {
      kind: 'section',
      clientId: CMS_CLIENT_ID,
      contentPath: contentPath,
      siteConfigPath: CMS_CLIENT_ID + '/hugo.toml',
      frontMatter: frontMatter,
      body: ''
    };
  }

  function dashboardSectionBar(sectionEl) {
    if (!sectionEl) return null;
    var prev = sectionEl.previousElementSibling;
    if (prev && prev.classList && prev.classList.contains('dashboard-edit-add-section-bar')) return prev;
    return null;
  }

  function forEachSectionHeaderInDomOrder(doc, fn) {
    var headers = getOrderedSectionHeadersInDom(doc);
    headers.forEach(function(header, index) {
      fn(header, index, headers);
    });
    return headers;
  }

  function syncSectionWeightsFromDom(doc) {
    if (!doc) return;
    forEachSectionHeaderInDomOrder(doc, function(header, index) {
      header.setAttribute('data-weight', String(index));
      var section = isMenuReelsPreview(doc) ? header : header.closest('.main-menu-bg');
      if (section) section.classList.add('dashboard-edit-has-change');
      var bar = dashboardSectionBar(section);
      if (bar) bar.classList.add('dashboard-edit-has-change');
    });
    if (selectedElement && selectedElement.classList && selectedElement.classList.contains('menu-header') && inputSectionWeight) {
      inputSectionWeight.value = selectedElement.getAttribute('data-weight') || '0';
    }
    syncMenublockOrderFromSections(doc);
  }

  function menublockKeysMatch(a, b) {
    if (!a || !b) return false;
    var x = String(a).trim();
    var y = String(b).trim();
    if (!x || !y) return false;
    if (x === y) return true;
    if (x.toLowerCase() === y.toLowerCase()) return true;
    if (x.replace(/-/g, ' ').toLowerCase() === y.replace(/-/g, ' ').toLowerCase()) return true;
    return false;
  }

  function getSectionMenublockKeys(header) {
    var keys = [];
    if (!header) return keys;
    var anchor = header.querySelector('a.menu-anchor');
    if (anchor && anchor.id) keys.push(anchor.id.trim());
    var slug = (header.getAttribute('data-section-slug') || '').trim();
    if (slug) keys.push(slug);
    var titleEl = header.querySelector('.headerstyle h2 a, h2.center.title a, h2 a, h2');
    if (titleEl) {
      var title = (titleEl.textContent || '').trim();
      if (title) keys.push(title);
    }
    return keys;
  }

  function getMenublockItemKeys(li) {
    var keys = [];
    if (!li) return keys;
    var link = li.querySelector('a.menublock-link');
    if (!link) return keys;
    var href = (link.getAttribute('href') || '').trim();
    if (href.indexOf('#') === 0 && href.length > 1) {
      try {
        keys.push(decodeURIComponent(href.slice(1)).trim());
      } catch (e) {
        keys.push(href.slice(1).trim());
      }
    } else if (href && href !== '#') {
      var path = href.replace(/^https?:\/\/[^/]+/, '');
      var parts = path.split('/').filter(Boolean);
      if (parts.length) keys.push(parts[parts.length - 1]);
    }
    var label = link.querySelector('.menublock-link__label');
    if (label) {
      var labelText = (label.textContent || '').trim();
      if (labelText) keys.push(labelText);
    }
    return keys;
  }

  function findMenublockItemForHeader(header, items, used) {
    var secKeys = getSectionMenublockKeys(header);
    for (var i = 0; i < items.length; i++) {
      var li = items[i];
      if (used.has(li)) continue;
      var itemKeys = getMenublockItemKeys(li);
      for (var s = 0; s < secKeys.length; s++) {
        for (var k = 0; k < itemKeys.length; k++) {
          if (menublockKeysMatch(secKeys[s], itemKeys[k])) return li;
        }
      }
    }
    return null;
  }

  function syncMenublockOrderFromSections(doc) {
    if (!doc || !doc.getElementById) return;
    var menublock = doc.getElementById('menublock');
    if (!menublock) return;
    var searchItem = menublock.querySelector('.menublock-item--search');
    var insertBefore = searchItem || null;
    var items = [];
    menublock.querySelectorAll('li.menublock-item:not(.menublock-item--search):not(.menublock-item--tags)').forEach(function(li) {
      items.push(li);
    });
    if (!items.length) return;

    var headers = forEachSectionHeaderInDomOrder(doc, function() {});
    var used = new Set();
    var matchedOrdered = [];
    headers.forEach(function(header) {
      var li = findMenublockItemForHeader(header, items, used);
      if (li) {
        used.add(li);
        matchedOrdered.push(li);
      }
    });

    var unmatched = items.filter(function(li) { return !used.has(li); });
    var finalOrder = unmatched.concat(matchedOrdered);
    finalOrder.forEach(function(li) {
      if (insertBefore) menublock.insertBefore(li, insertBefore);
      else menublock.appendChild(li);
    });
  }

  function buildSectionPayloadFromHeader(header) {
    if (!header) return null;
    var slug = (header.getAttribute('data-section-slug') || '').trim();
    if (!slug) return null;
    var titleEl = header.querySelector('.headerstyle h2 a, h2.center.title a, h2 a, h1, h2');
    var title = titleEl ? (titleEl.textContent || '').trim() : slug;
    var weightVal = parseInt(header.getAttribute('data-weight') || '0', 10);
    if (isNaN(weightVal)) weightVal = 0;
    return {
      kind: 'section',
      clientId: CMS_CLIENT_ID,
      contentPath: 'content/' + slug + '/_index.md',
      siteConfigPath: CMS_CLIENT_ID + '/hugo.toml',
      frontMatter: (function () {
        var fm = {
          title: title || 'Section',
          weight: weightVal,
        };
        var icon = (header.getAttribute('data-icon') || '').trim();
        if (icon) fm.icon = icon;
        var secondary = (header.getAttribute('data-images-secondary') || '').trim();
        var primary = (header.getAttribute('data-images-primary') || '').trim();
        if (secondary || primary) {
          fm.images = {};
          if (secondary) fm.images.secondary = secondary;
          if (primary) fm.images.primary = primary;
        }
        return fm;
      })(),
      body: ''
    };
  }

  function persistSectionWeightsAfterReorder(doc) {
    if (!doc) return Promise.resolve();
    var previewPath = '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/previews';
    var headers = forEachSectionHeaderInDomOrder(doc, function() {});
    var chain = Promise.resolve();
    headers.forEach(function(header) {
      var payload = buildSectionPayloadFromHeader(header);
      if (!payload) return;
      chain = chain.then(function() {
        return postToCMS(previewPath, { payload: payload }).then(function() {
          if (payload.contentPath) draftContentPaths.add(payload.contentPath);
        }).catch(function(err) {
          console.warn('Section reorder draft save failed', payload.contentPath, err);
        });
      });
    });
    return chain.then(function() {
      applyEditHighlights();
    });
  }

  function finishSectionReorder(doc) {
    syncSectionWeightsFromDom(doc);
    markMenuReorderDirty();
    persistSectionWeightsAfterReorder(doc);
  }

  function flatPairsToMods(flat) {
    var mods = [];
    if (!Array.isArray(flat)) return mods;
    for (var j = 0; j < flat.length; j += 2) {
      mods.push({
        name: String(flat[j] || ''),
        price: flat[j + 1] != null ? (typeof flat[j + 1] === 'number' ? flat[j + 1] : parseFloat(flat[j + 1]) || 0) : 0
      });
    }
    return mods;
  }

  function menuItemWeightForIndex(index) {
    return index + MIN_MENU_ITEM_WEIGHT;
  }

  function ensureMoveContextVisible(doc, contextEl, isSection, wrap) {
    if (!doc || !contextEl) return;
    var win = doc.defaultView;
    if (!win) return;
    var scrollTarget = wrap || contextEl;
    function tryScroll() {
      if (!scrollTarget || !scrollTarget.isConnected) return;
      var track = getMenuReelsTrack(doc);
      if (isMenuReelsPreview(doc) && track) {
        var tr = track.getBoundingClientRect();
        var sr = scrollTarget.getBoundingClientRect();
        var pad = 16;
        var outOfView = sr.top < tr.top + pad || sr.bottom > tr.bottom - pad;
        if (!outOfView) return;
        try {
          track.scrollTo({
            top: track.scrollTop + (sr.top - tr.top) - pad,
            left: 0,
            behavior: 'smooth'
          });
        } catch (e) { /* ignore */ }
        return;
      }
      var rect = scrollTarget.getBoundingClientRect();
      var vh = win.innerHeight || doc.documentElement.clientHeight;
      var vw = win.innerWidth || doc.documentElement.clientWidth;
      var pad = 16;
      var outOfView = rect.top < pad || rect.bottom > vh - pad || rect.left < pad || rect.right > vw - pad;
      if (!outOfView) return;
      try {
        scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      } catch (e) {
        try { scrollTarget.scrollIntoView(false); } catch (e2) { /* ignore */ }
      }
    }
    window.requestAnimationFrame(function() {
      window.requestAnimationFrame(tryScroll);
    });
  }

  function clearMoveSelectionHighlight(doc) {
    if (!doc || !doc.querySelectorAll) return;
    doc.querySelectorAll('.dashboard-edit-move-selected').forEach(function(el) {
      el.classList.remove('dashboard-edit-move-selected');
    });
  }

  function keepMoveToolbarOpen(doc, wrap, contextEl, moveKind) {
    if (!wrap || !contextEl || !doc) return;
    closeAllMoveToolbarsInDoc(doc, wrap);
    wrap.classList.add('is-open');
    var toggle = wrap.querySelector('.dashboard-edit-move-toggle');
    var actions = wrap.querySelector('.dashboard-edit-move-actions');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    if (actions) actions.hidden = false;
    clearMoveSelectionHighlight(doc);
    var highlightTarget = moveKind === 'section'
      ? (contextEl.closest('.main-menu-bg') || contextEl.closest('.menu-header') || contextEl)
      : contextEl;
    if (highlightTarget) highlightTarget.classList.add('dashboard-edit-move-selected');
    updateMoveToolbarStates(actions, contextEl, moveKind);
  }

  function handleInlineMoveAction(doc, wrap, contextEl, moveKind, action) {
    if (!doc || !wrap || !contextEl || !action) return;
    var win = doc.defaultView;
    if (moveKind === 'item') {
      if (moveMenuItemCard(contextEl, action)) {
        finishMenuItemReorder(doc, contextEl.parentNode);
      }
    } else if (moveKind === 'section') {
      var section = contextEl.closest && (contextEl.closest('.main-menu-bg') || contextEl.closest('.menu-header'));
      if (section && moveSectionByAction(doc, section, action)) {
        finishSectionReorder(doc);
      }
    } else if (moveKind === 'promotion') {
      if (movePromotionGroup(doc, contextEl, action)) {
        finishPromotionReorder(doc, win);
      }
    }
    keepMoveToolbarOpen(doc, wrap, contextEl, moveKind);
    ensureMoveContextVisible(doc, contextEl, moveKind === 'section', wrap);
  }

  function closeAllMoveToolbarsInDoc(doc, exceptWrap) {
    if (!doc || !doc.querySelectorAll) return;
    doc.querySelectorAll('.dashboard-edit-move-wrap.is-open').forEach(function(w) {
      if (exceptWrap && w === exceptWrap) return;
      w.classList.remove('is-open');
      var t = w.querySelector('.dashboard-edit-move-toggle');
      var a = w.querySelector('.dashboard-edit-move-actions');
      if (t) t.setAttribute('aria-expanded', 'false');
      if (a) a.hidden = true;
    });
    if (!exceptWrap) {
      clearMoveSelectionHighlight(doc);
    }
  }
  function updateMoveToolbarStates(actionsRoot, contextEl, moveKind, btnSelector) {
    if (!actionsRoot || !contextEl) return;
    var doc = contextEl.ownerDocument;
    var selector = btnSelector || '.dashboard-edit-move-btn';
    var atTop = false;
    var atBottom = false;
    if (moveKind === 'section') {
      var section = contextEl.closest ? (contextEl.closest('.main-menu-bg') || contextEl.closest('.menu-header')) : null;
      if (!section) return;
      var sections = getOrderedSectionBlocks(doc);
      var secIdx = sections.indexOf(section);
      if (secIdx < 0) return;
      atTop = secIdx <= 0;
      atBottom = secIdx >= sections.length - 1;
    } else if (moveKind === 'promotion') {
      var promoFound = findPromotionGroupForSlide(doc, contextEl);
      if (!promoFound) return;
      atTop = promoFound.index <= 0;
      atBottom = promoFound.index >= promoFound.groups.length - 1;
    } else {
      var cards = [];
      if (isMenuReelsPreview(doc)) {
        getOrderedSectionHeadersInDom(doc).forEach(function(header) {
          if (getReelsSectionItemCards(doc, header).indexOf(contextEl) >= 0) {
            cards = getReelsSectionItemCards(doc, header);
          }
        });
      } else {
        var container = contextEl.closest('.menu-items-container');
        if (!container) return;
        cards = getOrderedMenuItemCards(container);
      }
      var cardIdx = cards.indexOf(contextEl);
      if (cardIdx < 0) return;
      atTop = cardIdx <= 0;
      atBottom = cardIdx >= cards.length - 1;
    }
    actionsRoot.querySelectorAll(selector).forEach(function(btn) {
      var move = btn.getAttribute('data-move');
      var disabled = false;
      if (move === 'top' || move === 'up') disabled = atTop;
      else if (move === 'bottom' || move === 'down') disabled = atBottom;
      btn.disabled = disabled;
      btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    });
  }

  function getOrderedMenuItemCards(container) {
    var cards = [];
    if (!container || !container.querySelectorAll) return cards;
    container.querySelectorAll('.menu-item-card').forEach(function(card) {
      cards.push(card);
    });
    return cards;
  }

  function getMenuReelsTrack(doc) {
    return doc ? doc.getElementById('menu-reels-track') : null;
  }

  function isMenuReelsPreview(doc) {
    var track = getMenuReelsTrack(doc);
    return !!(track && track.querySelector('.menu-reels-slide--hero'));
  }

  function getOrderedSectionHeadersInDom(doc) {
    if (!doc || !doc.querySelectorAll) return [];
    if (isMenuReelsPreview(doc)) {
      var track = getMenuReelsTrack(doc);
      if (!track) return [];
      return Array.from(track.querySelectorAll('.menu-header.menu-reels-slide[data-section-slug]')).sort(function(a, b) {
        var aw = parseInt(a.getAttribute('data-weight'), 10);
        var bw = parseInt(b.getAttribute('data-weight'), 10);
        if (isNaN(aw)) aw = 999;
        if (isNaN(bw)) bw = 999;
        if (aw !== bw) return aw - bw;
        var pos = a.compareDocumentPosition(b);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });
    }
    var headers = [];
    var packery = doc.getElementById('packery-container');
    if (packery) {
      packery.querySelectorAll('.main-menu-bg .menu-header[data-section-slug]').forEach(function(header) {
        headers.push(header);
      });
    } else {
      doc.querySelectorAll('.menu-header[data-section-slug]').forEach(function(header) {
        headers.push(header);
      });
    }
    return headers;
  }

  function getSectionHeaderForSlug(doc, sectionSlug) {
    if (!doc || !sectionSlug) return null;
    return doc.querySelector('.menu-header[data-section-slug="' + String(sectionSlug).replace(/"/g, '\\"') + '"]');
  }

  function getReelsSectionItemCards(doc, header) {
    var cards = [];
    if (!doc || !header || !isMenuReelsPreview(doc)) return cards;
    var track = getMenuReelsTrack(doc);
    if (!track || !track.contains(header)) return cards;
    var el = header.nextElementSibling;
    while (el) {
      if (el.classList && el.classList.contains('menu-header')) break;
      if (el.classList && el.classList.contains('menu-item-card')) cards.push(el);
      el = el.nextElementSibling;
    }
    return cards;
  }

  function getMenuItemCardsForSection(doc, header) {
    if (!header) return [];
    if (isMenuReelsPreview(doc)) return getReelsSectionItemCards(doc, header);
    var bg = header.closest('.main-menu-bg');
    var container = bg && bg.querySelector('.menu-items-container');
    return container ? getOrderedMenuItemCards(container) : [];
  }

  function collectReelsSectionNodes(doc, header) {
    var nodes = [];
    if (!doc || !header) return nodes;
    var bar = dashboardSectionBar(header);
    if (bar) nodes.push(bar);
    nodes.push(header);
    var el = header.nextElementSibling;
    while (el) {
      if (el.classList && el.classList.contains('menu-header')) break;
      nodes.push(el);
      el = el.nextElementSibling;
    }
    return nodes;
  }

  function moveReelsSectionByAction(doc, header, action) {
    var track = getMenuReelsTrack(doc);
    if (!track || !header) return false;
    var headers = getOrderedSectionHeadersInDom(doc);
    var idx = headers.indexOf(header);
    if (idx < 0) return false;

    function insertSliceBefore(refNode) {
      collectReelsSectionNodes(doc, header).forEach(function(node) {
        track.insertBefore(node, refNode);
      });
    }

    if (action === 'top') {
      if (idx === 0) return false;
      var firstBar = dashboardSectionBar(headers[0]);
      insertSliceBefore(firstBar || headers[0]);
      return true;
    }
    if (action === 'up') {
      if (idx <= 0) return false;
      var prevHeader = headers[idx - 1];
      insertSliceBefore(dashboardSectionBar(prevHeader) || prevHeader);
      return true;
    }
    if (action === 'down') {
      if (idx >= headers.length - 1) return false;
      var nextHeader = headers[idx + 1];
      var nextNodes = collectReelsSectionNodes(doc, nextHeader);
      var insertRef = nextNodes[nextNodes.length - 1].nextElementSibling;
      insertSliceBefore(insertRef);
      return true;
    }
    if (action === 'bottom') {
      if (idx >= headers.length - 1) return false;
      var lastHeader = headers[headers.length - 1];
      var lastNodes = collectReelsSectionNodes(doc, lastHeader);
      insertSliceBefore(lastNodes[lastNodes.length - 1].nextElementSibling);
      return true;
    }
    return false;
  }

  function moveReelsMenuItemCard(doc, card, action) {
    var track = getMenuReelsTrack(doc);
    if (!track || !card) return false;
    var header = null;
    getOrderedSectionHeadersInDom(doc).forEach(function(h) {
      if (getReelsSectionItemCards(doc, h).indexOf(card) >= 0) header = h;
    });
    if (!header) return false;
    var cards = getReelsSectionItemCards(doc, header);
    var idx = cards.indexOf(card);
    if (idx < 0) return false;
    if (action === 'top') {
      if (idx === 0) return false;
      var slug = header.getAttribute('data-section-slug') || '';
      var itemBar = track.querySelector('.dashboard-edit-add-item-bar[data-section-slug="' + slug.replace(/"/g, '\\"') + '"]');
      track.insertBefore(card, itemBar ? itemBar.nextElementSibling : header.nextElementSibling);
      return true;
    }
    if (action === 'up') {
      if (idx <= 0) return false;
      track.insertBefore(card, cards[idx - 1]);
      return true;
    }
    if (action === 'down') {
      if (idx >= cards.length - 1) return false;
      track.insertBefore(cards[idx + 1], card);
      return true;
    }
    if (action === 'bottom') {
      if (idx >= cards.length - 1) return false;
      track.insertBefore(card, cards[cards.length - 1].nextElementSibling);
      return true;
    }
    return false;
  }

  function syncMenuItemWeightsInReelsSection(doc, header, markChanged) {
    getReelsSectionItemCards(doc, header).forEach(function(card, index) {
      card.setAttribute('data-weight', String(menuItemWeightForIndex(index)));
      if (markChanged) card.classList.add('dashboard-edit-has-change');
    });
  }

  function insertMenuItemCardInSection(doc, header, card, itemBar) {
    if (!doc || !header || !card) return false;
    if (isMenuReelsPreview(doc)) {
      var track = getMenuReelsTrack(doc);
      if (!track) return false;
      card.classList.add('menu-reels-slide');
      var slug = header.getAttribute('data-section-slug') || '';
      if (slug) {
        card.setAttribute('data-section-slug', slug);
        card.setAttribute('data-reel-section', header.getAttribute('data-reel-section') || slug);
      }
      if (itemBar && itemBar.parentNode === track) {
        track.insertBefore(card, itemBar.nextElementSibling);
      } else {
        var items = getReelsSectionItemCards(doc, header);
        if (items.length) track.insertBefore(card, items[0]);
        else track.insertBefore(card, header.nextElementSibling);
      }
      return true;
    }
    var bg = header.closest('.main-menu-bg');
    var container = bg && bg.querySelector('.menu-items-container');
    if (!container) return false;
    if (itemBar && itemBar.parentNode === container) container.insertBefore(card, itemBar.nextElementSibling);
    else container.insertBefore(card, container.firstChild);
    return true;
  }

  function scheduleDashboardPreviewBootstrap(win, callback) {
    if (!win || typeof callback !== 'function') return;
    var ran = false;
    function runOnce() {
      if (ran) return;
      ran = true;
      callback();
    }
    if (!isMenuReelsPreview(win.document)) {
      runOnce();
      return;
    }
    if (typeof win.initMenuReels === 'function') {
      try { win.initMenuReels(); } catch (e) { /* ignore */ }
    }
    win.addEventListener('menuReelsFlattened', function() {
      setTimeout(runOnce, 40);
    }, { once: true });
    win.addEventListener('adsPopulated', function() {
      setTimeout(runOnce, 80);
    }, { once: true });
    setTimeout(runOnce, 450);
  }

  function syncMenuItemWeightsInContainer(container, markChanged) {
    if (!container) return;
    getOrderedMenuItemCards(container).forEach(function(card, index) {
      card.setAttribute('data-weight', String(menuItemWeightForIndex(index)));
      if (markChanged) card.classList.add('dashboard-edit-has-change');
    });
  }

  function syncMenuItemWeightsFromDom(doc, markChanged) {
    if (!doc || !doc.querySelectorAll) return;
    if (isMenuReelsPreview(doc)) {
      getOrderedSectionHeadersInDom(doc).forEach(function(header) {
        syncMenuItemWeightsInReelsSection(doc, header, !!markChanged);
      });
      return;
    }
    doc.querySelectorAll('.menu-items-container').forEach(function(container) {
      syncMenuItemWeightsInContainer(container, !!markChanged);
    });
  }

  function buildMenuItemPayloadFromCard(card) {
    if (!card) return null;
    var itemUrl = (card.getAttribute('data-item-url') || '').trim();
    if (!itemUrl) return null;
    var contentPath = 'content' + itemUrl.replace(/\/$/, '') + '.md';
    var titleEl = card.querySelector('.menu-item-title a, .menu-item-title');
    var title = titleEl ? (titleEl.textContent || '').trim() : 'Untitled';
    var descEl = card.querySelector('.menu-item-description');
    var desc = descEl ? (descEl.textContent || '').trim() : '';
    var weightVal = parseInt(card.getAttribute('data-weight') || String(MIN_MENU_ITEM_WEIGHT), 10);
    if (isNaN(weightVal) || weightVal < MIN_MENU_ITEM_WEIGHT) weightVal = MIN_MENU_ITEM_WEIGHT;
    var pa = parseJsonAttr(card, 'data-prices-array');
    var prices = [];
    if (Array.isArray(pa)) {
      for (var i = 0; i + 2 < pa.length; i += 3) {
        prices.push({
          variable1: (pa[i] != null ? String(pa[i]).trim() : '') || '-',
          variable2: (pa[i + 1] != null ? String(pa[i + 1]).trim() : '') || '-',
          price: typeof pa[i + 2] === 'number' ? pa[i + 2] : (parseFloat(pa[i + 2]) || 0)
        });
      }
    }
    var imagesArr = parseJsonAttr(card, 'data-images-array');
    if (!imagesArr.length) imagesArr = parseJsonAttr(card, 'data-regular-images-array');
    var sideCats = parseJsonAttr(card, 'data-side-categories');
    var mods = flatPairsToMods(parseJsonAttr(card, 'data-modifications'));
    var adds = flatPairsToMods(parseJsonAttr(card, 'data-additions'));
    var tags = parseJsonAttr(card, 'data-tags');
    var ingredients = parseJsonAttr(card, 'data-ingredients');
    var cookingmethods = parseJsonAttr(card, 'data-cookingmethods');
    var types = parseJsonAttr(card, 'data-types');
    var events = parseJsonAttr(card, 'data-events');
    var menuItemPromos = parseJsonAttr(card, 'data-promotions');
    var availObj = parseJsonObjectAttr(card, 'data-availability');
    var frontMatter = {
      title: title || 'Untitled',
      date: new Date().toISOString(),
      images: imagesArr.map(function(p) { return { image: p }; }),
      prices: prices,
      tags: tags,
      specials: [],
      events: events,
      promotions: menuItemPromos,
      ingredients: ingredients,
      cookingmethods: cookingmethods,
      types: types,
      weight: weightVal
    };
    if (sideCats && sideCats.length) frontMatter.side_categories = sideCats;
    if (mods.length) frontMatter.modifications = mods;
    if (adds.length) frontMatter.additions = adds;
    if (availObj) frontMatter.availability = availObj;
    return {
      kind: 'menu-item',
      clientId: CMS_CLIENT_ID,
      contentPath: contentPath,
      siteConfigPath: CMS_CLIENT_ID + '/hugo.toml',
      frontMatter: frontMatter,
      body: desc || ''
    };
  }

  function persistMenuItemWeightsInContainer(doc, container) {
    if (!doc || !container) return Promise.resolve();
    var previewPath = '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/previews';
    var cards = getOrderedMenuItemCards(container);
    var chain = Promise.resolve();
    cards.forEach(function(card) {
      var payload = buildMenuItemPayloadFromCard(card);
      if (!payload) return;
      chain = chain.then(function() {
        return postToCMS(previewPath, { payload: payload }).then(function() {
          if (payload.contentPath) draftContentPaths.add(payload.contentPath);
        }).catch(function(err) {
          console.warn('Menu item reorder draft save failed', payload.contentPath, err);
        });
      });
    });
    return chain.then(function() {
      applyEditHighlights();
    });
  }

  function markMenuReorderDirty() {
    editFormDirty = true;
    setEditStatus('Unsaved changes (not yet published)');
  }

  function finishMenuItemReorder(doc, container) {
    if (isMenuReelsPreview(doc)) {
      getOrderedSectionHeadersInDom(doc).forEach(function(header) {
        syncMenuItemWeightsInReelsSection(doc, header, true);
      });
      markMenuReorderDirty();
      var chain = Promise.resolve();
      getOrderedSectionHeadersInDom(doc).forEach(function(header) {
        getReelsSectionItemCards(doc, header).forEach(function(card) {
          var payload = buildMenuItemPayloadFromCard(card);
          if (!payload) return;
          var previewPath = '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/previews';
          chain = chain.then(function() {
            return postToCMS(previewPath, { payload: payload }).then(function() {
              if (payload.contentPath) draftContentPaths.add(payload.contentPath);
            }).catch(function(err) {
              console.warn('Menu item reorder draft save failed', payload.contentPath, err);
            });
          });
        });
      });
      chain.then(function() { applyEditHighlights(); });
      return;
    }
    syncMenuItemWeightsInContainer(container, true);
    markMenuReorderDirty();
    persistMenuItemWeightsInContainer(doc, container);
  }

  function moveMenuItemCard(card, action) {
    var doc = card && card.ownerDocument;
    if (isMenuReelsPreview(doc) && card && card.classList && card.classList.contains('menu-item-card')) {
      return moveReelsMenuItemCard(doc, card, action);
    }
    var container = card && card.parentNode;
    if (!container || !container.classList || !container.classList.contains('menu-items-container')) return false;
    var cards = getOrderedMenuItemCards(container);
    var idx = cards.indexOf(card);
    if (idx < 0) return false;
    if (action === 'top') {
      if (idx === 0) return false;
      container.insertBefore(card, cards[0]);
      return true;
    }
    if (action === 'up') {
      if (idx <= 0) return false;
      container.insertBefore(card, cards[idx - 1]);
      return true;
    }
    if (action === 'down') {
      if (idx >= cards.length - 1) return false;
      container.insertBefore(cards[idx + 1], card);
      return true;
    }
    if (action === 'bottom') {
      if (idx >= cards.length - 1) return false;
      var last = cards[cards.length - 1];
      container.insertBefore(card, last.nextElementSibling);
      return true;
    }
    return false;
  }

  function getOrderedSectionBlocks(doc) {
    if (isMenuReelsPreview(doc)) {
      return getOrderedSectionHeadersInDom(doc);
    }
    var sections = [];
    if (!doc || !doc.querySelectorAll) return sections;
    var packery = doc.getElementById('packery-container');
    var root = packery || doc.body;
    root.querySelectorAll('.main-menu-bg').forEach(function(sec) {
      if (sec.querySelector('.menu-header[data-section-slug]')) sections.push(sec);
    });
    return sections;
  }

  function moveSectionByAction(doc, section, action) {
    if (!doc || !section) return false;
    if (isMenuReelsPreview(doc) && section.classList && section.classList.contains('menu-header')) {
      return moveReelsSectionByAction(doc, section, action);
    }
    var parent = section.parentNode;
    if (!parent) return false;
    var sections = getOrderedSectionBlocks(doc);
    var idx = sections.indexOf(section);
    if (idx < 0) return false;
    var bar = dashboardSectionBar(section);
    if (action === 'top') {
      if (idx === 0) return false;
      return dashboardMoveSectionBlock(parent, { bar: bar, section: section }, sections[0]);
    }
    if (action === 'up') {
      if (idx <= 0) return false;
      return dashboardMoveSectionBlock(parent, { bar: bar, section: section }, sections[idx - 1]);
    }
    if (action === 'down') {
      if (idx >= sections.length - 1) return false;
      var next = sections[idx + 1];
      var insertRef = next.nextElementSibling;
      if (bar) parent.insertBefore(bar, insertRef);
      parent.insertBefore(section, insertRef);
      return true;
    }
    if (action === 'bottom') {
      if (idx >= sections.length - 1) return false;
      var last = sections[sections.length - 1];
      var insertAfter = last.nextElementSibling;
      if (bar) parent.insertBefore(bar, insertAfter);
      parent.insertBefore(section, insertAfter);
      return true;
    }
    return false;
  }

  function getPromotionAdsContainer(doc) {
    if (!doc) return null;
    return doc.getElementById('homepage-ads-container') || doc.getElementById('client-ads-container') || doc.getElementById('frontpage-ads-container');
  }

  function getPromotionScrollEndMarker(container) {
    if (!container) return null;
    return container.querySelector('section.menu-ad-scroll-end, .menu-ad-scroll-end');
  }

  function getOrderedPromotionGroups(doc) {
    var container = getPromotionAdsContainer(doc);
    if (!container) return [];
    var groups = [];
    var current = null;
    container.querySelectorAll('article.ads-reels-slide').forEach(function(slide) {
      if (slide.classList.contains('menu-ad-scroll-end')) return;
      if (!isPromotionReelsSlide(slide)) return;
      var idx = slide.getAttribute('data-catalog-index');
      if (idx == null || idx === '') idx = String(groups.length);
      if (!current || current.catalogIndex !== idx) {
        current = { catalogIndex: idx, slides: [] };
        groups.push(current);
      }
      current.slides.push(slide);
    });
    return groups;
  }

  function findPromotionGroupForSlide(doc, slide) {
    var groups = getOrderedPromotionGroups(doc);
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].slides.indexOf(slide) >= 0) {
        return { group: groups[i], index: i, groups: groups };
      }
    }
    return null;
  }

  function insertPromotionGroupBefore(container, group, beforeSlide) {
    if (!container || !group || !group.slides.length || !beforeSlide) return;
    group.slides.forEach(function(slide) {
      container.insertBefore(slide, beforeSlide);
    });
  }

  function movePromotionGroup(doc, slide, action) {
    var container = getPromotionAdsContainer(doc);
    if (!container || !slide) return false;
    var found = findPromotionGroupForSlide(doc, slide);
    if (!found) return false;
    var groups = found.groups;
    var idx = found.index;
    var group = found.group;
    var scrollEnd = getPromotionScrollEndMarker(container);
    if (action === 'top') {
      if (idx === 0) return false;
      insertPromotionGroupBefore(container, group, groups[0].slides[0]);
      return true;
    }
    if (action === 'up') {
      if (idx <= 0) return false;
      insertPromotionGroupBefore(container, group, groups[idx - 1].slides[0]);
      return true;
    }
    if (action === 'down') {
      if (idx >= groups.length - 1) return false;
      var nextGroup = groups[idx + 1];
      var insertRef = nextGroup.slides[nextGroup.slides.length - 1].nextElementSibling;
      group.slides.forEach(function(s) {
        container.insertBefore(s, insertRef);
      });
      return true;
    }
    if (action === 'bottom') {
      if (idx >= groups.length - 1) return false;
      group.slides.forEach(function(s) {
        if (scrollEnd) container.insertBefore(s, scrollEnd);
        else container.appendChild(s);
      });
      return true;
    }
    return false;
  }

  function gatherPromotionImagesFromSlide(slide) {
    if (!slide) return [];
    var raw = slide.getAttribute('data-ad-images');
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { /* ignore */ }
    }
    var imgs = [];
    slide.querySelectorAll('img.ad-portrait').forEach(function(img) {
      var src = (img.getAttribute('data-src-path') || img.getAttribute('src') || '').trim();
      src = src.replace(/^https?:\/\/[^/]+/i, '').replace(/^\//, '');
      if (src && imgs.indexOf(src) === -1) imgs.push(src);
    });
    return imgs;
  }

  function buildPromotionPayloadFromSlide(slide, weight) {
    if (!slide) return null;
    var slug = promotionSlugFromElement(slide);
    if (!slug) return null;
    var title = slide.getAttribute('data-ad-title') || '';
    var link = slide.getAttribute('data-ad-url') || slide.getAttribute('data-ad-link') || '';
    var desc = slide.getAttribute('data-ad-description') || '';
    var imagesArr = gatherPromotionImagesFromSlide(slide);
    var recurring = (slide.getAttribute('data-ad-recurring') || '') === 'true';
    var daysArr = parseJsonAttr(slide, 'data-ad-daysofweek');
    var weightNum = typeof weight === 'number' ? weight : parseInt(slide.getAttribute('data-ad-weight') || '0', 10);
    if (isNaN(weightNum)) weightNum = 0;
    return {
      kind: 'promotion',
      clientId: CMS_CLIENT_ID,
      contentPath: 'content/promotions/' + slug + '.md',
      siteConfigPath: CMS_CLIENT_ID + '/hugo.toml',
      frontMatter: {
        title: title || 'Promotion',
        link: link || '/promotions/' + slug + '/',
        images: imagesArr.map(function(p) { return { image: p }; }),
        recurring: recurring,
        daysofweek: daysArr,
        weight: weightNum
      },
      body: desc || ''
    };
  }

  function syncReelsCatalogFromDomOrder(doc, win) {
    if (!win || !win.AdsClient || !win.AdsClient._reelsCatalog) return;
    var catalog = win.AdsClient._reelsCatalog;
    var groups = getOrderedPromotionGroups(doc);
    if (!groups.length) return;
    var reordered = groups.map(function(g) {
      var oldIdx = parseInt(g.catalogIndex, 10) || 0;
      return catalog[oldIdx];
    }).filter(Boolean);
    if (reordered.length && reordered.length === groups.length) {
      win.AdsClient._reelsCatalog = reordered;
    }
  }

  function syncPromotionOrderFromDom(doc, win, markChanged) {
    syncReelsCatalogFromDomOrder(doc, win);
    var groups = getOrderedPromotionGroups(doc);
    groups.forEach(function(g, i) {
      g.slides.forEach(function(slide) {
        slide.setAttribute('data-catalog-index', String(i));
        slide.setAttribute('data-ad-weight', String(i));
        if (markChanged) slide.classList.add('dashboard-edit-has-change');
      });
    });
  }

  function persistPromotionOrderAfterReorder(doc) {
    if (!doc) return Promise.resolve();
    var previewPath = '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/previews';
    var groups = getOrderedPromotionGroups(doc);
    var chain = Promise.resolve();
    groups.forEach(function(g, i) {
      var slide = g.slides[0];
      var payload = buildPromotionPayloadFromSlide(slide, i);
      if (!payload) return;
      chain = chain.then(function() {
        return postToCMS(previewPath, { payload: payload }).then(function() {
          if (payload.contentPath) draftContentPaths.add(payload.contentPath);
        }).catch(function(err) {
          console.warn('Promotion reorder draft save failed', payload.contentPath, err);
        });
      });
    });
    return chain.then(function() {
      applyEditHighlights();
    });
  }

  function finishPromotionReorder(doc, win) {
    syncPromotionOrderFromDom(doc, win, true);
    markMenuReorderDirty();
    persistPromotionOrderAfterReorder(doc);
  }

  function createDashboardMoveToolbar(doc, opts) {
    opts = opts || {};
    var wrap = doc.createElement('div');
    wrap.className = 'dashboard-edit-move-wrap' +
      (opts.section ? ' dashboard-edit-move-wrap-section' : '') +
      (opts.promotion ? ' dashboard-edit-move-wrap-promotion' : '');
    var toggleLabel = opts.section ? 'Reorder section' : opts.promotion ? 'Reorder promotion' : 'Reorder item';
    var actionsLabel = opts.section ? 'Section move actions' : opts.promotion ? 'Promotion move actions' : 'Item move actions';
    var toggle = doc.createElement('button');
    toggle.type = 'button';
    toggle.className = 'dashboard-edit-move-toggle';
    toggle.setAttribute('aria-label', toggleLabel);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<i class="fa fa-bars" aria-hidden="true"></i>';
    var actions = doc.createElement('div');
    actions.className = 'dashboard-edit-move-actions';
    actions.setAttribute('role', 'group');
    actions.setAttribute('aria-label', actionsLabel);
    actions.hidden = true;
    [
      { move: 'top', label: 'Move to top', icon: 'fa-angle-double-up' },
      { move: 'up', label: 'Move up one', icon: 'fa-angle-up' },
      { move: 'down', label: 'Move down one', icon: 'fa-angle-down' },
      { move: 'bottom', label: 'Move to bottom', icon: 'fa-angle-double-down' }
    ].forEach(function(spec) {
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'dashboard-edit-move-btn';
      btn.setAttribute('data-move', spec.move);
      btn.setAttribute('aria-label', spec.label);
      btn.setAttribute('title', spec.label);
      btn.innerHTML = '<i class="fa ' + spec.icon + '" aria-hidden="true"></i>';
      actions.appendChild(btn);
    });
    wrap.appendChild(toggle);
    wrap.appendChild(actions);
    return wrap;
  }

  function dashboardInjectMoveToolbarIntoWrap(wrap, doc, opts) {
    if (!wrap || wrap.querySelector('.dashboard-edit-move-wrap')) return;
    var oldGrip = wrap.querySelector('.dashboard-edit-drag-handle');
    var toolbar = createDashboardMoveToolbar(doc, opts);
    if (oldGrip) wrap.replaceChild(toolbar, oldGrip);
    else wrap.insertBefore(toolbar, wrap.firstChild);
  }

  function dashboardResolveDropSection(target) {
    if (!target || !target.closest) return null;
    var doc = target.ownerDocument;
    var section = target.closest('.main-menu-bg');
    if (section) return section;
    var reelHeader = target.closest('.menu-header.menu-reels-slide');
    if (reelHeader && isMenuReelsPreview(doc)) return reelHeader;
    var bar = target.closest('.dashboard-edit-add-section-bar');
    if (bar) {
      var next = bar.nextElementSibling;
      if (next && next.classList) {
        if (next.classList.contains('main-menu-bg')) return next;
        if (next.classList.contains('menu-header')) return next;
      }
    }
    return null;
  }

  function dashboardMoveSectionBlock(parent, block, beforeSection) {
    if (!parent || !block || !block.section || !beforeSection) return false;
    if (block.section === beforeSection) return false;
    var insertBefore = dashboardSectionBar(beforeSection) || beforeSection;
    if (block.bar) parent.insertBefore(block.bar, insertBefore);
    parent.insertBefore(block.section, insertBefore);
    return true;
  }

  function buildSlideshowPayloadFromState() {
    if (!selectedInfo || !inputSlideshowImages) return null;
    var paths = hoursParseStringList((inputSlideshowImages.value || '').trim());
    return {
      kind: 'slideshow',
      clientId: CMS_CLIENT_ID,
      contentPath: 'content/_index.md',
      siteConfigPath: CMS_CLIENT_ID + '/hugo.toml',
      frontMatter: { slideshow: paths.map(function (p) { return { image: p }; }) },
      body: ''
    };
  }

  function buildHomeHeroPayloadFromState() {
    if (!selectedInfo || !inputHomeHeroImage) return null;
    var fm = {};
    if (homeHeroIndexCache && homeHeroIndexCache.frontMatter && typeof homeHeroIndexCache.frontMatter === 'object') {
      for (var k in homeHeroIndexCache.frontMatter) {
        if (Object.prototype.hasOwnProperty.call(homeHeroIndexCache.frontMatter, k)) {
          fm[k] = homeHeroIndexCache.frontMatter[k];
        }
      }
    }
    fm.image = (inputHomeHeroImage.value || '').trim();
    var body = homeHeroIndexCache && homeHeroIndexCache.body != null ? homeHeroIndexCache.body : '';
    return {
      kind: 'home',
      clientId: CMS_CLIENT_ID,
      contentPath: 'content/_index.md',
      siteConfigPath: CMS_CLIENT_ID + '/hugo.toml',
      frontMatter: fm,
      body: body
    };
  }

  function buildContentEditPayload() {
    if (!selectedInfo) return null;
    var type = selectedInfo.contentType || 'menu-item';
    if (type === 'promotion') return buildPromotionPayloadFromState();
    if (type === 'menu-item') return buildMenuItemPayloadFromState();
    if (type === 'section-header') return buildSectionPayloadFromState();
    if (type === 'home-hero') return buildHomeHeroPayloadFromState();
    // Slideshow would overwrite content/_index.md; not supported until backend merge.
    if (type === 'slideshow') return null;
    if (type === 'location') return null;
    return null;
  }

  /** Pretty-print CMS JSON in the browser console (filter DevTools by `[TTMS CMS]`). */
  function cmsLogJson(phase, pathOrUrl, detail) {
    if (typeof console === 'undefined' || !console.log) return;
    var tag = '[TTMS CMS]';
    if (detail === undefined) {
      console.log(tag, phase, pathOrUrl);
      return;
    }
    var s;
    try {
      s = typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2);
    } catch (e) {
      console.log(tag, phase, pathOrUrl, detail);
      return;
    }
    var max = 14000;
    if (s.length > max) {
      s = s.slice(0, max) + '\n… [truncated; expand in Network tab if needed]';
    }
    console.log(tag, phase, pathOrUrl, '\n', s);
  }

  function getFromCMS(path) {
    var url = CMS_SERVICE_URL.replace(/\/+$/, '') + path;
    cmsLogJson('GET →', path, { url: url });
    var headers = { 'Accept': 'application/json' };
    var token = (typeof AuthClient !== 'undefined' && AuthClient.getAccessToken) ? AuthClient.getAccessToken() : (typeof localStorage !== 'undefined' ? localStorage.getItem('ttmenus_access_token') : null);
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(url, { method: 'GET', credentials: 'include', headers: headers }).then(function(res) {
      if (!res.ok) {
        return res.text().then(function(t) {
          cmsLogJson('GET ✗', path, { status: res.status, body: t && t.length > 2000 ? t.slice(0, 2000) + '…' : t });
          throw new Error('CMS error ' + res.status + ': ' + t);
        });
      }
      return res.json();
    }).then(function(data) {
      cmsLogJson('GET ←', path, data);
      return data;
    });
  }

  function postToCMS(path, payload) {
    var url = CMS_SERVICE_URL.replace(/\/+$/, '') + path;
    cmsLogJson('POST →', path, payload);
    var headers = { 'Content-Type': 'application/json' };
    var token = (typeof AuthClient !== 'undefined' && AuthClient.getAccessToken) ? AuthClient.getAccessToken() : (typeof localStorage !== 'undefined' ? localStorage.getItem('ttmenus_access_token') : null);
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: headers,
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (txt) {
          cmsLogJson('POST ✗', path, { status: res.status, body: txt && txt.length > 4000 ? txt.slice(0, 4000) + '…' : txt });
          throw new Error('CMS error ' + res.status + ': ' + txt);
        });
      }
      return res.json().catch(function () { return {}; });
    }).then(function (json) {
      cmsLogJson('POST ←', path, json);
      return json;
    });
  }

  function deleteFromCMS(path) {
    var url = CMS_SERVICE_URL.replace(/\/+$/, '') + path;
    cmsLogJson('DELETE →', path, { url: url });
    var headers = { 'Accept': 'application/json' };
    var token = (typeof AuthClient !== 'undefined' && AuthClient.getAccessToken) ? AuthClient.getAccessToken() : (typeof localStorage !== 'undefined' ? localStorage.getItem('ttmenus_access_token') : null);
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(url, { method: 'DELETE', credentials: 'include', headers: headers }).then(function(res) {
      if (!res.ok && res.status !== 204) {
        return res.text().then(function(t) {
          cmsLogJson('DELETE ✗', path, { status: res.status, body: t });
          throw new Error('CMS error ' + res.status + ': ' + t);
        });
      }
      cmsLogJson('DELETE ←', path, { status: res.status });
      return res.json().catch(function() { return {}; });
    });
  }

  /** Slug for content/<section>/<slug>.md (same style as bacon-jalapeno-cheese-fries.md). */
  function slugifyMenuItemTitle(str) {
    if (!str || typeof str !== 'string') return 'new-item';
    var s = str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return s || 'new-item';
  }

  /**
   * Avoid duplicate item slugs in the same section (iframe DOM).
   * @param {Element|null} excludeCardEl when renaming, omit this card from occupancy (so its current slug is free to change).
   */
  function uniqueMenuItemSlugInSection(doc, sectionSlug, baseSlug, excludeCardEl) {
    var used = {};
    if (doc && doc.querySelectorAll && sectionSlug) {
      doc.querySelectorAll('.menu-item-card[data-item-url]').forEach(function(card) {
        if (excludeCardEl && card === excludeCardEl) return;
        var u = (card.getAttribute('data-item-url') || '').replace(/\/?$/, '');
        var m = u.match(/^\/([^/]+)\/([^/]+)$/);
        if (!m || m[1] !== sectionSlug) return;
        used[m[2]] = true;
      });
    }
    var candidate = baseSlug;
    var n = 2;
    while (used[candidate]) {
      candidate = baseSlug + '-' + n;
      n++;
    }
    return candidate;
  }

  var titlePathSyncTimer = null;

  /** For unpublished “Add item” cards: keep content/<section>/<slug>.md in sync with the title field. */
  function syncNewMenuItemPathFromTitle() {
    if (!selectedElement || !selectedInfo || selectedInfo.contentType !== 'menu-item') return;
    if (!selectedElement.hasAttribute('data-dashboard-edit-new-item')) return;
    if (!inputTitle || !iframe || !iframe.contentDocument) return;
    var doc = iframe.contentDocument;
    var titleVal = (inputTitle.value || '').trim();
    var baseSlug = slugifyMenuItemTitle(titleVal);
    var sectionSlug = (selectedElement.getAttribute('data-section-slug') || '').trim();
    var bg = selectedElement.closest('.main-menu-bg');
    var header = bg && bg.querySelector('.menu-header[data-section-slug]');
    if (!sectionSlug && header) sectionSlug = (header.getAttribute('data-section-slug') || '').trim();
    if (!sectionSlug) {
      var um = (selectedElement.getAttribute('data-item-url') || '').match(/^\/([^/]+)\//);
      if (um) sectionSlug = um[1];
    }
    if (!sectionSlug) return;
    var newSlug = uniqueMenuItemSlugInSection(doc, sectionSlug, baseSlug, selectedElement);
    var oldSlug = selectedElement.getAttribute('data-dashboard-new-item-id') || '';
    var oldPath = (selectedInfo.contentPath || '').trim();
    var newPath = 'content/' + sectionSlug + '/' + newSlug + '.md';
    var newItemUrl = '/' + sectionSlug + '/' + newSlug + '/';
    if (oldPath === newPath && oldSlug === newSlug) return;

    if (oldPath && draftContentPaths.has(oldPath)) {
      draftContentPaths.delete(oldPath);
      draftContentPaths.add(newPath);
    }
    if (oldPath && markedForDeletionContentPaths.has(oldPath)) {
      markedForDeletionContentPaths.delete(oldPath);
      markedForDeletionContentPaths.add(newPath);
    }

    if (savedDraftPreviewId && oldPath && oldPath !== newPath) {
      var pid = savedDraftPreviewId;
      savedDraftPreviewId = null;
      deleteFromCMS('/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/previews/' + encodeURIComponent(pid)).catch(function() {});
    }

    selectedInfo.contentPath = newPath;
    if (contentSourceEl) contentSourceEl.textContent = 'Source: ' + newPath;

    selectedElement.setAttribute('data-item-url', newItemUrl);
    selectedElement.setAttribute('data-dashboard-new-item-id', newSlug);
    selectedElement.setAttribute('onclick', 'toggleItemExpansion(this, ' + JSON.stringify(newItemUrl) + ', event);');

    applyEditHighlights();
    updateMarkForDeletionButton();
    editFormDirty = true;
    setEditStatus('Unsaved changes (not yet published)');

    if (selectedElement.getAttribute('data-item-expanded') === 'true') {
      var winI = iframe.contentWindow;
      if (winI && typeof winI.expandMenuItemCard === 'function') {
        try { winI.expandMenuItemCard(selectedElement, newItemUrl); } catch (ex) {}
      }
    }
  }

  function scheduleSyncNewMenuItemPathFromTitle() {
    if (titlePathSyncTimer) clearTimeout(titlePathSyncTimer);
    titlePathSyncTimer = setTimeout(function() {
      titlePathSyncTimer = null;
      syncNewMenuItemPathFromTitle();
    }, 320);
  }

  /** Menu snapshot rows for unpublished “Add item” cards (/<section>/<slug>/ URLs; legacy /<section>/n…/). */
  function isDashboardNewMenuItemRecord(mi) {
    if (!mi || !mi.url) return false;
    if (mi.id && String(mi.id).indexOf('dashboard-new-') === 0) return true;
    var u = String(mi.url).replace(/\/?$/, '/');
    return /^\/[^/]+\/n\d+[^/]*\/$/.test(u);
  }

  /** Collect unpublished “Add item” cards so they can be stored in menu snapshot JSON (CMS menu_data). */
  function collectDashboardNewMenuItemsFromIframe(doc) {
    if (!doc || !doc.querySelectorAll) return [];
    var out = [];
    doc.querySelectorAll('.menu-item-card[data-dashboard-edit-new-item]').forEach(function(card) {
      var url = card.getAttribute('data-item-url') || '';
      if (!url) return;
      var slug = (card.getAttribute('data-section-slug') || '').trim();
      var bg = card.closest('.main-menu-bg');
      var header = bg && bg.querySelector('.menu-header[data-section-slug]');
      if (!slug && header) slug = (header.getAttribute('data-section-slug') || '').trim();
      if (!slug) {
        var urlMatch = (card.getAttribute('data-item-url') || '').match(/^\/([^/]+)\//);
        if (urlMatch) slug = urlMatch[1];
      }
      var categoryUrl = slug ? '/' + slug + '/' : '';
      var titleEl = card.querySelector('.menu-item-title a, .menu-item-title');
      var title = titleEl ? (titleEl.textContent || '').trim() : 'New item';
      var descEl = card.querySelector('.menu-item-description');
      var summary = descEl ? (descEl.textContent || '').trim() : '';
      var nid = card.getAttribute('data-dashboard-new-item-id') || '';
      var catTitle = '';
      if (header) {
        var h2a = header.querySelector('.headerstyle h2 a, h2.center.title a, h2 a');
        catTitle = h2a ? (h2a.textContent || '').trim() : '';
      }
      var normUrl = url.replace(/\/?$/, '/');
      out.push({
        id: 'dashboard-new-' + (nid || normUrl.replace(/[^a-zA-Z0-9_-]/g, '-')),
        title: title,
        url: normUrl,
        category: catTitle,
        categoryUrl: categoryUrl,
        weight: 0,
        summary: summary
      });
    });
    return out;
  }

  /** Drop prior snapshot entries for dashboard placeholders, then append current iframe state. */
  function mergeDashboardNewItemsIntoMenuData(menuData, collected) {
    if (!menuData || typeof menuData !== 'object') return menuData;
    if (!Array.isArray(menuData.menuItems)) menuData.menuItems = [];
    menuData.menuItems = menuData.menuItems.filter(function(mi) {
      return !mi || !mi.url || !isDashboardNewMenuItemRecord(mi);
    });
    if (collected && collected.length) {
      collected.forEach(function(item) {
        menuData.menuItems.push(item);
      });
    }
    return menuData;
  }

  /** True when CMS GET /menu returned no structure (common when data/menu.json is missing on the server). */
  function isMenuDataEmpty(menuData) {
    if (!menuData || typeof menuData !== 'object') return true;
    var c = menuData.categories;
    var m = menuData.menuItems;
    var hasCat = Array.isArray(c) && c.length > 0;
    var hasItems = Array.isArray(m) && m.length > 0;
    return !hasCat && !hasItems;
  }

  /**
   * Build categories + menuItems from the live Hugo preview DOM so editor-exit snapshots are not empty
   * when the CMS has no menu.json yet (GET /menu returns empty arrays).
   */
  function collectMenuStructureFromIframe(doc) {
    var categories = [];
    var menuItems = [];
    if (!doc || !doc.querySelectorAll) return { categories: categories, menuItems: menuItems };
    var seenSlugs = {};
    forEachSectionHeaderInDomOrder(doc, function(header, index) {
      var slug = (header.getAttribute('data-section-slug') || '').trim();
      if (!slug || seenSlugs[slug]) return;
      seenSlugs[slug] = true;
      var h2a = header.querySelector('.headerstyle h2 a, h2.center.title a, h2 a');
      var catTitle = h2a ? (h2a.textContent || '').trim() : slug;
      var catUrl = h2a ? (h2a.getAttribute('href') || '').trim() : '';
      if (!catUrl && slug) catUrl = '/' + slug + '/';
      var w = parseInt(header.getAttribute('data-weight') || String(index), 10);
      if (isNaN(w)) w = index;
      var sumEl = header.querySelector('.menu-summary');
      var catSummary = sumEl ? (sumEl.textContent || '').trim() : '';
      var topImg = (header.getAttribute('data-images-primary') || '').trim();
      categories.push({
        title: catTitle,
        url: catUrl,
        weight: w,
        image: topImg || '',
        summary: catSummary
      });
      getMenuItemCardsForSection(doc, header).forEach(function(card, idx) {
        var url = (card.getAttribute('data-item-url') || '').trim();
        if (!url) return;
        var titleEl = card.querySelector('.menu-item-title a, .menu-item-title');
        var title = titleEl ? (titleEl.textContent || '').trim() : '';
        var descEl = card.querySelector('.menu-item-description');
        var summary = descEl ? (descEl.textContent || '').trim() : '';
        var w = parseInt(card.getAttribute('data-weight') || String(menuItemWeightForIndex(idx)), 10);
        if (isNaN(w) || w < MIN_MENU_ITEM_WEIGHT) w = menuItemWeightForIndex(idx);
        var id = String(url).replace(/[^a-zA-Z0-9_-]/g, '-');
        var item = {
          id: id,
          title: title,
          url: url,
          category: catTitle,
          categoryUrl: catUrl,
          weight: w,
          summary: summary
        };
        var pa = card.getAttribute('data-prices-array');
        if (pa) {
          try {
            var arr = JSON.parse(pa);
            if (Array.isArray(arr) && arr.length >= 3) {
              var prices = [];
              for (var i = 0; i + 2 < arr.length; i += 3) {
                prices.push({
                  size: String(arr[i] != null ? arr[i] : ''),
                  flavour: String(arr[i + 1] != null ? arr[i + 1] : ''),
                  price: Number(arr[i + 2]) || 0
                });
              }
              if (prices.length) item.prices = prices;
            }
          } catch (e) {}
        }
        menuItems.push(item);
      });
    });
    return { categories: categories, menuItems: menuItems };
  }

  /** After loading a menu version, re-insert placeholder cards that only exist in menu_data + content drafts. */
  function hydrateDashboardNewItemsFromMenuSnapshot() {
    var snap = window.__ttmsEditorSnapshot;
    if (!snap || !snap.menuData || !Array.isArray(snap.menuData.menuItems)) return;
    var doc = iframe.contentDocument;
    var win = iframe.contentWindow;
    if (!doc || !doc.body || !win || typeof win._dashboardCreateNewMenuItemCard !== 'function') return;
    var newItems = snap.menuData.menuItems.filter(function(mi) {
      return mi && mi.url && isDashboardNewMenuItemRecord(mi);
    });
    newItems.forEach(function(mi) {
      var rawUrl = String(mi.url || '').trim();
      if (!rawUrl) return;
      var normalized = rawUrl.replace(/\/?$/, '');
      if (normalized.indexOf('/') !== 0) normalized = '/' + normalized.replace(/^\/+/, '');
      var url = normalized + '/';
      var esc = url.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      if (doc.querySelector('.menu-item-card[data-item-url="' + esc + '"]')) return;
      var mSec = url.match(/^\/([^/]+)\/([^/]+)\/?$/);
      if (!mSec) return;
      var cardOpts = {
        title: (mi.title != null ? String(mi.title) : '') || 'New item',
        summary: (mi.summary != null ? String(mi.summary) : '') || '',
        sectionSlug: mSec[1],
        nid: mSec[2]
      };
      var slug = (mi.categoryUrl || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)[0] || '';
      var header = slug ? getSectionHeaderForSlug(doc, slug) : null;
      if (!header) return;
      var track = isMenuReelsPreview(doc) ? getMenuReelsTrack(doc) : null;
      var bar = track
        ? track.querySelector('.dashboard-edit-add-item-bar[data-section-slug="' + slug.replace(/"/g, '\\"') + '"]')
        : null;
      if (!bar && !isMenuReelsPreview(doc)) {
        var container = findMenuItemsContainerForSectionSlug(doc, slug);
        if (container && container.querySelector) bar = container.querySelector('.dashboard-edit-add-item-bar');
      }
      var card = win._dashboardCreateNewMenuItemCard(doc, cardOpts);
      insertMenuItemCardInSection(doc, header, card, bar);
    });
    if (Array.isArray(snap.contentEdits)) {
      snap.contentEdits.forEach(function(ce) {
        var pay = ce && ce.payload;
        if (!pay || pay.kind !== 'menu-item') return;
        var cp = pay.contentPath || '';
        if (!cp || cp.indexOf('content/') !== 0) return;
        var itemUrl = '/' + String(cp).replace(/^content\//, '').replace(/\.md$/, '') + '/';
        ensureMenuItemPlaceholderCardFromPreview(doc, win, itemUrl, cp, pay.frontMatter || {}, pay.body);
      });
    }
    if (newItems.length && win._dashboardInjectEditButtons) {
      win._dashboardInjectEditButtons();
    }
  }

  /** Merge iframe / live menu DOM into server menu JSON for POST /menu-versions. */
  function buildMenuDataForSnapshot(opts) {
    opts = opts || {};
    var base = '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID);
    var menuPromise =
      opts.mergeLatestSnapshot && embedPanelMode
        ? fetchLatestMenuVersionMenuData()
        : getFromCMS(base + '/menu');
    return menuPromise.then(function(menuData) {
      menuData = JSON.parse(JSON.stringify(menuData || {}));
      try {
        var idoc = getEditorPreviewDocument();
        if (idoc && idoc.body) {
          syncSectionWeightsFromDom(idoc);
          var collected = collectDashboardNewMenuItemsFromIframe(idoc);
          var domSnap = collectMenuStructureFromIframe(idoc);
          if (isMenuDataEmpty(menuData)) {
            menuData.categories = domSnap.categories;
            menuData.menuItems = domSnap.menuItems;
          } else if (domSnap.categories.length) {
            menuData.categories = domSnap.categories;
          }
          mergeDashboardNewItemsIntoMenuData(menuData, collected);
          if (!menuData.version) menuData.version = '1.0.0';
          if (!menuData.exportDate) menuData.exportDate = new Date().toISOString();
          if (!menuData.metadata || typeof menuData.metadata !== 'object') {
            menuData.metadata = { siteTitle: '', baseURL: '' };
          }
        }
      } catch (e) {
        console.warn('buildMenuDataForSnapshot: merge new items', e);
      }
      mergeThemeColorOverridesIntoMenuData(menuData);
      return menuData;
    });
  }

  /**
   * POST /menu-versions. updateLiveMenu false = snapshot JSON only on CMS (.menu-versions), no data/menu.json.
   */
  function saveMenuSnapshotToCMS(opts) {
    opts = opts || {};
    var base = '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID);
    return buildMenuDataForSnapshot({ mergeLatestSnapshot: opts.mergeLatestSnapshot }).then(function(menuData) {
      var now = new Date();
      var name = opts.name || ('Editor · ' + now.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
      var desc = opts.description || 'Menu snapshot from editor';
      var body = {
        name: name,
        description: desc,
        menu_data: menuData
      };
      if (opts.updateLiveMenu === false) {
        body.update_live_menu = false;
      }
      return postToCMS(base + '/menu-versions', body);
    });
  }

  /** Saves current server menu.json as a new version (POST /menu-versions). Used when leaving the editor. */
  function saveMenuSnapshotOnLeave() {
    var base = '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID);
    return buildMenuDataForSnapshot({ mergeLatestSnapshot: opts.mergeLatestSnapshot }).then(function(menuData) {
      var now = new Date();
      var name = 'Editor exit · ' + now.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      var desc = themeOnlyMode
        ? 'Automatic theme snapshot when leaving the theme editor.'
        : 'Automatic snapshot when leaving the menu editor (back to dashboard).';
      return postToCMS(base + '/menu-versions', {
        name: name,
        description: desc,
        menu_data: menuData
      }).then(function() { return true; });
    }).catch(function(err) {
      console.warn('saveMenuSnapshotOnLeave', err);
      return false;
    });
  }

  function fetchEditorSnapshotBootstrap() {
    if (!loadDraftsOnLoad) return Promise.resolve(null);
    var q = menuVersionFromUrl || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('editMenuVersionId') : null);
    var path = '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/editor-snapshot';
    if (q) path += '?menu_version_id=' + encodeURIComponent(q) + '&include_drafts=true';
    else path += '?include_drafts=true';
    return getFromCMS(path).then(function(data) {
      window.__ttmsEditorSnapshot = data;
      editorSnapshotVersionId = (data.source === 'saved_version' && data.menuVersionId) ? data.menuVersionId : null;
      var meta = data.menuVersionMeta;
      if (meta && meta.name) setEditStatus('Loaded menu version: ' + meta.name);
      else if (data.source === 'live') setEditStatus('Live menu with draft changes');
      if (loadDraftsOnLoad && iframe && iframe.contentDocument && iframe.contentDocument.body && editMode) {
        setTimeout(function() {
          hydrateThemeColorsFromMenuSnapshot();
          hydrateDashboardNewItemsFromMenuSnapshot();
          var win = iframe.contentWindow;
          if (win && win._dashboardInjectEditButtons) win._dashboardInjectEditButtons();
          setTimeout(function() {
            if (win && win.__dashboardApplyEdit) loadAndApplyDrafts();
          }, 50);
        }, 150);
      }
      return data;
    }).catch(function(err) {
      console.warn('Editor snapshot bootstrap failed', err);
      return null;
    });
  }

  function setEditMode(on) {
    editMode = !!on;
    page.setAttribute('data-edit-mode', editMode ? 'edit' : 'preview');
    if (btnPreview) {
      btnPreview.classList.toggle('active', !editMode);
      btnPreview.setAttribute('aria-pressed', !editMode);
    }
    if (btnEdit) {
      btnEdit.classList.toggle('active', editMode);
      btnEdit.setAttribute('aria-pressed', editMode);
    }
    if (submodeWrap) submodeWrap.classList.toggle('hidden', !editMode);
    if (!editMode) {
      editSubmode = 'content';
      page.setAttribute('data-edit-submode', 'content');
      if (btnSubmodeContent) {
        btnSubmodeContent.classList.add('active');
        btnSubmodeContent.setAttribute('aria-pressed', 'true');
      }
      if (btnSubmodeMove) {
        btnSubmodeMove.classList.remove('active');
        btnSubmodeMove.setAttribute('aria-pressed', 'false');
      }
      if (btnSubmodeColor) {
        btnSubmodeColor.classList.remove('active');
        btnSubmodeColor.setAttribute('aria-pressed', 'false');
      }
      updateEditPromptForSubmode();
      clearSelection();
      showColorSectionList();
      if (colorForm) colorForm.classList.add('hidden');
      closeAllMoveToolbarsInDoc(iframe && iframe.contentDocument);
    }
    setupIframeEditMode(iframeEditOverlayActive());
  }

  if (loadDraftsOnLoad) {
    ensurePreviewIframeLoaded();
    setEditMode(true);
  } else if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(function() { ensurePreviewIframeLoaded(); }, { timeout: 2500 });
  } else {
    setTimeout(ensurePreviewIframeLoaded, 50);
  }
  fetchEditorSnapshotBootstrap();

  function setEditSubmode(mode) {
    editSubmode = mode;
    page.setAttribute('data-edit-submode', mode);
    if (btnSubmodeContent) {
      btnSubmodeContent.classList.toggle('active', mode === 'content');
      btnSubmodeContent.setAttribute('aria-pressed', mode === 'content');
    }
    if (btnSubmodeMove) {
      btnSubmodeMove.classList.toggle('active', mode === 'move');
      btnSubmodeMove.setAttribute('aria-pressed', mode === 'move');
    }
    if (btnSubmodeColor) {
      btnSubmodeColor.classList.toggle('active', mode === 'color');
      btnSubmodeColor.setAttribute('aria-pressed', mode === 'color');
    }
    if (mode === 'content' || mode === 'move') {
      clearSelection();
      if (asideEl) asideEl.classList.remove('hidden');
      if (colorAsideEl) colorAsideEl.classList.add('hidden');
      if (promptEl) promptEl.classList.remove('hidden');
      if (formEl) formEl.classList.add('hidden');
      updateEditPromptForSubmode();
    } else {
      if (asideEl) asideEl.classList.add('hidden');
      if (colorAsideEl) {
        colorAsideEl.classList.remove('hidden');
        colorAsideEl.classList.add('dashboard-edit-color-aside-collapsed');
      }
      if (colorPrompt) colorPrompt.classList.remove('hidden');
      showColorSectionList();
      if (colorForm) colorForm.classList.add('hidden');
      if (btnToggleColorPanel) {
        btnToggleColorPanel.setAttribute('aria-expanded', 'false');
        btnToggleColorPanel.setAttribute('aria-label', 'Expand color panel');
        setColorAsideToggleIcon(false);
        var textEl = btnToggleColorPanel.querySelector('.dashboard-edit-color-aside-toggle-text');
        if (textEl) textEl.textContent = 'Expand';
      }
    }
    setupIframeEditMode(iframeEditOverlayActive());
    syncIframeMoveModeFromSubmode();
    if (mode !== 'move') {
      try {
        closeAllMoveToolbarsInDoc(iframe && iframe.contentDocument);
      } catch (e) { /* ignore */ }
    }
  }

  if (themeOnlyMode) {
    setEditMode(true);
    setEditSubmode('color');
    expandColorAsidePanel();
    if (colorPrompt) {
      var colorIntro = colorPrompt.querySelector('.dashboard-edit-color-intro');
      if (colorIntro) {
        colorIntro.textContent =
          'Pick a section to adjust CSS variables. Changes preview live in the menu and are saved automatically when you go back to the dashboard.';
      }
    }
  }

  if (rearrangeOnlyMode) {
    setEditMode(true);
    setEditSubmode('move');
  }

  function exitColorSectionEdit() {
    if (colorForm) colorForm.classList.add('hidden');
    if (colorPrompt) colorPrompt.classList.remove('hidden');
    if (colorAsideEl) colorAsideEl.classList.remove('dashboard-edit-color-aside--section-open');
    showColorSectionList();
  }

  function showColorSectionList() {
    if (!colorSectionsEl) return;
    selectedColorSectionId = null;
    setColorAsideHeaderTitle('Theme colors', null);
    if (btnCloseColorSection) btnCloseColorSection.classList.add('hidden');
    if (colorForm) colorForm.classList.add('hidden');
    if (colorPrompt) colorPrompt.classList.remove('hidden');
    colorSectionsEl.innerHTML = '';
    COLOR_SECTIONS.forEach(function(section) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dashboard-edit-color-section-btn';
      btn.setAttribute('data-section-id', section.id);
      btn.setAttribute('role', 'listitem');
      btn.setAttribute('aria-label', 'Edit ' + section.label + ' colors');
      var iconClass = COLOR_SECTION_ICONS[section.id] || 'fa-paint-brush';
      btn.innerHTML =
        '<span class="dashboard-edit-color-section-btn-icon" aria-hidden="true"><i class="fa ' + iconClass + '"></i></span>' +
        '<span class="dashboard-edit-color-section-btn-text">' + section.label + '</span>' +
        '<span class="dashboard-edit-color-section-btn-chevron" aria-hidden="true"><i class="fa fa-chevron-right"></i></span>';
      btn.addEventListener('click', function() {
        selectedColorSectionId = section.id;
        if (colorAsideEl) colorAsideEl.classList.remove('dashboard-edit-color-aside-collapsed');
        if (btnToggleColorPanel) {
          btnToggleColorPanel.setAttribute('aria-expanded', 'true');
          btnToggleColorPanel.setAttribute('aria-label', 'Collapse color panel');
          setColorAsideToggleIcon(true);
        }
        if (colorAsideEl) colorAsideEl.classList.add('dashboard-edit-color-aside--section-open');
        setColorAsideHeaderTitle(section.label, section.id);
        if (btnCloseColorSection) btnCloseColorSection.classList.remove('hidden');
        if (colorPrompt) colorPrompt.classList.add('hidden');
        colorFieldsEl.innerHTML = '';
        section.vars.forEach(function(v) {
          var val = getIframeRootVar(v.name);
          var isColor = isColorVar(v.name, val);
          var wrap = document.createElement('div');
          wrap.className = 'dashboard-edit-color-field' + (isColor ? ' dashboard-edit-color-field--swatch' : ' dashboard-edit-color-field--text');
          var label = document.createElement('label');
          label.textContent = v.label;
          var varHint = document.createElement('span');
          varHint.className = 'dashboard-edit-color-var-hint';
          varHint.textContent = v.name;
          wrap.appendChild(label);
          wrap.appendChild(varHint);
          if (isColor) {
            var hex6 = toHex6(val);
            if (!hex6) hex6 = '#000000';
            var row = document.createElement('div');
            row.className = 'dashboard-edit-color-field-row';
            var colorInp = document.createElement('input');
            colorInp.type = 'color';
            colorInp.className = 'dashboard-edit-color-picker';
            colorInp.value = hex6;
            colorInp.setAttribute('data-var', v.name);
            colorInp.setAttribute('aria-label', v.label + ' color');
            var textInp = document.createElement('input');
            textInp.type = 'text';
            textInp.className = 'dashboard-edit-input dashboard-edit-color-value-input';
            textInp.placeholder = v.name;
            textInp.setAttribute('data-var', v.name);
            textInp.value = val || hex6;
            var alpha = getAlphaFromValue(val);
            var sliderWrap = document.createElement('div');
            sliderWrap.className = 'dashboard-edit-color-slider-wrap';
            var sliderLabel = document.createElement('span');
            sliderLabel.className = 'dashboard-edit-color-slider-label';
            sliderLabel.textContent = 'Opacity';
            var sliderVal = document.createElement('span');
            sliderVal.className = 'dashboard-edit-color-slider-value';
            sliderVal.textContent = alpha + '%';
            var slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'dashboard-edit-color-slider';
            slider.min = 0;
            slider.max = 100;
            slider.value = alpha;
            slider.setAttribute('data-var', v.name);
            slider.setAttribute('aria-label', v.label + ' opacity');
            function syncAlphaLabel() {
              sliderVal.textContent = parseInt(slider.value, 10) + '%';
            }
            colorInp.addEventListener('input', function() {
              textInp.value = hexWithAlpha(colorInp.value, parseInt(slider.value, 10));
              syncAlphaLabel();
              scheduleApplyColorOverrides();
            });
            slider.addEventListener('input', function() {
              textInp.value = hexWithAlpha(colorInp.value, parseInt(slider.value, 10));
              syncAlphaLabel();
              scheduleApplyColorOverrides();
            });
            textInp.addEventListener('input', function() {
              var h = toHex6(textInp.value);
              if (h) { colorInp.value = h; slider.value = getAlphaFromValue(textInp.value); }
              syncAlphaLabel();
              scheduleApplyColorOverrides();
            });
            sliderWrap.appendChild(sliderLabel);
            sliderWrap.appendChild(slider);
            sliderWrap.appendChild(sliderVal);
            row.appendChild(colorInp);
            row.appendChild(textInp);
            row.appendChild(sliderWrap);
            wrap.appendChild(row);
          } else {
            var input = document.createElement('input');
            input.type = 'text';
            input.className = 'dashboard-edit-input';
            input.placeholder = v.name;
            input.setAttribute('data-var', v.name);
            input.value = val;
            input.addEventListener('input', scheduleApplyColorOverrides);
            wrap.appendChild(input);
          }
          colorFieldsEl.appendChild(wrap);
        });
        colorForm.classList.remove('hidden');
      });
      colorSectionsEl.appendChild(btn);
    });
  }

  function getIframeRootVar(varName) {
    try {
      var doc = iframe.contentDocument;
      if (!doc || !doc.documentElement) return '';
      var val = doc.defaultView.getComputedStyle(doc.documentElement).getPropertyValue(varName).trim();
      return val || '';
    } catch (e) { return ''; }
  }

  function isColorVar(varName, value) {
    if (!value || value === 'none' || /^url\(|^linear-gradient|^var\(/.test(value)) return false;
    if (/^#([0-9a-fA-F]{3}){1,2}$|^#([0-9a-fA-F]{4}){1,2}$/.test(value)) return true;
    if (/^rgba?\(/.test(value)) return true;
    var n = (varName || '').toLowerCase();
    return n.indexOf('color') !== -1 || n.indexOf('bordercolor') !== -1;
  }

  function toHex6(val) {
    if (!val) return '';
    var m = val.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
    if (m) {
      var r = m[1] + m[1]; var g = m[2] + m[2]; var b = m[3] + m[3];
      return '#' + r + g + b;
    }
    m = val.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
    if (m) return '#' + m[1];
    m = val.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) {
      var r = parseInt(m[1], 10).toString(16); if (r.length === 1) r = '0' + r;
      var g = parseInt(m[2], 10).toString(16); if (g.length === 1) g = '0' + g;
      var b = parseInt(m[3], 10).toString(16); if (b.length === 1) b = '0' + b;
      return '#' + r + g + b;
    }
    return '';
  }

  function getAlphaFromValue(val) {
    if (!val) return 100;
    var m = val.match(/#[0-9a-fA-F]{6}([0-9a-fA-F]{2})$/);
    if (m) return Math.round(parseInt(m[1], 16) / 255 * 100);
    m = val.match(/rgba?\([^)]*,\s*([\d.]+)\)/);
    if (m) return Math.round(parseFloat(m[1]) * 100);
    return 100;
  }

  function hexWithAlpha(hex6, alphaPercent) {
    if (!hex6 || !/^#[0-9a-fA-F]{6}$/.test(hex6)) return hex6 || '';
    var a = Math.round((alphaPercent / 100) * 255);
    var aa = (a < 16 ? '0' : '') + a.toString(16);
    return hex6 + aa;
  }

  var _applyColorTimer = null;
  var COLOR_OVERRIDE_VALUES = {};
  function scheduleApplyColorOverrides() {
    if (_applyColorTimer) clearTimeout(_applyColorTimer);
    _applyColorTimer = setTimeout(function() {
      _applyColorTimer = null;
      applyColorOverrides();
    }, 150);
  }

  function syncActiveColorSectionInputs() {
    if (!selectedColorSectionId || !colorFieldsEl) return;
    var section = COLOR_SECTIONS.find(function(s) { return s.id === selectedColorSectionId; });
    if (!section) return;
    section.vars.forEach(function(v) {
      var input = colorFieldsEl.querySelector('input.dashboard-edit-input[data-var="' + v.name + '"]') || colorFieldsEl.querySelector('input[data-var="' + v.name + '"]');
      if (!input) return;
      var val = (input.value || '').trim();
      if (val) COLOR_OVERRIDE_VALUES[v.name] = val;
      else delete COLOR_OVERRIDE_VALUES[v.name];
    });
  }

  function getThemeColorValue(varName) {
    if (COLOR_OVERRIDE_VALUES[varName]) return COLOR_OVERRIDE_VALUES[varName];
    return getIframeRootVar(varName);
  }

  function applyColorOverrides() {
    try {
      var doc = iframe.contentDocument;
      if (!doc || !doc.head) return;
      syncActiveColorSectionInputs();

      var rules = [];
      Object.keys(COLOR_OVERRIDE_VALUES).forEach(function(varName) {
        rules.push(varName + ':' + COLOR_OVERRIDE_VALUES[varName]);
      });

      var id = 'dashboard-edit-color-override';
      var style = doc.getElementById(id);
      if (!style) {
        style = doc.createElement('style');
        style.id = id;
        doc.head.appendChild(style);
      }
      if (rules.length === 0) {
        style.textContent = '';
      } else {
        style.textContent = ':root { ' + rules.join('; ') + ' }';
      }
      if (themeColorSuppressPersist === 0) {
        schedulePersistThemeDraft();
      }
    } catch (e) { console.warn('Apply color:', e); }
  }

  function mergeThemeColorOverridesIntoMenuData(menuData) {
    if (!menuData || typeof menuData !== 'object') return;
    var keys = Object.keys(COLOR_OVERRIDE_VALUES);
    if (keys.length === 0) {
      delete menuData.themeColorOverrides;
      return;
    }
    menuData.themeColorOverrides = {};
    keys.forEach(function(k) { menuData.themeColorOverrides[k] = COLOR_OVERRIDE_VALUES[k]; });
  }

  function buildThemeCssDraftBody() {
    syncActiveColorSectionInputs();
    var lines = [':root {'];
    COLOR_SECTIONS.forEach(function(section, idx) {
      lines.push('  /* ' + section.label + ' */');
      section.vars.forEach(function(v) {
        var val = getThemeColorValue(v.name);
        if (val) lines.push('  ' + v.name + ': ' + val + ';');
      });
      if (idx < COLOR_SECTIONS.length - 1) lines.push('');
    });
    lines.push('}');
    lines.push('');
    return lines.join('\n');
  }

  function parseThemeOverridesFromCss(css) {
    var out = {};
    if (!css || typeof css !== 'string') return out;
    var m = css.match(/:root\s*\{([^}]*)\}/);
    if (!m) return out;
    m[1].split(';').forEach(function(part) {
      var idx = part.indexOf(':');
      if (idx < 0) return;
      var prop = part.slice(0, idx).trim();
      var val = part.slice(idx + 1).trim();
      if (prop && val) out[prop] = val;
    });
    return out;
  }

  var _themePersistTimer = null;
  function schedulePersistThemeDraft() {
    if (themeColorSuppressPersist) return;
    if (_themePersistTimer) clearTimeout(_themePersistTimer);
    _themePersistTimer = setTimeout(function() {
      _themePersistTimer = null;
      persistThemeDraftToCMS();
    }, 1000);
  }

  function hasThemeColorChanges() {
    if (Object.keys(COLOR_OVERRIDE_VALUES).length > 0) return true;
    if (draftContentPaths.has(THEME_COLORS_CONTENT_PATH)) return true;
    return hasPendingMenuChanges();
  }

  function flushThemeDraftPersist() {
    if (_themePersistTimer) {
      clearTimeout(_themePersistTimer);
      _themePersistTimer = null;
    }
    if (!Object.keys(COLOR_OVERRIDE_VALUES).length) return Promise.resolve(true);
    return persistThemeDraftToCMS();
  }

  function saveThemeChangesBeforeLeave() {
    return flushThemeDraftPersist().then(function() {
      return saveMenuSnapshotOnLeave();
    });
  }

  function persistThemeDraftToCMS() {
    var previewPath = '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/previews';
    var payload = {
      kind: 'theme-css',
      clientId: CMS_CLIENT_ID,
      contentPath: THEME_COLORS_CONTENT_PATH,
      frontMatter: {},
      body: buildThemeCssDraftBody()
    };
    return postToCMS(previewPath, { payload: payload }).then(function(resp) {
      var pid = resp && (resp.previewId !== undefined && resp.previewId !== null && resp.previewId !== ''
        ? resp.previewId : resp.preview_id);
      if (pid) {
        draftContentPaths.add(THEME_COLORS_CONTENT_PATH);
        syncSaveButtonAppearance();
      }
      return true;
    }).catch(function(err) {
      console.warn('persistThemeDraftToCMS', err);
      return false;
    });
  }

  function hydrateThemeColorsFromMenuSnapshot() {
    var snap = window.__ttmsEditorSnapshot;
    if (!snap || !snap.menuData) return;
    var o = snap.menuData.themeColorOverrides;
    if (!o || typeof o !== 'object') return;
    themeColorSuppressPersist++;
    try {
      Object.keys(COLOR_OVERRIDE_VALUES).forEach(function(k) { delete COLOR_OVERRIDE_VALUES[k]; });
      Object.keys(o).forEach(function(k) { COLOR_OVERRIDE_VALUES[k] = o[k]; });
      applyColorOverrides();
    } finally {
      themeColorSuppressPersist--;
    }
  }

  function clearSelection() {
    if (selectedElement && selectedElement.classList) {
      try { selectedElement.classList.remove('dashboard-edit-selected'); } catch (e) {}
    }
    selectedElement = null;
    selectedInfo = null;
    promptEl.classList.remove('hidden');
    formEl.classList.add('hidden');
    setEditFormLoading(false);
    if (window.DashboardEditFieldPrompts) window.DashboardEditFieldPrompts.disable();
    if (inputTitle) inputTitle.value = '';
    if (inputDesc) inputDesc.value = '';
    if (inputSectionTitle) inputSectionTitle.value = '';
    syncSectionTitleFieldLock(null);
    if (inputSectionDesc) inputSectionDesc.value = '';
    if (inputLocationAddress) inputLocationAddress.value = '';
    if (inputLocationCity) inputLocationCity.value = '';
    if (inputLocationIsland) inputLocationIsland.value = '';
    if (inputLocationSubcategories) inputLocationSubcategories.value = '';
    if (inputLocationLat) inputLocationLat.value = '';
    if (inputLocationLng) inputLocationLng.value = '';
    if (inputLocationPhone) inputLocationPhone.value = '';
    if (inputLocationWhatsapp) inputLocationWhatsapp.value = '';
    if (inputLocationOrderingtables) inputLocationOrderingtables.value = '';
    if (inputLocationFooddrop) inputLocationFooddrop.value = '';
    if (inputLocationOpeningHours) inputLocationOpeningHours.value = '';
    if (inputPromoTitle) inputPromoTitle.value = '';
    if (inputPromoLink) inputPromoLink.value = '';
    if (inputSectionWeight) inputSectionWeight.value = '';
    if (inputSectionIcon) inputSectionIcon.value = '';
    if (window.DashboardSectionIconPicker && typeof window.DashboardSectionIconPicker.syncFromInput === 'function') {
      window.DashboardSectionIconPicker.syncFromInput();
    }
    applySectionImagePathsToForm('', '');
    if (inputHomeHeroImage) inputHomeHeroImage.value = '';
    homeHeroIndexCache = { frontMatter: null, body: '' };
    updateHeroImageThumbDisplay('', null);
    syncHeroPathInputVisibility();
    if (inputMenuItemImages) inputMenuItemImages.value = '';
    if (menuItemImagesContainer) renderMenuItemImagesUI([]);
    if (pricesContainer) renderPricesUI(pricesContainer, []);
    if (sideCategoriesContainer) renderSideCategoriesUI(sideCategoriesContainer, []);
    if (modificationsContainer) renderPairsUI(modificationsContainer, []);
    if (additionsContainer) renderPairsUI(additionsContainer, []);
    if (tagsContainer) renderStringListUI(tagsContainer, []);
    if (ingredientsContainer) renderStringListUI(ingredientsContainer, []);
    if (cookingmethodsContainer) renderStringListUI(cookingmethodsContainer, []);
    if (typesContainer) renderStringListUI(typesContainer, []);
    if (eventsContainer) renderStringListUI(eventsContainer, []);
    if (menuItemPromotionsContainer) renderMenuItemPromotionsUI(menuItemPromotionsContainer, []);
    populateMenuItemAvailabilityFromObject(null);
    if (inputSlideshowImages) inputSlideshowImages.value = '';
    if (slideshowImagesContainer) renderSlideshowImagesUI([], true);
    if (slideshowViewEl) slideshowViewEl.innerHTML = '';
    if (inputPromoTitle) inputPromoTitle.value = '';
    if (inputPromoDescription) inputPromoDescription.value = '';
    if (inputPromoLink) inputPromoLink.value = '';
    if (inputPromoImages) inputPromoImages.value = '';
    if (promoImagesContainer) renderPromoImagesUI([], true);
    if (inputPromoRecurring) inputPromoRecurring.checked = false;
    if (promoDaysofweekContainer) renderStringListUI(promoDaysofweekContainer, []);
    if (inputPromoWeight) inputPromoWeight.value = '';
    setMenuItemWizardStep(0);
    setPromotionWizardStep(0);
    setLocationWizardStep(0);
    updateMarkForDeletionButton();
    if (selectedTypeEl) selectedTypeEl.textContent = '';
  }

  function parseJsonAttr(el, attr) {
    try {
      var raw = el.getAttribute(attr);
      if (raw == null || raw === '') return [];
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }

  function parseJsonObjectAttr(el, attr) {
    try {
      var raw = el.getAttribute(attr);
      if (raw == null || raw === '') return null;
      var o = JSON.parse(raw);
      return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
    } catch (e) {
      return null;
    }
  }

  function getMenuItemAvailabilityFromState() {
    var daysStr = inputAvailabilityDays ? (inputAvailabilityDays.value || '').trim() : '';
    var days = daysStr.split(',').map(function(s) { return (s || '').trim(); }).filter(Boolean);
    var ts = inputAvailabilityTimeStart ? (inputAvailabilityTimeStart.value || '').trim() : '';
    var tf = inputAvailabilityTimeFinish ? (inputAvailabilityTimeFinish.value || '').trim() : '';
    if (!days.length && !ts && !tf) return null;
    var out = {};
    if (days.length) out.days = days;
    if (ts) out.time_start = ts;
    if (tf) out.time_finish = tf;
    return out;
  }

  function populateMenuItemAvailabilityFromObject(obj) {
    if (!inputAvailabilityDays) return;
    if (!obj || typeof obj !== 'object') {
      inputAvailabilityDays.value = '';
      if (inputAvailabilityTimeStart) inputAvailabilityTimeStart.value = '';
      if (inputAvailabilityTimeFinish) inputAvailabilityTimeFinish.value = '';
      return;
    }
    var days = obj.days;
    inputAvailabilityDays.value = Array.isArray(days) ? days.map(function(d) { return String(d).trim(); }).filter(Boolean).join(', ') : '';
    if (inputAvailabilityTimeStart) inputAvailabilityTimeStart.value = obj.time_start != null ? String(obj.time_start).trim() : '';
    if (inputAvailabilityTimeFinish) inputAvailabilityTimeFinish.value = obj.time_finish != null ? String(obj.time_finish).trim() : '';
  }

  function hoursParseStringList(text) {
    return (text || '').split('\n').map(function(s) { return (s || '').trim(); }).filter(Boolean);
  }
  function hoursFormatStringList(arr) {
    if (!Array.isArray(arr)) return '';
    return arr.map(function(s) { return (s == null ? '' : String(s)).trim(); }).filter(Boolean).join('\n');
  }
  function hoursFormatPricesArray(pricesArr) {
    if (!Array.isArray(pricesArr) || pricesArr.length === 0) return '';
    var out = [];
    for (var i = 0; i < pricesArr.length; i += 3) {
      var v1 = pricesArr[i] != null ? String(pricesArr[i]).trim() : '-';
      var v2 = pricesArr[i + 1] != null ? String(pricesArr[i + 1]).trim() : '-';
      var price = pricesArr[i + 2] != null ? String(pricesArr[i + 2]).trim() : '';
      if (!v1 && !v2 && !price) continue;
      out.push(v1 + ' | ' + (v2 || '-') + ' | ' + price);
    }
    return out.join('\n');
  }
  function hoursParsePricesText(text) {
    var lines = hoursParseStringList(text);
    var out = [];
    lines.forEach(function(line) {
      var parts = line.split('|').map(function(s) { return s.trim(); });
      if (parts.length < 2) return;
      var v1 = parts[0] || '-';
      var v2 = (parts[1] != null && parts[1] !== '') ? parts[1] : '-';
      var price = parts.length >= 3 ? parts[2] : '';
      if (!v1 || price === '') return;
      out.push(v1, v2, isNaN(parseFloat(price)) ? price : parseFloat(price));
    });
    return out;
  }
  function hoursFormatPairsArray(flatArr) {
    if (!Array.isArray(flatArr) || flatArr.length === 0) return '';
    var out = [];
    for (var i = 0; i < flatArr.length; i += 2) {
      var name = flatArr[i] != null ? String(flatArr[i]).trim() : '';
      var price = flatArr[i + 1] != null ? String(flatArr[i + 1]).trim() : '';
      if (!name) continue;
      out.push(name + ' | ' + (price || '0'));
    }
    return out.join('\n');
  }
  function hoursParsePairsText(text) {
    var lines = hoursParseStringList(text);
    var out = [];
    lines.forEach(function(line) {
      var parts = line.split('|').map(function(s) { return s.trim(); });
      if (!parts[0]) return;
      var price = parts[1] != null ? parts[1] : '0';
      out.push(parts[0], isNaN(parseFloat(price)) ? price : parseFloat(price));
    });
    return out;
  }
  function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }
  function createPriceRow(variable1, variable2, price) {
    var row = document.createElement('div');
    row.className = 'dashboard-price-row';
    row.innerHTML = '<input type="text" class="dashboard-edit-input price-size" placeholder="variable1" value="' + escapeAttr(variable1) + '">' +
      '<input type="text" class="dashboard-edit-input price-flavour" placeholder="variable2" value="' + escapeAttr(variable2) + '">' +
      '<input type="number" class="dashboard-edit-input price-price" placeholder="price" step="0.01" min="0" value="' + (typeof price === 'number' && !isNaN(price) ? price : (price !== '' && price != null ? escapeAttr(price) : '')) + '">' +
      '<button type="button" class="dashboard-btn dashboard-btn-remove-row" aria-label="Remove"><i class="fa fa-trash-o" aria-hidden="true"></i></button>';
    row.querySelector('.dashboard-btn-remove-row').addEventListener('click', function() { row.remove(); });
    return row;
  }
  function createPairRow(name, price) {
    var row = document.createElement('div');
    row.className = 'dashboard-pair-row';
    row.innerHTML = '<input type="text" class="dashboard-edit-input pair-name" placeholder="name" value="' + escapeAttr(name) + '">' +
      '<input type="number" class="dashboard-edit-input pair-price" placeholder="price" step="0.01" min="0" value="' + (typeof price === 'number' && !isNaN(price) ? price : (price !== '' && price != null ? escapeAttr(price) : '0')) + '">' +
      '<button type="button" class="dashboard-btn dashboard-btn-remove-row" aria-label="Remove"><i class="fa fa-trash-o" aria-hidden="true"></i></button>';
    row.querySelector('.dashboard-btn-remove-row').addEventListener('click', function() { row.remove(); });
    return row;
  }
  function createListRow(value) {
    var row = document.createElement('div');
    row.className = 'dashboard-list-row';
    row.innerHTML = '<input type="text" class="dashboard-edit-input list-value" placeholder="value" value="' + escapeAttr(value) + '">' +
      '<button type="button" class="dashboard-btn dashboard-btn-remove-row" aria-label="Remove"><i class="fa fa-trash-o" aria-hidden="true"></i></button>';
    row.querySelector('.dashboard-btn-remove-row').addEventListener('click', function() { row.remove(); });
    return row;
  }
  function renderPricesUI(container, pricesArr) {
    if (!container) return;
    container.innerHTML = '';
    if (!Array.isArray(pricesArr)) pricesArr = [];
    for (var i = 0; i < pricesArr.length; i += 3) {
      var v1 = pricesArr[i] != null ? String(pricesArr[i]) : '';
      var v2 = pricesArr[i + 1] != null ? String(pricesArr[i + 1]) : '-';
      var price = pricesArr[i + 2];
      container.appendChild(createPriceRow(v1, v2, price));
    }
  }
  function getPricesFromUI(container) {
    if (!container) return [];
    var out = [];
    container.querySelectorAll('.dashboard-price-row').forEach(function(row) {
      var sizeInp = row.querySelector('.price-size');
      var flavourInp = row.querySelector('.price-flavour');
      var priceInp = row.querySelector('.price-price');
      var size = sizeInp ? (sizeInp.value || '').trim() : '';
      if (!size) return;
      var flavour = flavourInp ? (flavourInp.value || '').trim() : '-';
      var priceVal = priceInp && priceInp.value !== '' ? priceInp.value : '';
      var price = priceVal !== '' && !isNaN(parseFloat(priceVal)) ? parseFloat(priceVal) : priceVal;
      out.push(size, flavour, price);
    });
    return out;
  }
  function renderPairsUI(container, flatArr) {
    if (!container) return;
    container.innerHTML = '';
    if (!Array.isArray(flatArr)) flatArr = [];
    for (var i = 0; i < flatArr.length; i += 2) {
      var name = flatArr[i] != null ? String(flatArr[i]) : '';
      var price = flatArr[i + 1];
      container.appendChild(createPairRow(name, price));
    }
  }
  function getPairsFromUI(container) {
    if (!container) return [];
    var out = [];
    container.querySelectorAll('.dashboard-pair-row').forEach(function(row) {
      var nameInp = row.querySelector('.pair-name');
      var priceInp = row.querySelector('.pair-price');
      var name = nameInp ? (nameInp.value || '').trim() : '';
      if (!name) return;
      var priceVal = priceInp && priceInp.value !== '' ? priceInp.value : '0';
      var price = !isNaN(parseFloat(priceVal)) ? parseFloat(priceVal) : priceVal;
      out.push(name, price);
    });
    return out;
  }
  function renderStringListUI(container, arr) {
    if (!container) return;
    container.innerHTML = '';
    (arr || []).forEach(function(val) {
      container.appendChild(createListRow(val == null ? '' : String(val)));
    });
  }
  function getStringListFromUI(container) {
    if (!container) return [];
    var out = [];
    container.querySelectorAll('.dashboard-list-row').forEach(function(row) {
      var inp = row.querySelector('.list-value');
      var val = inp ? (inp.value || '').trim() : '';
      if (val) out.push(val);
    });
    return out;
  }
  function createMenuItemPromotionRow(promo) {
    promo = promo || {};
    var daysArr = promo.days;
    var daysStr = '';
    if (Array.isArray(daysArr)) daysStr = daysArr.map(function(d) { return String(d).trim(); }).filter(Boolean).join(', ');
    else if (daysArr != null && typeof daysArr === 'string') daysStr = daysArr;
    var typeVal = (promo.type != null && String(promo.type).trim()) ? String(promo.type).trim() : 'percent_off';
    var valNum = promo.value != null && !isNaN(parseFloat(promo.value)) ? parseFloat(promo.value) : 0;
    var labelStr = promo.label != null ? String(promo.label) : '';
    var imageStr = promo.image != null ? String(promo.image) : '';
    var row = document.createElement('div');
    row.className = 'dashboard-menu-item-promo-row';
    var head = document.createElement('div');
    head.className = 'dashboard-menu-item-promo-row-head';
    var span = document.createElement('span');
    span.className = 'dashboard-menu-item-promo-title';
    span.textContent = 'Promotion';
    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'dashboard-btn dashboard-btn-remove-row';
    removeBtn.setAttribute('aria-label', 'Remove promotion');
    removeBtn.innerHTML = '<i class="fa fa-trash-o" aria-hidden="true"></i>';
    removeBtn.addEventListener('click', function() { row.remove(); });
    head.appendChild(span);
    head.appendChild(removeBtn);
    var grid = document.createElement('div');
    grid.className = 'dashboard-menu-item-promo-grid';
    function addField(label, node, spanFull) {
      var wrap = document.createElement('div');
      if (spanFull) wrap.className = 'dashboard-menu-item-promo-field-span';
      var lbl = document.createElement('label');
      lbl.textContent = label;
      wrap.appendChild(lbl);
      wrap.appendChild(node);
      grid.appendChild(wrap);
    }
    var inpDays = document.createElement('input');
    inpDays.type = 'text';
    inpDays.className = 'dashboard-edit-input menu-item-promo-days';
    inpDays.placeholder = 'Friday, Saturday, Sunday';
    inpDays.value = daysStr;
    addField('Days (comma-separated)', inpDays, true);
    var selType = document.createElement('select');
    selType.className = 'dashboard-edit-input menu-item-promo-type';
    var TYPES = ['percent_off', 'amount_off'];
    var found = false;
    TYPES.forEach(function(t) {
      var opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      if (t === typeVal) { opt.selected = true; found = true; }
      selType.appendChild(opt);
    });
    if (!found && typeVal) {
      var optExtra = document.createElement('option');
      optExtra.value = typeVal;
      optExtra.textContent = typeVal;
      optExtra.selected = true;
      selType.appendChild(optExtra);
    }
    addField('Type', selType, false);
    var inpVal = document.createElement('input');
    inpVal.type = 'number';
    inpVal.className = 'dashboard-edit-input menu-item-promo-value';
    inpVal.step = 'any';
    inpVal.min = '0';
    inpVal.value = valNum !== 0 ? String(valNum) : '';
    addField('Value', inpVal, false);
    var inpLab = document.createElement('input');
    inpLab.type = 'text';
    inpLab.className = 'dashboard-edit-input menu-item-promo-label';
    inpLab.placeholder = 'e.g. 2 for $150 All Day';
    inpLab.value = labelStr;
    addField('Label', inpLab, true);
    var inpImg = document.createElement('input');
    inpImg.type = 'text';
    inpImg.className = 'dashboard-edit-input menu-item-promo-image hidden';
    inpImg.setAttribute('tabindex', '-1');
    inpImg.setAttribute('aria-hidden', 'true');
    inpImg.placeholder = 'images/promos/...';
    inpImg.value = imageStr;
    var promoImgRow = document.createElement('div');
    promoImgRow.className = 'dashboard-menu-item-promo-image-path-row dashboard-hero-image-row dashboard-menu-item-image-row';
    var promoThumbWrap = document.createElement('div');
    promoThumbWrap.className = 'dashboard-menu-item-image-thumb-wrap';
    var promoThumb = document.createElement('img');
    promoThumb.className = 'dashboard-menu-item-image-thumb';
    promoThumb.alt = '';
    promoThumb.loading = 'lazy';
    promoThumbWrap.appendChild(promoThumb);
    var promoThumbState = { seq: 0, blobUrl: null };
    function updatePromoItemThumb() {
      bindDashboardImageThumb(promoThumb, promoThumbWrap, inpImg.value, null, promoThumbState);
    }
    var promoPathCol = document.createElement('div');
    promoPathCol.className = 'dashboard-menu-item-image-path-col';
    var promoPathActions = document.createElement('div');
    promoPathActions.className = 'dashboard-menu-item-image-path-actions';
    var promoFileInp = document.createElement('input');
    promoFileInp.type = 'file';
    promoFileInp.className = 'hidden';
    promoFileInp.setAttribute('accept', 'image/jpeg,image/png,image/webp,image/gif');
    promoFileInp.setAttribute('tabindex', '-1');
    promoFileInp.setAttribute('aria-hidden', 'true');
    promoFileInp.addEventListener('change', function() {
      var f = promoFileInp.files && promoFileInp.files[0];
      promoFileInp.value = '';
      if (!f) return;
      uploadMenuItemDraftImage(f, inpImg, function(path, file) {
        bindDashboardImageThumb(promoThumb, promoThumbWrap, path, file, promoThumbState);
        editFormDirty = true;
        setEditStatus('Unsaved changes (not yet published)');
      }, { rowEl: promoImgRow, statusLabel: 'Uploading image…' });
    });
    var promoUploadBtn = document.createElement('button');
    promoUploadBtn.type = 'button';
    promoUploadBtn.className = 'dashboard-btn dashboard-btn-secondary';
    promoUploadBtn.setAttribute('aria-label', 'Choose image file');
    promoUploadBtn.innerHTML = '<i class="fa fa-cloud-upload" aria-hidden="true"></i>';
    promoUploadBtn.addEventListener('click', function() { promoFileInp.click(); });
    var browsePromoImg = document.createElement('button');
    browsePromoImg.type = 'button';
    browsePromoImg.className = 'dashboard-btn dashboard-btn-secondary';
    browsePromoImg.setAttribute('aria-label', 'Browse site images');
    browsePromoImg.setAttribute('title', 'Browse site images');
    browsePromoImg.innerHTML = '<i class="fa fa-folder-open" aria-hidden="true"></i>';
    browsePromoImg.addEventListener('click', function() {
      openSiteImagePickerModal(function(rel) {
        inpImg.value = rel;
        updatePromoItemThumb();
        editFormDirty = true;
        setEditStatus('Unsaved changes (not yet published)');
      });
    });
    var promoRemoveBtn = document.createElement('button');
    promoRemoveBtn.type = 'button';
    promoRemoveBtn.className = 'dashboard-btn dashboard-btn-secondary';
    promoRemoveBtn.setAttribute('aria-label', 'Remove image');
    promoRemoveBtn.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
    promoRemoveBtn.addEventListener('click', function() {
      inpImg.value = '';
      updatePromoItemThumb();
      editFormDirty = true;
      setEditStatus('Unsaved changes (not yet published)');
    });
    promoPathActions.appendChild(promoUploadBtn);
    promoPathActions.appendChild(browsePromoImg);
    promoPathActions.appendChild(promoRemoveBtn);
    promoPathActions.appendChild(promoFileInp);
    promoPathCol.appendChild(inpImg);
    promoPathCol.appendChild(promoPathActions);
    promoImgRow.appendChild(promoThumbWrap);
    promoImgRow.appendChild(promoPathCol);
    updatePromoItemThumb();
    addField('Image', promoImgRow, true);
    row.appendChild(head);
    row.appendChild(grid);
    return row;
  }
  function renderMenuItemPromotionsUI(container, arr) {
    if (!container) return;
    container.innerHTML = '';
    var list = Array.isArray(arr) ? arr : [];
    list.forEach(function(p) {
      container.appendChild(createMenuItemPromotionRow(p));
    });
  }
  function getMenuItemPromotionsFromUI(container) {
    if (!container) return [];
    var out = [];
    container.querySelectorAll('.dashboard-menu-item-promo-row').forEach(function(row) {
      var daysEl = row.querySelector('.menu-item-promo-days');
      var typeEl = row.querySelector('.menu-item-promo-type');
      var valueEl = row.querySelector('.menu-item-promo-value');
      var labelEl = row.querySelector('.menu-item-promo-label');
      var imageEl = row.querySelector('.menu-item-promo-image');
      var daysStr = daysEl ? (daysEl.value || '').trim() : '';
      var days = daysStr.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      var label = labelEl ? (labelEl.value || '').trim() : '';
      var image = imageEl ? (imageEl.value || '').trim() : '';
      var type = typeEl ? (typeEl.value || 'percent_off').trim() : 'percent_off';
      var vRaw = valueEl ? (valueEl.value || '').trim() : '';
      var valueNum = vRaw !== '' && !isNaN(parseFloat(vRaw)) ? parseFloat(vRaw) : 0;
      if (!days.length && !label && !image && vRaw === '') return;
      out.push({ days: days, type: type, value: valueNum, label: label, image: image });
    });
    return out;
  }
  function hoursFormatSideCategories(cats) {
    if (!Array.isArray(cats) || cats.length === 0) return '';
    var blocks = [];
    cats.forEach(function(cat) {
      if (!cat || !cat.category_name) return;
      var min = cat.config && cat.config.minimum != null ? cat.config.minimum : 0;
      var max = cat.config && cat.config.maximum != null ? cat.config.maximum : 99;
      var header = String(cat.category_name) + ' | ' + String(cat.display_name || cat.category_name) + ' | min=' + min + ' | max=' + max;
      var lines = [header];
      (cat.items || []).forEach(function(it) {
        if (!it) return;
        if (Array.isArray(it)) return;
        var name = it.name != null ? String(it.name).trim() : '';
        if (!name) return;
        var price = it.price != null ? it.price : 0;
        var extra = '';
        var t = it.type != null ? String(it.type).trim() : '';
        if (t && t !== 'Regular') extra += ' | ' + t;
        var img = it.image != null ? String(it.image).trim() : '';
        if (img) extra += ' | ' + img;
        lines.push(name + ' | ' + price + extra);
      });
      blocks.push(lines.join('\n'));
    });
    return blocks.join('\n\n');
  }
  function hoursParseSideCategoriesText(text) {
    var blocks = (text || '').split(/\n\s*\n/).map(function(b) { return b.trim(); }).filter(Boolean);
    var out = [];
    blocks.forEach(function(block) {
      var lines = block.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
      if (lines.length === 0) return;
      var headParts = lines[0].split('|').map(function(s) { return s.trim(); }).filter(Boolean);
      if (headParts.length === 0) return;
      var category_name = headParts[0];
      var display_name = headParts.length > 1 ? headParts[1] : category_name;
      var min = 0, max = 99;
      headParts.slice(2).forEach(function(p) {
        var m = p.match(/^min\s*=\s*(\d+)/i); if (m) min = parseInt(m[1], 10);
        m = p.match(/^max\s*=\s*(\d+)/i); if (m) max = parseInt(m[1], 10);
      });
      var items = [];
      lines.slice(1).forEach(function(line) {
        var parts = line.replace(/^\-\s*/, '').split('|').map(function(s) { return s.trim(); });
        if (!parts[0]) return;
        var price = parts[1] != null && parts[1] !== '' ? parts[1] : 0;
        var type = parts[2] != null && parts[2] !== '' ? parts[2] : 'Regular';
        var image = parts[3] != null && parts[3] !== '' ? parts[3] : '';
        var itemObj = { name: parts[0], type: type, price: isNaN(parseFloat(price)) ? price : parseFloat(price) };
        if (image) itemObj.image = image;
        items.push(itemObj);
      });
      out.push({ category_name: category_name, display_name: display_name, items: items, config: { minimum: min, maximum: max } });
    });
    return out;
  }
  function createSideCatItemRow(item) {
    var name = (item && item.name != null) ? String(item.name) : '';
    var price = (item && item.price != null) ? item.price : 0;
    var row = document.createElement('div');
    row.className = 'side-cat-item';
    row.innerHTML = '<input type="text" class="dashboard-edit-input side-item-name" placeholder="name" value="' + (name.replace(/"/g, '&quot;')) + '">' +
      '<input type="number" class="dashboard-edit-input side-item-price" placeholder="price" step="0.01" min="0" value="' + (typeof price === 'number' ? price : '') + '">' +
      '<button type="button" class="dashboard-btn dashboard-btn-remove-item" aria-label="Remove"><i class="fa fa-trash-o" aria-hidden="true"></i></button>';
    row.querySelector('.dashboard-btn-remove-item').addEventListener('click', function() { row.remove(); });
    return row;
  }
  function getSideCatMinMax(cat) {
    var c = cat && cat.config;
    var minVal = (c && (c.minimum != null || c.min != null)) ? (c.minimum != null ? c.minimum : c.min) : 0;
    var maxVal = (c && (c.maximum != null || c.max != null)) ? (c.maximum != null ? c.maximum : c.max) : 99;
    var minNum = parseInt(minVal, 10);
    var maxNum = parseInt(maxVal, 10);
    return { min: isNaN(minNum) ? 0 : minNum, max: isNaN(maxNum) ? 99 : maxNum };
  }
  function createSideCatBlock(cat, index) {
    var catName = (cat && cat.category_name != null) ? String(cat.category_name) : '';
    var displayName = (cat && cat.display_name != null) ? String(cat.display_name) : '';
    var minMax = getSideCatMinMax(cat);
    var min = minMax.min;
    var max = minMax.max;
    var items = (cat && Array.isArray(cat.items)) ? cat.items : [];
    var block = document.createElement('div');
    block.className = 'side-cat-block';
    block.setAttribute('data-cat-index', String(index));
    var header = '<div class="side-cat-header">' +
      '<input type="text" class="dashboard-edit-input side-cat-name" placeholder="category_name (e.g. rolls)" value="' + (catName.replace(/"/g, '&quot;')) + '">' +
      '<input type="text" class="dashboard-edit-input side-cat-display-name" placeholder="display_name (e.g. Choose Your Rolls)" value="' + (displayName.replace(/"/g, '&quot;')) + '">' +
      '<div class="side-cat-min-max-group">' +
      '<span class="side-cat-min-max-wrap"><label class="side-cat-min-max-label">Min</label><input type="number" class="dashboard-edit-input side-cat-min" placeholder="min" min="0" value="' + String(min) + '"></span>' +
      '<span class="side-cat-min-max-wrap"><label class="side-cat-min-max-label">Max</label><input type="number" class="dashboard-edit-input side-cat-max" placeholder="max" min="0" value="' + String(max) + '"></span>' +
      '</div>' +
      '<button type="button" class="dashboard-btn dashboard-btn-remove-cat" aria-label="Remove category"><i class="fa fa-trash-o" aria-hidden="true"></i></button></div>' +
      '<div class="side-cat-items"></div>' +
      '<button type="button" class="dashboard-btn dashboard-btn-secondary dashboard-btn-add-item">Add item</button>';
    block.innerHTML = header;
    var itemsEl = block.querySelector('.side-cat-items');
    items.forEach(function(it) { itemsEl.appendChild(createSideCatItemRow(it)); });
    block.querySelector('.dashboard-btn-remove-cat').addEventListener('click', function() { block.remove(); });
    block.querySelector('.dashboard-btn-add-item').addEventListener('click', function() {
      itemsEl.appendChild(createSideCatItemRow({ name: '', price: 0 }));
    });
    return block;
  }
  function renderSideCategoriesUI(container, cats) {
    if (!container) return;
    container.innerHTML = '';
    (cats || []).forEach(function(cat, i) {
      container.appendChild(createSideCatBlock(cat, i));
    });
  }
  function getSideCategoriesFromUI(container) {
    if (!container) return [];
    var blocks = container.querySelectorAll('.side-cat-block');
    var out = [];
    blocks.forEach(function(block) {
      var nameInp = block.querySelector('.side-cat-name');
      var displayInp = block.querySelector('.side-cat-display-name');
      var minInp = block.querySelector('.side-cat-min');
      var maxInp = block.querySelector('.side-cat-max');
      var category_name = nameInp ? (nameInp.value || '').trim() : '';
      if (!category_name) return;
      var display_name = displayInp ? (displayInp.value || '').trim() : category_name;
      var min = minInp && minInp.value !== '' ? parseInt(minInp.value, 10) : 0;
      var max = maxInp && maxInp.value !== '' ? parseInt(maxInp.value, 10) : 99;
      if (isNaN(min)) min = 0;
      if (isNaN(max)) max = 99;
      var items = [];
      block.querySelectorAll('.side-cat-item').forEach(function(row) {
        var nInp = row.querySelector('.side-item-name');
        var pInp = row.querySelector('.side-item-price');
        var name = nInp ? (nInp.value || '').trim() : '';
        if (!name) return;
        var price = pInp && pInp.value !== '' ? parseFloat(pInp.value) : 0;
        if (isNaN(price)) price = 0;
        items.push({ name: name, price: price });
      });
      out.push({ category_name: category_name, display_name: display_name, items: items, config: { minimum: min, maximum: max } });
    });
    return out;
  }
  function hoursRenderImagesPreview(container, paths) {
    if (!container) return;
    container.innerHTML = '';
    (paths || []).forEach(function(path, i) {
      var p = (path || '').trim();
      if (!p) return;
      var slide = document.createElement('div');
      slide.className = 'dashboard-edit-slide-item';
      var img = document.createElement('img');
      img.src = resolveMenuItemImageSrcForPreview(p);
      img.alt = 'Image ' + (i + 1);
      img.loading = 'lazy';
      img.onerror = function() { this.style.display = 'none'; };
      var cap = document.createElement('span');
      cap.className = 'dashboard-edit-slide-cap';
      cap.textContent = (i + 1) + '. ' + p;
      slide.appendChild(img);
      slide.appendChild(cap);
      container.appendChild(slide);
    });
  }

  function renderSlideshowAsidePreview(container, paths) {
    if (!container) return;
    container.innerHTML = '';
    (paths || []).forEach(function(path, i) {
      var p = (path || '').trim();
      if (!p) return;
      var slide = document.createElement('div');
      slide.className = 'dashboard-edit-slide-item';
      var img = document.createElement('img');
      img.src = resolveMenuItemImageSrcForPreview(p);
      img.alt = 'Slide ' + (i + 1);
      img.loading = 'lazy';
      img.onerror = function() { this.style.display = 'none'; };
      var cap = document.createElement('span');
      cap.className = 'dashboard-edit-slide-cap';
      cap.textContent = (i + 1) + '. ' + p;
      slide.appendChild(img);
      slide.appendChild(cap);
      container.appendChild(slide);
    });
  }

  function gatherMenuItemImagePathsFromRows() {
    if (!menuItemImagesContainer) return [];
    var out = [];
    menuItemImagesContainer.querySelectorAll('.dashboard-menu-item-image-path').forEach(function(inp) {
      out.push(inp.value);
    });
    return out;
  }

  function resolveMenuItemImageSrcForPreview(path) {
    var p = (path || '').trim();
    if (!p) return '';
    if (window.TtmsThumbor && typeof window.TtmsThumbor.menuImageSrc === 'function') {
      return window.TtmsThumbor.menuImageSrc(p, 'card');
    }
    if (window.DashboardImageUtils && typeof window.DashboardImageUtils.resolvePreviewSrc === 'function') {
      return window.DashboardImageUtils.resolvePreviewSrc(p, {
        cmsServiceUrl: CMS_SERVICE_URL,
        clientId: CMS_CLIENT_ID,
        width: 320,
        height: 320,
      });
    }
    if (p.indexOf('draft-assets/') === 0) {
      var base = CMS_SERVICE_URL.replace(/\/+$/, '');
      var name = p.replace(/^draft-assets\//, '');
      return base + '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/preview/draft-assets/' + encodeURIComponent(name);
    }
    if (p.indexOf('http://') === 0 || p.indexOf('https://') === 0) return p;
    return p.indexOf('/') === 0 ? p : '/' + p;
  }

  window.DashboardEditImagePreview = window.DashboardEditImagePreview || {};
  window.DashboardEditImagePreview.resolve = resolveMenuItemImageSrcForPreview;

  function setSectionIconUploadStatus(text, isError) {
    if (!sectionIconUploadStatusEl) return;
    sectionIconUploadStatusEl.textContent = text || '';
    sectionIconUploadStatusEl.classList.toggle('dashboard-menu-item-images-upload-status--error', !!isError);
  }

  function setSectionSecondaryImageUploadStatus(text, isError) {
    if (!sectionSecondaryImageUploadStatusEl) return;
    sectionSecondaryImageUploadStatusEl.textContent = text || '';
    sectionSecondaryImageUploadStatusEl.classList.toggle('dashboard-menu-item-images-upload-status--error', !!isError);
  }

  function rememberDraftAssetPath(path) {
    var p = (path || '').trim();
    if (!p || p.indexOf('draft-assets/') !== 0) return;
    if (!draftAssetsListCache) draftAssetsListCache = [];
    if (draftAssetsListCache.indexOf(p) < 0) draftAssetsListCache.push(p);
    draftAssetsListCache.sort();
  }

  function cmsJsonAuthHeaders() {
    var headers = { Accept: 'application/json' };
    var token =
      typeof AuthClient !== 'undefined' && AuthClient.getAccessToken
        ? AuthClient.getAccessToken()
        : typeof localStorage !== 'undefined'
          ? localStorage.getItem('ttmenus_access_token')
          : null;
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  function fetchSiteImagePathsFromApi() {
    if (siteImagesListCache) return Promise.resolve(siteImagesListCache);
    var url =
      CMS_SERVICE_URL.replace(/\/+$/, '') +
      '/api/clients/' +
      encodeURIComponent(CMS_CLIENT_ID) +
      '/site-images';
    return fetch(url, { method: 'GET', credentials: 'include', headers: cmsJsonAuthHeaders() })
      .then(function (res) {
        return res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status));
      })
      .then(function (data) {
        siteImagesListCache = data && data.paths && Array.isArray(data.paths) ? data.paths : [];
        return siteImagesListCache;
      })
      .catch(function () {
        siteImagesListCache = [];
        return siteImagesListCache;
      });
  }

  function fetchDraftAssetPathsFromApi() {
    if (draftAssetsListCache) return Promise.resolve(draftAssetsListCache);
    var url =
      CMS_SERVICE_URL.replace(/\/+$/, '') +
      '/api/clients/' +
      encodeURIComponent(CMS_CLIENT_ID) +
      '/content/draft-assets';
    return fetch(url, { method: 'GET', credentials: 'include', headers: cmsJsonAuthHeaders() })
      .then(function (res) {
        return res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status));
      })
      .then(function (data) {
        draftAssetsListCache = data && data.paths && Array.isArray(data.paths) ? data.paths : [];
        return draftAssetsListCache;
      })
      .catch(function () {
        draftAssetsListCache = [];
        return draftAssetsListCache;
      });
  }

  function cmsAuthHeadersForImageThumb() {
    var h = {};
    var token =
      typeof AuthClient !== 'undefined' && AuthClient.getAccessToken
        ? AuthClient.getAccessToken()
        : typeof localStorage !== 'undefined'
          ? localStorage.getItem('ttmenus_access_token')
          : null;
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  function bindDashboardImageThumb(img, thumbWrap, path, previewFile, state) {
    state = state || { seq: 0, blobUrl: null };
    var p = (path || '').trim();
    function revokeBlob() {
      if (state.blobUrl) {
        try {
          URL.revokeObjectURL(state.blobUrl);
        } catch (e) {}
        state.blobUrl = null;
      }
    }
    if (!p) {
      state.seq++;
      revokeBlob();
      img.removeAttribute('src');
      img.style.display = 'none';
      img.style.opacity = '1';
      if (thumbWrap) thumbWrap.classList.add('dashboard-menu-item-image-thumb-wrap--empty');
      return state;
    }
    img.style.display = '';
    if (thumbWrap) thumbWrap.classList.remove('dashboard-menu-item-image-thumb-wrap--empty');
    revokeBlob();
    state.seq++;
    var seq = state.seq;
    function bindLoadHandlers() {
      img.onload = function() {
        if (seq !== state.seq) return;
        img.style.opacity = '1';
      };
      img.onerror = function() {
        if (seq !== state.seq) return;
        img.style.opacity = '0.35';
      };
    }
    if (previewFile && previewFile instanceof File) {
      state.blobUrl = URL.createObjectURL(previewFile);
      bindLoadHandlers();
      img.style.opacity = '1';
      img.src = state.blobUrl;
      return state;
    }
    if (p.indexOf('draft-assets/') === 0) {
      var fetchUrl = resolveMenuItemImageSrcForPreview(p);
      bindLoadHandlers();
      fetch(fetchUrl, { credentials: 'include', headers: cmsAuthHeadersForImageThumb() })
        .then(function(res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.blob();
        })
        .then(function(blob) {
          if (seq !== state.seq) return;
          state.blobUrl = URL.createObjectURL(blob);
          img.src = state.blobUrl;
        })
        .catch(function() {
          if (seq !== state.seq) return;
          img.src = fetchUrl;
        });
      return state;
    }
    bindLoadHandlers();
    img.style.opacity = '1';
    img.src = resolveMenuItemImageSrcForPreview(p);
    return state;
  }

  function setMenuItemImagesUploadStatus(msg, isError) {
    if (!menuItemImagesUploadStatusEl) return;
    menuItemImagesUploadStatusEl.textContent = msg || '';
    var has = !!msg;
    menuItemImagesUploadStatusEl.classList.toggle('dashboard-menu-item-images-upload-status--active', has);
    menuItemImagesUploadStatusEl.classList.toggle('dashboard-menu-item-images-upload-status--error', has && !!isError);
  }

  function setMenuItemImageUploadUiLocked(locked) {
    if (btnAddMenuItemImage) btnAddMenuItemImage.disabled = !!locked;
    if (btnBrowseSiteMenuItemImages) btnBrowseSiteMenuItemImages.disabled = !!locked;
    if (btnAddMenuItemImageFile) btnAddMenuItemImageFile.disabled = !!locked;
    if (!menuItemImagesContainer) return;
    menuItemImagesContainer.querySelectorAll('.dashboard-menu-item-image-replace, .dashboard-menu-item-image-remove, .dashboard-menu-item-image-browse-site').forEach(function(b) {
      b.disabled = !!locked;
    });
    menuItemImagesContainer.querySelectorAll('.dashboard-menu-item-image-drag').forEach(function(h) {
      if (locked) {
        h.setAttribute('draggable', 'false');
        h.style.pointerEvents = 'none';
        h.style.opacity = '0.45';
      } else {
        h.setAttribute('draggable', 'true');
        h.style.pointerEvents = '';
        h.style.opacity = '';
      }
    });
  }

  function setSlideshowImagesUploadStatus(msg, isError) {
    if (!slideshowImagesUploadStatusEl) return;
    slideshowImagesUploadStatusEl.textContent = msg || '';
    var has = !!msg;
    slideshowImagesUploadStatusEl.classList.toggle('dashboard-menu-item-images-upload-status--active', has);
    slideshowImagesUploadStatusEl.classList.toggle('dashboard-menu-item-images-upload-status--error', has && !!isError);
  }

  function setSlideshowImageUploadUiLocked(locked) {
    if (btnAddSlideshowImage) btnAddSlideshowImage.disabled = !!locked;
    if (btnBrowseSiteSlideshowImages) btnBrowseSiteSlideshowImages.disabled = !!locked;
    if (btnAddSlideshowImageFile) btnAddSlideshowImageFile.disabled = !!locked;
    if (!slideshowImagesContainer) return;
    slideshowImagesContainer.querySelectorAll('.dashboard-menu-item-image-replace, .dashboard-menu-item-image-remove, .dashboard-menu-item-image-browse-site').forEach(function(b) {
      b.disabled = !!locked;
    });
    slideshowImagesContainer.querySelectorAll('.dashboard-menu-item-image-drag').forEach(function(h) {
      if (locked) {
        h.setAttribute('draggable', 'false');
        h.style.pointerEvents = 'none';
        h.style.opacity = '0.45';
      } else {
        h.setAttribute('draggable', 'true');
        h.style.pointerEvents = '';
        h.style.opacity = '';
      }
    });
  }

  function setPromoImagesUploadStatus(msg, isError) {
    if (!promoImagesUploadStatusEl) return;
    promoImagesUploadStatusEl.textContent = msg || '';
    var has = !!msg;
    promoImagesUploadStatusEl.classList.toggle('dashboard-menu-item-images-upload-status--active', has);
    promoImagesUploadStatusEl.classList.toggle('dashboard-menu-item-images-upload-status--error', has && !!isError);
  }

  function setPromoImageUploadUiLocked(locked) {
    if (btnAddPromoImage) btnAddPromoImage.disabled = !!locked;
    if (btnPromoBrowseSiteImages) btnPromoBrowseSiteImages.disabled = !!locked;
    if (btnAddPromoImageFile) btnAddPromoImageFile.disabled = !!locked;
    if (!promoImagesContainer) return;
    promoImagesContainer.querySelectorAll('.dashboard-menu-item-image-replace, .dashboard-menu-item-image-remove, .dashboard-menu-item-image-browse-site').forEach(function(b) {
      b.disabled = !!locked;
    });
    promoImagesContainer.querySelectorAll('.dashboard-menu-item-image-drag').forEach(function(h) {
      if (locked) {
        h.setAttribute('draggable', 'false');
        h.style.pointerEvents = 'none';
        h.style.opacity = '0.45';
      } else {
        h.setAttribute('draggable', 'true');
        h.style.pointerEvents = '';
        h.style.opacity = '';
      }
    });
  }

  function setHeroImageUploadStatus(msg, isError) {
    if (!heroImageUploadStatusEl) return;
    heroImageUploadStatusEl.textContent = msg || '';
    var has = !!msg;
    heroImageUploadStatusEl.classList.toggle('dashboard-menu-item-images-upload-status--active', has);
    heroImageUploadStatusEl.classList.toggle('dashboard-menu-item-images-upload-status--error', has && !!isError);
  }

  function setHeroImageUploadUiLocked(locked) {
    if (btnHeroImageReplace) btnHeroImageReplace.disabled = !!locked;
    if (btnHeroImageFile) btnHeroImageFile.disabled = !!locked;
    if (btnHeroImageBrowseSite) btnHeroImageBrowseSite.disabled = !!locked;
    if (btnHeroImageRemove) btnHeroImageRemove.disabled = !!locked;
  }

  function revokeHeroImageBlob() {
    if (heroImageRowBlobUrl) {
      try { URL.revokeObjectURL(heroImageRowBlobUrl); } catch (e) {}
      heroImageRowBlobUrl = null;
    }
  }

  function syncHeroPathInputVisibility() {
    if (!inputHomeHeroImage) return;
    var p = (inputHomeHeroImage.value || '').trim();
    var isDraft = p.indexOf('draft-assets/') === 0;
    if (dashboardHeroImageDraftHint) dashboardHeroImageDraftHint.classList.toggle('hidden', !isDraft);
  }

  function updateHeroImageThumbDisplay(path, previewFile) {
    if (!heroImageThumbImg || !dashboardHeroImageThumbWrap) return;
    var p = (path || '').trim();
    function cmsAuthHeadersForHero() {
      var h = {};
      var token = (typeof AuthClient !== 'undefined' && AuthClient.getAccessToken) ? AuthClient.getAccessToken() : (typeof localStorage !== 'undefined' ? localStorage.getItem('ttmenus_access_token') : null);
      if (token) h['Authorization'] = 'Bearer ' + token;
      return h;
    }
    function bindLoadHandlers() {
      heroImageThumbImg.onload = function() {
        heroImageThumbImg.style.opacity = '1';
      };
      heroImageThumbImg.onerror = function() {
        heroImageThumbImg.style.opacity = '0.35';
      };
    }
    if (!p) {
      heroImageThumbLoadSeq++;
      revokeHeroImageBlob();
      heroImageThumbImg.removeAttribute('src');
      heroImageThumbImg.style.display = 'none';
      dashboardHeroImageThumbWrap.classList.add('dashboard-menu-item-image-thumb-wrap--empty');
      return;
    }
    heroImageThumbImg.style.display = '';
    dashboardHeroImageThumbWrap.classList.remove('dashboard-menu-item-image-thumb-wrap--empty');
    revokeHeroImageBlob();
    heroImageThumbLoadSeq++;
    var seq = heroImageThumbLoadSeq;
    if (previewFile && previewFile instanceof File) {
      heroImageRowBlobUrl = URL.createObjectURL(previewFile);
      bindLoadHandlers();
      heroImageThumbImg.style.opacity = '1';
      heroImageThumbImg.src = heroImageRowBlobUrl;
      return;
    }
    if (p.indexOf('draft-assets/') === 0) {
      var fetchUrl = resolveMenuItemImageSrcForPreview(p);
      bindLoadHandlers();
      fetch(fetchUrl, { credentials: 'include', headers: cmsAuthHeadersForHero() })
        .then(function(res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.blob();
        })
        .then(function(blob) {
          if (seq !== heroImageThumbLoadSeq) return;
          heroImageRowBlobUrl = URL.createObjectURL(blob);
          heroImageThumbImg.src = heroImageRowBlobUrl;
        })
        .catch(function() {
          if (seq !== heroImageThumbLoadSeq) return;
          heroImageThumbImg.src = fetchUrl;
        });
      return;
    }
    bindLoadHandlers();
    heroImageThumbImg.style.opacity = '1';
    heroImageThumbImg.src = resolveMenuItemImageSrcForPreview(p);
  }

  function uploadMenuItemDraftImage(file, inp, updateThumbFn, opts) {
    opts = opts || {};
    var rowEl = opts.rowEl || null;
    var useHeroStatus = !!opts.useHeroStatus;
    var useSlideshowStatus = !!opts.useSlideshowStatus;
    var usePromoStatus = !!opts.usePromoStatus;
    var useSectionIconStatus = !!opts.useSectionIconStatus;
    var useSectionSecondaryImageStatus = !!opts.useSectionSecondaryImageStatus;
    var statusLabel = opts.statusLabel || 'Uploading image…';
    var url = CMS_SERVICE_URL.replace(/\/+$/, '') + '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/draft-assets';
    var fd = new FormData();
    fd.append('file', file);
    var headers = {};
    var token = (typeof AuthClient !== 'undefined' && AuthClient.getAccessToken) ? AuthClient.getAccessToken() : (typeof localStorage !== 'undefined' ? localStorage.getItem('ttmenus_access_token') : null);
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (useHeroStatus) {
      setHeroImageUploadStatus(statusLabel, false);
    } else if (useSlideshowStatus) {
      setSlideshowImagesUploadStatus(statusLabel, false);
    } else if (usePromoStatus) {
      setPromoImagesUploadStatus(statusLabel, false);
    } else if (useSectionIconStatus) {
      setSectionIconUploadStatus(statusLabel, false);
    } else if (useSectionSecondaryImageStatus) {
      setSectionSecondaryImageUploadStatus(statusLabel, false);
    } else {
      setMenuItemImagesUploadStatus(statusLabel, false);
    }
    setEditStatus(statusLabel);
    if (useHeroStatus) {
      setHeroImageUploadUiLocked(true);
    } else if (useSlideshowStatus) {
      setSlideshowImageUploadUiLocked(true);
    } else if (usePromoStatus) {
      setPromoImageUploadUiLocked(true);
    } else {
      setMenuItemImageUploadUiLocked(true);
    }
    if (rowEl) rowEl.classList.add('dashboard-menu-item-image-row--uploading');
    cmsLogJson('draft-assets POST →', url, { fileName: file && file.name, size: file && file.size, type: file && file.type });
    return fetch(url, { method: 'POST', credentials: 'include', headers: headers, body: fd })
      .then(function(res) {
        if (!res.ok) {
          return res.text().then(function(t) {
            cmsLogJson('draft-assets POST ✗', url, { status: res.status, body: t && t.length > 2000 ? t.slice(0, 2000) + '…' : t });
            throw new Error(t || ('HTTP ' + res.status));
          });
        }
        return res.json();
      })
      .then(function(data) {
        cmsLogJson('draft-assets POST ←', url, data);
        var path = data.path != null ? data.path : data.Path;
        if (!path) throw new Error('No path in upload response');
        rememberDraftAssetPath(path);
        if (inp) inp.value = path;
        if (typeof updateThumbFn === 'function') updateThumbFn(path, file);
        if (inp && inp !== inputHomeHeroImage) {
          if (promoImagesContainer && promoImagesContainer.contains(inp)) syncPromoImagesTextareaFromRows();
          else if (slideshowImagesContainer && slideshowImagesContainer.contains(inp)) syncSlideshowImagesTextareaFromRows();
          else syncMenuItemImagesTextareaFromRows();
        }
        if (inp === inputHomeHeroImage && typeof syncHeroPathInputVisibility === 'function') syncHeroPathInputVisibility();
        if (useHeroStatus) {
          setHeroImageUploadStatus('Image uploaded.', false);
        } else if (useSlideshowStatus) {
          setSlideshowImagesUploadStatus('Image uploaded.', false);
        } else if (usePromoStatus) {
          setPromoImagesUploadStatus('Image uploaded.', false);
        } else if (useSectionIconStatus) {
          setSectionIconUploadStatus('Image uploaded.', false);
        } else if (useSectionSecondaryImageStatus) {
          setSectionSecondaryImageUploadStatus('Image uploaded.', false);
        } else {
          setMenuItemImagesUploadStatus('Image uploaded.', false);
        }
        setEditStatus('Unsaved changes (not yet published)');
        editFormDirty = true;
        setTimeout(function() {
          if (useHeroStatus) setHeroImageUploadStatus('', false);
          else if (useSlideshowStatus) setSlideshowImagesUploadStatus('', false);
          else if (usePromoStatus) setPromoImagesUploadStatus('', false);
          else if (useSectionIconStatus) setSectionIconUploadStatus('', false);
          else if (useSectionSecondaryImageStatus) setSectionSecondaryImageUploadStatus('', false);
          else setMenuItemImagesUploadStatus('', false);
        }, 2200);
      })
      .catch(function(err) {
        console.warn('Draft image upload failed', err);
        var errMsg = (err && err.message) ? String(err.message) : String(err);
        if (errMsg.length > 120) errMsg = errMsg.slice(0, 117) + '…';
        if (useHeroStatus) {
          setHeroImageUploadStatus('Upload failed: ' + errMsg, true);
        } else if (useSlideshowStatus) {
          setSlideshowImagesUploadStatus('Upload failed: ' + errMsg, true);
        } else if (usePromoStatus) {
          setPromoImagesUploadStatus('Upload failed: ' + errMsg, true);
        } else if (useSectionIconStatus) {
          setSectionIconUploadStatus('Upload failed: ' + errMsg, true);
        } else if (useSectionSecondaryImageStatus) {
          setSectionSecondaryImageUploadStatus('Upload failed: ' + errMsg, true);
        } else {
          setMenuItemImagesUploadStatus('Upload failed: ' + errMsg, true);
        }
        setEditStatus('Image upload failed');
        alert('Image upload failed: ' + ((err && err.message) ? String(err.message) : String(err)));
        setTimeout(function() {
          if (useHeroStatus) setHeroImageUploadStatus('', false);
          else if (useSlideshowStatus) setSlideshowImagesUploadStatus('', false);
          else if (usePromoStatus) setPromoImagesUploadStatus('', false);
          else if (useSectionIconStatus) setSectionIconUploadStatus('', false);
          else if (useSectionSecondaryImageStatus) setSectionSecondaryImageUploadStatus('', false);
          else setMenuItemImagesUploadStatus('', false);
        }, 6000);
      })
      .then(function() {
        if (useHeroStatus) {
          setHeroImageUploadUiLocked(false);
        } else if (useSlideshowStatus) {
          setSlideshowImageUploadUiLocked(false);
        } else if (usePromoStatus) {
          setPromoImageUploadUiLocked(false);
        } else {
          setMenuItemImageUploadUiLocked(false);
        }
        if (rowEl) rowEl.classList.remove('dashboard-menu-item-image-row--uploading');
      });
  }

  function syncMenuItemImagesTextareaFromRows(silent) {
    if (!inputMenuItemImages || !menuItemImagesContainer) return;
    var lines = gatherMenuItemImagePathsFromRows().map(function(s) { return (s || '').trim(); });
    inputMenuItemImages.value = lines.join('\n');
    if (!silent) {
      editFormDirty = true;
      setEditStatus('Unsaved changes (not yet published)');
    }
  }

  function reorderMenuItemImagePaths(paths, from, to) {
    if (from === to || from < 0 || to < 0 || from >= paths.length || to >= paths.length) return paths.slice();
    var next = paths.slice();
    var item = next.splice(from, 1)[0];
    next.splice(to, 0, item);
    return next;
  }

  function renderMenuItemImagesUI(paths, silentSync, opts) {
    opts = opts || {};
    var lastPreviewFile = opts.lastPreviewFile;
    if (!menuItemImagesContainer) return;
    var list = Array.isArray(paths) ? paths.slice() : [];
    menuItemImagesContainer.innerHTML = '';
    if (!list.length) {
      var empty = document.createElement('p');
      empty.className = 'dashboard-menu-item-images-empty';
      empty.textContent = 'No images yet. Use Add image to choose a file.';
      menuItemImagesContainer.appendChild(empty);
      if (inputMenuItemImages) inputMenuItemImages.value = '';
      return;
    }
    list.forEach(function(path, idx) {
      var pf = (lastPreviewFile && idx === list.length - 1) ? lastPreviewFile : undefined;
      menuItemImagesContainer.appendChild(createMenuItemImageRow(path, pf));
    });
    syncMenuItemImagesTextareaFromRows(!!silentSync);
  }

  function createMenuItemImageRow(path, previewFile) {
    var row = document.createElement('div');
    row.className = 'dashboard-menu-item-image-row';
    row.setAttribute('role', 'listitem');

    var handle = document.createElement('span');
    handle.className = 'dashboard-menu-item-image-drag';
    handle.setAttribute('aria-label', 'Drag to reorder');
    handle.setAttribute('title', 'Drag to reorder');
    handle.setAttribute('draggable', 'true');
    handle.innerHTML = '<i class="fa fa-bars" aria-hidden="true"></i>';

    var thumbWrap = document.createElement('div');
    thumbWrap.className = 'dashboard-menu-item-image-thumb-wrap';
    var img = document.createElement('img');
    img.className = 'dashboard-menu-item-image-thumb';
    img.alt = '';
    img.loading = 'lazy';
    var rowBlobUrl = null;
    var thumbLoadSeq = 0;
    function revokeRowBlob() {
      if (rowBlobUrl) {
        try { URL.revokeObjectURL(rowBlobUrl); } catch (e) {}
        rowBlobUrl = null;
      }
    }
    function cmsAuthHeadersForThumb() {
      var h = {};
      var token = (typeof AuthClient !== 'undefined' && AuthClient.getAccessToken) ? AuthClient.getAccessToken() : (typeof localStorage !== 'undefined' ? localStorage.getItem('ttmenus_access_token') : null);
      if (token) h['Authorization'] = 'Bearer ' + token;
      return h;
    }
    function updateThumbDisplay(val, previewFile) {
      var p = (val || '').trim();
      if (!p) {
        thumbLoadSeq++;
        revokeRowBlob();
        img.removeAttribute('src');
        img.style.display = 'none';
        img.style.opacity = '1';
        thumbWrap.classList.add('dashboard-menu-item-image-thumb-wrap--empty');
        return;
      }
      img.style.display = '';
      thumbWrap.classList.remove('dashboard-menu-item-image-thumb-wrap--empty');
      revokeRowBlob();
      thumbLoadSeq++;
      var seq = thumbLoadSeq;
      function bindLoadHandlers() {
        img.onload = function() {
          if (seq !== thumbLoadSeq) return;
          img.style.opacity = '1';
        };
        img.onerror = function() {
          if (seq !== thumbLoadSeq) return;
          img.style.opacity = '0.35';
        };
      }
      if (previewFile && previewFile instanceof File) {
        rowBlobUrl = URL.createObjectURL(previewFile);
        bindLoadHandlers();
        img.style.opacity = '1';
        img.src = rowBlobUrl;
        return;
      }
      if (p.indexOf('draft-assets/') === 0) {
        var fetchUrl = resolveMenuItemImageSrcForPreview(p);
        bindLoadHandlers();
        fetch(fetchUrl, { credentials: 'include', headers: cmsAuthHeadersForThumb() })
          .then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.blob();
          })
          .then(function(blob) {
            if (seq !== thumbLoadSeq) return;
            rowBlobUrl = URL.createObjectURL(blob);
            img.src = rowBlobUrl;
          })
          .catch(function() {
            if (seq !== thumbLoadSeq) return;
            img.src = fetchUrl;
          });
        return;
      }
      bindLoadHandlers();
      img.style.opacity = '1';
      img.src = resolveMenuItemImageSrcForPreview(p);
    }
    thumbWrap.appendChild(img);
    var thumbLoading = document.createElement('span');
    thumbLoading.className = 'dashboard-menu-item-image-thumb-loading';
    thumbLoading.setAttribute('aria-hidden', 'true');
    thumbLoading.innerHTML = '<i class="fa fa-spinner fa-spin" aria-hidden="true"></i><span class="dashboard-menu-item-image-thumb-loading-label">Uploading…</span>';
    thumbWrap.appendChild(thumbLoading);

    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'dashboard-edit-input dashboard-menu-item-image-path hidden';
    inp.setAttribute('tabindex', '-1');
    inp.setAttribute('aria-hidden', 'true');
    inp.value = path || '';
    var inputThumbTimer = null;
    inp.addEventListener('input', function() {
      clearTimeout(inputThumbTimer);
      inputThumbTimer = setTimeout(function() {
        updateThumbDisplay(inp.value, null);
      }, 350);
      syncMenuItemImagesTextareaFromRows();
    });
    updateThumbDisplay(path, previewFile);

    var fileInp = document.createElement('input');
    fileInp.type = 'file';
    fileInp.className = 'hidden dashboard-menu-item-image-file';
    fileInp.setAttribute('accept', 'image/jpeg,image/png,image/webp,image/gif');
    fileInp.setAttribute('tabindex', '-1');
    fileInp.setAttribute('aria-hidden', 'true');
    fileInp.addEventListener('change', function() {
      var f = fileInp.files && fileInp.files[0];
      fileInp.value = '';
      if (!f) return;
      uploadMenuItemDraftImage(f, inp, function(uploadedPath, file) {
        clearTimeout(inputThumbTimer);
        updateThumbDisplay(uploadedPath, file);
      });
    });

    var replaceBtn = document.createElement('button');
    replaceBtn.type = 'button';
    replaceBtn.className = 'dashboard-btn dashboard-btn-secondary dashboard-menu-item-image-replace';
    replaceBtn.setAttribute('aria-label', 'Replace with another file');
    replaceBtn.setAttribute('title', 'Replace with another file');
    replaceBtn.innerHTML = '<i class="fa fa-cloud-upload" aria-hidden="true"></i>';
    replaceBtn.addEventListener('click', function() { fileInp.click(); });

    var browseSiteBtn = document.createElement('button');
    browseSiteBtn.type = 'button';
    browseSiteBtn.className = 'dashboard-btn dashboard-btn-secondary dashboard-menu-item-image-browse-site';
    browseSiteBtn.setAttribute('aria-label', 'Browse site images');
    browseSiteBtn.setAttribute('title', 'Browse site images');
    browseSiteBtn.innerHTML = '<i class="fa fa-folder-open" aria-hidden="true"></i>';
    browseSiteBtn.addEventListener('click', function() {
      openSiteImagePickerModal(function(rel) {
        inp.value = rel;
        clearTimeout(inputThumbTimer);
        updateThumbDisplay(rel, null);
        syncMenuItemImagesTextareaFromRows();
        editFormDirty = true;
        setEditStatus('Unsaved changes (not yet published)');
      });
    });

    var pathCol = document.createElement('div');
    pathCol.className = 'dashboard-menu-item-image-path-col';
    var pathActions = document.createElement('div');
    pathActions.className = 'dashboard-menu-item-image-path-actions';
    pathActions.appendChild(replaceBtn);
    pathActions.appendChild(browseSiteBtn);
    pathActions.appendChild(fileInp);
    pathCol.appendChild(inp);
    pathCol.appendChild(pathActions);

    var rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'dashboard-btn dashboard-btn-secondary dashboard-menu-item-image-remove';
    rm.setAttribute('aria-label', 'Remove image');
    rm.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
    rm.addEventListener('click', function() {
      var paths = gatherMenuItemImagePathsFromRows();
      var rows = menuItemImagesContainer.querySelectorAll('.dashboard-menu-item-image-row');
      var i = Array.prototype.indexOf.call(rows, row);
      if (i >= 0) paths.splice(i, 1);
      renderMenuItemImagesUI(paths);
    });

    handle.addEventListener('dragstart', function(e) {
      var rows = menuItemImagesContainer.querySelectorAll('.dashboard-menu-item-image-row');
      var idx = Array.prototype.indexOf.call(rows, row);
      e.dataTransfer.setData('text/plain', String(idx));
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dashboard-menu-item-image-row--dragging');
    });
    handle.addEventListener('dragend', function() {
      row.classList.remove('dashboard-menu-item-image-row--dragging');
      menuItemImagesContainer.querySelectorAll('.dashboard-menu-item-image-row').forEach(function(r) {
        r.classList.remove('dashboard-menu-item-image-row--over');
      });
    });

    function onDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('dashboard-menu-item-image-row--over');
    }
    function onDragLeave(e) {
      if (!row.contains(e.relatedTarget)) row.classList.remove('dashboard-menu-item-image-row--over');
    }
    function onDrop(e) {
      e.preventDefault();
      row.classList.remove('dashboard-menu-item-image-row--over');
      var from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      var rows = menuItemImagesContainer.querySelectorAll('.dashboard-menu-item-image-row');
      var to = Array.prototype.indexOf.call(rows, row);
      if (isNaN(from) || to < 0) return;
      var paths = gatherMenuItemImagePathsFromRows();
      var reordered = reorderMenuItemImagePaths(paths, from, to);
      renderMenuItemImagesUI(reordered);
    }
    [row, handle, pathCol, inp, thumbWrap].forEach(function(el) {
      el.addEventListener('dragover', onDragOver);
      el.addEventListener('dragleave', onDragLeave);
      el.addEventListener('drop', onDrop);
    });

    row.appendChild(handle);
    row.appendChild(thumbWrap);
    row.appendChild(pathCol);
    row.appendChild(rm);
    return row;
  }

  function gatherSlideshowImagePathsFromRows() {
    if (!slideshowImagesContainer) return [];
    var out = [];
    slideshowImagesContainer.querySelectorAll('.dashboard-menu-item-image-path').forEach(function(inp) {
      out.push(inp.value);
    });
    return out;
  }

  function syncSlideshowImagesTextareaFromRows(silent) {
    if (!inputSlideshowImages || !slideshowImagesContainer) return;
    var lines = gatherSlideshowImagePathsFromRows().map(function(s) { return (s || '').trim(); });
    inputSlideshowImages.value = lines.join('\n');
    if (slideshowViewEl) renderSlideshowAsidePreview(slideshowViewEl, lines.filter(Boolean));
    if (!silent) {
      editFormDirty = true;
      setEditStatus('Unsaved changes (not yet published)');
    }
  }

  function renderSlideshowImagesUI(paths, silentSync, opts) {
    opts = opts || {};
    var lastPreviewFile = opts.lastPreviewFile;
    if (!slideshowImagesContainer) return;
    var list = Array.isArray(paths) ? paths.slice() : [];
    slideshowImagesContainer.innerHTML = '';
    if (!list.length) {
      var empty = document.createElement('p');
      empty.className = 'dashboard-menu-item-images-empty';
      empty.textContent = 'No images yet. Use Add image to choose a file.';
      slideshowImagesContainer.appendChild(empty);
      if (inputSlideshowImages) inputSlideshowImages.value = '';
      if (slideshowViewEl) renderSlideshowAsidePreview(slideshowViewEl, []);
      return;
    }
    list.forEach(function(path, idx) {
      var pf = (lastPreviewFile && idx === list.length - 1) ? lastPreviewFile : undefined;
      slideshowImagesContainer.appendChild(createSlideshowImageRow(path, pf));
    });
    syncSlideshowImagesTextareaFromRows(!!silentSync);
  }

  function createSlideshowImageRow(path, previewFile) {
    var row = document.createElement('div');
    row.className = 'dashboard-menu-item-image-row';
    row.setAttribute('role', 'listitem');

    var handle = document.createElement('span');
    handle.className = 'dashboard-menu-item-image-drag';
    handle.setAttribute('aria-label', 'Drag to reorder');
    handle.setAttribute('title', 'Drag to reorder');
    handle.setAttribute('draggable', 'true');
    handle.innerHTML = '<i class="fa fa-bars" aria-hidden="true"></i>';

    var thumbWrap = document.createElement('div');
    thumbWrap.className = 'dashboard-menu-item-image-thumb-wrap';
    var img = document.createElement('img');
    img.className = 'dashboard-menu-item-image-thumb';
    img.alt = '';
    img.loading = 'lazy';
    var rowBlobUrl = null;
    var thumbLoadSeq = 0;
    function revokeRowBlob() {
      if (rowBlobUrl) {
        try { URL.revokeObjectURL(rowBlobUrl); } catch (e) {}
        rowBlobUrl = null;
      }
    }
    function cmsAuthHeadersForThumb() {
      var h = {};
      var token = (typeof AuthClient !== 'undefined' && AuthClient.getAccessToken) ? AuthClient.getAccessToken() : (typeof localStorage !== 'undefined' ? localStorage.getItem('ttmenus_access_token') : null);
      if (token) h['Authorization'] = 'Bearer ' + token;
      return h;
    }
    function updateThumbDisplay(val, previewFile) {
      var p = (val || '').trim();
      if (!p) {
        thumbLoadSeq++;
        revokeRowBlob();
        img.removeAttribute('src');
        img.style.display = 'none';
        img.style.opacity = '1';
        thumbWrap.classList.add('dashboard-menu-item-image-thumb-wrap--empty');
        return;
      }
      img.style.display = '';
      thumbWrap.classList.remove('dashboard-menu-item-image-thumb-wrap--empty');
      revokeRowBlob();
      thumbLoadSeq++;
      var seq = thumbLoadSeq;
      function bindLoadHandlers() {
        img.onload = function() {
          if (seq !== thumbLoadSeq) return;
          img.style.opacity = '1';
        };
        img.onerror = function() {
          if (seq !== thumbLoadSeq) return;
          img.style.opacity = '0.35';
        };
      }
      if (previewFile && previewFile instanceof File) {
        rowBlobUrl = URL.createObjectURL(previewFile);
        bindLoadHandlers();
        img.style.opacity = '1';
        img.src = rowBlobUrl;
        return;
      }
      if (p.indexOf('draft-assets/') === 0) {
        var fetchUrl = resolveMenuItemImageSrcForPreview(p);
        bindLoadHandlers();
        fetch(fetchUrl, { credentials: 'include', headers: cmsAuthHeadersForThumb() })
          .then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.blob();
          })
          .then(function(blob) {
            if (seq !== thumbLoadSeq) return;
            rowBlobUrl = URL.createObjectURL(blob);
            img.src = rowBlobUrl;
          })
          .catch(function() {
            if (seq !== thumbLoadSeq) return;
            img.src = fetchUrl;
          });
        return;
      }
      bindLoadHandlers();
      img.style.opacity = '1';
      img.src = resolveMenuItemImageSrcForPreview(p);
    }
    thumbWrap.appendChild(img);
    var thumbLoading = document.createElement('span');
    thumbLoading.className = 'dashboard-menu-item-image-thumb-loading';
    thumbLoading.setAttribute('aria-hidden', 'true');
    thumbLoading.innerHTML = '<i class="fa fa-spinner fa-spin" aria-hidden="true"></i><span class="dashboard-menu-item-image-thumb-loading-label">Uploading…</span>';
    thumbWrap.appendChild(thumbLoading);

    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'dashboard-edit-input dashboard-menu-item-image-path hidden';
    inp.setAttribute('tabindex', '-1');
    inp.setAttribute('aria-hidden', 'true');
    inp.value = path || '';
    var inputThumbTimer = null;
    inp.addEventListener('input', function() {
      clearTimeout(inputThumbTimer);
      inputThumbTimer = setTimeout(function() {
        updateThumbDisplay(inp.value, null);
      }, 350);
      syncSlideshowImagesTextareaFromRows();
    });
    updateThumbDisplay(path, previewFile);

    var fileInp = document.createElement('input');
    fileInp.type = 'file';
    fileInp.className = 'hidden dashboard-menu-item-image-file';
    fileInp.setAttribute('accept', 'image/jpeg,image/png,image/webp,image/gif');
    fileInp.setAttribute('tabindex', '-1');
    fileInp.setAttribute('aria-hidden', 'true');
    fileInp.addEventListener('change', function() {
      var f = fileInp.files && fileInp.files[0];
      fileInp.value = '';
      if (!f) return;
      uploadMenuItemDraftImage(f, inp, function(uploadedPath, file) {
        clearTimeout(inputThumbTimer);
        updateThumbDisplay(uploadedPath, file);
      }, { useSlideshowStatus: true, statusLabel: 'Uploading image…' });
    });

    var replaceBtn = document.createElement('button');
    replaceBtn.type = 'button';
    replaceBtn.className = 'dashboard-btn dashboard-btn-secondary dashboard-menu-item-image-replace';
    replaceBtn.setAttribute('aria-label', 'Replace with another file');
    replaceBtn.setAttribute('title', 'Replace with another file');
    replaceBtn.innerHTML = '<i class="fa fa-cloud-upload" aria-hidden="true"></i>';
    replaceBtn.addEventListener('click', function() { fileInp.click(); });

    var browseSlideshowBtn = document.createElement('button');
    browseSlideshowBtn.type = 'button';
    browseSlideshowBtn.className = 'dashboard-btn dashboard-btn-secondary dashboard-menu-item-image-browse-site';
    browseSlideshowBtn.setAttribute('aria-label', 'Browse site images');
    browseSlideshowBtn.setAttribute('title', 'Browse site images');
    browseSlideshowBtn.innerHTML = '<i class="fa fa-folder-open" aria-hidden="true"></i>';
    browseSlideshowBtn.addEventListener('click', function() {
      openSiteImagePickerModal(function(rel) {
        inp.value = rel;
        clearTimeout(inputThumbTimer);
        updateThumbDisplay(rel, null);
        syncSlideshowImagesTextareaFromRows();
        editFormDirty = true;
        setEditStatus('Unsaved changes (not yet published)');
      });
    });

    var pathCol = document.createElement('div');
    pathCol.className = 'dashboard-menu-item-image-path-col';
    var pathActions = document.createElement('div');
    pathActions.className = 'dashboard-menu-item-image-path-actions';
    pathActions.appendChild(replaceBtn);
    pathActions.appendChild(browseSlideshowBtn);
    pathActions.appendChild(fileInp);
    pathCol.appendChild(inp);
    pathCol.appendChild(pathActions);

    var rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'dashboard-btn dashboard-btn-secondary dashboard-menu-item-image-remove';
    rm.setAttribute('aria-label', 'Remove image');
    rm.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
    rm.addEventListener('click', function() {
      var paths = gatherSlideshowImagePathsFromRows();
      var rows = slideshowImagesContainer.querySelectorAll('.dashboard-menu-item-image-row');
      var i = Array.prototype.indexOf.call(rows, row);
      if (i >= 0) paths.splice(i, 1);
      renderSlideshowImagesUI(paths);
    });

    handle.addEventListener('dragstart', function(e) {
      var rows = slideshowImagesContainer.querySelectorAll('.dashboard-menu-item-image-row');
      var idx = Array.prototype.indexOf.call(rows, row);
      e.dataTransfer.setData('text/plain', String(idx));
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dashboard-menu-item-image-row--dragging');
    });
    handle.addEventListener('dragend', function() {
      row.classList.remove('dashboard-menu-item-image-row--dragging');
      slideshowImagesContainer.querySelectorAll('.dashboard-menu-item-image-row').forEach(function(r) {
        r.classList.remove('dashboard-menu-item-image-row--over');
      });
    });

    function onDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('dashboard-menu-item-image-row--over');
    }
    function onDragLeave(e) {
      if (!row.contains(e.relatedTarget)) row.classList.remove('dashboard-menu-item-image-row--over');
    }
    function onDrop(e) {
      e.preventDefault();
      row.classList.remove('dashboard-menu-item-image-row--over');
      var from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      var rows = slideshowImagesContainer.querySelectorAll('.dashboard-menu-item-image-row');
      var to = Array.prototype.indexOf.call(rows, row);
      if (isNaN(from) || to < 0) return;
      var paths = gatherSlideshowImagePathsFromRows();
      var reordered = reorderMenuItemImagePaths(paths, from, to);
      renderSlideshowImagesUI(reordered);
    }
    [row, handle, pathCol, inp, thumbWrap].forEach(function(el) {
      el.addEventListener('dragover', onDragOver);
      el.addEventListener('dragleave', onDragLeave);
      el.addEventListener('drop', onDrop);
    });

    row.appendChild(handle);
    row.appendChild(thumbWrap);
    row.appendChild(pathCol);
    row.appendChild(rm);
    return row;
  }


  function gatherPromoImagePathsFromRows() {
    if (!promoImagesContainer) return [];
    var out = [];
    promoImagesContainer.querySelectorAll('.dashboard-menu-item-image-path').forEach(function(inp) {
      out.push(inp.value);
    });
    return out;
  }

  function syncPromoImagesTextareaFromRows(silent) {
    if (!inputPromoImages || !promoImagesContainer) return;
    var lines = gatherPromoImagePathsFromRows().map(function(s) { return (s || '').trim(); });
    inputPromoImages.value = lines.join('\n');
    if (!silent) {
      editFormDirty = true;
      setEditStatus('Unsaved changes (not yet published)');
    }
  }

  function renderPromoImagesUI(paths, silentSync, opts) {
    opts = opts || {};
    var lastPreviewFile = opts.lastPreviewFile;
    if (!promoImagesContainer) return;
    var list = Array.isArray(paths) ? paths.slice() : [];
    promoImagesContainer.innerHTML = '';
    if (!list.length) {
      var empty = document.createElement('p');
      empty.className = 'dashboard-menu-item-images-empty';
      empty.textContent = 'No images yet. Use Add image to choose a file.';
      promoImagesContainer.appendChild(empty);
      if (inputPromoImages) inputPromoImages.value = '';
      return;
    }
    list.forEach(function(path, idx) {
      var pf = (lastPreviewFile && idx === list.length - 1) ? lastPreviewFile : undefined;
      promoImagesContainer.appendChild(createPromoImageRow(path, pf));
    });
    syncPromoImagesTextareaFromRows(!!silentSync);
  }

  function createPromoImageRow(path, previewFile) {
    var row = document.createElement('div');
    row.className = 'dashboard-menu-item-image-row';
    row.setAttribute('role', 'listitem');

    var handle = document.createElement('span');
    handle.className = 'dashboard-menu-item-image-drag';
    handle.setAttribute('aria-label', 'Drag to reorder');
    handle.setAttribute('title', 'Drag to reorder');
    handle.setAttribute('draggable', 'true');
    handle.innerHTML = '<i class="fa fa-bars" aria-hidden="true"></i>';

    var thumbWrap = document.createElement('div');
    thumbWrap.className = 'dashboard-menu-item-image-thumb-wrap';
    var img = document.createElement('img');
    img.className = 'dashboard-menu-item-image-thumb';
    img.alt = '';
    img.loading = 'lazy';
    var rowBlobUrl = null;
    var thumbLoadSeq = 0;
    function revokeRowBlob() {
      if (rowBlobUrl) {
        try { URL.revokeObjectURL(rowBlobUrl); } catch (e) {}
        rowBlobUrl = null;
      }
    }
    function cmsAuthHeadersForThumb() {
      var h = {};
      var token = (typeof AuthClient !== 'undefined' && AuthClient.getAccessToken) ? AuthClient.getAccessToken() : (typeof localStorage !== 'undefined' ? localStorage.getItem('ttmenus_access_token') : null);
      if (token) h['Authorization'] = 'Bearer ' + token;
      return h;
    }
    function updateThumbDisplay(val, previewFile) {
      var p = (val || '').trim();
      if (!p) {
        thumbLoadSeq++;
        revokeRowBlob();
        img.removeAttribute('src');
        img.style.display = 'none';
        img.style.opacity = '1';
        thumbWrap.classList.add('dashboard-menu-item-image-thumb-wrap--empty');
        return;
      }
      img.style.display = '';
      thumbWrap.classList.remove('dashboard-menu-item-image-thumb-wrap--empty');
      revokeRowBlob();
      thumbLoadSeq++;
      var seq = thumbLoadSeq;
      function bindLoadHandlers() {
        img.onload = function() {
          if (seq !== thumbLoadSeq) return;
          img.style.opacity = '1';
        };
        img.onerror = function() {
          if (seq !== thumbLoadSeq) return;
          img.style.opacity = '0.35';
        };
      }
      if (previewFile && previewFile instanceof File) {
        rowBlobUrl = URL.createObjectURL(previewFile);
        bindLoadHandlers();
        img.style.opacity = '1';
        img.src = rowBlobUrl;
        return;
      }
      if (p.indexOf('draft-assets/') === 0) {
        var fetchUrl = resolveMenuItemImageSrcForPreview(p);
        bindLoadHandlers();
        fetch(fetchUrl, { credentials: 'include', headers: cmsAuthHeadersForThumb() })
          .then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.blob();
          })
          .then(function(blob) {
            if (seq !== thumbLoadSeq) return;
            rowBlobUrl = URL.createObjectURL(blob);
            img.src = rowBlobUrl;
          })
          .catch(function() {
            if (seq !== thumbLoadSeq) return;
            img.src = fetchUrl;
          });
        return;
      }
      bindLoadHandlers();
      img.style.opacity = '1';
      img.src = resolveMenuItemImageSrcForPreview(p);
    }
    thumbWrap.appendChild(img);
    var thumbLoading = document.createElement('span');
    thumbLoading.className = 'dashboard-menu-item-image-thumb-loading';
    thumbLoading.setAttribute('aria-hidden', 'true');
    thumbLoading.innerHTML = '<i class="fa fa-spinner fa-spin" aria-hidden="true"></i><span class="dashboard-menu-item-image-thumb-loading-label">Uploading…</span>';
    thumbWrap.appendChild(thumbLoading);

    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'dashboard-edit-input dashboard-menu-item-image-path hidden';
    inp.setAttribute('tabindex', '-1');
    inp.setAttribute('aria-hidden', 'true');
    inp.value = path || '';
    var inputThumbTimer = null;
    inp.addEventListener('input', function() {
      clearTimeout(inputThumbTimer);
      inputThumbTimer = setTimeout(function() {
        updateThumbDisplay(inp.value, null);
      }, 350);
      syncPromoImagesTextareaFromRows();
    });
    updateThumbDisplay(path, previewFile);

    var fileInp = document.createElement('input');
    fileInp.type = 'file';
    fileInp.className = 'hidden dashboard-menu-item-image-file';
    fileInp.setAttribute('accept', 'image/jpeg,image/png,image/webp,image/gif');
    fileInp.setAttribute('tabindex', '-1');
    fileInp.setAttribute('aria-hidden', 'true');
    fileInp.addEventListener('change', function() {
      var f = fileInp.files && fileInp.files[0];
      fileInp.value = '';
      if (!f) return;
      uploadMenuItemDraftImage(f, inp, function(uploadedPath, file) {
        clearTimeout(inputThumbTimer);
        updateThumbDisplay(uploadedPath, file);
      }, { usePromoStatus: true, statusLabel: 'Uploading image…' });
    });

    var replaceBtn = document.createElement('button');
    replaceBtn.type = 'button';
    replaceBtn.className = 'dashboard-btn dashboard-btn-secondary dashboard-menu-item-image-replace';
    replaceBtn.setAttribute('aria-label', 'Replace with another file');
    replaceBtn.setAttribute('title', 'Replace with another file');
    replaceBtn.innerHTML = '<i class="fa fa-cloud-upload" aria-hidden="true"></i>';
    replaceBtn.addEventListener('click', function() { fileInp.click(); });

    var browsePromoBtn = document.createElement('button');
    browsePromoBtn.type = 'button';
    browsePromoBtn.className = 'dashboard-btn dashboard-btn-secondary dashboard-menu-item-image-browse-site';
    browsePromoBtn.setAttribute('aria-label', 'Browse site images');
    browsePromoBtn.setAttribute('title', 'Browse site images');
    browsePromoBtn.innerHTML = '<i class="fa fa-folder-open" aria-hidden="true"></i>';
    browsePromoBtn.addEventListener('click', function() {
      openSiteImagePickerModal(function(rel) {
        inp.value = rel;
        clearTimeout(inputThumbTimer);
        updateThumbDisplay(rel, null);
        syncPromoImagesTextareaFromRows();
        editFormDirty = true;
        setEditStatus('Unsaved changes (not yet published)');
      });
    });

    var pathCol = document.createElement('div');
    pathCol.className = 'dashboard-menu-item-image-path-col';
    var pathActions = document.createElement('div');
    pathActions.className = 'dashboard-menu-item-image-path-actions';
    pathActions.appendChild(replaceBtn);
    pathActions.appendChild(browsePromoBtn);
    pathActions.appendChild(fileInp);
    pathCol.appendChild(inp);
    pathCol.appendChild(pathActions);

    var rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'dashboard-btn dashboard-btn-secondary dashboard-menu-item-image-remove';
    rm.setAttribute('aria-label', 'Remove image');
    rm.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
    rm.addEventListener('click', function() {
      var paths = gatherPromoImagePathsFromRows();
      var rows = promoImagesContainer.querySelectorAll('.dashboard-menu-item-image-row');
      var i = Array.prototype.indexOf.call(rows, row);
      if (i >= 0) paths.splice(i, 1);
      renderPromoImagesUI(paths);
    });

    handle.addEventListener('dragstart', function(e) {
      var rows = promoImagesContainer.querySelectorAll('.dashboard-menu-item-image-row');
      var idx = Array.prototype.indexOf.call(rows, row);
      e.dataTransfer.setData('text/plain', String(idx));
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dashboard-menu-item-image-row--dragging');
    });
    handle.addEventListener('dragend', function() {
      row.classList.remove('dashboard-menu-item-image-row--dragging');
      promoImagesContainer.querySelectorAll('.dashboard-menu-item-image-row').forEach(function(r) {
        r.classList.remove('dashboard-menu-item-image-row--over');
      });
    });

    function onDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('dashboard-menu-item-image-row--over');
    }
    function onDragLeave(e) {
      if (!row.contains(e.relatedTarget)) row.classList.remove('dashboard-menu-item-image-row--over');
    }
    function onDrop(e) {
      e.preventDefault();
      row.classList.remove('dashboard-menu-item-image-row--over');
      var from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      var rows = promoImagesContainer.querySelectorAll('.dashboard-menu-item-image-row');
      var to = Array.prototype.indexOf.call(rows, row);
      if (isNaN(from) || to < 0) return;
      var paths = gatherPromoImagePathsFromRows();
      var reordered = reorderMenuItemImagePaths(paths, from, to);
      renderPromoImagesUI(reordered);
    }
    [row, handle, pathCol, inp, thumbWrap].forEach(function(el) {
      el.addEventListener('dragover', onDragOver);
      el.addEventListener('dragleave', onDragLeave);
      el.addEventListener('drop', onDrop);
    });

    row.appendChild(handle);
    row.appendChild(thumbWrap);
    row.appendChild(pathCol);
    row.appendChild(rm);
    return row;
  }

  function hoursSlotToTime(slot) {
    var s = Math.max(0, Math.min(47, Math.floor(slot)));
    var h = Math.floor(s / 2);
    var m = (s % 2) ? 30 : 0;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function hoursTimeToSlot(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 22;
    var parts = timeStr.trim().split(/[:\s]/);
    var h = parseInt(parts[0], 10) || 0;
    var m = parseInt(parts[1], 10) || 0;
    if (h >= 24) return 48;
    h = Math.max(0, Math.min(23, h));
    m = m >= 30 ? 30 : 0;
    return h * 2 + (m >= 30 ? 1 : 0);
  }
  function hoursWeekSlotToDayAndTime(weekSlot) {
    weekSlot = Math.max(0, Math.min(HOURS_WEEK_SLOTS, Math.floor(weekSlot)));
    if (weekSlot >= HOURS_WEEK_SLOTS) return { dayLabel: HOURS_DAY_LABELS[6], time: '24:00' };
    if (weekSlot > 0 && weekSlot % HOURS_SLOTS_PER_DAY === 0)
      return { dayLabel: HOURS_DAY_LABELS[weekSlot / HOURS_SLOTS_PER_DAY], time: '00:00' };
    var dayIdx = Math.floor(weekSlot / HOURS_SLOTS_PER_DAY);
    var daySlot = weekSlot % HOURS_SLOTS_PER_DAY;
    if (daySlot === 0) return { dayLabel: HOURS_DAY_LABELS[dayIdx], time: '00:00' };
    return { dayLabel: HOURS_DAY_LABELS[dayIdx], time: hoursSlotToTime(daySlot) };
  }
  function hoursGetDayIntervals(day) {
    var raw = hoursPerDayData[day];
    if (Array.isArray(raw)) return raw.filter(function(r) { return r.open < r.close; });
    if (raw && typeof raw.open === 'number' && typeof raw.close === 'number' && raw.open < raw.close)
      return [ { open: raw.open, close: raw.close } ];
    return [];
  }
  function hoursGetDayPrimaryInterval(dayKey) {
    var intervals = hoursGetDayIntervals(dayKey);
    if (intervals.length) return { open: intervals[0].open, close: intervals[0].close };
    return { open: 22, close: 44 };
  }
  function hoursCommitDayViewToModel() {
    if (hoursZoomedDayIndex == null) return;
    var dayKey = HOURS_DAY_KEYS[hoursZoomedDayIndex];
    var openSlot = Math.max(0, Math.min(HOURS_SLOTS_PER_DAY - 1, hoursDayOpenSlot));
    var closeSlot = Math.max(openSlot + 1, Math.min(48, hoursDayCloseSlot));
    hoursPerDayData[dayKey] = [{ open: openSlot, close: closeSlot }];
    hoursSyncTextarea();
  }
  function hoursBuildJsonFromPerDay() {
    var out = { mode: 'Auto' };
    HOURS_DAY_KEYS.forEach(function(day) {
      var intervals = hoursGetDayIntervals(day);
      if (intervals.length === 0) {
        out[day] = [ { type: 'Open', time: '00:00' }, { type: 'Close', time: '00:00' } ];
      } else {
        var list = [];
        intervals.forEach(function(iv) {
          list.push({ type: 'Open', time: hoursSlotToTime(iv.open) });
          list.push({ type: 'Close', time: iv.close >= 48 ? '24:00' : hoursSlotToTime(iv.close) });
        });
        out[day] = list;
      }
    });
    return JSON.stringify(out);
  }
  function hoursSyncTextarea() {
    if (inputLocationOpeningHours) inputLocationOpeningHours.value = hoursBuildJsonFromPerDay();
    if (window.DashboardEditFieldPrompts) window.DashboardEditFieldPrompts.refresh();
  }
  function normalizeLocationOpeningHoursAttr(raw) {
    if (!raw) return '';
    var s = typeof raw === 'string' ? raw.trim() : JSON.stringify(raw);
    if (!s) return '';
    try {
      JSON.parse(s);
      return s;
    } catch (e) {}
    try {
      var dec = s.replace(/&quot;/gi, '"').replace(/&#34;/g, '"').replace(/&amp;/gi, '&');
      JSON.parse(dec);
      return dec;
    } catch (e2) {}
    return s;
  }

  function hoursParseJsonToPerDay(ohStr) {
    var data = {};
    var parsedAny = false;
    try {
      if (ohStr && ohStr.trim()) {
        var parsed = JSON.parse(ohStr);
        HOURS_DAY_KEYS.forEach(function(day) {
          var arr = parsed[day];
          if (!Array.isArray(arr) || !arr.length) {
            data[day] = [];
            return;
          }
          var list = [];
          for (var i = 0; i < arr.length; i++) {
            var item = arr[i];
            if (!item || typeof item.type !== 'string' || !item.time) continue;
            var slot = hoursTimeToSlot(String(item.time));
            if (slot >= 48) slot = 48;
            if (item.type === 'Open') list.push({ open: slot, close: null });
            else if (item.type === 'Close') {
              if (list.length > 0 && list[list.length - 1].close === null)
                list[list.length - 1].close = slot;
              else
                list.push({ open: 0, close: slot });
            }
          }
          var intervals = list.filter(function(p) { return p.close != null && p.open < p.close; }).map(function(p) { return { open: p.open, close: p.close }; });
          data[day] = intervals;
          if (intervals.length) parsedAny = true;
        });
      }
    } catch (e) {}
    HOURS_DAY_KEYS.forEach(function(day) {
      if (!data[day]) data[day] = [];
    });
    if (!parsedAny && (!ohStr || !String(ohStr).trim())) {
      HOURS_DAY_KEYS.forEach(function(day) {
        data[day] = [{ open: 22, close: 44 }];
      });
    }
    return data;
  }
  function hoursRenderWeekView() {
    if (!hoursWeekTimeline) return;
    hoursWeekTimeline.innerHTML = '';
    HOURS_DAY_KEYS.forEach(function(day, i) {
      var intervals = hoursGetDayIntervals(day);
      var closed = intervals.length === 0;
      var seg = document.createElement('div');
      seg.className = 'hours-week-segment';
      seg.setAttribute('data-day-index', i);
      seg.setAttribute('data-day-key', day);
      seg.setAttribute('aria-label', HOURS_DAY_LABELS[i] + (closed ? ', closed. Click to add hours' : '. Click to edit'));
      var track = document.createElement('div');
      track.className = 'hours-week-segment-track';
      intervals.forEach(function(iv) {
        var left = (iv.open / 48) * 100;
        var width = ((Math.min(iv.close, 48) - iv.open) / 48) * 100;
        if (width <= 0) return;
        var fill = document.createElement('div');
        fill.className = 'hours-week-segment-fill';
        fill.style.left = left + '%';
        fill.style.width = width + '%';
        track.appendChild(fill);
      });
      seg.appendChild(track);
      seg.addEventListener('click', function() {
        var idx = parseInt(seg.getAttribute('data-day-index'), 10);
        if (closed) {
          hoursPerDayData[day] = [{ open: 22, close: 44 }];
          hoursSyncTextarea();
        }
        hoursShowDayView(idx);
      });
      hoursWeekTimeline.appendChild(seg);
    });
  }
  function hoursNextDayIndex(dayIndex) {
    return (dayIndex + 1) % 7;
  }
  function hoursPrevDayIndex(dayIndex) {
    return (dayIndex + 6) % 7;
  }
  function hoursShowDayView(dayIndex) {
    hoursZoomedDayIndex = dayIndex;
    if (hoursWeekView) hoursWeekView.classList.add('hidden');
    if (hoursDayView) hoursDayView.classList.remove('hidden');
    if (hoursDayViewTitle) hoursDayViewTitle.textContent = HOURS_DAY_LABELS[dayIndex];
    var iv = hoursGetDayPrimaryInterval(HOURS_DAY_KEYS[dayIndex]);
    hoursDayOpenSlot = iv.open;
    hoursDayCloseSlot = iv.close;
    if (hoursDayOpen) hoursDayOpen.value = hoursDayOpenSlot;
    if (hoursDayClose) hoursDayClose.value = hoursDayCloseSlot;
    hoursDaySelectedHandle = null;
    if (hoursDayHandleOpen) { hoursDayHandleOpen.classList.remove('hours-day-handle-selected'); hoursDayHandleOpen.setAttribute('aria-pressed', 'false'); }
    if (hoursDayHandleClose) { hoursDayHandleClose.classList.remove('hours-day-handle-selected'); hoursDayHandleClose.setAttribute('aria-pressed', 'false'); }
    hoursUpdateDayViewUi(false);
  }
  function hoursShowWeekView() {
    if (hoursZoomedDayIndex != null) hoursCommitDayViewToModel();
    hoursZoomedDayIndex = null;
    if (hoursDayView) hoursDayView.classList.add('hidden');
    if (hoursWeekView) hoursWeekView.classList.remove('hidden');
    hoursRenderWeekView();
    scheduleLocationPreviewApply();
  }
  function hoursUpdateDayViewUi(commitModel) {
    if (hoursZoomedDayIndex == null) return;
    if (commitModel !== false) {
      var openSlot = hoursDayOpen ? parseInt(hoursDayOpen.value, 10) : hoursDayOpenSlot;
      var closeSlot = hoursDayClose ? parseInt(hoursDayClose.value, 10) : hoursDayCloseSlot;
      if (isNaN(openSlot)) openSlot = hoursDayOpenSlot;
      if (isNaN(closeSlot)) closeSlot = hoursDayCloseSlot;
      if (openSlot > closeSlot) closeSlot = Math.min(48, openSlot + 1);
      if (closeSlot <= openSlot) openSlot = Math.max(0, closeSlot - 1);
      openSlot = Math.max(0, Math.min(HOURS_SLOTS_PER_DAY - 1, openSlot));
      closeSlot = Math.max(openSlot + 1, Math.min(48, closeSlot));
      hoursDayOpenSlot = openSlot;
      hoursDayCloseSlot = closeSlot;
      if (hoursDayOpen) hoursDayOpen.value = openSlot;
      if (hoursDayClose) hoursDayClose.value = closeSlot;
    }
    if (hoursDayFill) {
      hoursDayFill.style.left = (hoursDayOpenSlot / HOURS_SLOTS_PER_DAY * 100) + '%';
      hoursDayFill.style.width = ((hoursDayCloseSlot - hoursDayOpenSlot) / HOURS_SLOTS_PER_DAY * 100) + '%';
    }
    if (hoursDayHandleOpenTime) hoursDayHandleOpenTime.textContent = hoursSlotToTime(hoursDayOpenSlot);
    if (hoursDayHandleCloseTime) {
      hoursDayHandleCloseTime.textContent = hoursDayCloseSlot >= 48 ? '24:00' : hoursSlotToTime(hoursDayCloseSlot);
    }
    if (commitModel !== false) {
      hoursCommitDayViewToModel();
      scheduleLocationPreviewApply();
    }
  }
  function initOpeningHoursFromJson(ohStr) {
    hoursPerDayData = hoursParseJsonToPerDay(ohStr || '');
    hoursZoomedDayIndex = null;
    hoursRenderWeekView();
    if (hoursWeekView) hoursWeekView.classList.remove('hidden');
    if (hoursDayView) hoursDayView.classList.add('hidden');
    hoursSyncTextarea();
  }
  var _hoursEditorInited = false;
  function initOpeningHoursEditor() {
    if (_hoursEditorInited) return;
    _hoursEditorInited = true;
    if (hoursBackToWeek) {
      hoursBackToWeek.onclick = function() { hoursShowWeekView(); };
    }
    if (hoursDeleteDayBtn) {
      hoursDeleteDayBtn.onclick = function() {
        if (hoursZoomedDayIndex == null) return;
        var label = HOURS_DAY_LABELS[hoursZoomedDayIndex];
        if (window.confirm('Close ' + label + '? This day will have no opening hours.')) {
          hoursPerDayData[HOURS_DAY_KEYS[hoursZoomedDayIndex]] = [];
          hoursSyncTextarea();
          hoursShowWeekView();
        }
      };
    }
    function hoursSetSelectedHandle(which) {
      hoursDaySelectedHandle = which;
      if (hoursDayHandleOpen) {
        hoursDayHandleOpen.classList.toggle('hours-day-handle-selected', which === 'open');
        hoursDayHandleOpen.setAttribute('aria-pressed', which === 'open' ? 'true' : 'false');
      }
      if (hoursDayHandleClose) {
        hoursDayHandleClose.classList.toggle('hours-day-handle-selected', which === 'close');
        hoursDayHandleClose.setAttribute('aria-pressed', which === 'close' ? 'true' : 'false');
      }
    }
    if (hoursDayHandleOpen) {
      hoursDayHandleOpen.addEventListener('click', function() {
        hoursSetSelectedHandle(hoursDaySelectedHandle === 'open' ? null : 'open');
      });
    }
    if (hoursDayHandleClose) {
      hoursDayHandleClose.addEventListener('click', function() {
        hoursSetSelectedHandle(hoursDaySelectedHandle === 'close' ? null : 'close');
      });
    }
    (function() {
      var dragTarget = hoursDayTrackWrap || hoursDayTrack;
      if (!dragTarget) return;
      var dragging = false;
      function slotFromEvent(e) {
        var el = dragTarget;
        if (!el) return 0;
        var r = el.getBoundingClientRect();
        var clientX = e.clientX != null ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        var x = clientX - r.left;
        var pct = r.width > 0 ? Math.max(0, Math.min(1, x / r.width)) : 0;
        return Math.round(pct * HOURS_SLOTS_PER_DAY);
      }
      function applySlot(slot) {
        if (hoursZoomedDayIndex == null) return;
        slot = Math.max(0, Math.min(HOURS_SLOTS_PER_DAY, slot));
        var openSlot = hoursDayOpenSlot;
        var closeSlot = hoursDayCloseSlot;
        if (hoursDaySelectedHandle === 'open') {
          openSlot = slot;
          if (openSlot >= closeSlot) closeSlot = Math.min(48, openSlot + 1);
        } else if (hoursDaySelectedHandle === 'close') {
          closeSlot = slot;
          if (closeSlot <= openSlot) openSlot = Math.max(0, closeSlot - 1);
        }
        hoursDayOpenSlot = openSlot;
        hoursDayCloseSlot = closeSlot;
        if (hoursDayOpen) hoursDayOpen.value = openSlot;
        if (hoursDayClose) hoursDayClose.value = closeSlot;
        hoursUpdateDayViewUi();
      }
      function onDragStart(e) {
        e.preventDefault();
        if (hoursDaySelectedHandle !== 'open' && hoursDaySelectedHandle !== 'close') {
          var slot = slotFromEvent(e);
          var mid = (hoursDayOpenSlot + hoursDayCloseSlot) / 2;
          hoursSetSelectedHandle(slot < mid ? 'open' : 'close');
        }
        dragging = true;
        applySlot(slotFromEvent(e));
      }
      function onDragMove(e) {
        if (!dragging) return;
        e.preventDefault();
        applySlot(slotFromEvent(e));
      }
      function onDragEnd() {
        dragging = false;
      }
      dragTarget.addEventListener('mousedown', onDragStart);
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
      dragTarget.addEventListener('touchstart', onDragStart, { passive: false });
      document.addEventListener('touchmove', onDragMove, { passive: false });
      document.addEventListener('touchend', onDragEnd);
    })();
  }

  function setLocationGeoStatus(msg) {
    if (locationGeoStatusEl) locationGeoStatusEl.textContent = msg || '';
  }

  function scheduleLocationPreviewApply() {
    if (!selectedInfo || selectedInfo.contentType !== 'location') return;
    if (locationPreviewApplyTimer) clearTimeout(locationPreviewApplyTimer);
    locationPreviewApplyTimer = setTimeout(function() {
      locationPreviewApplyTimer = null;
      applyEditToPreview();
    }, 200);
  }

  function useCurrentLocationForEditor() {
    if (!navigator.geolocation) {
      setLocationGeoStatus('Geolocation is not supported in this browser.');
      return;
    }
    setLocationGeoStatus('Getting your location…');
    if (btnUseCurrentLocation) btnUseCurrentLocation.disabled = true;
    navigator.geolocation.getCurrentPosition(function(pos) {
      if (btnUseCurrentLocation) btnUseCurrentLocation.disabled = false;
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      if (inputLocationLat) inputLocationLat.value = String(Number(lat.toFixed(6)));
      if (inputLocationLng) inputLocationLng.value = String(Number(lng.toFixed(6)));
      editFormDirty = true;
      setEditStatus('Unsaved changes (not yet published)');
      setLocationGeoStatus('Coordinates updated from your device.');
      scheduleLocationPreviewApply();
    }, function(err) {
      if (btnUseCurrentLocation) btnUseCurrentLocation.disabled = false;
      var msg = (err && err.message) ? err.message : 'Could not get your location.';
      if (err && err.code === 1) msg = 'Location permission denied. Allow location access for this site and try again.';
      setLocationGeoStatus(msg);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }

  if (btnUseCurrentLocation) {
    btnUseCurrentLocation.addEventListener('click', useCurrentLocationForEditor);
  }
  [inputLocationAddress, inputLocationCity, inputLocationIsland, inputLocationSubcategories,
    inputLocationLat, inputLocationLng, inputLocationPhone, inputLocationWhatsapp,
    inputLocationOrderingtables, inputLocationFooddrop].forEach(function(el) {
    if (!el) return;
    el.addEventListener('input', scheduleLocationPreviewApply);
    el.addEventListener('change', scheduleLocationPreviewApply);
  });

  function setMenuItemWizardStep(step) {
    menuItemWizardStep = Math.max(0, Math.min(embedWizardMaxStep(MENU_ITEM_WIZARD_LABELS), step));
    var root = document.getElementById('dashboardMenuItemWizardRoot');
    if (!root) return;
    var tabs = root.querySelectorAll('.dashboard-wizard-tab[data-wizard-index]');
    var panels = root.querySelectorAll('.dashboard-menu-item-wizard-panel[data-wizard-index]');
    tabs.forEach(function(tab) {
      var idx = parseInt(tab.getAttribute('data-wizard-index'), 10);
      if (isNaN(idx)) return;
      var on = idx === menuItemWizardStep;
      tab.classList.toggle('dashboard-wizard-tab-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panels.forEach(function(panel) {
      var idx = parseInt(panel.getAttribute('data-wizard-index'), 10);
      if (isNaN(idx)) return;
      var on = idx === menuItemWizardStep;
      panel.classList.toggle('hidden', !on);
      panel.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    if (btnMenuItemWizardPrev) btnMenuItemWizardPrev.disabled = menuItemWizardStep === 0;
    syncEmbedWizardNextButton(btnMenuItemWizardNext, menuItemWizardStep, MENU_ITEM_WIZARD_LABELS);
    if (dashboardMenuItemWizardProgress) {
      var total = embedPanelMode ? MENU_ITEM_WIZARD_LABELS.length + 1 : MENU_ITEM_WIZARD_LABELS.length;
      dashboardMenuItemWizardProgress.textContent =
        'Step ' + (menuItemWizardStep + 1) + ' of ' + total + ' · ' + embedWizardStepLabel(menuItemWizardStep, MENU_ITEM_WIZARD_LABELS);
    }
    if (isEmbedWizardSaveStep(menuItemWizardStep, MENU_ITEM_WIZARD_LABELS)) {
      mountChangesPanelToEmbedSaveHost('menu-item');
    } else {
      clearEmbedChangesFilterIfKind('menu-item');
    }
    if (window.DashboardEditFieldPrompts) window.DashboardEditFieldPrompts.enable();
  }

  function tryAdvanceWizardPanel(panel, advanceFn) {
    var FP = window.DashboardEditFieldPrompts;
    if (FP && FP.validateWizardPanel && panel) {
      var v = FP.validateWizardPanel(panel);
      if (!v.ok) {
        setEditStatus(v.message);
        if (FP.focusFieldHost && v.firstHost) FP.focusFieldHost(v.firstHost);
        return false;
      }
    }
    advanceFn();
    return true;
  }

  window.__dashboardFocusMenuItemWizardStep = function(idx) {
    if (!isNaN(idx)) setMenuItemWizardStep(idx);
  };
  window.__dashboardFocusPromoWizardStep = function(idx) {
    if (!isNaN(idx)) setPromotionWizardStep(idx);
  };
  window.__dashboardFocusLocationWizardStep = function(idx) {
    if (!isNaN(idx)) setLocationWizardStep(idx);
  };
  window.__dashboardFocusSectionWizardStep = function(idx) {
    if (!isNaN(idx)) setSectionWizardStep(idx);
  };

  function setSectionWizardStep(step) {
    sectionWizardStep = Math.max(0, Math.min(embedWizardMaxStep(SECTION_WIZARD_LABELS), step));
    var root = document.getElementById('dashboardSectionWizardRoot');
    if (!root) return;
    var tabs = root.querySelectorAll('.dashboard-wizard-tab[data-section-wizard-index]');
    var panels = root.querySelectorAll('.dashboard-section-wizard-panel');
    tabs.forEach(function(tab) {
      var idx = parseInt(tab.getAttribute('data-section-wizard-index'), 10);
      if (isNaN(idx)) return;
      var on = idx === sectionWizardStep;
      tab.classList.toggle('dashboard-wizard-tab-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panels.forEach(function(panel) {
      var idx = parseInt(panel.getAttribute('data-section-wizard-index'), 10);
      if (isNaN(idx)) return;
      var on = idx === sectionWizardStep;
      panel.classList.toggle('hidden', !on);
      panel.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    if (btnSectionWizardPrev) btnSectionWizardPrev.disabled = sectionWizardStep === 0;
    syncEmbedWizardNextButton(btnSectionWizardNext, sectionWizardStep, SECTION_WIZARD_LABELS);
    if (dashboardSectionWizardProgress) {
      var totalSec = embedPanelMode ? SECTION_WIZARD_LABELS.length + 1 : SECTION_WIZARD_LABELS.length;
      dashboardSectionWizardProgress.textContent =
        'Step ' + (sectionWizardStep + 1) + ' of ' + totalSec + ' · ' + embedWizardStepLabel(sectionWizardStep, SECTION_WIZARD_LABELS);
    }
    if (sectionWizardStep === 0 && window.DashboardSectionIconPicker && typeof window.DashboardSectionIconPicker.ensureLoaded === 'function') {
      window.DashboardSectionIconPicker.ensureLoaded();
    }
    if (sectionWizardStep === 1 && window.DashboardSectionSecondaryImagePicker && typeof window.DashboardSectionSecondaryImagePicker.ensureLoaded === 'function') {
      Promise.resolve(window.DashboardSectionSecondaryImagePicker.ensureLoaded()).then(function () {
        syncSectionSecondaryImagePickerFromInput();
        syncSectionPrimaryImageThumbFromInput();
      });
    }
    if (isEmbedWizardSaveStep(sectionWizardStep, SECTION_WIZARD_LABELS)) {
      mountChangesPanelToEmbedSaveHost('section');
    } else {
      clearEmbedChangesFilterIfKind('section');
    }
    if (window.DashboardEditFieldPrompts) window.DashboardEditFieldPrompts.enable();
  }

  function setLocationWizardStep(step) {
    var prev = locationWizardStep;
    locationWizardStep = Math.max(0, Math.min(LOCATION_WIZARD_LABELS.length - 1, step));
    if (prev === LOCATION_WIZARD_HOURS_INDEX && locationWizardStep !== LOCATION_WIZARD_HOURS_INDEX && hoursZoomedDayIndex != null) {
      hoursShowWeekView();
    }
    var root = document.getElementById('dashboardLocationWizardRoot');
    if (!root) return;
    var tabs = root.querySelectorAll('.dashboard-wizard-tab[data-location-wizard-index]');
    var panels = root.querySelectorAll('.dashboard-location-wizard-panel');
    tabs.forEach(function(tab) {
      var idx = parseInt(tab.getAttribute('data-location-wizard-index'), 10);
      if (isNaN(idx)) return;
      var on = idx === locationWizardStep;
      tab.classList.toggle('dashboard-wizard-tab-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panels.forEach(function(panel) {
      var idx = parseInt(panel.getAttribute('data-location-wizard-index'), 10);
      if (isNaN(idx)) return;
      var on = idx === locationWizardStep;
      panel.classList.toggle('hidden', !on);
      panel.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    if (btnLocationWizardPrev) btnLocationWizardPrev.disabled = locationWizardStep === 0;
    if (btnLocationWizardNext) btnLocationWizardNext.disabled = locationWizardStep >= LOCATION_WIZARD_LABELS.length - 1;
    if (dashboardLocationWizardProgress) {
      dashboardLocationWizardProgress.textContent = 'Step ' + (locationWizardStep + 1) + ' of ' + LOCATION_WIZARD_LABELS.length + ' · ' + LOCATION_WIZARD_LABELS[locationWizardStep];
    }
    if (locationWizardStep === LOCATION_WIZARD_HOURS_INDEX) {
      hoursRenderWeekView();
    }
    if (window.DashboardEditFieldPrompts) window.DashboardEditFieldPrompts.enable();
  }

  function setPromotionWizardStep(step) {
    promoWizardStep = Math.max(0, Math.min(embedWizardMaxStep(PROMO_WIZARD_LABELS), step));
    var root = document.getElementById('dashboardPromotionWizardRoot');
    if (!root) return;
    var tabs = root.querySelectorAll('.dashboard-wizard-tab[data-promo-wizard-index]');
    var panels = root.querySelectorAll('.dashboard-promotion-wizard-panel');
    tabs.forEach(function(tab) {
      var idx = parseInt(tab.getAttribute('data-promo-wizard-index'), 10);
      if (isNaN(idx)) return;
      var on = idx === promoWizardStep;
      tab.classList.toggle('dashboard-wizard-tab-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panels.forEach(function(panel) {
      var idx = parseInt(panel.getAttribute('data-promo-wizard-index'), 10);
      if (isNaN(idx)) return;
      var on = idx === promoWizardStep;
      panel.classList.toggle('hidden', !on);
      panel.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    if (btnPromoWizardPrev) btnPromoWizardPrev.disabled = promoWizardStep === 0;
    syncEmbedWizardNextButton(btnPromoWizardNext, promoWizardStep, PROMO_WIZARD_LABELS);
    if (dashboardPromotionWizardProgress) {
      var totalPromo = embedPanelMode ? PROMO_WIZARD_LABELS.length + 1 : PROMO_WIZARD_LABELS.length;
      dashboardPromotionWizardProgress.textContent =
        'Step ' + (promoWizardStep + 1) + ' of ' + totalPromo + ' · ' + embedWizardStepLabel(promoWizardStep, PROMO_WIZARD_LABELS);
    }
    if (isEmbedWizardSaveStep(promoWizardStep, PROMO_WIZARD_LABELS)) {
      mountChangesPanelToEmbedSaveHost('promotion');
    } else {
      clearEmbedChangesFilterIfKind('promotion');
    }
    if (window.DashboardEditFieldPrompts) window.DashboardEditFieldPrompts.enable();
  }

  function showFieldGroup(contentType) {
    var forAttr = function(g) { return g && g.getAttribute && g.getAttribute('data-for'); };
    [fieldsGeneric, fieldsLocation, fieldsPromotion, fieldsSlideshow, fieldsHomeHero].forEach(function(g) {
      if (!g) return;
      var allowed = forAttr(g);
      var list = allowed ? allowed.split(',').map(function(s) { return s.trim(); }) : [];
      var show = list.indexOf(contentType) !== -1;
      g.classList.toggle('hidden', !show);
    });
    var sectionWizardRoot = document.getElementById('dashboardSectionWizardRoot');
    if (sectionWizardRoot) sectionWizardRoot.classList.toggle('hidden', contentType !== 'section-header');
    var menuItemFields = document.querySelectorAll('.dashboard-edit-menuitem-fields');
    menuItemFields.forEach(function(el) { el.classList.toggle('hidden', contentType !== 'menu-item'); });
    if (contentType !== 'menu-item') setMenuItemWizardStep(0);
    if (contentType !== 'promotion') setPromotionWizardStep(0);
    if (contentType !== 'location') setLocationWizardStep(0);
    if (contentType !== 'section-header') setSectionWizardStep(0);
  }

  function populateEditFormFromInfo(info) {
    var contentType = info.contentType || 'menu-item';
    showFieldGroup(contentType);
    if (contentType === 'menu-item') setMenuItemWizardStep(0);
    if (contentType === 'promotion') setPromotionWizardStep(0);
    if (contentType === 'location') setLocationWizardStep(0);
    if (contentType === 'section-header') setSectionWizardStep(0);
    if (contentType === 'menu-item' || contentType === 'section-header') {
      var titleSrc = info.title != null ? info.title : getTextContent(info.element.querySelector('.menu-item-title, .menu-item-title a, h1, h2, a') || info.element);
      var descSrc = info.description != null ? info.description : getTextContent(info.element.querySelector('.menu-item-description, .menu-summary') || info.element);
      if (contentType === 'menu-item') {
        if (inputTitle) inputTitle.value = titleSrc;
        if (inputDesc) inputDesc.value = descSrc;
      } else {
        if (inputSectionTitle) inputSectionTitle.value = titleSrc;
        if (inputSectionDesc) inputSectionDesc.value = descSrc;
        syncSectionTitleFieldLock(info.element);
      }
    }
    if (contentType === 'section-header') {
      var headerEl = info.element;
      if (inputSectionWeight) inputSectionWeight.value = headerEl.getAttribute('data-weight') || '';
      if (inputSectionIcon) inputSectionIcon.value = headerEl.getAttribute('data-icon') || '';
      if (window.DashboardSectionIconPicker) {
        var pickerReady =
          typeof window.DashboardSectionIconPicker.ensureLoaded === 'function'
            ? window.DashboardSectionIconPicker.ensureLoaded()
            : Promise.resolve();
        Promise.resolve(pickerReady).then(function () {
          if (typeof window.DashboardSectionIconPicker.syncFromInput === 'function') {
            window.DashboardSectionIconPicker.syncFromInput();
          }
        });
      }
      var topImg = headerEl.querySelector('a img.food, img.food.item, .food.item');
      var primaryPath = topImg ? (topImg.getAttribute('src') || '').replace(/^\//, '') : (headerEl.getAttribute('data-images-primary') || '');
      var bottomImg = headerEl.querySelector('.slideinimg');
      var secondaryPath = bottomImg ? (bottomImg.getAttribute('src') || '').replace(/^\//, '') : (headerEl.getAttribute('data-images-secondary') || '');
      applySectionImagePathsToForm(secondaryPath, primaryPath);
    } else if (contentType === 'menu-item') {
      var cardEl = info.element;
      if (pricesContainer) renderPricesUI(pricesContainer, parseJsonAttr(cardEl, 'data-prices-array'));
      if (inputMenuItemImages) inputMenuItemImages.value = hoursFormatStringList(parseJsonAttr(cardEl, 'data-images-array'));
      renderMenuItemImagesUI(hoursParseStringList(inputMenuItemImages ? inputMenuItemImages.value : ''), true);
      populateMenuItemAvailabilityFromObject(parseJsonObjectAttr(cardEl, 'data-availability'));
      if (sideCategoriesContainer) renderSideCategoriesUI(sideCategoriesContainer, parseJsonAttr(cardEl, 'data-side-categories'));
      if (modificationsContainer) renderPairsUI(modificationsContainer, parseJsonAttr(cardEl, 'data-modifications'));
      if (additionsContainer) renderPairsUI(additionsContainer, parseJsonAttr(cardEl, 'data-additions'));
      if (tagsContainer) renderStringListUI(tagsContainer, parseJsonAttr(cardEl, 'data-tags'));
      if (ingredientsContainer) renderStringListUI(ingredientsContainer, parseJsonAttr(cardEl, 'data-ingredients'));
      if (cookingmethodsContainer) renderStringListUI(cookingmethodsContainer, parseJsonAttr(cardEl, 'data-cookingmethods'));
      if (typesContainer) renderStringListUI(typesContainer, parseJsonAttr(cardEl, 'data-types'));
      if (eventsContainer) renderStringListUI(eventsContainer, parseJsonAttr(cardEl, 'data-events'));
      var promosRaw = parseJsonAttr(cardEl, 'data-promotions');
      if (menuItemPromotionsContainer) renderMenuItemPromotionsUI(menuItemPromotionsContainer, Array.isArray(promosRaw) ? promosRaw : []);
    } else if (contentType === 'location') {
      setLocationGeoStatus('');
      var locLink = info.element.querySelector('a.locbtn');
      var telLink = info.element.querySelector('a[href^="tel:"]');
      var waLink = info.element.querySelector('a[href*="wa.me"]');
      var el = info.element;
      if (inputLocationAddress) inputLocationAddress.value = (el.getAttribute('data-address') || (locLink ? getTextContent(locLink) : '')) || '';
      if (inputLocationCity) inputLocationCity.value = el.getAttribute('data-city') || '';
      if (inputLocationIsland) {
        var islandVal = el.getAttribute('data-island') || '';
        if (inputLocationIsland.tagName === 'SELECT' && islandVal) {
          var islandSel = inputLocationIsland;
          var islandFound = false;
          for (var ii = 0; ii < islandSel.options.length; ii++) {
            if (islandSel.options[ii].value === islandVal) { islandFound = true; break; }
          }
          if (!islandFound) {
            var islandOpt = document.createElement('option');
            islandOpt.value = islandVal;
            islandOpt.textContent = islandVal;
            islandSel.appendChild(islandOpt);
          }
        }
        inputLocationIsland.value = islandVal;
      }
      if (inputLocationSubcategories) inputLocationSubcategories.value = (el.getAttribute('data-subcategories') || '').replace(/,/g, ', ') || '';
      if (inputLocationLat) inputLocationLat.value = (locLink ? locLink.getAttribute('data-lat') : '') || '';
      if (inputLocationLng) inputLocationLng.value = (locLink ? locLink.getAttribute('data-lng') : '') || '';
      if (inputLocationPhone) inputLocationPhone.value = telLink ? (telLink.getAttribute('href') || '').replace(/^tel:/, '') : (el.getAttribute('data-phone') || '');
      if (inputLocationWhatsapp) inputLocationWhatsapp.value = el.getAttribute('data-whatsapp') || (waLink ? (waLink.getAttribute('href') || '').replace(/.*wa\.me\/?/, '') : '');
      if (inputLocationOrderingtables) inputLocationOrderingtables.value = (locLink ? locLink.getAttribute('data-orderingtables') : '') || el.getAttribute('data-orderingtables') || '';
      if (inputLocationFooddrop) inputLocationFooddrop.value = el.getAttribute('data-delivery-fooddrop') || '';
      var oh = normalizeLocationOpeningHoursAttr(el.getAttribute('data-opening-hours'));
      if (inputLocationOpeningHours) inputLocationOpeningHours.value = oh;
      initOpeningHoursEditor();
      initOpeningHoursFromJson(oh);
      if (window.DashboardEditFieldPrompts) window.DashboardEditFieldPrompts.refresh();
    } else if (contentType === 'promotion') {
      var el = info.element;
      var previewCtx = getPreviewWinDoc();
      var promoWin = previewCtx.win;
      var promoDoc = previewCtx.doc;
      syncPromotionDataset(el, promoWin, promoDoc);
      var adTitleEl = el.querySelector('.clientad-heading a, .clientad-heading, h2 a, h2');
      var adLinkEl = el.querySelector('a.content-panel[href], .ad-panel a[href], a[href]');
      if (inputPromoTitle) inputPromoTitle.value = (el.getAttribute('data-ad-title') || (adTitleEl ? getTextContent(adTitleEl) : '')) || '';
      if (inputPromoDescription) inputPromoDescription.value = el.getAttribute('data-ad-description') || '';
      if (inputPromoLink) {
        inputPromoLink.value = (el.getAttribute('data-ad-url') || el.getAttribute('data-ad-link') || '') ||
          (adLinkEl ? (adLinkEl.getAttribute('href') || '') : '');
      }
      var imagesArr = [];
      try {
        var raw = el.getAttribute('data-ad-images');
        if (raw) imagesArr = JSON.parse(raw);
      } catch (e) {}
      if (!imagesArr.length) {
        el.querySelectorAll('img.ad-portrait, img.ad-portrait-bg, .ad-panel img, .ad-preview-media img').forEach(function(img) {
          var src = (img.getAttribute('src') || '').replace(/^\//, '');
          if (src && imagesArr.indexOf(src) === -1) imagesArr.push(src);
        });
      }
      if (promoImagesContainer) renderPromoImagesUI(Array.isArray(imagesArr) ? imagesArr : [], true);
      else if (inputPromoImages) inputPromoImages.value = Array.isArray(imagesArr) ? imagesArr.join('\n') : '';
      if (inputPromoRecurring) inputPromoRecurring.checked = (el.getAttribute('data-ad-recurring') || '') === 'true';
      var daysArr = [];
      try {
        var rawDays = el.getAttribute('data-ad-daysofweek');
        if (rawDays) daysArr = JSON.parse(rawDays);
      } catch (e) {}
      if (promoDaysofweekContainer) renderStringListUI(promoDaysofweekContainer, Array.isArray(daysArr) ? daysArr : []);
      if (inputPromoWeight) inputPromoWeight.value = el.getAttribute('data-ad-weight') || '';
    } else if (contentType === 'home-hero') {
      /* inputHomeHeroImage and cache are set before showEditForm from GET /content/file */
      if (inputHomeHeroImage) {
        updateHeroImageThumbDisplay(inputHomeHeroImage.value.trim(), null);
        syncHeroPathInputVisibility();
      }
    } else if (contentType === 'slideshow') {
      var slides = info.element.querySelectorAll('.client-tour-slideshow .slide img');
      var paths = [];
      slides.forEach(function(img) { var s = (img.getAttribute('src') || '').replace(/^\//, ''); if (s) paths.push(s); });
      if (slideshowImagesContainer) {
        renderSlideshowImagesUI(paths, true);
      } else {
        if (inputSlideshowImages) inputSlideshowImages.value = paths.join('\n');
        if (slideshowViewEl) renderSlideshowAsidePreview(slideshowViewEl, paths);
      }
    }
    updateMarkForDeletionButton();
  }

  function showEditForm(info) {
    selectedInfo = info;
    selectedElement = info.element;
    editFormDirty = false;
    savedDraftPreviewId = null;
    setEditStatus('');
    promptEl.classList.add('hidden');
    formEl.classList.remove('hidden');
    if (selectedTypeEl) selectedTypeEl.textContent = 'Loading: ' + (info.type || 'Content');
    if (contentSourceEl) contentSourceEl.textContent = info.contentPath ? 'Source: ' + info.contentPath : '';
    var loadLabel = info.title ? 'Loading ' + info.title + '…' : 'Loading editor…';
    setEmbedPanelLoading(true, loadLabel);
    setEditFormLoading(true, loadLabel);
    requestAnimationFrame(function() {
      try {
        populateEditFormFromInfo(info);
        if (selectedTypeEl) selectedTypeEl.textContent = 'Editing: ' + info.type;
      } catch (err) {
        console.warn('populateEditFormFromInfo', err);
        if (selectedTypeEl) selectedTypeEl.textContent = 'Editing: ' + info.type;
      }
      hydrateEditFormFromCmsPreview(info.contentPath).finally(function() {
        scheduleEndEditFormLoad();
      });
    });
  }

  function pathsFromFmImages(images) {
    if (!Array.isArray(images)) return [];
    var paths = [];
    images.forEach(function(x) {
      if (!x) return;
      if (typeof x === 'string') {
        paths.push(x.replace(/^\//, ''));
        return;
      }
      if (x.image) paths.push(String(x.image).replace(/^\//, ''));
    });
    return paths;
  }

  /** Section _index.md: images.primary (main) and images.secondary (decoration). */
  function sectionImagePathsFromFrontMatter(fm) {
    fm = fm || {};
    var secondary = '';
    var primary = '';
    if (fm.images && typeof fm.images === 'object' && !Array.isArray(fm.images)) {
      if (fm.images.secondary != null) secondary = String(fm.images.secondary).trim();
      if (fm.images.primary != null) primary = String(fm.images.primary).trim();
    }
    if (!primary && fm.imagesTop != null) primary = String(fm.imagesTop).trim();
    if (!primary && fm.images_top != null) primary = String(fm.images_top).trim();
    if (!secondary && fm.imagesBottom != null) secondary = String(fm.imagesBottom).trim();
    if (!secondary && fm.images_bottom != null) secondary = String(fm.images_bottom).trim();
    return { secondary: secondary, primary: primary };
  }

  function sectionFrontMatterHasImageFields(fm) {
    fm = fm || {};
    if (fm.images != null && typeof fm.images === 'object' && !Array.isArray(fm.images)) return true;
    return fm.imagesTop != null || fm.images_top != null || fm.imagesBottom != null || fm.images_bottom != null;
  }

  function syncSectionSecondaryImagePickerFromInput() {
    if (window.DashboardSectionSecondaryImagePicker && typeof window.DashboardSectionSecondaryImagePicker.syncFromInput === 'function') {
      window.DashboardSectionSecondaryImagePicker.syncFromInput();
    } else if (inputSectionImageTop) {
      inputSectionImageTop.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function syncSectionPrimaryImageThumbFromInput() {
    if (inputSectionImageBottom) {
      inputSectionImageBottom.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function applySectionImagePathsToForm(secondary, primary) {
    if (inputSectionImageTop) {
      inputSectionImageTop.value = secondary || '';
      syncSectionSecondaryImagePickerFromInput();
    }
    if (inputSectionImageBottom) {
      inputSectionImageBottom.value = primary || '';
      syncSectionPrimaryImageThumbFromInput();
    }
  }

  function hydrateEditFormFromCmsPreview(contentPath, options) {
    options = options || {};
    if (!contentPath || contentPath.indexOf('...') !== -1) return Promise.resolve(false);
    function applyPreview(preview) {
      if (!preview || !selectedInfo) return false;
      var p = preview.payload || preview.Payload || {};
      var fm = p.frontMatter || p.front_matter || {};
      var kind = p.kind || preview.kind;
      var contentType = selectedInfo.contentType || 'menu-item';
      var pid = preview.previewId != null ? preview.previewId : preview.preview_id;
      if (pid) savedDraftPreviewId = pid;
      if (contentPath) draftContentPaths.add(contentPath);

      if (contentType === 'menu-item' || kind === 'menu-item') {
        if (inputTitle && fm.title != null) inputTitle.value = fm.title;
        if (inputDesc && p.body != null) inputDesc.value = p.body;
        if (pricesContainer && Array.isArray(fm.prices)) {
          var pricesFlat = [];
          fm.prices.forEach(function(pr) {
            pricesFlat.push(pr.variable1 != null ? pr.variable1 : '-', pr.variable2 != null ? pr.variable2 : '-', Number(pr.price));
          });
          renderPricesUI(pricesContainer, pricesFlat);
        }
        var imagesArr = pathsFromFmImages(fm.images);
        if (menuItemImagesContainer) renderMenuItemImagesUI(imagesArr, true);
        else if (inputMenuItemImages) {
          inputMenuItemImages.value = imagesArr.join('\n');
          renderMenuItemImagesUI(imagesArr, true);
        }
        if (fm.side_categories != null || fm.sideCategories != null) {
          var sc = fm.side_categories != null ? fm.side_categories : fm.sideCategories;
          if (sideCategoriesContainer) renderSideCategoriesUI(sideCategoriesContainer, Array.isArray(sc) ? sc : []);
        }
        if (fm.modifications != null && modificationsContainer) {
          renderPairsUI(modificationsContainer, frontMatterModsToFlat(fm.modifications));
        }
        if (fm.additions != null && additionsContainer) {
          renderPairsUI(additionsContainer, frontMatterModsToFlat(fm.additions));
        }
        if (fm.tags != null && tagsContainer) renderStringListUI(tagsContainer, Array.isArray(fm.tags) ? fm.tags : []);
        if (fm.ingredients != null && ingredientsContainer) renderStringListUI(ingredientsContainer, Array.isArray(fm.ingredients) ? fm.ingredients : []);
        if (fm.cookingmethods != null && cookingmethodsContainer) renderStringListUI(cookingmethodsContainer, Array.isArray(fm.cookingmethods) ? fm.cookingmethods : []);
        if (fm.types != null && typesContainer) renderStringListUI(typesContainer, Array.isArray(fm.types) ? fm.types : []);
        if (fm.events != null && eventsContainer) renderStringListUI(eventsContainer, Array.isArray(fm.events) ? fm.events : []);
        if (fm.promotions != null && menuItemPromotionsContainer) {
          renderMenuItemPromotionsUI(menuItemPromotionsContainer, Array.isArray(fm.promotions) ? fm.promotions : []);
        }
        if (fm.availability != null) populateMenuItemAvailabilityFromObject(fm.availability);
        setEditStatus('Loaded CMS draft');
        return true;
      }

      if (contentType === 'section-header' || kind === 'section-header') {
        if (inputSectionTitle && fm.title != null && !isPromotionsSectionHeader(selectedElement)) {
          inputSectionTitle.value = fm.title;
        }
        if (inputSectionDesc && p.body != null) inputSectionDesc.value = p.body;
        if (inputSectionWeight && fm.weight != null) inputSectionWeight.value = String(fm.weight);
        else if (fm.weight != null && selectedElement && selectedElement.classList && selectedElement.classList.contains('menu-header')) {
          selectedElement.setAttribute('data-weight', String(fm.weight));
        }
        if (inputSectionIcon && fm.icon != null) inputSectionIcon.value = String(fm.icon);
        if (window.DashboardSectionIconPicker && typeof window.DashboardSectionIconPicker.syncFromInput === 'function') {
          window.DashboardSectionIconPicker.syncFromInput();
        }
        if (sectionFrontMatterHasImageFields(fm)) {
          var sectionPaths = sectionImagePathsFromFrontMatter(fm);
          if (sectionPaths.secondary) {
            if (inputSectionImageTop) {
              inputSectionImageTop.value = sectionPaths.secondary;
              syncSectionSecondaryImagePickerFromInput();
            }
          }
          if (sectionPaths.primary) {
            if (inputSectionImageBottom) {
              inputSectionImageBottom.value = sectionPaths.primary;
              syncSectionPrimaryImageThumbFromInput();
            }
          }
        }
        setEditStatus('Loaded CMS draft');
        return true;
      }

      if (contentType === 'promotion' || kind === 'promotion') {
        if (inputPromoTitle && fm.title != null) inputPromoTitle.value = fm.title;
        if (inputPromoDescription && p.body != null) inputPromoDescription.value = p.body;
        if (inputPromoLink && fm.link != null) inputPromoLink.value = fm.link;
        var promoImages = pathsFromFmImages(fm.images);
        if (promoImagesContainer) renderPromoImagesUI(promoImages, true);
        else if (inputPromoImages) inputPromoImages.value = promoImages.join('\n');
        if (inputPromoRecurring) inputPromoRecurring.checked = !!fm.recurring;
        if (promoDaysofweekContainer && fm.daysofweek != null) {
          renderStringListUI(promoDaysofweekContainer, Array.isArray(fm.daysofweek) ? fm.daysofweek : []);
        }
        if (inputPromoWeight && fm.weight != null) inputPromoWeight.value = String(fm.weight);
        setEditStatus('Loaded CMS draft');
        return true;
      }

      return false;
    }

    if (
      !options.force &&
      window.TTMSContentDrafts &&
      typeof window.TTMSContentDrafts.getPreview === 'function'
    ) {
      var cached = window.TTMSContentDrafts.getPreview(contentPath);
      if (cached) return Promise.resolve(applyPreview(cached));
    }

    var token = (typeof AuthClient !== 'undefined' && AuthClient.getAccessToken) ? AuthClient.getAccessToken() : null;
    var url = CMS_SERVICE_URL.replace(/\/+$/, '') + '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/previews';
    var headers = { Accept: 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(url, { method: 'GET', credentials: 'include', headers: headers })
      .then(function(res) { return res.ok ? res.json() : { previews: [] }; })
      .catch(function() { return { previews: [] }; })
      .then(function(data) {
        var list = dedupePreviewsByContentPath(data && data.previews ? data.previews : []);
        var match = null;
        list.forEach(function(p) {
          var payload = p.payload || p.Payload || {};
          var cp = p.content_path || payload.contentPath || '';
          if (cp === contentPath) match = p;
        });
        return applyPreview(match);
      });
  }

  function dedupePreviewsByContentPath(previews) {
    if (!previews || !previews.length) return [];
    var best = {};
    previews.forEach(function(p) {
      var payload = p.payload || p.Payload || {};
      var path = p.content_path || payload.contentPath || '';
      if (!path) return;
      var cur = best[path];
      var t = new Date(p.updated_at || p.UpdatedAt || 0).getTime();
      if (!cur || t >= new Date(cur.updated_at || cur.UpdatedAt || 0).getTime()) {
        best[path] = p;
      }
    });
    return Object.keys(best).map(function(k) { return best[k]; });
  }

  function frontMatterModsToFlat(mods) {
    if (!Array.isArray(mods)) return [];
    var out = [];
    mods.forEach(function(m) {
      if (m && typeof m === 'object' && m.name != null) {
        out.push(String(m.name), typeof m.price === 'number' ? m.price : parseFloat(m.price) || 0);
      }
    });
    return out;
  }

  var _loadDraftsInFlight = null;

  function normalizeItemUrlForMatch(u) {
    if (!u || typeof u !== 'string') return '';
    return u.replace(/\/+$/, '') + '/';
  }

  function ensureEditPanelExpanded() {
    if (!asideEl || !btnTogglePanel) return;
    asideEl.classList.remove('dashboard-edit-options-collapsed');
    btnTogglePanel.setAttribute('aria-expanded', 'true');
    btnTogglePanel.setAttribute('aria-label', 'Collapse edit panel');
    var icon = btnTogglePanel.querySelector('.dashboard-edit-options-toggle-icon');
    if (icon) icon.textContent = '\u25C0';
  }

  function applyPendingAddFromSessionStorage() {
    try {
      var doc = iframe && iframe.contentDocument;
      if (!doc) return;

      var addSection = sessionStorage.getItem('editMenuPendingAddSection');
      if (addSection === '1') {
        sessionStorage.removeItem('editMenuPendingAddSection');
        var sectionBtn = doc.querySelector('.dashboard-edit-add-section-btn');
        if (sectionBtn) sectionBtn.click();
        return;
      }

      var addItemSlug = sessionStorage.getItem('editMenuPendingAddItemSection') || '';
      if (addItemSlug) {
        sessionStorage.removeItem('editMenuPendingAddItemSection');
        var esc = addItemSlug.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        var itemBtn = doc.querySelector(
          '.dashboard-edit-add-item-bar[data-section-slug="' + esc + '"] .dashboard-edit-add-item-btn'
        );
        if (itemBtn) itemBtn.click();
      }
    } catch (err) {
      /* ignore */
    }
  }

  function focusEditTargetFromSessionStorage() {
    var promoCatalogIndex = '';
    var promoId = '';
    try {
      promoCatalogIndex = sessionStorage.getItem('editMenuFocusPromoCatalogIndex') || '';
      if (promoCatalogIndex) sessionStorage.removeItem('editMenuFocusPromoCatalogIndex');
      promoId = sessionStorage.getItem('editMenuFocusPromoId') || '';
      if (promoId) sessionStorage.removeItem('editMenuFocusPromoId');
    } catch (e) { /* ignore */ }

    try {
      var doc = iframe.contentDocument;
      if (!doc) return;

      if (promoCatalogIndex !== '' || promoId) {
        var slide = null;
        doc.querySelectorAll('article.ads-reels-slide').forEach(function(el) {
          if (slide) return;
          if (promoCatalogIndex !== '' && el.getAttribute('data-catalog-index') === String(promoCatalogIndex)) {
            slide = el;
          } else if (promoId && el.getAttribute('data-ad-id') === promoId) {
            slide = el;
          }
        });
        if (slide) {
          var promoEditBtn = slide.querySelector('.dashboard-edit-ad-btn-wrap .dashboard-edit-btn');
          if (promoEditBtn) promoEditBtn.click();
        }
        return;
      }

      var itemUrl = '';
      try {
        itemUrl = sessionStorage.getItem('editMenuFocusItemUrl') || '';
        if (itemUrl) sessionStorage.removeItem('editMenuFocusItemUrl');
      } catch (e2) { /* ignore */ }
      if (!itemUrl) return;

      var targetNorm = normalizeItemUrlForMatch(itemUrl);
      var card = null;
      doc.querySelectorAll('.menu-item-card').forEach(function(el) {
        if (card) return;
        var du = el.getAttribute('data-item-url') || '';
        if (normalizeItemUrlForMatch(du) === targetNorm) card = el;
      });
      if (!card) return;
      var editBtn = card.querySelector('.dashboard-edit-card-btn-wrap .dashboard-edit-btn');
      if (editBtn) editBtn.click();
    } catch (err) { /* ignore */ }
  }

  function prefetchEmbedDraftPaths() {
    if (!embedPanelMode) return Promise.resolve();
    var base = '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/previews';
    return getFromCMS(base).then(function(data) {
      var list = dedupePreviewsByContentPath(data && data.previews ? data.previews : []);
      list.forEach(function(p) {
        storeDraftPreviewRecord(p);
        var payload = p.payload || p.Payload || {};
        var cp = p.content_path || payload.contentPath || payload.content_path || '';
        if (cp) draftContentPaths.add(cp);
      });
      try {
        var pw = parentMenuWindow;
        if (pw && pw.DashboardMenuStatus && typeof pw.DashboardMenuStatus.registerDraftPreviewsForAnalysis === 'function') {
          pw.DashboardMenuStatus.registerDraftPreviewsForAnalysis(list);
        }
      } catch (ePw) { /* ignore */ }
      ensureDraftChangeDetails(list.map(function(p) {
        var payload = p.payload || p.Payload || {};
        return p.content_path || payload.contentPath || payload.content_path || '';
      }).filter(Boolean));
      applyEditHighlights();
      syncPendingChangesPanel();
    }).catch(function() { /* ignore */ });
  }

  function focusEditTargetInParentMenu() {
    if (!embedPanelMode || !parentMenuWindow) {
      setEmbedPanelLoading(false);
      notifyEmbedPanelFormReady();
      return;
    }
    try {
      var doc = parentMenuWindow.document;
      if (!doc) {
        setEmbedPanelLoading(false);
        notifyEmbedPanelFormReady();
        return;
      }

      var promoCatalogIndex = '';
      var promoId = '';
      try {
        promoCatalogIndex = sessionStorage.getItem('editMenuFocusPromoCatalogIndex') || '';
        if (promoCatalogIndex) sessionStorage.removeItem('editMenuFocusPromoCatalogIndex');
        promoId = sessionStorage.getItem('editMenuFocusPromoId') || '';
        if (promoId) sessionStorage.removeItem('editMenuFocusPromoId');
      } catch (e0) { /* ignore */ }

      if (promoCatalogIndex !== '' || promoId) {
        var slide = null;
        doc.querySelectorAll('article.ads-reels-slide').forEach(function (el) {
          if (slide) return;
          if (promoCatalogIndex !== '' && el.getAttribute('data-catalog-index') === String(promoCatalogIndex)) {
            slide = el;
          } else if (promoId && el.getAttribute('data-ad-id') === promoId) {
            slide = el;
          }
        });
        if (!slide) {
          setEmbedPanelLoading(false);
          notifyEmbedPanelFormReady();
          return;
        }
        ensureEditPanelExpanded();
        syncPromotionDataset(slide, parentMenuWindow, doc);
        if (selectedElement && selectedElement.classList) selectedElement.classList.remove('dashboard-edit-selected');
        slide.classList.add('dashboard-edit-selected');
        selectedElement = slide;
        var promoTitle = slide.getAttribute('data-ad-title') || '';
        var promoContentPath = promotionContentPathFromElement(slide, parentMenuWindow, doc) || 'content/promotions/....md';
        showEditForm({
          element: slide,
          type: 'Promotion / Ad',
          contentType: 'promotion',
          contentPath: promoContentPath,
          title: promoTitle,
          description: '',
        });
        return;
      }

      var sectionSlug = '';
      try {
        sectionSlug = sessionStorage.getItem('editMenuFocusSectionSlug') || '';
        if (sectionSlug) sessionStorage.removeItem('editMenuFocusSectionSlug');
      } catch (eSection) { /* ignore */ }
      if (sectionSlug) {
        var escSlug = sectionSlug.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        var sectionHeader = doc.querySelector('.menu-header[data-section-slug="' + escSlug + '"]');
        if (!sectionHeader) {
          setEmbedPanelLoading(false);
          notifyEmbedPanelFormReady();
          return;
        }
        ensureEditPanelExpanded();
        if (selectedElement && selectedElement.classList) selectedElement.classList.remove('dashboard-edit-selected');
        sectionHeader.classList.add('dashboard-edit-selected');
        selectedElement = sectionHeader;
        var sectionTitleEl = sectionHeader.querySelector('h2 a, h2');
        var sectionTitle = sectionTitleEl ? getTextContent(sectionTitleEl) : sectionHeader.getAttribute('data-reel-section') || '';
        var sectionDescEl = sectionHeader.querySelector('.menu-summary');
        var sectionDesc = sectionDescEl ? getTextContent(sectionDescEl) : '';
        var sectionContentPath = 'content/' + sectionSlug + '/_index.md';
        showEditForm({
          element: sectionHeader,
          type: 'Section header',
          contentType: 'section-header',
          contentPath: sectionContentPath,
          title: sectionTitle,
          description: sectionDesc,
        });
        return;
      }

      var itemUrl = '';
      try {
        itemUrl = sessionStorage.getItem('editMenuFocusItemUrl') || '';
        if (itemUrl) sessionStorage.removeItem('editMenuFocusItemUrl');
      } catch (e1) { /* ignore */ }
      if (!itemUrl) {
        setEmbedPanelLoading(false);
        notifyEmbedPanelFormReady();
        return;
      }

      var targetNorm = normalizeItemUrlForMatch(itemUrl);
      var card = null;
      doc.querySelectorAll('.menu-item-card').forEach(function (el) {
        if (card) return;
        var du = el.getAttribute('data-item-url') || '';
        if (normalizeItemUrlForMatch(du) === targetNorm) card = el;
      });
      if (!card) {
        setEmbedPanelLoading(false);
        notifyEmbedPanelFormReady();
        return;
      }

      ensureEditPanelExpanded();
      if (selectedElement && selectedElement.classList) selectedElement.classList.remove('dashboard-edit-selected');
      card.classList.add('dashboard-edit-selected');
      selectedElement = card;
      var title = getTextContent(card.querySelector('.menu-item-title, .menu-item-title a') || card);
      var desc = getTextContent(card.querySelector('.menu-item-description') || card);
      var contentPath = itemUrl ? 'content' + itemUrl.replace(/\/$/, '') + '.md' : 'content/.../item.md';
      showEditForm({
        element: card,
        type: 'Menu item',
        contentType: 'menu-item',
        contentPath: contentPath,
        title: title,
        description: desc,
      });
    } catch (err) {
      setEmbedPanelLoading(false);
      notifyEmbedPanelFormReady();
    }
  }

  function findMenuItemsContainerForSectionSlug(doc, sectionSlug) {
    if (!doc) return null;
    var header = getSectionHeaderForSlug(doc, sectionSlug);
    if (isMenuReelsPreview(doc) && header) {
      return { __reelsHeader: header, __reelsTrack: getMenuReelsTrack(doc) };
    }
    if (header) {
      var bg = header.closest('.main-menu-bg');
      var c = bg && bg.querySelector('.menu-items-container');
      if (c) return c;
    }
    var pack = doc.getElementById('packery-container') || doc.body;
    return pack.querySelector('.menu-items-container') || doc.querySelector('.main-menu-bg .menu-items-container');
  }

  /**
   * If a CMS preview has no matching card yet, insert a placeholder (content/<section>/<slug>.md).
   */
  function ensureMenuItemPlaceholderCardFromPreview(doc, win, itemUrl, contentPath, fm, body) {
    if (!doc || !win || typeof win._dashboardCreateNewMenuItemCard !== 'function') return;
    var cp = String(contentPath || '');
    if (!cp || cp.indexOf('content/') !== 0) return;
    var norm = normalizeItemUrlForMatch(itemUrl);
    var esc = norm.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    if (doc.querySelector('.menu-item-card[data-item-url="' + esc + '"]')) return;

    var title = fm && fm.title != null ? String(fm.title) : 'New item';
    var summary = body != null && body !== '' ? String(body) : '';
    var mp = cp.match(/^content\/([^/]+)\/([^/]+)\.md$/);
    if (!mp) return;
    var cardOpts = { title: title, summary: summary, sectionSlug: mp[1], nid: mp[2] };
    var sectionForContainer = mp[1];

    var card = win._dashboardCreateNewMenuItemCard(doc, cardOpts);
    var header = getSectionHeaderForSlug(doc, sectionForContainer);
    if (!header) return;
    var track = isMenuReelsPreview(doc) ? getMenuReelsTrack(doc) : null;
    var bar = track
      ? track.querySelector('.dashboard-edit-add-item-bar[data-section-slug="' + String(sectionForContainer).replace(/"/g, '\\"') + '"]')
      : null;
    if (!bar && !isMenuReelsPreview(doc)) {
      var container = findMenuItemsContainerForSectionSlug(doc, sectionForContainer);
      if (container && container.querySelector) bar = container.querySelector('.dashboard-edit-add-item-bar');
    }
    insertMenuItemCardInSection(doc, header, card, bar);
    if (win._dashboardInjectEditButtons) win._dashboardInjectEditButtons();
  }

  /** Loads CMS content previews into the iframe. Coalesces concurrent calls (snapshot bootstrap + iframe load both trigger this). */
  function loadAndApplyDrafts() {
    var doc = iframe.contentDocument;
    var win = iframe.contentWindow;
    if (!win || !win.__dashboardApplyEdit || !doc) return;
    if (_loadDraftsInFlight) return _loadDraftsInFlight;
    var token = (typeof AuthClient !== 'undefined' && AuthClient.getAccessToken) ? AuthClient.getAccessToken() : (typeof localStorage !== 'undefined' ? localStorage.getItem('ttmenus_access_token') : null);
    var url = CMS_SERVICE_URL.replace(/\/+$/, '') + '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/previews';
    var headers = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    cmsLogJson('GET content/previews (loadAndApplyDrafts) →', url, {});
    _loadDraftsInFlight = fetch(url, { method: 'GET', credentials: 'include', headers: headers })
      .then(function(res) { return res.ok ? res.json() : { previews: [] }; })
      .catch(function() { return { previews: [] }; })
      .then(function(data) {
        cmsLogJson('GET content/previews (loadAndApplyDrafts) ←', url, data);
        var list = dedupePreviewsByContentPath(data && data.previews && Array.isArray(data.previews) ? data.previews : []);
        var applied = 0;
        list.forEach(function(preview) {
          var p = preview.payload || preview.Payload || {};
          var kind = p.kind || preview.kind;
          var contentPath = p.contentPath || preview.content_path || p.content_path || '';
          if (
            themeOnlyMode &&
            kind !== 'theme-css' &&
            contentPath !== THEME_COLORS_CONTENT_PATH &&
            contentPath !== THEME_OVERRIDES_LEGACY_PATH
          ) {
            return;
          }
          var fm = p.frontMatter || p.front_matter || {};
          var title = fm.title != null ? fm.title : '';

          if (kind === 'theme-css' || contentPath === THEME_COLORS_CONTENT_PATH || contentPath === THEME_OVERRIDES_LEGACY_PATH) {
            themeColorSuppressPersist++;
            try {
              var parsed = parseThemeOverridesFromCss(p.body || '');
              Object.keys(COLOR_OVERRIDE_VALUES).forEach(function(k) { delete COLOR_OVERRIDE_VALUES[k]; });
              Object.keys(parsed).forEach(function(k) { COLOR_OVERRIDE_VALUES[k] = parsed[k]; });
              applyColorOverrides();
            } finally {
              themeColorSuppressPersist--;
            }
            applied++;
            return;
          }

          if (kind === 'menu-item') {
            var itemUrl = '/' + String(contentPath).replace(/^content\//, '').replace(/\.md$/, '') + '/';
            var description = (p.body != null ? p.body : '') || '';
            var prices = fm.prices;
            var pricesArray = [];
            if (Array.isArray(prices)) {
              prices.forEach(function(pr) {
                pricesArray.push(pr.variable1 != null ? pr.variable1 : '-', pr.variable2 != null ? pr.variable2 : '-', Number(pr.price));
              });
            }
            var payload = { itemUrl: itemUrl, title: title, description: description };
            if (pricesArray.length) payload.pricesArray = pricesArray;
            var sc = fm.side_categories != null ? fm.side_categories : fm.sideCategories;
            if (sc !== undefined) payload.sideCategories = Array.isArray(sc) ? sc : [];
            if (fm.images !== undefined) payload.imagesArray = pathsFromFmImages(fm.images);
            if (fm.modifications !== undefined) payload.modificationsFlat = frontMatterModsToFlat(fm.modifications);
            if (fm.additions !== undefined) payload.additionsFlat = frontMatterModsToFlat(fm.additions);
            if (fm.tags !== undefined) payload.tags = Array.isArray(fm.tags) ? fm.tags : [];
            if (fm.ingredients !== undefined) payload.ingredients = Array.isArray(fm.ingredients) ? fm.ingredients : [];
            if (fm.cookingmethods !== undefined) payload.cookingmethods = Array.isArray(fm.cookingmethods) ? fm.cookingmethods : [];
            if (fm.types !== undefined) payload.types = Array.isArray(fm.types) ? fm.types : [];
            if (fm.events !== undefined) payload.events = Array.isArray(fm.events) ? fm.events : [];
            if (fm.promotions !== undefined) payload.promotions = fm.promotions;
            if (fm.availability !== undefined) payload.availability = fm.availability;
            try {
              ensureMenuItemPlaceholderCardFromPreview(doc, win, itemUrl, contentPath, fm, p.body);
              win.__dashboardApplyEdit(JSON.stringify(payload));
              if (fm.weight != null) {
                var cardEl = doc.querySelector('.menu-item-card[data-item-url="' + itemUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]');
                if (cardEl) cardEl.setAttribute('data-weight', String(fm.weight));
              }
              applied++;
            } catch (e) { console.warn('Apply draft failed', e); }
            return;
          }

          if (kind === 'section-header') {
            var sectionSlug = String(contentPath).replace(/^content\//, '').replace(/\/_index\.md$/, '').trim();
            if (!sectionSlug) return;
            var header = doc.querySelector('.menu-header[data-section-slug="' + sectionSlug.replace(/"/g, '\\"') + '"]');
            if (!header) return;
            var titleEl = header.querySelector('.menu-item-title a, .menu-item-title, h1, h2');
            if (titleEl && sectionSlug.toLowerCase() !== 'promotions') {
              var a = titleEl.querySelector('a');
              if (a) a.textContent = title; else titleEl.textContent = title;
            }
            if (fm.weight != null) header.setAttribute('data-weight', String(fm.weight));
            if (fm.icon != null) header.setAttribute('data-icon', String(fm.icon));
            var sectionPaths = sectionImagePathsFromFrontMatter(fm);
            var topSrc = sectionPaths.primary;
            var bottomSrc = sectionPaths.secondary;
            header.setAttribute('data-images-primary', topSrc);
            header.setAttribute('data-images-secondary', bottomSrc);
            if (topSrc) {
              topSrc = topSrc.indexOf('/') === 0 ? topSrc : '/' + topSrc;
              var topImg = header.querySelector('a img.food, img.food.item');
              if (topImg) topImg.setAttribute('src', topSrc);
              else {
                var wrap = header.querySelector('a[href]:not(.menu-anchor)');
                if (wrap) {
                  var img = doc.createElement('img');
                  img.className = 'food item aos-init aos-animate';
                  img.setAttribute('data-aos', 'zoom-out');
                  img.src = topSrc;
                  img.alt = title;
                  img.loading = 'lazy';
                  wrap.appendChild(img);
                }
              }
            } else {
              var t = header.querySelector('a img.food, img.food.item');
              if (t) t.remove();
            }
            if (bottomSrc) {
              bottomSrc = bottomSrc.indexOf('/') === 0 ? bottomSrc : '/' + bottomSrc;
              var bottomImg = header.querySelector('.slideinimg');
              var h2 = header.querySelector('h2');
              if (bottomImg) bottomImg.setAttribute('src', bottomSrc);
              else if (h2) {
                var slideImg = doc.createElement('img');
                slideImg.className = 'slideinimg aos-init aos-animate';
                slideImg.setAttribute('data-aos', 'zoom-out-right');
                slideImg.src = bottomSrc;
                slideImg.alt = title + ' decoration';
                slideImg.loading = 'lazy';
                h2.appendChild(slideImg);
              }
            } else {
              var b = header.querySelector('.slideinimg');
              if (b) b.remove();
            }
            applied++;
          }
        });
        if (applied > 0) setEditStatus('Loaded ' + applied + ' draft(s)');
        draftContentPaths.clear();
        draftChangeDetailsCache = {};
        draftChangeDetailsProvisionalPaths.clear();
        list.forEach(function(p) {
          storeDraftPreviewRecord(p);
          var payload = p.payload || p.Payload || {};
          var cp = payload.contentPath || p.content_path || '';
          if (cp) draftContentPaths.add(cp);
        });
        if (editMode && iframeEditOverlayActive()) applyEditHighlights();
        syncMenuItemWeightsFromDom(doc);
        syncMenublockOrderFromSections(doc);
      })
      .finally(function() { _loadDraftsInFlight = null; });
    return _loadDraftsInFlight;
  }

  function getContentPathForElement(doc, el) {
    if (!doc || !el) return null;
    if (el.classList && el.classList.contains('menu-item-card')) {
      var itemUrl = el.getAttribute('data-item-url') || '';
      if (!itemUrl) return null;
      var trimmed = itemUrl.replace(/\/$/, '');
      return 'content' + trimmed + '.md';
    }
    if (el.classList && el.classList.contains('menu-header')) {
      var sectionSlug = el.getAttribute('data-section-slug') || '';
      if (!sectionSlug) return null;
      return 'content/' + sectionSlug + '/_index.md';
    }
    if (isPromotionReelsSlide(el) || isPromotionPreviewPanel(el)) {
      var win = iframe && iframe.contentWindow;
      return promotionContentPathFromElement(el, win, doc);
    }
    if (isLegacyPromotionSection(el)) {
      var adTitle = el.getAttribute('data-ad-title') || '';
      if (!adTitle) {
        var titleEl = el.querySelector('.clientad-heading a, .clientad-heading, h2 a, h2');
        if (titleEl) adTitle = (titleEl.textContent || '').trim();
      }
      var slug = adTitle ? adTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '';
      return slug ? 'content/promotions/' + slug + '.md' : null;
    }
    return null;
  }

  var PENDING_CHANGE_STATUS_LABELS = {
    draft: 'Modified',
    new: 'New',
    delete: 'Marked delete',
    unsaved: 'Unsaved'
  };

  function kindLabelFromContentPath(path) {
    if (!path || path === '__unsaved__') return 'Edit';
    if (path === THEME_COLORS_CONTENT_PATH || path === THEME_OVERRIDES_LEGACY_PATH) return 'Theme';
    if (path.indexOf('content/promotions/') === 0) return 'Promotion';
    if (/\/_index\.md$/i.test(path)) return 'Section';
    if (path.indexOf('content/') === 0) return 'Menu item';
    if (path.indexOf('data/locations') === 0) return 'Location';
    return 'Content';
  }

  function titleLabelFromContentPath(doc, path) {
    if (!path || path === '__unsaved__') return 'Unsaved form edits';
    if (path === THEME_COLORS_CONTENT_PATH || path === THEME_OVERRIDES_LEGACY_PATH) return 'Theme colors';
    if (doc) {
      var itemMatch = path.match(/^content\/(.+)\/([^/]+)\.md$/i);
      if (itemMatch && itemMatch[2] !== '_index') {
        var itemUrl = '/' + itemMatch[1] + '/' + itemMatch[2] + '/';
        var esc = itemUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        var card = doc.querySelector('.menu-item-card[data-item-url="' + esc + '"]');
        if (card) {
          var tEl = card.querySelector('.menu-item-title a, .menu-item-title');
          if (tEl) return (tEl.textContent || '').trim() || itemMatch[2];
        }
        return itemMatch[2].replace(/-/g, ' ');
      }
      var secMatch = path.match(/^content\/([^/]+)\/_index\.md$/i);
      if (secMatch) {
        var slug = secMatch[1];
        var header = doc.querySelector('.menu-header[data-section-slug="' + slug.replace(/"/g, '\\"') + '"]');
        if (header) {
          var hEl = header.querySelector('h2 a, h2.center.title a, h2');
          if (hEl) return (hEl.textContent || '').trim() || slug;
        }
        return slug.replace(/-/g, ' ');
      }
      var promoMatch = path.match(/^content\/promotions\/([^/]+)\.md$/i);
      if (promoMatch) {
        var pSlug = promoMatch[1];
        var slides = doc.querySelectorAll('article.ads-reels-slide[data-ad-title], article.ads-reels-slide[data-ad-url]');
        for (var i = 0; i < slides.length; i++) {
          var slide = slides[i];
          if (promotionSlugFromElement(slide) === pSlug) {
            return slide.getAttribute('data-ad-title') || pSlug.replace(/-/g, ' ');
          }
        }
        return pSlug.replace(/-/g, ' ');
      }
    }
    return path.replace(/^content\//, '').replace(/\.md$/i, '').replace(/\/_index$/i, '');
  }

  function findElementForContentPath(doc, path) {
    if (!doc || !path || path === '__unsaved__') return selectedElement || null;
    if (path === THEME_COLORS_CONTENT_PATH || path === THEME_OVERRIDES_LEGACY_PATH) return null;
    var itemMatch = path.match(/^content\/(.+)\/([^/]+)\.md$/i);
    if (itemMatch && itemMatch[2] !== '_index') {
      var itemUrl = '/' + itemMatch[1] + '/' + itemMatch[2] + '/';
      var esc = itemUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return doc.querySelector('.menu-item-card[data-item-url="' + esc + '"]');
    }
    var secMatch = path.match(/^content\/([^/]+)\/_index\.md$/i);
    if (secMatch) {
      return doc.querySelector('.menu-header[data-section-slug="' + secMatch[1].replace(/"/g, '\\"') + '"]');
    }
    var promoMatch = path.match(/^content\/promotions\/([^/]+)\.md$/i);
    if (promoMatch) {
      var pSlug = promoMatch[1];
      var slides = doc.querySelectorAll('article.ads-reels-slide');
      for (var i = 0; i < slides.length; i++) {
        if (promotionSlugFromElement(slides[i]) === pSlug) return slides[i];
      }
    }
    return null;
  }

  function currentSectionSlugFromEdit() {
    if (selectedInfo && selectedInfo.contentPath) {
      var m = String(selectedInfo.contentPath).match(/^content\/([^/]+)\/_index\.md$/i);
      if (m) return m[1].toLowerCase();
    }
    if (selectedElement && selectedElement.classList && selectedElement.classList.contains('menu-header')) {
      return sectionSlugFromHeaderEl(selectedElement);
    }
    return '';
  }

  function contentPathInSection(contentPath, sectionSlug) {
    if (!contentPath || !sectionSlug || contentPath === '__unsaved__') return false;
    var slug = String(sectionSlug).toLowerCase();
    var p = String(contentPath).replace(/\\/g, '/');
    if (p === 'content/' + slug + '/_index.md') return true;
    if (p.indexOf('content/' + slug + '/') === 0 && p.endsWith('.md') && !p.endsWith('/_index.md')) return true;
    return false;
  }

  function sectionHeaderDescriptionText(headerEl) {
    if (!headerEl) return '';
    var descEl = headerEl.querySelector('.menu-item-description, .menu-summary');
    if (!descEl) return '';
    var p = descEl.querySelector('p');
    return (p ? p.textContent : descEl.textContent || '').trim();
  }

  function fetchLiveContentFilesBatch(paths) {
    if (!paths || !paths.length) return Promise.resolve({});
    var url = '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/files/batch';
    return postToCMS(url, { paths: paths }).then(function(data) {
      var files = (data && data.files) || {};
      var out = {};
      paths.forEach(function(p) {
        if (files[p]) out[p] = files[p];
      });
      return out;
    }).catch(function() {
      return {};
    });
  }

  function overlayFmValueEmpty(v) {
    if (v == null) return true;
    if (typeof v === 'string' && !v.trim()) return true;
    if (Array.isArray(v) && !v.length) return true;
    return false;
  }

  function mergeDraftFrontMatter(liveFm, draftFm) {
    var live = liveFm || {};
    var merged = Object.assign({}, live);
    Object.keys(draftFm || {}).forEach(function(k) {
      var v = draftFm[k];
      if (!overlayFmValueEmpty(v)) merged[k] = v;
    });
    return merged;
  }

  function formatDraftFieldLabel(key) {
    var labels = {
      weight: 'Position',
      title: 'Title',
      icon: 'Icon',
      images: 'Images',
      prices: 'Prices',
      tags: 'Tags',
      ingredients: 'Ingredients',
      cookingmethods: 'Cooking methods',
      types: 'Types',
      events: 'Events',
      promotions: 'Promotions',
      side_categories: 'Side categories'
    };
    return labels[key] || String(key).replace(/_/g, ' ');
  }

  function lineDiffSummary(oldText, newText) {
    oldText = String(oldText || '');
    newText = String(newText || '');
    if (oldText === newText) return 'no line changes';
    var oldLines = oldText.split('\n');
    var newLines = newText.split('\n');
    var oldCount = {};
    var newCount = {};
    var added = 0;
    var removed = 0;
    oldLines.forEach(function(l) { oldCount[l] = (oldCount[l] || 0) + 1; });
    newLines.forEach(function(l) { newCount[l] = (newCount[l] || 0) + 1; });
    Object.keys(oldCount).forEach(function(l) {
      var n = newCount[l] || 0;
      if (oldCount[l] > n) removed += oldCount[l] - n;
    });
    Object.keys(newCount).forEach(function(l) {
      var o = oldCount[l] || 0;
      if (newCount[l] > o) added += newCount[l] - o;
    });
    if (!added && !removed) return 'updated';
    return '+' + added + ' \u2212' + removed + ' lines';
  }

  function describeImagesFmChange(liveImg, mergedImg) {
    var o = liveImg || {};
    var n = mergedImg || {};
    var parts = [];
    if (o.primary !== n.primary) {
      parts.push('Primary: ' + truncateChangeDetail(o.primary) + ' \u2192 ' + truncateChangeDetail(n.primary || '(removed)'));
    }
    if (o.secondary !== n.secondary) {
      parts.push('Secondary: ' + truncateChangeDetail(o.secondary) + ' \u2192 ' + truncateChangeDetail(n.secondary || '(removed)'));
    }
    return parts;
  }

  function provisionalDraftDetailsFromPayload(payload) {
    var details = [];
    var fm = payload.frontMatter || {};
    if (String(payload.body || '').trim()) details.push('Description edited');
    Object.keys(fm).forEach(function(k) {
      if (overlayFmValueEmpty(fm[k])) return;
      if (k === 'images' && fm.images) {
        if (fm.images.primary) details.push('Primary image \u2192 ' + truncateChangeDetail(fm.images.primary));
        if (fm.images.secondary) details.push('Secondary image \u2192 ' + truncateChangeDetail(fm.images.secondary));
      } else if (k === 'icon') details.push('Icon \u2192 ' + truncateChangeDetail(fm.icon));
      else if (k === 'title') details.push('Title \u2192 ' + truncateChangeDetail(fm.title));
      else if (k === 'weight') details.push('Position \u2192 weight ' + truncateChangeDetail(String(fm[k])));
      else if (k === 'prices') {
        details.push('Prices \u2192 ' + (Array.isArray(fm.prices) ? fm.prices.length + ' variant(s)' : 'updated'));
      } else details.push(formatDraftFieldLabel(k) + ' updated');
    });
    return details.length ? details : ['Content updated in draft'];
  }

  function describeDraftChanges(payload, live) {
    var details = [];
    var draftFm = payload.frontMatter || {};
    var liveFm = (live && live.frontMatter) || (live && live.front_matter) || {};
    var mergedFm = mergeDraftFrontMatter(liveFm, draftFm);
    var liveBody = String((live && live.body) || '').trim();
    var draftBody = String(payload.body || '').trim();
    var mergedBody = draftBody || liveBody;
    var reorderKeys = ['title', 'weight', 'date'];

    if (draftBody && mergedBody !== liveBody) {
      details.push('Description: ' + lineDiffSummary(liveBody, mergedBody));
    }
    reorderKeys.forEach(function(k) {
      if (jsonArraysEqual(liveFm[k], mergedFm[k])) return;
      details.push(
        formatDraftFieldLabel(k) + ': ' + truncateChangeDetail(liveFm[k]) + ' \u2192 ' + truncateChangeDetail(mergedFm[k])
      );
    });
    if (!jsonArraysEqual(liveFm.icon, mergedFm.icon)) {
      details.push('Icon: ' + truncateChangeDetail(liveFm.icon) + ' \u2192 ' + truncateChangeDetail(mergedFm.icon));
    }
    if (!jsonArraysEqual(liveFm.images, mergedFm.images)) {
      describeImagesFmChange(liveFm.images, mergedFm.images).forEach(function(line) {
        details.push(line);
      });
    }
    var skip = { title: 1, weight: 1, date: 1, icon: 1, images: 1 };
    var seen = {};
    Object.keys(liveFm).forEach(function(k) { seen[k] = 1; });
    Object.keys(mergedFm).forEach(function(k) { seen[k] = 1; });
    Object.keys(seen).forEach(function(k) {
      if (skip[k]) return;
      if (jsonArraysEqual(liveFm[k], mergedFm[k])) return;
      if (k === 'prices') {
        var n = Array.isArray(mergedFm.prices) ? mergedFm.prices.length : 0;
        var o = Array.isArray(liveFm.prices) ? liveFm.prices.length : 0;
        details.push('Prices: ' + o + ' \u2192 ' + n + ' variant(s)');
      } else {
        details.push(
          formatDraftFieldLabel(k) + ': ' + truncateChangeDetail(liveFm[k]) + ' \u2192 ' + truncateChangeDetail(mergedFm[k])
        );
      }
    });
    if (!details.length && live) return ['No field changes vs published'];
    if (!details.length) return provisionalDraftDetailsFromPayload(payload);
    return details;
  }

  function previewPayloadFromRecord(p) {
    var payload = p.payload || p.Payload || {};
    return {
      kind: payload.kind || 'content',
      contentPath: p.content_path || payload.contentPath || payload.content_path || '',
      frontMatter: payload.frontMatter || payload.front_matter || {},
      body: payload.body != null ? String(payload.body) : ''
    };
  }

  function storeDraftPreviewRecord(p) {
    if (!p) return;
    var payload = p.payload || p.Payload || {};
    var cp = p.content_path || payload.contentPath || payload.content_path || '';
    if (cp) {
      draftPreviewRecordsByPath[cp] = p;
      delete draftChangeDetailsCache[cp];
      draftChangeDetailsProvisionalPaths.delete(cp);
    }
  }

  function draftChangeDetailsForPath(path) {
    if (!path) return null;
    if (draftChangeDetailsCache[path]) return draftChangeDetailsCache[path];
    try {
      var pw = parentMenuWindow;
      if (pw && pw.DashboardMenuStatus && typeof pw.DashboardMenuStatus.getDraftChangeDetails === 'function') {
        var fromParent = pw.DashboardMenuStatus.getDraftChangeDetails(path);
        if (fromParent && fromParent.length) return fromParent;
      }
    } catch (e) { /* ignore */ }
    var rec = draftPreviewRecordsByPath[path];
    if (rec) return provisionalDraftDetailsFromPayload(previewPayloadFromRecord(rec));
    return null;
  }

  function draftDetailsForChange(change) {
    if (!change || change.status !== 'draft' || !change.path) return change && change.details;
    var details = draftChangeDetailsCache[change.path] || draftChangeDetailsForPath(change.path);
    return details && details.length ? details : (change.details || ['CMS draft pending']);
  }

  var draftChangeDetailsInFlight = null;

  function ensureDraftChangeDetails(paths) {
    paths = (paths || []).filter(function(p) { return p && draftContentPaths.has(p); });
    var todo = paths.filter(function(p) {
      return !draftChangeDetailsCache[p] || draftChangeDetailsProvisionalPaths.has(p);
    });
    if (!todo.length) return Promise.resolve();

    todo.forEach(function(p) {
      var rec = draftPreviewRecordsByPath[p];
      if (rec) {
        draftChangeDetailsCache[p] = provisionalDraftDetailsFromPayload(previewPayloadFromRecord(rec));
        draftChangeDetailsProvisionalPaths.add(p);
      }
    });
    syncPendingChangesPanel();

    if (draftChangeDetailsInFlight) return draftChangeDetailsInFlight;

    draftChangeDetailsInFlight = fetchLiveContentFilesBatch(todo).then(function(liveByPath) {
      todo.forEach(function(p) {
        var rec = draftPreviewRecordsByPath[p];
        if (!rec) return;
        var payload = previewPayloadFromRecord(rec);
        draftChangeDetailsCache[p] = describeDraftChanges(payload, liveByPath[p]);
        draftChangeDetailsProvisionalPaths.delete(p);
      });
    }).catch(function() { /* ignore */ }).finally(function() {
      draftChangeDetailsInFlight = null;
      syncPendingChangesPanel();
    });
    return draftChangeDetailsInFlight;
  }

  function collectSectionUnsavedFieldDetails(headerEl) {
    var details = [];
    if (!headerEl) return details;
    var icon = inputSectionIcon ? inputSectionIcon.value.trim() : '';
    var domIcon = (headerEl.getAttribute('data-icon') || '').trim();
    if (icon !== domIcon) {
      details.push('Icon → ' + (icon || '(removed)'));
    }
    if (!isPromotionsSectionHeader(headerEl)) {
      var title = sectionTitleForPayload(headerEl);
      var domTitle = lockedSectionTitleFromHeader(headerEl);
      if (title !== domTitle) {
        details.push('Title → ' + (title || '(empty)'));
      }
    }
    var desc = inputSectionDesc ? inputSectionDesc.value.trim() : '';
    var domDesc = sectionHeaderDescriptionText(headerEl);
    if (desc !== domDesc) {
      details.push('Description → ' + truncateChangeDetail(desc));
    }
    var priImg = inputSectionImageBottom ? inputSectionImageBottom.value.trim() : '';
    var domPri = (headerEl.getAttribute('data-images-primary') || '').trim();
    if (priImg !== domPri) {
      details.push('Primary image → ' + (priImg || '(removed)'));
    }
    var secImg = inputSectionImageTop ? inputSectionImageTop.value.trim() : '';
    var domSec = (headerEl.getAttribute('data-images-secondary') || '').trim();
    if (secImg !== domSec) {
      details.push('Secondary image → ' + (secImg || '(removed)'));
    }
    return details;
  }

  function truncateChangeDetail(text, maxLen) {
    maxLen = maxLen || 56;
    var t = String(text || '').trim();
    if (!t) return '(empty)';
    return t.length > maxLen ? t.slice(0, maxLen) + '…' : t;
  }

  function jsonArraysEqual(a, b) {
    try {
      return JSON.stringify(a || []) === JSON.stringify(b || []);
    } catch (e) {
      return false;
    }
  }

  function collectMenuItemUnsavedFieldDetails(cardEl) {
    var details = [];
    if (!cardEl) return details;
    var titleVal = inputTitle ? inputTitle.value.trim() : '';
    var titleEl = cardEl.querySelector('.menu-item-title a, .menu-item-title');
    var domTitle = titleEl ? (titleEl.textContent || '').trim() : '';
    if (titleVal !== domTitle) {
      details.push('Title → ' + truncateChangeDetail(titleVal));
    }
    var descVal = inputDesc ? inputDesc.value.trim() : '';
    var descEl = cardEl.querySelector('.menu-item-description, .menu-summary');
    var domDesc = descEl ? (descEl.textContent || '').trim() : '';
    if (descVal !== domDesc) {
      details.push('Description → ' + truncateChangeDetail(descVal));
    }
    var pricesArr = pricesContainer ? getPricesFromUI(pricesContainer) : [];
    var domPrices = parseJsonAttr(cardEl, 'data-prices-array');
    if (!jsonArraysEqual(pricesArr, domPrices)) {
      details.push('Prices → ' + (pricesArr.length ? pricesArr.length + ' variant(s)' : '(removed)'));
    }
    var imagesArr = inputMenuItemImages ? hoursParseStringList(inputMenuItemImages.value) : [];
    var domImages = parseJsonAttr(cardEl, 'data-images-array');
    if (!jsonArraysEqual(imagesArr, domImages)) {
      details.push('Images → ' + (imagesArr.length ? imagesArr.length + ' image(s)' : '(removed)'));
    }
    var sides = sideCategoriesContainer ? getSideCategoriesFromUI(sideCategoriesContainer) : [];
    if (!jsonArraysEqual(sides, parseJsonAttr(cardEl, 'data-side-categories'))) {
      details.push('Side categories updated');
    }
    var mods = modificationsContainer ? getPairsFromUI(modificationsContainer) : [];
    if (!jsonArraysEqual(mods, parseJsonAttr(cardEl, 'data-modifications'))) {
      details.push('Modifications updated');
    }
    var adds = additionsContainer ? getPairsFromUI(additionsContainer) : [];
    if (!jsonArraysEqual(adds, parseJsonAttr(cardEl, 'data-additions'))) {
      details.push('Additions updated');
    }
    var tags = tagsContainer ? getStringListFromUI(tagsContainer) : [];
    if (!jsonArraysEqual(tags, parseJsonAttr(cardEl, 'data-tags'))) {
      details.push('Tags updated');
    }
    var ingredients = ingredientsContainer ? getStringListFromUI(ingredientsContainer) : [];
    if (!jsonArraysEqual(ingredients, parseJsonAttr(cardEl, 'data-ingredients'))) {
      details.push('Ingredients updated');
    }
    var avail = getMenuItemAvailabilityFromState();
    if (!jsonArraysEqual(avail, parseJsonObjectAttr(cardEl, 'data-availability'))) {
      details.push('Availability updated');
    }
    var promos = menuItemPromotionsContainer ? getMenuItemPromotionsFromUI(menuItemPromotionsContainer) : [];
    if (!jsonArraysEqual(promos, parseJsonAttr(cardEl, 'data-promotions'))) {
      details.push('Promotions updated');
    }
    return details;
  }

  function enrichMenuItemEmbedChanges(changes, contentPath) {
    return changes.map(function(change) {
      var copy = Object.assign({}, change);
      copy.kind = 'Menu item';
      if (change.path === contentPath || (change.path === '__unsaved__' && selectedInfo && selectedInfo.contentType === 'menu-item')) {
        copy.label = (inputTitle && inputTitle.value.trim()) || change.label;
        if (change.status === 'unsaved' && selectedElement) {
          copy.details = collectMenuItemUnsavedFieldDetails(selectedElement);
          if (!copy.details.length) copy.details = ['Pending editor changes'];
        } else if (change.status === 'draft') {
          copy.details = draftDetailsForChange(change);
        } else if (change.status === 'new') {
          copy.details = ['New menu item file'];
        } else if (change.status === 'delete') {
          copy.details = ['Marked for deletion'];
        }
      }
      return copy;
    });
  }

  function enrichSectionEmbedChanges(changes, sectionSlug) {
    var sectionPath = 'content/' + sectionSlug + '/_index.md';
    return changes.map(function(change) {
      var copy = Object.assign({}, change);
      if (change.path === sectionPath || (change.path === '__unsaved__' && selectedInfo && selectedInfo.contentType === 'section-header')) {
        copy.kind = 'Section';
        copy.label = sectionTitleForPayload(selectedElement) || change.label;
        if (change.status === 'unsaved' && selectedElement) {
          copy.details = collectSectionUnsavedFieldDetails(selectedElement);
          if (!copy.details.length) copy.details = ['Pending editor changes'];
        } else if (change.status === 'draft') {
          copy.details = draftDetailsForChange(change);
        } else if (change.status === 'new') {
          copy.details = ['New section file'];
        } else if (change.status === 'delete') {
          copy.details = ['Marked for deletion'];
        }
      } else if (contentPathInSection(change.path, sectionSlug)) {
        copy.kind = 'Menu item';
        var rel = change.path.replace(/^content\/[^/]+\//, '');
        if (change.status === 'draft') {
          copy.details = draftDetailsForChange(change);
        } else {
          copy.details = [rel];
          if (change.status === 'new') copy.details.push('New item in this section');
          if (change.status === 'delete') copy.details.push('Marked for deletion');
        }
      }
      return copy;
    });
  }

  function filterChangesForEmbedHost(changes, kind) {
    if (kind === 'section') {
      var slug = currentSectionSlugFromEdit();
      if (!slug) return [];
      var sectionPath = 'content/' + slug + '/_index.md';
      var filtered = changes.filter(function(c) {
        if (c.path === '__unsaved__') {
          return editFormDirty && selectedInfo && selectedInfo.contentType === 'section-header';
        }
        return contentPathInSection(c.path, slug);
      }).map(function(c) {
        if (c.path === '__unsaved__') {
          return Object.assign({}, c, {
            path: sectionPath,
            kind: 'Section',
            label: sectionTitleForPayload(selectedElement) || titleLabelFromContentPath(getEditorPreviewDocument(), sectionPath)
          });
        }
        return c;
      });
      return enrichSectionEmbedChanges(filtered, slug);
    }
    if (kind === 'menu-item') {
      var cp = selectedInfo && selectedInfo.contentPath ? String(selectedInfo.contentPath).trim() : '';
      if (!cp || cp.indexOf('...') !== -1) return [];
      var filtered = changes.filter(function(c) {
        if (c.path === '__unsaved__') {
          return editFormDirty && selectedInfo && selectedInfo.contentType === 'menu-item';
        }
        return c.path === cp;
      }).map(function(c) {
        if (c.path === '__unsaved__') {
          return Object.assign({}, c, {
            path: cp,
            kind: 'Menu item',
            label: (inputTitle && inputTitle.value.trim()) || titleLabelFromContentPath(getEditorPreviewDocument(), cp)
          });
        }
        return c;
      });
      return enrichMenuItemEmbedChanges(filtered, cp);
    }
    if (kind === 'promotion') {
      var promoPath = selectedInfo && selectedInfo.contentPath ? String(selectedInfo.contentPath).trim() : '';
      if (!promoPath || promoPath.indexOf('...') !== -1) return [];
      return changes.filter(function(c) {
        if (c.path === '__unsaved__') {
          return editFormDirty && selectedInfo && selectedInfo.contentType === 'promotion';
        }
        return c.path === promoPath;
      }).map(function(c) {
        var copy = Object.assign({}, c);
        if (c.path === '__unsaved__') {
          copy.path = promoPath;
          copy.kind = 'Promotion';
          copy.label = (inputTitle && inputTitle.value.trim()) || titleLabelFromContentPath(getEditorPreviewDocument(), promoPath);
        }
        if (copy.status === 'draft') copy.details = ['CMS draft for ' + promoPath];
        if (copy.status === 'unsaved') copy.details = ['Pending editor changes'];
        if (copy.status === 'new') copy.details = ['New promotion'];
        if (copy.status === 'delete') copy.details = ['Marked for deletion'];
        return copy;
      });
    }
    return changes;
  }

  function syncPendingChangesPanelScopeNote(kind, count) {
    var scopeNote = document.getElementById('dashboardEditChangesScopeNote');
    if (!scopeNote) return;
    if (kind === 'section') {
      var slug = currentSectionSlugFromEdit();
      var title = sectionTitleForPayload(selectedElement) || slug.replace(/-/g, ' ');
      scopeNote.textContent = slug
        ? 'This section only (“' + title + '”). ' + (count ? count + ' change' + (count === 1 ? '' : 's') + '.' : 'No pending changes.')
        : '';
      scopeNote.classList.toggle('hidden', !slug);
      return;
    }
    if (kind === 'menu-item') {
      var cp = selectedInfo && selectedInfo.contentPath ? String(selectedInfo.contentPath).trim() : '';
      var itemTitle = (inputTitle && inputTitle.value.trim()) || (cp ? titleLabelFromContentPath(getEditorPreviewDocument(), cp) : '');
      scopeNote.textContent = cp
        ? 'This menu item only (“' + itemTitle + '”). ' + (count ? count + ' change' + (count === 1 ? '' : 's') + '.' : 'No pending changes.')
        : '';
      scopeNote.classList.toggle('hidden', !cp);
      return;
    }
    if (kind === 'promotion') {
      var promoCp = selectedInfo && selectedInfo.contentPath ? String(selectedInfo.contentPath).trim() : '';
      var promoTitle = (inputTitle && inputTitle.value.trim()) || (promoCp ? titleLabelFromContentPath(getEditorPreviewDocument(), promoCp) : 'Promotion');
      scopeNote.textContent = promoCp
        ? 'This promotion only (“' + promoTitle + '”). ' + (count ? count + ' change' + (count === 1 ? '' : 's') + '.' : 'No pending changes.')
        : '';
      scopeNote.classList.toggle('hidden', !promoCp);
      return;
    }
    scopeNote.textContent = '';
    scopeNote.classList.add('hidden');
  }

  function collectPendingMenuChanges() {
    var changes = [];
    var seen = new Set();
    var doc = null;
    try { doc = getEditorPreviewDocument(); } catch (e) { /* ignore */ }

    function addChange(path, status, labelOverride) {
      var key = (path || status) + '|' + status;
      if (seen.has(key)) return;
      seen.add(key);
      changes.push({
        id: key,
        path: path || '',
        status: status,
        kind: kindLabelFromContentPath(path),
        label: labelOverride || titleLabelFromContentPath(doc, path)
      });
    }

    markedForDeletionContentPaths.forEach(function(p) { if (p) addChange(p, 'delete'); });
    draftContentPaths.forEach(function(p) {
      if (p && !markedForDeletionContentPaths.has(p)) addChange(p, 'draft');
    });

    if (doc && doc.body) {
      doc.querySelectorAll('[data-dashboard-edit-new-item], [data-dashboard-edit-new-section], [data-dashboard-edit-new-promotion]').forEach(function(el) {
        var p = getContentPathForElement(doc, el);
        var label = '';
        if (el.hasAttribute('data-dashboard-edit-new-section')) {
          var sh = el.querySelector('h2 a, h2');
          label = sh ? (sh.textContent || '').trim() : 'New section';
        } else if (el.hasAttribute('data-dashboard-edit-new-promotion')) {
          label = el.getAttribute('data-ad-title') || 'New promotion';
        } else {
          var mh = el.querySelector('.menu-item-title a, .menu-item-title');
          label = mh ? (mh.textContent || '').trim() : 'New item';
        }
        if (p && !draftContentPaths.has(p)) addChange(p, 'new', label);
        else if (!p) addChange('new:' + (el.id || label), 'new', label);
      });
    }

    if (editFormDirty) {
      var cp = selectedInfo && selectedInfo.contentPath ? String(selectedInfo.contentPath).trim() : '';
      if ((!cp || cp.indexOf('...') !== -1) && selectedElement) {
        try {
          cp = doc ? (getContentPathForElement(doc, selectedElement) || '') : '';
        } catch (e2) { /* ignore */ }
      }
      if (cp && cp.indexOf('...') === -1) {
        if (!draftContentPaths.has(cp) && !markedForDeletionContentPaths.has(cp)) addChange(cp, 'unsaved');
      } else if (!changes.length) {
        addChange('__unsaved__', 'unsaved');
      }
    }

    var order = { delete: 0, new: 1, unsaved: 2, draft: 3 };
    changes.sort(function(a, b) {
      var d = (order[a.status] || 9) - (order[b.status] || 9);
      if (d !== 0) return d;
      return a.label.localeCompare(b.label);
    });
    return changes;
  }

  function scrollPreviewToChangeTarget(el) {
    if (!el) return;
    window.requestAnimationFrame(function() {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      } catch (e) {
        try { el.scrollIntoView(false); } catch (e2) { /* ignore */ }
      }
    });
  }

  function appendPendingChangeItems(listEl, changes, opts) {
    if (!listEl || !changes || !changes.length) return;
    opts = opts || {};
    var clickable = opts.clickable !== false;
    var doc = null;
    if (clickable) {
      try { doc = iframe && iframe.contentDocument; } catch (e) { /* ignore */ }
    }
    changes.forEach(function(change) {
      var li = document.createElement('li');
      li.className = 'dashboard-edit-changes-item dashboard-edit-changes-item--' + change.status;
      var kind = document.createElement('span');
      kind.className = 'dashboard-edit-changes-kind';
      kind.textContent = change.kind;
      var body = document.createElement('span');
      body.className = 'dashboard-edit-changes-item-body';
      var title = document.createElement('span');
      title.className = 'dashboard-edit-changes-item-title';
      title.textContent = change.label;
      var status = document.createElement('span');
      status.className = 'dashboard-edit-changes-status';
      status.textContent = PENDING_CHANGE_STATUS_LABELS[change.status] || change.status;
      body.appendChild(title);
      body.appendChild(status);
      if (change.details && change.details.length) {
        var detailsEl = document.createElement('ul');
        detailsEl.className = 'dashboard-edit-changes-item-details';
        change.details.forEach(function(line) {
          var dli = document.createElement('li');
          dli.textContent = line;
          detailsEl.appendChild(dli);
        });
        body.appendChild(detailsEl);
      }
      li.appendChild(kind);
      li.appendChild(body);
      if (clickable && change.path && change.path !== '__unsaved__' && doc) {
        li.setAttribute('role', 'button');
        li.setAttribute('tabindex', '0');
        li.setAttribute('title', 'Show in preview');
        var target = findElementForContentPath(doc, change.path);
        if (target) {
          li.addEventListener('click', function() {
            scrollPreviewToChangeTarget(target);
            doc.querySelectorAll('.dashboard-edit-change-focus').forEach(function(n) {
              n.classList.remove('dashboard-edit-change-focus');
            });
            target.classList.add('dashboard-edit-change-focus');
            window.setTimeout(function() {
              target.classList.remove('dashboard-edit-change-focus');
            }, 2200);
          });
        }
      }
      listEl.appendChild(li);
    });
  }

  function renderSaveOptionsChangesSummary() {
    var listEl = document.getElementById('dashboardSaveOptionsChangesList');
    var countEl = document.getElementById('dashboardSaveOptionsCount');
    var syncedEl = document.getElementById('dashboardSaveOptionsChangesSynced');
    var section = document.querySelector('.dashboard-save-options-changes');
    if (!listEl) return;

    var changes = collectPendingMenuChanges();
    var count = changes.length;
    var pending = count > 0;

    if (countEl) {
      countEl.textContent = pending
        ? (count === 1 ? '1 pending change ready to save' : count + ' pending changes ready to save')
        : 'No pending content changes';
      countEl.classList.toggle('dashboard-save-options-count--pending', pending);
    }
    if (syncedEl) syncedEl.classList.toggle('hidden', pending);
    if (section) section.classList.toggle('dashboard-save-options-changes--pending', pending);

    listEl.innerHTML = '';
    listEl.classList.toggle('hidden', !pending);
    if (pending) appendPendingChangeItems(listEl, changes, { clickable: false });
  }

  function syncPendingChangesPanel() {
    var panel = document.getElementById('dashboardEditChangesPanel');
    var listEl = document.getElementById('dashboardEditChangesList');
    var countEl = document.getElementById('dashboardEditChangesCount');
    var syncedEl = document.getElementById('dashboardEditChangesSynced');
    var panelBadge = document.getElementById('dashboardEditPanelPendingBadge');
    if (!panel || !listEl) return;

    var changes = collectPendingMenuChanges();
    if (embedChangesFilterKind) {
      changes = filterChangesForEmbedHost(changes, embedChangesFilterKind);
    }
    syncPendingChangesPanelScopeNote(embedChangesFilterKind, changes.length);
    var count = changes.length;
    var pending = count > 0;

    panel.classList.toggle('dashboard-edit-changes-panel--pending', pending);
    panel.classList.toggle('dashboard-edit-changes-panel--synced', !pending);

    if (countEl) {
      countEl.textContent = String(count);
      countEl.classList.toggle('hidden', !pending);
      countEl.setAttribute('aria-hidden', pending ? 'false' : 'true');
    }
    if (syncedEl) syncedEl.classList.toggle('hidden', pending);
    if (panelBadge) {
      panelBadge.textContent = pending ? String(count) : '';
      panelBadge.classList.toggle('hidden', !pending);
      panelBadge.setAttribute('aria-hidden', pending ? 'false' : 'true');
    }

    listEl.innerHTML = '';
    if (pending) {
      changes = changes.map(function(c) {
        if (c.status === 'draft' && c.path) {
          return Object.assign({}, c, { details: draftDetailsForChange(c) });
        }
        return c;
      });
      appendPendingChangeItems(listEl, changes, { clickable: true });
      ensureDraftChangeDetails(changes.filter(function(c) { return c.status === 'draft'; }).map(function(c) { return c.path; }));
    }
    syncAllEmbedWizardSaveButtons();
  }

  function applyEditHighlights() {
    var doc = getEditorPreviewDocument();
    if (!doc || !doc.body) return;
    var highlightClasses = ['dashboard-edit-has-change', 'dashboard-edit-new', 'dashboard-edit-marked-delete', 'dashboard-edit-hidden-for-preview'];
    var highlightEls = '.menu-item-card, .menu-header, section.ads.menu-ad, article.ads-reels-slide, #pageadscontainer li.ad-panel';
    doc.querySelectorAll(highlightEls).forEach(function(el) {
      highlightClasses.forEach(function(c) { el.classList.remove(c); });
    });
    doc.querySelectorAll(highlightEls).forEach(function(el) {
      var path = getContentPathForElement(doc, el);
      if (draftContentPaths.has(path)) el.classList.add('dashboard-edit-has-change');
      if (el.hasAttribute('data-dashboard-edit-new-item') || el.hasAttribute('data-dashboard-edit-new-section') || el.hasAttribute('data-dashboard-edit-new-promotion')) el.classList.add('dashboard-edit-new');
      if (path && markedForDeletionContentPaths.has(path) && !el.hasAttribute('data-dashboard-edit-new-item')) el.classList.add('dashboard-edit-marked-delete');
    });
    syncSaveButtonAppearance();
  }

  function setupIframeEditMode(on) {
    function runWhenReady() {
      try {
        var doc = iframe.contentDocument;
        var win = iframe.contentWindow;
        if (!doc || !doc.body) return;
        win.__dashboardEditMode = !!on;
        if (on) prefetchHomeHeroIndexContent();
        if (on && !win.__dashboardAdsPopulatedBound) {
          win.__dashboardAdsPopulatedBound = true;
          win.addEventListener('adsPopulated', function() {
            if (win.__dashboardEditMode && win._dashboardInjectEditButtons) {
              scheduleDashboardPreviewBootstrap(win, win._dashboardInjectEditButtons);
            }
          });
          win.addEventListener('menuReelsFlattened', function() {
            if (win.__dashboardEditMode && win._dashboardInjectEditButtons) {
              scheduleDashboardPreviewBootstrap(win, win._dashboardInjectEditButtons);
            }
          });
        }
        if (on) {
          var previewHideStyle = doc.getElementById('dashboard-edit-preview-hide-style');
          if (previewHideStyle) previewHideStyle.remove();
          win.__dashboardApplyEdit = function(payloadStr) {
            try {
              var opts = JSON.parse(payloadStr);
              var cards = doc.querySelectorAll('.menu-item-card');
              var card = null;
              var targetNorm = normalizeItemUrlForMatch(opts.itemUrl);
              for (var i = 0; i < cards.length; i++) {
                var du = cards[i].getAttribute('data-item-url') || '';
                if (normalizeItemUrlForMatch(du) === targetNorm) { card = cards[i]; break; }
              }
              if (!card) return;
              if (opts.title != null) {
                var t = card.querySelector('.menu-item-title a, .menu-item-title, h1, h2');
                if (t) { var a = t.querySelector('a'); if (a) a.textContent = opts.title; else t.textContent = opts.title; }
              }
              if (opts.description != null) {
                var d = card.querySelector('.menu-item-description, .menu-summary');
                if (d) { var p = d.querySelector('p'); if (p) p.textContent = opts.description; else d.textContent = opts.description; }
                var ep = card.querySelector('.expanded-item-description p');
                if (ep) ep.textContent = opts.description;
              }
              if (opts.pricesArray && Array.isArray(opts.pricesArray)) {
                card.setAttribute('data-prices-array', JSON.stringify(opts.pricesArray));
                var nums = [];
                for (var j = 2; j < opts.pricesArray.length; j += 3) {
                  var n = parseFloat(opts.pricesArray[j]);
                  if (!isNaN(n)) nums.push(n);
                }
                nums.sort(function(a, b) { return a - b; });
                var fmt = function(v) { var s = v.toFixed(2); return s.replace(/\.00$/, ''); };
                var priceText = nums.length ? (nums[0] === nums[nums.length - 1] ? '$' + fmt(nums[0]) : '$' + fmt(nums[0]) + ' | $' + fmt(nums[nums.length - 1])) : '';
                var priceEl = card.querySelector('.menu-item-price');
                if (priceEl) priceEl.textContent = priceText;
                var expPrice = card.querySelector('.expanded-price');
                if (expPrice) { expPrice.textContent = priceText; expPrice.setAttribute('data-unit-price', nums[0] || 0); }
                var addCart = card.querySelector('.expanded-add-cart');
                if (addCart) { addCart.setAttribute('data-unit-price', nums[0] || 0); var cartPrice = addCart.querySelector('.cart-button-price'); if (cartPrice) cartPrice.textContent = priceText; }
                var variable1Vals = [], variable2Vals = [];
                for (var si = 0; si < opts.pricesArray.length; si += 3) {
                  var sval = String(opts.pricesArray[si] || '-').trim();
                  var fval = String(opts.pricesArray[si + 1] != null ? opts.pricesArray[si + 1] : '-').trim();
                  if (sval && sval !== '-' && sval !== 'None' && variable1Vals.indexOf(sval) === -1) variable1Vals.push(sval);
                  if (fval && fval !== '-' && fval !== 'None' && variable2Vals.indexOf(fval) === -1) variable2Vals.push(fval);
                }
                if (opts.pricesArray.length >= 3) {
                  card.setAttribute('data-selected-variable1', String(opts.pricesArray[0] || '-'));
                  card.setAttribute('data-selected-variable2', String(opts.pricesArray[1] || '-'));
                }
                var url = (opts.itemUrl || '').replace(/'/g, "\\'");
                var esc = function(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };
                var sizesHtml = variable1Vals.length ? variable1Vals.map(function(v, idx) {
                  return '<li class="expanded-option' + (idx === 0 ? ' selected' : '') + '" data-option-type="variable1" data-option-value="' + esc(v) + '" onclick="selectExpandedOption(this, \'' + url + '\', event)">' + esc(v) + '</li>';
                }).join('') : '';
                var flavoursHtml = variable2Vals.length ? variable2Vals.map(function(v, idx) {
                  return '<li class="expanded-option' + (idx === 0 ? ' selected' : '') + '" data-option-type="variable2" data-option-value="' + esc(v) + '" onclick="selectExpandedOption(this, \'' + url + '\', event)">' + esc(v) + '</li>';
                }).join('') : '';
                card.querySelectorAll('.menu-item-options .sizes, .menu-item-options ul.sizes').forEach(function(ul) {
                  if (variable1Vals.length) ul.innerHTML = sizesHtml; else ul.innerHTML = '';
                });
                card.querySelectorAll('.menu-item-options .flavours, .menu-item-options ul.flavours').forEach(function(ul) {
                  if (variable2Vals.length) ul.innerHTML = flavoursHtml; else ul.innerHTML = '';
                });
              }
              if (opts.sideCategories !== undefined) {
                card.setAttribute('data-side-categories', JSON.stringify(opts.sideCategories));
              }
              if (opts.imagesArray !== undefined) {
                card.setAttribute('data-images-array', JSON.stringify(opts.imagesArray));
                card.setAttribute('data-regular-images-array', JSON.stringify(opts.imagesArray));
                var imgEl = card.querySelector('img.menu-item-img');
                if (imgEl && opts.imagesArray.length) {
                  var first = opts.imagesArray[0];
                  imgEl.setAttribute('data-src-path', first);
                  if (first.indexOf('draft-assets/') === 0) {
                    imgEl.removeAttribute('src');
                    imgEl.setAttribute('data-draft-pending', '1');
                    delete imgEl.dataset.draftAssetHydrated;
                    delete imgEl.dataset.fellback;
                  } else {
                    imgEl.removeAttribute('data-draft-pending');
                    imgEl.setAttribute('src', resolveMenuItemImageSrcForPreview(first));
                  }
                  if (typeof win.hydrateAuthenticatedDraftAssetImg === 'function') {
                    win.hydrateAuthenticatedDraftAssetImg(imgEl);
                  }
                }
              }
              if (opts.modificationsFlat !== undefined) {
                card.setAttribute('data-modifications', JSON.stringify(opts.modificationsFlat));
              }
              if (opts.additionsFlat !== undefined) {
                card.setAttribute('data-additions', JSON.stringify(opts.additionsFlat));
              }
              if (opts.tags !== undefined) {
                card.setAttribute('data-tags', JSON.stringify(opts.tags));
              }
              if (opts.ingredients !== undefined) {
                card.setAttribute('data-ingredients', JSON.stringify(opts.ingredients));
              }
              if (opts.cookingmethods !== undefined) {
                card.setAttribute('data-cookingmethods', JSON.stringify(opts.cookingmethods));
              }
              if (opts.types !== undefined) {
                card.setAttribute('data-types', JSON.stringify(opts.types));
              }
              if (opts.events !== undefined) {
                card.setAttribute('data-events', JSON.stringify(opts.events));
              }
              if (opts.promotions !== undefined) {
                card.setAttribute('data-promotions', JSON.stringify(opts.promotions));
              }
              if (Object.prototype.hasOwnProperty.call(opts, 'availability')) {
                if (opts.availability && typeof opts.availability === 'object') {
                  card.setAttribute('data-availability', JSON.stringify(opts.availability));
                } else {
                  card.removeAttribute('data-availability');
                }
              }
              var applyUrl = card.getAttribute('data-item-url') || '';
              if (applyUrl && card.getAttribute('data-item-expanded') === 'true' && typeof win.expandMenuItemCard === 'function') {
                try { win.expandMenuItemCard(card, applyUrl); } catch (ex) { /* ignore */ }
              }
            } catch (e) { console.warn('dashboardApplyEdit', e); }
          };
          var style = doc.getElementById('dashboard-edit-injected-style');
          if (!style) {
            style = doc.createElement('style');
            style.id = 'dashboard-edit-injected-style';
            style.textContent = [
              '.dashboard-edit-selected { outline: 2px solid #667eea !important; outline-offset: 2px !important; }',
              '.menu-item-card .dashboard-new-item-placeholder-link { cursor: default; color: inherit; text-decoration: none; }',
              '.menu-item-card.dashboard-edit-card-wrap { position: relative !important; pointer-events: none; }',
              '.menu-item-card.menu-reels-slide.dashboard-edit-card-wrap { position: relative !important; pointer-events: none; }',
              '.menu-item-card.dashboard-edit-card-wrap > * { pointer-events: auto; }',
              '.menu-header.menu-reels-slide.dashboard-edit-header-wrap { position: relative !important; pointer-events: none; overflow: visible !important; }',
              '.menu-header.menu-reels-slide.dashboard-edit-header-wrap > * { pointer-events: auto; }',
              '.menu-item-card .dashboard-edit-card-btn-wrap { position: absolute; top: 2px; right: 2px; z-index: 9999; pointer-events: auto; }',
              '.menu-header.dashboard-edit-header-wrap { position: relative !important; pointer-events: none; }',
              '.menu-header.dashboard-edit-header-wrap > * { pointer-events: auto; }',
              '.menu-header .dashboard-edit-header-btn-wrap { position: absolute; top: 2px; right: 2px; z-index: 9999; pointer-events: auto; }',
              'section.ads.menu-ad.dashboard-edit-ad-wrap { position: relative !important; }',
              'section.ads.menu-ad .dashboard-edit-ad-btn-wrap { position: absolute; top: 2px; right: 2px; z-index: 9999; pointer-events: auto; }',
              'article.ads-reels-slide.dashboard-edit-ad-wrap, li.ad-panel.dashboard-edit-ad-wrap { position: relative !important; }',
              'article.ads-reels-slide .dashboard-edit-ad-btn-wrap, li.ad-panel .dashboard-edit-ad-btn-wrap { position: absolute; top: 2px; right: 2px; z-index: 9999; pointer-events: auto; }',
              '.client-tour-slideshow.dashboard-edit-slideshow-wrap { position: relative !important; }',
              '.client-tour-slideshow .dashboard-edit-slideshow-btn-wrap { position: absolute; top: 2px; right: 2px; z-index: 9999; pointer-events: auto; }',
              '.hero_logo_container.dashboard-edit-hero-wrap { position: relative !important; overflow: visible !important; }',
              '.hero_logo_container .dashboard-edit-hero-btn-wrap { position: absolute; top: 8px; right: 8px; z-index: 10000; pointer-events: auto; }',
              '.location-item.dashboard-edit-location-wrap { position: relative !important; }',
              '.location-item .dashboard-edit-location-btn-wrap { position: absolute; top: 2px; right: 2px; z-index: 9999; pointer-events: auto; }',
              '.dashboard-edit-card-btn-wrap .dashboard-edit-btn, .dashboard-edit-header-btn-wrap .dashboard-edit-btn, .dashboard-edit-ad-btn-wrap .dashboard-edit-btn, .dashboard-edit-slideshow-btn-wrap .dashboard-edit-btn, .dashboard-edit-location-btn-wrap .dashboard-edit-btn, .dashboard-edit-hero-btn-wrap .dashboard-edit-btn { width: 36px; height: 36px; padding: 0; border: none; border-radius: 4px; cursor: pointer; background: #667eea9c; backdrop-filter: blur(10px); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; pointer-events: auto; }',
              '.dashboard-edit-card-btn-wrap .dashboard-edit-btn:hover, .dashboard-edit-header-btn-wrap .dashboard-edit-btn:hover, .dashboard-edit-ad-btn-wrap .dashboard-edit-btn:hover, .dashboard-edit-slideshow-btn-wrap .dashboard-edit-btn:hover, .dashboard-edit-location-btn-wrap .dashboard-edit-btn:hover, .dashboard-edit-hero-btn-wrap .dashboard-edit-btn:hover { background: #764ba2; }',
              '.dashboard-edit-add-section-bar { margin: 0.5rem 0; padding: 0.5rem; text-align: center; background: rgba(102, 126, 234, 0.15); border: 1px dashed rgba(102, 126, 234, 0.5); border-radius: 8px; }',
              '.dashboard-edit-add-section-bar .dashboard-edit-add-section-btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.75rem; font-size: 0.85rem; border-radius: 6px; border: 1px solid rgba(102, 126, 234, 0.5); background: rgba(102, 126, 234, 0.25); color: #fff; cursor: pointer; }',
              '.dashboard-edit-add-section-bar .dashboard-edit-add-section-btn:hover { background: rgba(102, 126, 234, 0.4); }',
              '.dashboard-edit-add-promotion-bar { margin: 0.5rem 0; padding: 0.5rem; text-align: center; background: rgba(102, 126, 234, 0.15); border: 1px dashed rgba(102, 126, 234, 0.5); border-radius: 8px; }',
              '.dashboard-edit-add-promotion-bar .dashboard-edit-add-promotion-btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.75rem; font-size: 0.85rem; border-radius: 6px; border: 1px solid rgba(102, 126, 234, 0.5); background: rgba(102, 126, 234, 0.25); color: #fff; cursor: pointer; }',
              '.dashboard-edit-add-promotion-bar .dashboard-edit-add-promotion-btn:hover { background: rgba(102, 126, 234, 0.4); }',
              '.dashboard-edit-add-item-bar { margin: 0.5rem 0; padding: 0.4rem; text-align: center; background: rgba(102, 126, 234, 0.12); border: 1px dashed rgba(102, 126, 234, 0.4); border-radius: 6px; }',
              '.dashboard-edit-add-item-bar .dashboard-edit-add-item-btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.6rem; font-size: 0.8rem; border-radius: 6px; border: 1px solid rgba(102, 126, 234, 0.45); background: rgba(102, 126, 234, 0.2); color: #fff; cursor: pointer; }',
              '.dashboard-edit-add-item-bar .dashboard-edit-add-item-btn:hover { background: rgba(102, 126, 234, 0.35); }',
              '.dashboard-edit-card-btn-wrap, .dashboard-edit-header-btn-wrap, .dashboard-edit-ad-btn-wrap { display: inline-flex; align-items: center; gap: 2px; flex-wrap: nowrap; }',
              '.dashboard-edit-move-wrap { display: none; align-items: center; gap: 2px; flex-wrap: nowrap; position: relative; }',
              'body.dashboard-edit-move-mode .dashboard-edit-move-wrap { display: inline-flex !important; }',
              'body.dashboard-edit-move-mode .dashboard-edit-move-wrap.is-open .dashboard-edit-move-actions { display: inline-flex !important; }',
              '.dashboard-edit-move-actions[hidden] { display: none !important; }',
              '.dashboard-edit-move-btn { cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 32px; padding: 0; border: none; border-radius: 4px; background: rgba(102, 126, 234, 0.45); color: #fff; font-size: 11px; pointer-events: auto; user-select: none; touch-action: manipulation; }',
              '.dashboard-edit-move-btn > * { pointer-events: none; }',
              '.dashboard-edit-move-btn:hover:not(:disabled) { background: rgba(102, 126, 234, 0.7); }',
              '.dashboard-edit-move-btn:disabled { opacity: 0.35; cursor: not-allowed; }',
              '.dashboard-edit-move-wrap.is-open { z-index: 10002; position: relative; }',
              'body.dashboard-edit-move-mode .dashboard-edit-btn { display: none !important; }',
              'body.dashboard-edit-move-mode .dashboard-edit-add-section-bar, body.dashboard-edit-move-mode .dashboard-edit-add-item-bar, body.dashboard-edit-move-mode .dashboard-edit-add-promotion-bar { display: none !important; }',
              '.dashboard-edit-move-toggle { cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 36px; padding: 0; border: none; border-radius: 4px; background: rgba(102, 126, 234, 0.5); color: #fff; font-size: 12px; pointer-events: auto; user-select: none; touch-action: manipulation; }',
              '.dashboard-edit-move-toggle > * { pointer-events: none; }',
              '.dashboard-edit-move-toggle:hover { background: rgba(102, 126, 234, 0.75); }',
              '.dashboard-edit-move-wrap.is-open .dashboard-edit-move-toggle { background: rgba(102, 126, 234, 0.95); outline: 2px solid rgba(255, 255, 255, 0.85); outline-offset: 1px; }',
              '.dashboard-edit-move-selected { outline: 2px solid #667eea !important; outline-offset: 3px !important; box-shadow: 0 0 0 1px rgba(102, 126, 234, 0.45) !important; }',
              '.dashboard-edit-has-change { outline: 2px solid #f59e0b !important; outline-offset: 2px !important; box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.4) !important; }',
              '.dashboard-edit-change-focus { outline: 3px solid #818cf8 !important; outline-offset: 3px !important; box-shadow: 0 0 0 6px rgba(129, 140, 248, 0.35) !important; transition: box-shadow 0.2s ease, outline-color 0.2s ease; }',
              '.dashboard-edit-new { outline: 2px solid #10b981 !important; outline-offset: 2px !important; box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.4) !important; }',
              '.dashboard-edit-marked-delete { opacity: 0.65 !important; outline: 2px solid #ef4444 !important; outline-offset: 2px !important; position: relative !important; }',
              '.dashboard-edit-marked-delete::after { content: ""; position: absolute; left: 0; top: 50%; right: 0; height: 2px; background: #ef4444; transform: translateY(-50%); pointer-events: none; }',
              '.dashboard-edit-hidden-for-preview { display: none !important; }'
            ].join('\n');
            doc.head.appendChild(style);
          }
          function closeAllMoveToolbars(exceptWrap) {
            closeAllMoveToolbarsInDoc(doc, exceptWrap);
          }
          function ensureDashboardMoveControls() {
            if (win.__dashboardMoveControlsBound) return;
            win.__dashboardMoveControlsBound = true;
            doc.addEventListener('click', function(e) {
              if (!win.__dashboardMoveMode) return;
              var moveBtn = e.target.closest('.dashboard-edit-move-btn');
              if (moveBtn) {
                e.preventDefault();
                e.stopPropagation();
                if (moveBtn.blur) moveBtn.blur();
                var moveWrap = moveBtn.closest('.dashboard-edit-move-wrap');
                var action = moveBtn.getAttribute('data-move');
                if (!moveWrap || !action) return;
                var card = moveWrap.closest('.menu-item-card');
                var header = moveWrap.closest('.menu-header');
                var promoSlide = moveWrap.closest('article.ads-reels-slide');
                if (card && !moveWrap.classList.contains('dashboard-edit-move-wrap-section') && !moveWrap.classList.contains('dashboard-edit-move-wrap-promotion')) {
                  handleInlineMoveAction(doc, moveWrap, card, 'item', action);
                } else if (header && moveWrap.classList.contains('dashboard-edit-move-wrap-section')) {
                  handleInlineMoveAction(doc, moveWrap, header, 'section', action);
                } else if (promoSlide && moveWrap.classList.contains('dashboard-edit-move-wrap-promotion')) {
                  handleInlineMoveAction(doc, moveWrap, promoSlide, 'promotion', action);
                }
                return;
              }
              var toggle = e.target.closest('.dashboard-edit-move-toggle');
              if (toggle) {
                e.preventDefault();
                e.stopPropagation();
                if (toggle.blur) toggle.blur();
                var toggleWrap = toggle.closest('.dashboard-edit-move-wrap');
                var wasOpen = toggleWrap && toggleWrap.classList.contains('is-open');
                if (wasOpen) {
                  closeAllMoveToolbars();
                  return;
                }
                closeAllMoveToolbars();
                if (toggleWrap) {
                  var ctxCard = toggleWrap.closest('.menu-item-card');
                  var ctxHeader = toggleWrap.closest('.menu-header');
                  var ctxPromo = toggleWrap.closest('article.ads-reels-slide');
                  if (ctxCard && !toggleWrap.classList.contains('dashboard-edit-move-wrap-section') && !toggleWrap.classList.contains('dashboard-edit-move-wrap-promotion')) {
                    keepMoveToolbarOpen(doc, toggleWrap, ctxCard, 'item');
                  } else if (ctxHeader && toggleWrap.classList.contains('dashboard-edit-move-wrap-section')) {
                    keepMoveToolbarOpen(doc, toggleWrap, ctxHeader, 'section');
                  } else if (ctxPromo && toggleWrap.classList.contains('dashboard-edit-move-wrap-promotion')) {
                    keepMoveToolbarOpen(doc, toggleWrap, ctxPromo, 'promotion');
                  }
                }
                return;
              }
              if (!e.target.closest('.dashboard-edit-move-wrap')) {
                closeAllMoveToolbars();
              }
            }, true);
          }
          function injectEditButtons() {
            try {
              ensureDashboardMoveControls();
              var cardWrapClass = 'dashboard-edit-card-btn-wrap';
              doc.querySelectorAll('.menu-item-card').forEach(function(card) {
                var existingWrap = card.querySelector('.' + cardWrapClass);
                if (existingWrap) {
                  dashboardInjectMoveToolbarIntoWrap(existingWrap, doc, {});
                  return;
                }
                card.classList.add('dashboard-edit-card-wrap');
                var div = doc.createElement('div');
                div.className = cardWrapClass;
                div.setAttribute('data-dashboard-edit', '1');
                div.appendChild(createDashboardMoveToolbar(doc, {}));
                var editBtn = doc.createElement('button');
                editBtn.type = 'button';
                editBtn.className = 'dashboard-edit-btn';
                editBtn.setAttribute('aria-label', 'Edit');
                editBtn.innerHTML = '<i class="fa fa-pencil" aria-hidden="true"></i>';
                div.appendChild(editBtn);
                card.insertBefore(div, card.firstChild);
              });
              var headerWrapClass = 'dashboard-edit-header-btn-wrap';
              doc.querySelectorAll('.menu-header').forEach(function(header) {
                var existingWrap = header.querySelector('.' + headerWrapClass);
                if (existingWrap) {
                  dashboardInjectMoveToolbarIntoWrap(existingWrap, doc, { section: true });
                  return;
                }
                header.classList.add('dashboard-edit-header-wrap');
                var div = doc.createElement('div');
                div.className = headerWrapClass;
                div.setAttribute('data-dashboard-edit', '1');
                div.appendChild(createDashboardMoveToolbar(doc, { section: true }));
                var editBtn = doc.createElement('button');
                editBtn.type = 'button';
                editBtn.className = 'dashboard-edit-btn';
                editBtn.setAttribute('aria-label', 'Edit section');
                editBtn.innerHTML = '<i class="fa fa-pencil" aria-hidden="true"></i>';
                div.appendChild(editBtn);
                header.insertBefore(div, header.firstChild);
              });
              syncMenuItemWeightsFromDom(doc);
        syncMenublockOrderFromSections(doc);
              doc.querySelectorAll('section.ads.menu-ad').forEach(function(section) {
                if (!isLegacyPromotionSection(section)) return;
                injectPromotionEditButton(doc, section, win, { showMove: true });
              });
              var seenPromoCatalog = {};
              var promoCatalogFallback = 0;
              doc.querySelectorAll('article.ads-reels-slide').forEach(function(slide) {
                if (!isPromotionReelsSlide(slide)) return;
                var catIdx = slide.getAttribute('data-catalog-index');
                if (catIdx == null || catIdx === '') catIdx = 'promo-' + (promoCatalogFallback++);
                var showMove = !Object.prototype.hasOwnProperty.call(seenPromoCatalog, catIdx);
                seenPromoCatalog[catIdx] = true;
                injectPromotionEditButton(doc, slide, win, { showMove: showMove });
              });
              doc.querySelectorAll('#pageadscontainer li.ad-panel').forEach(function(panel) {
                if (!isPromotionPreviewPanel(panel)) return;
                injectPromotionEditButton(doc, panel, win);
              });
              var slideshowWrapClass = 'dashboard-edit-slideshow-btn-wrap';
              doc.querySelectorAll('.client-tour-slideshow').forEach(function(slideshow) {
                if (slideshow.querySelector('.' + slideshowWrapClass)) return;
                slideshow.classList.add('dashboard-edit-slideshow-wrap');
                var div = doc.createElement('div');
                div.className = slideshowWrapClass;
                div.setAttribute('data-dashboard-edit', '1');
                var editBtn = doc.createElement('button');
                editBtn.type = 'button';
                editBtn.className = 'dashboard-edit-btn';
                editBtn.setAttribute('aria-label', 'Edit slideshow');
                editBtn.innerHTML = '<i class="fa fa-pencil" aria-hidden="true"></i>';
                div.appendChild(editBtn);
                slideshow.insertBefore(div, slideshow.firstChild);
              });
              var locationWrapClass = 'dashboard-edit-location-btn-wrap';
              doc.querySelectorAll('.location-item').forEach(function(loc) {
                if (loc.querySelector('.' + locationWrapClass)) return;
                loc.classList.add('dashboard-edit-location-wrap');
                var div = doc.createElement('div');
                div.className = locationWrapClass;
                div.setAttribute('data-dashboard-edit', '1');
                var editBtn = doc.createElement('button');
                editBtn.type = 'button';
                editBtn.className = 'dashboard-edit-btn';
                editBtn.setAttribute('aria-label', 'Edit location');
                editBtn.innerHTML = '<i class="fa fa-pencil" aria-hidden="true"></i>';
                div.appendChild(editBtn);
                loc.insertBefore(div, loc.firstChild);
              });
              var heroWrapClass = 'dashboard-edit-hero-btn-wrap';
              doc.querySelectorAll('.hero_logo_container[data-cms-content-path][data-cms-edit="hero-image"]').forEach(function(hero) {
                if (hero.querySelector('.' + heroWrapClass)) return;
                hero.classList.add('dashboard-edit-hero-wrap');
                var div = doc.createElement('div');
                div.className = heroWrapClass;
                div.setAttribute('data-dashboard-edit', '1');
                var editBtn = doc.createElement('button');
                editBtn.type = 'button';
                editBtn.className = 'dashboard-edit-btn';
                editBtn.setAttribute('aria-label', 'Edit hero background');
                editBtn.innerHTML = '<i class="fa fa-pencil" aria-hidden="true"></i>';
                div.appendChild(editBtn);
                hero.insertBefore(div, hero.firstChild);
              });
              if (isMenuReelsPreview(doc)) {
                var reelsTrack = getMenuReelsTrack(doc);
                if (reelsTrack) {
                  getOrderedSectionHeadersInDom(doc).forEach(function(header) {
                    var prev = header.previousElementSibling;
                    if (!prev || !prev.classList || !prev.classList.contains('dashboard-edit-add-section-bar')) {
                      var sectionBar = doc.createElement('div');
                      sectionBar.className = 'dashboard-edit-add-section-bar';
                      sectionBar.setAttribute('data-dashboard-edit', '1');
                      var sectionBtn = doc.createElement('button');
                      sectionBtn.type = 'button';
                      sectionBtn.className = 'dashboard-edit-add-section-btn';
                      sectionBtn.setAttribute('aria-label', 'Add section');
                      sectionBtn.innerHTML = '<i class="fa fa-plus" aria-hidden="true"></i> Add section';
                      sectionBar.appendChild(sectionBtn);
                      reelsTrack.insertBefore(sectionBar, header);
                    }
                    var slug = header.getAttribute('data-section-slug') || '';
                    var existingItemBar = reelsTrack.querySelector('.dashboard-edit-add-item-bar[data-section-slug="' + slug.replace(/"/g, '\\"') + '"]');
                    if (!existingItemBar) {
                      var itemBar = doc.createElement('div');
                      itemBar.className = 'dashboard-edit-add-item-bar';
                      itemBar.setAttribute('data-dashboard-edit', '1');
                      if (slug) itemBar.setAttribute('data-section-slug', slug);
                      var itemBtn = doc.createElement('button');
                      itemBtn.type = 'button';
                      itemBtn.className = 'dashboard-edit-add-item-btn';
                      itemBtn.setAttribute('aria-label', 'Add item');
                      itemBtn.innerHTML = '<i class="fa fa-plus" aria-hidden="true"></i> Add item';
                      itemBar.appendChild(itemBtn);
                      var items = getReelsSectionItemCards(doc, header);
                      if (items.length) reelsTrack.insertBefore(itemBar, items[0]);
                      else reelsTrack.insertBefore(itemBar, header.nextElementSibling);
                    }
                  });
                  var promoTitle = reelsTrack.querySelector('.menu-reels-slide[data-reel-section="Promotions"]');
                  if (promoTitle) {
                    var promoPrev = promoTitle.nextElementSibling;
                    if (!promoPrev || !promoPrev.classList || !promoPrev.classList.contains('dashboard-edit-add-promotion-bar')) {
                      var promoBar = doc.createElement('div');
                      promoBar.className = 'dashboard-edit-add-promotion-bar';
                      promoBar.setAttribute('data-dashboard-edit', '1');
                      var promoBtn = doc.createElement('button');
                      promoBtn.type = 'button';
                      promoBtn.className = 'dashboard-edit-add-promotion-btn';
                      promoBtn.setAttribute('aria-label', 'Add promotion');
                      promoBtn.innerHTML = '<i class="fa fa-plus" aria-hidden="true"></i> Add promotion';
                      promoBar.appendChild(promoBtn);
                      reelsTrack.insertBefore(promoBar, promoPrev);
                    }
                  }
                }
              } else {
                var packery = doc.getElementById('packery-container');
                if (packery) {
                  doc.querySelectorAll('.main-menu-bg').forEach(function(section) {
                    var prev = section.previousElementSibling;
                    if (prev && prev.classList && prev.classList.contains('dashboard-edit-add-section-bar')) return;
                    var bar = doc.createElement('div');
                    bar.className = 'dashboard-edit-add-section-bar';
                    bar.setAttribute('data-dashboard-edit', '1');
                    var btn = doc.createElement('button');
                    btn.type = 'button';
                    btn.className = 'dashboard-edit-add-section-btn';
                    btn.setAttribute('aria-label', 'Add section');
                    btn.innerHTML = '<i class="fa fa-plus" aria-hidden="true"></i> Add section';
                    bar.appendChild(btn);
                    packery.insertBefore(bar, section);
                  });
                }
                doc.querySelectorAll('.menu-items-container').forEach(function(container) {
                  var first = container.firstElementChild;
                  if (first && first.classList && first.classList.contains('dashboard-edit-add-item-bar')) return;
                  var bar = doc.createElement('div');
                  bar.className = 'dashboard-edit-add-item-bar';
                  bar.setAttribute('data-dashboard-edit', '1');
                  var btn = doc.createElement('button');
                  btn.type = 'button';
                  btn.className = 'dashboard-edit-add-item-btn';
                  btn.setAttribute('aria-label', 'Add item');
                  btn.innerHTML = '<i class="fa fa-plus" aria-hidden="true"></i> Add item';
                  bar.appendChild(btn);
                  container.insertBefore(bar, container.firstChild);
                });
              }
              var adsContainer = doc.getElementById('homepage-ads-container') || doc.getElementById('client-ads-container') || doc.getElementById('frontpage-ads-container');
              if (adsContainer && !isMenuReelsPreview(doc)) {
                var prev = adsContainer.previousElementSibling;
                if (!prev || !prev.classList || !prev.classList.contains('dashboard-edit-add-promotion-bar')) {
                  var promoBar = doc.createElement('div');
                  promoBar.className = 'dashboard-edit-add-promotion-bar';
                  promoBar.setAttribute('data-dashboard-edit', '1');
                  var promoBtn = doc.createElement('button');
                  promoBtn.type = 'button';
                  promoBtn.className = 'dashboard-edit-add-promotion-btn';
                  promoBtn.setAttribute('aria-label', 'Add promotion');
                  promoBtn.innerHTML = '<i class="fa fa-plus" aria-hidden="true"></i> Add promotion';
                  promoBar.appendChild(promoBtn);
                  adsContainer.parentNode.insertBefore(promoBar, adsContainer);
                }
              }
            } catch (err) { console.warn('injectEditButtons', err); }
          }
          function createNewMenuItemCard(doc, opts) {
            opts = opts || {};
            var rawSec = opts.sectionSlug != null ? String(opts.sectionSlug) : 'menu-items';
            rawSec = rawSec.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9_-]/g, '-') || 'menu-items';
            var titleText = opts.title != null ? String(opts.title) : 'New item';
            var nid = opts.nid;
            if (nid == null || nid === '') {
              var baseSlug = slugifyMenuItemTitle(titleText);
              nid = uniqueMenuItemSlugInSection(doc, rawSec, baseSlug, null);
            }
            var itemPath = '/' + rawSec + '/' + nid + '/';
            titleText = titleText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            var summaryRaw = opts.summary != null ? String(opts.summary) : '';
            var summaryInner = summaryRaw
              ? '<p>' + summaryRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').split(/\n+/).filter(Boolean).join('</p><p>') + '</p>'
              : '<p></p>';
            var card = doc.createElement(isMenuReelsPreview(doc) ? 'section' : 'div');
            card.className = 'menu-item-card' + (isMenuReelsPreview(doc) ? ' menu-reels-slide' : '');
            if (isMenuReelsPreview(doc)) {
              card.setAttribute('role', 'button');
              card.setAttribute('tabindex', '0');
              card.setAttribute('aria-expanded', 'false');
              card.setAttribute('data-section-slug', rawSec);
              card.setAttribute('data-reel-section', rawSec);
            }
            card.setAttribute('data-dashboard-edit-new-item', '1');
            card.setAttribute('data-dashboard-new-item-id', nid);
            card.setAttribute('data-item-url', itemPath);
            card.setAttribute('data-item-expanded', 'false');
            card.setAttribute('data-prices-array', '["-","-",0]');
            card.setAttribute('data-selected-variable1', '-');
            card.setAttribute('data-selected-variable2', '-');
            card.setAttribute('data-side-categories', '[]');
            card.setAttribute('data-modifications', '[]');
            card.setAttribute('data-additions', '[]');
            card.setAttribute('data-images-array', '[]');
            card.setAttribute('data-regular-images-array', '[]');
            card.setAttribute('data-tags', '[]');
            card.setAttribute('data-ingredients', '[]');
            card.setAttribute('data-cookingmethods', '[]');
            card.setAttribute('data-types', '[]');
            card.setAttribute('data-events', '[]');
            card.setAttribute('data-promotions', '[]');
            card.setAttribute('onclick', 'toggleItemExpansion(this, ' + JSON.stringify(itemPath) + ', event);');
            var expandedBlock = isMenuReelsPreview(doc)
              ? '<div class="menu-smash-pass menu-item-smash-pass menu-smash-pass--no-photos" data-client-id="_ttms_menu_demo" data-menu-item-path="' + itemPath + '">' +
                '<p class="menu-smash-pass__error hidden" role="alert"></p>' +
                '<p class="menu-smash-pass__empty hidden"></p>' +
                '<div class="menu-smash-pass__empty-state hidden" role="region" aria-label="Item photo">' +
                '<div class="menu-image-actions menu-image-actions--standalone">' +
                '<button type="button" class="menu-image-add-btn" style="display:none;" title="Add a photo for this menu item" aria-label="Add a photo for this menu item">' +
                '<i class="fa fa-camera" aria-hidden="true"></i><span class="menu-image-add-btn__label">Add photo</span></button></div>' +
                '<p class="menu-smash-pass__empty-hint">No photo yet — be the first to add one</p></div>' +
                '<div class="menu-smash-pass__reel hidden"><div class="menu-smash-pass__stack" aria-live="polite"></div></div></div>'
              : '<div class="menu-item-expanded-content" style="display: none;">' +
                '<div class="menu-item-expanded-loading"><div class="loading-spinner"></div><div class="loading-text">Loading...</div></div>' +
                '<div class="menu-item-expanded-data" style="display: none;"></div></div>';
            card.innerHTML = '<div class="menu-item-row-top">' +
              '<div class="menu-item-header-content">' +
              '<h3 class="menu-item-title"><a href="#" class="dashboard-new-item-placeholder-link" onclick="return false;" aria-disabled="true">' + titleText + '</a></h3>' +
              '<div class="menu-item-row-middle">' +
              '<div class="menu-item-description">' + summaryInner + '</div>' +
              '<div class="menu-item-price">$0</div>' +
              '</div>' +
              '<div class="menu-item-options"><ul class="sizes"></ul><ul class="flavours"></ul></div>' +
              '</div></div>' + expandedBlock;
            return card;
          }
          win._dashboardCreateNewMenuItemCard = createNewMenuItemCard;
          function createNewSectionElement(doc, title, slug) {
            title = title || 'New Section';
            slug = slug || 'new-section';
            var safeTitle = (title || '').replace(/"/g, '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            var safeSlug = (slug || 'new-section').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'new-section';
            if (isMenuReelsPreview(doc)) {
              var reelHeader = doc.createElement('section');
              reelHeader.className = 'menu-header menu-reels-slide';
              reelHeader.setAttribute('data-dashboard-edit-new-section', '1');
              reelHeader.setAttribute('data-section-slug', safeSlug);
              reelHeader.setAttribute('data-reel-section', title);
              reelHeader.setAttribute('data-weight', '0');
              reelHeader.setAttribute('data-icon', '');
              reelHeader.setAttribute('data-images-secondary', '');
              reelHeader.setAttribute('data-images-primary', '');
              reelHeader.setAttribute('data-item-count', '0');
              reelHeader.innerHTML = '<a class="menu-anchor" id="' + safeSlug + '"></a>' +
                '<div class="headerstyle item"><h2 class="center title"><a href="/' + safeSlug + '/">' + safeTitle + '</a></h2>' +
                '<p class="menu-header__item-count">0 items</p></div>' +
                '<div class="menu-summary item"></div>';
              return reelHeader;
            }
            var outer = doc.createElement('div');
            outer.className = 'main-menu-bg ' + safeTitle.replace(/\s+/g, ' ');
            outer.setAttribute('data-dashboard-edit-new-section', '1');
            var html = '<div class="main-menu ' + safeTitle.replace(/\s+/g, ' ') + ' item">' +
              '<div class="menu-header" data-section-slug="' + safeSlug + '" data-weight="0" data-icon="" data-images-secondary="" data-images-primary="">' +
              '<a class="menu-anchor" id="' + safeSlug + '"></a>' +
              '<div class="headerstyle item"><h2 class="center title"><a href="/' + safeSlug + '/">' + safeTitle + '</a></h2></div>' +
              '<div class="menu-summary item"></div>' +
              '</div>' +
              '<div class="menu-items-container"></div>' +
              '</div>';
            outer.innerHTML = html;
            return outer;
          }
          function createNewPromotionElement(doc) {
            win._dashboardNewPromotionCount = (win._dashboardNewPromotionCount || 0) + 1;
            var n = win._dashboardNewPromotionCount;
            var title = 'New Promotion ' + n;
            var slug = 'new-promotion-' + n;
            var section = doc.createElement('article');
            section.className = 'ads-reels-slide sticky';
            section.setAttribute('data-dashboard-edit-new-promotion', '1');
            section.id = 'menu-ad-' + slug;
            section.setAttribute('data-ad-id', 'menu-ad-' + slug);
            section.setAttribute('data-ad-title', title);
            section.setAttribute('data-ad-url', '/promotions/' + slug + '/');
            section.innerHTML = '<span>Sponsored</span>' +
              '<img src="" class="ad-portrait-bg" alt="">' +
              '<img src="" class="ad-portrait" alt="">';
            return section;
          }
          function removeEditButtons() {
            try {
              closeAllMoveToolbars();
              doc.querySelectorAll('.dashboard-edit-add-item-bar').forEach(function(el) { el.remove(); });
              doc.querySelectorAll('.dashboard-edit-add-promotion-bar').forEach(function(el) { el.remove(); });
              doc.querySelectorAll('.dashboard-edit-add-section-bar').forEach(function(el) { el.remove(); });
              doc.querySelectorAll('.dashboard-edit-card-btn-wrap').forEach(function(el) { el.remove(); });
              doc.querySelectorAll('.menu-item-card.dashboard-edit-card-wrap').forEach(function(el) { el.classList.remove('dashboard-edit-card-wrap'); });
              doc.querySelectorAll('.dashboard-edit-header-btn-wrap').forEach(function(el) { el.remove(); });
              doc.querySelectorAll('.menu-header.dashboard-edit-header-wrap').forEach(function(el) { el.classList.remove('dashboard-edit-header-wrap'); });
              doc.querySelectorAll('.dashboard-edit-ad-btn-wrap').forEach(function(el) { el.remove(); });
              doc.querySelectorAll('section.ads.menu-ad.dashboard-edit-ad-wrap, article.ads-reels-slide.dashboard-edit-ad-wrap, li.ad-panel.dashboard-edit-ad-wrap').forEach(function(el) { el.classList.remove('dashboard-edit-ad-wrap'); });
              doc.querySelectorAll('.dashboard-edit-slideshow-btn-wrap').forEach(function(el) { el.remove(); });
              doc.querySelectorAll('.client-tour-slideshow.dashboard-edit-slideshow-wrap').forEach(function(el) { el.classList.remove('dashboard-edit-slideshow-wrap'); });
              doc.querySelectorAll('.dashboard-edit-location-btn-wrap').forEach(function(el) { el.remove(); });
              doc.querySelectorAll('.location-item.dashboard-edit-location-wrap').forEach(function(el) { el.classList.remove('dashboard-edit-location-wrap'); });
              doc.querySelectorAll('.dashboard-edit-hero-btn-wrap').forEach(function(el) { el.remove(); });
              doc.querySelectorAll('.hero_logo_container.dashboard-edit-hero-wrap').forEach(function(el) { el.classList.remove('dashboard-edit-hero-wrap'); });
              doc.querySelectorAll('.menu-item-card, .menu-header, section.ads.menu-ad, article.ads-reels-slide, #pageadscontainer li.ad-panel').forEach(function(el) {
                el.classList.remove('dashboard-edit-has-change', 'dashboard-edit-new', 'dashboard-edit-marked-delete');
                var path = getContentPathForElement(doc, el);
                if (path && markedForDeletionContentPaths.has(path) && !el.hasAttribute('data-dashboard-edit-new-item')) el.classList.add('dashboard-edit-hidden-for-preview');
              });
            } catch (e) {}
          }
          function expandEditPanel() {
            asideEl.classList.remove('dashboard-edit-options-collapsed');
            btnTogglePanel.setAttribute('aria-expanded', 'true');
            btnTogglePanel.setAttribute('aria-label', 'Collapse edit panel');
            var icon = btnTogglePanel.querySelector('.dashboard-edit-options-toggle-icon');
            if (icon) icon.textContent = '\u25C0';
          }
          win._dashboardInjectEditButtons = injectEditButtons;
          win._dashboardRemoveEditButtons = removeEditButtons;
          scheduleDashboardPreviewBootstrap(win, function() {
            injectEditButtons();
            applyEditHighlights();
          });
          if (win._dashboardEditClick) {
            try {
              doc.body.removeEventListener('click', win._dashboardEditClick, true);
            } catch (remErr) { /* ignore */ }
          }
          win._dashboardEditClick = function(e) {
            if (e.target.closest('.dashboard-edit-move-wrap')) {
              e.stopPropagation();
              return;
            }
            if (win.__dashboardMoveMode) return;
            var addItemBtn = e.target.closest('.dashboard-edit-add-item-btn');
            if (addItemBtn) {
              e.preventDefault();
              e.stopPropagation();
              var bar = addItemBtn.closest('.dashboard-edit-add-item-bar');
              if (!bar) return;
              var sectionSlug = (bar.getAttribute('data-section-slug') || '').trim();
              var header = getSectionHeaderForSlug(doc, sectionSlug);
              if (!header && isMenuReelsPreview(doc)) {
                var prev = bar.previousElementSibling;
                while (prev) {
                  if (prev.classList && prev.classList.contains('menu-header')) {
                    header = prev;
                    break;
                  }
                  prev = prev.previousElementSibling;
                }
              }
              if (!header) {
                var container = bar.parentNode;
                if (container && container.classList && container.classList.contains('menu-items-container')) {
                  var bg = container.closest('.main-menu-bg');
                  header = bg && bg.querySelector('.menu-header[data-section-slug]');
                }
              }
              if (header) {
                var slug = (header.getAttribute('data-section-slug') || sectionSlug || 'menu-items').trim() || 'menu-items';
                var newCard = createNewMenuItemCard(doc, { sectionSlug: slug });
                insertMenuItemCardInSection(doc, header, newCard, bar);
                if (win._dashboardInjectEditButtons) {
                  setTimeout(function() {
                    win._dashboardInjectEditButtons();
                    applyEditHighlights();
                  }, 50);
                } else {
                  syncSaveButtonAppearance();
                }
              }
              return;
            }
            var addPromotionBtn = e.target.closest('.dashboard-edit-add-promotion-btn');
            if (addPromotionBtn) {
              e.preventDefault();
              e.stopPropagation();
              var bar = addPromotionBtn.closest('.dashboard-edit-add-promotion-bar');
              var container = bar && (doc.getElementById('homepage-ads-container') || doc.getElementById('client-ads-container') || doc.getElementById('frontpage-ads-container'));
              if (!container && isMenuReelsPreview(doc)) container = getMenuReelsTrack(doc);
              if (container) {
                var newPromo = createNewPromotionElement(doc);
                var firstAd = container.querySelector('.ads-reels-slide');
                if (firstAd) container.insertBefore(newPromo, firstAd);
                else if (bar && bar.nextElementSibling) container.insertBefore(newPromo, bar.nextElementSibling);
                else container.insertBefore(newPromo, container.firstChild);
                if (win._dashboardInjectEditButtons) {
                  setTimeout(function() {
                    win._dashboardInjectEditButtons();
                    applyEditHighlights();
                  }, 50);
                } else {
                  syncSaveButtonAppearance();
                }
              }
              return;
            }
            var addSectionBtn = e.target.closest('.dashboard-edit-add-section-btn');
            if (addSectionBtn) {
              e.preventDefault();
              e.stopPropagation();
              var bar = addSectionBtn.closest('.dashboard-edit-add-section-bar');
              if (bar && bar.nextElementSibling) {
                win._dashboardNewSectionCount = (win._dashboardNewSectionCount || 0) + 1;
                var n = win._dashboardNewSectionCount;
                var title = 'New Section ' + n;
                var slug = 'new-section-' + n;
                var newSection = createNewSectionElement(doc, title, slug);
                bar.parentNode.insertBefore(newSection, bar.nextElementSibling);
                if (win._dashboardInjectEditButtons) {
                  setTimeout(function() {
                    win._dashboardInjectEditButtons();
                    applyEditHighlights();
                  }, 50);
                } else {
                  syncSaveButtonAppearance();
                }
              }
              return;
            }
            var editBtn = e.target.closest('.dashboard-edit-btn');
            if (editBtn) {
              var heroForEdit = e.target.closest('.hero_logo_container');
              if (heroForEdit && heroForEdit.getAttribute('data-cms-edit') === 'hero-image' && heroForEdit.querySelector('.dashboard-edit-hero-btn-wrap')) {
                e.preventDefault();
                e.stopPropagation();
                expandEditPanel();
                if (selectedElement && selectedElement.classList) selectedElement.classList.remove('dashboard-edit-selected');
                heroForEdit.classList.add('dashboard-edit-selected');
                selectedElement = heroForEdit;
                var bgImg = heroForEdit.querySelector('#bg');
                var srcFallback = bgImg ? (bgImg.getAttribute('src') || '').replace(/^\//, '') : '';
                var heroFormInfo = { element: heroForEdit, type: 'Home hero', contentType: 'home-hero', contentPath: HOME_HERO_CONTENT_PATH, title: '', description: '' };
                promptEl.classList.add('hidden');
                formEl.classList.remove('hidden');
                if (selectedTypeEl) selectedTypeEl.textContent = 'Loading: Home hero';
                if (contentSourceEl) contentSourceEl.textContent = 'Source: ' + HOME_HERO_CONTENT_PATH;
                setEditFormLoading(true, 'Loading home page…');
                function finishHomeHeroEdit(cache) {
                  var fm = (cache && cache.frontMatter) || {};
                  var imgVal = (fm.image != null && String(fm.image).trim() !== '') ? String(fm.image).trim() : srcFallback;
                  if (!homeHeroHasCachedContent()) {
                    homeHeroIndexCache = { frontMatter: { image: srcFallback }, body: (cache && cache.body) || '' };
                  }
                  if (inputHomeHeroImage) inputHomeHeroImage.value = imgVal;
                  showEditForm(heroFormInfo);
                }
                if (homeHeroHasCachedContent()) {
                  finishHomeHeroEdit(homeHeroIndexCache);
                } else {
                  prefetchHomeHeroIndexContent().then(function(cache) {
                    finishHomeHeroEdit(cache || { frontMatter: { image: srcFallback }, body: '' });
                  });
                }
                return;
              }
              var card = e.target.closest('.menu-item-card');
              var header = e.target.closest('.menu-header');
              if (card) {
                e.preventDefault();
                e.stopPropagation();
                var expanded = card.classList.contains('expanded') || card.getAttribute('data-item-expanded') === 'true';
                if (!expanded && typeof win.toggleItemExpansion === 'function') {
                  var url = card.getAttribute('data-item-url') || (card.querySelector('a[href]') && card.querySelector('a[href]').getAttribute('href')) || '';
                  win.toggleItemExpansion(card, url, e);
                  if (win._dashboardInjectEditButtons) setTimeout(win._dashboardInjectEditButtons, 300);
                }
                expandEditPanel();
                if (selectedElement && selectedElement.classList) selectedElement.classList.remove('dashboard-edit-selected');
                card.classList.add('dashboard-edit-selected');
                selectedElement = card;
                var title = getTextContent(card.querySelector('.menu-item-title, .menu-item-title a') || card);
                var desc = getTextContent(card.querySelector('.menu-item-description') || card);
                var itemUrl = card.getAttribute('data-item-url') || (card.querySelector('a[href]') && card.querySelector('a[href]').getAttribute('href')) || '';
                var contentPath = itemUrl ? 'content' + itemUrl.replace(/\/$/, '') + '.md' : 'content/.../item.md';
                showEditForm({ element: card, type: 'Menu item', contentType: 'menu-item', contentPath: contentPath, title: title, description: desc });
                return;
              }
              if (header) {
                e.preventDefault();
                e.stopPropagation();
                expandEditPanel();
                if (selectedElement && selectedElement.classList) selectedElement.classList.remove('dashboard-edit-selected');
                header.classList.add('dashboard-edit-selected');
                selectedElement = header;
                var titleEl = header.querySelector('h2 a, h2');
                var title = titleEl ? getTextContent(titleEl) : '';
                var descEl = header.querySelector('.menu-summary');
                var desc = descEl ? getTextContent(descEl) : '';
                var sectionSlug = header.getAttribute('data-section-slug') || '';
                if (!sectionSlug) {
                  var sectionLink = header.querySelector('h2 a[href], .menu-header a[href]');
                  if (sectionLink) {
                    var href = (sectionLink.getAttribute('href') || '').replace(/^#/, '');
                    var segs = href.split('/').filter(Boolean);
                    if (segs.length) sectionSlug = segs[0];
                  }
                }
                var contentPath = sectionSlug ? 'content/' + sectionSlug + '/_index.md' : 'content/.../_index.md';
                showEditForm({ element: header, type: 'Section header', contentType: 'section-header', contentPath: contentPath, title: title, description: desc });
                return;
              }
              var promoEl = e.target.closest('article.ads-reels-slide, li.ad-panel, section.ads.menu-ad');
              if (promoEl && isPromotionEditableTarget(promoEl)) {
                if (e.target.closest('.ad-unmute-btn')) return;
                e.preventDefault();
                e.stopPropagation();
                expandEditPanel();
                syncPromotionDataset(promoEl, win, doc);
                if (selectedElement && selectedElement.classList) selectedElement.classList.remove('dashboard-edit-selected');
                promoEl.classList.add('dashboard-edit-selected');
                selectedElement = promoEl;
                var titleEl = promoEl.querySelector('.clientad-heading a, .clientad-heading, h2 a, h2');
                var title = promoEl.getAttribute('data-ad-title') || (titleEl ? getTextContent(titleEl) : '');
                var contentPath = promotionContentPathFromElement(promoEl, win, doc) || 'content/promotions/....md';
                showEditForm({ element: promoEl, type: 'Promotion / Ad', contentType: 'promotion', contentPath: contentPath, title: title, description: '' });
                return;
              }
              var slideshow = e.target.closest('.client-tour-slideshow');
              if (slideshow) {
                e.preventDefault();
                e.stopPropagation();
                expandEditPanel();
                if (selectedElement && selectedElement.classList) selectedElement.classList.remove('dashboard-edit-selected');
                slideshow.classList.add('dashboard-edit-selected');
                selectedElement = slideshow;
                showEditForm({ element: slideshow, type: 'Slideshow', contentType: 'slideshow', contentPath: 'content/_index.md (slideshow)', title: '', description: '' });
                return;
              }
              var locationItem = e.target.closest('.location-item');
              if (locationItem) {
                e.preventDefault();
                e.stopPropagation();
                expandEditPanel();
                if (selectedElement && selectedElement.classList) selectedElement.classList.remove('dashboard-edit-selected');
                locationItem.classList.add('dashboard-edit-selected');
                selectedElement = locationItem;
                var locLink = locationItem.querySelector('a.locbtn');
                var address = locLink ? getTextContent(locLink) : '';
                var locIdx = locationItem.getAttribute('data-location-index');
                var contentPath = 'data/locations.yaml' + (locIdx !== null && locIdx !== '' ? ' (index ' + locIdx + ')' : '');
                showEditForm({ element: locationItem, type: 'Location', contentType: 'location', contentPath: contentPath, title: address, description: '' });
                return;
              }
            }
            // Only the edit button (and add-item / add-promo / add-section) open the form; clicks on title/description/price/card do not
          };
          doc.body.addEventListener('click', win._dashboardEditClick, true);
          win.__dashboardMoveMode = editSubmode === 'move';
          doc.body.classList.toggle('dashboard-edit-move-mode', editSubmode === 'move');
        } else {
          if (win._dashboardEditClick) {
            doc.body.removeEventListener('click', win._dashboardEditClick, true);
            win._dashboardEditClick = null;
          }
          win.__dashboardMoveMode = false;
          doc.body.classList.remove('dashboard-edit-move-mode');
          if (win._dashboardRemoveEditButtons) win._dashboardRemoveEditButtons();
          var sty = doc.getElementById('dashboard-edit-injected-style');
          if (sty) sty.remove();
          var previewHideStyle = doc.getElementById('dashboard-edit-preview-hide-style');
          if (!previewHideStyle) {
            previewHideStyle = doc.createElement('style');
            previewHideStyle.id = 'dashboard-edit-preview-hide-style';
            previewHideStyle.textContent = '.dashboard-edit-hidden-for-preview { display: none !important; }';
            doc.head.appendChild(previewHideStyle);
          }
          if (selectedElement && selectedElement.classList) selectedElement.classList.remove('dashboard-edit-selected');
        }
      } catch (err) {
        console.warn('Dashboard edit: iframe not ready or cross-origin', err);
      }
    }
    if (iframe.contentDocument && iframe.contentDocument.body) {
      runWhenReady();
    } else {
      iframe.addEventListener('load', runWhenReady);
    }
  }

  if (btnPreview) btnPreview.addEventListener('click', function() { setEditMode(false); });
  if (btnEdit) {
    btnEdit.addEventListener('click', function() {
      ensurePreviewIframeLoaded();
      setEditMode(true);
    });
  }
  if (btnSubmodeContent) btnSubmodeContent.addEventListener('click', function() { setEditSubmode('content'); });
  if (btnSubmodeMove) btnSubmodeMove.addEventListener('click', function() { setEditSubmode('move'); });
  if (btnSubmodeColor) btnSubmodeColor.addEventListener('click', function() { setEditSubmode('color'); });
  if (btnApplyColor) btnApplyColor.addEventListener('click', applyColorOverrides);
  if (btnCloseColorSection) btnCloseColorSection.addEventListener('click', exitColorSectionEdit);
  if (btnBackColorSections) btnBackColorSections.addEventListener('click', exitColorSectionEdit);
  function updateMarkForDeletionButton() {
    if (!btnMarkForDeletion) return;
    var isNewUnpublishedItem = selectedElement && selectedElement.classList && selectedElement.classList.contains('menu-item-card') && selectedElement.hasAttribute('data-dashboard-edit-new-item');
    if (isNewUnpublishedItem && selectedInfo && selectedInfo.contentType === 'menu-item') {
      btnMarkForDeletion.disabled = false;
      btnMarkForDeletion.classList.remove('btn-dash-secondary');
      btnMarkForDeletion.classList.add('btn-dash-danger');
      btnMarkForDeletion.innerHTML = '<i class="fa fa-trash" aria-hidden="true"></i>';
      btnMarkForDeletion.setAttribute('aria-label', 'Remove new item');
      btnMarkForDeletion.title = 'Remove this unsaved item from the preview (not published yet)';
      return;
    }
    var canMark = selectedInfo && selectedInfo.contentPath && ['menu-item', 'section-header', 'promotion'].indexOf(selectedInfo.contentType || '') >= 0;
    btnMarkForDeletion.disabled = !canMark;
    btnMarkForDeletion.classList.remove('btn-dash-secondary', 'btn-dash-danger');
    if (canMark && selectedInfo.contentPath && markedForDeletionContentPaths.has(selectedInfo.contentPath)) {
      btnMarkForDeletion.classList.add('btn-dash-secondary');
      btnMarkForDeletion.innerHTML = '<i class="fa fa-undo" aria-hidden="true"></i>';
      btnMarkForDeletion.setAttribute('aria-label', 'Unmark deletion');
      btnMarkForDeletion.title = 'Unmark this item from deletion';
    } else {
      btnMarkForDeletion.classList.add('btn-dash-danger');
      btnMarkForDeletion.innerHTML = '<i class="fa fa-trash" aria-hidden="true"></i>';
      btnMarkForDeletion.setAttribute('aria-label', 'Mark for deletion');
      btnMarkForDeletion.title = 'Mark for deletion (hidden in preview)';
    }
  }
  if (btnMarkForDeletion) {
    btnMarkForDeletion.addEventListener('click', function() {
      if (!selectedInfo || !selectedInfo.contentPath) return;
      if (selectedElement && selectedElement.hasAttribute('data-dashboard-edit-new-item') && selectedInfo.contentType === 'menu-item') {
        if (!confirm('Remove this new item? It is not saved or published yet.')) return;
        var path = selectedInfo.contentPath;
        if (path) {
          markedForDeletionContentPaths.delete(path);
          draftContentPaths.delete(path);
        }
        var elToRemove = selectedElement;
        clearSelection();
        if (elToRemove && elToRemove.parentNode) elToRemove.parentNode.removeChild(elToRemove);
        applyEditHighlights();
        return;
      }
      var path = selectedInfo.contentPath;
      if (markedForDeletionContentPaths.has(path)) {
        markedForDeletionContentPaths.delete(path);
      } else {
        if (!confirm('Mark this item for deletion? It will be hidden in preview until you publish.')) return;
        markedForDeletionContentPaths.add(path);
      }
      updateMarkForDeletionButton();
      applyEditHighlights();
    });
    updateMarkForDeletionButton();
  }
  if (btnAddSideCategory && sideCategoriesContainer) {
    btnAddSideCategory.addEventListener('click', function() {
      var idx = sideCategoriesContainer.querySelectorAll('.side-cat-block').length;
      sideCategoriesContainer.appendChild(createSideCatBlock({ category_name: '', display_name: '', items: [], config: { minimum: 0, maximum: 99 } }, idx));
    });
  }
  if (btnAddPrice && pricesContainer) {
    btnAddPrice.addEventListener('click', function() {
      pricesContainer.appendChild(createPriceRow('', '-', 0));
    });
  }
  if (btnAddMenuItemImage && btnAddMenuItemImageFile && menuItemImagesContainer) {
    btnAddMenuItemImage.addEventListener('click', function() {
      btnAddMenuItemImageFile.click();
    });
    btnAddMenuItemImageFile.addEventListener('change', function() {
      var f = btnAddMenuItemImageFile.files && btnAddMenuItemImageFile.files[0];
      btnAddMenuItemImageFile.value = '';
      if (!f) return;
      var paths = gatherMenuItemImagePathsFromRows();
      if (menuItemImagesContainer.querySelector('.dashboard-menu-item-images-empty')) paths = [];
      uploadMenuItemDraftImage(f, null, function(path, file) {
        paths.push(path);
        renderMenuItemImagesUI(paths, true, { lastPreviewFile: file });
      }, { statusLabel: 'Uploading new image…' });
    });
  }
  if (btnBrowseSiteMenuItemImages && menuItemImagesContainer) {
    btnBrowseSiteMenuItemImages.addEventListener('click', function() {
      openSiteImagePickerModal(function(rel) {
        var paths = gatherMenuItemImagePathsFromRows();
        if (menuItemImagesContainer.querySelector('.dashboard-menu-item-images-empty')) paths = [];
        paths.push(rel);
        renderMenuItemImagesUI(paths, true);
        editFormDirty = true;
        setEditStatus('Unsaved changes (not yet published)');
      });
    });
  }
  if (btnAddSlideshowImage && btnAddSlideshowImageFile && slideshowImagesContainer) {
    btnAddSlideshowImage.addEventListener('click', function() {
      btnAddSlideshowImageFile.click();
    });
    btnAddSlideshowImageFile.addEventListener('change', function() {
      var f = btnAddSlideshowImageFile.files && btnAddSlideshowImageFile.files[0];
      btnAddSlideshowImageFile.value = '';
      if (!f) return;
      var paths = gatherSlideshowImagePathsFromRows();
      if (slideshowImagesContainer.querySelector('.dashboard-menu-item-images-empty')) paths = [];
      uploadMenuItemDraftImage(f, null, function(path, file) {
        paths.push(path);
        renderSlideshowImagesUI(paths, true, { lastPreviewFile: file });
      }, { statusLabel: 'Uploading new image…', useSlideshowStatus: true });
    });
  }
  if (btnBrowseSiteSlideshowImages && slideshowImagesContainer) {
    btnBrowseSiteSlideshowImages.addEventListener('click', function() {
      openSiteImagePickerModal(function(rel) {
        var paths = gatherSlideshowImagePathsFromRows();
        if (slideshowImagesContainer.querySelector('.dashboard-menu-item-images-empty')) paths = [];
        paths.push(rel);
        renderSlideshowImagesUI(paths, true);
        editFormDirty = true;
        setEditStatus('Unsaved changes (not yet published)');
      });
    });
  }
  function applySectionIconPath(path) {
    if (!inputSectionIcon) return;
    inputSectionIcon.value = (path || '').trim();
    if (window.DashboardSectionIconPicker && typeof window.DashboardSectionIconPicker.syncFromInput === 'function') {
      window.DashboardSectionIconPicker.syncFromInput();
    } else {
      inputSectionIcon.dispatchEvent(new Event('input', { bubbles: true }));
      inputSectionIcon.dispatchEvent(new Event('change', { bubbles: true }));
    }
    editFormDirty = true;
    setEditStatus('Unsaved changes (not yet published)');
  }
  if (btnSectionIconUpload && btnSectionIconFile && inputSectionIcon) {
    btnSectionIconUpload.addEventListener('click', function() { btnSectionIconFile.click(); });
    btnSectionIconFile.addEventListener('change', function() {
      var f = btnSectionIconFile.files && btnSectionIconFile.files[0];
      btnSectionIconFile.value = '';
      if (!f) return;
      uploadMenuItemDraftImage(f, inputSectionIcon, function(path) {
        applySectionIconPath(path);
      }, { statusLabel: 'Uploading section icon…', useSectionIconStatus: true });
    });
  }
  if (btnSectionIconBrowse && inputSectionIcon) {
    btnSectionIconBrowse.addEventListener('click', function() {
      openSiteImagePickerModal(function(rel) {
        applySectionIconPath(rel);
      });
    });
  }
  function applySectionSecondaryImagePath(path) {
    if (!inputSectionImageTop) return;
    inputSectionImageTop.value = (path || '').trim();
    if (window.DashboardSectionSecondaryImagePicker && typeof window.DashboardSectionSecondaryImagePicker.syncFromInput === 'function') {
      window.DashboardSectionSecondaryImagePicker.syncFromInput();
    } else {
      inputSectionImageTop.dispatchEvent(new Event('input', { bubbles: true }));
      inputSectionImageTop.dispatchEvent(new Event('change', { bubbles: true }));
    }
    editFormDirty = true;
    setEditStatus('Unsaved changes (not yet published)');
  }
  if (btnSectionSecondaryImageUpload && btnSectionSecondaryImageFile && inputSectionImageTop) {
    btnSectionSecondaryImageUpload.addEventListener('click', function() { btnSectionSecondaryImageFile.click(); });
    btnSectionSecondaryImageFile.addEventListener('change', function() {
      var f = btnSectionSecondaryImageFile.files && btnSectionSecondaryImageFile.files[0];
      btnSectionSecondaryImageFile.value = '';
      if (!f) return;
      uploadMenuItemDraftImage(f, inputSectionImageTop, function(path) {
        applySectionSecondaryImagePath(path);
      }, { statusLabel: 'Uploading secondary image…', useSectionSecondaryImageStatus: true });
    });
  }
  if (btnSectionSecondaryImageBrowse && inputSectionImageTop) {
    btnSectionSecondaryImageBrowse.addEventListener('click', function() {
      openSiteImagePickerModal(function(rel) {
        applySectionSecondaryImagePath(rel);
      });
    });
  }
  function wireSectionSingleImageField(cfg) {
    if (!cfg || !cfg.input) return;
    var thumbState = { seq: 0, blobUrl: null };
    function markDirty() {
      editFormDirty = true;
      setEditStatus('Unsaved changes (not yet published)');
    }
    function updateThumb(path, previewFile) {
      if (!cfg.thumb) return;
      bindDashboardImageThumb(cfg.thumb, cfg.thumbWrap, path, previewFile, thumbState);
    }
    if (cfg.uploadBtn && cfg.fileInput) {
      cfg.uploadBtn.addEventListener('click', function() { cfg.fileInput.click(); });
      cfg.fileInput.addEventListener('change', function() {
        var f = cfg.fileInput.files && cfg.fileInput.files[0];
        cfg.fileInput.value = '';
        if (!f) return;
        uploadMenuItemDraftImage(f, cfg.input, function(path, file) {
          updateThumb(path, file);
          markDirty();
        }, { rowEl: cfg.row, statusLabel: 'Uploading image…' });
      });
    }
    if (cfg.browseBtn) {
      cfg.browseBtn.addEventListener('click', function() {
        openSiteImagePickerModal(function(rel) {
          cfg.input.value = rel;
          updateThumb(rel, null);
          markDirty();
        });
      });
    }
    if (cfg.removeBtn) {
      cfg.removeBtn.addEventListener('click', function() {
        cfg.input.value = '';
        updateThumb('', null);
        markDirty();
      });
    }
    var pathTimer = null;
    cfg.input.addEventListener('input', function() {
      clearTimeout(pathTimer);
      pathTimer = setTimeout(function() {
        updateThumb(cfg.input.value.trim(), null);
      }, 350);
    });
    updateThumb(cfg.input.value.trim(), null);
  }
  wireSectionSingleImageField({
    input: inputSectionImageBottom,
    thumb: sectionImageBottomThumb,
    thumbWrap: sectionImageBottomThumbWrap,
    row: sectionImageBottomRow,
    uploadBtn: btnSectionImageBottomUpload,
    fileInput: btnSectionImageBottomFile,
    browseBtn: btnSectionImageBottomBrowse,
    removeBtn: btnSectionImageBottomRemove,
  });
  if (btnAddPromoImage && btnAddPromoImageFile && promoImagesContainer) {
    btnAddPromoImage.addEventListener('click', function() {
      btnAddPromoImageFile.click();
    });
    btnAddPromoImageFile.addEventListener('change', function() {
      var f = btnAddPromoImageFile.files && btnAddPromoImageFile.files[0];
      btnAddPromoImageFile.value = '';
      if (!f) return;
      var paths = gatherPromoImagePathsFromRows();
      if (promoImagesContainer.querySelector('.dashboard-menu-item-images-empty')) paths = [];
      uploadMenuItemDraftImage(f, null, function(path, file) {
        paths.push(path);
        renderPromoImagesUI(paths, true, { lastPreviewFile: file });
      }, { statusLabel: 'Uploading new image…', usePromoStatus: true });
    });
  }
  if (btnPromoBrowseSiteImages && promoImagesContainer) {
    btnPromoBrowseSiteImages.addEventListener('click', function() {
      openSiteImagePickerModal(function(rel) {
        var paths = gatherPromoImagePathsFromRows();
        if (promoImagesContainer.querySelector('.dashboard-menu-item-images-empty')) paths = [];
        paths.push(rel);
        renderPromoImagesUI(paths, true);
        editFormDirty = true;
        setEditStatus('Unsaved changes (not yet published)');
      });
    });
  }
  function closeSiteImagePickerModal() {
    siteImagePickerOnPick = null;
    if (!heroSiteImageModal) return;
    heroSiteImageModal.classList.add('hidden');
    heroSiteImageModal.setAttribute('aria-hidden', 'true');
  }
  /**
   * Open site images modal. Pass onPick(rel) to set path; omit for hero image default behavior.
   */
  function openSiteImagePickerModal(onPick) {
    siteImagePickerOnPick = (typeof onPick === 'function') ? onPick : function(rel) {
      if (!inputHomeHeroImage) return;
      inputHomeHeroImage.value = rel;
      updateHeroImageThumbDisplay(rel, null);
      syncHeroPathInputVisibility();
      editFormDirty = true;
      setEditStatus('Unsaved changes (not yet published)');
    };
    if (!heroSiteImageModal) return;
    heroSiteImageModal.classList.remove('hidden');
    heroSiteImageModal.setAttribute('aria-hidden', 'false');
    if (heroSiteImageError) { heroSiteImageError.classList.add('hidden'); heroSiteImageError.textContent = ''; }
    if (heroSiteImageEmpty) heroSiteImageEmpty.classList.add('hidden');
    if (heroSiteImageGrid) heroSiteImageGrid.innerHTML = '';
    if (siteImagesListCache !== null && draftAssetsListCache !== null) {
      if (heroSiteImageLoading) heroSiteImageLoading.classList.add('hidden');
      renderHeroSiteImagePickerGrid(draftAssetsListCache, siteImagesListCache);
      if (!draftAssetsListCache.length && !siteImagesListCache.length && heroSiteImageEmpty) {
        heroSiteImageEmpty.classList.remove('hidden');
      }
      return;
    }
    if (heroSiteImageLoading) heroSiteImageLoading.classList.remove('hidden');
    Promise.all([fetchSiteImagePathsFromApi(), fetchDraftAssetPathsFromApi()])
      .then(function(results) {
        if (heroSiteImageLoading) heroSiteImageLoading.classList.add('hidden');
        var sitePaths = results[0] || [];
        var draftPaths = results[1] || [];
        if (!sitePaths.length && !draftPaths.length) {
          if (heroSiteImageEmpty) heroSiteImageEmpty.classList.remove('hidden');
          return;
        }
        renderHeroSiteImagePickerGrid(draftPaths, sitePaths);
      })
      .catch(function(err) {
        if (heroSiteImageLoading) heroSiteImageLoading.classList.add('hidden');
        if (heroSiteImageError) {
          heroSiteImageError.classList.remove('hidden');
          heroSiteImageError.textContent = 'Could not load images. ' + (err && err.message ? err.message : 'Check your connection or try again.');
        }
      });
  }
  function renderHeroSiteImagePickerGrid(draftPaths, sitePaths) {
    if (!heroSiteImageGrid) return;
    heroSiteImageGrid.innerHTML = '';
    draftPaths = draftPaths || [];
    sitePaths = sitePaths || [];
    if (draftPaths.length) {
      var draftHeading = document.createElement('h3');
      draftHeading.className = 'dashboard-site-image-grid-section-title';
      draftHeading.textContent = 'Uploaded drafts';
      heroSiteImageGrid.appendChild(draftHeading);
      appendHeroSiteImagePickButtons(draftPaths);
    }
    if (sitePaths.length) {
      var siteHeading = document.createElement('h3');
      siteHeading.className = 'dashboard-site-image-grid-section-title';
      siteHeading.textContent = 'Site repository';
      heroSiteImageGrid.appendChild(siteHeading);
      appendHeroSiteImagePickButtons(sitePaths);
    }
  }
  function appendHeroSiteImagePickButtons(paths) {
    if (!heroSiteImageGrid || !paths || !paths.length) return;
    paths.forEach(function(rel) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dashboard-site-image-pick-btn';
      var thumb = document.createElement('div');
      thumb.className = 'dashboard-site-image-pick-thumb';
      var img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.src = resolveMenuItemImageSrcForPreview(rel);
      img.onerror = function() { thumb.classList.add('dashboard-site-image-pick-thumb--broken'); };
      thumb.appendChild(img);
      var cap = document.createElement('span');
      cap.className = 'dashboard-site-image-pick-label';
      cap.textContent = rel;
      btn.appendChild(thumb);
      btn.appendChild(cap);
      btn.addEventListener('click', function() {
        var fn = siteImagePickerOnPick;
        if (fn) {
          try { fn(rel); } catch (e) { console.warn('Site image pick', e); }
        }
        closeSiteImagePickerModal();
      });
      heroSiteImageGrid.appendChild(btn);
    });
  }
  function renderHeroSiteImageGrid(paths) {
    if (!heroSiteImageGrid) return;
    heroSiteImageGrid.innerHTML = '';
    appendHeroSiteImagePickButtons(paths);
  }
  (function setupHeroImageUI() {
    if (btnHeroImageReplace && btnHeroImageFile) {
      btnHeroImageReplace.addEventListener('click', function() { btnHeroImageFile.click(); });
    }
    if (btnHeroImageBrowseSite) {
      btnHeroImageBrowseSite.addEventListener('click', function() { openSiteImagePickerModal(); });
    }
    if (heroSiteImageModalBackdrop) {
      heroSiteImageModalBackdrop.addEventListener('click', closeSiteImagePickerModal);
    }
    if (heroSiteImageModalClose) {
      heroSiteImageModalClose.addEventListener('click', closeSiteImagePickerModal);
    }
    if (btnHeroImageFile && inputHomeHeroImage) {
      btnHeroImageFile.addEventListener('change', function() {
        var f = btnHeroImageFile.files && btnHeroImageFile.files[0];
        btnHeroImageFile.value = '';
        if (!f) return;
        uploadMenuItemDraftImage(f, inputHomeHeroImage, function(path, file) {
          updateHeroImageThumbDisplay(path, file);
        }, {
          rowEl: dashboardHeroImageRow,
          useHeroStatus: true,
          statusLabel: 'Uploading hero image…'
        });
      });
    }
    if (btnHeroImageRemove && inputHomeHeroImage) {
      btnHeroImageRemove.addEventListener('click', function() {
        inputHomeHeroImage.value = '';
        updateHeroImageThumbDisplay('', null);
        syncHeroPathInputVisibility();
        editFormDirty = true;
        setEditStatus('Unsaved changes (not yet published)');
      });
    }
  })();
  if (btnAddModification && modificationsContainer) {
    btnAddModification.addEventListener('click', function() {
      modificationsContainer.appendChild(createPairRow('', 0));
    });
  }
  if (btnAddAddition && additionsContainer) {
    btnAddAddition.addEventListener('click', function() {
      additionsContainer.appendChild(createPairRow('', 0));
    });
  }
  if (btnAddTag && tagsContainer) {
    btnAddTag.addEventListener('click', function() {
      tagsContainer.appendChild(createListRow(''));
    });
  }
  if (btnAddIngredient && ingredientsContainer) {
    btnAddIngredient.addEventListener('click', function() {
      ingredientsContainer.appendChild(createListRow(''));
    });
  }
  if (btnAddCookingmethod && cookingmethodsContainer) {
    btnAddCookingmethod.addEventListener('click', function() {
      cookingmethodsContainer.appendChild(createListRow(''));
    });
  }
  if (btnAddType && typesContainer) {
    btnAddType.addEventListener('click', function() {
      typesContainer.appendChild(createListRow(''));
    });
  }
  if (btnAddEvent && eventsContainer) {
    btnAddEvent.addEventListener('click', function() {
      eventsContainer.appendChild(createListRow(''));
    });
  }
  if (btnAddMenuItemPromotion && menuItemPromotionsContainer) {
    btnAddMenuItemPromotion.addEventListener('click', function() {
      menuItemPromotionsContainer.appendChild(createMenuItemPromotionRow(null));
    });
  }
  (function setupMenuItemWizard() {
    var root = document.getElementById('dashboardMenuItemWizardRoot');
    if (!root) return;
    root.querySelectorAll('.dashboard-wizard-tab[data-wizard-index]').forEach(function(tab) {
      tab.addEventListener('click', function() {
        var idx = parseInt(tab.getAttribute('data-wizard-index'), 10);
        if (!isNaN(idx)) setMenuItemWizardStep(idx);
      });
    });
    if (btnMenuItemWizardPrev) {
      btnMenuItemWizardPrev.addEventListener('click', function() {
        setMenuItemWizardStep(menuItemWizardStep - 1);
      });
    }
    if (btnMenuItemWizardNext) {
      btnMenuItemWizardNext.addEventListener('click', function() {
        if (isEmbedWizardSaveStep(menuItemWizardStep, MENU_ITEM_WIZARD_LABELS)) {
          saveEmbedPanelSnapshot();
          return;
        }
        var panel = root.querySelector('.dashboard-menu-item-wizard-panel[data-wizard-index="' + menuItemWizardStep + '"]');
        tryAdvanceWizardPanel(panel, function() {
          setMenuItemWizardStep(menuItemWizardStep + 1);
        });
      });
    }
  })();
  (function setupPromotionWizard() {
    var root = document.getElementById('dashboardPromotionWizardRoot');
    if (!root) return;
    root.querySelectorAll('.dashboard-wizard-tab[data-promo-wizard-index]').forEach(function(tab) {
      tab.addEventListener('click', function() {
        var idx = parseInt(tab.getAttribute('data-promo-wizard-index'), 10);
        if (!isNaN(idx)) setPromotionWizardStep(idx);
      });
    });
    if (btnPromoWizardPrev) {
      btnPromoWizardPrev.addEventListener('click', function() {
        setPromotionWizardStep(promoWizardStep - 1);
      });
    }
    if (btnPromoWizardNext) {
      btnPromoWizardNext.addEventListener('click', function() {
        if (isEmbedWizardSaveStep(promoWizardStep, PROMO_WIZARD_LABELS)) {
          saveEmbedPanelSnapshot();
          return;
        }
        var panel = root.querySelector('.dashboard-promotion-wizard-panel[data-promo-wizard-index="' + promoWizardStep + '"]');
        tryAdvanceWizardPanel(panel, function() {
          setPromotionWizardStep(promoWizardStep + 1);
        });
      });
    }
  })();
  (function setupLocationWizard() {
    var root = document.getElementById('dashboardLocationWizardRoot');
    if (!root) return;
    root.querySelectorAll('.dashboard-wizard-tab[data-location-wizard-index]').forEach(function(tab) {
      tab.addEventListener('click', function() {
        var idx = parseInt(tab.getAttribute('data-location-wizard-index'), 10);
        if (!isNaN(idx)) setLocationWizardStep(idx);
      });
    });
    if (btnLocationWizardPrev) {
      btnLocationWizardPrev.addEventListener('click', function() {
        setLocationWizardStep(locationWizardStep - 1);
      });
    }
    if (btnLocationWizardNext) {
      btnLocationWizardNext.addEventListener('click', function() {
        var panel = root.querySelector('.dashboard-location-wizard-panel[data-location-wizard-index="' + locationWizardStep + '"]');
        tryAdvanceWizardPanel(panel, function() {
          setLocationWizardStep(locationWizardStep + 1);
        });
      });
    }
  })();
  (function setupSectionWizard() {
    var root = document.getElementById('dashboardSectionWizardRoot');
    if (!root) return;
    root.querySelectorAll('.dashboard-wizard-tab[data-section-wizard-index]').forEach(function(tab) {
      tab.addEventListener('click', function() {
        var idx = parseInt(tab.getAttribute('data-section-wizard-index'), 10);
        if (!isNaN(idx)) setSectionWizardStep(idx);
      });
    });
    if (btnSectionWizardPrev) {
      btnSectionWizardPrev.addEventListener('click', function() {
        setSectionWizardStep(sectionWizardStep - 1);
      });
    }
    if (btnSectionWizardNext) {
      btnSectionWizardNext.addEventListener('click', function() {
        if (isEmbedWizardSaveStep(sectionWizardStep, SECTION_WIZARD_LABELS)) {
          saveEmbedPanelSnapshot();
          return;
        }
        var panel = root.querySelector('.dashboard-section-wizard-panel[data-section-wizard-index="' + sectionWizardStep + '"]');
        tryAdvanceWizardPanel(panel, function() {
          setSectionWizardStep(sectionWizardStep + 1);
        });
      });
    }
  })();
  if (btnAddPromoDay && promoDaysofweekContainer) {
    btnAddPromoDay.addEventListener('click', function() {
      promoDaysofweekContainer.appendChild(createListRow(''));
    });
  }
  function fetchPreviewsForPublish() {
    var url = CMS_SERVICE_URL.replace(/\/+$/, '') + '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/previews';
    var headers = { 'Accept': 'application/json' };
    var token = (typeof AuthClient !== 'undefined' && AuthClient.getAccessToken) ? AuthClient.getAccessToken() : (typeof localStorage !== 'undefined' ? localStorage.getItem('ttmenus_access_token') : null);
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(url, { method: 'GET', credentials: 'include', headers: headers })
      .then(function(res) { return res.ok ? res.json() : { previews: [] }; })
      .catch(function() { return { previews: [] }; })
      .then(function(data) {
        var raw = data && data.previews && Array.isArray(data.previews) ? data.previews : [];
        return dedupePreviewsByContentPath(raw);
      });
  }
  function publishSummaryLabel(p) {
    var payload = p.payload || p.Payload || {};
    var kind = payload.kind || p.kind || 'content';
    var path = payload.contentPath || p.content_path || '';
    var fm = payload.frontMatter || payload.front_matter || {};
    var title = (fm.title != null && fm.title !== '') ? String(fm.title) : (path ? path.replace(/^content\//, '').replace(/\.md$/, '') : '');
    var kindLabel = kind === 'menu-item' ? 'Menu item' : kind === 'section-header' ? 'Section' : kind === 'promotion' ? 'Promotion' : kind === 'theme-css' ? 'Theme colors' : kind;
    return title ? kindLabel + ': ' + title + ' (' + path + ')' : kindLabel + ': ' + path;
  }

  /** Opens the Git publish review modal (content apply-batch). */
  function openPublishSummaryModal(previews) {
    if (!previews || previews.length === 0) {
      alert('No saved drafts to publish. Save content drafts in the edit panel first.');
          return;
        }
        var pending = previews.slice();
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
        if (publishSummaryModal && !publishSummaryModal.dataset.backdropBound) {
          publishSummaryModal.dataset.backdropBound = '1';
          var publishSummaryBackdrop = publishSummaryModal.querySelector(
            '.dashboard-publish-summary-backdrop'
          );
          if (publishSummaryBackdrop) {
            publishSummaryBackdrop.addEventListener('click', closePublishSummaryModal);
          }
          document.addEventListener('keydown', function(ev) {
            if (ev.key !== 'Escape') return;
            if (!publishSummaryModal || publishSummaryModal.classList.contains('hidden')) return;
            closePublishSummaryModal();
            ev.preventDefault();
          });
        }
        function renderSummary() {
          if (!publishSummaryList || !publishSummaryCount) return;
          publishSummaryList.innerHTML = '';
          publishSummaryCount.textContent =
            pending.length === 0
              ? 'No files selected'
              : pending.length === 1
                ? '1 file ready to publish to Git'
                : pending.length + ' files ready to publish to Git';
          if (publishSummaryConfirm) {
            publishSummaryConfirm.disabled = pending.length === 0;
            if (pending.length === 0) {
              publishSummaryConfirm.textContent = 'Nothing to publish';
            } else {
              publishSummaryConfirm.innerHTML =
                '<i class="fa fa-cloud-upload" aria-hidden="true"></i> Publish';
            }
          }
          pending.forEach(function(p) {
            var rowId = p.id || '';
            var li = document.createElement('li');
            li.className = 'dashboard-publish-summary-item';
            var label = document.createElement('span');
            label.className = 'dashboard-publish-summary-label';
            label.textContent = publishSummaryLabel(p);
            var removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'dashboard-publish-summary-revert';
            removeBtn.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
            removeBtn.setAttribute('aria-label', 'Remove draft from publish list');
            removeBtn.addEventListener('click', function() {
              var idx = pending.findIndex(function(x) { return (x.id || '') === rowId; });
              if (idx === -1) return;
              var item = pending[idx];
              var previewId = item.id;
              var contentPath = (item.payload || item.Payload || {}).contentPath || item.content_path || '';
              function removeFromList() {
                pending.splice(idx, 1);
                if (contentPath) draftContentPaths.delete(contentPath);
                applyEditHighlights();
                renderSummary();
                if (pending.length === 0) closePublishSummaryModal();
              }
              if (previewId) {
                var delPath = '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/previews/' + encodeURIComponent(previewId);
                var delUrl = CMS_SERVICE_URL.replace(/\/+$/, '') + delPath;
                var headers = { 'Accept': 'application/json' };
                var token = (typeof AuthClient !== 'undefined' && AuthClient.getAccessToken) ? AuthClient.getAccessToken() : (typeof localStorage !== 'undefined' ? localStorage.getItem('ttmenus_access_token') : null);
                if (token) headers['Authorization'] = 'Bearer ' + token;
                cmsLogJson('DELETE preview →', delPath, { previewId: previewId });
                fetch(delUrl, { method: 'DELETE', credentials: 'include', headers: headers })
                  .then(function(res) {
                    if (!res.ok && res.status !== 204) return res.text().then(function(t) { throw new Error(t); });
                    cmsLogJson('DELETE preview ←', delPath, { status: res.status });
                    removeFromList();
                  })
                  .catch(function(err) {
                    cmsLogJson('DELETE preview ✗', delPath, { error: String(err && err.message ? err.message : err) });
                    console.error('Delete draft failed', err);
                    alert('Could not delete saved change: ' + (err.message || err));
                  });
              } else {
                removeFromList();
              }
            });
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
          publishSummaryConfirm.onclick = function() {
            if (pending.length === 0) return;
            publishSummaryConfirm.disabled = true;
            var changes = pending.map(function(p) {
              var payload = p.payload || p.Payload || {};
              var item = { payload: payload };
              if (p.id) item.previewId = p.id;
              return item;
            });
            var body = {
              changes: changes,
              commitMessage: 'Publish ' + pending.length + ' change(s)'
            };
            var applyBatchPath = '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/apply-batch';
            postToCMS(applyBatchPath, body).then(function(resp) {
              console.log('Publish response:', resp);
          try {
            var hash = (resp && resp.commit && resp.commit.hash) ? String(resp.commit.hash) : '';
            var labels = pending.map(function(p) { return publishSummaryLabel(p); });
            localStorage.setItem('ttmenus_last_publish_' + CMS_CLIENT_ID, JSON.stringify({
              at: new Date().toISOString(),
              ok: true,
              count: pending.length,
              commitHash: hash,
              fileLabels: labels.slice(0, 24)
            }));
          } catch (e) {}
              pending.forEach(function(p) {
                var cp = (p.payload || p.Payload || {}).contentPath || p.content_path || '';
                if (cp) draftContentPaths.delete(cp);
              });
              applyEditHighlights();
              closePublishSummaryModal();
              publishSummaryConfirm.disabled = false;
              publishSummaryConfirm.innerHTML =
                '<i class="fa fa-cloud-upload" aria-hidden="true"></i> Publish';
              editFormDirty = false;
              savedDraftPreviewId = null;
              setEditStatus('Published');
            }).catch(function(err) {
              console.error('Publish error:', err);
              alert('Publish failed: ' + (err.message || err));
              publishSummaryConfirm.disabled = false;
            });
          };
        }
  }

  function saveOptionsModalSyncDiscardState() {
    var discardBtn = document.getElementById('dashboardSaveOptionsDiscard');
    if (discardBtn) {
      var can = !!editorSnapshotVersionId;
      discardBtn.disabled = !can;
      discardBtn.title = can ? 'Permanently delete the saved menu snapshot on the CMS' : 'No saved menu snapshot to discard (open from a saved version, or save a snapshot first).';
    }
  }

  function openSaveOptionsModal() {
    var m = document.getElementById('dashboardSaveOptionsModal');
    if (m) {
      saveOptionsModalSyncDiscardState();
      renderSaveOptionsChangesSummary();
      m.classList.remove('hidden');
      m.setAttribute('aria-hidden', 'false');
    }
  }

  function closeSaveOptionsModal() {
    var m = document.getElementById('dashboardSaveOptionsModal');
    if (m) {
      m.classList.add('hidden');
      m.setAttribute('aria-hidden', 'true');
    }
  }

  if (btnSave) {
    btnSave.addEventListener('click', function() {
      openSaveOptionsModal();
    });
    syncSaveButtonAppearance();
  }

  (function wireSaveOptionsModal() {
    var backdrop = document.getElementById('dashboardSaveOptionsModalBackdrop');
    var cancel = document.getElementById('dashboardSaveOptionsCancel');
    var saveOnly = document.getElementById('dashboardSaveSnapshotOnly');
    var savePub = document.getElementById('dashboardSaveAndPublish');
    var discard = document.getElementById('dashboardSaveOptionsDiscard');
    if (backdrop) backdrop.addEventListener('click', closeSaveOptionsModal);
    if (cancel) cancel.addEventListener('click', closeSaveOptionsModal);
    if (saveOnly) {
      saveOnly.addEventListener('click', function() {
        closeSaveOptionsModal();
        if (btnSave) btnSave.disabled = true;
        saveMenuSnapshotToCMS({ updateLiveMenu: false }).then(function(resp) {
          if (resp && resp.version_id) editorSnapshotVersionId = resp.version_id;
          saveOptionsModalSyncDiscardState();
          setEditStatus('Snapshot saved (CMS only, not published to Git)');
        }).catch(function(err) {
          alert('Save failed: ' + (err.message || err));
        }).then(function() {
          if (btnSave) btnSave.disabled = false;
      });
    });
  }
    if (savePub) {
      savePub.addEventListener('click', function() {
        closeSaveOptionsModal();
        if (btnSave) btnSave.disabled = true;
        saveMenuSnapshotToCMS({ updateLiveMenu: true }).then(function() {
          return persistThemeDraftToCMS();
        }).then(function() {
          return fetchPreviewsForPublish();
        }).then(function(previews) {
          if (btnSave) btnSave.disabled = false;
          if (!previews || previews.length === 0) {
            setEditStatus('Menu snapshot saved. No content drafts to publish to Git.');
            alert('Menu snapshot saved on the CMS. There are no content drafts to publish to Git.');
            return;
          }
          openPublishSummaryModal(previews);
        }).catch(function(err) {
          alert('Save failed: ' + (err.message || err));
          if (btnSave) btnSave.disabled = false;
        });
      });
    }
    if (discard) {
      discard.addEventListener('click', function() {
        if (!editorSnapshotVersionId) return;
        if (!confirm('Permanently delete this menu snapshot from the CMS? This cannot be undone.')) return;
        var vid = editorSnapshotVersionId;
        closeSaveOptionsModal();
        if (btnSave) btnSave.disabled = true;
        deleteFromCMS('/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/menu-versions/' + encodeURIComponent(vid)).then(function() {
          if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('editMenuVersionId') === vid) {
            sessionStorage.removeItem('editMenuVersionId');
          }
          editorSnapshotVersionId = null;
          setEditStatus('Snapshot discarded');
          window.location.href = window.location.pathname + (window.location.hash || '');
        }).catch(function(err) {
          alert('Could not delete snapshot: ' + (err.message || err));
        }).then(function() {
          if (btnSave) btnSave.disabled = false;
        });
      });
    }
  })();
  function applyEditToPreview() {
    if (!selectedInfo) return;
    var doc = getEditorPreviewDocument();
    if (!doc) return;
    var card = selectedElement;
    if (card && !doc.contains(card)) card = null;
    if (!card && selectedInfo.contentPath) {
      var path = selectedInfo.contentPath.replace(/^content\//, '').replace(/\.md$/, '').replace(/\/_index$/, '');
      var urlAttr = '/' + path + '/';
      card = doc.querySelector('.menu-item-card[data-item-url="' + urlAttr + '"]') ||
             doc.querySelector('.menu-item-card[data-item-url*="' + path.split('/').pop() + '"]');
    }
    if (!card) card = selectedElement;
    if (!card) return;
    selectedElement = card;
    var contentType = selectedInfo.contentType || 'menu-item';
    try {
      if (contentType === 'home-hero') {
        var bgH = selectedElement.querySelector('#bg');
        var heroPath = inputHomeHeroImage ? inputHomeHeroImage.value.trim() : '';
        if (bgH && heroPath) bgH.setAttribute('src', heroPath.indexOf('/') === 0 ? heroPath : heroPath);
        return;
      }
      if (contentType === 'location') {
        var locLink = selectedElement.querySelector('a.locbtn');
        var address = inputLocationAddress ? inputLocationAddress.value.trim() : '';
        var lat = inputLocationLat ? inputLocationLat.value.trim() : '';
        var lng = inputLocationLng ? inputLocationLng.value.trim() : '';
        var orderingtablesStr = inputLocationOrderingtables ? inputLocationOrderingtables.value.trim() : '';
        if (locLink) {
          if (address !== undefined) locLink.textContent = address;
          if (lat && lng) {
            var mapBase = 'https://www.ttmenus.com/map/';
            var href = locLink.getAttribute('href') || '';
            var clientMatch = href.match(/[?&]client=([^&]*)/);
            var client = clientMatch ? clientMatch[1] : '';
            locLink.setAttribute('href', mapBase + '?lat=' + encodeURIComponent(lat) + '&lng=' + encodeURIComponent(lng) + '&zoom=19' + (client ? '&client=' + encodeURIComponent(client) : ''));
          }
          if (orderingtablesStr !== undefined) locLink.setAttribute('data-orderingtables', orderingtablesStr);
          if (lat !== undefined) locLink.setAttribute('data-lat', lat);
          if (lng !== undefined) locLink.setAttribute('data-lng', lng);
        }
        if (inputLocationAddress) selectedElement.setAttribute('data-address', address);
        if (inputLocationCity) selectedElement.setAttribute('data-city', (inputLocationCity.value || '').trim());
        if (inputLocationIsland) selectedElement.setAttribute('data-island', (inputLocationIsland.value || '').trim());
        if (inputLocationSubcategories) selectedElement.setAttribute('data-subcategories', (inputLocationSubcategories.value || '').trim().replace(/\s*,\s*/g, ','));
        if (inputLocationPhone) selectedElement.setAttribute('data-phone', (inputLocationPhone.value || '').trim());
        if (inputLocationWhatsapp) {
          var wa = (inputLocationWhatsapp.value || '').replace(/\D/g, '');
          selectedElement.setAttribute('data-whatsapp', wa);
          var waLink = selectedElement.querySelector('a[href*="wa.me"]');
          if (waLink && wa) waLink.setAttribute('href', 'https://wa.me/' + wa);
        }
        var telLink = selectedElement.querySelector('a[href^="tel:"]');
        if (telLink && inputLocationPhone && inputLocationPhone.value) telLink.setAttribute('href', 'tel:' + inputLocationPhone.value.trim());
        if (inputLocationOrderingtables) selectedElement.setAttribute('data-orderingtables', orderingtablesStr);
        if (inputLocationFooddrop) selectedElement.setAttribute('data-delivery-fooddrop', (inputLocationFooddrop.value || '').trim());
        var fooddropLink = selectedElement.querySelector('a[href*="fooddrop"], .delivery-options a[href]');
        if (fooddropLink && inputLocationFooddrop && inputLocationFooddrop.value.trim()) fooddropLink.setAttribute('href', inputLocationFooddrop.value.trim());
        if (inputLocationOpeningHours) {
          var oh = inputLocationOpeningHours.value.trim();
          if (oh) {
            try { JSON.parse(oh); selectedElement.setAttribute('data-opening-hours', oh); } catch (e) { /* leave unchanged if invalid */ }
          }
        }
        return;
      }
      if (contentType === 'promotion') {
        var titleVal = inputPromoTitle ? inputPromoTitle.value.trim() : '';
        var descVal = inputPromoDescription ? inputPromoDescription.value.trim() : '';
        var linkVal = inputPromoLink ? inputPromoLink.value.trim() : '';
        var imagesArr = promoImagesContainer ? gatherPromoImagePathsFromRows() : (inputPromoImages ? hoursParseStringList(inputPromoImages.value) : []);
        applyPromotionFieldsToElement(selectedElement, titleVal, descVal, linkVal, imagesArr);
        selectedElement.setAttribute('data-ad-recurring', (inputPromoRecurring && inputPromoRecurring.checked) ? 'true' : 'false');
        var daysArr = promoDaysofweekContainer ? getStringListFromUI(promoDaysofweekContainer) : [];
        selectedElement.setAttribute('data-ad-daysofweek', JSON.stringify(daysArr));
        var weightVal = inputPromoWeight ? inputPromoWeight.value.trim() : '';
        selectedElement.setAttribute('data-ad-weight', weightVal);
        var promoDoc = iframe.contentDocument;
        var catalogIdx = promotionCatalogIndex(selectedElement);
        if (promoDoc && catalogIdx != null) {
          var pairedSlide = findReelsSlideByCatalogIndex(promoDoc, catalogIdx);
          if (pairedSlide && pairedSlide !== selectedElement) {
            applyPromotionFieldsToElement(pairedSlide, titleVal, descVal, linkVal, imagesArr);
            pairedSlide.setAttribute('data-ad-recurring', selectedElement.getAttribute('data-ad-recurring') || 'false');
            pairedSlide.setAttribute('data-ad-daysofweek', selectedElement.getAttribute('data-ad-daysofweek') || '[]');
            pairedSlide.setAttribute('data-ad-weight', weightVal);
          }
          var pairedPanel = promoDoc.querySelector('#pageadscontainer li.ad-panel[data-reels-preview-index="' + catalogIdx + '"]');
          if (pairedPanel && pairedPanel !== selectedElement) {
            applyPromotionFieldsToElement(pairedPanel, titleVal, descVal, linkVal, imagesArr);
          }
        }
        return;
      }
      if (contentType === 'slideshow' && inputSlideshowImages) {
        var slides = selectedElement.querySelectorAll('.client-tour-slideshow .slide img');
        var lines = inputSlideshowImages.value.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
        slides.forEach(function(img, i) {
          if (lines[i]) {
            var u = lines[i].indexOf('draft-assets/') === 0 ? resolveMenuItemImageSrcForPreview(lines[i]) : (lines[i].indexOf('/') === 0 ? lines[i] : '/' + lines[i]);
            img.setAttribute('src', u);
          }
        });
        if (slideshowViewEl) renderSlideshowAsidePreview(slideshowViewEl, lines);
        return;
      }
      if (contentType === 'section-header' || contentType === 'menu-item') {
        var titleVal = '';
        var descVal = '';
        if (contentType === 'menu-item') {
          titleVal = inputTitle && inputTitle.value !== undefined ? inputTitle.value : '';
          descVal = inputDesc && inputDesc.value !== undefined ? inputDesc.value : '';
        } else {
          titleVal = sectionTitleForPayload(selectedElement);
          descVal = inputSectionDesc && inputSectionDesc.value !== undefined ? inputSectionDesc.value : '';
        }
        if (contentType === 'menu-item') {
          var win = iframe.contentWindow;
          var itemUrl = selectedElement.getAttribute('data-item-url') || (selectedInfo.contentPath ? '/' + selectedInfo.contentPath.replace(/^content\//, '').replace(/\.md$/, '') + '/' : '');
          var pricesArr = pricesContainer ? getPricesFromUI(pricesContainer) : [];
          var iframePayload = { itemUrl: itemUrl, title: titleVal, description: descVal };
          if (pricesArr.length) iframePayload.pricesArray = pricesArr;
          var menuItemPromosPreview = menuItemPromotionsContainer ? getMenuItemPromotionsFromUI(menuItemPromotionsContainer) : [];
          iframePayload.promotions = menuItemPromosPreview;
          iframePayload.availability = getMenuItemAvailabilityFromState();
          if (win && win.__dashboardApplyEdit && itemUrl) {
            try {
              win.__dashboardApplyEdit(JSON.stringify(iframePayload));
            } catch (e) { console.warn('Apply via iframe failed', e); }
          }
        }
        var titleEl = selectedElement.querySelector('.menu-item-title a, .menu-item-title, h1, h2');
        if (titleEl && titleVal !== '' && !(contentType === 'section-header' && isPromotionsSectionHeader(selectedElement))) {
          var innerLink = titleEl.querySelector('a');
          if (innerLink) innerLink.textContent = titleVal;
          else titleEl.textContent = titleVal;
        }
        var descEl = selectedElement.querySelector('.menu-item-description, .menu-summary');
        if (descEl) {
          var p = descEl.querySelector('p');
          if (p) p.textContent = descVal; else descEl.textContent = descVal;
          descEl.setAttribute('data-description', descVal);
        }
        var expandedDesc = selectedElement.querySelector('.expanded-item-description p');
        if (expandedDesc) expandedDesc.textContent = descVal;
        var expandedDescWrap = selectedElement.querySelector('.expanded-item-description');
        if (expandedDescWrap && !expandedDesc) {
          var newP = selectedElement.ownerDocument.createElement('p');
          newP.textContent = descVal;
          var link = expandedDescWrap.querySelector('a');
          if (link) { link.innerHTML = ''; link.appendChild(newP); } else { expandedDescWrap.appendChild(newP); }
        }
        if (contentType === 'section-header') {
          if (inputSectionWeight) selectedElement.setAttribute('data-weight', inputSectionWeight.value.trim());
          if (inputSectionIcon) selectedElement.setAttribute('data-icon', inputSectionIcon.value.trim());
          selectedElement.setAttribute('data-images-primary', (inputSectionImageBottom && inputSectionImageBottom.value) ? inputSectionImageBottom.value.trim() : '');
          selectedElement.setAttribute('data-images-secondary', (inputSectionImageTop && inputSectionImageTop.value) ? inputSectionImageTop.value.trim() : '');
          var topImg = selectedElement.querySelector('a img.food, img.food.item');
          var topSrc = inputSectionImageBottom && inputSectionImageBottom.value.trim();
          if (topSrc) {
            topSrc = topSrc.indexOf('/') === 0 ? topSrc : '/' + topSrc;
            if (topImg) topImg.setAttribute('src', topSrc);
            else {
              var wrap = selectedElement.querySelector('a[href]:not(.menu-anchor)');
              if (!wrap) {
                var sectionLink = selectedElement.querySelector('h2 a');
                var href = sectionLink ? sectionLink.getAttribute('href') : '#';
                wrap = selectedElement.ownerDocument.createElement('a');
                wrap.setAttribute('href', href);
                var anchor = selectedElement.querySelector('.menu-anchor');
                selectedElement.insertBefore(wrap, anchor ? anchor.nextSibling : selectedElement.firstChild);
              }
              var img = selectedElement.ownerDocument.createElement('img');
              img.className = 'food item aos-init aos-animate';
              img.setAttribute('data-aos', 'zoom-out');
              img.src = topSrc;
              img.alt = sectionTitleForPayload(selectedElement) || (inputSectionTitle ? inputSectionTitle.value : '');
              img.loading = 'lazy';
              wrap.appendChild(img);
            }
          } else if (topImg) topImg.remove();
          var bottomImg = selectedElement.querySelector('.slideinimg');
          var bottomSrc = inputSectionImageTop && inputSectionImageTop.value.trim();
          if (bottomSrc) {
            bottomSrc = bottomSrc.indexOf('/') === 0 ? bottomSrc : '/' + bottomSrc;
            var h2 = selectedElement.querySelector('h2');
            if (bottomImg) bottomImg.setAttribute('src', bottomSrc);
            else if (h2) {
              var slideImg = selectedElement.ownerDocument.createElement('img');
              slideImg.className = 'slideinimg aos-init aos-animate';
              slideImg.setAttribute('data-aos', 'zoom-out-right');
              slideImg.src = bottomSrc;
              slideImg.alt = (sectionTitleForPayload(selectedElement) || (inputSectionTitle ? inputSectionTitle.value : '')) + ' decoration';
              slideImg.loading = 'lazy';
              h2.appendChild(slideImg);
            }
          } else if (bottomImg) bottomImg.remove();
        }
        if (contentType === 'menu-item') {
          var pricesArr = getPricesFromUI(pricesContainer);
          var imagesArr = hoursParseStringList(inputMenuItemImages ? inputMenuItemImages.value : '');
          var sideCats = getSideCategoriesFromUI(sideCategoriesContainer);
          var modsArr = getPairsFromUI(modificationsContainer);
          var addsArr = getPairsFromUI(additionsContainer);
          var tagsArr = getStringListFromUI(tagsContainer);
          var ingArr = getStringListFromUI(ingredientsContainer);
          var cookArr = getStringListFromUI(cookingmethodsContainer);
          var typesArr = getStringListFromUI(typesContainer);
          var eventsArr = getStringListFromUI(eventsContainer);

          selectedElement.setAttribute('data-prices-array', JSON.stringify(pricesArr));
          selectedElement.setAttribute('data-images-array', JSON.stringify(imagesArr));
          selectedElement.setAttribute('data-regular-images-array', JSON.stringify(imagesArr));
          selectedElement.setAttribute('data-side-categories', JSON.stringify(sideCats));
          selectedElement.setAttribute('data-modifications', JSON.stringify(modsArr));
          selectedElement.setAttribute('data-additions', JSON.stringify(addsArr));
          selectedElement.setAttribute('data-tags', JSON.stringify(tagsArr));
          selectedElement.setAttribute('data-ingredients', JSON.stringify(ingArr));
          selectedElement.setAttribute('data-cookingmethods', JSON.stringify(cookArr));
          selectedElement.setAttribute('data-types', JSON.stringify(typesArr));
          selectedElement.setAttribute('data-events', JSON.stringify(eventsArr));
          var menuItemPromosAttr = menuItemPromotionsContainer ? getMenuItemPromotionsFromUI(menuItemPromotionsContainer) : [];
          selectedElement.setAttribute('data-promotions', JSON.stringify(menuItemPromosAttr));

          var availAttr = getMenuItemAvailabilityFromState();
          if (availAttr) selectedElement.setAttribute('data-availability', JSON.stringify(availAttr));
          else selectedElement.removeAttribute('data-availability');

          renderMenuItemImagesUI(imagesArr, true);
          var imgEl = selectedElement.querySelector('img.menu-item-img');
          if (imgEl && imagesArr.length) {
            var previewFirst = imagesArr[0];
            imgEl.setAttribute('data-src-path', previewFirst);
            if (previewFirst.indexOf('draft-assets/') === 0) {
              imgEl.removeAttribute('src');
              imgEl.setAttribute('data-draft-pending', '1');
              delete imgEl.dataset.draftAssetHydrated;
              delete imgEl.dataset.fellback;
            } else {
              imgEl.removeAttribute('data-draft-pending');
              imgEl.setAttribute('src', resolveMenuItemImageSrcForPreview(previewFirst));
            }
            var previewWin = iframe && iframe.contentWindow;
            if (previewWin && typeof previewWin.hydrateAuthenticatedDraftAssetImg === 'function') {
              previewWin.hydrateAuthenticatedDraftAssetImg(imgEl);
            }
          }

          var priceEl = selectedElement.querySelector('.menu-item-price');
          if (priceEl) {
            var nums = [];
            for (var i = 2; i < pricesArr.length; i += 3) {
              var n = parseFloat(pricesArr[i]);
              if (!isNaN(n)) nums.push(n);
            }
            nums.sort(function(a, b) { return a - b; });
            if (nums.length) {
              var fmt = function(v) { var s = v.toFixed(2); return s.replace(/\.00$/, ''); };
              if (nums[0] === nums[nums.length - 1]) priceEl.textContent = '$' + fmt(nums[0]);
              else priceEl.textContent = '$' + fmt(nums[0]) + ' | $' + fmt(nums[nums.length - 1]);
            }
          }

          if (pricesArr.length >= 3) {
            selectedElement.setAttribute('data-selected-variable1', String(pricesArr[0] || '-'));
            selectedElement.setAttribute('data-selected-variable2', String(pricesArr[1] || '-'));
          }

          var optsWrap = selectedElement.querySelector('.menu-item-options');
          if (optsWrap && pricesArr.length >= 3) {
            var v1seen = {};
            var v2seen = {};
            for (var pi = 0; pi + 2 < pricesArr.length; pi += 3) {
              var pv1 = String(pricesArr[pi] != null ? pricesArr[pi] : '').trim();
              var pv2 = String(pricesArr[pi + 1] != null ? pricesArr[pi + 1] : '').trim();
              if (pv1 && pv1 !== '-') v1seen[pv1] = true;
              if (pv2 && pv2 !== '-') v2seen[pv2] = true;
            }
            var sizesUl = optsWrap.querySelector('ul.sizes');
            var flavUl = optsWrap.querySelector('ul.flavours');
            if (sizesUl && Object.keys(v1seen).length) {
              sizesUl.innerHTML = Object.keys(v1seen).map(function(v) { return '<li>' + v + '</li>'; }).join('');
            }
            if (flavUl && Object.keys(v2seen).length) {
              flavUl.innerHTML = Object.keys(v2seen).map(function(v) { return '<li>' + v + '</li>'; }).join('');
            }
          }

          var itemUrlRefresh = selectedElement.getAttribute('data-item-url') || '';
          if (selectedElement.getAttribute('data-item-expanded') === 'true' && itemUrlRefresh) {
            var winRefresh = iframe.contentWindow;
            if (winRefresh && typeof winRefresh.expandMenuItemCard === 'function') {
              try {
                winRefresh.expandMenuItemCard(selectedElement, itemUrlRefresh);
              } catch (e2) {
                console.warn('expandMenuItemCard:', e2);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('Apply edit:', e);
    }
  }

  function persistCurrentDraftToCMS() {
    if (!editFormDirty || !selectedInfo || !selectedElement) {
      return Promise.resolve(true);
    }
    applyEditToPreview();
    var draftPayload = buildContentEditPayload();
    if (!draftPayload) {
      cmsLogJson('save draft skipped', 'persistCurrentDraftToCMS', { reason: 'buildContentEditPayload returned null (e.g. slideshow/location or unsupported type)' });
      return Promise.resolve(false);
    }
    var previewPath = '/api/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/previews';
    return postToCMS(previewPath, { payload: draftPayload }).then(function(resp) {
      var pid = resp && (resp.previewId !== undefined && resp.previewId !== null && resp.previewId !== ''
        ? resp.previewId : resp.preview_id);
      if (pid) {
        savedDraftPreviewId = pid;
        if (draftPayload.contentPath) {
          draftContentPaths.add(draftPayload.contentPath);
          applyEditHighlights();
        }
        editFormDirty = false;
        setEditStatus('Draft saved (not yet published)');
        return true;
      }
      console.warn('Save draft: missing previewId in response', resp);
      return false;
    }).catch(function(err) {
      var msg = err && err.message ? String(err.message) : 'Save failed';
      if (/maximum call stack|stack overflow/i.test(msg)) {
        msg = 'Item data is too complex to save. Try simplifying descriptions, prices, or side options.';
      } else if (/413|payload too large|too large|entity too large/i.test(msg)) {
        msg = 'Item content is too large to save. Try shortening descriptions or removing unused fields.';
      } else if (/Failed to save preview/i.test(msg)) {
        msg = 'Could not save draft to the server. Try again or contact support.';
      } else {
        msg = msg.replace(/^CMS error \d+:\s*/i, '');
      }
      setEditStatus('Save failed: ' + msg);
      throw err;
    });
  }

  var leaveModal = document.getElementById('dashboardLeaveModal');
  var leaveBackdrop = document.getElementById('dashboardLeaveModalBackdrop');
  var leaveSave = document.getElementById('dashboardLeaveSave');
  var leaveDiscard = document.getElementById('dashboardLeaveDiscard');
  var leaveCancel = document.getElementById('dashboardLeaveCancel');
  var leaveSnapshotNote = document.getElementById('dashboardLeaveSnapshotNote');

  function goDashboard() {
    if (embedPanelMode) {
      closeEmbedPanelEditor();
      return;
    }
    window.location.href = '/dashboard/';
  }
  function showLeaveModal() {
    if (!leaveModal) return;
    leaveModal.classList.remove('hidden');
    leaveModal.setAttribute('aria-hidden', 'false');
  }
  function hideLeaveModal() {
    if (!leaveModal) return;
    leaveModal.classList.add('hidden');
    leaveModal.setAttribute('aria-hidden', 'true');
    if (leaveSnapshotNote) leaveSnapshotNote.classList.add('hidden');
  }

  var btnDashboardBack = document.getElementById('btnDashboardBack');
  if (btnDashboardBack) {
    btnDashboardBack.addEventListener('click', function(ev) {
      ev.preventDefault();
      if (embedPanelMode) {
        if (!editFormDirty) {
          closeEmbedPanelEditor();
          return;
        }
        persistCurrentDraftToCMS().then(function(ok) {
          if (ok === false) {
            closeEmbedPanelEditor();
            return;
          }
          try {
            if (parentMenuWindow) {
              parentMenuWindow.postMessage({ type: 'ttms:close-menu-item-edit-modal', reload: false }, window.location.origin);
            }
          } catch (msgErr) { /* ignore */ }
          closeEmbedPanelEditor();
        }).catch(function() {
          closeEmbedPanelEditor();
        });
        return;
      }
      if (rearrangeOnlyMode) {
        if (!hasPendingMenuChanges() && !editFormDirty) {
          goDashboard();
          return;
        }
        btnDashboardBack.classList.add('dashboard-edit-header-back--saving');
        btnDashboardBack.setAttribute('aria-busy', 'true');
        saveMenuSnapshotOnLeave().then(function () {
          goDashboard();
        }).catch(function () {
          goDashboard();
        });
        return;
      }
      if (themeOnlyMode) {
        if (!hasThemeColorChanges()) {
          goDashboard();
          return;
        }
        btnDashboardBack.classList.add('dashboard-edit-header-back--saving');
        btnDashboardBack.setAttribute('aria-busy', 'true');
        saveThemeChangesBeforeLeave().then(function() {
          goDashboard();
        }).catch(function() {
          goDashboard();
        });
        return;
      }
      setEditStatus('Saving menu snapshot…');
      saveMenuSnapshotOnLeave().then(function(snapshotOk) {
        if (snapshotOk) {
          setEditStatus('Menu snapshot saved. You can open it when returning to the editor with saved drafts.');
        } else {
          setEditStatus('Could not save a menu snapshot (check connection). You can still continue to the dashboard.');
        }
        if (!editFormDirty) {
          if (leaveSnapshotNote) leaveSnapshotNote.classList.add('hidden');
          window.setTimeout(function() { goDashboard(); }, snapshotOk ? 1200 : 800);
          return;
        }
        if (leaveSnapshotNote) {
          leaveSnapshotNote.textContent = snapshotOk
            ? 'A snapshot of the current menu was saved automatically before this dialog.'
            : 'Menu snapshot could not be saved. Your draft choices below are unchanged.';
          leaveSnapshotNote.classList.remove('hidden');
        }
        showLeaveModal();
      });
    });
  }
  if (leaveSave) {
    leaveSave.addEventListener('click', function() {
      persistCurrentDraftToCMS().then(function(ok) {
        if (ok === false) {
          alert('This selection cannot be saved as a draft from the editor. Use Discard to leave without saving, or Cancel to keep editing.');
          return;
        }
        hideLeaveModal();
        goDashboard();
      }).catch(function(err) {
        alert('Could not save draft: ' + (err && err.message ? err.message : String(err)));
      });
    });
  }
  if (leaveDiscard) {
    leaveDiscard.addEventListener('click', function() {
      hideLeaveModal();
      goDashboard();
    });
  }
  if (leaveCancel) {
    leaveCancel.addEventListener('click', function() {
      hideLeaveModal();
    });
  }
  if (leaveBackdrop) {
    leaveBackdrop.addEventListener('click', function() {
      hideLeaveModal();
    });
  }

  if (embedPanelMode) {
    window.addEventListener('message', function (event) {
      if (!event || event.data == null || event.origin !== window.location.origin) return;
      var data = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          return;
        }
      }
      if (!data || !data.type) return;

      if (data.type === 'ttms:embed-panel-load-cms-draft') {
        var draftPath = data.contentPath;
        if (!draftPath || draftPath.indexOf('...') !== -1) return;
        if (!selectedInfo || selectedInfo.contentPath !== draftPath) return;
        setEditFormLoading(true, 'Loading CMS draft…');
        hydrateEditFormFromCmsPreview(draftPath, { force: true }).finally(function () {
          scheduleEndEditFormLoad();
        });
        return;
      }

      if (data.type !== 'ttms:embed-panel-close-request') return;

      function notifyParent(reload) {
        try {
          window.parent.postMessage(
            { type: 'ttms:embed-panel-close-complete', reload: !!reload },
            window.location.origin
          );
        } catch (err) { /* ignore */ }
      }

      if (!editFormDirty) {
        notifyParent(false);
        return;
      }
      persistCurrentDraftToCMS()
        .then(function () {
          notifyParent(false);
        })
        .catch(function () {
          notifyParent(false);
        });
    });

    setTimeout(function() {
      prefetchEmbedDraftPaths();
      focusEditTargetInParentMenu();
    }, 120);
  } else {
    iframe.addEventListener('load', function() {
      if (iframe.getAttribute('src') === 'about:blank') return;
      if (editMode) setupIframeEditMode(true);
      if (loadDraftsOnLoad) {
        setTimeout(function() {
          hydrateDashboardNewItemsFromMenuSnapshot();
          var win = iframe.contentWindow;
          if (win && win._dashboardInjectEditButtons) win._dashboardInjectEditButtons();
          setTimeout(function() {
            var w = iframe.contentWindow;
            if (w && w.__dashboardApplyEdit) loadAndApplyDrafts();
            else if (iframe.contentWindow && iframe.contentWindow.__dashboardApplyEdit) loadAndApplyDrafts();
          }, 50);
        }, 150);
      }
      setTimeout(focusEditTargetFromSessionStorage, 450);
      setTimeout(applyPendingAddFromSessionStorage, 520);
    });
  }

  if (asideEl && btnTogglePanel) {
    btnTogglePanel.addEventListener('click', function() {
      var currentlyCollapsed = asideEl.classList.contains('dashboard-edit-options-collapsed');
      if (!currentlyCollapsed) {
        persistCurrentDraftToCMS().catch(function(err) { console.warn('Auto-save draft failed:', err); });
      }
      var isCollapsed = asideEl.classList.toggle('dashboard-edit-options-collapsed');
      btnTogglePanel.setAttribute('aria-expanded', !isCollapsed);
      btnTogglePanel.setAttribute('aria-label', isCollapsed ? 'Expand edit panel' : 'Collapse edit panel');
      var icon = btnTogglePanel.querySelector('.dashboard-edit-options-toggle-icon');
      if (icon) icon.textContent = isCollapsed ? '▶' : '◀';
    });
  }
  if (colorAsideEl && btnToggleColorPanel) {
    btnToggleColorPanel.addEventListener('click', function() {
      var isCollapsed = colorAsideEl.classList.toggle('dashboard-edit-color-aside-collapsed');
      if (isCollapsed) {
        exitColorSectionEdit();
      }
      btnToggleColorPanel.setAttribute('aria-expanded', !isCollapsed);
      btnToggleColorPanel.setAttribute('aria-label', isCollapsed ? 'Expand color panel' : 'Collapse color panel');
      setColorAsideToggleIcon(!isCollapsed);
      var text = btnToggleColorPanel.querySelector('.dashboard-edit-color-aside-toggle-text');
      if (text) text.textContent = isCollapsed ? 'Expand' : 'Collapse';
    });
  }
});
