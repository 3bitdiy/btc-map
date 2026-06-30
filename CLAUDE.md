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
2. **Colony platform (forum/blog)** — planned, **not built**. A login-required area for colony organizers. Will be a **separate** free project (Cloudflare D1 + Workers + Google OAuth), **NOT PocketBase**. See "Data, content & future forum" below.

Flat-file vanilla JS (no framework, no src/ folder). Core files:

**Current map implementation:** MapLibre GL JS v5.24.0 + PMTiles (self-hosted on Cloudflare R2). Map style follows OpenMapTiles schema. No custom SVG renderer.

## Full Stack (free / static)

The whole stack is free and the map has **no backend** — it must survive being handed to non-paying partners after year 1.

- **Frontend** — Cloudflare Pages (static; push to `main`)
- **Map data** — static JSON in `public/data/` (no database, no API)
- **Photos** — static placeholder `public/assets/images/colony-placeholder.png` (all colonies; per-colony photos not used yet)
- **Map tiles** — PMTiles on Cloudflare R2 (free tier; free egress)
- **CDN/proxy/SSL** — Cloudflare free tier
- **Domain** — custom domain while funded; free fallback `*.pages.dev` (or `is-a.dev`/`js.org`)

> The map has **zero dependency on PocketBase / the Hetzner VPS** (that VPS served nothing live and is being decommissioned). Don't reintroduce a backend for the map.

## Data, content & future forum

- **Colony data** — static JSON: `public/data/colonies-{serbia,bosnia-and-herzegovina,north-macedonia}.json`, indexed by `public/data/colonies.manifest.json`. `loadColoniesData()` in `main.js` fetches the manifest → those files, falling back to the known split files then `colonies.json`. **No PocketBase/API call anywhere.**
- **Editing** — maintainer edits colony data via **Sveltia CMS** (git-based → commits JSON to this repo; GitHub auth). Organizers propose additions/edits via a **Google Form** the maintainer reviews (no live integration — just a link on the site).
- **Forum + organizer blog (planned, separate)** — **Cloudflare D1 (SQLite) + Workers + Google OAuth**. Minimal scope (`users`, `threads`, `posts`, `blog_posts`). Organizers log in with Google (no GitHub). Not built yet.

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

The Hetzner VPS / PocketBase is being decommissioned — nothing live depends on it. The future forum/blog will be a separate Cloudflare D1 + Workers project, not on that VPS.
