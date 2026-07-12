/*
 * Client-review color-palette switcher. Hidden by default; activate by opening
 * any page with ?themes (the choice is then remembered across landing ↔ map).
 * Applies a palette by setting data-theme on <html>; main.js re-tints the map
 * tiles on the "btc-theme-change" event.
 */
const THEMES = [
  { id: "", name: "Contemporary", swatch: ["#1c1c1c", "#ff4326", "#f1f1ee"] },
  { id: "terracotta", name: "Terracotta", swatch: ["#8d313a", "#eb5160", "#edd1aa"] },
  { id: "adriatic", name: "Adriatic", swatch: ["#14616b", "#ef6f53", "#e7eef0"] },
  { id: "lime", name: "Lime", swatch: ["#1c1c1c", "#a0c814", "#f1f1ee"] },
  { id: "emerald", name: "Emerald", swatch: ["#1a312c", "#428475", "#89d7b7"] },
  { id: "forest", name: "Forest", swatch: ["#273338", "#618764", "#9cb080"] },
];
const THEME_KEY = "btc-theme";

function store(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (error) {
    /* private mode / disabled storage — ignore */
  }
}

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function applyTheme(id) {
  if (id) document.documentElement.dataset.theme = id;
  else delete document.documentElement.dataset.theme;
  store(THEME_KEY, id || null);
  window.dispatchEvent(new CustomEvent("btc-theme-change"));
}

function renderSwitcher() {
  const current = read(THEME_KEY) || "";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "theme-toggle";
  toggle.setAttribute("aria-label", "Change color theme");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6" />
      <circle cx="8.5" cy="9" r="1.5" fill="currentColor" />
      <circle cx="15.5" cy="9" r="1.5" fill="currentColor" />
      <circle cx="8.5" cy="15" r="1.5" fill="currentColor" />
      <circle cx="15.5" cy="15" r="1.5" fill="currentColor" />
    </svg>`;

  const wrap = document.createElement("div");
  wrap.className = "theme-switcher";
  wrap.innerHTML = `
    <div class="theme-switcher__head">
      <span>Color theme</span>
      <button type="button" class="theme-switcher__close" aria-label="Close">×</button>
    </div>
    <div class="theme-switcher__list"></div>
  `;

  const list = wrap.querySelector(".theme-switcher__list");
  THEMES.forEach((theme) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "theme-chip";
    if (theme.id === current) chip.classList.add("is-active");
    chip.innerHTML = `
      <span class="theme-chip__swatch">${theme.swatch
        .map((color) => `<i style="background:${color}"></i>`)
        .join("")}</span>
      <span class="theme-chip__name">${theme.name}</span>`;
    chip.addEventListener("click", () => {
      applyTheme(theme.id);
      list
        .querySelectorAll(".theme-chip")
        .forEach((other) => other.classList.remove("is-active"));
      chip.classList.add("is-active");
    });
    list.appendChild(chip);
  });

  const setOpen = (open) => {
    wrap.classList.toggle("is-open", open);
    toggle.classList.toggle("is-active", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  };

  toggle.addEventListener("click", () =>
    setOpen(!wrap.classList.contains("is-open")),
  );
  wrap
    .querySelector(".theme-switcher__close")
    .addEventListener("click", () => setOpen(false));

  // Close on an outside click and when navigating (incl. bfcache restore).
  document.addEventListener("click", (event) => {
    if (
      wrap.classList.contains("is-open") &&
      !wrap.contains(event.target) &&
      !toggle.contains(event.target)
    ) {
      setOpen(false);
    }
  });
  window.addEventListener("pageshow", () => setOpen(false));

  document.body.appendChild(wrap);
  // On the map, tuck the palette button into the zoom-control stack so all map
  // controls sit together (and move together when the detail panel opens).
  const zoomControls = document.getElementById("map-zoom-controls");
  (zoomControls || document.body).appendChild(toggle);
}

// Shareable preview links: ?theme=<id> applies a palette on load.
const params = new URLSearchParams(location.search);
if (params.has("theme")) applyTheme(params.get("theme"));

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderSwitcher);
} else {
  renderSwitcher();
}
