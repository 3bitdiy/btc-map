import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

// ---------------------------------------------------------------------------
// PMTiles protocol registration
// ---------------------------------------------------------------------------
const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol));

// ---------------------------------------------------------------------------
// i18n strings
// ---------------------------------------------------------------------------
const UI_STRINGS = {
  en: {
    title: 'Artist Residencies',
    filters: 'Filters',
    filterByCountry: 'By Country',
    filterByStatus: 'Status',
    activeOnly: 'Active only',
    showing: 'Showing',
    colonies: 'colonies',
    serbia: 'Serbia',
    bosnia: 'Bosnia & Herzegovina',
    northMacedonia: 'North Macedonia',
    contact: 'Contact',
    founded: 'Founded',
    members: 'members',
    inactive: 'Inactive',
    website: 'Website',
    email: 'Email',
    phone: 'Phone',
  },
  de: {
    title: 'Künstlerresidenzen',
    filters: 'Filter',
    filterByCountry: 'Nach Land',
    filterByStatus: 'Status',
    activeOnly: 'Nur aktive',
    showing: 'Angezeigt',
    colonies: 'Kolonien',
    serbia: 'Serbien',
    bosnia: 'Bosnien & Herzegowina',
    northMacedonia: 'Nordmazedonien',
    contact: 'Kontakt',
    founded: 'Gegründet',
    members: 'Mitglieder',
    inactive: 'Inaktiv',
    website: 'Website',
    email: 'E-Mail',
    phone: 'Telefon',
  },
};

// ---------------------------------------------------------------------------
// Country colours (matches CSS custom properties)
// ---------------------------------------------------------------------------
const COUNTRY_COLORS = {
  'Serbia': '#C0392B',
  'Bosnia and Herzegovina': '#2471A3',
  'North Macedonia': '#1E8449',
};

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------
const state = {
  colonies: [],
  markers: [],            // { marker, el, colony } objects
  map: null,
  selectedColony: null,
  uiLang: 'en',
  descLang: 'en',
  activeCountries: new Set(['Serbia', 'Bosnia and Herzegovina', 'North Macedonia']),
  showActiveOnly: true,
};

// ---------------------------------------------------------------------------
// SVG marker generator
// ---------------------------------------------------------------------------
function createMarkerSvg(color, uid) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <filter id="shadow-${uid}" x="-30%" y="-20%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.28)"/>
      </filter>
      <g filter="url(#shadow-${uid})">
        <ellipse cx="14" cy="33" rx="5" ry="2.5" fill="rgba(0,0,0,0.18)"/>
        <path d="M14 2 C8 2 3 7 3 13 C3 20 14 31 14 31 C14 31 25 20 25 13 C25 7 20 2 14 2 Z"
              fill="${color}" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
        <circle cx="14" cy="13" r="5" fill="rgba(255,255,255,0.9)"/>
      </g>
    </svg>`;
}

// ---------------------------------------------------------------------------
// Map initialisation
//
// PRODUCTION: replace the `url` value in map-style.json with your self-hosted
// PMTiles file path, e.g. "pmtiles:///tiles/balkans.pmtiles"
// See README.md for instructions on downloading the PMTiles extract.
// ---------------------------------------------------------------------------
async function initMap() {
  const styleResponse = await fetch('/map-style.json');
  const style = await styleResponse.json();

  // Self-hosted PMTiles file on Cloudflare R2.
  // To switch to a local file during development, use: pmtiles:///tiles/western-balkans.pmtiles
  const PMTILES_URL = 'pmtiles://https://pub-716e1bd7d8eb43cdafdb8f37dd91f157.r2.dev/western-balkans.pmtiles';

  style.sources.openmaptiles = {
    type: 'vector',
    url: PMTILES_URL,
    attribution: "© <a href='https://openmaptiles.org'>OpenMapTiles</a> © <a href='https://openstreetmap.org'>OpenStreetMap</a> contributors",
  };

  const map = new maplibregl.Map({
    container: 'map',
    style,
    // Initial view: fit Western Balkans region
    bounds: [[15.5, 40.5], [23.2, 46.5]],
    fitBoundsOptions: { padding: 40 },
    // Hard pan/zoom limits — matches the PMTiles extract bbox
    maxBounds: [[14.0, 39.0], [24.5, 47.5]],
    minZoom: 5,
    maxZoom: 14,
    dragRotate: false,
    touchZoomRotate: false,
  });

  // Disable rotation via keyboard too
  map.keyboard.disableRotation();

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

  // Close detail panel when clicking the map background (not a marker)
  map.on('click', () => {
    if (state.selectedColony) closePanel();
  });

  return map;
}

// ---------------------------------------------------------------------------
// Marker management
// ---------------------------------------------------------------------------
function buildMarkers(map) {
  // Remove existing markers
  state.markers.forEach(({ marker }) => marker.remove());
  state.markers = [];

  const visible = getVisibleColonies();

  state.colonies.forEach(colony => {
    if (!visible.has(colony.id)) return;

    const color = colony.is_active
      ? (COUNTRY_COLORS[colony.country] ?? '#888')
      : '#9E9E9E';

    const el = document.createElement('div');
    el.className = 'colony-marker' + (colony.is_active ? '' : ' inactive');
    el.innerHTML = createMarkerSvg(color, colony.id);
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', colony.name);
    el.setAttribute('tabindex', '0');

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openPanel(colony);
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') openPanel(colony);
    });

    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([colony.longitude, colony.latitude])
      .addTo(map);

    state.markers.push({ marker, el, colony });
  });

  updateCounter(visible.size);
  return visible;
}

function getVisibleColonies() {
  const visible = new Set();
  state.colonies.forEach(c => {
    if (!state.activeCountries.has(c.country)) return;
    if (state.showActiveOnly && !c.is_active) return;
    visible.add(c.id);
  });
  return visible;
}

function applyFilters() {
  if (!state.map) return;
  const visible = buildMarkers(state.map);
  if (state.selectedColony && !visible.has(state.selectedColony.id)) {
    closePanel();
  }
}

function updateCounter(count) {
  document.getElementById('colony-count').textContent = count;
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------
function openPanel(colony) {
  state.selectedColony = colony;

  // Photo
  const photo = document.getElementById('panel-photo');
  if (colony.photos && colony.photos.length > 0) {
    photo.src = colony.photos[0];
    photo.alt = colony.name;
    document.getElementById('panel-photo-wrap').style.display = '';
  } else {
    document.getElementById('panel-photo-wrap').style.display = 'none';
  }

  // Name + inactive badge
  const nameEl = document.getElementById('panel-name');
  nameEl.textContent = colony.name;
  if (!colony.is_active) {
    const badge = document.createElement('span');
    badge.className = 'inactive-badge';
    badge.textContent = UI_STRINGS[state.uiLang].inactive;
    nameEl.appendChild(document.createTextNode(' '));
    nameEl.appendChild(badge);
  }

  // Location
  document.getElementById('panel-location').textContent =
    [colony.city, colony.region, colony.country].filter(Boolean).join(' · ');

  // Meta
  const lang = UI_STRINGS[state.uiLang];
  document.getElementById('panel-founded').textContent =
    `${lang.founded}: ${colony.founded_year}`;
  document.getElementById('panel-members').textContent =
    `${colony.member_count} ${lang.members}`;

  // Disciplines
  const discsEl = document.getElementById('panel-disciplines');
  discsEl.innerHTML = '';
  (colony.disciplines || []).forEach(d => {
    const tag = document.createElement('span');
    tag.className = 'discipline-tag';
    tag.textContent = d;
    discsEl.appendChild(tag);
  });

  // Description — default to current descLang
  renderDescription(colony);

  // Desc lang buttons
  document.querySelectorAll('.desc-lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.descLang === state.descLang);
  });

  // Contact
  const contactList = document.getElementById('panel-contact-list');
  contactList.innerHTML = '';
  if (colony.contact_email) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${lang.email}:</strong> <a href="mailto:${colony.contact_email}">${colony.contact_email}</a>`;
    contactList.appendChild(li);
  }
  if (colony.contact_phone) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${lang.phone}:</strong> <a href="tel:${colony.contact_phone.replace(/\s/g, '')}">${colony.contact_phone}</a>`;
    contactList.appendChild(li);
  }
  if (colony.website) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${lang.website}:</strong> <a href="${colony.website}" target="_blank" rel="noopener">${colony.website}</a>`;
    contactList.appendChild(li);
  }

  // Social links
  const socialEl = document.getElementById('panel-social');
  socialEl.innerHTML = '';
  let social = {};
  try { social = JSON.parse(colony.social_links || '{}'); } catch {}
  Object.entries(social).forEach(([platform, url]) => {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'social-link';
    a.textContent = platform.charAt(0).toUpperCase() + platform.slice(1);
    socialEl.appendChild(a);
  });

  // Show panel — rAF ensures CSS transition fires after initial paint
  const panel = document.getElementById('detail-panel');
  panel.setAttribute('aria-hidden', 'false');
  document.getElementById('app').classList.add('panel-open');
  requestAnimationFrame(() => panel.classList.add('is-open'));
  panel.scrollTop = 0;
}

function renderDescription(colony) {
  const key = `description_${state.descLang}`;
  const fallback = colony.description_en || colony.description_sr || '';
  document.getElementById('panel-description').textContent = colony[key] || fallback;
}

function closePanel() {
  state.selectedColony = null;
  const panel = document.getElementById('detail-panel');
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
  document.getElementById('app').classList.remove('panel-open');
}

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------
function applyUiLang(lang) {
  state.uiLang = lang;
  const strings = UI_STRINGS[lang];

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (strings[key]) el.textContent = strings[key];
  });

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  // Re-render open panel so meta strings update
  if (state.selectedColony) openPanel(state.selectedColony);
}

// ---------------------------------------------------------------------------
// Filter event wiring
// ---------------------------------------------------------------------------
function wireFilters() {
  // Read all checkbox states from DOM on every change — avoids closure issues
  document.querySelectorAll('input[name="country"]').forEach(cb => {
    cb.addEventListener('change', syncFilters);
  });

  document.getElementById('active-toggle').addEventListener('change', syncFilters);
}

function syncFilters() {
  state.activeCountries = new Set(
    Array.from(document.querySelectorAll('input[name="country"]:checked'))
      .map(el => el.value)
  );
  state.showActiveOnly = document.getElementById('active-toggle').checked;
  applyFilters();
}

// ---------------------------------------------------------------------------
// Mobile filter panel toggle
// ---------------------------------------------------------------------------
function wireMobileFilterToggle() {
  const toggle = document.getElementById('filter-toggle');
  const panel = document.getElementById('filter-panel');

  toggle.addEventListener('click', () => {
    const isOpen = panel.classList.toggle('open');
    toggle.setAttribute('aria-expanded', isOpen);
  });

  // Close filter panel when clicking outside
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && !toggle.contains(e.target)) {
      panel.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
}

// ---------------------------------------------------------------------------
// Language switcher wiring
// ---------------------------------------------------------------------------
function wireLanguageSwitchers() {
  // UI language (header)
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => applyUiLang(btn.dataset.lang));
  });

  // Description language (panel)
  document.querySelectorAll('.desc-lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.descLang = btn.dataset.descLang;
      document.querySelectorAll('.desc-lang-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.descLang === state.descLang));
      if (state.selectedColony) renderDescription(state.selectedColony);
    });
  });
}

// ---------------------------------------------------------------------------
// Panel close button
// ---------------------------------------------------------------------------
function wirePanel() {
  document.getElementById('panel-close').addEventListener('click', closePanel);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function main() {
  const map = await initMap();

  // Load colony data
  const res = await fetch('/data/colonies.json');
  state.colonies = await res.json();

  state.map = map;

  // Wait for map to be ready before adding markers
  map.once('load', () => buildMarkers(map));

  wireFilters();
  wireMobileFilterToggle();
  wireLanguageSwitchers();
  wirePanel();

  // Initial i18n pass
  applyUiLang('en');
}

main().catch(console.error);
