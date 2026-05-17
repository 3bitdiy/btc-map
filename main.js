import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile.bind(protocol));

const DISCIPLINE_LABELS = {
  "Vizuelne umetnosti": "Visual arts",
  Zanatstvo: "Craft",
  Književnost: "Literature",
  Muzika: "Music",
  Pozorište: "Theatre",
  Multidisciplinarno: "Multidisciplinary",
  "Digitalne umetnosti": "Digital arts",
};

const DEFAULT_SCOPES = ["National", "Regional", "International"];
const DEFAULT_COUNTRIES = [
  "Serbia",
  "Bosnia and Herzegovina",
  "North Macedonia",
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

function toEnglishDiscipline(label) {
  return DISCIPLINE_LABELS[label] || label;
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

function getColonyLocations(colony) {
  const locations = [];
  const seen = new Set();

  const pushLocation = (latitude, longitude, label = "") => {
    const key = `${latitude.toFixed(6)}:${longitude.toFixed(6)}`;
    if (seen.has(key)) return;
    seen.add(key);
    locations.push({ latitude, longitude, label });
  };

  const primary = getColonyCoordinates(colony);
  if (primary) {
    pushLocation(
      primary.latitude,
      primary.longitude,
      getColonyCity(colony) || getColonyPlace(colony),
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
  if (!artField && Array.isArray(colony.disciplines)) {
    return colony.disciplines
      .map((entry) => toEnglishDiscipline(normalizeText(entry)))
      .filter(Boolean);
  }
  if (!artField) return [];

  return artField
    .split(/,|;|\//)
    .flatMap((part) => part.split(/\s+and\s+|\s*&\s*/i))
    .map((part) => toEnglishDiscipline(normalizeText(part)))
    .filter(Boolean);
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
    console.warn("Using fallback colony data due to manifest load error:", error);
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

  const backgroundLayer = style.layers.find((layer) => layer.id === "background");
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
    center: [20.0, 44.0],
    zoom: 4.2,
    minZoom: 1.2,
    maxZoom: 14,
    dragRotate: true,
    touchZoomRotate: true,
  });

  return map;
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

function arrangeMarkerEntries(entries) {
  if (!state.map || entries.length <= 1) {
    return entries.map((entry) => ({ ...entry, markerCoords: entry.coords }));
  }

  const thresholdPx = 42;
  const projected = entries.map((entry) => {
    const point = state.map.project([entry.coords.longitude, entry.coords.latitude]);
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
    target.cx = ((target.cx * (n - 1)) + entry.point.x) / n;
    target.cy = ((target.cy * (n - 1)) + entry.point.y) / n;
  });

  const arranged = [];
  clusters.forEach((cluster) => {
    if (cluster.members.length === 1) {
      const entry = cluster.members[0];
      arranged.push({ ...entry, markerCoords: entry.coords });
      return;
    }

    const members = [...cluster.members].sort(getStableMarkerOrder);
    const radiusPx = Math.min(110, 24 + members.length * 7);

    members.forEach((entry, idx) => {
      const angle = ((idx / members.length) * Math.PI * 2) - Math.PI / 2;
      const x = cluster.cx + Math.cos(angle) * radiusPx;
      const y = cluster.cy + Math.sin(angle) * radiusPx;
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
}

function openPanel(colony, focusMap = false, focusCoordinates = null) {
  state.selectedColony = colony;
  updateMarkerSelection();

  const fallback = getColonyLocations(colony)[0] || null;
  const coords = focusCoordinates || getColonyCoordinates(colony) || fallback;

  if (focusMap && state.map && coords) {
    state.map.flyTo({
      center: [coords.longitude, coords.latitude],
      zoom: Math.max(state.map.getZoom(), 8),
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
    getColonyCity(colony) || getColonyPlace(colony) || getColonyCountry(colony);

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

function setPanelMinimized(minimized) {
  state.panelMinimized = minimized;
  const panel = document.getElementById("detail-panel");
  panel.classList.toggle("is-minimized", minimized);

  const button = document.getElementById("panel-minimize");
  button.setAttribute("aria-expanded", minimized ? "false" : "true");
}

function setFilterPanelMinimized(minimized) {
  state.filterPanelMinimized = minimized;
  const filterCard = document.getElementById("filter-card");
  filterCard.classList.toggle("is-minimized", minimized);

  const button = document.getElementById("filter-minimize");
  button.setAttribute("aria-expanded", minimized ? "false" : "true");
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

  const sorted = Array.from(all).sort((a, b) => a.localeCompare(b));
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
      panel.hidden = expanded;
      button.setAttribute("aria-expanded", expanded ? "false" : "true");
      syncFilterCardVisualState();
    });
  });

  syncFilterCardVisualState();
}

function wireFilterInputs() {
  document.querySelectorAll('input[name="scope"]').forEach((input) => {
    input.addEventListener("change", syncFilters);
  });
}

function wireFilterPanel() {
  document.getElementById("filter-minimize").addEventListener("click", () => {
    setFilterPanelMinimized(!state.filterPanelMinimized);
  });
}

function wirePanel() {
  document.getElementById("panel-close").addEventListener("click", closePanel);

  document.getElementById("panel-minimize").addEventListener("click", () => {
    if (
      document.getElementById("detail-panel").getAttribute("aria-hidden") ===
      "true"
    )
      return;
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

async function bootstrap() {
  state.map = await initMap();
  syncMarkerScale();
  state.map.on("zoom", syncMarkerScale);
  state.map.on("zoomend", syncMarkerScale);
  state.map.on("move", syncMarkerScale);
  state.map.on("load", syncMarkerScale);

  state.colonies = await loadColoniesData();

  buildDisciplineFilters();
  wirePillVisuals();
  wireCountryPills();
  wireCollapsibles();
  wireFilterInputs();
  wireFilterPanel();
  wirePanel();
  wireMobileSidebar();
  wireMobileFilterActions();
  updateFilterToggleBadge();

  state.map.once("load", () => {
    syncFilters();
    const visible = getVisibleColonies();
    if (visible.length) {
      const idx = Math.floor(Math.random() * visible.length);
      openPanel(visible[idx], false);
    }
  });
}

bootstrap().catch(console.error);
