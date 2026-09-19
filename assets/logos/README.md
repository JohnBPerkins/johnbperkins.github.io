# Logo files

The credibility bar in the hero reads these. Each entry in `index.html` carries
a `data-logo` path; `main.js` only swaps the image in once it actually decodes,
so a missing file falls back to its wordmark and the bar always looks finished.

## What's here

These are the companies' own favicons, pulled once from Google's favicon
service and **committed locally** rather than hotlinked:

```
american-express.png          (32x32, from americanexpress.com)
arizona-state-university.png  (48x48, from asu.edu)
choice-hotels.png             (64x64, from choicehotels.com)
```

Self-hosting them means no third-party request on page load, nothing leaking
visitor IPs to Google, and no dependency on that service staying up. The
tradeoff is that a rebrand won't update automatically — re-pull if one changes:

```sh
curl -L -o assets/logos/american-express.png \
  "https://www.google.com/s2/favicons?domain=americanexpress.com&sz=64"
```

To hotlink instead (auto-updating, but a third-party request per visitor), point
`data-logo` straight at that URL.

## Presentation

Icons sit on a **white rounded chip**. That is deliberate: these three brands
ship favicons on different grounds — Amex on blue, ASU and Choice on white — and
without the chip the row reads as three mismatched stickers. The chip normalises
them into one set.

The wordmark stays visible next to the icon. A 24px favicon on its own is not
legible as a company.

Sizes vary at the source (the service returns whatever each site has, so `sz=64`
is a request, not a guarantee). All render at 24px, so anything 32px or larger
stays crisp.

Per-entry size override if one looks off next to the others:

```html
<li data-logo="assets/logos/notum.png" style="--logo-h:21px">…</li>
```

A proper SVG wordmark, if you get one, can replace any of these — just point
`data-logo` at it. Note it will render inside the same white chip, so use a
normal colour version rather than a white-on-transparent one.
