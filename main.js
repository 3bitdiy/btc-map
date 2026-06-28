import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile.bind(protocol));

// Canonical discipline taxonomy. Raw `art_field` values are messy (mixed case,
// typos, synonyms, audience/theme qualifiers), so every token is normalized and
// mapped onto this fixed set for both filtering and display. Order here is the
// curated order used for the filter chips.
const CANONICAL_DISCIPLINES = [
  "Painting",
  "Sculpture",
  "Visual arts",
  "Graphic arts",
  "Photography",
  "Film & video",
  "Multimedia",
  "Literature",
  "Calligraphy",
  "Applied arts",
  "Crafts & pottery",
  "Street art",
  "Folk & naive art",
  "Performance",
  "Dance",
  "Multidisciplinary",
];

// Maps a normalized token (lowercased, single-spaced) to a canonical discipline.
const DISCIPLINE_SYNONYMS = {
  painting: "Painting",
  paiting: "Painting",
  sculpture: "Sculpture",
  "visual arts": "Visual arts",
  "visual art": "Visual arts",
  visual: "Visual arts",
  "contemporary visual arts": "Visual arts",
  "contemporary arts": "Visual arts",
  installations: "Visual arts",
  "graphic arts": "Graphic arts",
  "graphic art": "Graphic arts",
  photography: "Photography",
  film: "Film & video",
  "video art": "Film & video",
  multimedia: "Multimedia",
  literature: "Literature",
  literrature: "Literature",
  "literary criticism": "Literature",
  publishing: "Literature",
  poetry: "Literature",
  calligraphy: "Calligraphy",
  "applied arts": "Applied arts",
  "art pottery": "Crafts & pottery",
  pottery: "Crafts & pottery",
  "street art": "Street art",
  murals: "Street art",
  naive: "Folk & naive art",
  "folk arts": "Folk & naive art",
  performance: "Performance",
  "experimental practices": "Performance",
  "contemporary dance": "Dance",
  multidisciplinary: "Multidisciplinary",
  "interdisciplinary arts": "Multidisciplinary",
};

// Tokens that are qualifiers (audience, theme, activity) rather than a
// discipline. They are stripped so they never become filter chips.
const DISCIPLINE_IGNORE = new Set([
  "kids",
  "open topics",
  "art education",
  "cultural heritage",
]);

const warnedDisciplines = new Set();

const DEFAULT_SCOPES = ["National", "Regional", "International"];
const DEFAULT_COUNTRIES = [
  "Bosnia and Herzegovina",
  "North Macedonia",
  "Serbia",
];

const MARKER_ICONS = [
  "/assets/icons/house01.svg",
  "/assets/icons/house02.svg",
  "/assets/icons/house04.svg",
  "/assets/icons/house05.svg",
  "/assets/icons/house06.svg",
  "/assets/icons/house07.svg",
  "/assets/icons/house08.svg",
  "/assets/icons/house09.svg",
  "/assets/icons/house10.svg",
  "/assets/icons/house11.svg",
  "/assets/icons/house12.svg",
];

// Small visual nudge so markers don't sit exactly on top of city-name anchors.
const MARKER_BASE_OFFSET_METERS_EAST = 500;
const MARKER_BASE_OFFSET_METERS_NORTH = -500;
const COLONY_FOCUS_MIN_ZOOM = 10.5;
const COLONY_LIST_FOCUS_ZOOM = 9.2;

const state = {
  map: null,
  colonies: [],
  selectedColony: null,
  markers: [],
  activeCountries: new Set(DEFAULT_COUNTRIES),
  activeDisciplines: new Set(),
  allDisciplines: new Set(),
  activeScopes: new Set(DEFAULT_SCOPES),
  openCountry: null,
  panelMinimized: false,
  filterPanelMinimized: false,
};

function titleCaseDiscipline(key) {
  return key.replace(/\b\w/g, (char) => char.toUpperCase());
}

// Resolves a single raw token to a canonical discipline, or null if it is a
// qualifier to be dropped. Unknown tokens fall back to a title-cased version
// (so future data is never silently lost) and are logged once for follow-up.
function canonicalizeDiscipline(token) {
  const key = normalizeText(token).toLowerCase().replace(/\s+/g, " ").trim();
  if (!key || DISCIPLINE_IGNORE.has(key)) return null;

  const canonical = DISCIPLINE_SYNONYMS[key];
  if (canonical) return canonical;

  if (!warnedDisciplines.has(key)) {
    warnedDisciplines.add(key);
    console.warn(
      `Unmapped discipline token "${token}" — using "${titleCaseDiscipline(key)}". Add it to DISCIPLINE_SYNONYMS or DISCIPLINE_IGNORE.`,
    );
  }
  return titleCaseDiscipline(key);
}

function normalizeText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function getColonyName(colony) {
  return normalizeText(colony.art_colony_name || colony.name);
}

function getColonyCountry(colony) {
  return normalizeText(colony.country);
}

function getColonyCity(colony) {
  return normalizeText(colony.city);
}

function getColonyPlace(colony) {
  return normalizeText(colony.place);
}

function getColonyDisplayLocation(colony) {
  const city = getColonyCity(colony);
  const place = getColonyPlace(colony);

  if (city && place) {
    if (city.localeCompare(place, undefined, { sensitivity: "base" }) === 0) {
      return city;
    }
    return `${city} · ${place}`;
  }

  return city || place || getColonyCountry(colony);
}

function getColonyScope(colony) {
  const raw = normalizeText(colony.scope);
  const lower = raw.toLowerCase();
  if (lower.includes("national")) return "National";
  if (lower.includes("regional")) return "Regional";
  if (lower.includes("international")) return "International";

  return "Unspecified";
}

function parseCoordinateValue(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function getColonyCoordinates(colony) {
  const latitude = parseCoordinateValue(colony.latitude);
  const longitude = parseCoordinateValue(colony.longitude);
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

function applyBaseMarkerOffset(coords) {
  const metersPerDegreeLat = 111320;
  const latRad = (coords.latitude * Math.PI) / 180;
  const metersPerDegreeLng = Math.max(
    1e-6,
    metersPerDegreeLat * Math.cos(latRad),
  );

  return {
    latitude:
      coords.latitude + MARKER_BASE_OFFSET_METERS_NORTH / metersPerDegreeLat,
    longitude:
      coords.longitude + MARKER_BASE_OFFSET_METERS_EAST / metersPerDegreeLng,
  };
}

function getColonyLocations(colony) {
  const locations = [];
  const seen = new Set();

  const pushLocation = (latitude, longitude, label = "") => {
    const offset = applyBaseMarkerOffset({ latitude, longitude });
    const key = `${offset.latitude.toFixed(6)}:${offset.longitude.toFixed(6)}`;
    if (seen.has(key)) return;
    seen.add(key);
    locations.push({
      latitude: offset.latitude,
      longitude: offset.longitude,
      label,
    });
  };

  const primary = getColonyCoordinates(colony);
  if (primary) {
    pushLocation(
      primary.latitude,
      primary.longitude,
      getColonyDisplayLocation(colony),
    );
  }

  if (Array.isArray(colony.location_points)) {
    colony.location_points.forEach((point) => {
      if (!point || typeof point !== "object") return;
      const lat = parseCoordinateValue(point.latitude);
      const lon = parseCoordinateValue(point.longitude);
      if (lat === null || lon === null) return;
      pushLocation(lat, lon, normalizeText(point.label));
    });
  }

  return locations;
}

function getColonyDisciplines(colony) {
  const artField = normalizeText(colony.art_field);

  const rawTokens =
    !artField && Array.isArray(colony.disciplines)
      ? colony.disciplines.map((entry) => normalizeText(entry))
      : artField
          .split(/[,;/\-]/)
          .flatMap((part) => part.split(/\s+and\s+|\s*&\s*/i));

  const seen = new Set();
  const result = [];
  rawTokens.forEach((token) => {
    const canonical = canonicalizeDiscipline(token);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      result.push(canonical);
    }
  });

  return result;
}

function markerIconFor(colony) {
  const safeId = Number(colony.id);
  const basis = Number.isFinite(safeId) ? safeId : getColonyName(colony).length;
  const idx = (basis * 7 + 3) % MARKER_ICONS.length;
  return MARKER_ICONS[idx];
}

// The house icon as a CSS-masked span so its color follows the active palette
// (the SVGs are single-colour silhouettes).
function markerIconMarkup(colony) {
  const icon = markerIconFor(colony);
  return `<span class="map-marker__icon" style="-webkit-mask-image:url('${icon}');mask-image:url('${icon}')"></span>`;
}

function markerScaleForZoom(zoom) {
  const minZoom = 5;
  const maxZoom = 12;
  const minScale = 0.42;
  const maxScale = 4.2;

  const t = Math.min(1, Math.max(0, (zoom - minZoom) / (maxZoom - minZoom)));
  // Slightly larger on load, but noticeably stronger growth on zoom-in.
  const eased = Math.pow(t, 1.35);
  return minScale + (maxScale - minScale) * eased;
}

function syncMarkerScale() {
  if (!state.map) return;
  const zoom = state.map.getZoom();
  document.documentElement.style.setProperty(
    "--marker-zoom-scale",
    markerScaleForZoom(zoom).toFixed(3),
  );
  // Show place labels under markers once zoomed in enough that they're spread.
  document.getElementById("map")?.classList.toggle("show-marker-labels", zoom >= 9.5);
}

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

// Mix a hex color toward black by `amount` (0..1).
function darken(hex, amount) {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const channel = (i) => {
    const v = parseInt(full.slice(i, i + 2), 16);
    return Math.round(v * (1 - amount))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

// Theme-driven colors for the vector-tile layers. The road/boundary tones are
// progressively darker shades of the land so they read as the same earthy
// family in every palette (the darken factors reproduce the original
// Terracotta values exactly).
function mapThemeColors() {
  const land = cssVar("--map-land", "#edd1aa");
  const bg = cssVar("--map-bg", "#c2c9bc");
  const wine = cssVar("--wine", "#8d313a");
  return {
    land,
    bg,
    wine,
    minor: darken(land, 0.14),
    secondary: darken(land, 0.21),
    primary: darken(land, 0.3),
    motorway: darken(land, 0.39),
    boundary: darken(land, 0.4),
  };
}

// [layer id, paint property, color key]
const MAP_THEME_PAINT = [
  ["background", "background-color", "bg"],
  ["global-land", "fill-color", "land"],
  ["landcover-grass", "fill-color", "land"],
  ["landuse-park", "fill-color", "land"],
  ["water", "fill-color", "bg"],
  ["waterway", "line-color", "bg"],
  ["roads-minor", "line-color", "minor"],
  ["roads-secondary", "line-color", "secondary"],
  ["roads-primary", "line-color", "primary"],
  ["roads-motorway", "line-color", "motorway"],
  ["boundary-country", "line-color", "boundary"],
  ["place-city", "text-color", "wine"],
  ["place-state", "text-color", "wine"],
  ["place-country", "text-color", "wine"],
];

// Paint the theme colors onto a style object before the map is created.
function paintStyleTheme(style) {
  const colors = mapThemeColors();
  MAP_THEME_PAINT.forEach(([id, prop, key]) => {
    const layer = style.layers.find((l) => l.id === id);
    if (!layer) return;
    layer.paint = { ...(layer.paint || {}), [prop]: colors[key] };
  });
}

// Re-tint the live map to match the active palette (driven by the theme
// switcher's "btc-theme-change" event).
function applyMapTheme() {
  if (!state.map) return;
  const colors = mapThemeColors();
  MAP_THEME_PAINT.forEach(([id, prop, key]) => {
    if (state.map.getLayer(id)) {
      state.map.setPaintProperty(id, prop, colors[key]);
    }
  });
}

function resolveColonyPhoto(colony) {
  const firstPhoto = colony.photos?.[0];
  if (!firstPhoto) return "/assets/images/colony-placeholder.png";
  if (firstPhoto.includes("placehold.co"))
    return "/assets/images/colony-placeholder.png";
  return firstPhoto;
}

async function loadColoniesData() {
  const fetchJson = async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}`);
    }

    const text = await response.text();
    const trimmed = text.trimStart();
    if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
      throw new Error(`Non-JSON response from ${url}`);
    }

    return JSON.parse(text);
  };

  const loadByFiles = async (files) => {
    if (!Array.isArray(files) || !files.length) return [];

    const payloads = await Promise.all(
      files.map(async (entry) => {
        const clean = String(entry).replace(/^\/+/, "");
        const json = await fetchJson(`/data/${clean}`);
        return Array.isArray(json) ? json : [];
      }),
    );

    return payloads.flat();
  };

  try {
    const manifest = await fetchJson("/data/colonies.manifest.json");
    const files = Array.isArray(manifest?.files) ? manifest.files : [];
    const fromManifest = await loadByFiles(files);
    if (fromManifest.length) return fromManifest;
  } catch (error) {
    console.warn(
      "Using fallback colony data due to manifest load error:",
      error,
    );
  }

  try {
    const fromKnownFiles = await loadByFiles([
      "colonies-serbia.json",
      "colonies-bosnia-and-herzegovina.json",
      "colonies-north-macedonia.json",
    ]);
    if (fromKnownFiles.length) return fromKnownFiles;
  } catch (error) {
    console.warn("Known split files were not available:", error);
  }

  const fallbackJson = await fetchJson("/data/colonies.json");
  if (Array.isArray(fallbackJson)) return fallbackJson;
  return [];
}

async function initMap() {
  const styleResponse = await fetch("/map-style.json");
  const style = await styleResponse.json();

  style.sources.openmaptiles = {
    type: "vector",
    url: "pmtiles://https://pub-8a5794882e694e698061867fcf4ccf10.r2.dev/wb-light.pmtiles",
    attribution:
      "© <a href='https://openmaptiles.org'>OpenMapTiles</a> © <a href='https://openstreetmap.org'>OpenStreetMap</a> contributors",
  };

  style.sources.globalbase = {
    type: "vector",
    url: "pmtiles://https://pub-8a5794882e694e698061867fcf4ccf10.r2.dev/world-basic-z11.pmtiles",
    attribution:
      "© <a href='https://www.naturalearthdata.com'>Natural Earth</a>",
  };

  if (!style.layers.some((layer) => layer.id === "global-land")) {
    const backgroundIndex = style.layers.findIndex(
      (layer) => layer.id === "background",
    );
    const insertIndex = backgroundIndex >= 0 ? backgroundIndex + 1 : 0;

    style.layers.splice(insertIndex, 0, {
      id: "global-land",
      type: "fill",
      source: "globalbase",
      "source-layer": "land",
      maxzoom: 24,
      paint: { "fill-opacity": 1 },
    });
  }

  // Tint background, land, landcover, water, roads, boundaries and labels to
  // the active palette so zoomed-in detail matches (not just the base land).
  paintStyleTheme(style);

  const map = new maplibregl.Map({
    container: "map",
    style,
    renderWorldCopies: false,
    // Start already framed on the project region (static bbox of the colonies)
    // so the very first painted frame is correct — no zoom jump once the
    // markers and exact fit are computed on load.
    bounds: REGION_BOUNDS,
    fitBoundsOptions: { padding: getFitPadding(), maxZoom: 9 },
    // Keep the view on the region: can't roam into far neighbours …
    maxBounds: MAX_BOUNDS,
    maxZoom: 14,
    dragRotate: true,
    touchZoomRotate: true,
  });

  // … and only a little past the initial framing, with enough headroom that
  // every marker stays visible on any aspect ratio.
  map.setMinZoom(Math.max(3.8, map.getZoom() - 1.4));

  return map;
}

// Static bounding box of the project region (colony bbox), used to frame the
// map at construction time. [SW, NE] as [lng, lat].
const REGION_BOUNDS = [
  [16.16, 41.03],
  [22.64, 46.1],
];

// Soft limit for panning — the region plus a generous margin so every marker
// stays reachable on any aspect ratio, while still preventing wandering off to
// other continents.
const MAX_BOUNDS = [
  [10.5, 35.5],
  [28.5, 50.5],
];

// Bounding box around every marker location, used to frame the whole project
// region on load regardless of viewport size.
function getRegionBounds(colonies) {
  const bounds = new maplibregl.LngLatBounds();
  let extended = false;

  colonies.forEach((colony) => {
    getColonyLocations(colony).forEach((loc) => {
      bounds.extend([loc.longitude, loc.latitude]);
      extended = true;
    });
  });

  return extended ? bounds : null;
}

// Padding (px) kept clear of the overlay panels so the region is never hidden
// behind the left sidebar (~291px) or the open detail panel (~341px).
function getFitPadding() {
  const mode = getViewportMode();
  if (mode === "desktop") {
    return { top: 96, right: 360, bottom: 48, left: 312 };
  }
  if (mode === "tablet") {
    return { top: 80, right: 60, bottom: 80, left: 60 };
  }
  return { top: 72, right: 24, bottom: 120, left: 24 };
}

function fitToRegion(colonies, animate = false) {
  if (!state.map) return;
  const source = colonies.length ? colonies : state.colonies;
  const bounds = getRegionBounds(source);
  if (!bounds) return;

  state.map.fitBounds(bounds, {
    padding: getFitPadding(),
    maxZoom: 9,
    animate,
  });
}

function getColonyShortPlace(colony) {
  return (
    getColonyCity(colony) ||
    getColonyPlace(colony) ||
    getColonyCountry(colony)
  );
}

// Place label shown under the marker once zoomed in (see show-marker-labels).
function makeMarkerLabel(text) {
  const label = document.createElement("span");
  label.className = "map-marker__label";
  label.textContent = text;
  return label;
}

// Inner wrapper holding the icon, optional count badge and place label. It's
// the part we slide on rebuild so markers animate apart/together on zoom.
function makeMarkerInner(iconColony, countText, placeText) {
  const inner = document.createElement("div");
  inner.className = "map-marker__inner";
  inner.innerHTML = markerIconMarkup(iconColony);
  if (countText != null) {
    const count = document.createElement("span");
    count.className = "map-marker__count";
    count.textContent = countText;
    inner.appendChild(count);
  }
  inner.appendChild(makeMarkerLabel(placeText));
  return inner;
}

// Shared hover tooltip (desktop) — built lazily, follows the cursor.
let mapTooltipEl = null;

function moveTooltip(event) {
  if (!mapTooltipEl) return;
  mapTooltipEl.style.left = `${event.clientX}px`;
  mapTooltipEl.style.top = `${event.clientY}px`;
}

function attachMarkerTooltip(el, title, subtitle) {
  el.addEventListener("mouseenter", (event) => {
    if (!mapTooltipEl) {
      mapTooltipEl = document.createElement("div");
      mapTooltipEl.className = "map-tooltip";
      mapTooltipEl.setAttribute("aria-hidden", "true");
      mapTooltipEl.innerHTML = `<strong></strong><span></span>`;
      document.body.appendChild(mapTooltipEl);
    }
    mapTooltipEl.querySelector("strong").textContent = title;
    mapTooltipEl.querySelector("span").textContent = subtitle || "";
    mapTooltipEl.classList.add("is-visible");
    moveTooltip(event);
  });
  el.addEventListener("mousemove", moveTooltip);
  el.addEventListener("mouseleave", () => {
    mapTooltipEl?.classList.remove("is-visible");
  });
}

function createMarkerElement(colony, focusCoords = null) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "map-marker";
  el.setAttribute("aria-label", getColonyName(colony));
  el.appendChild(makeMarkerInner(colony, null, getColonyShortPlace(colony)));

  el.addEventListener("click", (event) => {
    event.stopPropagation();
    openPanel(colony, true, focusCoords);
  });

  attachMarkerTooltip(el, getColonyName(colony), getColonyDisplayLocation(colony));
  return el;
}

// A count marker for several nearby colonies. Clicking it zooms to split them
// (or shows a picker when they can't be separated — see onClusterClick).
function createClusterElement(cluster) {
  const count = cluster.colonies.length;
  const el = document.createElement("button");
  el.type = "button";
  el.className = "map-marker map-marker--cluster";
  el.setAttribute("aria-label", `${count} colonies in this area`);
  el.appendChild(
    makeMarkerInner(
      cluster.colonies[0],
      String(count),
      getColonyShortPlace(cluster.colonies[0]),
    ),
  );

  el.addEventListener("click", (event) => {
    event.stopPropagation();
    onClusterClick(cluster);
  });

  attachMarkerTooltip(el, `${count} colonies`, getColonyShortPlace(cluster.colonies[0]));
  return el;
}

let activeLocationPicker = null;

function closeLocationPicker() {
  if (activeLocationPicker) {
    activeLocationPicker.remove();
    activeLocationPicker = null;
  }
}

function openLocationPicker(colonies, coords) {
  closeLocationPicker();
  // Clear any current selection so the previously selected marker doesn't stay
  // highlighted while the visitor is choosing from this cluster.
  if (state.selectedColony) showPanelIntro();

  const content = document.createElement("div");
  content.className = "loc-picker";

  const sorted = [...colonies].sort((a, b) =>
    getColonyName(a).localeCompare(getColonyName(b)),
  );

  const title = document.createElement("p");
  title.className = "loc-picker__title";
  title.textContent = `${colonies.length} colonies here`;
  content.appendChild(title);

  const list = document.createElement("div");
  list.className = "loc-picker__list";
  sorted.forEach((colony) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "loc-picker__item";
    item.textContent = getColonyName(colony);
    item.addEventListener("click", () => {
      popup.remove();
      openPanel(colony, true, coords, COLONY_LIST_FOCUS_ZOOM);
    });
    list.appendChild(item);
  });
  content.appendChild(list);

  const popup = new maplibregl.Popup({
    offset: 22,
    closeButton: true,
    closeOnClick: true,
    focusAfterOpen: false,
    className: "loc-popup",
    maxWidth: "260px",
  })
    .setLngLat([coords.longitude, coords.latitude])
    .setDOMContent(content)
    .addTo(state.map);

  activeLocationPicker = popup;
  popup.on("close", () => {
    if (activeLocationPicker === popup) activeLocationPicker = null;
  });
}

function getVisibleColonies() {
  return state.colonies.filter((colony) => {
    if (!getColonyLocations(colony).length) return false;
    if (!state.activeCountries.has(getColonyCountry(colony))) return false;

    const scope = getColonyScope(colony);
    if (scope !== "Unspecified" && !state.activeScopes.has(scope)) return false;

    const disciplines = getColonyDisciplines(colony);
    if (!disciplines.length) return false;
    return disciplines.some((discipline) =>
      state.activeDisciplines.has(discipline),
    );
  });
}

function getStableMarkerOrder(a, b) {
  const aId = Number(a.colony.id);
  const bId = Number(b.colony.id);
  if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) {
    return aId - bId;
  }
  return getColonyName(a.colony).localeCompare(getColonyName(b.colony));
}

// Zoom-based proximity clustering: group markers within a pixel threshold of
// each other at the current zoom into one cluster. As you zoom in the same
// geographic gaps grow in pixels, so clusters split apart. A one-colony group
// renders as a normal marker.
function clusterEntries(entries) {
  if (!state.map || entries.length === 0) {
    return entries.map((entry) => ({
      coords: entry.coords,
      members: [entry],
      colonies: [entry.colony],
    }));
  }

  const scale = markerScaleForZoom(state.map.getZoom());
  // ~75% of a marker's width — merge markers that clearly overlap.
  const thresholdPx = Math.max(13, 36 * scale);

  const projected = entries.map((entry) => ({
    ...entry,
    point: state.map.project([entry.coords.longitude, entry.coords.latitude]),
  }));
  projected.sort(getStableMarkerOrder);

  const groups = [];
  projected.forEach((entry) => {
    let target = null;
    let best = Number.POSITIVE_INFINITY;
    groups.forEach((group) => {
      const d = Math.hypot(entry.point.x - group.cx, entry.point.y - group.cy);
      if (d <= thresholdPx && d < best) {
        best = d;
        target = group;
      }
    });

    if (!target) {
      groups.push({ cx: entry.point.x, cy: entry.point.y, members: [entry] });
      return;
    }
    target.members.push(entry);
    const n = target.members.length;
    target.cx = (target.cx * (n - 1) + entry.point.x) / n;
    target.cy = (target.cy * (n - 1) + entry.point.y) / n;
  });

  return groups.map((group) => {
    let coords;
    if (group.members.length === 1) {
      coords = group.members[0].coords;
    } else {
      const ll = state.map.unproject([group.cx, group.cy]);
      coords = { latitude: ll.lat, longitude: ll.lng };
    }

    const seen = new Set();
    const colonies = [];
    group.members.forEach((member) => {
      if (!seen.has(member.colony.id)) {
        seen.add(member.colony.id);
        colonies.push(member.colony);
      }
    });

    return { coords, members: group.members, colonies };
  });
}

// Click on a count cluster: if its colonies are spread, zoom to fit them so
// they split apart; if they share (almost) the same spot — or we're already at
// max zoom — let the visitor pick from a list instead.
function onClusterClick(cluster) {
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  cluster.members.forEach(({ coords }) => {
    minLat = Math.min(minLat, coords.latitude);
    maxLat = Math.max(maxLat, coords.latitude);
    minLng = Math.min(minLng, coords.longitude);
    maxLng = Math.max(maxLng, coords.longitude);
  });

  // Would the members actually separate if we zoomed all the way in? Compare
  // their widest pairwise gap (in pixels at the deepest fit zoom) to the
  // cluster threshold there. If they'd still be one cluster, zooming is
  // pointless — show the picker instead.
  const fitMaxZoom = 13;
  const thresholdPx = Math.max(13, 36 * markerScaleForZoom(fitMaxZoom));
  const worldSize = 512 * Math.pow(2, fitMaxZoom);
  const points = cluster.members.map(({ coords }) => {
    const sin = Math.sin((coords.latitude * Math.PI) / 180);
    return {
      x: (worldSize * (coords.longitude + 180)) / 360,
      y: worldSize * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)),
    };
  });
  let maxGap = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      maxGap = Math.max(
        maxGap,
        Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y),
      );
    }
  }

  const atMaxZoom = state.map.getZoom() >= state.map.getMaxZoom() - 0.4;
  if (maxGap <= thresholdPx || atMaxZoom) {
    openLocationPicker(cluster.colonies, cluster.coords);
  } else {
    state.map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 110, maxZoom: fitMaxZoom, animate: true },
    );
  }
}

// Identity of a single marker entry: a colony AT a specific location. Keyed by
// colony + coords so a multi-location colony (location_points) matches the
// right marker per spot during the slide animation.
function entryKey(colony, coords) {
  return `${colony.id}@${coords.latitude.toFixed(5)},${coords.longitude.toFixed(5)}`;
}

function buildMarkers() {
  // Remember where each marker entry sat (screen pixels) so the rebuilt markers
  // can slide from there to their new spot — i.e. animate apart on zoom-in and
  // together on zoom-out.
  const prevPositions = new Map();
  if (state.map) {
    state.markers.forEach(({ marker, members }) => {
      const point = state.map.project(marker.getLngLat());
      members.forEach((member) => {
        const key = entryKey(member.colony, member.coords);
        if (!prevPositions.has(key)) prevPositions.set(key, point);
      });
    });
  }

  state.markers.forEach(({ marker }) => marker.remove());
  state.markers = [];
  if (state.map) state.markerZoom = state.map.getZoom();

  const visible = getVisibleColonies();
  const entries = [];

  visible.forEach((colony) => {
    const locations = getColonyLocations(colony);
    locations.forEach((coords) => {
      entries.push({ colony, coords });
    });
  });

  const clusters = clusterEntries(entries);
  // Render single markers first, count clusters last, so a cluster (and its
  // badge) always stacks above overlapping single markers.
  clusters.sort((a, b) => a.colonies.length - b.colonies.length);
  clusters.forEach((cluster) => {
    const element =
      cluster.colonies.length > 1
        ? createClusterElement(cluster)
        : createMarkerElement(cluster.colonies[0], cluster.coords);

    const marker = new maplibregl.Marker({ element, anchor: "center" })
      .setLngLat([cluster.coords.longitude, cluster.coords.latitude])
      .addTo(state.map);

    animateMarkerFrom(element, cluster, prevPositions);
    state.markers.push({
      marker,
      colonies: cluster.colonies,
      members: cluster.members,
    });
  });

  updateMarkerSelection();
  return visible;
}

// Slide a freshly-built marker from where one of its colonies previously sat to
// its new position, so clusters visibly split/merge on zoom instead of snapping.
function animateMarkerFrom(element, cluster, prevPositions) {
  if (!state.map || prevPositions.size === 0) return;

  let source = null;
  for (const member of cluster.members) {
    const key = entryKey(member.colony, member.coords);
    if (prevPositions.has(key)) {
      source = prevPositions.get(key);
      break;
    }
  }
  if (!source) return;

  const target = state.map.project([
    cluster.coords.longitude,
    cluster.coords.latitude,
  ]);
  const dx = source.x - target.x;
  const dy = source.y - target.y;
  if (Math.hypot(dx, dy) < 2) return;

  const inner = element.querySelector(".map-marker__inner");
  if (!inner) return;

  inner.style.transition = "none";
  inner.style.transform = `translate(${dx}px, ${dy}px)`;
  inner.style.opacity = "0.55";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      inner.style.transition = "";
      inner.style.transform = "";
      inner.style.opacity = "";
    });
  });
}

function updateMarkerSelection() {
  const selectedId = state.selectedColony?.id;
  state.markers.forEach(({ marker, colonies }) => {
    const selected = colonies.some((colony) => colony.id === selectedId);
    marker.getElement().classList.toggle("is-selected", selected);
  });
  updateColonyListSelection();
}

function updateColonyListSelection() {
  const selectedId = state.selectedColony
    ? String(state.selectedColony.id)
    : null;
  document.querySelectorAll(".colony-item-btn").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    const isSelected = !!selectedId && button.dataset.colonyId === selectedId;
    button.classList.toggle("is-selected", isSelected);
  });
}

// Colonies of one country matching the active discipline/scope filters. The
// country toggle itself is intentionally ignored here — an unchecked country
// still reports its count so the header stays informative; it just renders
// dimmed and non-expandable.
function getCountryColonies(country) {
  return state.colonies
    .filter((colony) => {
      if (getColonyCountry(colony) !== country) return false;
      if (!getColonyLocations(colony).length) return false;

      const scope = getColonyScope(colony);
      if (scope !== "Unspecified" && !state.activeScopes.has(scope)) {
        return false;
      }

      const disciplines = getColonyDisciplines(colony);
      if (!disciplines.length) return false;
      return disciplines.some((d) => state.activeDisciplines.has(d));
    })
    .sort((a, b) => getColonyName(a).localeCompare(getColonyName(b)));
}

// Single-open: applies state.openCountry across the sections without rebuilding
// (used by the expand buttons, which don't change the map).
function setOpenCountry(country) {
  state.openCountry = country;
  const wrap = document.getElementById("country-accordion");
  if (!wrap) return;

  wrap.querySelectorAll(".country-section").forEach((section) => {
    const sectionCountry = section.dataset.country;
    const active = state.activeCountries.has(sectionCountry);
    const open = active && sectionCountry === country;
    section.classList.toggle("is-open", open);

    const expand = section.querySelector(".country-expand");
    const body = section.querySelector(".country-body");
    if (expand) expand.setAttribute("aria-expanded", open ? "true" : "false");
    if (body) body.hidden = !open;
  });
}

function renderCountryAccordion() {
  const wrap = document.getElementById("country-accordion");
  if (!wrap) return;
  wrap.innerHTML = "";

  DEFAULT_COUNTRIES.forEach((country) => {
    const colonies = getCountryColonies(country);
    const active = state.activeCountries.has(country);
    const isOpen = active && state.openCountry === country;
    const bodyId = `country-body-${country.replace(/\s+/g, "-").toLowerCase()}`;

    const section = document.createElement("section");
    section.className = "country-section";
    section.dataset.country = country;
    section.classList.toggle("is-off", !active);
    section.classList.toggle("is-open", isOpen);

    const header = document.createElement("div");
    header.className = "country-header";

    const toggle = document.createElement("label");
    toggle.className = "country-toggle";
    toggle.innerHTML = `<input type="checkbox" name="country" value="${country}" ${
      active ? "checked" : ""
    } aria-label="Show ${country} on the map" />`;

    const expand = document.createElement("button");
    expand.type = "button";
    expand.className = "country-expand";
    expand.setAttribute("aria-expanded", isOpen ? "true" : "false");
    expand.setAttribute("aria-controls", bodyId);
    expand.disabled = !active;
    expand.innerHTML = `
      <span class="country-name">${country}</span>
      <span class="country-count">${colonies.length}</span>
      <img class="country-caret" src="/assets/icons/caret-down.svg" alt="" />
    `;

    header.appendChild(toggle);
    header.appendChild(expand);

    const body = document.createElement("div");
    body.className = "country-body";
    body.id = bodyId;
    body.hidden = !isOpen;

    if (colonies.length) {
      const list = document.createElement("ul");
      list.className = "colony-items";
      colonies.forEach((colony) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "colony-item-btn";
        button.dataset.colonyId = String(colony.id);
        button.textContent = getColonyName(colony);
        item.appendChild(button);
        list.appendChild(item);
      });
      body.appendChild(list);
    } else {
      const empty = document.createElement("p");
      empty.className = "colony-empty";
      empty.textContent = "No colonies for current filters.";
      body.appendChild(empty);
    }

    section.appendChild(header);
    section.appendChild(body);
    wrap.appendChild(section);
  });

  updateColonyListSelection();
}

function openPanel(
  colony,
  focusMap = false,
  focusCoordinates = null,
  focusZoom = COLONY_FOCUS_MIN_ZOOM,
) {
  closeLocationPicker();
  state.selectedColony = colony;
  updateMarkerSelection();

  const fallback = getColonyLocations(colony)[0] || null;
  const coords = focusCoordinates || getColonyCoordinates(colony) || fallback;

  if (focusMap && state.map && coords) {
    state.map.flyTo({
      center: [coords.longitude, coords.latitude],
      zoom: Math.max(state.map.getZoom(), focusZoom),
    });
  }

  const panel = document.getElementById("detail-panel");
  panel.classList.remove("is-intro");
  panel.setAttribute("aria-hidden", "false");
  panel.classList.add("is-open");
  setPanelMinimized(false);

  const photo = document.getElementById("panel-photo");
  photo.src = resolveColonyPhoto(colony);
  photo.alt = getColonyName(colony);
  document.getElementById("panel-photo-wrap").style.display = "";

  const panelMarkerIcon = document.getElementById("panel-marker-icon");
  const panelIcon = markerIconFor(colony);
  panelMarkerIcon.style.webkitMaskImage = `url('${panelIcon}')`;
  panelMarkerIcon.style.maskImage = `url('${panelIcon}')`;

  document.getElementById("panel-name").textContent = getColonyName(colony);
  document.getElementById("panel-location").textContent =
    getColonyDisplayLocation(colony);

  const disciplinesEl = document.getElementById("panel-disciplines");
  disciplinesEl.innerHTML = "";
  getColonyDisciplines(colony)
    .slice(0, 3)
    .forEach((discipline) => {
      const tag = document.createElement("span");
      tag.className = "discipline-tag";
      tag.textContent = discipline;
      disciplinesEl.appendChild(tag);
    });

  document.getElementById("panel-organizer").textContent =
    normalizeText(colony.art_colony_organisers) || "N/A";

  document.getElementById("panel-contact-person").textContent =
    normalizeText(colony.contact_person) || "N/A";
  document.getElementById("panel-time-period").textContent =
    normalizeText(colony.time_period) || "N/A";
  document.getElementById("panel-duration").textContent =
    normalizeText(colony.duration) || "N/A";
  document.getElementById("panel-scope").textContent = getColonyScope(colony);

  const contactList = document.getElementById("panel-contact-list");
  contactList.innerHTML = "";

  if (normalizeText(colony.contact_telephone)) {
    const li = document.createElement("li");
    li.textContent = normalizeText(colony.contact_telephone);
    contactList.appendChild(li);
  }

  if (normalizeText(colony.email_address)) {
    const li = document.createElement("li");
    li.textContent = normalizeText(colony.email_address);
    contactList.appendChild(li);
  }

  if (normalizeText(colony.web_page)) {
    const li = document.createElement("li");
    li.textContent = normalizeText(colony.web_page);
    contactList.appendChild(li);
  }

  if (!contactList.childElementCount) {
    const li = document.createElement("li");
    li.textContent = "N/A";
    contactList.appendChild(li);
  }
}

// Resting state of the detail panel: no colony selected. On desktop the panel
// stays present (showing the project intro) so it never flickers in/out when
// filters change; on mobile/tablet it steps aside (map-first) until a colony
// is picked.
function showPanelIntro() {
  state.selectedColony = null;
  updateMarkerSelection();

  const panel = document.getElementById("detail-panel");
  panel.classList.add("is-intro");
  document.getElementById("panel-intro-count").textContent = String(
    state.colonies.length,
  );

  if (getViewportMode() === "desktop") {
    panel.setAttribute("aria-hidden", "false");
    panel.classList.add("is-open");
    setPanelMinimized(false);
  } else {
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
  }
}

function syncPanelMaximizeButtons() {
  const isMobile = window.matchMedia("(max-width: 767px)").matches;
  const filterButton = document.getElementById("filter-minimize");
  const panelButton = document.getElementById("panel-minimize");
  const app = document.getElementById("app");

  if (!isMobile) {
    app.classList.remove("both-panels-minimized");
    if (filterButton) {
      filterButton.disabled = false;
      filterButton.setAttribute("aria-hidden", "false");
    }
    if (panelButton) {
      panelButton.disabled = false;
      panelButton.setAttribute("aria-hidden", "false");
    }
    return;
  }

  if (!isMobile) return;

  app.classList.remove("both-panels-minimized");
  if (filterButton) {
    filterButton.disabled = false;
    filterButton.setAttribute("aria-hidden", "false");
  }
  if (panelButton) {
    panelButton.disabled = false;
    panelButton.setAttribute("aria-hidden", "false");
  }
}

function setPanelMinimized(minimized) {
  state.panelMinimized = minimized;
  const panel = document.getElementById("detail-panel");
  panel.classList.toggle("is-minimized", minimized);

  const button = document.getElementById("panel-minimize");
  button.setAttribute("aria-expanded", minimized ? "false" : "true");
  syncPanelMaximizeButtons();
}

function setFilterPanelMinimized(minimized) {
  state.filterPanelMinimized = minimized;
  const filterCard = document.getElementById("filter-card");
  filterCard.classList.toggle("is-minimized", minimized);

  const button = document.getElementById("filter-minimize");
  button.setAttribute("aria-expanded", minimized ? "false" : "true");
  syncPanelMaximizeButtons();
}

// Map-independent: reads the filter inputs and refreshes the colony list,
// count and badge. Runs as soon as the data is ready so the panel works even
// before (or without) the map finishing its load. Returns the visible colonies.
function updateFilterResults() {
  // activeCountries is owned by the country accordion handlers (and reset),
  // not re-read here, because its checkboxes live in the rebuilt accordion.
  state.activeDisciplines = new Set(
    Array.from(
      document.querySelectorAll('input[name="discipline"]:checked'),
    ).map((el) => el.value),
  );

  state.activeScopes = new Set(
    Array.from(document.querySelectorAll('input[name="scope"]:checked')).map(
      (el) => el.value,
    ),
  );

  const visible = getVisibleColonies();
  renderCountryAccordion();
  document.getElementById("colony-count").textContent = String(visible.length);

  if (
    state.selectedColony &&
    !visible.some((c) => c.id === state.selectedColony.id)
  ) {
    // The selected colony was filtered out — fall back to the intro state
    // (no flicker) instead of tearing the panel down.
    showPanelIntro();
  }

  updateFilterToggleBadge();
  return visible;
}

function syncFilters() {
  const visible = updateFilterResults();
  // Markers need the map; the list/counts above do not.
  if (state.map) buildMarkers();
  return visible;
}

function buildDisciplineFilters() {
  const wrapper = document.getElementById("discipline-filters");
  wrapper.innerHTML = "";

  const all = new Set();
  state.colonies.forEach((colony) => {
    getColonyDisciplines(colony).forEach((d) => all.add(d));
  });

  const order = new Map(CANONICAL_DISCIPLINES.map((label, i) => [label, i]));
  const sorted = Array.from(all).sort((a, b) => {
    const ia = order.has(a) ? order.get(a) : Number.MAX_SAFE_INTEGER;
    const ib = order.has(b) ? order.get(b) : Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });
  state.allDisciplines = new Set(sorted);
  state.activeDisciplines = new Set(sorted);

  sorted.forEach((discipline) => {
    const label = document.createElement("label");
    label.className = "pill-filter-item";
    label.innerHTML = `
      <input type="checkbox" name="discipline" value="${discipline}" checked />
      <span>${discipline}</span>
    `;
    wrapper.appendChild(label);
  });
}

function updateFilterToggleBadge() {
  const badge = document.getElementById("filter-active-badge");
  const toggle = document.getElementById("filter-toggle");
  if (!badge || !toggle) return;

  const activeCount =
    Math.max(0, DEFAULT_COUNTRIES.length - state.activeCountries.size) +
    Math.max(0, state.allDisciplines.size - state.activeDisciplines.size) +
    Math.max(0, DEFAULT_SCOPES.length - state.activeScopes.size);

  badge.textContent = String(activeCount);
  badge.classList.toggle("is-visible", activeCount > 0);
  badge.setAttribute("aria-hidden", activeCount > 0 ? "false" : "true");
  toggle.setAttribute(
    "aria-label",
    activeCount > 0
      ? `Toggle filters (${activeCount} active)`
      : "Toggle filters",
  );
}

function wirePillVisuals() {
  document
    .getElementById("discipline-filters")
    .addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.name !== "discipline")
        return;
      target
        .closest(".pill-filter-item")
        ?.classList.toggle("is-off", !target.checked);
      syncFilters();
    });
}

function wireCountryAccordion() {
  const wrap = document.getElementById("country-accordion");
  if (!wrap) return;

  // Country checkbox = map filter.
  wrap.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.name !== "country") {
      return;
    }

    const country = target.value;
    if (target.checked) {
      state.activeCountries.add(country);
    } else {
      state.activeCountries.delete(country);
      if (state.openCountry === country) state.openCountry = null;
    }
    syncFilters();
  });

  // Expand button = browse colonies; colony button = open detail panel.
  wrap.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const colonyBtn = target.closest(".colony-item-btn");
    if (colonyBtn instanceof HTMLButtonElement) {
      const colony = state.colonies.find(
        (entry) => String(entry.id) === colonyBtn.dataset.colonyId,
      );
      if (colony) openPanel(colony, true, null, COLONY_LIST_FOCUS_ZOOM);
      return;
    }

    const expandBtn = target.closest(".country-expand");
    if (expandBtn instanceof HTMLButtonElement && !expandBtn.disabled) {
      const country = expandBtn.closest(".country-section")?.dataset.country;
      if (!country) return;
      setOpenCountry(state.openCountry === country ? null : country);
    }
  });
}

function wireCollapsibles() {
  document.querySelectorAll(".select-row").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.getAttribute("data-toggle-target");
      if (!targetId) return;
      const panel = document.getElementById(targetId);
      if (!panel) return;
      const expanded = button.getAttribute("aria-expanded") === "true";
      document.querySelectorAll(".select-row").forEach((otherButton) => {
        if (otherButton === button) return;
        const otherTargetId = otherButton.getAttribute("data-toggle-target");
        if (!otherTargetId) return;
        const otherPanel = document.getElementById(otherTargetId);
        if (!otherPanel) return;
        otherPanel.hidden = true;
        otherButton.setAttribute("aria-expanded", "false");
      });
      panel.hidden = expanded;
      button.setAttribute("aria-expanded", expanded ? "false" : "true");
    });
  });
}

function wireFilterInputs() {
  document.querySelectorAll('input[name="scope"]').forEach((input) => {
    if (input instanceof HTMLInputElement) {
      input
        .closest(".filter-check")
        ?.classList.toggle("is-off", !input.checked);
    }

    input.addEventListener("change", (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement) {
        target
          .closest(".filter-check")
          ?.classList.toggle("is-off", !target.checked);
      }
      syncFilters();
    });
  });
}

function wireFilterPanel() {
  document.getElementById("filter-minimize").addEventListener("click", () => {
    setFilterPanelMinimized(!state.filterPanelMinimized);
  });
}

function wireZoomControls() {
  document
    .getElementById("zoom-in")
    ?.addEventListener("click", () => state.map?.zoomIn());
  document
    .getElementById("zoom-out")
    ?.addEventListener("click", () => state.map?.zoomOut());
  document
    .getElementById("zoom-reset")
    ?.addEventListener("click", () => fitToRegion(getVisibleColonies(), true));
}

function wirePanel() {
  document
    .getElementById("panel-close")
    .addEventListener("click", showPanelIntro);

  document.getElementById("panel-minimize").addEventListener("click", () => {
    const panel = document.getElementById("detail-panel");
    if (panel.getAttribute("aria-hidden") === "true") {
      panel.setAttribute("aria-hidden", "false");
      panel.classList.add("is-open");
      setPanelMinimized(false);
      return;
    }
    setPanelMinimized(!state.panelMinimized);
  });
}

function wireMobileSidebar() {
  const sidebar = document.getElementById("left-sidebar");
  const toggle = document.getElementById("filter-toggle");

  toggle.addEventListener("click", () => {
    const opened = sidebar.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", opened ? "true" : "false");
  });

  document.addEventListener("click", (event) => {
    if (!window.matchMedia("(max-width: 1199px)").matches) return;
    if (!(event.target instanceof Node)) return;
    if (sidebar.contains(event.target) || toggle.contains(event.target)) return;
    sidebar.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  });
}

function wireMobileFilterActions() {
  const sidebar = document.getElementById("left-sidebar");
  const toggle = document.getElementById("filter-toggle");
  const applyButton = document.getElementById("filter-apply-btn");
  const resetButton = document.getElementById("filter-reset-btn");
  if (!sidebar || !toggle || !applyButton || !resetButton) return;

  applyButton.addEventListener("click", () => {
    syncFilters();
    if (window.matchMedia("(max-width: 1199px)").matches) {
      sidebar.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  resetButton.addEventListener("click", () => {
    state.activeCountries = new Set(DEFAULT_COUNTRIES);
    state.openCountry = null;

    document
      .querySelectorAll('input[name="discipline"], input[name="scope"]')
      .forEach((input) => {
        if (input instanceof HTMLInputElement) input.checked = true;
      });

    document
      .querySelectorAll(".pill-filter-item.is-off, .filter-check.is-off")
      .forEach((el) => el.classList.remove("is-off"));

    syncFilters();
  });
}

let viewportMode = null;

function getViewportMode() {
  if (window.matchMedia("(max-width: 767px)").matches) return "mobile";
  if (window.matchMedia("(max-width: 1199px)").matches) return "tablet";
  return "desktop";
}

function applyResponsivePanelDefaults() {
  const mode = getViewportMode();
  if (mode === viewportMode) return;
  viewportMode = mode;

  const sidebar = document.getElementById("left-sidebar");
  const toggle = document.getElementById("filter-toggle");

  if (mode !== "mobile") {
    sidebar.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  }

  if (mode === "desktop") {
    setFilterPanelMinimized(false);
    setPanelMinimized(false);
  } else {
    setFilterPanelMinimized(true);
    setPanelMinimized(true);
  }

  // Keep the detail panel's resting state right for the new viewport: present
  // intro on desktop, stepped aside on mobile/tablet.
  if (!state.selectedColony) showPanelIntro();
}

async function bootstrap() {
  state.map = await initMap();
  syncMarkerScale();
  state.map.on("zoom", syncMarkerScale);
  state.map.on("zoomend", syncMarkerScale);
  // Re-cluster on moveend (fires once after the whole gesture — zoom + inertia —
  // settles), and only when the zoom actually changed, so markers rebuild and
  // animate exactly once per zoom and never on a plain pan.
  state.map.on("moveend", () => {
    if (!state.colonies.length) return;
    const zoom = state.map.getZoom();
    if (state.markerZoom != null && Math.abs(zoom - state.markerZoom) < 0.05) {
      return;
    }
    buildMarkers();
  });
  state.map.on("move", syncMarkerScale);
  state.map.on("load", syncMarkerScale);

  // Clicking empty map deselects (markers stop propagation, so this only fires
  // on the bare map, not on a marker).
  state.map.on("click", () => {
    if (state.selectedColony) showPanelIntro();
  });

  // Track load synchronously so the async data fetch below can't miss it.
  let mapLoaded = state.map.loaded();
  state.map.on("load", () => {
    mapLoaded = true;
  });

  state.colonies = await loadColoniesData();

  buildDisciplineFilters();
  wirePillVisuals();
  wireCountryAccordion();
  wireCollapsibles();
  wireFilterInputs();
  wireFilterPanel();
  wireZoomControls();
  wirePanel();
  wireMobileSidebar();
  wireMobileFilterActions();
  applyResponsivePanelDefaults();
  window.addEventListener("resize", applyResponsivePanelDefaults);
  window.addEventListener("btc-theme-change", applyMapTheme);

  // Populate the country accordion, list and counts straight from the data,
  // so the panel is usable even before the map fires "load" (or if it never
  // does). Markers and region framing still wait for the map below.
  updateFilterResults();

  const renderInitial = () => {
    // The map already opened framed on REGION_BOUNDS (see initMap), so no
    // fitBounds here — that avoids the zoom jump after markers load.
    syncFilters();
    // No auto-selection: the panel rests on its intro state (set above) until
    // the visitor picks a colony.
  };

  // Data loading above is async, so the map may already have fired "load" by
  // now — in which case once("load") would never run and the map would render
  // empty until the first filter interaction. Guard on the tracked state.
  if (mapLoaded || state.map.loaded()) {
    renderInitial();
  } else {
    state.map.once("load", renderInitial);
  }
}

bootstrap().catch(console.error);
