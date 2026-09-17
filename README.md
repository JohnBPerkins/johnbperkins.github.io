# johnbperkins.github.io

Personal site — served by GitHub Pages from `main` as plain static files
(`.nojekyll` disables Jekyll processing; there is no build step).

```
index.html                 markup + all copy
assets/css/style.css       design tokens, layout, motion
assets/js/background.js    WebGL aurora — domain-warped fBm noise field
assets/js/network.js       canvas service mesh — drifting nodes + hopping message pulses
assets/js/main.js          reveals, nav, tilt, count-ups, agent-trace typewriter
assets/files/              résumé PDF
```

No frameworks, no dependencies, no build. Edit a file and push.

Local preview:

```sh
python3 -m http.server 4321   # then open http://localhost:4321
```

Everything respects `prefers-reduced-motion`: both canvases are disabled and
the animated trace renders statically.

## Performance

The page animates continuously, so it is built to stay inside the frame budget
on weak GPUs — not just on Apple silicon.

- **No `backdrop-filter`** except the stuck nav. Each blurred pane re-rasterises
  its backdrop every frame, and the backdrop here is a live canvas. This was the
  single biggest cost on Windows/D3D.
- **No full-screen `mix-blend-mode`.**
- **Mesh edges** come from a spatial hash and stroke as 5 batched paths; glows are
  pre-rendered sprites rather than per-frame gradient objects.
- **The shader** runs at 30fps on a half-resolution buffer, 3 fBm calls x 3 octaves.
- **`failIfMajorPerformanceCaveat`** — if the browser would only serve WebGL through
  a software rasteriser (SwiftShader/llvmpipe), the shader is skipped entirely and a
  static CSS gradient stands in.
- **Runtime governors** watch real frame times and step quality down, adding
  `body.perf-low` and ultimately retiring the mesh layer.
- Decorative animations pause via IntersectionObserver when their section scrolls
  off-screen.

To see what a given machine settled on, open the console:

```js
window.__meshPerf   // { tier, medianFrameMs, nodes, disabled? }
window.__glPerf     // { scale, medianFrameMs }
```
