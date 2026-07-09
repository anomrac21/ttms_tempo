/**
 * Canvas touch particles — menu public pages only, minimal CPU/GPU.
 */
(function () {
  'use strict';

  if (window.__ttmsTapParticlesLoaded) return;
  window.__ttmsTapParticlesLoaded = true;

  var TAU = Math.PI * 2;
  var TAP_COUNT = 7;
  var TRAIL_COUNT = 2;
  var SPARK_COUNT = 5;
  var MOVE_SQ = 144;
  var STEP_SQ = 196;
  var SCROLL_STEP_SQ = 100;
  var MAX_PARTICLES = 48;
  var COLORS = ['#fcd000', '#dfeed4', '#b56024', '#ffffff'];
  var SKIP_SEL = 'input,textarea,select,[contenteditable="true"],#loader';

  var canvas = null;
  var ctx = null;
  var particles = [];
  var pointer = null;
  var pageOff = false;
  var colorA = COLORS[0];
  var colorB = COLORS[1];
  var moveRaf = 0;
  var drawRaf = 0;
  var pendingMove = null;
  var lastFrame = 0;
  var pointerOpts = { passive: true, capture: true };

  function distSq(x, y) {
    return x * x + y * y;
  }

  function refreshPageState() {
    pageOff = false;
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) pageOff = true;
    } catch (e) {}
    if (pageOff) return;
    try {
      var root = getComputedStyle(document.documentElement);
      var a = root.getPropertyValue('--selected-button-color3').trim();
      var b = root.getPropertyValue('--header-bordercolor-1').trim();
      if (a) colorA = a;
      if (b) colorB = b;
    } catch (e2) {}
  }

  function skipTarget(target) {
    return !target || !target.closest || target.closest(SKIP_SEL);
  }

  function skipEvent(e) {
    return pageOff || skipTarget(e.target);
  }

  function pickColor(i) {
    return (i & 1) ? colorB : colorA;
  }

  function ensureCanvas() {
    if (canvas && canvas.isConnected) return ctx;
    canvas = document.createElement('canvas');
    canvas.className = 'ttms-touch-particles';
    canvas.setAttribute('aria-hidden', 'true');
    ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    document.body.appendChild(canvas);
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });
    return ctx;
  }

  function resizeCanvas() {
    if (!canvas) return;
    var w = window.innerWidth;
    var h = window.innerHeight;
    var dpr = window.devicePixelRatio > 1 ? 2 : 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function pushParticle(x, y, vx, vy, size, life, color, alpha) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({
      x: x,
      y: y,
      vx: vx,
      vy: vy,
      size: size,
      life: life,
      max: life,
      color: color,
      alpha: alpha == null ? 1 : alpha,
    });
    scheduleDraw();
  }

  function spawnBurst(x, y) {
    var i;
    var a;
    var sp;
    ensureCanvas();
    pushParticle(x, y, 0, 0, 3.5, 280, colorA, 0.62);
    for (i = 0; i < TAP_COUNT; i += 1) {
      a = TAU * i / TAP_COUNT + (Math.random() - 0.5) * 0.45;
      sp = 1.3 + Math.random() * 2;
      pushParticle(
        x,
        y,
        Math.cos(a) * sp,
        Math.sin(a) * sp,
        2.5 + Math.random() * 2.5,
        400,
        pickColor(i),
        0.52 + Math.random() * 0.18
      );
    }
  }

  function spawnTrail(x, y, vx, vy, idx, scroll) {
    var mag = Math.sqrt(distSq(vx, vy)) || 1;
    var nx = vx / mag;
    var ny = vy / mag;
    var px = -ny;
    var py = nx;
    var i;
    var count = scroll ? TRAIL_COUNT + 1 : TRAIL_COUNT;
    ensureCanvas();
    for (i = 0; i < count; i += 1) {
      pushParticle(
        x + (Math.random() - 0.5) * 6,
        y + (Math.random() - 0.5) * 6,
        nx * (1.2 + Math.random()) + px * (Math.random() - 0.5) * 1.6,
        ny * (1.2 + Math.random()) + py * (Math.random() - 0.5) * 1.6,
        3 + Math.random() * 2.5,
        scroll ? 520 : 420,
        pickColor(idx + i)
      );
    }
  }

  function spawnSpark(x, y, vx, vy) {
    var mag = Math.sqrt(distSq(vx, vy)) || 1;
    var nx = vx / mag;
    var ny = vy / mag;
    var i;
    var a;
    var sp;
    ensureCanvas();
    for (i = 0; i < SPARK_COUNT; i += 1) {
      a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 1.2;
      sp = 1.8 + Math.random() * 2.4;
      pushParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 3 + Math.random() * 2, 460, pickColor(i));
    }
  }

  function isScrollMove(vx, vy) {
    var ax = vx < 0 ? -vx : vx;
    var ay = vy < 0 ? -vy : vy;
    return ay >= ax * 0.85;
  }

  function stepSq(vx, vy) {
    return isScrollMove(vx, vy) ? SCROLL_STEP_SQ : STEP_SQ;
  }

  function scheduleDraw() {
    if (drawRaf) return;
    drawRaf = requestAnimationFrame(drawFrame);
  }

  function drawFrame(now) {
    drawRaf = 0;
    if (!particles.length || !ctx) return;

    if (!lastFrame) lastFrame = now;
    var dt = now - lastFrame;
    if (dt > 48) dt = 48;
    lastFrame = now;

    var w = window.innerWidth;
    var h = window.innerHeight;
    var i = particles.length;
    var p;
    var t;

    ctx.clearRect(0, 0, w, h);

    while (i--) {
      p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt * 0.055;
      p.y += p.vy * dt * 0.055;
      t = p.life / p.max;
      ctx.globalAlpha = t * p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.45 + t * 0.55), 0, TAU);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    if (particles.length) scheduleDraw();
    else lastFrame = 0;
  }

  function clearAll() {
    pointer = null;
    pendingMove = null;
    particles.length = 0;
    lastFrame = 0;
    if (moveRaf) {
      cancelAnimationFrame(moveRaf);
      moveRaf = 0;
    }
    if (drawRaf) {
      cancelAnimationFrame(drawRaf);
      drawRaf = 0;
    }
    if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  function onPointerDown(e) {
    if (e.button > 0 || skipEvent(e)) {
      pointer = null;
      return;
    }
    pointer = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      lx: e.clientX,
      ly: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      moved: 0,
      swipe: 0,
      skip: 0,
      idx: 0,
      vx: 0,
      vy: 0,
    };
  }

  function processMove(e) {
    if (!pointer || e.pointerId !== pointer.id || pointer.skip) return;
    if (skipEvent(e)) {
      pointer.skip = 1;
      return;
    }

    var dx = e.clientX - pointer.x0;
    var dy = e.clientY - pointer.y0;
    var sdx = e.clientX - pointer.sx;
    var sdy = e.clientY - pointer.sy;
    var mdx = e.clientX - pointer.lx;
    var mdy = e.clientY - pointer.ly;

    if (!pointer.swipe) {
      if (distSq(dx, dy) <= MOVE_SQ) return;
      pointer.swipe = 1;
      pointer.moved = 1;
    }

    if (distSq(sdx, sdy) >= stepSq(mdx, mdy)) {
      spawnTrail(e.clientX, e.clientY, mdx, mdy, pointer.idx, isScrollMove(mdx, mdy));
      pointer.sx = e.clientX;
      pointer.sy = e.clientY;
      pointer.idx += 1;
    }

    pointer.vx = mdx;
    pointer.vy = mdy;
    pointer.lx = e.clientX;
    pointer.ly = e.clientY;
  }

  function onPointerMove(e) {
    if (!pointer || e.pointerId !== pointer.id) return;
    pendingMove = e;
    if (moveRaf) return;
    moveRaf = requestAnimationFrame(function () {
      moveRaf = 0;
      if (pendingMove) processMove(pendingMove);
      pendingMove = null;
    });
  }

  function onPointerUp(e) {
    if (moveRaf) {
      cancelAnimationFrame(moveRaf);
      moveRaf = 0;
      if (pendingMove && pointer && pendingMove.pointerId === pointer.id) processMove(pendingMove);
      pendingMove = null;
    }
    if (!pointer || e.pointerId !== pointer.id || pointer.skip) {
      pointer = null;
      return;
    }
    if (pointer.swipe && !skipEvent(e)) {
      var vx = pointer.vx;
      var vy = pointer.vy;
      if (distSq(vx, vy) < 16) {
        vx = e.clientX - pointer.x0;
        vy = e.clientY - pointer.y0;
      }
      spawnSpark(e.clientX, e.clientY, vx, vy);
    } else if (!pointer.moved && !skipEvent(e)) {
      spawnBurst(e.clientX, e.clientY);
    }
    pointer = null;
  }

  function onPointerCancel() {
    pointer = null;
    pendingMove = null;
    if (moveRaf) {
      cancelAnimationFrame(moveRaf);
      moveRaf = 0;
    }
  }

  function onPageEnter() {
    refreshPageState();
    resizeCanvas();
  }

  function onPageLeave() {
    clearAll();
  }

  function bindPointer() {
    if (document.documentElement.dataset.ttmsTapParticlesBound === '1') return;
    document.documentElement.dataset.ttmsTapParticlesBound = '1';
    document.addEventListener('pointerdown', onPointerDown, pointerOpts);
    document.addEventListener('pointermove', onPointerMove, pointerOpts);
    document.addEventListener('pointerup', onPointerUp, pointerOpts);
    document.addEventListener('pointercancel', onPointerCancel, pointerOpts);
  }

  function registerBarba() {
    function tryRegister() {
      if (!window.TTMSBarba || window._ttmsTouchParticlesBarbaRegistered) return !!window._ttmsTouchParticlesBarbaRegistered;
      window.TTMSBarba.register(onPageEnter);
      window._ttmsTouchParticlesBarbaRegistered = true;
      return true;
    }
    if (!tryRegister()) {
      var n = 0;
      (function poll() {
        if (tryRegister() || n++ > 50) return;
        setTimeout(poll, 40);
      })();
    }
    document.addEventListener('ttms:page-enter', onPageEnter);
    function leave() { onPageLeave(); }
    ['barba:beforeLeave', 'barba:before'].forEach(function (ev) {
      document.addEventListener(ev, leave);
    });
    if (window.barba && window.barba.hooks) {
      if (window.barba.hooks.beforeLeave) window.barba.hooks.beforeLeave(leave);
      if (window.barba.hooks.before) window.barba.hooks.before(leave);
    }
  }

  function init() {
    refreshPageState();
    bindPointer();
    registerBarba();
  }

  window.reinitTTMSTouchParticles = onPageEnter;
  window.resetTTMSTouchParticles = onPageLeave;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
