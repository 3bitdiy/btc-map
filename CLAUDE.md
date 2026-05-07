# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Dev server at http://localhost:5173
npm run build    # Production build → dist/
npm run preview  # Preview dist/ locally
```

No test suite — there are no test files in this project.

## Architecture

Flat-file vanilla JS app (no framework, no src/ folder). Core files:

- `index.html` — App shell; all markup including the filter panel, map container, and detail panel
- `main.js` — All application logic as ES modules (~400 lines)
- `style.css` — All styles using CSS custom properties; CSS Grid drives the 3-column desktop layout (filter | map | detail panel)
- `public/map-style.json` — MapLibre GL v8 style using the **OpenMapTiles schema** (Planetiler output, `source-layer` names like `transportation`, `boundary`, `place`)
- `public/data/colonies.json` — Mock data (6 colonies); production will fetch from Airtable

## Map Stack

- **MapLibre GL JS** renders vector tiles via WebGL
- **PMTiles** (`pmtiles` npm package) provides HTTP range-request tile access; registered as a custom protocol: `maplibregl.addProtocol('pmtiles', ...)`
- Tiles are self-hosted on **Cloudflare R2** at `pub-716e1bd7d8eb43cdafdb8f37dd91f157.r2.dev/western-balkans.pmtiles`
- The URL is injected at runtime in `main.js` — `map-style.json` contains only `PMTILES_URL_PLACEHOLDER`
- Glyphs come from `https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf` — only **"Noto Sans Regular"** is available; "Noto Sans Bold" returns 404

## Layout & Responsive Behaviour

- Desktop (>900px): CSS Grid `var(--filter-width) 1fr var(--panel-width)` — detail panel is a right sidebar
- Mobile (≤900px): filter panel slides in from left (fixed overlay), detail panel is a bottom sheet that animates up with `translateY`; uses `.is-open` class + `requestAnimationFrame` to trigger CSS transition
- `#app.panel-open` class controls whether the panel column has width on desktop

## i18n

- UI language (EN/DE): `UI_STRINGS` object in `main.js`, applied via `data-i18n` attributes on elements
- Description language (SR/EN/DE/MK): per-colony `description_sr/en/de/mk` fields, switched via `.desc-lang-btn` buttons in the detail panel

## Deployment

Hosted on **Cloudflare Pages** (static). To redeploy: run `npm run build`, then upload the `dist/` folder via the Cloudflare Pages dashboard. The 919 MB PMTiles file lives on R2 — do not put it in `dist/`.

R2 bucket CORS is set to allow all origins with GET/HEAD and must expose `Content-Length`, `Content-Range`, `ETag` headers for PMTiles range requests to work.
