/**
 * Share buttons — event delegation (Barba-safe).
 */
(function () {
  'use strict';

  function showShareNotification(message) {
    var notification = document.createElement('div');
    notification.className = 'share-notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(function () {
      notification.classList.add('show');
    }, 10);
    setTimeout(function () {
      notification.classList.remove('show');
      setTimeout(function () {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 6000);
  }

  function fallbackShare(title, url) {
    var shareText = title + '\n\n' + url;
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(shareText)
        .then(function () {
          showShareNotification('Link copied to clipboard!');
        })
        .catch(function () {
          showShareNotification('Unable to copy. URL: ' + url);
        });
      return;
    }
    var textArea = document.createElement('textarea');
    textArea.value = shareText;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showShareNotification('Link copied to clipboard!');
    } catch (err) {
      showShareNotification('Unable to copy. URL: ' + url);
    }
    document.body.removeChild(textArea);
  }

  function shareContent(title, url) {
    if (navigator.share) {
      navigator
        .share({ title: title, text: title, url: url })
        .catch(function (error) {
          if (error.name !== 'AbortError') {
            fallbackShare(title, url);
          }
        });
    } else {
      fallbackShare(title, url);
    }
  }

  function bindShareButtons() {
    if (document.documentElement.dataset.ttmsShareBound === '1') {
      return;
    }
    document.documentElement.dataset.ttmsShareBound = '1';
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.js-share-btn');
      if (!btn) {
        return;
      }
      e.preventDefault();
      shareContent(
        btn.dataset.shareTitle || document.title || '',
        btn.dataset.shareUrl || window.location.href
      );
    });
  }

  bindShareButtons();

  if (window.TTMSBarba) {
    window.TTMSBarba.register(bindShareButtons);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (window.TTMSBarba) {
        window.TTMSBarba.register(bindShareButtons);
      }
    });
  }
})();
