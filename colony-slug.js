// Shared slug logic used by BOTH the page generator (scripts/gen-colonies.mjs)
// and the map (main.js), so a colony's page URL matches in both places. Pure —
// no DOM/Node APIs.

export function slugify(name = "") {
  return String(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Assigns a stable, unique `_slug` to each colony, in array order (dedupe with
// -2, -3…). Both callers load the colonies in the same order, so slugs match.
export function assignSlugs(colonies) {
  const seen = new Map();
  for (const c of colonies) {
    const base = slugify(c.art_colony_name) || `colony-${c.id}`;
    let slug = base;
    let n = 2;
    while (seen.has(slug)) slug = `${base}-${n++}`;
    seen.set(slug, true);
    c._slug = slug;
  }
  return colonies;
}
