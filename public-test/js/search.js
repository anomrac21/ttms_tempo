/**
 * Menu search — toggle bar + live filter + API-backed suggestions.
 */
(function () {
    'use strict';

    var SUGGESTION_LIMIT = 8;
    var LIVE_SEARCH_DEBOUNCE_MS = 120;
    var menuSearchIndex = null;
    var menuSearchIndexPromise = null;
    var activeSuggestions = [];
    var activeSuggestionIndex = -1;
    var liveSearchTimer = null;

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeImagePath(path) {
        if (!path) return '';
        var value = String(path);
        if (typeof path === 'object' && path.image) value = path.image;
        return value.replace(/^\//, '');
    }

    function suggestionImageUrl(path) {
        var normalized = normalizeImagePath(path);
        if (!normalized) return '';
        if (window.TtmsThumbor && typeof window.TtmsThumbor.url === 'function') {
            return window.TtmsThumbor.url(normalized, { width: 56, height: 56 });
        }
        return '/' + normalized;
    }

    function buildMenuSearchIndex(data) {
        var entries = [];
        var categories = new Map();
        var tags = new Set();
        var ingredients = new Set();

        if (!data || !Array.isArray(data.menu_items)) return entries;

        data.menu_items.forEach(function (item) {
            var title = item.linkTitle || item.name || '';
            if (!title) return;

            var haystack = [
                title,
                item.category,
                item.section,
                item.summary,
                (item.tags || []).join(' '),
                (item.ingredients || []).join(' '),
                (item.types || []).join(' '),
                (item.cookingmethods || []).join(' '),
            ].join(' ').toLowerCase();

            entries.push({
                type: 'item',
                label: title,
                sublabel: item.category || item.section || '',
                url: item.url || '',
                image: item.images && item.images.length ? item.images[0] : '',
                query: title,
                haystack: haystack,
                sectionSlug: (function (itemUrl) {
                    var match = String(itemUrl || '').match(/^\/([^/]+)\//);
                    return match ? match[1] : '';
                })(item.url),
            });

            if (item.categoryUrl && item.category) {
                categories.set(item.categoryUrl, item.category);
            }

            (item.tags || []).forEach(function (tag) {
                if (tag) tags.add(String(tag));
            });
            (item.ingredients || []).forEach(function (ingredient) {
                if (ingredient) ingredients.add(String(ingredient));
            });
        });

        categories.forEach(function (label, url) {
            entries.push({
                type: 'category',
                label: label,
                sublabel: 'Category',
                url: url,
                query: label,
                haystack: String(label).toLowerCase(),
            });
        });

        tags.forEach(function (label) {
            entries.push({
                type: 'tag',
                label: label,
                sublabel: 'Tag',
                url: '',
                query: label,
                haystack: String(label).toLowerCase(),
            });
        });

        ingredients.forEach(function (label) {
            entries.push({
                type: 'ingredient',
                label: label,
                sublabel: 'Ingredient',
                url: '',
                query: label,
                haystack: String(label).toLowerCase(),
            });
        });

        return entries;
    }

    function ensureMenuSearchIndex() {
        if (menuSearchIndex) return Promise.resolve(menuSearchIndex);
        if (menuSearchIndexPromise) return menuSearchIndexPromise;

        menuSearchIndexPromise = fetch('/api/menu-items.json')
            .then(function (response) {
                return response.ok ? response.json() : null;
            })
            .catch(function () {
                return null;
            })
            .then(function (data) {
                menuSearchIndex = buildMenuSearchIndex(data);
                return menuSearchIndex;
            });

        return menuSearchIndexPromise;
    }

    function suggestionTypeRank(type) {
        if (type === 'item') return 0;
        if (type === 'category') return 1;
        if (type === 'ingredient') return 2;
        return 3;
    }

    function scoreSuggestionEntry(entry, query) {
        var label = String(entry.label || '').toLowerCase();
        var haystack = String(entry.haystack || label).toLowerCase();

        if (label.indexOf(query) === 0) return 100;
        if (label.indexOf(query) !== -1) return 88;
        if (entry.type === 'item' && haystack.indexOf(query) !== -1) return 72;
        if (entry.type === 'category' && label.indexOf(query) !== -1) return 66;
        if ((entry.type === 'tag' || entry.type === 'ingredient') && label.indexOf(query) !== -1) return 54;
        if (haystack.indexOf(query) !== -1) return 42;
        return 0;
    }

    function getSearchSuggestions(query, limit) {
        if (!query || !menuSearchIndex) return [];

        var seen = new Set();
        var matches = [];

        menuSearchIndex.forEach(function (entry) {
            var score = scoreSuggestionEntry(entry, query);
            if (score <= 0) return;

            var key = entry.type + '|' + (entry.url || entry.label);
            if (seen.has(key)) return;
            seen.add(key);

            matches.push({
                type: entry.type,
                label: entry.label,
                sublabel: entry.sublabel,
                url: entry.url,
                image: entry.image,
                query: entry.query || entry.label,
                sectionSlug: entry.sectionSlug || '',
                score: score,
            });
        });

        matches.sort(function (a, b) {
            if (b.score !== a.score) return b.score - a.score;
            var typeDiff = suggestionTypeRank(a.type) - suggestionTypeRank(b.type);
            if (typeDiff !== 0) return typeDiff;
            return String(a.label).localeCompare(String(b.label));
        });

        return matches.slice(0, limit || SUGGESTION_LIMIT);
    }

    function highlightMatch(text, query) {
        var value = String(text || '');
        if (!query) return escapeHtml(value);

        var lowerValue = value.toLowerCase();
        var lowerQuery = query.toLowerCase();
        var index = lowerValue.indexOf(lowerQuery);
        if (index === -1) return escapeHtml(value);

        return (
            escapeHtml(value.slice(0, index)) +
            '<mark class="menu-search-suggestions__mark">' +
            escapeHtml(value.slice(index, index + query.length)) +
            '</mark>' +
            escapeHtml(value.slice(index + query.length))
        );
    }

    function suggestionThumbMarkup(entry) {
        var imageUrl = entry.type === 'item' ? suggestionImageUrl(entry.image) : '';
        if (imageUrl) {
            return (
                '<img src="' +
                escapeHtml(imageUrl) +
                '" alt="" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false;">' +
                '<svg hidden viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
                '<path fill="currentColor" d="M11 9H9V7h2v2zm4 0h-2V7h2v2zm-7 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm2-7h-1V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v3H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1zm-1 12H4V8h16v10z"/>' +
                '</svg>'
            );
        }

        if (entry.type === 'category') {
            return (
                '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
                '<path fill="currentColor" d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/>' +
                '</svg>'
            );
        }

        if (entry.type === 'ingredient') {
            return (
                '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
                '<path fill="currentColor" d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1.04-2.44C8.14 19.83 10 21 12 21c4.97 0 9-4.03 9-9 0-2.19-.78-4.19-2.07-5.73L17 8zm-1.09 1.91L16 9.5c1.84 1.84 1.84 4.82 0 6.66-.84.84-1.95 1.31-3.13 1.31-1.18 0-2.29-.47-3.13-1.31-1.84-1.84-1.84-4.82 0-6.66l.09-.09C11.29 8.47 12.62 8 14 8c.47 0 .93.07 1.36.2l.55 1.71z"/>' +
                '</svg>'
            );
        }

        return (
            '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path fill="currentColor" d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4a2 2 0 0 0-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7A1.5 1.5 0 1 1 7 5.5 1.5 1.5 0 0 1 5.5 7z"/>' +
            '</svg>'
        );
    }

    function getSearchSuggestionsRoot() {
        return document.getElementById('searchSuggestions');
    }

    function setSearchSuggestionsExpanded(isExpanded) {
        var searchInput = document.getElementById('searchbox');
        if (searchInput) searchInput.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    }

    function hideSearchSuggestions() {
        var root = getSearchSuggestionsRoot();
        if (!root) return;

        root.hidden = true;
        root.innerHTML = '';
        activeSuggestions = [];
        activeSuggestionIndex = -1;
        setSearchSuggestionsExpanded(false);
    }

    function renderSearchSuggestions(suggestions, query) {
        var root = getSearchSuggestionsRoot();
        if (!root) return;

        activeSuggestions = suggestions.slice();
        activeSuggestionIndex = suggestions.length ? 0 : -1;

        if (!suggestions.length) {
            root.innerHTML = '<p class="menu-search-suggestions__status">No matches for "' + escapeHtml(query) + '"</p>';
            root.hidden = false;
            setSearchSuggestionsExpanded(true);
            return;
        }

        root.innerHTML = suggestions
            .map(function (entry, index) {
                return (
                    '<button type="button" class="menu-search-suggestions__option' +
                    (index === activeSuggestionIndex ? ' is-active' : '') +
                    '" role="option" id="searchSuggestion-' +
                    index +
                    '" data-suggestion-index="' +
                    index +
                    '" aria-selected="' +
                    (index === activeSuggestionIndex ? 'true' : 'false') +
                    '">' +
                    '<span class="menu-search-suggestions__thumb">' +
                    suggestionThumbMarkup(entry) +
                    '</span>' +
                    '<span class="menu-search-suggestions__text">' +
                    '<span class="menu-search-suggestions__label">' +
                    highlightMatch(entry.label, query) +
                    '</span>' +
                    '<span class="menu-search-suggestions__meta">' +
                    escapeHtml(entry.sublabel) +
                    '</span>' +
                    '</span>' +
                    '</button>'
                );
            })
            .join('');

        root.hidden = false;
        setSearchSuggestionsExpanded(true);
        syncActiveSuggestionOption();
    }

    function syncActiveSuggestionOption() {
        var root = getSearchSuggestionsRoot();
        var searchInput = document.getElementById('searchbox');
        if (!root) return;

        root.querySelectorAll('.menu-search-suggestions__option').forEach(function (option, index) {
            var isActive = index === activeSuggestionIndex;
            option.classList.toggle('is-active', isActive);
            option.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        if (searchInput && activeSuggestionIndex >= 0) {
            searchInput.setAttribute('aria-activedescendant', 'searchSuggestion-' + activeSuggestionIndex);
        } else if (searchInput) {
            searchInput.removeAttribute('aria-activedescendant');
        }
    }

    function showSearchSuggestionsLoading() {
        var root = getSearchSuggestionsRoot();
        if (!root) return;
        root.hidden = false;
        root.innerHTML = '<p class="menu-search-suggestions__status">Loading menu suggestions…</p>';
        setSearchSuggestionsExpanded(true);
    }

    function updateSearchSuggestions(searchTerm) {
        if (!searchTerm) {
            hideSearchSuggestions();
            return;
        }

        if (!menuSearchIndex) {
            showSearchSuggestionsLoading();
            ensureMenuSearchIndex().then(function () {
                var searchInput = document.getElementById('searchbox');
                var currentTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
                if (!currentTerm) {
                    hideSearchSuggestions();
                    return;
                }
                renderSearchSuggestions(getSearchSuggestions(currentTerm, SUGGESTION_LIMIT), currentTerm);
            });
            return;
        }

        renderSearchSuggestions(getSearchSuggestions(searchTerm, SUGGESTION_LIMIT), searchTerm);
    }

    function navigateToMenuUrl(href) {
        if (!href) return;
        if (typeof window.closeAllPanelsBeforeNavigation === 'function') {
            window.closeAllPanelsBeforeNavigation();
        }
        if (window.TTMSBarba && typeof window.TTMSBarba.navigate === 'function') {
            window.TTMSBarba.navigate(href);
            return;
        }
        if (typeof window.barba !== 'undefined' && typeof window.barba.go === 'function') {
            try {
                var url = new URL(href, window.location.href);
                window.barba.go(url.pathname + url.search + url.hash);
                return;
            } catch (_) { /* fall through */ }
        }
        window.location.assign(href);
    }

    function findMenuItemCardByUrl(url) {
        if (!url) return null;
        var normalized = String(url).replace(/\/$/, '');
        var cards = document.querySelectorAll('.menu-item-card[data-item-url]');
        for (var i = 0; i < cards.length; i += 1) {
            var cardUrl = String(cards[i].getAttribute('data-item-url') || '').replace(/\/$/, '');
            if (cardUrl !== normalized) continue;
            cards[i].hidden = false;
            cards[i].style.display = '';
            cards[i].removeAttribute('data-menu-search-hidden');
            return cards[i];
        }
        return null;
    }

    function closeSearchBarIfOpen() {
        if (typeof window.closeSearch === 'function') {
            window.closeSearch();
            return;
        }
        var search = document.getElementById('search');
        if (!search || search.classList.contains('hide-search')) return;
        search.classList.add('hide-search');
        setSearchBarOpen(false);
        hideSearchSuggestions();
        var searchInput = document.getElementById('searchbox');
        if (searchInput) searchInput.value = '';
        clearMenuSearchFilters();
    }

    function waitForMenuItemCard(url, timeoutMs) {
        timeoutMs = timeoutMs || 5000;
        return new Promise(function (resolve) {
            var timer = null;

            function cleanup() {
                window.removeEventListener('homeMenuItemsLoaded', onLoaded);
                window.removeEventListener('menuReelsFlattened', onLoaded);
                if (timer) window.clearTimeout(timer);
            }

            function tryFind() {
                return findMenuItemCardByUrl(url);
            }

            function onLoaded() {
                var card = tryFind();
                if (card) {
                    cleanup();
                    resolve(card);
                }
            }

            var immediate = tryFind();
            if (immediate) {
                resolve(immediate);
                return;
            }

            var deadline = Date.now() + timeoutMs;
            window.addEventListener('homeMenuItemsLoaded', onLoaded);
            window.addEventListener('menuReelsFlattened', onLoaded);

            (function tick() {
                var card = tryFind();
                if (card) {
                    cleanup();
                    resolve(card);
                    return;
                }
                if (Date.now() >= deadline) {
                    cleanup();
                    resolve(null);
                    return;
                }
                timer = window.setTimeout(tick, 80);
            })();
        });
    }

    function scrollToMenuItemCardElement(card) {
        if (!card) return;
        if (typeof window.scrollToMenuReelsCard === 'function' && card.classList.contains('menu-reels-slide')) {
            window.scrollToMenuReelsCard(card, 'smooth');
            return;
        }
        card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    function openMenuItemCardElement(card, url) {
        if (!card) return;
        if (typeof window.openReelsMenuItemOrder === 'function' && card.classList.contains('menu-reels-slide')) {
            window.openReelsMenuItemOrder(card, url || card.getAttribute('data-item-url'), null);
            return;
        }
        if (typeof window.toggleItemExpansion === 'function') {
            window.toggleItemExpansion(card, url || card.getAttribute('data-item-url'), null);
        }
    }

    function ensureMenuReelsSectionReady(sectionLabel) {
        if (!sectionLabel) return Promise.resolve();

        if (typeof window.scrollMenuReelTo === 'function') {
            return Promise.resolve(window.scrollMenuReelTo(sectionLabel));
        }

        if (typeof window.loadHomeMenuForSectionId === 'function') {
            return Promise.resolve(window.loadHomeMenuForSectionId(sectionLabel));
        }

        return Promise.resolve();
    }

    function goToMenuItemSuggestion(suggestion) {
        if (!suggestion || !suggestion.url) {
            navigateToMenuUrl(suggestion && suggestion.url);
            return;
        }

        var url = suggestion.url;
        var sectionLabel = suggestion.sublabel || '';

        clearMenuSearchFilters();
        hideSearchSuggestions();

        if (isMenuReelsSearchContext()) {
            closeSearchBarIfOpen();

            ensureMenuReelsSectionReady(sectionLabel).then(function () {
                return waitForMenuItemCard(url);
            }).then(function (card) {
                if (!card) {
                    navigateToMenuUrl(url);
                    return;
                }
                scrollToMenuItemCardElement(card);
                window.setTimeout(function () {
                    openMenuItemCardElement(card, url);
                }, 350);
            });
            return;
        }

        closeSearchBarIfOpen();
        var card = findMenuItemCardByUrl(url);
        if (card) {
            scrollToMenuItemCardElement(card);
            window.setTimeout(function () {
                openMenuItemCardElement(card, url);
            }, 200);
            return;
        }

        navigateToMenuUrl(url);
    }

    function goToCategorySuggestion(suggestion) {
        if (!suggestion) return;

        clearMenuSearchFilters();
        hideSearchSuggestions();
        closeSearchBarIfOpen();

        if (isMenuReelsSearchContext() && suggestion.label) {
            ensureMenuReelsSectionReady(suggestion.label);
            return;
        }

        if (suggestion.url) {
            navigateToMenuUrl(suggestion.url);
        }
    }

    function goToFilterSuggestion(suggestion) {
        var searchInput = document.getElementById('searchbox');
        if (!searchInput || !suggestion) return;

        searchInput.value = suggestion.query || suggestion.label;
        hideSearchSuggestions();
        liveSearchNow();
        searchInput.focus();

        if (!isMenuReelsSearchContext()) return;

        window.setTimeout(function () {
            var track = document.getElementById('menu-reels-track');
            var firstMatch =
                track && track.querySelector('.menu-item-card.menu-reels-slide:not([hidden])');
            if (!firstMatch) return;
            scrollToMenuItemCardElement(firstMatch);
        }, 120);
    }

    function selectSearchSuggestion(index) {
        var suggestion = activeSuggestions[index];
        if (!suggestion) return;

        if (suggestion.type === 'item') {
            goToMenuItemSuggestion(suggestion);
            return;
        }

        if (suggestion.type === 'category') {
            goToCategorySuggestion(suggestion);
            return;
        }

        if (suggestion.type === 'tag' || suggestion.type === 'ingredient') {
            goToFilterSuggestion(suggestion);
            return;
        }

        goToFilterSuggestion(suggestion);
    }

    function handleSearchSuggestionsKeydown(event) {
        var root = getSearchSuggestionsRoot();
        if (!root || root.hidden || !activeSuggestions.length) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            activeSuggestionIndex = (activeSuggestionIndex + 1) % activeSuggestions.length;
            syncActiveSuggestionOption();
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            activeSuggestionIndex =
                activeSuggestionIndex <= 0 ? activeSuggestions.length - 1 : activeSuggestionIndex - 1;
            syncActiveSuggestionOption();
            return;
        }

        if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
            event.preventDefault();
            selectSearchSuggestion(activeSuggestionIndex);
        }
    }

    function isMenuReelsSearchContext() {
        return !!document.getElementById('menu-reels-track');
    }

    function parseMenuSearchJsonAttr(el, name) {
        if (!el) return '';
        try {
            var v = JSON.parse(el.getAttribute(name) || '[]');
            if (!Array.isArray(v)) return String(v || '').toLowerCase();
            return v.map(function (item) {
                if (item == null) return '';
                if (typeof item === 'object') {
                    return Object.values(item).join(' ');
                }
                return String(item);
            }).join(' ').toLowerCase();
        } catch (_) {
            return '';
        }
    }

    function menuItemMatchesSearch(card, searchTerm) {
        if (!card || !searchTerm) return false;

        var titleLink = card.querySelector('.menu-item-title a');
        var titleElement = titleLink || card.querySelector('.menu-item-title');
        var descriptionElement = card.querySelector('.menu-item-description');
        var titleText = titleElement ? titleElement.textContent.trim().toLowerCase() : '';
        var descriptionText = descriptionElement ? descriptionElement.textContent.trim().toLowerCase() : '';
        var optionsText = Array.from(card.querySelectorAll('.menu-item-options li'))
            .map(function (li) { return li.textContent.trim().toLowerCase(); })
            .join(' ');
        var sectionText = String(
            card.getAttribute('data-reel-section') ||
            card.getAttribute('data-section-slug') ||
            ''
        ).toLowerCase();
        var metaText = [
            parseMenuSearchJsonAttr(card, 'data-tags'),
            parseMenuSearchJsonAttr(card, 'data-ingredients'),
            parseMenuSearchJsonAttr(card, 'data-types'),
            parseMenuSearchJsonAttr(card, 'data-cookingmethods'),
            parseMenuSearchJsonAttr(card, 'data-events'),
        ].join(' ');
        var haystack = [titleText, descriptionText, optionsText, sectionText, metaText].join(' ');

        return haystack.indexOf(searchTerm) !== -1;
    }

    function isTaxonomyBrowsePage() {
        return !!document.querySelector('[data-menu-taxonomy-tabs]');
    }

    function taxonomyChipLabel(chip) {
        var link = chip && chip.querySelector('[data-taxonomy-label], .menublock-link__label');
        if (!link) return '';
        var attr = link.getAttribute('data-taxonomy-label');
        if (attr) return attr.trim().toLowerCase();
        return link.textContent.trim().toLowerCase();
    }

    function applyTaxonomyBrowseSearch(searchTerm) {
        var container = document.querySelector('[data-menu-taxonomy-tabs]');
        if (!container) return false;

        var activePanel = container.querySelector('.menu-taxonomy-tabs__panel.is-active');
        if (!activePanel) return false;

        var visibleCount = 0;
        activePanel.querySelectorAll('[data-taxonomy-chip]').forEach(function (chip) {
            var matches = !searchTerm || taxonomyChipLabel(chip).indexOf(searchTerm) !== -1;
            chip.hidden = !matches;
            chip.style.display = matches ? '' : 'none';
            chip.toggleAttribute('data-menu-search-hidden', !matches);
            if (matches) visibleCount += 1;
        });

        var emptyMsg = container.querySelector('[data-taxonomy-search-empty]');
        if (emptyMsg) {
            var showEmpty = !!searchTerm && visibleCount === 0;
            emptyMsg.hidden = !showEmpty;
            emptyMsg.classList.toggle('is-visible', showEmpty);
        }

        return true;
    }

    function clearTaxonomyBrowseSearch() {
        var container = document.querySelector('[data-menu-taxonomy-tabs]');
        if (!container) return;

        container.querySelectorAll('[data-taxonomy-chip]').forEach(function (chip) {
            chip.hidden = false;
            chip.style.display = '';
            chip.removeAttribute('data-menu-search-hidden');
        });

        container.querySelectorAll('[data-taxonomy-search-empty]').forEach(function (msg) {
            msg.hidden = true;
            msg.classList.remove('is-visible');
        });
    }

    function clearMenuSearchFilters() {
        document.body.classList.remove('menu-search-active');

        clearTaxonomyBrowseSearch();

        document.querySelectorAll('.menu-item-card').forEach(function (card) {
            card.hidden = false;
            card.style.display = '';
            card.removeAttribute('data-menu-search-hidden');
        });

        document.querySelectorAll('.main-menu-bg').forEach(function (section) {
            section.style.display = '';
            section.hidden = false;
        });

        var track = document.getElementById('menu-reels-track');
        if (track) {
            track.querySelectorAll('.menu-reels-slide, .ads-reels-slide').forEach(function (slide) {
                slide.hidden = false;
                slide.removeAttribute('data-menu-search-hidden');
            });
        }

        var header = document.getElementById('searchresultheader');
        if (header) header.classList.add('is-hidden');
    }

    function applyMenuReelsSearch(searchTerm) {
        var track = document.getElementById('menu-reels-track');
        if (!track) return false;

        var cards = track.querySelectorAll('.menu-item-card.menu-reels-slide');
        var matchingSections = new Set();

        cards.forEach(function (card) {
            var matches = menuItemMatchesSearch(card, searchTerm);
            card.hidden = !matches;
            card.style.display = matches ? '' : 'none';
            if (matches) {
                var sectionName = card.getAttribute('data-reel-section');
                var sectionSlug = card.getAttribute('data-section-slug');
                if (sectionName) matchingSections.add(sectionName);
                if (sectionSlug) matchingSections.add(sectionSlug);
            }
        });

        track.querySelectorAll('.menu-reels-slide, .ads-reels-slide').forEach(function (slide) {
            if (slide.classList.contains('menu-item-card')) return;

            if (
                slide.classList.contains('menu-reels-slide--hero') ||
                slide.classList.contains('menu-reels-slide--contact') ||
                slide.classList.contains('menu-reels-slide--intro') ||
                slide.classList.contains('ads-reels-slide')
            ) {
                slide.hidden = true;
                return;
            }

            if (slide.classList.contains('menu-reels-slide--section-title')) {
                var sectionTitle = slide.getAttribute('data-reel-section') || '';
                slide.hidden = !matchingSections.has(sectionTitle);
                return;
            }

            if (slide.classList.contains('menu-header')) {
                var reelSection = slide.getAttribute('data-reel-section') || '';
                var reelSlug = slide.getAttribute('data-section-slug') || '';
                slide.hidden = !(matchingSections.has(reelSection) || matchingSections.has(reelSlug));
                return;
            }

            slide.hidden = true;
        });

        var firstMatch = track.querySelector('.menu-item-card.menu-reels-slide:not([hidden])');
        if (firstMatch) {
            firstMatch.scrollIntoView({ block: 'start', behavior: 'auto' });
        }

        return true;
    }

    function applyClassicMenuSearch(searchTerm) {
        var menuItemCards = document.querySelectorAll('.menu-item-card:not(.menu-reels-slide)');
        var sectionsWithMatches = new Set();

        menuItemCards.forEach(function (card) {
            var matches = menuItemMatchesSearch(card, searchTerm);
            card.style.display = matches ? '' : 'none';
            card.hidden = !matches;

            if (matches) {
                var menuSection = card.closest('.main-menu-bg');
                if (menuSection) sectionsWithMatches.add(menuSection);
            }
        });

        document.querySelectorAll('.main-menu-bg').forEach(function (section) {
            if (sectionsWithMatches.size === 0) {
                section.style.display = '';
                return;
            }
            section.style.display = sectionsWithMatches.has(section) ? '' : 'none';
        });
    }

    function liveSearchNow() {
        var searchInput = document.getElementById('searchbox');
        if (!searchInput) return;

        var searchTerm = searchInput.value.trim().toLowerCase();
        var header = document.getElementById('searchresultheader');

        if (searchTerm.length === 0) {
            clearMenuSearchFilters();
            hideSearchSuggestions();
            return;
        }

        if (header) header.classList.remove('is-hidden');

        document.body.classList.add('menu-search-active');
        updateSearchSuggestions(searchTerm);

        if (isTaxonomyBrowsePage()) {
            applyTaxonomyBrowseSearch(searchTerm);
            return;
        }

        if (isMenuReelsSearchContext()) {
            applyMenuReelsSearch(searchTerm);
            return;
        }

        applyClassicMenuSearch(searchTerm);
    }

    function liveSearch() {
        if (liveSearchTimer) window.clearTimeout(liveSearchTimer);
        liveSearchTimer = window.setTimeout(function () {
            liveSearchTimer = null;
            liveSearchNow();
        }, LIVE_SEARCH_DEBOUNCE_MS);
    }

    function setSearchBarOpen(isOpen) {
        document.body.classList.toggle('menu-search-bar-open', !!isOpen);
    }

    function syncSearchBarOpenState() {
        var search = document.getElementById('search');
        setSearchBarOpen(search && !search.classList.contains('hide-search'));
    }

    function closeSearch() {
        var search = document.getElementById('search');
        if (!search || search.classList.contains('hide-search')) return;

        search.classList.add('hide-search');
        setSearchBarOpen(false);
        hideSearchSuggestions();

        var searchInput = document.getElementById('searchbox');
        if (searchInput) {
            searchInput.value = '';
        }
        if (liveSearchTimer) {
            window.clearTimeout(liveSearchTimer);
            liveSearchTimer = null;
        }
        liveSearchNow();
        document.body.classList.remove('menu-search-active');
    }

    function toggleSearch() {
        var search = document.getElementById('search');
        var searchInput = document.getElementById('searchbox');
        if (!search) return;

        if (search.classList.contains('hide-search')) {
            if (typeof window.closeAllUiPanels === 'function') {
                window.closeAllUiPanels({ keepSearch: true, skipReelsModal: true });
            }
            search.classList.remove('hide-search');
            setSearchBarOpen(true);
            if (searchInput) {
                try {
                    searchInput.focus({ preventScroll: true });
                } catch (_) {
                    searchInput.focus();
                }
            }
        } else {
            closeSearch();
        }
    }

    function initMenuSearchBar() {
        ensureMenuSearchIndex();
        syncSearchBarOpenState();
    }

    window.toggleSearch = toggleSearch;
    window.closeSearch = closeSearch;
    window.liveSearch = liveSearch;
    window.liveSearchNow = liveSearchNow;
    window.clearMenuSearchFilters = clearMenuSearchFilters;
    window.initMenuSearchBar = initMenuSearchBar;

    document.addEventListener('menuReelsFlattened', function () {
        var searchInput = document.getElementById('searchbox');
        if (searchInput && searchInput.value.trim()) {
            liveSearchNow();
        }
    });

    document.addEventListener('menuReelsUpdated', function () {
        var searchInput = document.getElementById('searchbox');
        if (searchInput && searchInput.value.trim()) {
            liveSearchNow();
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.target && e.target.id === 'searchbox') {
            handleSearchSuggestionsKeydown(e);
        }
        if (e.key !== 'Escape') return;
        var search = document.getElementById('search');
        if (!search || search.classList.contains('hide-search')) return;
        toggleSearch();
    });

    document.addEventListener('click', function (e) {
        var option = e.target && e.target.closest('.menu-search-suggestions__option');
        if (!option) return;
        e.preventDefault();
        var index = parseInt(option.getAttribute('data-suggestion-index'), 10);
        if (!Number.isNaN(index)) selectSearchSuggestion(index);
    });

    document.addEventListener('ttms:page-enter', function () {
        hideSearchSuggestions();
        initMenuSearchBar();
    });

    var searchRoot = document.getElementById('search');
    if (searchRoot && typeof MutationObserver !== 'undefined') {
        new MutationObserver(syncSearchBarOpenState).observe(searchRoot, {
            attributes: true,
            attributeFilter: ['class'],
        });
    }
    syncSearchBarOpenState();
    initMenuSearchBar();
})();
