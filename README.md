# Western Balkans Artist Residencies — Interactive Map

Interactive map of artist colonies in Serbia, Bosnia and Herzegovina, and North Macedonia.
Built for the Goethe-Institut Belgrade as part of the *Beyond the Cities* project (2026–2028).

**Tech stack:** MapLibre GL JS · Protomaps PMTiles · Vanilla JS (ES Modules) · Vite · Cloudflare Pages

---

## Quick start (development)

```bash
npm install
npm run dev
```

Open <http://localhost:5173> (or whichever port Vite assigns).

---

## PMTiles — getting the self-hosted tile file

For production you need a PMTiles extract covering the Western Balkans.
The fallback in `main.js` uses the Protomaps cloud CDN during development.

### Option A — Protomaps web extract (recommended)

1. Go to <https://app.protomaps.com/downloads/osm>
2. Draw or enter the bounding box:
   - SW: **40.0, 13.0** (lat, lon)
   - NE: **47.5, 23.5**
3. Download the `.pmtiles` file (≈ 200–400 MB for this region).
4. Place it at `public/tiles/balkans.pmtiles`.

### Option B — CLI extract with `pmtiles` tool

```bash
# Install the pmtiles CLI
brew install pmtiles   # macOS

# Extract from the Protomaps planet file
pmtiles extract https://build.protomaps.com/20240101.pmtiles balkans.pmtiles \
  --bbox=13.0,40.0,23.5,47.5
```

### Wiring the local file

In `main.js`, replace the `PMTILES_URL` line and restore the source in `map-style.json`:

```js
// main.js — replace this line:
const PMTILES_URL = 'https://api.protomaps.com/tiles/v3.json?key=REPLACE_WITH_YOUR_KEY';

// With:
const PMTILES_URL = 'pmtiles:///tiles/balkans.pmtiles';
```

And update `style.sources.protomaps` back to:

```json
{
  "type": "vector",
  "url": "pmtiles:///tiles/balkans.pmtiles",
  "attribution": "© OpenStreetMap contributors"
}
```

---

## Build for production

```bash
npm run build
```

Output goes to `dist/`. Copy your `balkans.pmtiles` into `dist/tiles/` before deploying.

---

## Deploy to Cloudflare Pages

1. Push the repo to GitHub.
2. In Cloudflare Pages → **Create a project** → connect the repo.
3. Build settings:
   - **Framework preset:** None (Vite)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Upload `balkans.pmtiles` to the Pages project via `wrangler pages deployment` or place it in `public/tiles/` before building (it will be copied to `dist/tiles/` automatically).

> **GDPR note:** With self-hosted PMTiles on Cloudflare Pages, no third-party servers receive visitor IP addresses. All map tile requests are served from your own Cloudflare domain.

---

## Data

Colony data lives in `data/colonies.json`. For production, replace with a live fetch from the Airtable REST API — the data shape is identical to the Airtable schema defined in the project brief.

---

## Project structure

```
btc-map/
├── index.html          # App shell
├── style.css           # All styles (CSS custom properties)
├── main.js             # App logic (ES modules, no framework)
├── map-style.json      # MapLibre style (Protomaps vector tiles)
├── vite.config.js
├── data/
│   └── colonies.json   # Mock data (6 colonies, 2 per country)
└── assets/
    └── markers/        # (reserved for future custom marker SVGs)
```
