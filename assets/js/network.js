/* ═══════════════════════════════════════════════════════════════
   network.js — living service mesh
   Drifting nodes, proximity edges, and message pulses that hop
   node-to-node the way traffic moves through a distributed system:
   a pulse arrives, the node flashes, then fans the message out to
   a couple of neighbours until its hop budget runs out.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var canvas = document.getElementById('net-bg');
  if (!canvas) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    canvas.style.display = 'none';
    return;
  }

  var ctx = canvas.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  var W = 0, H = 0;
  var nodes = [];
  var pulses = [];
  var adj = [];            // adjacency: array of arrays of node indices
  var LINK_DIST = 170;     // px, recalculated on resize
  var MAX_PULSES = 90;
  var mouse = { x: -9999, y: -9999, active: false };
  var scrollY = 0, scrollTarget = 0;
  var running = true;
  var frames = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function nodeCount() {
    var area = window.innerWidth * window.innerHeight;
    return Math.round(Math.min(110, Math.max(34, area / 15000)));
  }

  function build() {
    var n = nodeCount();
    nodes = [];
    for (var i = 0; i < n; i++) {
      nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: rand(-0.14, 0.14),
        vy: rand(-0.14, 0.14),
        r: rand(1.1, 2.6),
        // a few nodes are "services" — bigger, brighter, ring-drawn
        hub: Math.random() < 0.13,
        flash: 0,
        phase: Math.random() * Math.PI * 2
      });
    }
    pulses = [];
    adj = nodes.map(function () { return []; });
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    LINK_DIST = Math.min(200, Math.max(120, Math.sqrt(W * H) / 6.2));
    build();
  }

  function rebuildAdjacency() {
    for (var i = 0; i < nodes.length; i++) adj[i].length = 0;
    var d2max = LINK_DIST * LINK_DIST;
    for (var a = 0; a < nodes.length; a++) {
      for (var b = a + 1; b < nodes.length; b++) {
        var dx = nodes[a].x - nodes[b].x;
        var dy = nodes[a].y - nodes[b].y;
        if (dx * dx + dy * dy < d2max) {
          adj[a].push(b);
          adj[b].push(a);
        }
      }
    }
  }

  function spawnPulse(from, to, hops) {
    if (pulses.length >= MAX_PULSES) return;
    pulses.push({
      a: from, b: to, t: 0,
      speed: rand(0.006, 0.014),
      hops: hops,
      hue: Math.random() < 0.22 ? 1 : 0   // 1 = warm accent packet
    });
  }

  function seed() {
    if (!nodes.length) return;
    var i = (Math.random() * nodes.length) | 0;
    var nbrs = adj[i];
    if (!nbrs || !nbrs.length) return;
    spawnPulse(i, nbrs[(Math.random() * nbrs.length) | 0], 3 + ((Math.random() * 3) | 0));
  }

  function step(dt) {
    var i, n;

    // ── drift + mouse repulsion ──
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      n.phase += dt * 0.0012;
      n.x += (n.vx + Math.cos(n.phase) * 0.05) * dt * 0.06;
      n.y += (n.vy + Math.sin(n.phase * 0.8) * 0.05) * dt * 0.06;

      if (mouse.active) {
        var dx = n.x - mouse.x, dy = n.y - mouse.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 150 && d > 0.01) {
          var push = (1 - d / 150) * 0.9;
          n.x += (dx / d) * push;
          n.y += (dy / d) * push;
        }
      }

      // wrap with a margin so nodes reappear smoothly
      if (n.x < -60) n.x = W + 60; else if (n.x > W + 60) n.x = -60;
      if (n.y < -60) n.y = H + 60; else if (n.y > H + 60) n.y = -60;

      if (n.flash > 0) n.flash = Math.max(0, n.flash - dt * 0.0022);
    }

    // ── advance pulses, fan out on arrival ──
    for (i = pulses.length - 1; i >= 0; i--) {
      var p = pulses[i];
      p.t += p.speed * dt * 0.06;
      if (p.t >= 1) {
        var arrived = nodes[p.b];
        if (arrived) arrived.flash = 1;
        if (p.hops > 0) {
          var nbrs = adj[p.b];
          if (nbrs && nbrs.length) {
            var fan = Math.random() < 0.34 ? 2 : 1;
            for (var f = 0; f < fan; f++) {
              var next = nbrs[(Math.random() * nbrs.length) | 0];
              if (next !== p.a) spawnPulse(p.b, next, p.hops - 1);
            }
          }
        }
        pulses.splice(i, 1);
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var d2max = LINK_DIST * LINK_DIST;
    var i, j, a, b, dx, dy, d2, alpha;

    // ── edges ──
    ctx.lineWidth = 0.7;
    for (i = 0; i < nodes.length; i++) {
      a = nodes[i];
      for (j = i + 1; j < nodes.length; j++) {
        b = nodes[j];
        dx = a.x - b.x; dy = a.y - b.y;
        d2 = dx * dx + dy * dy;
        if (d2 > d2max) continue;
        alpha = (1 - Math.sqrt(d2) / LINK_DIST) * 0.28;

        // edges near the cursor light up
        if (mouse.active) {
          var mx = (a.x + b.x) * 0.5 - mouse.x;
          var my = (a.y + b.y) * 0.5 - mouse.y;
          var md = Math.sqrt(mx * mx + my * my);
          if (md < 230) alpha += (1 - md / 230) * 0.42;
        }
        var lit = Math.max(a.flash, b.flash);
        if (lit > 0) alpha += lit * 0.35;

        ctx.strokeStyle = 'rgba(126,196,222,' + alpha.toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // ── pulses (with a short comet trail) ──
    ctx.lineCap = 'round';
    for (i = 0; i < pulses.length; i++) {
      var p = pulses[i];
      a = nodes[p.a]; b = nodes[p.b];
      if (!a || !b) continue;
      var e = p.t < 0.5 ? 2 * p.t * p.t : 1 - Math.pow(-2 * p.t + 2, 2) / 2; // easeInOutQuad
      var x = a.x + (b.x - a.x) * e;
      var y = a.y + (b.y - a.y) * e;
      var tail = Math.max(0, e - 0.16);
      var tx = a.x + (b.x - a.x) * tail;
      var ty = a.y + (b.y - a.y) * tail;

      var col = p.hue ? '255,179,122' : '94,231,196';
      var g = ctx.createLinearGradient(tx, ty, x, y);
      g.addColorStop(0, 'rgba(' + col + ',0)');
      g.addColorStop(1, 'rgba(' + col + ',0.85)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(' + col + ',0.95)';
      ctx.beginPath();
      ctx.arc(x, y, 1.9, 0, Math.PI * 2);
      ctx.fill();

      var halo = ctx.createRadialGradient(x, y, 0, x, y, 11);
      halo.addColorStop(0, 'rgba(' + col + ',0.30)');
      halo.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 0.7;

    // ── nodes ──
    for (i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var f = n.flash;
      var rr = n.r * (n.hub ? 1.7 : 1) + f * 1.6;

      if (f > 0.02) {
        var ring = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 24 * f + 6);
        ring.addColorStop(0, 'rgba(94,231,196,' + (0.34 * f).toFixed(3) + ')');
        ring.addColorStop(1, 'rgba(94,231,196,0)');
        ctx.fillStyle = ring;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 24 * f + 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = n.hub
        ? 'rgba(166,214,255,' + (0.55 + f * 0.45).toFixed(3) + ')'
        : 'rgba(150,186,214,' + (0.34 + f * 0.6).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(n.x, n.y, rr, 0, Math.PI * 2);
      ctx.fill();

      if (n.hub) {
        ctx.strokeStyle = 'rgba(94,231,196,' + (0.22 + f * 0.5).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(n.x, n.y, rr + 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  var last = performance.now();
  var seedTimer = 0;

  function loop(now) {
    if (!running) return;
    var dt = Math.min(48, now - last);
    last = now;
    frames++;

    scrollTarget = window.scrollY;
    scrollY += (scrollTarget - scrollY) * 0.08;
    // parallax: the mesh drifts slower than the page
    canvas.style.transform = 'translate3d(0,' + (scrollY * 0.06).toFixed(2) + 'px,0)';

    if (frames % 8 === 0) rebuildAdjacency();

    seedTimer += dt;
    if (seedTimer > 420) { seedTimer = 0; seed(); if (Math.random() < 0.4) seed(); }

    step(dt);
    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', function () {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    resize();
    rebuildAdjacency();
  }, { passive: true });

  window.addEventListener('pointermove', function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  }, { passive: true });

  window.addEventListener('pointerleave', function () { mouse.active = false; }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running) { last = performance.now(); requestAnimationFrame(loop); }
  });

  resize();
  rebuildAdjacency();
  for (var s = 0; s < 6; s++) seed();
  requestAnimationFrame(loop);
})();
