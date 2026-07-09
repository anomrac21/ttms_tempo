// Global flag to prevent multiple simultaneous ad loading attempts
let isAdsLoading = false;
let maxLoaderTimeout = null;
let globalLoaderKillTimeout = null;
let adRefreshTimer = null;
let loaderHasHiddenOnce = false;

function shouldUseAdManager() {
    return !document.getElementById('pageadscontainer');
}

function forceHideLoaderElement(loader) {
    if (!loader) return;
    loader.style.pointerEvents = 'none';
    loader.style.visibility = 'hidden';
    loader.style.opacity = '0';
    loader.style.display = 'none';
}

function recoverStuckUiState() {
    if (typeof window.forceClearNavigationUiState === 'function') {
        window.forceClearNavigationUiState();
        return;
    }
    if (typeof window.closeAllPanelsBeforeNavigation === 'function') {
        window.closeAllPanelsBeforeNavigation();
    }
    if (window.TTMSViewport && typeof window.TTMSViewport.forceClearScrollLock === 'function') {
        window.TTMSViewport.forceClearScrollLock();
    }
    var loader = document.getElementById('loader');
    if (loader) {
        forceHideLoaderElement(loader);
    }
    if (typeof window.hideLoader === 'function') {
        window.hideLoader();
    }
}

// Absolute last-resort kill switch for Android black screen (stuck loader)
globalLoaderKillTimeout = setTimeout(function () {
    recoverStuckUiState();
}, 10000);

function scheduleAdRefresh(delayMs) {
    if (adRefreshTimer) {
        clearTimeout(adRefreshTimer);
    }
    adRefreshTimer = setTimeout(function () {
        adRefreshTimer = null;
        if (document.getElementById('pageadscontainer')) {
            if (window.AdsClient && typeof window.AdsClient.loadAds === 'function') {
                window.AdsClient.loadAds();
            }
            return;
        }
        if (!shouldUseAdManager()) {
            return;
        }
        if (isAdsLoading) {
            return;
        }
        if (window.adManager && typeof window.adManager.populateAds === 'function') {
            isAdsLoading = true;
            try {
                window.adManager.populateAds();
            } catch (error) {
                console.error('Error calling populateAds:', error);
            }
            isAdsLoading = false;
        }
    }, delayMs || 300);
}

document.addEventListener('DOMContentLoaded', function () {
    const loader = document.getElementById('loader');
    const loaderImage = document.getElementById('loaderImage');

    if (!loader) {
        return;
    }

    let isHidingLoader = false;

    let animations = [
        'loader-hide-up', 'loader-hide-up-right', 'loader-hide-right', 'loader-hide-down-right',
        'loader-hide-down', 'loader-hide-down-left', 'loader-hide-left', 'loader-hide-up-left',
        'loader-hide-up-rotate-left', 'loader-hide-up-right-rotate-left', 'loader-hide-right-rotate-left',
        'loader-hide-down-right-rotate-left', 'loader-hide-down-rotate-left', 'loader-hide-down-left-rotate-left',
        'loader-hide-left-rotate-left', 'loader-hide-up-left-rotate-left', 'loader-hide-up-rotate-right',
        'loader-hide-up-right-rotate-right', 'loader-hide-right-rotate-right', 'loader-hide-down-right-rotate-right',
        'loader-hide-down-rotate-right', 'loader-hide-down-left-rotate-right', 'loader-hide-left-rotate-right',
        'loader-hide-up-left-rotate-right', 'loader-hide-up-rotate-scale', 'loader-hide-up-right-rotate-scale',
        'loader-hide-right-rotate-scale', 'loader-hide-down-right-rotate-scale', 'loader-hide-down-rotate-scale',
        'loader-hide-down-left-rotate-scale', 'loader-hide-left-rotate-scale', 'loader-hide-up-left-rotate-scale',
    ];

    function resetLoaderVisible() {
        loader.style.display = 'flex';
        loader.style.opacity = '';
        loader.style.visibility = '';
        loader.style.pointerEvents = '';
        if (loaderImage) {
            loaderImage.style.display = 'block';
        }
        animations.forEach(function (anim) {
            loader.classList.remove(anim);
        });
    }

    function showLoader() {
        if (!loader) return;
        isHidingLoader = false;
        resetLoaderVisible();
    }

    function hideLoader() {
        if (!loader || isHidingLoader) return;
        isHidingLoader = true;

        if (maxLoaderTimeout) {
            clearTimeout(maxLoaderTimeout);
            maxLoaderTimeout = null;
        }

        animations.forEach(function (anim) {
            loader.classList.remove(anim);
        });

        var randomAnim = animations[Math.floor(Math.random() * animations.length)];
        loader.classList.add(randomAnim);

        const footerBtns = document.getElementById('footerBtns');
        if (footerBtns) {
            footerBtns.classList.add('visible');
        }

        setTimeout(function () {
            forceHideLoaderElement(loader);
            isHidingLoader = false;
            loaderHasHiddenOnce = true;
            if (globalLoaderKillTimeout) {
                clearTimeout(globalLoaderKillTimeout);
                globalLoaderKillTimeout = null;
            }
        }, 520);
    }

    window.showLoader = showLoader;
    window.hideLoader = hideLoader;
    window.allowLoaderHide = hideLoader;

    function scheduleLoaderFallback() {
        if (maxLoaderTimeout) {
            clearTimeout(maxLoaderTimeout);
        }
        maxLoaderTimeout = setTimeout(function () {
            console.warn('[TTMS loader] Transition timeout — force hiding loader');
            hideLoader();
            recoverStuckUiState();
        }, 5000);
    }

    function waitMs(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    async function waitForInitialPageReady(isReelsHome) {
        resetLoaderVisible();

        if (isReelsHome) {
            var bootstrap = Promise.resolve();
            if (typeof window.waitForHomeMenuBootstrap === 'function') {
                bootstrap = window.waitForHomeMenuBootstrap().catch(function () {
                    return null;
                });
            } else {
                var viewport = document.getElementById('menu-reels-viewport');
                var apiUrl =
                    viewport &&
                    (viewport.getAttribute('data-home-menu-api') || '/api/menu-items.json');
                if (apiUrl) {
                    bootstrap = fetch(apiUrl, { credentials: 'same-origin' })
                        .then(function (r) {
                            return r.ok ? r.json() : null;
                        })
                        .catch(function () {
                            return null;
                        });
                }
            }

            await Promise.race([
                Promise.all([waitMs(600), bootstrap]),
                waitMs(4000),
            ]);
            return;
        }

        await Promise.race([
            new Promise(function (resolve) {
                if (document.readyState === 'complete') resolve();
                else window.addEventListener('load', resolve, { once: true });
            }),
            waitMs(800),
        ]);
    }

    async function runHomeEnterSideEffects(isReelsHome) {
        if (!isReelsHome) {
            scheduleAdRefresh(400);
            return;
        }

        if (typeof window.waitForHomeMenuBootstrap === 'function') {
            await Promise.race([
                window.waitForHomeMenuBootstrap().catch(function () {
                    return null;
                }),
                waitMs(4000),
            ]);
        }

        setTimeout(function () {
            if (!document.getElementById('pageadscontainer')) {
                scheduleAdRefresh(200);
            }
            if (typeof reloadAppJS === 'function') {
                reloadAppJS();
            }
            if (typeof reinitOpeningHours === 'function') {
                reinitOpeningHours();
            } else {
                if (typeof initOpeninghoursDisplay === 'function') {
                    initOpeninghoursDisplay();
                }
                if (typeof getOpenSigns === 'function') {
                    getOpenSigns();
                }
            }
            if (typeof window.initMenuSmashPass === 'function') {
                window.initMenuSmashPass();
            }
        }, 350);
    }

    function clearNavigationUiState() {
        if (typeof window.forceClearNavigationUiState === 'function') {
            window.forceClearNavigationUiState();
            return;
        }
        if (typeof window.closeAllPanelsBeforeNavigation === 'function') {
            window.closeAllPanelsBeforeNavigation();
            return;
        }
        if (typeof window.ensureMenuReelsItemModalClosed === 'function') {
            window.ensureMenuReelsItemModalClosed();
        }
        if (window.TTMSViewport && typeof window.TTMSViewport.forceClearScrollLock === 'function') {
            window.TTMSViewport.forceClearScrollLock();
        }
        hideLoader();
    }

    if (typeof barba === 'undefined') {
        console.error('Barba.js not loaded. Hiding loader without transitions.');
        hideLoader();
        return;
    }

    barba.init({
        cacheIgnore: true,
        prevent: function (ctx) {
            var el = ctx && ctx.el;
            var href = (ctx && ctx.href) || (el && el.getAttribute && el.getAttribute('href'));
            if (el && el.getAttribute && el.getAttribute('data-barba') === 'prevent') {
                return true;
            }
            if (typeof window.TTMSBarbaShouldPrevent === 'function') {
                return window.TTMSBarbaShouldPrevent(href);
            }
            return false;
        },
        transitions: [{
            name: 'fade',
            async leave() {
                scheduleLoaderFallback();
                const menublock = document.getElementById('menublock');
                if (menublock) {
                    localStorage.setItem('headerScroll', menublock.scrollLeft);
                }

                if (window.APP && APP.slideshow && typeof APP.slideshow.destroy === 'function') {
                    APP.slideshow.destroy();
                }
                if (typeof window.destroyLocationPicker === 'function') {
                    window.destroyLocationPicker();
                }
                if (typeof window.destroyMenuSmashPass === 'function') {
                    window.destroyMenuSmashPass();
                }
                clearNavigationUiState();
                showLoader();
                await waitMs(366);
            },
            async enter() {
                scheduleLoaderFallback();
                var isReelsHome = !!document.getElementById('menu-reels-viewport');
                window.scrollTo(0, 0);
                document.documentElement.scrollTop = 0;
                document.body.scrollTop = 0;

                const menublockEl = document.getElementById('menublock');
                if (menublockEl) {
                    menublockEl.scrollTo(0, 0);
                }
                if (typeof window.scheduleReinitHeaderMenublock === 'function') {
                    window.scheduleReinitHeaderMenublock('barba-enter');
                } else if (typeof window.reinitHeaderMenublock === 'function') {
                    window.reinitHeaderMenublock();
                } else if (typeof window.bindMenublockScroll === 'function') {
                    window.bindMenublockScroll();
                }
                if (typeof closeCart === 'function') {
                    closeCart();
                }
                if (typeof closeDashboard === 'function') {
                    closeDashboard();
                }
                if (typeof closeShop === 'function') {
                    closeShop();
                }
                clearNavigationUiState();
                await waitMs(366);
                await runHomeEnterSideEffects(isReelsHome);
                hideLoader();

                requestAnimationFrame(function () {
                    const mainElement = document.getElementById('main');
                    if (mainElement) {
                        mainElement.style.paddingTop = '';
                        mainElement.style.paddingBlockStart = '';
                        mainElement.style.marginTop = '';
                    }
                    window.scrollTo(0, 0);
                    document.documentElement.scrollTop = 0;
                    document.body.scrollTop = 0;
                });

                const savedScroll = localStorage.getItem('headerScroll');
                const restoreMenublockScroll =
                    savedScroll !== null &&
                    !(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
                if (restoreMenublockScroll) {
                    requestAnimationFrame(function () {
                        const menublock = document.getElementById('menublock');
                        if (menublock) {
                            menublock.scrollLeft = savedScroll;
                        }
                        if (typeof window.scheduleReinitHeaderMenublock === 'function') {
                            window.scheduleReinitHeaderMenublock('barba-enter-scroll');
                        } else if (typeof window.reinitHeaderMenublock === 'function') {
                            window.reinitHeaderMenublock();
                        } else if (typeof window.bindMenublockScroll === 'function') {
                            window.bindMenublockScroll();
                        }
                        if (typeof window.updateHeaderMenublockScroll === 'function') {
                            window.updateHeaderMenublockScroll();
                        }
                    });
                } else if (typeof window.scheduleReinitHeaderMenublock === 'function') {
                    window.scheduleReinitHeaderMenublock('barba-enter-fallback');
                } else if (typeof window.reinitHeaderMenublock === 'function') {
                    window.reinitHeaderMenublock();
                } else if (typeof window.bindMenublockScroll === 'function') {
                    window.bindMenublockScroll();
                }

                setTimeout(function () {
                    if (typeof window.initLocationPicker === 'function') {
                        window.initLocationPicker();
                    }
                }, 350);
            },
            async once() {
                var isReelsHome = !!document.getElementById('menu-reels-viewport');
                scheduleLoaderFallback();

                if (!isReelsHome) {
                    scheduleAdRefresh(300);
                }

                await waitForInitialPageReady(isReelsHome);
                hideLoader();

                setTimeout(function () {
                    if (!document.getElementById('pageadscontainer')) {
                        scheduleAdRefresh(200);
                    }
                    if (typeof reloadAppJS === 'function') {
                        reloadAppJS();
                    }
                    if (typeof reinitOpeningHours === 'function') {
                        reinitOpeningHours();
                    } else {
                        if (typeof initOpeninghoursDisplay === 'function') {
                            initOpeninghoursDisplay();
                        }
                        if (typeof getOpenSigns === 'function') {
                            getOpenSigns();
                        }
                    }
                }, 600);
            },
        }],
    });

    if (window.TTMSBarba && typeof window.TTMSBarba.ensureHooks === 'function') {
        window.TTMSBarba.ensureHooks();
    }

    if (window.barba && window.barba.hooks && typeof window.barba.hooks.before === 'function') {
        window.barba.hooks.before(function () {
            clearNavigationUiState();
        });
    }

    if (window.barba && window.barba.hooks && typeof window.barba.hooks.after === 'function') {
        window.barba.hooks.after(function () {
            hideLoader();
            recoverStuckUiState();
        });
    }
});

const header = document.querySelector('.header') || document.getElementById('menublock');

window.addEventListener('beforeunload', function () {
    if (header) {
        localStorage.setItem('headerScroll', header.scrollLeft);
    }
});

window.addEventListener('pageshow', function (event) {
    if (event.persisted || !loaderHasHiddenOnce) {
        recoverStuckUiState();
    }
});

document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    var loader = document.getElementById('loader');
    if (!loader || loader.style.display === 'none') return;
    var opacity = parseFloat(window.getComputedStyle(loader).opacity || '1');
    if (opacity > 0.05) {
        recoverStuckUiState();
    }
});

window.addEventListener('adManagerReady', function () {
    scheduleAdRefresh(150);
});

window.addEventListener('load', function () {
    scheduleAdRefresh(500);
});
