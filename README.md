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
