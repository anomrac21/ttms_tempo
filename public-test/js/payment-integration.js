/**
 * TTMenus Payment Integration
 * Connects menu checkout to payment-service (POST /pay, GET /status/:id).
 * Paid orders are tracked locally and verified against the service store (Redis/Kafka-backed).
 */
(function () {
  'use strict';

  if (typeof window.PaymentIntegration !== 'undefined') {
    return;
  }

  var STORAGE_PAID = 'ttms_paid_orders_v1';
  var STORAGE_PENDING = 'ttms_payment_pending_v1';

  function cfg() {
    return window.PAYMENT_CONFIG || {};
  }

  function isEnabled() {
    var c = cfg();
    return !!(c.enabled && c.apiUrl);
  }

  function apiHeaders() {
    var c = cfg();
    var headers = { 'Content-Type': 'application/json' };
    if (c.apiKey) {
      headers['X-API-Key'] = c.apiKey;
    }
    return headers;
  }

  function apiBase() {
    return String(cfg().apiUrl || '').replace(/\/+$/, '');
  }

  function readPaidMap() {
    try {
      var raw = sessionStorage.getItem(STORAGE_PAID) || localStorage.getItem(STORAGE_PAID);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function writePaidMap(map) {
    var json = JSON.stringify(map || {});
    try {
      sessionStorage.setItem(STORAGE_PAID, json);
    } catch (_) { /* ignore */ }
    try {
      localStorage.setItem(STORAGE_PAID, json);
    } catch (_) { /* ignore */ }
  }

  function readPending() {
    try {
      var raw = sessionStorage.getItem(STORAGE_PENDING);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writePending(data) {
    if (!data) {
      sessionStorage.removeItem(STORAGE_PENDING);
      return;
    }
    sessionStorage.setItem(STORAGE_PENDING, JSON.stringify(data));
  }

  function originBase() {
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      return window.location.origin.replace(/\/+$/, '');
    }
    return String(cfg().siteOrigin || '').replace(/\/+$/, '');
  }

  function successUrl() {
    var c = cfg();
    return c.successUrl || originBase() + '/payment/success/';
  }

  function cancelUrl() {
    var c = cfg();
    return c.cancelUrl || originBase() + '/payment/cancel/';
  }

  function hashString(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
  }

  function buildIdempotencyKey(context) {
    if (context && context.idempotencyKey) {
      return context.idempotencyKey;
    }
    var clientId = cfg().clientId || 'ttmenus';
    var payload = [
      clientId,
      context && context.amount,
      context && context.location,
      context && context.orderMode,
      context && context.tableNumber,
      JSON.stringify(context && context.items ? context.items.map(function (i) {
        return [i.item, i.quantity, i.price].join(':');
      }) : [])
    ].join('|');
    return clientId + '-order-' + hashString(payload);
  }

  function markPaid(record) {
    if (!record || !record.idempotencyKey) return;
    var map = readPaidMap();
    map[record.idempotencyKey] = {
      paymentId: record.paymentId,
      status: record.status || 'succeeded',
      amount: record.amount,
      currency: record.currency || 'TTD',
      paidAt: record.paidAt || new Date().toISOString()
    };
    writePaidMap(map);
  }

  function isLocallyPaid(idempotencyKey) {
    if (!idempotencyKey) return false;
    var entry = readPaidMap()[idempotencyKey];
    return !!(entry && entry.status === 'succeeded');
  }

  function setModalState(state, message) {
    var modal = document.getElementById('paymentModal');
    var statusEl = document.getElementById('paymentModalStatus');
    var actionsEl = document.getElementById('paymentModalActions');
    var summaryEl = document.getElementById('paymentModalSummary');
    if (statusEl) {
      statusEl.textContent = message || '';
      statusEl.className = 'payment-modal__status payment-modal__status--' + (state || 'idle');
    }
    if (actionsEl) {
      actionsEl.classList.toggle('hide', state === 'processing' || state === 'redirecting');
    }
    if (summaryEl) {
      summaryEl.classList.toggle('hide', state === 'redirecting');
    }
    if (modal) {
      modal.classList.toggle('hide', false);
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeModal() {
    var modal = document.getElementById('paymentModal');
    if (!modal) return;
    modal.classList.add('hide');
    modal.setAttribute('aria-hidden', 'true');
  }

  function showModal() {
    var modal = document.getElementById('paymentModal');
    if (!modal) return;
    modal.classList.remove('hide');
    modal.setAttribute('aria-hidden', 'false');
  }

  function updateModalSummary(context) {
    var amountEl = document.getElementById('paymentModalAmount');
    var detailEl = document.getElementById('paymentModalDetails');
    if (amountEl && context) {
      amountEl.textContent = '$' + Number(context.amount).toFixed(2) + ' ' + (context.currency || 'TTD');
    }
    if (detailEl && context) {
      var parts = [];
      if (context.location) parts.push(context.location);
      if (context.orderMode) parts.push(context.orderMode);
      if (context.tableNumber) parts.push('Table #' + context.tableNumber);
      detailEl.textContent = parts.join(' · ');
    }
  }

  function submitHostedForm(payment) {
    if (!payment || !payment.form_action || !payment.form_fields) {
      throw new Error('Payment gateway did not return a hosted form');
    }
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = payment.form_action;
    form.style.display = 'none';
    Object.keys(payment.form_fields).forEach(function (key) {
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = payment.form_fields[key];
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  function redirectToUrl(url) {
    if (!url) return;
    window.location.href = url;
  }

  async function fetchStatus(paymentId) {
    var res = await fetch(apiBase() + '/status/' + encodeURIComponent(paymentId), {
      method: 'GET',
      headers: apiHeaders()
    });
    if (!res.ok) {
      var errBody = await res.json().catch(function () { return {}; });
      throw new Error((errBody && errBody.error) || ('Status check failed (' + res.status + ')'));
    }
    return res.json();
  }

  async function createPayment(context) {
    var idempotencyKey = buildIdempotencyKey(context);
    var body = {
      amount: Number(context.amount).toFixed(2),
      currency: context.currency || cfg().currency || 'TTD',
      provider: cfg().provider || '',
      return_url: successUrl(),
      cancel_url: cancelUrl(),
      description: context.description || 'Menu order',
      customer_ref: cfg().clientId || '',
      idempotency_key: idempotencyKey,
      metadata: {
        flow: 'menu_order',
        client_id: cfg().clientId || '',
        location: context.location || '',
        order_mode: context.orderMode || '',
        table_number: context.tableNumber || ''
      }
    };
    if (!body.provider) {
      delete body.provider;
    }

    var res = await fetch(apiBase() + '/pay', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      throw new Error((err && err.error) || ('Payment request failed (' + res.status + ')'));
    }
    var payment = await res.json();
    return { payment: payment, idempotencyKey: idempotencyKey };
  }

  async function verifyPaid(idempotencyKey, paymentId) {
    if (isLocallyPaid(idempotencyKey)) {
      return true;
    }
    if (!paymentId) {
      return false;
    }
    try {
      var status = await fetchStatus(paymentId);
      if (status && status.status === 'succeeded') {
        markPaid({
          idempotencyKey: idempotencyKey,
          paymentId: paymentId,
          status: status.status,
          amount: status.amount && status.amount.value,
          currency: status.amount && status.amount.currency
        });
        return true;
      }
    } catch (e) {
      console.warn('Payment status check failed:', e);
    }
    return false;
  }

  var PaymentIntegration = {
    isEnabled: isEnabled,

    getOrderPaymentContext: function () {
      var locationSelect = document.getElementById('locationSelect');
      var selectedLocation = locationSelect
        ? locationSelect.options[locationSelect.selectedIndex]
        : null;
      var total = 0;
      if (typeof price !== 'undefined') {
        total = price + (typeof vatcost !== 'undefined' ? vatcost : 0) + (typeof servicecost !== 'undefined' ? servicecost : 0);
      }
      var items = typeof order !== 'undefined' && Array.isArray(order) ? order : [];
      return {
        amount: total,
        currency: cfg().currency || 'TTD',
        location: selectedLocation ? selectedLocation.text : '',
        orderMode: typeof currentOrderType !== 'undefined' ? currentOrderType : (typeof currentMode !== 'undefined' ? currentMode : ''),
        tableNumber: typeof currentTableNumber !== 'undefined' ? currentTableNumber : (typeof myTable !== 'undefined' ? myTable : ''),
        items: items,
        description: (typeof name !== 'undefined' ? name : 'Menu') + ' order'
      };
    },

    isCurrentOrderPaid: async function (context) {
      if (!isEnabled()) return true;
      context = context || this.getOrderPaymentContext();
      var key = buildIdempotencyKey(context);
      if (isLocallyPaid(key)) return true;
      var pending = readPending();
      if (pending && pending.idempotencyKey === key && pending.paymentId) {
        return verifyPaid(key, pending.paymentId);
      }
      return false;
    },

    startCheckout: async function (context, onSuccess) {
      if (!isEnabled()) {
        if (typeof onSuccess === 'function') onSuccess();
        return true;
      }
      context = context || this.getOrderPaymentContext();
      if (!context.amount || Number(context.amount) <= 0) {
        alert('Your cart total must be greater than zero to pay online.');
        return false;
      }

      var idempotencyKey = buildIdempotencyKey(context);
      if (await this.isCurrentOrderPaid(context)) {
        if (typeof onSuccess === 'function') onSuccess();
        return true;
      }

      showModal();
      updateModalSummary(context);
      setModalState('processing', 'Connecting to secure payment…');

      try {
        var result = await createPayment(context);
        var payment = result.payment;
        writePending({
          idempotencyKey: idempotencyKey,
          paymentId: payment.payment_id,
          amount: context.amount,
          currency: context.currency || 'TTD',
          returnPath: window.location.pathname + window.location.search,
          onSuccess: null
        });

        if (payment.status === 'succeeded') {
          markPaid({
            idempotencyKey: idempotencyKey,
            paymentId: payment.payment_id,
            status: payment.status,
            amount: context.amount,
            currency: context.currency
          });
          writePending(null);
          closeModal();
          if (typeof window.trackPaymentEvent === 'function') {
            window.trackPaymentEvent('Checkout Success', payment.payment_id, context.amount);
          }
          if (typeof onSuccess === 'function') onSuccess();
          return true;
        }

        if (payment.redirect_url) {
          setModalState('redirecting', 'Redirecting to payment provider…');
          redirectToUrl(payment.redirect_url);
          return false;
        }

        if (payment.form_action && payment.form_fields) {
          setModalState('redirecting', 'Opening secure payment form…');
          submitHostedForm(payment);
          return false;
        }

        throw new Error('Unsupported payment response from server');
      } catch (err) {
        if (typeof window.trackPaymentEvent === 'function') {
          window.trackPaymentEvent('Checkout Error', err && err.message ? err.message : 'unknown');
        }
        console.error('Payment checkout failed:', err);
        setModalState('error', err.message || 'Payment failed. Please try again.');
        return false;
      }
    },

    ensurePaidBeforeOrder: async function (context, onSuccess) {
      if (!isEnabled()) {
        if (typeof onSuccess === 'function') onSuccess();
        return true;
      }
      var paid = await this.isCurrentOrderPaid(context);
      if (paid) {
        if (typeof onSuccess === 'function') onSuccess();
        return true;
      }
      return this.startCheckout(context, onSuccess);
    },

    handleReturnPage: async function () {
      if (!isEnabled()) return;
      var path = window.location.pathname || '';
      var isSuccess = path.indexOf('/payment/success') !== -1;
      var isCancel = path.indexOf('/payment/cancel') !== -1;
      if (!isSuccess && !isCancel) return;

      var pending = readPending();
      var params = new URLSearchParams(window.location.search);
      var paymentId = params.get('payment_id') || (pending && pending.paymentId) || '';

      if (isCancel) {
        writePending(null);
        if (typeof window.trackPaymentEvent === 'function') {
          window.trackPaymentEvent('Checkout Cancel');
        }
        var cancelMsg = document.getElementById('paymentReturnMessage');
        if (cancelMsg) cancelMsg.textContent = 'Payment was cancelled. You can return to your cart and try again.';
        return;
      }

      var statusEl = document.getElementById('paymentReturnMessage');
      var continueBtn = document.getElementById('paymentReturnContinue');
      if (statusEl) statusEl.textContent = 'Verifying your payment…';

      var idempotencyKey = pending && pending.idempotencyKey;
      var verified = false;

      if (paymentId) {
        try {
          var status = await fetchStatus(paymentId);
          if (status && status.status === 'succeeded') {
            markPaid({
              idempotencyKey: idempotencyKey || buildIdempotencyKey({ idempotencyKey: status.metadata && status.metadata.order_ref }),
              paymentId: paymentId,
              status: status.status,
              amount: status.amount && status.amount.value,
              currency: status.amount && status.amount.currency
            });
            verified = true;
          } else if (status && status.status === 'requires_action') {
            if (statusEl) statusEl.textContent = 'Payment is still processing. Please wait a moment and refresh.';
          } else {
            if (statusEl) statusEl.textContent = 'Payment was not completed. Status: ' + (status && status.status);
          }
        } catch (e) {
          if (statusEl) statusEl.textContent = 'Could not verify payment: ' + e.message;
        }
      }

      if (verified) {
        writePending(null);
        if (typeof window.trackPaymentEvent === 'function') {
          window.trackPaymentEvent('Return Success', paymentId);
        }
        if (statusEl) statusEl.textContent = 'Payment successful! You can complete your order.';
        if (continueBtn) {
          continueBtn.classList.remove('hide');
          continueBtn.onclick = function () {
            var target = (pending && pending.returnPath) || '/';
            window.location.href = target;
          };
        }
      }
    },

    closeModal: closeModal,
    markPaid: markPaid,
    isLocallyPaid: isLocallyPaid,
    buildIdempotencyKey: buildIdempotencyKey
  };

  window.PaymentIntegration = PaymentIntegration;
  window.closePaymentModal = closeModal;

  document.addEventListener('DOMContentLoaded', function () {
    PaymentIntegration.handleReturnPage();
  });
})();
