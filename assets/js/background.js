/* ═══════════════════════════════════════════════════════════════
   background.js — ordered-dither field

   A slow flowing light field, quantised to a handful of tones
   through an 8×8 Bayer matrix. No smooth gradients, no blur: every
   pixel is one of N palette steps, and the illusion of tone comes
   entirely from the dot pattern — the way newsprint does it.

   Two decisions keep it crisp rather than mushy:
     · the canvas renders at CSS resolution (not devicePixelRatio)
       and is upscaled by the compositor with image-rendering:
       pixelated, so one dither cell stays a hard square
     · the field is sampled at the CENTRE of each cell, so a cell is
       a single flat value — sampling per pixel would reintroduce
       the gradient the dithering is supposed to replace
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var canvas = document.getElementById('gl-bg');
  if (!canvas) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { canvas.style.display = 'none'; document.documentElement.classList.add('no-gl'); return; }
  if (/[?&]nogpu=1\b/.test(location.search)) { markNoGpu(null); fallback(); return; }

  var opts = {
    antialias: false, alpha: false, depth: false, stencil: false,
    powerPreference: 'low-power', failIfMajorPerformanceCaveat: true
  };
  var gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);

  if (!gl) {
    var soft = { antialias: false, alpha: false, depth: false, stencil: false };
    var probe = null;
    try { probe = canvas.getContext('webgl', soft) || canvas.getContext('experimental-webgl', soft); }
    catch (e) { probe = null; }
    if (probe) markNoGpu(probe);
    fallback();
    return;
  }
  if (isSoftware(gl)) { markNoGpu(gl); fallback(); return; }

  function isSoftware(ctx) {
    try {
      var d = ctx.getExtension('WEBGL_debug_renderer_info');
      if (!d) return false;
      var r = String(ctx.getParameter(d.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
      return /swiftshader|llvmpipe|software|basic render|softpipe|mesa offscreen/.test(r);
    } catch (e) { return false; }
  }
  function markNoGpu(ctx) {
    window.__noGpu = true;
    document.documentElement.classList.add('no-gpu');
    if (!ctx) return;
    try { var l = ctx.getExtension('WEBGL_lose_context'); if (l) l.loseContext(); } catch (e) {}
  }
  function fallback() { canvas.style.display = 'none'; document.documentElement.classList.add('no-gl'); }

  /* ── palette: the only colours the field can ever be ─────────── */
  var RAMP = ['#07080b', '#0b1410', '#15291a', '#3c6b24', '#d8ff54'];
  var LEVELS = 5;
  var CELL = 3;

  function hex(h) {
    h = h.replace('#', '');
    return [parseInt(h.slice(0, 2), 16) / 255,
            parseInt(h.slice(2, 4), 16) / 255,
            parseInt(h.slice(4, 6), 16) / 255];
  }

  var VERT = 'attribute vec2 a_pos; void main(){ gl_Position = vec4(a_pos,0.0,1.0); }';

  var FRAG = [
    'precision highp float;',
    'uniform vec2  u_res;',
    'uniform float u_time;',
    'uniform vec2  u_mouse;',
    'uniform float u_cell;',
    'uniform float u_levels;',
    'uniform vec3  u_ramp[5];',

    /* Ashima 2D simplex */
    'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}',
    'float snoise(vec2 v){',
    '  const vec4 C = vec4(0.211324865,0.366025404,-0.577350269,0.024390244);',
    '  vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);',
    '  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);',
    '  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod289(i);',
    '  vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));',
    '  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);',
    '  m=m*m; m=m*m;',
    '  vec3 x=2.0*fract(p*C.www)-1.0; vec3 h=abs(x)-0.5;',
    '  vec3 ox=floor(x+0.5); vec3 a0=x-ox;',
    '  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);',
    '  vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;',
    '  return 130.0*dot(m,g);',
    '}',
    'float fbm(vec2 p){',
    '  float v=0.0, a=0.5;',
    '  mat2 r=mat2(0.8,0.6,-0.6,0.8);',
    '  for(int i=0;i<4;i++){ v+=a*snoise(p); p=r*p*2.03; a*=0.5; }',
    '  return v;',
    '}',

    /* compact Bayer 8×8 — the classic bit-interleave form */
    'float bayer2(vec2 a){ a=floor(a); return fract(a.x*0.5 + a.y*a.y*0.75); }',
    'float bayer4(vec2 a){ return bayer2(0.5*a)*0.25 + bayer2(a); }',
    'float bayer8(vec2 a){ return bayer4(0.5*a)*0.25 + bayer2(a); }',

    'vec3 rampColor(float q){',
    '  float s = q * (u_levels - 1.0);',
    '  int i = int(floor(s + 0.5));',
    '  if (i <= 0) return u_ramp[0];',
    '  if (i == 1) return u_ramp[1];',
    '  if (i == 2) return u_ramp[2];',
    '  if (i == 3) return u_ramp[3];',
    '  return u_ramp[4];',
    '}',

    'void main(){',
    '  vec2 cell = floor(gl_FragCoord.xy / u_cell);',
    '  vec2 cpx  = cell * u_cell + u_cell * 0.5;',      // cell centre, in pixels
    '  vec2 uv   = cpx / u_res;',
    '  vec2 p    = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);',

    '  float t = u_time * 0.055;',

    /* gentle warp — enough to keep the falloff from looking like a plain
       radial, not so much that it turns into blobs */
    '  vec2 q = vec2(fbm(p * 0.95 + vec2(0.0, t * 0.6)),',
    '                fbm(p * 0.95 + vec2(3.1, 1.7) - t * 0.45));',
    '  float n = fbm(p * 1.1 + q * 0.8 + t * 0.3);',

    /* one broad light source, off the top-left. Dithering reads as design
       rather than noise when the tone falls off cleanly from a single source */
    '  vec2 lp = vec2(-0.62, 0.34) + u_mouse * 0.14',
    '          + vec2(sin(t * 0.19) * 0.06, cos(t * 0.15) * 0.045);',
    '  float d = length((p - lp) * vec2(0.78, 1.0));',
    '  float light = 1.0 - smoothstep(0.0, 1.55, d);',

    '  float v = light * 0.98 + n * 0.14;',
    '  v *= 1.0 - smoothstep(0.30, 1.0, uv.y) * 0.62;',   // settle toward the bottom
    '  v = clamp(v, 0.0, 1.0);',
    /* push the mid-tones down so the bright end stays rare and the page
       reads as near-black with a dense core, not a field of green */
    '  v = pow(v, 2.1);',

    /* ordered dithering: threshold shifts per cell, so a flat value
       resolves into a dot pattern instead of a banded block */
    '  float b = bayer8(cell);',
    '  float q2 = floor(v * (u_levels - 1.0) + b) / (u_levels - 1.0);',
    '  q2 = clamp(q2, 0.0, 1.0);',

    '  gl_FragColor = vec4(rampColor(q2), 1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[bg]', gl.getShaderInfoLog(s)); return null;
    }
    return s;
  }
  var vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { fallback(); return; }
  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { fallback(); return; }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var U = {
    res: gl.getUniformLocation(prog, 'u_res'),
    time: gl.getUniformLocation(prog, 'u_time'),
    mouse: gl.getUniformLocation(prog, 'u_mouse'),
    cell: gl.getUniformLocation(prog, 'u_cell'),
    levels: gl.getUniformLocation(prog, 'u_levels')
  };
  for (var i = 0; i < RAMP.length; i++) {
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_ramp[' + i + ']'), hex(RAMP[i]));
  }
  gl.uniform1f(U.levels, LEVELS);

  var mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  var running = true, t0 = performance.now(), last = t0, lastDraw = 0;
  var FRAME_MS = 1000 / 40;

  function resize() {
    // CSS-pixel resolution on purpose: the compositor upscales with
    // image-rendering: pixelated, which keeps the dither cells hard
    var w = Math.max(2, Math.floor(window.innerWidth));
    var h = Math.max(2, Math.floor(window.innerHeight));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.res, w, h);
    gl.uniform1f(U.cell, window.innerWidth < 640 ? 2 : CELL);
  }
  resize();

  var rt = null;
  window.addEventListener('resize', function () {
    clearTimeout(rt); rt = setTimeout(resize, 130);
  }, { passive: true });

  window.addEventListener('pointermove', function (e) {
    mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    mouse.ty = -(e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running) { last = performance.now(); requestAnimationFrame(frame); }
  });

  var drawn = 0;
  function frame(now) {
    if (!running) return;
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    if (now - lastDraw >= FRAME_MS) {
      lastDraw = now; drawn++;
      gl.uniform1f(U.time, (now - t0) / 1000);
      gl.uniform2f(U.mouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    last = now;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__dither = {
    ramp: RAMP,
    get frames() { return drawn; },
    get time() { return (performance.now() - t0) / 1000; }
  };
})();
