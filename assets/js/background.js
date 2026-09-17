/* ═══════════════════════════════════════════════════════════════
   background.js — WebGL aurora field
   Domain-warped fBm noise, mouse-reactive, scroll-drifting.
   Renders at half resolution and lets the GPU upscale: the field
   is low-frequency, so the interpolation is free smoothing.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var canvas = document.getElementById('gl-bg');
  if (!canvas) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { canvas.style.display = 'none'; return; }

  var opts = {
    antialias: false, alpha: true, depth: false, stencil: false,
    powerPreference: 'low-power',
    // if the only way to honour this context is a software rasteriser
    // (SwiftShader / llvmpipe), fail instead — CPU-rendering fBm noise
    // full-screen is what turns this page into a slideshow.
    failIfMajorPerformanceCaveat: true
  };
  var gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);

  if (!gl) { fallback(); return; }

  // No usable GPU path: drop to a static CSS gradient. The node mesh and the
  // rest of the motion stay, so the page still feels alive without asking the
  // CPU to shade a full-screen noise field.
  function fallback() {
    canvas.style.display = 'none';
    document.documentElement.classList.add('no-gl');
  }

  var VERT = [
    'attribute vec2 a_pos;',
    'void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform vec2  u_res;',
    'uniform float u_time;',
    'uniform vec2  u_mouse;',
    'uniform float u_scroll;',

    /* --- Ashima 2D simplex noise --- */
    'vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }',
    'vec2 mod289(vec2 x){ return x - floor(x * (1.0/289.0)) * 289.0; }',
    'vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }',
    'float snoise(vec2 v){',
    '  const vec4 C = vec4(0.211324865, 0.366025404, -0.577350269, 0.024390244);',
    '  vec2 i  = floor(v + dot(v, C.yy));',
    '  vec2 x0 = v - i + dot(i, C.xx);',
    '  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);',
    '  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;',
    '  i = mod289(i);',
    '  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));',
    '  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);',
    '  m = m*m; m = m*m;',
    '  vec3 x = 2.0 * fract(p * C.www) - 1.0;',
    '  vec3 h = abs(x) - 0.5;',
    '  vec3 ox = floor(x + 0.5);',
    '  vec3 a0 = x - ox;',
    '  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);',
    '  vec3 g;',
    '  g.x  = a0.x  * x0.x  + h.x  * x0.y;',
    '  g.yz = a0.yz * x12.xz + h.yz * x12.yw;',
    '  return 130.0 * dot(m, g);',
    '}',

    /* --- fBm over 5 octaves --- */
    'float fbm(vec2 p){',
    '  float v = 0.0, amp = 0.5;',
    '  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);',
    '  for (int i = 0; i < 3; i++){',
    '    v += amp * snoise(p);',
    '    p = rot * p * 2.02;',
    '    amp *= 0.5;',
    '  }',
    '  return v;',
    '}',

    'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',

    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / u_res.xy;',
    '  vec2 p  = (gl_FragCoord.xy - 0.5 * u_res.xy) / u_res.y;',
    '  p *= 0.78;',
    '  p.y += u_scroll * 0.55;',

    '  float t = u_time * 0.035;',

    /* two-stage domain warp: q warps into r, r warps the final field */
    '  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t * 0.8));',
    '  float f = fbm(p + 1.7 * q + vec2(1.7, 9.2) + t * 0.45);',
    // second warp stage derived from the first instead of sampling again:
    // visually near-identical here, and two fewer fBm evaluations per pixel
    '  vec2 r = q * 0.85 + vec2(f * 0.55, f * 0.38);',

    /* palette */
    '  vec3 base   = vec3(0.019, 0.023, 0.039);',
    '  vec3 indigo = vec3(0.075, 0.115, 0.255);',
    '  vec3 mint   = vec3(0.145, 0.560, 0.470);',
    '  vec3 blue   = vec3(0.235, 0.330, 0.720);',
    '  vec3 amber  = vec3(0.420, 0.250, 0.170);',

    '  vec3 col = base;',
    '  col = mix(col, indigo, smoothstep(-0.95, 1.25, f) * 0.80);',
    '  col = mix(col, blue,   smoothstep(0.15, 1.45, length(r)) * 0.26);',
    '  col = mix(col, mint,   smoothstep(0.45, 1.65, q.x + f * 0.5) * 0.20);',
    '  col = mix(col, amber,  smoothstep(1.00, 1.90, r.y + q.y) * 0.07);',

    /* filament highlights: thin ridges where the warp folds, kept faint */
    '  float ridge = 1.0 - abs(f);',
    '  ridge = pow(clamp(ridge, 0.0, 1.0), 16.0);',
    '  col += ridge * vec3(0.30, 0.62, 0.55) * 0.16;',

    /* cursor bloom */
    '  vec2 m = (u_mouse - 0.5 * u_res.xy) / u_res.y;',
    '  float d = length(p - m * 1.35);',
    '  col += exp(-d * 2.4) * vec3(0.10, 0.26, 0.24) * 0.50;',

    /* horizon glow near the top, fade to black at the bottom */
    '  col += vec3(0.05, 0.08, 0.18) * pow(1.0 - uv.y, 3.0) * 0.55;',
    '  col *= smoothstep(-0.25, 0.55, uv.y * 1.25);',

    /* vignette + dither to kill banding on dark gradients */
    '  float vig = smoothstep(1.28, 0.30, length((uv - 0.5) * vec2(1.25, 1.0)));',
    '  col *= mix(0.42, 1.0, vig);',
    '  col *= 0.72;',
    '  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) / 255.0;',

    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { fallback(); return; }

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { fallback(); return; }
  gl.useProgram(prog);

  // full-screen triangle
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var uRes    = gl.getUniformLocation(prog, 'u_res');
  var uTime   = gl.getUniformLocation(prog, 'u_time');
  var uMouse  = gl.getUniformLocation(prog, 'u_mouse');
  var uScroll = gl.getUniformLocation(prog, 'u_scroll');

  var SCALE = 0.5;
  var MIN_SCALE = 0.26;
  var FRAME_MS = 1000 / 30;      // the field drifts slowly; 30fps is plenty
  var lastDraw = 0;
  var samples = [], lastAdjust = 0, warmup = 0;
  var mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  var scroll = 0, scrollTarget = 0;
  var running = true;

  function resize(force) {
    var w = Math.max(1, Math.floor(window.innerWidth  * SCALE));
    var h = Math.max(1, Math.floor(window.innerHeight * SCALE));
    if (!force && canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    mouse.tx = w * 0.5; mouse.ty = h * 0.55;
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  window.addEventListener('pointermove', function (e) {
    mouse.tx = e.clientX * SCALE;
    mouse.ty = (window.innerHeight - e.clientY) * SCALE;
  }, { passive: true });

  window.addEventListener('scroll', function () {
    scrollTarget = window.scrollY / Math.max(1, window.innerHeight);
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running) { last = performance.now(); requestAnimationFrame(frame); }
  });

  // If frames run long even at 30fps, the GPU is struggling with the noise —
  // shrink the render target rather than dropping the effect. The field is
  // low-frequency, so a smaller buffer upscales without visible loss.
  function govern(now, dt) {
    if (warmup < 30) { warmup++; return; }
    samples.push(dt);
    if (samples.length > 60) samples.shift();
    if (samples.length < 60 || now - lastAdjust < 3000) return;

    var med = samples.slice().sort(function (a, b) { return a - b; })[30];
    window.__glPerf = { scale: +SCALE.toFixed(2), medianFrameMs: +med.toFixed(1) };
    if (med > 40 && SCALE > MIN_SCALE) {
      SCALE = Math.max(MIN_SCALE, SCALE * 0.72);
      lastAdjust = now; samples.length = 0;
      resize(true);
    }
  }

  var t0 = performance.now();
  var last = t0;

  function frame(now) {
    if (!running) return;
    var dt = Math.min(64, now - last);
    last = now;

    // critically-damped easing toward targets
    var k = 1 - Math.pow(0.001, dt / 1000);
    mouse.x += (mouse.tx - mouse.x) * k * 0.55;
    mouse.y += (mouse.ty - mouse.y) * k * 0.55;
    scroll  += (scrollTarget - scroll) * k * 0.6;

    if (now - lastDraw >= FRAME_MS) {
      lastDraw = now;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - t0) / 1000);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uScroll, scroll);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      govern(now, dt);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
