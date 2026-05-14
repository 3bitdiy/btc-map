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

The project has two parts that share the same Vite build:

1. **Interactive map** (`index.html` / `main.js`) — public-facing, no login. Colony markers on a self-hosted vector map.
2. **Colony platform (forum)** — planned, login-required area for colony managers built on PocketBase auth and real-time collections.

Flat-file vanilla JS (no framework, no src/ folder). Core files:


**Current map implementation:** MapLibre GL JS v5.24.0 + PMTiles (self-hosted on Cloudflare R2). Map style follows OpenMapTiles schema. No custom SVG renderer.

## Full Stack (production)

- **Frontend** — Cloudflare Pages (GitHub auto-deploy, push to `main` triggers build)
- **Backend/DB** — PocketBase on Hetzner CX32 VPS, behind Caddy reverse proxy
- **Map tiles** — PMTiles on Cloudflare R2
- **Foto storage** — Cloudflare R2 via PocketBase S3 backend
- **CDN/proxy/SSL** — Cloudflare free tier

## PocketBase collections (planned)

```text
users          → colony managers (email/password auth)
colonies       → colony records (replaces colonies.json in production)
threads        → discussion topics (author, title, linked colony)
posts          → replies in a thread (author, body, attachments)
announcements  → one-way broadcasts from Goethe-Institut admins
```

In production, `fetch('/data/colonies.json')` in `main.js` will be replaced with:

```text
GET https://api.beyondthecities.eu/api/collections/colonies/records
```

## Map Stack

- **MapLibre GL JS** renders vector tiles via WebGL
- **PMTiles** (`pmtiles` npm package) provides HTTP range-request tile access; registered as a custom protocol: `maplibregl.addProtocol('pmtiles', ...)`
- Tiles are self-hosted on **Cloudflare R2** at `pub-716e1bd7d8eb43cdafdb8f37dd91f157.r2.dev/western-balkans.pmtiles`
- The URL is injected at runtime in `main.js`
- Glyphs come from `https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf` — only **"Noto Sans Regular"** is available; "Noto Sans Bold" returns 404

## Layout & Responsive Behaviour

- Desktop (>900px): CSS Grid `var(--filter-width) 1fr var(--panel-width)` — detail panel is a right sidebar
- Mobile (≤900px): filter panel slides in from left (fixed overlay), detail panel is a bottom sheet that animates up with `translateY`; uses `.is-open` class + `requestAnimationFrame` to trigger CSS transition
- `#app.panel-open` class controls whether the panel column has width on desktop

## i18n

- UI language (EN/DE): `UI_STRINGS` object in `main.js`, applied via `data-i18n` attributes on elements
- Description language (SR/EN/DE/MK): per-colony `description_sr/en/de/mk` fields, switched via `.desc-lang-btn` buttons in the detail panel

## Deployment

Frontend hosted on **Cloudflare Pages** (static). To redeploy: run `npm run build`, then upload the `dist/` folder via the Cloudflare Pages dashboard. The PMTiles file lives on R2 — do not put it in `dist/`.

R2 bucket CORS is set to allow all origins with GET/HEAD and must expose `Content-Length`, `Content-Range`, `ETag` headers for PMTiles range requests to work.

PocketBase runs on Hetzner CX32 behind Caddy. Cloudflare proxies the API subdomain (`api.beyondthecities.eu`) to the VPS.
