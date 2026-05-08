# Beyond the Cities — Interactive Map & Colony Platform

Interactive map of artist colonies in Serbia, Bosnia and Herzegovina, and North Macedonia, with a communication platform for colony managers.
Built for the Goethe-Institut Belgrade as part of the *Beyond the Cities* project (2026–2028).

**Live (trenutno):** <https://lucky-water-8d37.stevankojic-com.workers.dev/>
**Live (planirano):** Cloudflare Pages + custom domen (Porkbun)

---

## Tech Stack

```text
| Sloj           | Tehnologija                                        |
| -------------- | -------------------------------------------------- |
| Frontend mapa  | HTML / Vanilla JS + MapLibre GL JS (Vite build)    |
| Frontend forum | HTML / Vanilla JS (isti build, odvojena stranica)  |
| Map tiles      | PMTiles (self-hosted, Cloudflare R2)               |
| Backend/DB     | PocketBase (auth + data + real-time)               |
| Foto storage   | Cloudflare R2 (PocketBase S3 backend)              |
| VPS            | Hetzner CX32 (~8€/mes)                             |
| Reverse proxy  | Caddy (na VPS-u)                                   |
| Hosting        | Cloudflare Workers (trenutno) → Pages (planirano)  |
| CDN / DDoS     | Cloudflare (besplatni plan)                        |
| SSL            | Cloudflare                                         |
| Domain         | Porkbun                                            |
```

---

## Quick start (development)

```bash
npm install
npm run dev
```

Open <http://localhost:5173> (or whichever port Vite assigns).

---

## Architecture overview

The project has two distinct parts that share the same Vite build and PocketBase backend:

**1. Interactive map** — public-facing, no login required. Displays artist colonies as markers on a self-hosted vector map. Colony data is fetched from PocketBase. Map tiles are served from Cloudflare R2 via PMTiles.

**2. Colony platform (forum)** — login-required area for colony managers. Built on PocketBase auth and real-time collections. Allows managers to open discussion threads, reply, attach files, and receive announcements from the Goethe-Institut team.

---

## PocketBase collections (planned)

```text
users          → colony managers (PocketBase auth, email/password)
colonies       → colony records (replaces colonies.json in production)
threads        → discussion topics (author, title, linked colony)
posts          → replies in a thread (author, body, attachments)
announcements  → one-way broadcasts from Goethe-Institut admins
```

In development, colony data comes from `public/data/colonies.json`. In production, the frontend fetches from:

```text
GET https://api.beyondthecities.eu/api/collections/colonies/records
```

---

## PMTiles — getting the self-hosted tile file

For production you need a PMTiles extract covering the Western Balkans.

### Option A — Protomaps web extract (recommended)

1. Go to <https://app.protomaps.com/downloads/osm>
2. Draw or enter the bounding box:
   - SW: **40.0, 13.0** (lat, lon)
   - NE: **47.5, 23.5**
3. Download the `.pmtiles` file (≈ 200–400 MB for this region).
4. Upload to Cloudflare R2 bucket.

### Option B — CLI extract

```bash
brew install pmtiles   # macOS

pmtiles extract https://build.protomaps.com/20240101.pmtiles balkans.pmtiles \
  --bbox=13.0,40.0,23.5,47.5
```

---

## Build & deploy

```bash
npm run build   # output → dist/
```

Frontend deploys to **Cloudflare Pages** via GitHub (push to `main` → auto-deploy). The PMTiles file lives on **R2** — do not put it in `dist/`.

PocketBase runs on a **Hetzner CX32 VPS** behind Caddy. Cloudflare proxies both the static frontend and the PocketBase API domain.

> **GDPR note:** All tile requests are served from Cloudflare R2 (no third-party tile provider). Colony data and user data are stored on a Hetzner VPS in the EU. No external analytics or tracking.

---

## Project structure

```text
btc-map/
├── index.html              # Map app shell
├── style.css               # All styles (CSS custom properties)
├── main.js                 # Map app logic (ES modules, no framework)
├── public/
│   ├── map-style.json      # MapLibre style (OpenMapTiles schema)
│   └── data/
│       └── colonies.json   # Mock data (6 colonies) — dev only
└── vite.config.js
```
