const APP = {
deferredInstall: null,

  isStandalonePWA() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  },

  isIOSInstallContext() {
    const uaIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return uaIOS || ('standalone' in window.navigator);
  },

  setInstallButtonVisible(btn, visible) {
    if (!btn) return;
    btn.classList.toggle('hide', !visible);
    btn.setAttribute('aria-hidden', visible ? 'false' : 'true');
    btn.tabIndex = visible ? 0 : -1;
  },

  updateInstallButtons() {
    const installBtn = document.getElementById('btn_install1');
    const subInfoBtn = document.getElementById('btn_SubInfo');
    const row = document.querySelector('.subscribe--install');
    if (!installBtn || !subInfoBtn) return;

    if (APP.isStandalonePWA()) {
      APP.setInstallButtonVisible(installBtn, false);
      APP.setInstallButtonVisible(subInfoBtn, false);
      if (row) row.classList.add('hide');
      return;
    }

    const showNativeInstall = !!APP.deferredInstall;
    const showIOSInstructions = !showNativeInstall && APP.isIOSInstallContext();

    APP.setInstallButtonVisible(installBtn, showNativeInstall);
    APP.setInstallButtonVisible(subInfoBtn, showIOSInstructions);

    if (row) {
      row.classList.toggle('hide', !(showNativeInstall || showIOSInstructions));
    }
  },

  init() {

    
    if ('serviceWorker' in navigator) {
    
      //listen for `beforeinstallprompt` event
      window.addEventListener('beforeinstallprompt', (ev) => {
        ev.preventDefault();
        APP.deferredInstall = ev;
        APP.updateInstallButtons();
      });

      const installBtn = document.getElementById('btn_install1');
      if (installBtn) {
        installBtn.addEventListener('click', APP.startChromeInstall);
      }
    }//END SERVICE WORKER CHECK

    APP.updateInstallButtons();
    
    // Initialize slideshow if it exists on the page
    APP.initSlideshow();
  },//END INIT

  startChromeInstall() {
    if (APP.deferredInstall) {
      APP.deferredInstall.prompt();
      APP.deferredInstall.userChoice.then((choice) => {
        if (choice.outcome == 'accepted') {
          APP.deferredInstall = null;
          APP.updateInstallButtons();
        }
      });
    }
  },

  // Slideshow functionality
  slideshow: {
    currentSlideIndex: 0,
    slideInterval: null,
    _container: null,
    _onMouseEnter: null,
    _onMouseLeave: null,

    destroy() {
      this.pauseAutoPlay();
      if (this._container) {
        if (this._onMouseEnter) {
          this._container.removeEventListener('mouseenter', this._onMouseEnter);
        }
        if (this._onMouseLeave) {
          this._container.removeEventListener('mouseleave', this._onMouseLeave);
        }
      }
      this._container = null;
      this._onMouseEnter = null;
      this._onMouseLeave = null;
      this.currentSlideIndex = 0;
    },

    init() {
      this.destroy();

      const slideshowContainer = document.querySelector('.slideshow-container');
      if (!slideshowContainer) {
        return;
      }

      const slides = slideshowContainer.querySelectorAll('.slide');
      if (!slides.length) {
        return;
      }

      this._container = slideshowContainer;
      this.currentSlideIndex = 0;
      this.showSlide(0);

      this._onMouseEnter = () => this.pauseAutoPlay();
      this._onMouseLeave = () => this.startAutoPlay();
      slideshowContainer.addEventListener('mouseenter', this._onMouseEnter);
      slideshowContainer.addEventListener('mouseleave', this._onMouseLeave);

      this.startAutoPlay();
    },

    showSlide(index) {
      const container = this._container;
      if (!container || !container.isConnected) {
        this.pauseAutoPlay();
        return;
      }

      const slides = container.querySelectorAll('.slide');
      const dots = container.querySelectorAll('.dot');
      if (!slides.length) {
        this.pauseAutoPlay();
        return;
      }

      if (index >= slides.length) {
        this.currentSlideIndex = 0;
      } else if (index < 0) {
        this.currentSlideIndex = slides.length - 1;
      } else {
        this.currentSlideIndex = index;
      }

      slides.forEach(function (slide) {
        slide.classList.remove('active');
      });
      dots.forEach(function (dot) {
        dot.classList.remove('active');
      });

      var activeSlide = slides[this.currentSlideIndex];
      if (activeSlide) {
        activeSlide.classList.add('active');
      }
      var activeDot = dots[this.currentSlideIndex];
      if (activeDot) {
        activeDot.classList.add('active');
      }
    },

    changeSlide(direction) {
      if (!this._container || !this._container.isConnected) {
        this.pauseAutoPlay();
        return;
      }
      var newIndex = this.currentSlideIndex + direction;
      this.showSlide(newIndex);
      this.resetInterval();
    },

    currentSlide(index) {
      this.currentSlideIndex = index - 1;
      this.showSlide(this.currentSlideIndex);
      this.resetInterval();
    },

    resetInterval() {
      this.pauseAutoPlay();
      this.startAutoPlay();
    },

    startAutoPlay() {
      this.pauseAutoPlay();
      if (!this._container || !this._container.isConnected) {
        return;
      }
      if (!this._container.querySelectorAll('.slide').length) {
        return;
      }
      var self = this;
      this.slideInterval = setInterval(function () {
        self.changeSlide(1);
      }, 5000);
    },

    pauseAutoPlay() {
      if (this.slideInterval) {
        clearInterval(this.slideInterval);
        this.slideInterval = null;
      }
    },
  },

  initSlideshow() {
    this.slideshow.destroy();
    const slideshowContainer = document.querySelector('.slideshow-container');
    if (slideshowContainer) {
      this.slideshow.init();
    }
  },

};//END CONST APP
document.addEventListener('DOMContentLoaded', APP.init);

// Global slideshow functions for onclick handlers
function changeSlide(direction) {
  APP.slideshow.changeSlide(direction);
}

function currentSlide(index) {
  APP.slideshow.currentSlide(index);
}


function expandAppMenu() {
    try {
      var subBtnItems = document.getElementById("SubBtnItems");
      if(!subBtnItems || !subBtnItems.classList) {
        console.warn('SubBtnItems element not found or missing classList');
        return;
      }
      
      // Check if it's an Apple device (iOS)
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const iOSIsInstalled = window.navigator.standalone === true;
      
      if(subBtnItems.classList.contains('hide')){
        subBtnItems.classList.remove('hide');
        
        // Always reset to first slide when opening
        if(typeof showAppleMsg === 'function') {
          showAppleMsg(0); // Show first step
        }
        
        // If it's iOS and not installed, show Apple instructions
        if(isIOS && !iOSIsInstalled) {
          var appleMessage = document.getElementById("appleMessage");
          if(appleMessage && appleMessage.classList) {
            appleMessage.classList.remove('appleInstallHide');
          }
        }
      } else {
        subBtnItems.classList.add('hide');
        
        // Hide Apple message when closing
        var appleMessage = document.getElementById("appleMessage");
        if(appleMessage && appleMessage.classList) {
          appleMessage.classList.add('appleInstallHide');
        }
      }
    } catch(error) {
      console.error('Error in expandAppMenu:', error);
    }
  }

function showAppleMsg(x) {
    var msg = document.getElementsByClassName("msg");
    for (var i = msg.length - 1; i >= 0; i--) {
      if(x==i){
        msg[i].classList.remove('hide');
      }else{
        msg[i].classList.add('hide');
      }
      
    }
  }

  // Function to reload app.js functionality after DOM changes
  function reloadAppJS() {
    console.log('reloadAppJS called');
    
    if (typeof APP !== 'undefined' && typeof APP.updateInstallButtons === 'function') {
      APP.updateInstallButtons();
    }
    
    // Tear down slideshow from previous page, then init on the new page if present
    if (APP.slideshow) {
      APP.slideshow.destroy();
      const slideshowContainer = document.querySelector('.slideshow-container');
      if (slideshowContainer) {
        APP.slideshow.init();
      }
    }
  }

  window.reloadAppJS = reloadAppJS;
