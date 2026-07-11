// Build-time generator for the static, SEO-friendly blog.
// Reads markdown posts from public/data/blog/*.md (front-matter + body) and writes:
//   blog/index.html          → list of all posts
//   blog/<slug>.html         → one page per post
//   public/data/blog-index.json → lightweight index (used by colony pages to
//                                  show "News from this colony")
// Pages are added to Vite's inputs (see vite.config.js) so their CSS/JS get
// bundled like index.html / map.html. Run before `vite build`.
//
// Mirrors scripts/gen-colonies.mjs on purpose — same chrome, same conventions.

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(root, "public/data/blog");
const OUT = resolve(root, "blog");
const SITE = "https://beyondthecities.org";

// --- helpers -----------------------------------------------------------------
const esc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Minimal YAML-ish front-matter parser. Handles `key: value`, inline arrays
// (`[a, b]`) and block sequences:
//   tags:
//     - Network
//     - Announcement
// Enough for our fixed set of fields; no external dependency. Both hand-written
// and CMS-authored posts (Sveltia/Decap writes block lists) parse correctly.
const unquote = (s) => s.trim().replace(/^["']|["']$/g, "");
const parseFrontMatter = (raw) => {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawVal] = kv;
    const val = rawVal.trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      data[key] = val.slice(1, -1).split(",").map(unquote).filter(Boolean);
    } else if (val === "") {
      // possible block sequence on the following indented `- ` lines
      const items = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
        items.push(unquote(lines[++i].replace(/^\s*-\s+/, "")));
      }
      data[key] = items.length ? items.filter(Boolean) : "";
    } else {
      data[key] = unquote(val);
    }
  }
  return { data, body: m[2] };
};

const formatDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const cover = (c) => (c && String(c).trim()) || "/assets/images/colony-placeholder.png";

// --- load posts --------------------------------------------------------------
const posts = existsSync(SRC)
  ? readdirSync(SRC)
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const { data, body } = parseFrontMatter(readFileSync(resolve(SRC, f), "utf8"));
        return {
          slug: f.replace(/\.md$/, ""),
          title: data.title || "Untitled",
          date: data.date || "",
          author: data.author || "",
          excerpt: data.excerpt || "",
          cover: cover(data.cover),
          tags: Array.isArray(data.tags) ? data.tags : [],
          colonies: (Array.isArray(data.colonies) ? data.colonies : [])
            .map((n) => String(n).trim())
            .filter(Boolean),
          draft: String(data.draft).toLowerCase() === "true",
          html: marked.parse(body.trim()),
        };
      })
      .filter((p) => !p.draft)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  : [];

// --- shared chrome (identical to gen-colonies.mjs) ---------------------------
const head = (title, description, canonical, image) => `
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${esc(canonical)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${esc(canonical)}" />
  ${image ? `<meta property="og:image" content="${esc(SITE + image)}" />` : ""}
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="stylesheet" href="/fonts.css" />
  <link rel="stylesheet" href="/colonies.css" />
  <link rel="stylesheet" href="/blog.css" />
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
      <a href="/colonies/">Colonies</a>
      <a href="/blog/"${active === "blog" ? ' aria-current="page"' : ""}>Blog</a>
    </nav>
  </header>`;

const footer = () => `
  <footer class="col-foot">
    <p>Beyond the Cities — Artists' Residencies of the Western Balkans</p>
    <p class="col-foot__meta">A Goethe-Institut project · 2026–2028</p>
    <p><a class="col-foot__login" href="https://studio.beyondthecities.org/">Organizer login</a></p>
  </footer>`;

const logoDefs =
  readFileSync(resolve(root, "index.html"), "utf8").match(
    /<svg[^>]*class="svg-defs"[\s\S]*?<\/svg>/,
  )?.[0] || "";

const page = (bodyClass, title, description, canonical, inner, image) => `<!doctype html>
<html lang="en">
<head>${head(title, description, canonical, image)}</head>
<body class="${bodyClass}">
${logoDefs}
${nav("blog")}
${inner}
${footer()}
<script type="module" src="/theme-switcher.js"></script>
</body>
</html>
`;

// --- list page ---------------------------------------------------------------
const postCard = (p) => `
      <a class="post-card" href="/blog/${p.slug}.html">
        <span class="post-card__media"><img src="${esc(p.cover)}" alt="" loading="lazy" /></span>
        <span class="post-card__body">
          <span class="post-card__meta">${esc(formatDate(p.date))}${p.author ? ` · ${esc(p.author)}` : ""}</span>
          <span class="post-card__title">${esc(p.title)}</span>
          ${p.excerpt ? `<span class="post-card__excerpt">${esc(p.excerpt)}</span>` : ""}
          ${p.tags.length ? `<span class="post-card__tags">${p.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</span>` : ""}
        </span>
      </a>`;

const listInner = `
  <main class="blog-list">
    <header class="blog-list__head">
      <p class="col-eyebrow">Journal</p>
      <h1>News &amp; stories from the network</h1>
      <p class="blog-list__sub">Updates from the colonies, calls for residencies and notes from organisers across the Western Balkans.</p>
    </header>
    ${
      posts.length
        ? `<section class="post-grid">${posts.map(postCard).join("")}</section>`
        : `<p class="blog-empty">No posts yet — check back soon.</p>`
    }
  </main>`;

// --- post page ---------------------------------------------------------------
const postInner = (p) => `
  <main class="post">
    <a class="col-back" href="/blog/">← All posts</a>
    <header class="post__head">
      <p class="post__meta">${esc(formatDate(p.date))}${p.author ? ` · ${esc(p.author)}` : ""}</p>
      <h1>${esc(p.title)}</h1>
      ${p.tags.length ? `<p class="post__tags">${p.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</p>` : ""}
    </header>
    <div class="post__cover"><img src="${esc(p.cover)}" alt="${esc(p.title)}" /></div>
    <article class="post__body">${p.html}</article>
    <a class="col-back post__foot-back" href="/blog/">← All posts</a>
  </main>`;

// --- write -------------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

writeFileSync(
  resolve(OUT, "index.html"),
  page(
    "blog-index",
    "Blog — Beyond the Cities",
    "News and stories from the artist colonies of the Western Balkans.",
    `${SITE}/blog/`,
    listInner,
  ),
);

for (const p of posts) {
  writeFileSync(
    resolve(OUT, `${p.slug}.html`),
    page(
      "blog-post",
      `${p.title} — Beyond the Cities`,
      p.excerpt || p.title,
      `${SITE}/blog/${p.slug}.html`,
      postInner(p),
      p.cover,
    ),
  );
}

// Lightweight index for colony pages ("News from this colony").
writeFileSync(
  resolve(root, "public/data/blog-index.json"),
  JSON.stringify(
    posts.map((p) => ({
      slug: p.slug,
      title: p.title,
      date: p.date,
      excerpt: p.excerpt,
      cover: p.cover,
      colonies: p.colonies,
    })),
    null,
    2,
  ),
);

console.log(`gen-blog: wrote list + ${posts.length} post page(s)`);
