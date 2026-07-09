(function () {
  'use strict';

  var sectionHandlers = [];

  function initSectionScroll() {
    sectionHandlers.forEach(function (entry) {
      if (entry.leftBtn) {
        entry.leftBtn.removeEventListener('click', entry.onLeft);
      }
      if (entry.rightBtn) {
        entry.rightBtn.removeEventListener('click', entry.onRight);
      }
    });
    sectionHandlers = [];

    document.querySelectorAll('section').forEach(function (section) {
      var ul = section.querySelector('.inner');
      if (!ul) return;

      var items = ul.querySelectorAll('li');
      if (!items.length) return;

      var leftBtn = section.querySelector('.l-btn');
      var rightBtn = section.querySelector('.r-btn');
      if (!leftBtn || !rightBtn) return;

      var currentIndex = 0;

      if (items.length <= 1) {
        leftBtn.style.display = 'none';
        rightBtn.style.display = 'none';
      } else {
        leftBtn.style.display = '';
        rightBtn.style.display = '';
      }

      function updateScroll() {
        ul.scrollTo({
          left: items[currentIndex].offsetLeft,
          behavior: 'smooth',
        });
      }

      function onLeft() {
        currentIndex = (currentIndex - 1 + items.length) % items.length;
        updateScroll();
      }

      function onRight() {
        currentIndex = (currentIndex + 1) % items.length;
        updateScroll();
      }

      leftBtn.addEventListener('click', onLeft);
      rightBtn.addEventListener('click', onRight);
      sectionHandlers.push({ leftBtn: leftBtn, rightBtn: rightBtn, onLeft: onLeft, onRight: onRight });
    });
  }

  window.initSectionScroll = initSectionScroll;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSectionScroll);
  } else {
    initSectionScroll();
  }

  if (window.TTMSBarba) {
    window.TTMSBarba.register(initSectionScroll);
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      if (window.TTMSBarba) {
        window.TTMSBarba.register(initSectionScroll);
      }
    });
  }
})();
