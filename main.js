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
  const scale = markerScaleForZoom(state.map.getZoom());
  document.documentElement.style.setProperty(
    "--marker-zoom-scale",
    scale.toFixed(3),
  );
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

  const backgroundLayer = style.layers.find(
    (layer) => layer.id === "background",
  );
  if (backgroundLayer?.type === "background") {
    backgroundLayer.paint = {
      ...(backgroundLayer.paint || {}),
      "background-color": "#c2c9bc",
    };
  }

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
      paint: {
        "fill-color": "#edd1aa",
        "fill-opacity": 1,
      },
    });
  }

  const map = new maplibregl.Map({
    container: "map",
    style,
    renderWorldCopies: false,
    // Regional default so the first painted frame is already near the project
    // area; fitBounds() refines the exact framing once the map has loaded.
    center: [19.4, 43.6],
    zoom: 5.6,
    minZoom: 1.2,
    maxZoom: 14,
    dragRotate: true,
    touchZoomRotate: true,
  });

  return map;
}

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

function createMarkerElement(colony, focusCoords = null) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "map-marker";
  el.setAttribute("aria-label", getColonyName(colony));
  el.innerHTML = `<img src="${markerIconFor(colony)}" alt="" />`;

  el.addEventListener("click", (event) => {
    event.stopPropagation();
    openPanel(colony, true, focusCoords);
  });

  return el;
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

function seedUnitVector(seedText) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const ratio = (hash >>> 0) / 4294967295;
  const angle = ratio * Math.PI * 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function relaxClusterPixels(members, options) {
  const minSeparationPx = options.minSeparationPx;
  const maxShiftPx = options.maxShiftPx;
  const iterations = options.iterations;
  const pullStrength = options.pullStrength;

  const points = members.map((entry) => ({
    entry,
    x: entry.point.x,
    y: entry.point.y,
    ox: entry.point.x,
    oy: entry.point.y,
  }));

  for (let step = 0; step < iterations; step += 1) {
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i];
        const b = points[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);

        if (distance >= minSeparationPx) continue;

        if (distance < 1e-4) {
          const vec = seedUnitVector(
            `${a.entry.colony.id}:${b.entry.colony.id}`,
          );
          dx = vec.x;
          dy = vec.y;
          distance = 1;
        }

        const push = (minSeparationPx - distance) * 0.5;
        const ux = dx / distance;
        const uy = dy / distance;

        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
      }
    }

    points.forEach((p) => {
      p.x += (p.ox - p.x) * pullStrength;
      p.y += (p.oy - p.y) * pullStrength;

      const offX = p.x - p.ox;
      const offY = p.y - p.oy;
      const offLen = Math.hypot(offX, offY);
      if (offLen > maxShiftPx) {
        const scale = maxShiftPx / offLen;
        p.x = p.ox + offX * scale;
        p.y = p.oy + offY * scale;
      }
    });
  }

  return points;
}

function arrangeMarkerEntries(entries) {
  if (!state.map || entries.length <= 1) {
    return entries.map((entry) => ({ ...entry, markerCoords: entry.coords }));
  }

  const zoom = state.map.getZoom();
  if (zoom < 8) {
    return entries.map((entry) => ({ ...entry, markerCoords: entry.coords }));
  }

  const zoomFactor = Math.min(1, Math.max(0, (zoom - 8) / 4));
  const thresholdPx = 12 + zoomFactor * 10;
  const relaxOptions = {
    minSeparationPx: 8 + zoomFactor * 9,
    maxShiftPx: 5 + zoomFactor * 11,
    iterations: 12,
    pullStrength: 0.2,
  };

  const projected = entries.map((entry) => {
    const point = state.map.project([
      entry.coords.longitude,
      entry.coords.latitude,
    ]);
    return { ...entry, point };
  });

  projected.sort((a, b) => getStableMarkerOrder(a, b));

  const clusters = [];
  projected.forEach((entry) => {
    let target = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    clusters.forEach((cluster) => {
      const dx = entry.point.x - cluster.cx;
      const dy = entry.point.y - cluster.cy;
      const distance = Math.hypot(dx, dy);
      if (distance <= thresholdPx && distance < bestDistance) {
        bestDistance = distance;
        target = cluster;
      }
    });

    if (!target) {
      clusters.push({ cx: entry.point.x, cy: entry.point.y, members: [entry] });
      return;
    }

    target.members.push(entry);
    const n = target.members.length;
    target.cx = (target.cx * (n - 1) + entry.point.x) / n;
    target.cy = (target.cy * (n - 1) + entry.point.y) / n;
  });

  const arranged = [];
  clusters.forEach((cluster) => {
    if (cluster.members.length === 1) {
      const entry = cluster.members[0];
      arranged.push({ ...entry, markerCoords: entry.coords });
      return;
    }

    const members = [...cluster.members].sort(getStableMarkerOrder);
    const relaxed = relaxClusterPixels(members, relaxOptions);

    relaxed.forEach((item) => {
      const entry = item.entry;
      const x = item.x;
      const y = item.y;
      const ll = state.map.unproject([x, y]);

      arranged.push({
        ...entry,
        markerCoords: { latitude: ll.lat, longitude: ll.lng },
      });
    });
  });

  return arranged;
}

function buildMarkers() {
  state.markers.forEach(({ marker }) => marker.remove());
  state.markers = [];

  const visible = getVisibleColonies();
  const entries = [];

  visible.forEach((colony) => {
    const locations = getColonyLocations(colony);
    locations.forEach((coords) => {
      entries.push({ colony, coords });
    });
  });

  const arranged = arrangeMarkerEntries(entries);
  arranged.forEach((entry) => {
    const marker = new maplibregl.Marker({
      element: createMarkerElement(entry.colony, entry.coords),
      anchor: "center",
    })
      .setLngLat([entry.markerCoords.longitude, entry.markerCoords.latitude])
      .addTo(state.map);

    state.markers.push({ marker, colony: entry.colony });
  });

  updateMarkerSelection();
  return visible;
}

function updateMarkerSelection() {
  state.markers.forEach(({ marker, colony }) => {
    const selected = state.selectedColony?.id === colony.id;
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

function renderColonyList(colonies) {
  const wrapper = document.getElementById("colony-list");
  if (!wrapper) return;
  wrapper.innerHTML = "";

  const sorted = [...colonies].sort((a, b) => {
    const countryCmp = getColonyCountry(a).localeCompare(getColonyCountry(b));
    if (countryCmp !== 0) return countryCmp;
    return getColonyName(a).localeCompare(getColonyName(b));
  });

  if (!sorted.length) {
    const empty = document.createElement("p");
    empty.className = "colony-empty";
    empty.textContent = "No colonies for current filters.";
    wrapper.appendChild(empty);
    return;
  }

  const groups = new Map();
  sorted.forEach((colony) => {
    const country = getColonyCountry(colony) || "Other";
    if (!groups.has(country)) groups.set(country, []);
    groups.get(country).push(colony);
  });

  groups.forEach((entries, country) => {
    const group = document.createElement("section");
    group.className = "colony-country-group";

    const heading = document.createElement("h4");
    heading.className = "colony-country-title";
    heading.textContent = country;
    group.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "colony-items";

    entries.forEach((colony) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "colony-item-btn";
      button.dataset.colonyId = String(colony.id);
      button.textContent = getColonyName(colony);
      item.appendChild(button);
      list.appendChild(item);
    });

    group.appendChild(list);
    wrapper.appendChild(group);
  });

  updateColonyListSelection();
}

function openPanel(
  colony,
  focusMap = false,
  focusCoordinates = null,
  focusZoom = COLONY_FOCUS_MIN_ZOOM,
) {
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
  panel.setAttribute("aria-hidden", "false");
  panel.classList.add("is-open");
  setPanelMinimized(false);

  const photo = document.getElementById("panel-photo");
  photo.src = resolveColonyPhoto(colony);
  photo.alt = getColonyName(colony);
  document.getElementById("panel-photo-wrap").style.display = "";

  const panelMarkerIcon = document.getElementById("panel-marker-icon");
  panelMarkerIcon.setAttribute("src", markerIconFor(colony));

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

function closePanel() {
  const panel = document.getElementById("detail-panel");
  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
  setPanelMinimized(false);
  state.selectedColony = null;
  updateMarkerSelection();
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

function syncFilterCardVisualState() {
  const filterCard = document.getElementById("filter-card");
  const hasExpanded = Array.from(document.querySelectorAll(".select-row")).some(
    (button) => button.getAttribute("aria-expanded") === "true",
  );

  filterCard.classList.toggle("filters-expanded", hasExpanded);
}

function syncFilters() {
  state.activeCountries = new Set(
    Array.from(document.querySelectorAll('input[name="country"]:checked')).map(
      (el) => el.value,
    ),
  );

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

  const visible = buildMarkers();
  renderColonyList(visible);
  document.getElementById("colony-count").textContent = String(visible.length);

  if (
    state.selectedColony &&
    !visible.some((c) => c.id === state.selectedColony.id)
  ) {
    closePanel();
  }

  updateFilterToggleBadge();
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

function wireCountryPills() {
  document
    .getElementById("country-filter-list")
    .addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.name !== "country")
        return;
      target
        .closest(".country-pill")
        ?.classList.toggle("is-off", !target.checked);
      syncFilters();
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
      syncFilterCardVisualState();
    });
  });

  syncFilterCardVisualState();
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

function wireColonyList() {
  const wrapper = document.getElementById("colony-list");
  if (!wrapper) return;

  wrapper.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest(".colony-item-btn");
    if (!(button instanceof HTMLButtonElement)) return;

    const id = button.dataset.colonyId;
    if (!id) return;
    const colony = state.colonies.find((entry) => String(entry.id) === id);
    if (!colony) return;
    openPanel(colony, true, null, COLONY_LIST_FOCUS_ZOOM);
  });
}

function wirePanel() {
  document.getElementById("panel-close").addEventListener("click", closePanel);

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
    document
      .querySelectorAll(
        'input[name="country"], input[name="discipline"], input[name="scope"]',
      )
      .forEach((input) => {
        if (input instanceof HTMLInputElement) input.checked = true;
      });

    document
      .querySelectorAll(".pill-filter-item.is-off, .country-pill.is-off")
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

  if (mode === "tablet") {
    setFilterPanelMinimized(true);
    setPanelMinimized(true);
    return;
  }

  if (mode === "mobile") {
    setFilterPanelMinimized(true);
    setPanelMinimized(true);
    return;
  }

  setFilterPanelMinimized(false);
  setPanelMinimized(false);
}

async function bootstrap() {
  state.map = await initMap();
  syncMarkerScale();
  state.map.on("zoom", syncMarkerScale);
  state.map.on("zoomend", syncMarkerScale);
  state.map.on("zoomend", () => {
    if (!state.colonies.length) return;
    buildMarkers();
  });
  state.map.on("move", syncMarkerScale);
  state.map.on("load", syncMarkerScale);

  // Track load synchronously so the async data fetch below can't miss it.
  let mapLoaded = state.map.loaded();
  state.map.on("load", () => {
    mapLoaded = true;
  });

  state.colonies = await loadColoniesData();

  buildDisciplineFilters();
  wirePillVisuals();
  wireCountryPills();
  wireCollapsibles();
  wireFilterInputs();
  wireFilterPanel();
  wireColonyList();
  wirePanel();
  wireMobileSidebar();
  wireMobileFilterActions();
  applyResponsivePanelDefaults();
  window.addEventListener("resize", applyResponsivePanelDefaults);
  updateFilterToggleBadge();

  const renderInitial = () => {
    syncFilters();
    const visible = getVisibleColonies();
    fitToRegion(visible);
    if (visible.length) {
      const idx = Math.floor(Math.random() * visible.length);
      openPanel(visible[idx], false);
      if (getViewportMode() === "tablet" || getViewportMode() === "mobile") {
        setPanelMinimized(true);
      }
    }
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
