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
  activeCountries: new Set([
    "Serbia",
    "Bosnia and Herzegovina",
    "North Macedonia",
  ]),
  activeDisciplines: new Set(),
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

function getColonyCoordinates(colony) {
  const latitude = Number(colony.latitude);
  const longitude = Number(colony.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { latitude, longitude };
}

function getColonyDisciplines(colony) {
  const artField = normalizeText(colony.art_field);
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

function resolveColonyPhoto(colony) {
  const firstPhoto = colony.photos?.[0];
  if (!firstPhoto) return "/assets/images/colony-placeholder.png";
  if (firstPhoto.includes("placehold.co"))
    return "/assets/images/colony-placeholder.png";
  return firstPhoto;
}

async function loadColoniesData() {
  const fallbackResponse = await fetch("/data/colonies.json");

  try {
    const manifestResponse = await fetch("/data/colonies.manifest.json", {
      cache: "no-store",
    });

    if (!manifestResponse.ok) {
      if (!fallbackResponse.ok) {
        throw new Error("Unable to load colony data.");
      }
      return fallbackResponse.json();
    }

    const manifest = await manifestResponse.json();
    const files = Array.isArray(manifest?.files) ? manifest.files : [];

    if (!files.length) {
      if (!fallbackResponse.ok) {
        throw new Error("Colony manifest is empty and fallback data is missing.");
      }
      return fallbackResponse.json();
    }

    const payloads = await Promise.all(
      files.map(async (entry) => {
        const clean = String(entry).replace(/^\/+/, "");
        const url = `/data/${clean}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to load ${url}`);
        }
        const json = await response.json();
        return Array.isArray(json) ? json : [];
      }),
    );

    return payloads.flat();
  } catch (error) {
    console.warn("Using fallback colony data due to manifest load error:", error);
    if (!fallbackResponse.ok) {
      throw error;
    }
    return fallbackResponse.json();
  }
}

async function initMap() {
  const styleResponse = await fetch("/map-style.json");
  const style = await styleResponse.json();

  style.sources.openmaptiles = {
    type: "vector",
    url: "pmtiles://https://pub-716e1bd7d8eb43cdafdb8f37dd91f157.r2.dev/western-balkans.pmtiles",
    attribution:
      "© <a href='https://openmaptiles.org'>OpenMapTiles</a> © <a href='https://openstreetmap.org'>OpenStreetMap</a> contributors",
  };

  const map = new maplibregl.Map({
    container: "map",
    style,
    bounds: [
      [15.5, 40.5],
      [23.2, 46.5],
    ],
    fitBoundsOptions: { padding: 20 },
    maxBounds: [
      [14.0, 39.0],
      [24.5, 47.5],
    ],
    minZoom: 5,
    maxZoom: 14,
    dragRotate: false,
    touchZoomRotate: false,
  });

  map.keyboard.disableRotation();

  return map;
}

function createMarkerElement(colony) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "map-marker";
  el.setAttribute("aria-label", getColonyName(colony));
  el.innerHTML = `<img src="${markerIconFor(colony)}" alt="" />`;

  el.addEventListener("click", (event) => {
    event.stopPropagation();
    openPanel(colony, true);
  });

  return el;
}

function getVisibleColonies() {
  return state.colonies.filter((colony) => {
    if (!getColonyCoordinates(colony)) return false;
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

function buildMarkers() {
  state.markers.forEach(({ marker }) => marker.remove());
  state.markers = [];

  const visible = getVisibleColonies();
  visible.forEach((colony) => {
    const coords = getColonyCoordinates(colony);
    if (!coords) return;

    const marker = new maplibregl.Marker({
      element: createMarkerElement(colony),
      anchor: "center",
    })
      .setLngLat([coords.longitude, coords.latitude])
      .addTo(state.map);

    state.markers.push({ marker, colony });
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

function openPanel(colony, focusMap = false) {
  state.selectedColony = colony;
  updateMarkerSelection();

  const coords = getColonyCoordinates(colony);

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
}

function buildDisciplineFilters() {
  const wrapper = document.getElementById("discipline-filters");
  wrapper.innerHTML = "";

  const all = new Set();
  state.colonies.forEach((colony) => {
    getColonyDisciplines(colony).forEach((d) => all.add(d));
  });

  const sorted = Array.from(all).sort((a, b) => a.localeCompare(b));
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
    if (!window.matchMedia("(max-width: 980px)").matches) return;
    if (!(event.target instanceof Node)) return;
    if (sidebar.contains(event.target) || toggle.contains(event.target)) return;
    sidebar.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  });
}

async function bootstrap() {
  state.map = await initMap();

  state.colonies = await loadColoniesData();

  buildDisciplineFilters();
  wirePillVisuals();
  wireCountryPills();
  wireCollapsibles();
  wireFilterInputs();
  wireFilterPanel();
  wirePanel();
  wireMobileSidebar();

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
