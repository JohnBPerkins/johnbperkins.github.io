/* ═══════════════════════════════════════════════════════════════
   network.js — living service mesh
   Drifting nodes, proximity edges, and message pulses that hop
   node-to-node the way traffic moves through a distributed system.

   Performance notes (this runs every frame on whatever machine
   opens the page, so it is built to stay inside the frame budget):
     · edges come from a spatial hash, not an O(n²) sweep
     · edges are stroked as ~5 batched paths, not one path per edge
     · glows are pre-rendered sprites, not per-frame gradient objects
     · a governor watches the real frame time and drops quality tiers,
       switching the whole layer off if even the cheapest tier misses
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var canvas = document.getElementById('net-bg');
  if (!canvas) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    canvas.style.display = 'none';
    return;
  }

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) { canvas.style.display = 'none'; return; }

  /* ── quality tiers ────────────────────────────────────────── */
  var TIERS = [
    { density: 17000, max: 90, link: 190, dprCap: 1.25, halos: true,  pulses: 70 },
    { density: 30000, max: 55, link: 165, dprCap: 1,    halos: true,  pulses: 40 },
    { density: 50000, max: 34, link: 145, dprCap: 1,    halos: false, pulses: 22 }
  ];
  // background.js probes the GPU first (both scripts are deferred, in order).
  // With hardware acceleration off, every clearRect and stroke here runs on the
  // CPU — so the mesh is painted exactly once and then left alone.
  var STATIC = !!window.__noGpu;

  var cores = navigator.hardwareConcurrency || 4;
  var tier = STATIC ? 2 : (cores <= 2 ? 2 : (cores <= 4 ? 1 : 0));
  var T = TIERS[tier];

  var W = 0, H = 0, dpr = 1;
  var nodes = [];
  var pulses = [];
  var adj = [];
  var LINK = T.link;
  var mouse = { x: -9999, y: -9999, active: false };
  var scrollY = 0;
  var running = true;
  var disabled = false;

  /* ── batched edge buckets: 5 alpha levels, one stroke() each ── */
  var BUCKETS = 5, CAP = 6000;
  var bx = [], bn = [];
  for (var q = 0; q < BUCKETS; q++) { bx.push(new Float32Array(CAP * 4)); bn.push(0); }

  /* ── pre-rendered glow sprites (built once per tier) ───────── */
  var GLOW_R = 26, glowMint = null, glowWarm = null, glowNode = null;
  function sprite(rgb, radius, peak) {
    var c = document.createElement('canvas');
    var s = Math.ceil(radius * 2);
    c.width = c.height = s;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(radius, radius, 0, radius, radius, radius);
    grd.addColorStop(0,   'rgba(' + rgb + ',' + peak + ')');
    grd.addColorStop(0.35,'rgba(' + rgb + ',' + (peak * 0.32).toFixed(3) + ')');
    grd.addColorStop(1,   'rgba(' + rgb + ',0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    return c;
  }
  function buildSprites() {
    glowMint = sprite('94,231,196', GLOW_R, 0.55);
    glowWarm = sprite('255,179,122', GLOW_R, 0.55);
    glowNode = sprite('94,231,196', GLOW_R, 0.40);
  }

  /* ── spatial hash ──────────────────────────────────────────── */
  var grid = [], cols = 0, rows = 0;
  function buildGridCells() {
    cols = Math.max(1, Math.ceil((W + 160) / LINK));
    rows = Math.max(1, Math.ceil((H + 160) / LINK));
    grid = new Array(cols * rows);
    for (var i = 0; i < grid.length; i++) grid[i] = [];
  }
  function cellIndex(x, y) {
    var cx = Math.floor((x + 80) / LINK), cy = Math.floor((y + 80) / LINK);
    if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
    if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
    return cy * cols + cx;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function build() {
    var n = Math.round(Math.min(T.max, Math.max(26, (window.innerWidth * window.innerHeight) / T.density)));
    nodes = [];
    for (var i = 0; i < n; i++) {
      nodes.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: rand(-0.14, 0.14), vy: rand(-0.14, 0.14),
        r: rand(1.1, 2.6),
        hub: Math.random() < 0.13,
        flash: 0,
        phase: Math.random() * Math.PI * 2
      });
    }
    pulses = [];
    adj = nodes.map(function () { return []; });
  }

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, T.dprCap);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    LINK = Math.min(T.link, Math.max(110, Math.sqrt(W * H) / 6.4));
    buildGridCells();
    buildSprites();
    build();
  }

  function applyTier(next) {
    tier = next; T = TIERS[tier];
    resize();
    for (var s = 0; s < 4; s++) seed();
  }

  function spawnPulse(from, to, hops) {
    if (pulses.length >= T.pulses) return;
    pulses.push({ a: from, b: to, t: 0, speed: rand(0.006, 0.014), hops: hops, warm: Math.random() < 0.22 });
  }

  function seed() {
    if (!nodes.length) return;
    var i = (Math.random() * nodes.length) | 0;
    var nbrs = adj[i];
    if (!nbrs || !nbrs.length) return;
    spawnPulse(i, nbrs[(Math.random() * nbrs.length) | 0], 3 + ((Math.random() * 3) | 0));
  }

  /* ── one pass: hash, pair, fill adjacency, fill draw buckets ── */
  function linkPass() {
    var i, k, c;
    for (i = 0; i < grid.length; i++) grid[i].length = 0;
    for (i = 0; i < nodes.length; i++) {
      adj[i].length = 0;
      grid[cellIndex(nodes[i].x, nodes[i].y)].push(i);
    }
    for (k = 0; k < BUCKETS; k++) bn[k] = 0;

    var d2max = LINK * LINK;
    // scan self + half the neighbourhood so each pair is visited once
    var OFF = [[0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

    for (var cy = 0; cy < rows; cy++) {
      for (var cx = 0; cx < cols; cx++) {
        var here = grid[cy * cols + cx];
        if (!here.length) continue;
        for (var o = 0; o < 5; o++) {
          var nx = cx + OFF[o][0], ny = cy + OFF[o][1];
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          var there = grid[ny * cols + nx];
          if (!there.length) continue;
          var same = (o === 0);
          for (i = 0; i < here.length; i++) {
            var a = nodes[here[i]];
            for (var j = same ? i + 1 : 0; j < there.length; j++) {
              var bIdx = there[j], aIdx = here[i];
              if (bIdx === aIdx) continue;
              var b = nodes[bIdx];
              var dx = a.x - b.x, dy = a.y - b.y;
              var d2 = dx * dx + dy * dy;
              if (d2 > d2max) continue;

              adj[aIdx].push(bIdx);
              adj[bIdx].push(aIdx);

              var alpha = (1 - Math.sqrt(d2) / LINK) * 0.28;
              if (mouse.active) {
                var mx = (a.x + b.x) * 0.5 - mouse.x, my = (a.y + b.y) * 0.5 - mouse.y;
                var md2 = mx * mx + my * my;
                if (md2 < 52900) alpha += (1 - Math.sqrt(md2) / 230) * 0.42;
              }
              var lit = a.flash > b.flash ? a.flash : b.flash;
              if (lit > 0) alpha += lit * 0.35;

              var bk = (alpha * 7.5) | 0;
              if (bk > BUCKETS - 1) bk = BUCKETS - 1;
              c = bn[bk];
              if (c < CAP) {
                var base = c * 4, arr = bx[bk];
                arr[base] = a.x; arr[base + 1] = a.y; arr[base + 2] = b.x; arr[base + 3] = b.y;
                bn[bk] = c + 1;
              }
            }
          }
        }
      }
    }
  }

  function step(dt) {
    var i, n;
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
      if (n.x < -60) n.x = W + 60; else if (n.x > W + 60) n.x = -60;
      if (n.y < -60) n.y = H + 60; else if (n.y > H + 60) n.y = -60;
      if (n.flash > 0) n.flash = Math.max(0, n.flash - dt * 0.0022);
    }

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
    var i, k;

    // edges: five stroke() calls total
    ctx.lineWidth = 0.7;
    for (k = 0; k < BUCKETS; k++) {
      var count = bn[k];
      if (!count) continue;
      var arr = bx[k];
      ctx.strokeStyle = 'rgba(126,196,222,' + (((k + 0.5) / 7.5).toFixed(3)) + ')';
      ctx.beginPath();
      for (i = 0; i < count; i++) {
        var b4 = i * 4;
        ctx.moveTo(arr[b4], arr[b4 + 1]);
        ctx.lineTo(arr[b4 + 2], arr[b4 + 3]);
      }
      ctx.stroke();
    }

    // pulse trails, batched per colour
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.5;
    for (var pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? 'rgba(255,179,122,.62)' : 'rgba(94,231,196,.62)';
      ctx.beginPath();
      for (i = 0; i < pulses.length; i++) {
        var p = pulses[i];
        if ((p.warm ? 1 : 0) !== pass) continue;
        var a = nodes[p.a], b = nodes[p.b];
        if (!a || !b) continue;
        var e = p.t < 0.5 ? 2 * p.t * p.t : 1 - Math.pow(-2 * p.t + 2, 2) / 2;
        var tail = e - 0.16; if (tail < 0) tail = 0;
        ctx.moveTo(a.x + (b.x - a.x) * tail, a.y + (b.y - a.y) * tail);
        ctx.lineTo(a.x + (b.x - a.x) * e,    a.y + (b.y - a.y) * e);
      }
      ctx.stroke();
    }

    // pulse heads + halos
    for (pass = 0; pass < 2; pass++) {
      ctx.fillStyle = pass ? 'rgba(255,179,122,.95)' : 'rgba(94,231,196,.95)';
      ctx.beginPath();
      for (i = 0; i < pulses.length; i++) {
        var pp = pulses[i];
        if ((pp.warm ? 1 : 0) !== pass) continue;
        var na = nodes[pp.a], nb = nodes[pp.b];
        if (!na || !nb) continue;
        var ee = pp.t < 0.5 ? 2 * pp.t * pp.t : 1 - Math.pow(-2 * pp.t + 2, 2) / 2;
        var x = na.x + (nb.x - na.x) * ee, y = na.y + (nb.y - na.y) * ee;
        ctx.moveTo(x + 1.9, y);
        ctx.arc(x, y, 1.9, 0, Math.PI * 2);
        if (T.halos) {
          ctx.save();
          ctx.globalAlpha = 0.5;
          ctx.drawImage(pass ? glowWarm : glowMint, x - GLOW_R * 0.5, y - GLOW_R * 0.5, GLOW_R, GLOW_R);
          ctx.restore();
        }
      }
      ctx.fill();
    }

    // nodes
    ctx.fillStyle = 'rgba(150,186,214,.38)';
    ctx.beginPath();
    for (i = 0; i < nodes.length; i++) {
      var nn = nodes[i];
      if (nn.hub || nn.flash > 0.02) continue;
      ctx.moveTo(nn.x + nn.r, nn.y);
      ctx.arc(nn.x, nn.y, nn.r, 0, Math.PI * 2);
    }
    ctx.fill();

    for (i = 0; i < nodes.length; i++) {
      var m = nodes[i];
      if (!m.hub && m.flash <= 0.02) continue;
      var f = m.flash;
      var rr = m.r * (m.hub ? 1.7 : 1) + f * 1.6;

      if (f > 0.02 && T.halos) {
        var size = (24 * f + 6) * 2;
        ctx.save();
        ctx.globalAlpha = Math.min(1, f);
        ctx.drawImage(glowNode, m.x - size / 2, m.y - size / 2, size, size);
        ctx.restore();
      }
      ctx.fillStyle = m.hub
        ? 'rgba(166,214,255,' + (0.55 + f * 0.45).toFixed(3) + ')'
        : 'rgba(150,186,214,' + (0.34 + f * 0.6).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(m.x, m.y, rr, 0, Math.PI * 2);
      ctx.fill();

      if (m.hub) {
        ctx.strokeStyle = 'rgba(94,231,196,' + (0.22 + f * 0.5).toFixed(3) + ')';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.arc(m.x, m.y, rr + 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  /* ── frame-time governor ───────────────────────────────────── */
  var samples = new Float32Array(90), sn = 0, filled = false;
  var lastAdjust = 0, warmup = 0;

  function govern(now, dt) {
    if (warmup < 45) { warmup++; return; }
    samples[sn++ % 90] = dt;
    if (sn >= 90) filled = true;
    if (!filled || now - lastAdjust < 2500) return;

    var copy = Array.prototype.slice.call(samples).sort(function (a, b) { return a - b; });
    var med = copy[45];
    window.__meshPerf = { tier: tier, medianFrameMs: +med.toFixed(1), nodes: nodes.length };

    if (med > 23 && tier < TIERS.length - 1) {
      lastAdjust = now; filled = false; sn = 0; warmup = 0;
      applyTier(tier + 1);
      if (tier >= 1) document.body.classList.add('perf-low');
    } else if (med > 32 && tier === TIERS.length - 1) {
      disabled = true;
      canvas.style.display = 'none';
      document.body.classList.add('perf-low');
      window.__meshPerf.disabled = true;
    }
  }

  var last = performance.now();
  var seedTimer = 0;

  function loop(now) {
    if (!running || disabled) return;
    var dt = Math.min(48, now - last);
    last = now;

    scrollY += (window.scrollY - scrollY) * 0.08;
    canvas.style.transform = 'translate3d(0,' + (scrollY * 0.06).toFixed(2) + 'px,0)';

    seedTimer += dt;
    if (seedTimer > 420) { seedTimer = 0; seed(); if (Math.random() < 0.4) seed(); }

    step(dt);
    linkPass();
    draw();
    govern(now, dt);
    requestAnimationFrame(loop);
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (disabled) return;
      resize();
      if (STATIC) { linkPass(); draw(); }
    }, 150);
  }, { passive: true });

  if (!STATIC) {
    window.addEventListener('pointermove', function (e) {
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
    }, { passive: true });
    window.addEventListener('pointerleave', function () { mouse.active = false; }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      if (running && !disabled) { last = performance.now(); warmup = 0; requestAnimationFrame(loop); }
    });
  }

  resize();
  linkPass();

  if (STATIC) {
    // one frame, no loop: the mesh becomes a still texture
    canvas.style.opacity = '.5';
    draw();
    window.__meshPerf = { tier: tier, static: true, nodes: nodes.length };
  } else {
    for (var s0 = 0; s0 < 6; s0++) seed();
    requestAnimationFrame(loop);
  }
})();
