/* ═══════════════════════════════════════════════════════════════
   main.js — interaction layer
   Reveals, scroll rail, nav state, cursor glow, card tilt,
   magnetic buttons, count-ups, text scramble, and the live
   agent-trace typewriter in the hero panel.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ── year ── */
  var yr = $('#year');
  if (yr) yr.textContent = new Date().getFullYear();

  /* ─────────────── reveal on scroll ─────────────── */
  var revealables = $$('.reveal');
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        el.style.setProperty('--d', (el.dataset.delay || 0) + 'ms');
        el.classList.add('is-in');
        io.unobserve(el);
        if (el.dataset.count !== undefined) countUp(el);
        $$('[data-count]', el).forEach(countUp);
        $$('.scramble', el).forEach(scramble);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    revealables.forEach(function (el) { io.observe(el); });
  } else {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
    $$('[data-count]').forEach(function (el) { el.textContent = el.dataset.count + (el.dataset.suffix || ''); });
  }

  /* ─────────────── count-up ─────────────── */
  function countUp(el) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    var target = parseFloat(el.dataset.count);
    var suffix = el.dataset.suffix || '';
    var dur = 1500, t0 = performance.now();
    (function tick(now) {
      var p = Math.min(1, (now - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = target * eased;
      el.textContent = (target % 1 ? val.toFixed(1) : Math.round(val)) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = target + suffix;
    })(t0);
  }

  /* ─────────────── text scramble ─────────────── */
  var GLYPHS = '01<>/\\[]{}$#%&*+=~_|';
  function scramble(el) {
    if (reduced || el.dataset.done) return;
    el.dataset.done = '1';
    var final = el.dataset.text || el.textContent;
    var chars = final.split('');
    var frame = 0;
    var settle = chars.map(function (_, i) { return 8 + i * 1.6 + Math.random() * 10; });
    (function tick() {
      var out = '', pending = false;
      for (var i = 0; i < chars.length; i++) {
        if (frame >= settle[i] || chars[i] === ' ') {
          out += chars[i];
        } else {
          pending = true;
          out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
      }
      el.textContent = out;
      frame++;
      if (pending) requestAnimationFrame(tick);
      else el.textContent = final;
    })();
  }

  /* ─────────────── scroll rail + nav state ─────────────── */
  var rail = $('.scroll-rail span');
  var nav = $('#nav');
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var p = max > 0 ? window.scrollY / max : 0;
      if (rail) rail.style.width = (p * 100).toFixed(2) + '%';
      if (nav) nav.classList.toggle('is-stuck', window.scrollY > 24);
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ─────────────── active section in nav ─────────────── */
  var navLinks = $$('.nav__links a');
  var sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        navLinks.forEach(function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ─────────────── cursor glow ─────────────── */
  if (finePointer && !reduced) {
    var glow = $('.cursor-glow');
    var gx = window.innerWidth / 2, gy = window.innerHeight / 2, tx = gx, ty = gy;
    window.addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY;
      document.body.classList.add('has-cursor');
    }, { passive: true });
    (function follow() {
      // the perf governor may retire this layer mid-session
      if (document.body.classList.contains('perf-low')) { if (glow) glow.remove(); return; }
      gx += (tx - gx) * 0.12;
      gy += (ty - gy) * 0.12;
      if (glow) glow.style.transform = 'translate3d(' + gx.toFixed(1) + 'px,' + gy.toFixed(1) + 'px,0)';
      requestAnimationFrame(follow);
    })();
  }

  /* ─────────────── spotlight + tilt ─────────────── */
  if (finePointer && !reduced) {
    $$('.card, .pillar').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        el.style.setProperty('--my', (e.clientY - r.top) + 'px');
      }, { passive: true });
    });

    $$('[data-tilt]').forEach(function (el) {
      var raf = null, rx = 0, ry = 0, trx = 0, tryy = 0, active = false;

      el.addEventListener('pointerenter', function () { active = true; kick(); });
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        var strength = r.width > 600 ? 3.2 : 5.5;
        tryy = px * strength;
        trx = -py * strength;
      }, { passive: true });
      el.addEventListener('pointerleave', function () { active = false; trx = 0; tryy = 0; kick(); });

      function kick() { if (!raf) raf = requestAnimationFrame(step); }
      function step() {
        rx += (trx - rx) * 0.12;
        ry += (tryy - ry) * 0.12;
        el.style.transform =
          'perspective(900px) rotateX(' + rx.toFixed(3) + 'deg) rotateY(' + ry.toFixed(3) + 'deg)' +
          (active ? ' translateY(-4px)' : '');
        if (Math.abs(rx - trx) > 0.01 || Math.abs(ry - tryy) > 0.01 || active) {
          raf = requestAnimationFrame(step);
        } else {
          el.style.transform = '';
          raf = null;
        }
      }
    });

    /* ─────────────── magnetic buttons ─────────────── */
    $$('.magnetic').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) * 0.24;
        var dy = (e.clientY - (r.top + r.height / 2)) * 0.32;
        el.style.transform = 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px)';
      }, { passive: true });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  }

  /* ─────────────── agent-trace typewriter ─────────────── */
  var trace = $('#trace');
  if (trace) {
    var SCENE = [
      [['▸ ', 'dim'], ['query', 'blue'], ['  "which contracts cap indemnification?"', 'ink']],
      [['● plan', 'mint'], ['     decompose(intent) → 3 sub-questions', 'dim']],
      [['● tool', 'mint'], ['     graph.cypher (:Clause)-[:IN]->(:Contract)', 'dim']],
      [['  ↳ 14 nodes · 22 edges', 'dim'], ['            118ms', 'amber']],
      [['● tool', 'mint'], ['     vector.topk(k=8, ns=tenant_7f2)', 'dim']],
      [['  ↳ rerank → 0.91 confidence', 'dim'], ['         41ms', 'amber']],
      [['● observe', 'mint'], ['  5 passages grounded · 0 orphaned', 'dim']],
      [['● stream', 'mint'], ['   SSE tokens ', 'dim'], ['▇▇▇▇▇▇▇▇▇▇', 'blue']],
      [['', 'dim']],
      [['✓ answer', 'mint'], ['  5 citations · p95 312 ms · $0.004', 'ink']],
      [['', 'dim']],
      [['$ ', 'mint'], ['tail -f platform/redaction.log', 'ink']],
      [['  70,412 docs/day · pii.redact ', 'dim'], ['OK', 'mint'], ['  10.2M total', 'dim']]
    ];

    var HOLD = { 3: 380, 5: 320, 7: 460, 9: 280 };   // per-line pauses, ms

    function esc(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    var li = 0, si = 0, ci = 0, out = '';

    function render(caret) {
      trace.innerHTML = out + (caret ? '<span class="caret"></span>' : '');
    }

    function type() {
      if (li >= SCENE.length) {
        render(true);
        setTimeout(function () {
          li = 0; si = 0; ci = 0; out = '';
          type();
        }, 3400);
        return;
      }
      var line = SCENE[li];
      var seg = line[si];

      if (!seg) {                       // line finished
        out += '\n';
        li++; si = 0; ci = 0;
        var hold = HOLD[li] || 110;
        render(true);
        setTimeout(type, hold);
        return;
      }

      var text = seg[0];
      if (ci >= text.length) { si++; ci = 0; type(); return; }

      // completed segments already live in `out`; only the in-flight one is partial
      ci++;
      var partial = '<span class="t-' + seg[1] + '">' + esc(text.slice(0, ci)) + '</span>';
      trace.innerHTML = out + partial + '<span class="caret"></span>';

      if (ci === text.length) {
        out += '<span class="t-' + seg[1] + '">' + esc(text) + '</span>';
      }
      setTimeout(type, text.length > 30 ? 11 : 20);
    }

    if (reduced) {
      out = SCENE.map(function (line) {
        return line.map(function (s) {
          return '<span class="t-' + s[1] + '">' + esc(s[0]) + '</span>';
        }).join('');
      }).join('\n');
      render(false);
    } else {
      setTimeout(type, 900);
    }
  }

  /* ─────────────── pause off-screen decorative animation ───────────────
     The hero wordmark sheen, the marquee and the SVG dash flows all repaint
     (they are not compositor-only properties), so leaving them running while
     scrolled past costs real frames on weaker GPUs. */
  if ('IntersectionObserver' in window && !reduced) {
    var animHosts = [$('.hero'), $('.marquee'), $('#projects')].filter(Boolean);
    var animIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        en.target.classList.toggle('anim-off', !en.isIntersecting);
      });
    }, { rootMargin: '120px' });
    animHosts.forEach(function (el) { animIO.observe(el); });
  }

  /* ─────────────── smooth in-page anchors (with nav offset) ─────────────── */
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      var top = target.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top: top, behavior: reduced ? 'auto' : 'smooth' });
      if (history.replaceState) history.replaceState(null, '', id);
    });
  });
})();
