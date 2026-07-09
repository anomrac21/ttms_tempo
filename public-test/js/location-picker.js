/**
 * Reels contact slide — infinite horizontal location carousel (Barba-safe).
 */
(function () {
  'use strict';

  var INDEX_KEY = 'ttmenus_location_picker_index';
  var ADDRESS_KEY = 'ttmenus_location_picker_address';
  var carouselState = null;
  var pickerAbort = null;
  var initScheduled = null;

  function parseOrderingTables(raw) {
    if (!raw) return [];
    return String(raw)
      .split(',')
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function locationDataFromCard(card) {
    var locBtn = card.querySelector('.locbtn[data-lat]');
    return {
      index: parseInt(card.getAttribute('data-location-index'), 10) || 0,
      address: card.getAttribute('data-address') || '',
      city: card.getAttribute('data-city') || '',
      island: card.getAttribute('data-island') || '',
      whatsapp: card.getAttribute('data-whatsapp') || '',
      phone: card.getAttribute('data-phone') || '',
      lat: card.getAttribute('data-lat') || (locBtn ? locBtn.getAttribute('data-lat') || '' : ''),
      lng: card.getAttribute('data-lng') || (locBtn ? locBtn.getAttribute('data-lng') || '' : ''),
      orderingtables: parseOrderingTables(card.getAttribute('data-orderingtables')),
      deliveryFooddrop: card.getAttribute('data-delivery-fooddrop') || '',
    };
  }

  function getPicker() {
    return document.querySelector('.location-picker');
  }

  function getTrack(picker) {
    if (!picker) picker = getPicker();
    if (!picker) return null;
    return picker.querySelector('.location-picker__list') || picker.querySelector('.locations');
  }

  function getCards(picker) {
    if (!picker) picker = getPicker();
    if (!picker) return [];
    return Array.prototype.slice.call(
      picker.querySelectorAll('.location-picker-card:not([data-picker-clone])')
    );
  }

  function getTrackCards(track) {
    if (!track) return [];
    return Array.prototype.slice.call(track.querySelectorAll('.location-picker-card'));
  }

  function resolveRealCard(card, picker) {
    if (!card) return null;
    var cloneType = card.getAttribute('data-picker-clone');
    var cards = getCards(picker);
    if (!cloneType) return card;
    if (cloneType === 'start') return cards[cards.length - 1] || card;
    if (cloneType === 'end') return cards[0] || card;
    return card;
  }

  function removeInfiniteClones(track) {
    if (!track) return;
    track.querySelectorAll('[data-picker-clone]').forEach(function (el) {
      el.remove();
    });
  }

  function setupInfiniteTrack(picker, track) {
    removeInfiniteClones(track);

    var cards = getCards(picker);
    if (cards.length < 2) return;

    var first = cards[0];
    var last = cards[cards.length - 1];

    var startClone = last.cloneNode(true);
    startClone.setAttribute('data-picker-clone', 'start');
    startClone.setAttribute('aria-hidden', 'true');
    startClone.setAttribute('tabindex', '-1');
    startClone.classList.remove('active-location', 'location-picker-card--selected');
    startClone.setAttribute('aria-selected', 'false');

    var endClone = first.cloneNode(true);
    endClone.setAttribute('data-picker-clone', 'end');
    endClone.setAttribute('aria-hidden', 'true');
    endClone.setAttribute('tabindex', '-1');
    endClone.classList.remove('active-location', 'location-picker-card--selected');
    endClone.setAttribute('aria-selected', 'false');

    track.insertBefore(startClone, first);
    track.appendChild(endClone);
  }

  function findCardByAddress(cards, address) {
    if (!address) return null;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute('data-address') === address) return cards[i];
    }
    return null;
  }

  function findCardByLocationIndex(cards, index) {
    if (isNaN(index)) return null;
    for (var i = 0; i < cards.length; i++) {
      if (parseInt(cards[i].getAttribute('data-location-index'), 10) === index) {
        return cards[i];
      }
    }
    return null;
  }

  function persistLocationChoice(data) {
    try {
      localStorage.setItem(INDEX_KEY, String(data.index));
      if (data.address) localStorage.setItem(ADDRESS_KEY, data.address);
    } catch (e) { /* ignore */ }
  }

  function getSavedLocationCard(cards) {
    if (!cards.length) return null;

    try {
      var savedAddress = localStorage.getItem(ADDRESS_KEY);
      var byAddress = findCardByAddress(cards, savedAddress);
      if (byAddress) return byAddress;
    } catch (e) { /* ignore */ }

    try {
      var savedIndex = localStorage.getItem(INDEX_KEY);
      if (savedIndex != null) {
        var byIndex = findCardByLocationIndex(cards, parseInt(savedIndex, 10));
        if (byIndex) return byIndex;
      }
    } catch (e) { /* ignore */ }

    return cards[0];
  }

  function syncCartDropdown(data) {
    var sel = document.getElementById('locationSelect');
    if (!sel || !data.address) return;

    for (var i = 0; i < sel.options.length; i++) {
      var opt = sel.options[i];
      var optAddr = opt.getAttribute('data-address') || '';
      if (optAddr === data.address) {
        sel.selectedIndex = i;
        if (typeof window.number !== 'undefined' && data.whatsapp) {
          window.number = data.whatsapp;
        }
        if (typeof window.updateCartLocationDisplay === 'function') {
          window.updateCartLocationDisplay();
        }
        if (typeof window.saveSelectedLocation === 'function' && data.whatsapp) {
          window.saveSelectedLocation(data.whatsapp, data.address);
        }
        return;
      }
    }
  }

  function updatePickerChrome(data) {
    var selectedWrap = document.getElementById('locationPickerSelected');
    var selectedName = document.getElementById('locationPickerSelectedName');
    if (selectedName) selectedName.textContent = data.address;
    if (selectedWrap) selectedWrap.hidden = !data.address;
  }

  function updateNavButtons(picker) {
    var leftBtn = document.getElementById('locationNavLeft');
    var rightBtn = document.getElementById('locationNavRight');
    if (!leftBtn || !rightBtn) return;

    var cards = getCards(picker);
    var enabled = cards.length >= 2;

    leftBtn.classList.toggle('is-disabled', !enabled);
    rightBtn.classList.toggle('is-disabled', !enabled);
    leftBtn.disabled = !enabled;
    rightBtn.disabled = !enabled;
    leftBtn.style.opacity = enabled ? '1' : '0.3';
    leftBtn.style.pointerEvents = enabled ? 'auto' : 'none';
    rightBtn.style.opacity = enabled ? '1' : '0.3';
    rightBtn.style.pointerEvents = enabled ? 'auto' : 'none';
  }

  function getCardScrollTarget(track, card) {
    if (!track || !card) return 0;
    var maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    if (maxScroll <= 0) return 0;

    var trackRect = track.getBoundingClientRect();
    var cardRect = card.getBoundingClientRect();
    var cardLeft = cardRect.left - trackRect.left + track.scrollLeft;
    var target = cardLeft - (track.clientWidth - cardRect.width) / 2;
    return Math.max(0, Math.min(Math.round(target), maxScroll));
  }

  function scrollCardToCenter(track, card, behavior) {
    if (!track || !card) return;

    setProgrammaticScroll(true);
    var attempt = 0;
    var maxAttempts = behavior === 'smooth' ? 1 : 5;

    function applyScroll() {
      var target = getCardScrollTarget(track, card);
      if (behavior === 'smooth' && typeof track.scrollTo === 'function') {
        track.scrollTo({ left: target, behavior: 'smooth' });
      } else {
        track.scrollLeft = target;
      }
    }

    function verifyAndFinish() {
      requestAnimationFrame(function () {
        if (!isCardCentered(track, card) && attempt < maxAttempts) {
          attempt++;
          applyScroll();
          verifyAndFinish();
          return;
        }
        setProgrammaticScroll(false);
      });
    }

    applyScroll();
    if (behavior === 'smooth') {
      setTimeout(function () {
        setProgrammaticScroll(false);
      }, 450);
    } else {
      verifyAndFinish();
    }
  }

  function setProgrammaticScroll(active) {
    if (carouselState) carouselState.programmaticScroll = active;
  }

  function isScrollSelectionLocked() {
    return (
      carouselState &&
      (carouselState.initializing ||
        carouselState.suppressScrollSelect ||
        carouselState.programmaticScroll)
    );
  }

  function setAligningMode(picker, track, active) {
    if (picker) picker.classList.toggle('location-picker--aligning', active);
    if (!track) return;
    if (active) {
      track.dataset.pickerSnap = track.style.scrollSnapType || '';
      track.dataset.pickerScrollBehavior = track.style.scrollBehavior || '';
      track.style.scrollSnapType = 'none';
      track.style.scrollBehavior = 'auto';
      return;
    }
    track.style.scrollBehavior = track.dataset.pickerScrollBehavior || '';
    track.style.scrollSnapType = track.dataset.pickerSnap || '';
    delete track.dataset.pickerSnap;
    delete track.dataset.pickerScrollBehavior;
  }

  function whenCarouselReady(track, callback, attempt) {
    attempt = attempt || 0;
    if (!track || !track.isConnected) return;
    var hasWidth = track.clientWidth > 0;
    var canScroll = track.scrollWidth > track.clientWidth + 1;
    if (hasWidth && (canScroll || attempt >= 24)) {
      callback();
      return;
    }
    if (attempt >= 72) {
      callback();
      return;
    }
    requestAnimationFrame(function () {
      whenCarouselReady(track, callback, attempt + 1);
    });
  }

  function getSelectedRealCard(picker) {
    return document.querySelector(
      '.location-picker-card.location-picker-card--selected:not([data-picker-clone])'
    );
  }

  function isCardCentered(track, card) {
    if (!track || !card) return false;
    var trackRect = track.getBoundingClientRect();
    var cardRect = card.getBoundingClientRect();
    var trackCenter = trackRect.left + trackRect.width / 2;
    var cardCenter = cardRect.left + cardRect.width / 2;
    return Math.abs(cardCenter - trackCenter) < 12;
  }

  function alignToSelectedCard(picker, track) {
    if (!track) return;
    var selected = getSelectedRealCard(picker);
    if (!selected) {
      restoreSelection(picker, track, { align: true });
      return;
    }
    scrollCardToCenter(track, selected, 'auto');
  }

  function scrollCardIntoView(card, behavior) {
    if (!card) return;
    var track = card.parentElement;
    while (
      track &&
      !track.classList.contains('location-picker__list') &&
      !track.classList.contains('locations')
    ) {
      track = track.parentElement;
    }
    if (track) {
      scrollCardToCenter(track, card, behavior);
      return;
    }
    card.scrollIntoView({
      behavior: behavior || 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }

  function getCenteredCard(track) {
    var cards = getTrackCards(track);
    if (!track || !cards.length) return null;

    var trackRect = track.getBoundingClientRect();
    var centerX = trackRect.left + trackRect.width / 2;
    var best = null;
    var bestDist = Infinity;

    cards.forEach(function (card) {
      var rect = card.getBoundingClientRect();
      var cardCenter = rect.left + rect.width / 2;
      var dist = Math.abs(cardCenter - centerX);
      if (dist < bestDist) {
        bestDist = dist;
        best = card;
      }
    });

    return best;
  }

  function setScrollSelectSuppressed(suppressed) {
    if (carouselState) carouselState.suppressScrollSelect = suppressed;
  }

  function jumpFromClone(track, centered, picker) {
    var cloneType = centered.getAttribute('data-picker-clone');
    if (!cloneType) return false;

    var realCard = resolveRealCard(centered, picker);
    if (!realCard) return false;

    setScrollSelectSuppressed(true);
    setProgrammaticScroll(true);
    scrollCardToCenter(track, realCard, 'auto');
    selectLocationCard(realCard, { scroll: false });

    setTimeout(function () {
      setProgrammaticScroll(false);
      setScrollSelectSuppressed(false);
    }, 320);

    return true;
  }

  function selectLocationCard(card, options) {
    if (!card) return;
    options = options || {};

    var picker = getPicker();
    card = resolveRealCard(card, picker);
    if (!card || card.getAttribute('data-picker-clone')) return;

    var data = locationDataFromCard(card);
    var current = window.currentOrderLocation;
    var isSameSelection =
      card.classList.contains('location-picker-card--selected') &&
      current &&
      current.index === data.index &&
      current.address === data.address;

    if (!isSameSelection) {
      document.querySelectorAll('.location-picker-card:not([data-picker-clone])').forEach(function (el) {
        if (el === card) return;
        el.classList.remove('active-location', 'location-picker-card--selected');
        el.setAttribute('aria-selected', 'false');
      });

      card.classList.add('active-location', 'location-picker-card--selected');
      card.setAttribute('aria-selected', 'true');
      window.currentOrderLocation = data;
      persistLocationChoice(data);
      document.dispatchEvent(
        new CustomEvent('ttms:location-selected', {
          detail: {
            name: data.address || '',
            address: data.address || '',
            whatsapp: data.whatsapp || '',
            lat: data.lat,
            lng: data.lng,
            source: options.source || 'picker',
          },
        })
      );
    }

    syncCartDropdown(data);
    updatePickerChrome(data);

    if (typeof window.updateSelectedLocationDisplay === 'function') {
      window.updateSelectedLocationDisplay(data);
    }

    if (options.scroll !== false) {
      scrollCardIntoView(card, options.behavior || 'smooth');
    }
  }

  function scrollToAdjacentCard(direction) {
    var picker = getPicker();
    var track = getTrack(picker);
    var cards = getCards(picker);
    if (!track || cards.length < 2) return;

    var current =
      resolveRealCard(
        document.querySelector('.location-picker-card.location-picker-card--selected'),
        picker
      ) || resolveRealCard(getCenteredCard(track), picker);

    var index = current ? cards.indexOf(current) : 0;
    if (index < 0) index = 0;

    var nextIndex;
    var edgeClone = null;
    if (direction === 'left') {
      if (index === 0) {
        edgeClone = track.querySelector('[data-picker-clone="start"]');
        nextIndex = cards.length - 1;
      } else {
        nextIndex = index - 1;
      }
    } else if (index === cards.length - 1) {
      edgeClone = track.querySelector('[data-picker-clone="end"]');
      nextIndex = 0;
    } else {
      nextIndex = index + 1;
    }

    setScrollSelectSuppressed(true);
    var prevSnap = track.style.scrollSnapType;
    track.style.scrollSnapType = 'none';

    function finishNav() {
      track.style.scrollSnapType = prevSnap || '';
      setScrollSelectSuppressed(false);
      updateNavButtons(picker);
    }

    if (edgeClone) {
      selectLocationCard(cards[nextIndex], { scroll: false });
      scrollCardToCenter(track, edgeClone, 'smooth');
      setTimeout(function () {
        jumpFromClone(track, edgeClone, picker);
        finishNav();
      }, 340);
      return;
    }

    selectLocationCard(cards[nextIndex]);
    setTimeout(finishNav, 350);
  }

  function restoreSelection(picker, track, options) {
    options = options || {};
    var cards = getCards(picker);
    if (!cards.length) return null;

    var target = getSavedLocationCard(cards);
    if (!target) return null;

    selectLocationCard(target, { scroll: false });

    if (options.align && track) {
      scrollCardToCenter(track, target, 'auto');
    }

    updateNavButtons(picker);
    return target;
  }

  function refreshLocationStatuses() {
    if (typeof window.updateLocationStatuses === 'function') {
      window.updateLocationStatuses();
      return;
    }
    document
      .querySelectorAll(
        '.location-picker-card:not([data-picker-clone]) .location-status-badge'
      )
      .forEach(function (badge) {
        if (/^loading\.?\.?\.?$/i.test(String(badge.textContent || '').trim())) {
          badge.textContent = 'Closed';
          badge.classList.add('closed');
        }
      });
  }

  function alignSelectedCard(picker, track, behavior) {
    var selected = getSelectedRealCard(picker);
    if (!selected) {
      selected = restoreSelection(picker, track, { align: false });
    }
    if (!selected || !track) return null;
    scrollCardToCenter(track, selected, behavior || 'auto');
    return selected;
  }

  function finalizePickerAlignment(picker, track) {
    if (!picker || !track) return;

    setScrollSelectSuppressed(true);
    setProgrammaticScroll(true);

    restoreSelection(picker, track, { align: false });
    alignSelectedCard(picker, track, 'auto');

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        alignSelectedCard(picker, track, 'auto');

        picker.dataset.pickerReady = '1';
        setAligningMode(picker, track, false);

        if (carouselState) carouselState.initializing = false;

        refreshLocationStatuses();

        setTimeout(function () {
          var selected = getSelectedRealCard(picker);
          if (selected && !isCardCentered(track, selected)) {
            alignSelectedCard(picker, track, 'auto');
          }
          setProgrammaticScroll(false);
          setScrollSelectSuppressed(false);
          refreshLocationStatuses();
        }, 220);
      });
    });
  }

  function realignSelectedIfNeeded(picker) {
    var track = getTrack(picker);
    var selected = getSelectedRealCard(picker);
    if (!track || !selected || isCardCentered(track, selected)) return;

    setScrollSelectSuppressed(true);
    scrollCardToCenter(track, selected, 'auto');
    setTimeout(function () {
      setScrollSelectSuppressed(false);
    }, 250);
  }

  function observeContactSlide(picker, signal) {
    var section = document.querySelector('.menu-reels-slide--contact');
    if (!section || typeof IntersectionObserver === 'undefined') return;

    var alignTimer;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.35) return;

          clearTimeout(alignTimer);
          alignTimer = setTimeout(function () {
            realignSelectedIfNeeded(picker);
          }, 100);
        });
      },
      { threshold: [0.35, 0.5, 0.75] }
    );

    observer.observe(section);
    if (signal) {
      signal.addEventListener('abort', function () {
        clearTimeout(alignTimer);
        observer.disconnect();
      });
    }
  }

  function teardownCarousel() {
    if (carouselState && carouselState.abortController) {
      carouselState.abortController.abort();
    }
    if (carouselState && carouselState.track) {
      removeInfiniteClones(carouselState.track);
    }
    carouselState = null;
  }

  function bindCarouselHandlers(picker, track, signal) {
    var carouselAbort = new AbortController();
    var carouselSignal = carouselAbort.signal;
    if (signal) {
      signal.addEventListener('abort', function () {
        carouselAbort.abort();
      });
    }

    var scrollTimer;
    var jumping = false;

    carouselState = {
      track: track,
      abortController: carouselAbort,
      suppressScrollSelect: true,
      initializing: true,
      programmaticScroll: false,
    };

    function onScroll() {
      if (jumping) return;
      if (isScrollSelectionLocked()) return;

      updateNavButtons(picker);
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        if (isScrollSelectionLocked()) return;

        var centered = getCenteredCard(track);
        if (!centered) return;

        if (centered.getAttribute('data-picker-clone')) {
          jumping = true;
          jumpFromClone(track, centered, picker);
          jumping = false;
          return;
        }

        var selected = getSelectedRealCard(picker);
        var resolved = resolveRealCard(centered, picker);
        if (selected === centered || (resolved && selected === resolved)) return;
        if (selected && resolved) {
          var selectedAddress = selected.getAttribute('data-address');
          var resolvedAddress = resolved.getAttribute('data-address');
          if (selectedAddress && selectedAddress === resolvedAddress) return;
        }

        selectLocationCard(resolved || centered, { scroll: false });
      }, 180);
    }

    var resizeTimer;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        updateNavButtons(picker);
        if (picker.dataset.pickerReady === '1') {
          realignSelectedIfNeeded(picker);
        }
      }, 200);
    }

    track.addEventListener('scroll', onScroll, { passive: true, signal: carouselSignal });
    window.addEventListener('resize', onResize, { signal: carouselSignal });

    if (typeof ResizeObserver !== 'undefined') {
      var trackResizeObserver = new ResizeObserver(function () {
        if (picker.dataset.pickerReady !== '1' || isScrollSelectionLocked()) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          realignSelectedIfNeeded(picker);
        }, 120);
      });
      trackResizeObserver.observe(track);
      if (signal) {
        signal.addEventListener('abort', function () {
          trackResizeObserver.disconnect();
        });
      }
    }

    var leftBtn = document.getElementById('locationNavLeft');
    var rightBtn = document.getElementById('locationNavRight');

    if (leftBtn) {
      leftBtn.addEventListener(
        'click',
        function (e) {
          e.preventDefault();
          scrollToAdjacentCard('left');
        },
        { signal: carouselSignal }
      );
    }

    if (rightBtn) {
      rightBtn.addEventListener(
        'click',
        function (e) {
          e.preventDefault();
          scrollToAdjacentCard('right');
        },
        { signal: carouselSignal }
      );
    }

    updateNavButtons(picker);
  }

  function bindCarousel(picker, signal) {
    teardownCarousel();

    var track = getTrack(picker);
    if (!track) return null;

    setupInfiniteTrack(picker, track);
    return track;
  }

  function parseCoord(value) {
    var n = parseFloat(value);
    return isFinite(n) ? n : null;
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    var toRad = function (deg) {
      return deg * (Math.PI / 180);
    };
    var R = 6371;
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  function findClosestLocationCard(userLat, userLng, cards) {
    var best = null;
    var bestDist = Infinity;

    cards.forEach(function (card) {
      var lat = parseCoord(card.getAttribute('data-lat'));
      var lng = parseCoord(card.getAttribute('data-lng'));
      if (lat == null || lng == null) return;

      var dist = haversineKm(userLat, userLng, lat, lng);
      if (dist < bestDist) {
        bestDist = dist;
        best = card;
      }
    });

    return best ? { card: best, distanceKm: bestDist } : null;
  }

  function formatClosestDistance(km) {
    if (!isFinite(km) || km < 0) return '';
    if (km < 1) return Math.max(1, Math.round(km * 1000)) + ' m away';
    return km.toFixed(1) + ' km away';
  }

  function clearClosestMarkers() {
    document.querySelectorAll('.location-picker-card').forEach(function (card) {
      card.classList.remove('location-picker-card--closest');
      var tag = card.querySelector('.location-picker-card__closest-tag');
      if (tag) tag.hidden = true;
    });
  }

  function markClosestLocation(card, distanceKm) {
    clearClosestMarkers();
    if (!card) return;

    var index = card.getAttribute('data-location-index');
    if (index == null) return;

    var distLabel = formatClosestDistance(distanceKm);
    document
      .querySelectorAll('.location-picker-card[data-location-index="' + index + '"]')
      .forEach(function (el) {
        el.classList.add('location-picker-card--closest');
        var tag = el.querySelector('.location-picker-card__closest-tag');
        if (tag) {
          tag.hidden = false;
          tag.textContent = distLabel ? 'Closest · ' + distLabel : 'Closest to you';
        }
      });
  }

  function setNearbyButtonState(btn, state, message) {
    if (!btn) return;

    var defaultLabel = btn.getAttribute('data-default-label') || 'Find closest location';
    var label = btn.querySelector('.location-picker__nearby-label');
    btn.disabled = state === 'loading';
    btn.classList.toggle('is-loading', state === 'loading');
    btn.classList.toggle('is-error', state === 'error');

    if (!label) return;
    if (state === 'loading') {
      label.textContent = 'Locating…';
      return;
    }
    if (state === 'error' && message) {
      label.textContent = message;
      return;
    }
    label.textContent = defaultLabel;
  }

  function resetNearbyButtonState() {
    setNearbyButtonState(document.getElementById('locationPickerNearbyBtn'), 'idle');
  }

  function findClosestPickerLocation() {
    var picker = getPicker();
    var btn = document.getElementById('locationPickerNearbyBtn');
    if (!picker) return;

    var cards = getCards(picker);
    if (!cards.length) return;

    if (!navigator.geolocation) {
      setNearbyButtonState(btn, 'error', 'Not supported');
      setTimeout(resetNearbyButtonState, 3200);
      return;
    }

    setNearbyButtonState(btn, 'loading');
    clearClosestMarkers();
    setScrollSelectSuppressed(true);

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var result = findClosestLocationCard(
          pos.coords.latitude,
          pos.coords.longitude,
          cards
        );

        if (!result) {
          setNearbyButtonState(btn, 'error', 'No locations found');
          setScrollSelectSuppressed(false);
          setTimeout(resetNearbyButtonState, 3200);
          return;
        }

        setNearbyButtonState(btn, 'idle');
        markClosestLocation(result.card, result.distanceKm);
        selectLocationCard(result.card, { behavior: 'smooth' });
        setTimeout(function () {
          setScrollSelectSuppressed(false);
          updateNavButtons(picker);
        }, 400);
      },
      function (err) {
        var msg = 'Location denied';
        if (err && err.code === 2) msg = 'Unavailable';
        if (err && err.code === 3) msg = 'Timed out';
        setNearbyButtonState(btn, 'error', msg);
        setScrollSelectSuppressed(false);
        setTimeout(resetNearbyButtonState, 3500);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  function isInteractivePickerTarget(target) {
    return !!target.closest(
      '.location-picker-card__action, .location-status-badge, .delivery-toggle-btn, .delivery-options, .location-picker-card__select'
    );
  }

  function bindPickerEvents(picker, signal) {
    var nearbyBtn = document.getElementById('locationPickerNearbyBtn');
    if (nearbyBtn) {
      nearbyBtn.addEventListener(
        'click',
        function (e) {
          e.preventDefault();
          findClosestPickerLocation();
        },
        { signal: signal }
      );
    }

    picker.addEventListener(
      'click',
      function (e) {
        var deliveryBtn = e.target.closest('.delivery-toggle-btn');
        if (deliveryBtn && deliveryBtn.closest('.location-picker') === picker) {
          e.preventDefault();
          var panel = deliveryBtn.nextElementSibling;
          if (panel) panel.classList.toggle('hide');
          return;
        }

        var statusBtn = e.target.closest('.location-status-badge');
        if (statusBtn && statusBtn.closest('.location-picker') === picker) {
          e.preventDefault();
          if (typeof window.refreshLocationStatus === 'function') {
            window.refreshLocationStatus(statusBtn);
          }
          return;
        }

        var selectEl = e.target.closest('.location-picker-card__select');
        if (selectEl) {
          var card = selectEl.closest('.location-picker-card');
          if (!card || card.closest('.location-picker') !== picker) return;
          if (card.getAttribute('data-picker-clone')) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          selectLocationCard(card, { scroll: false });
          return;
        }

        var card = e.target.closest('.location-picker-card');
        if (!card || card.closest('.location-picker') !== picker) return;
        if (card.getAttribute('data-picker-clone')) return;
        if (isInteractivePickerTarget(e.target)) return;
        e.preventDefault();
        selectLocationCard(card, { scroll: false });
      },
      { signal: signal }
    );

    picker.addEventListener(
      'keydown',
      function (e) {
        var card = e.target.closest('.location-picker-card');
        if (!card || card.closest('.location-picker') !== picker) return;
        if (card.getAttribute('data-picker-clone')) return;

        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          scrollToAdjacentCard('left');
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          scrollToAdjacentCard('right');
          return;
        }
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (isInteractivePickerTarget(e.target)) return;
        e.preventDefault();
        selectLocationCard(card);
      },
      { signal: signal }
    );
  }

  function destroyLocationPicker() {
    if (initScheduled) {
      clearTimeout(initScheduled);
      initScheduled = null;
    }
    if (pickerAbort) {
      pickerAbort.abort();
      pickerAbort = null;
    }
    var picker = getPicker();
    if (picker) {
      delete picker.dataset.pickerReady;
      picker.classList.remove('location-picker--aligning');
    }
    teardownCarousel();

    document.querySelectorAll('.location-picker__list, .location-picker .locations').forEach(function (track) {
      removeInfiniteClones(track);
      track.scrollLeft = 0;
      track.style.scrollSnapType = '';
      track.style.scrollBehavior = '';
      delete track.dataset.pickerSnap;
      delete track.dataset.pickerScrollBehavior;
    });

    ['locationNavLeft', 'locationNavRight'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (!btn) return;
      delete btn.dataset.pickerNavBound;
      btn.style.opacity = '';
      btn.style.pointerEvents = '';
    });
    resetNearbyButtonState();
  }

  function initLocationPickerNow() {
    destroyLocationPicker();

    var picker = getPicker();
    if (!picker) return;

    delete picker.dataset.pickerBound;
    delete picker.dataset.pickerReady;

    pickerAbort = new AbortController();
    bindPickerEvents(picker, pickerAbort.signal);

    var track = bindCarousel(picker, pickerAbort.signal);
    if (!track) return;

    setAligningMode(picker, track, true);
    bindCarouselHandlers(picker, track, pickerAbort.signal);
    observeContactSlide(picker, pickerAbort.signal);

    whenCarouselReady(track, function () {
      finalizePickerAlignment(picker, track);
    });

    // Cart init may run after picker; re-sync dropdown only (no scroll)
    setTimeout(function () {
      if (!getPicker() || !window.currentOrderLocation) return;
      syncCartDropdown(window.currentOrderLocation);
    }, 650);
  }

  function schedulePickerInit(delay) {
    if (initScheduled) {
      clearTimeout(initScheduled);
    }
    initScheduled = setTimeout(function () {
      initScheduled = null;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          initLocationPickerNow();
        });
      });
    }, typeof delay === 'number' ? delay : 80);
  }

  function initLocationPicker() {
    schedulePickerInit(80);
  }

  window.selectLocationCard = selectLocationCard;
  window.initLocationPicker = initLocationPicker;
  window.destroyLocationPicker = destroyLocationPicker;
  window.scrollPickerLocations = scrollToAdjacentCard;
  window.findClosestPickerLocation = findClosestPickerLocation;
  window.getVisibleLocation = function () {
    var selected = document.querySelector(
      '.location-picker-card.location-picker-card--selected:not([data-picker-clone])'
    );
    if (!selected) return null;
    return selected.querySelector('.location-picker-card__address') || selected.querySelector('.locbtn[data-lat]');
  };

  function bootLocationPicker() {
    if (getPicker()) {
      initLocationPicker();
    }
    consumeOpenLocationPickerIntent();
  }

  function scrollToLocationPickerSlide(options) {
    options = options || {};
    var behavior = options.behavior || 'smooth';
    var slide = document.querySelector('.menu-reels-slide--contact');
    if (!slide) return false;
    slide.scrollIntoView({ block: 'start', behavior: behavior });
    return true;
  }

  function consumeOpenLocationPickerIntent() {
    var shouldOpen = false;
    try {
      shouldOpen = sessionStorage.getItem('ttmenus_open_location_picker') === '1';
      if (shouldOpen) sessionStorage.removeItem('ttmenus_open_location_picker');
    } catch (e) {
      return false;
    }
    if (!shouldOpen) return false;

    var scrolled = scrollToLocationPickerSlide({ behavior: 'smooth' });
    if (scrolled && typeof window.initLocationPicker === 'function') {
      window.initLocationPicker();
    }
    return scrolled;
  }

  window.openLocationPickerFromCart = function () {
    if (typeof window.closeCart === 'function') {
      window.closeCart();
    } else if (typeof window.toggleCart === 'function') {
      var cart = document.getElementById('cart');
      if (cart && !cart.classList.contains('cart-hidden')) {
        window.toggleCart();
      }
    }

    if (scrollToLocationPickerSlide({ behavior: 'smooth' })) {
      if (typeof window.initLocationPicker === 'function') {
        window.initLocationPicker();
      }
      return;
    }

    try {
      sessionStorage.setItem('ttmenus_open_location_picker', '1');
    } catch (e) {
      /* ignore */
    }
    window.location.href = '/';
  };

  window.scrollToLocationPickerSlide = scrollToLocationPickerSlide;
  window.consumeOpenLocationPickerIntent = consumeOpenLocationPickerIntent;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootLocationPicker);
  } else {
    bootLocationPicker();
  }
})();
