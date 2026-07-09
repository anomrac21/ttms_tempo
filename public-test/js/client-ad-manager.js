// ClientAdManager — homepage-ads-container + frontpage-ads-container
// Loads from ads.ttmenus.com API when available, else /promotions/index.json (Hugo content)

var TTMSAdMgrShared = window.TTMSAdsShared || {};

class ClientAdManager {
  constructor() {
    this.ads = [];
    this.currentDay = null;
    this.currentTime = null;
    this.hasPopulatedHome = false;
    this.hasPopulatedFront = false;
    this.sessionId = this.getSessionId();
    console.log('ClientAdManager initialized');
  }

  getSessionId() {
    try {
      let id = sessionStorage.getItem('ttmenus_session_id');
      if (!id) {
        id = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
        sessionStorage.setItem('ttmenus_session_id', id);
      }
      return id;
    } catch (_) {
      return 'sess_anon';
    }
  }

  _shouldUseExternalTimeApi() {
    try {
      var host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') return false;
    } catch (_) { /* ignore */ }
    return true;
  }

  async fetchDateTimeFromAPI() {
    if (!this._shouldUseExternalTimeApi()) return null;
    try {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timeoutId = controller
        ? setTimeout(function () { controller.abort(); }, 2500)
        : null;
      const res = await fetch('https://worldtimeapi.org/api/ip', {
        cache: 'no-store',
        signal: controller ? controller.signal : undefined,
      });
      if (timeoutId) clearTimeout(timeoutId);
      if (!res.ok) return null;
      const data = await res.json();
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const day = days[(data.day_of_week || 1) - 1] || null;
      let hour = 0;
      let minute = 0;
      if (data.datetime) {
        const m = data.datetime.match(/T(\d{1,2}):(\d{2})/);
        if (m) {
          hour = parseInt(m[1], 10);
          minute = parseInt(m[2], 10);
        }
      }
      return day ? { day, hour, minute } : null;
    } catch (_) {
      return null;
    }
  }

  async ensureDateTime() {
    if (this.currentDay) return;
    const now = new Date();
    this.currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
    this.currentTime = { hour: now.getHours(), minute: now.getMinutes() };
    const dt = await this.fetchDateTimeFromAPI();
    if (dt) {
      this.currentDay = dt.day;
      this.currentTime = { hour: dt.hour, minute: dt.minute };
    }
  }

  filterAdsByDay(ads) {
    var day = this.currentDay || new Date().toLocaleDateString('en-US', { weekday: 'long' });
    var nowMins = this.currentTime ? this.currentTime.hour * 60 + this.currentTime.minute : null;
    if (TTMSAdMgrShared.filterAdsByDay) {
      return TTMSAdMgrShared.filterAdsByDay(ads, day, nowMins, false);
    }
    return ads;
  }

  async loadPromotionsJson() {
    try {
      const url = `/promotions/index.json?t=${Date.now()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data && data.items) {
        this.ads = data.items;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to load promotions JSON:', error);
      return false;
    }
  }

  hasValidImages(ad) {
    return TTMSAdMgrShared.hasValidImages
      ? TTMSAdMgrShared.hasValidImages(ad)
      : false;
  }

  resolveImageUrl(img) {
    return TTMSAdMgrShared.resolveImageUrl
      ? TTMSAdMgrShared.resolveImageUrl(img)
      : '';
  }

  normalizeImagePath(path) {
    return TTMSAdMgrShared.normalizeImagePath
      ? TTMSAdMgrShared.normalizeImagePath(path)
      : path;
  }

  cssImageVar(path) {
    const safe = String(path).replace(/\\/g, '/').replace(/"/g, '%22');
    return `url("${safe}")`;
  }

  async fetchActiveAdsFromService(container) {
    if (!container) return [];
    const apiUrl = container.getAttribute('data-ads-api');
    const clientId = container.getAttribute('data-client-id');
    if (!apiUrl || !clientId) return [];

    try {
      await this.ensureDateTime();
      const day = encodeURIComponent(this.currentDay);
      const url = `${apiUrl.replace(/\/$/, '')}/active-ads?client_id=${encodeURIComponent(clientId)}&day=${day}`;
      const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (result.success && Array.isArray(result.data) && result.data.length > 0) {
        console.log('Ads API returned', result.data.length, 'ads');
        return result.data;
      }
    } catch (error) {
      console.warn('Ads API unavailable, using promotions fallback:', error);
    }
    return [];
  }

  async getAdsForDisplay(frontpageContainer) {
    await this.ensureDateTime();

    const apiAds = await this.fetchActiveAdsFromService(frontpageContainer);
    if (apiAds.length > 0) {
      return {
        ads: apiAds.filter((ad) => this.hasValidImages(ad)),
        fromApi: true,
      };
    }

    if (this.ads.length === 0) {
      await this.loadPromotionsJson();
    }
    if (this.ads.length === 0) return { ads: [], fromApi: false };

    let filtered = this.filterAdsByDay(this.ads);
    if (filtered.length === 0) filtered = this.ads;
    return {
      ads: filtered.filter((ad) => this.hasValidImages(ad)),
      fromApi: false,
    };
  }

  trackImpression(ad, container) {
    const apiUrl = container && container.getAttribute('data-ads-api');
    const clientId = container && container.getAttribute('data-client-id');
    if (!apiUrl || !ad.id) return;
    fetch(`${apiUrl.replace(/\/$/, '')}/tracking/impression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ad_id: ad.id,
        client_id: clientId,
        session_id: this.sessionId,
        device_type: this.getDeviceType(),
        viewed_at: new Date().toISOString(),
      }),
    }).catch(() => {});
  }

  trackClick(ad, container) {
    const apiUrl = container && container.getAttribute('data-ads-api');
    if (!apiUrl || !ad.id) return;
    fetch(`${apiUrl.replace(/\/$/, '')}/tracking/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ad_id: ad.id,
        clicked_at: new Date().toISOString(),
        device_type: this.getDeviceType(),
        referrer: window.location.href,
      }),
    }).catch(() => {});
  }

  getDeviceType() {
    return TTMSAdMgrShared.getDeviceType
      ? TTMSAdMgrShared.getDeviceType('ua')
      : 'desktop';
  }

  createFrontpageAdPanel(ad, container, fromApi) {
    const li = document.createElement('li');
    li.className = 'ad-panel';
    if (ad.id) {
      li.dataset.adId = ad.id;
      li.setAttribute('data-ad-id', ad.id);
    }
    if (ad.title) li.setAttribute('data-ad-title', ad.title);

    const linkUrl = fromApi
      ? ad.link_url
      : ad.link || ad.url || (ad.title ? `/promotions/${String(ad.title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}/` : '');

    if (linkUrl) {
      li.setAttribute('data-ad-url', linkUrl);
      li.style.cursor = 'pointer';
      li.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        if (fromApi && ad.id) this.trackClick(ad, container);
        window.open(linkUrl, '_blank', 'noopener,noreferrer');
      });
    }

    const sponsored = document.createElement('span');
    sponsored.textContent = 'Sponsored';
    li.appendChild(sponsored);

    let hasMedia = false;
    (ad.images || []).forEach((img) => {
      const imageUrl = this.normalizeImagePath(this.resolveImageUrl(img));
      if (!imageUrl) return;
      const alt = (typeof img === 'object' && (img.alt_text || img.alt)) || ad.title || 'Sponsored advertisement';

      if (/\.(mp4|webm|ogg)$/i.test(imageUrl)) {
        const video = document.createElement('video');
        video.className = 'ad-portrait ad-video';
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        const source = document.createElement('source');
        source.src = imageUrl;
        source.type = 'video/mp4';
        video.appendChild(source);
        li.appendChild(video);
        hasMedia = true;
      } else {
        const bgImg = document.createElement('img');
        bgImg.src = imageUrl;
        bgImg.className = 'ad-portrait-bg';
        bgImg.alt = alt;
        bgImg.loading = 'lazy';
        bgImg.decoding = 'async';
        li.appendChild(bgImg);

        const fgImg = document.createElement('img');
        fgImg.src = imageUrl;
        fgImg.className = 'ad-portrait';
        fgImg.alt = alt;
        fgImg.loading = 'lazy';
        fgImg.decoding = 'async';
        li.appendChild(fgImg);
        hasMedia = true;
      }
    });

    return hasMedia ? li : null;
  }

  generateHomepageAdHTML(ad, adIndex) {
    if (!this.hasValidImages(ad)) return '';
    const finalUrl = ad.link || ad.url || `/promotions/${ad.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`;
    const adId = ad.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const eager = adIndex < 2;
    const safeTitle = String(ad.title || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const slides = (ad.images || [])
      .map((img, imageIndex) => {
        const imagePath = this.normalizeImagePath(this.resolveImageUrl(img));
        if (!imagePath) return '';
        const loading = eager && imageIndex === 0 ? 'eager' : 'lazy';
        const fetchAttr = eager && imageIndex === 0 ? ' fetchpriority="high"' : '';
        const slideId = (ad.images || []).length > 1 ? `${adId}-${imageIndex}` : adId;
        return `
      <article
        id="menu-ad-${slideId}"
        class="ads-reels-slide"
        data-ad-id="menu-ad-${slideId}"
        data-ad-title="${safeTitle}"
        data-ad-url="${finalUrl}"
        data-catalog-index="${adIndex}"
      >
        ${window.TTMSMenuItemActions && typeof window.TTMSMenuItemActions.buildPromotionHeaderMarkup === 'function'
          ? window.TTMSMenuItemActions.buildPromotionHeaderMarkup({
              title: ad.title,
              url: finalUrl,
              promoUrl: ad.url || ad.link || (ad.title ? `/promotions/${adId}/` : finalUrl),
              catalogIndex: adIndex,
              adId: `menu-ad-${slideId}`,
              image: String(typeof img === 'string' ? img : img?.image || imagePath || '')
                .replace(/^https?:\/\/[^/]+/i, '')
                .replace(/^\//, ''),
            })
          : ''}
        <span>Sponsored</span>
        <img src="${imagePath}" class="ad-portrait-bg" alt="${safeTitle}" loading="${loading}" decoding="async"${fetchAttr}>
        <img src="${imagePath}" class="ad-portrait" alt="${safeTitle}" loading="${loading}" decoding="async"${fetchAttr}>
      </article>`;
      })
      .filter(Boolean)
      .join('');

    return slides;
  }

  refreshAfterAdsPopulated() {
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('adsPopulated'));
    });
  }

  hideContainer(container) {
    if (container) container.style.display = 'none';
  }

  async populateFrontpage(force = false) {
    // Frontpage ads handled by ads-client.js (reels preview + fullscreen viewer)
    if (document.getElementById('pageadscontainer')) return;

    const container = document.getElementById('frontpage-ads-container');
    if (!container) return;

    if (this.hasPopulatedFront && !force) return;

    const ul = container.querySelector('#frontpage-ad-sponsored ul.inner, section.ads ul.inner');
    if (!ul) {
      console.warn('frontpage-ads-container: missing ul.inner');
      return;
    }

    const { ads, fromApi } = await this.getAdsForDisplay(container);
    if (!ads.length) {
      console.log('No ads for frontpage — hiding container');
      this.hideContainer(container);
      this.hasPopulatedFront = true;
      return;
    }

    ul.innerHTML = '';
    ads.forEach((ad, index) => {
      const panel = this.createFrontpageAdPanel(ad, container, fromApi);
      if (panel) {
        ul.appendChild(panel);
        if (fromApi && ad.id) {
          setTimeout(() => this.trackImpression(ad, container), 500 + index * 100);
        }
      }
    });

    if (!ul.children.length) {
      this.hideContainer(container);
    } else {
      container.style.display = '';
      container.style.visibility = 'visible';
    }

    this.hasPopulatedFront = true;
    console.log('Frontpage ads populated:', ul.children.length);
    this.refreshAfterAdsPopulated();
  }

  getHomepageAdSlides() {
    const track = document.getElementById('menu-reels-track');
    if (track) {
      return Array.from(track.querySelectorAll('.ads-reels-slide'));
    }
    const container = document.getElementById('homepage-ads-container');
    return container ? Array.from(container.querySelectorAll('.ads-reels-slide')) : [];
  }

  applyHomepageDayFilter(root) {
    const scope = root || document.getElementById('menu-reels-track') || document.getElementById('homepage-ads-container');
    if (!scope) return;

    const day = this.currentDay || new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const slides = scope.querySelectorAll('.ads-reels-slide[data-daysofweek]');
    let visible = 0;

    slides.forEach((slide) => {
      let days = [];
      try {
        days = JSON.parse(slide.getAttribute('data-daysofweek') || '[]');
      } catch (_) {
        days = [];
      }
      const show = !days.length || days.includes(day);
      slide.hidden = !show;
      slide.classList.toggle('ads-reels-slide--hidden', !show);
      if (show) visible += 1;
    });

    if (visible === 0 && slides.length) {
      slides.forEach((slide) => {
        slide.hidden = false;
        slide.classList.remove('ads-reels-slide--hidden');
      });
      visible = slides.length;
    }

    return visible;
  }

  async populateHomepage(force = false) {
    if (this.hasPopulatedHome && !force) return;

    await this.ensureDateTime();

    let container = document.getElementById('homepage-ads-container');
    const track = document.getElementById('menu-reels-track');
    let slides = this.getHomepageAdSlides();

    if (slides.length > 0) {
      if (container) {
        const loading = container.querySelector('.ads-loading');
        if (loading) loading.remove();
        container.style.display = '';
        container.style.visibility = 'visible';
      }
      this.applyHomepageDayFilter(track || container || document);
      this.bindClientAdsReelsSlides(document);
      this.hasPopulatedHome = true;
      console.log('Homepage ads ready (SSR):', slides.length);
      this.refreshAfterAdsPopulated();
      return;
    }

    if (!container) return;

    const loading = container.querySelector('.ads-loading');
    if (loading) loading.remove();

    const { ads } = await this.getAdsForDisplay(null);
    if (ads.length === 0) {
      container.innerHTML = '<p style="text-align: center; padding: 2em;">No promotions available</p>';
      this.hasPopulatedHome = true;
      return;
    }

    container = document.getElementById('homepage-ads-container');
    if (!container) return;

    container.innerHTML = ads.map((ad, index) => this.generateHomepageAdHTML(ad, index)).filter(Boolean).join('');
    container.style.display = '';
    container.style.visibility = 'visible';
    this.hasPopulatedHome = true;
    console.log('Homepage ads populated (JSON fallback):', ads.length);
    this.bindClientAdsReelsSlides(container);
    this.refreshAfterAdsPopulated();
  }

  bindReelsSlideClicks(slides) {
    slides.forEach((slide, index) => {
      if (slide.dataset.catalogIndex == null) slide.dataset.catalogIndex = String(index);
      const url = slide.dataset.adUrl;
      if (!url || slide.dataset.reelsClickBound === '1') return;
      slide.dataset.reelsClickBound = '1';
      slide.addEventListener('click', (e) => {
        if (e.target.closest('.ad-unmute-btn, .menu-item-actions, .menu-favorite-btn, .ads-reels-slide__title-row')) return;
        const t = e.target;
        const onMedia =
          (t.tagName === 'IMG' &&
            (t.classList.contains('ad-portrait') || t.classList.contains('ad-portrait-bg'))) ||
          t.matches?.('video.ad-video');
        if (!onMedia) return;
        e.preventDefault();
        window.location.assign(url);
      });
    });
  }

  bindClientAdsReelsSlides(root = document) {
    const containers = root.querySelectorAll
      ? root.querySelectorAll('#client-ads-container, #homepage-ads-container')
      : [];
    const scope =
      root.id === 'client-ads-container' || root.id === 'homepage-ads-container'
        ? [root]
        : Array.from(containers);

    scope.forEach((container) => {
      if (!container) return;
      container.classList.add('client-ads-reels');
      this.bindReelsSlideClicks(container.querySelectorAll('.ads-reels-slide'));
    });

    const track = document.getElementById('menu-reels-track');
    if (track) {
      this.bindReelsSlideClicks(track.querySelectorAll(':scope > .ads-reels-slide'));
    }
  }

  async populateAds(forceRepopulate = false) {
    if (forceRepopulate) {
      this.hasPopulatedHome = false;
      this.hasPopulatedFront = false;
      this.ads = [];
      this.currentDay = null;
    }
    await Promise.all([this.populateHomepage(forceRepopulate), this.populateFrontpage(forceRepopulate)]);
  }

  async init() {
    await this.populateAds(false);
    window.dispatchEvent(
      new CustomEvent('adManagerReady', { detail: { populateAds: (f) => this.populateAds(f) } })
    );
  }
}

let adManagerInstance = null;

function initAdManager() {
  const hasHome = !!document.getElementById('homepage-ads-container');
  const hasFront = !!document.getElementById('frontpage-ads-container') && !document.getElementById('pageadscontainer');

  if (!hasHome && !hasFront) {
    if (adManagerInstance) {
      adManagerInstance = null;
      window.adManager = null;
    }
    return;
  }

  if (adManagerInstance) {
    adManagerInstance.hasPopulatedHome = false;
    adManagerInstance.hasPopulatedFront = false;
    adManagerInstance.ads = [];
    adManagerInstance.currentDay = null;
    adManagerInstance.init();
    return;
  }

  adManagerInstance = new ClientAdManager();
  window.adManager = adManagerInstance;
  adManagerInstance.init();
}

function initClientAdsReelsSlides() {
  if (window.adManager && typeof window.adManager.bindClientAdsReelsSlides === 'function') {
    window.adManager.bindClientAdsReelsSlides(document);
    return;
  }
  const container = document.getElementById('client-ads-container');
  if (!container) return;
  container.classList.add('client-ads-reels');
  container.querySelectorAll('.ads-reels-slide').forEach((slide, index) => {
    if (slide.dataset.catalogIndex == null) slide.dataset.catalogIndex = String(index);
    const url = slide.dataset.adUrl;
    if (!url || slide.dataset.reelsClickBound === '1') return;
    slide.dataset.reelsClickBound = '1';
    slide.addEventListener('click', (e) => {
      if (e.target.closest('.ad-unmute-btn')) return;
      const t = e.target;
      const onMedia =
        (t.tagName === 'IMG' &&
          (t.classList.contains('ad-portrait') || t.classList.contains('ad-portrait-bg'))) ||
        t.matches?.('video.ad-video');
      if (!onMedia) return;
      e.preventDefault();
      window.location.assign(url);
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initAdManager();
    initClientAdsReelsSlides();
  });
} else {
  initAdManager();
  initClientAdsReelsSlides();
}

window.initAdManager = initAdManager;

function registerBarbaAdManager() {
  if (window.TTMSBarba) {
    window.TTMSBarba.register(function () {
      setTimeout(() => {
        initAdManager();
        initClientAdsReelsSlides();
      }, 100);
    });
  }
}

if (window.TTMSBarba) {
  registerBarbaAdManager();
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', registerBarbaAdManager);
} else {
  registerBarbaAdManager();
}
