// Build-time generator for the static, SEO-friendly colony pages.
// Reads the same colony JSON the map uses and writes:
//   colonies/index.html          → directory of all colonies
//   colonies/<slug>.html         → one canonical page per colony
// These are added to Vite's inputs (see vite.config.js) so their CSS/JS get
// bundled like index.html / map.html. Run before `vite build`.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assignSlugs } from "../colony-slug.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(root, "colonies");
const SITE = "https://beyondthecities.org";

const FILES = [
  "colonies-serbia.json",
  "colonies-bosnia-and-herzegovina.json",
  "colonies-north-macedonia.json",
];

// --- load data ---------------------------------------------------------------
const colonies = FILES.flatMap((f) => {
  const json = JSON.parse(
    readFileSync(resolve(root, "public/data", f), "utf8"),
  );
  return Array.isArray(json) ? json : json.colonies || [];
});

// --- helpers -----------------------------------------------------------------
const esc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Fold diacritics so search matches "backi" ↔ "Bački", "djala" ↔ "Đala".
const foldSearch = (s = "") =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "dj");

assignSlugs(colonies);

const cleanText = (s) => {
  const t = (s ?? "").toString().trim();
  return t && t.toLowerCase() !== "unspecified" ? t : "";
};
const shortPlace = (c) => {
  const city = cleanText(c.city);
  const place = cleanText(c.place);
  if (city && place && city.toLowerCase() === place.toLowerCase()) return city;
  return [city, place].filter(Boolean).join(" · ") || cleanText(c.country);
};
const disciplines = (c) =>
  cleanText(c.art_field)
    .split(/[,/&]| and /i)
    .map((s) => s.trim())
    .filter(Boolean);

// Main photo: first real photo from the JSON, else the shared placeholder.
// (Same rule the map uses — once per-colony photos land in the data, both show
// them automatically.)
const photoUrl = (c) => {
  const p = (c.photos || [])[0];
  if (!p || String(p).includes("placehold.co"))
    return "/assets/images/colony-placeholder.png";
  return p;
};

// --- shared chrome -----------------------------------------------------------
const head = (title, description, canonical, extraCss = "colonies.css") => `
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${esc(canonical)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${esc(canonical)}" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="stylesheet" href="/fonts.css" />
  <link rel="stylesheet" href="/${extraCss}" />
  <link rel="stylesheet" href="/themes.css" />
  <script>try{var t=localStorage.getItem("btc-theme");if(t)document.documentElement.dataset.theme=t;}catch(e){}</script>`;

const nav = (active) => `
  <header class="col-nav">
    <a class="col-nav__brand" href="/" aria-label="Beyond the Cities home">
      <svg class="col-nav__mark" viewBox="0 0 70 115" aria-hidden="true"><use href="#btc-logo" /></svg>
      <span class="col-nav__name">Beyond <em>the</em> Cities</span>
    </a>
    <nav class="col-nav__links">
      <a href="/map.html">Map</a>
      <a href="/colonies/"${active === "colonies" ? ' aria-current="page"' : ""}>Colonies</a>
      <a href="/blog/">Blog</a>
    </nav>
  </header>`;

const footer = () => `
  <footer class="col-foot">
    <p>Beyond the Cities — Artists' Residencies of the Western Balkans</p>
    <p class="col-foot__meta">A Goethe-Institut project · 2026–2028</p>
    <p><a class="col-foot__login" href="https://studio.beyondthecities.org/">Organizer login</a></p>
  </footer>`;

// inline the logo <symbol> (extracted from index.html) so pages are standalone
const logoDefs =
  readFileSync(resolve(root, "index.html"), "utf8").match(
    /<svg[^>]*class="svg-defs"[\s\S]*?<\/svg>/,
  )?.[0] || "";

const page = (bodyClass, title, description, canonical, inner, js) => `<!doctype html>
<html lang="en">
<head>${head(title, description, canonical)}</head>
<body class="${bodyClass}">
${logoDefs}
${nav(bodyClass === "colonies-dir" ? "colonies" : "colonies")}
${inner}
${footer()}
${js ? `<script type="module" src="/${js}"></script>` : ""}
<script type="module" src="/theme-switcher.js"></script>
</body>
</html>
`;

// --- directory ---------------------------------------------------------------
const countries = [...new Set(colonies.map((c) => c.country))].sort();

const dirCard = (c) => `
      <a class="col-card" href="/colonies/${c._slug}.html"
         data-name="${esc(foldSearch(c.art_colony_name))}"
         data-country="${esc(c.country)}"
         data-place="${esc(foldSearch(shortPlace(c)))}"
         data-fields="${esc(foldSearch(disciplines(c).join(" ")))}">
        <span class="col-card__media"><img src="${esc(photoUrl(c))}" alt="" loading="lazy" /></span>
        <span class="col-card__body">
          <span class="col-card__name">${esc(c.art_colony_name)}</span>
          <span class="col-card__place">${esc(shortPlace(c))}</span>
          ${disciplines(c).length ? `<span class="col-card__tags">${disciplines(c).slice(0, 3).map((d) => `<span>${esc(d)}</span>`).join("")}</span>` : ""}
        </span>
      </a>`;

const dirInner = `
  <main class="col-dir">
    <header class="col-dir__head">
      <p class="col-eyebrow">The colonies</p>
      <h1>Artists' residencies of the Western Balkans</h1>
      <p class="col-dir__sub">${colonies.length} colonies across ${countries.join(", ")}. Browse the list or <a href="/map.html">open the map</a>.</p>
      <div class="col-dir__controls">
        <input id="col-search" type="search" placeholder="Search colonies…" aria-label="Search colonies" />
        <div id="col-country-filter" class="col-chips">
          <button class="is-active" data-country="">All</button>
          ${countries.map((c) => `<button data-country="${esc(c)}">${esc(c)}</button>`).join("")}
        </div>
      </div>
      <p id="col-count" class="col-count" aria-live="polite">${colonies.length} colonies</p>
    </header>
    <section id="col-grid" class="col-grid">
      ${colonies.map(dirCard).join("")}
    </section>
    <p id="col-empty" class="col-empty" hidden>No colonies match your search.</p>
  </main>`;

// --- colony page -------------------------------------------------------------
const detailRow = (label, value) =>
  value ? `<div class="col-detail"><dt>${esc(label)}</dt><dd>${value}</dd></div>` : "";

// A contact field may hold several values ("a & b"). Split so each is its own
// link. Phones/websites keep "/" (Serbian numbers, URLs) — never split on it.
const splitContacts = (raw, kind) => {
  const s = cleanText(raw);
  if (!s) return [];
  const re =
    kind === "website"
      ? /\s*[&,;]\s*/
      : kind === "email"
        ? /\s*[&,;]\s*|\s+and\s+/i
        : /\s*[&,]\s*|\s+and\s+/i; // phone
  return s.split(re).map((x) => x.trim()).filter(Boolean);
};

const contactLinks = (raw, kind) =>
  splitContacts(raw, kind)
    .map((v) => {
      if (kind === "phone") return `<a href="tel:${esc(v.replace(/[^\d+]/g, ""))}">${esc(v)}</a>`;
      if (kind === "email") return `<a href="mailto:${esc(v)}">${esc(v)}</a>`;
      const href = /^https?:\/\//i.test(v) ? v : `https://${v}`;
      return `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(v)}</a>`;
    })
    .join("<br />");

const colonyInner = (c) => {
  const place = shortPlace(c);
  return `
  <main class="col-page">
    <a class="col-back" href="/colonies/">← All colonies</a>
    <header class="col-hero">
      <h1>${esc(c.art_colony_name)}</h1>
      ${place ? `<p class="col-hero__place">${esc(place)}</p>` : ""}
      ${disciplines(c).length ? `<p class="col-hero__tags">${disciplines(c).map((d) => `<span>${esc(d)}</span>`).join("")}</p>` : ""}
      <a class="col-map-btn" href="/map.html?colony=${encodeURIComponent(c.id)}">Show on map →</a>
    </header>

    <div class="col-photo">
      <img src="${esc(photoUrl(c))}" alt="${esc(c.art_colony_name)}" loading="lazy" />
    </div>

    <section class="col-body">
      <dl class="col-details">
        ${detailRow("Organisers", esc(cleanText(c.art_colony_organisers)))}
        ${detailRow("Scope", esc(cleanText(c.scope)))}
        ${detailRow("Time period", esc(cleanText(c.time_period)))}
        ${detailRow("Duration", esc(cleanText(c.duration)))}
        ${detailRow("Contact", esc(cleanText(c.contact_person)))}
        ${detailRow("Phone", contactLinks(c.contact_telephone, "phone"))}
        ${detailRow("Email", contactLinks(c.email_address, "email"))}
        ${detailRow("Website", contactLinks(c.web_page, "website"))}
      </dl>
    </section>

    <section class="col-blog" id="col-blog" data-colony-id="${esc(c.id)}">
      <h2>News from this colony</h2>
      <p class="col-blog__empty">No posts yet.</p>
    </section>
  </main>`;
};

// --- write -------------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

writeFileSync(
  resolve(OUT, "index.html"),
  page(
    "colonies-dir",
    "Colonies — Beyond the Cities",
    `Directory of ${colonies.length} artist colonies across the Western Balkans.`,
    `${SITE}/colonies/`,
    dirInner,
    "colonies-dir.js",
  ),
);

for (const c of colonies) {
  const desc =
    `${c.art_colony_name} — artist colony in ${shortPlace(c) || c.country}. ` +
    `${disciplines(c).join(", ")}`.slice(0, 155);
  writeFileSync(
    resolve(OUT, `${c._slug}.html`),
    page(
      "colony-page",
      `${c.art_colony_name} — Beyond the Cities`,
      desc,
      `${SITE}/colonies/${c._slug}.html`,
      colonyInner(c),
      "colony.js",
    ),
  );
}

console.log(`gen-colonies: wrote directory + ${colonies.length} colony pages`);
