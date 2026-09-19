/* ═══════════════════════════════════════════════════════════════
   main.js — interaction layer
   Scroll reveals, rail, nav state, scroll-spy, count-ups, and the
   scroll-linked fade that sinks the dither field toward black once
   you are past the hero.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var yr = $('#year');
  if (yr) yr.textContent = new Date().getFullYear();

  /* ── reveals ── */
  var items = $$('.reveal');
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        el.style.setProperty('--d', (el.dataset.delay || 0) + 'ms');
        el.classList.add('is-in');
        io.unobserve(el);
        $$('[data-count]', el).forEach(countUp);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('is-in'); });
    $$('[data-count]').forEach(function (el) {
      el.textContent = el.dataset.count + (el.dataset.suffix || '');
    });
  }

  function countUp(el) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    var target = parseFloat(el.dataset.count);
    var suffix = el.dataset.suffix || '';
    var dur = 1300, t0 = performance.now();
    (function tick(now) {
      var p = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * e) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = target + suffix;
    })(t0);
  }

  /* ── credibility bar ──
     Progressive: the wordmark is the real markup, and an image only replaces
     it once it has actually decoded. Nothing flashes, nothing 404s visibly,
     and dropping a file into assets/logos/ upgrades the row with no edit. */
  $$('.logos li[data-logo]').forEach(function (li) {
    var src = li.dataset.logo;
    var probe = new Image();
    probe.onload = function () {
      var label = li.querySelector('span');
      var img = document.createElement('img');
      img.src = src;
      img.alt = label ? label.textContent : '';
      img.loading = 'lazy';
      img.decoding = 'async';
      li.insertBefore(img, li.firstChild);
      li.classList.add('has-logo');
    };
    probe.src = src;
  });

  /* ── rail, nav, backdrop fade ── */
  var rail = $('.rail span');
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
      var fade = Math.min(0.88, window.scrollY / (window.innerHeight * 0.95));
      document.documentElement.style.setProperty('--bg-fade', fade.toFixed(3));
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── scroll-spy ── */
  var links = $$('.nav__links a');
  var secs = links.map(function (a) { return document.querySelector(a.getAttribute('href')); }).filter(Boolean);
  if ('IntersectionObserver' in window && secs.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    secs.forEach(function (s) { spy.observe(s); });
  }

  /* ── copy-to-clipboard on the email ── */
  $$('.copy[data-copy]').forEach(function (btn) {
    var original = btn.textContent;
    var timer = null;
    btn.addEventListener('click', function () {
      var text = btn.dataset.copy;
      var done = function () {
        btn.textContent = 'copied';
        btn.classList.add('is-done');
        clearTimeout(timer);
        timer = setTimeout(function () {
          btn.textContent = original;
          btn.classList.remove('is-done');
        }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else {
        fallback();
      }
      // clipboard API needs a secure context; plain http and older browsers land here
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:absolute;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
        document.body.removeChild(ta);
      }
    });
  });

  /* ── anchors with nav offset ── */
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      window.scrollTo({
        top: target.getBoundingClientRect().top + window.scrollY - 70,
        behavior: reduced ? 'auto' : 'smooth'
      });
      if (history.replaceState) history.replaceState(null, '', id);
    });
  });
})();
