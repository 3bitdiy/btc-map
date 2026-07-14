// TEMPORARY demo photos (Goethe presentation). Pulls free-license Pexels photos
// by discipline bucket, optimises to WebP, and assigns them (rotating) to ALL
// colonies. Pexels license = free, commercial, no attribution required. These
// are generic placeholders — replace with the real, rights-cleared colony
// photos later via the studio.
//
//   PEXELS_KEY=xxxx node scripts/demo-photos.mjs
//
// Requires `cwebp` on PATH.

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(root, "public/assets/images/colonies");
const KEY = process.env.PEXELS_KEY;
if (!KEY) {
  console.error("Set PEXELS_KEY");
  process.exit(1);
}

// Discipline → thematic bucket. `match` keywords are checked (in order) against
// the colony's raw art_field; the first matching bucket wins; else "rural".
const BUCKETS = [
  { key: "sculpture", query: "sculpture studio clay art", match: ["sculpt"] },
  { key: "ceramics", query: "pottery ceramics workshop", match: ["pottery", "ceramic", "crafts", "applied"] },
  { key: "photography", query: "photography camera studio", match: ["photograph", "film", "video"] },
  { key: "performance", query: "theatre stage performance dance", match: ["performance", "dance", "theatre", "theater"] },
  { key: "writing", query: "writer books desk library", match: ["literat", "poet", "writ", "calligraph"] },
  { key: "street", query: "street art mural", match: ["street", "graffiti", "folk", "naive"] },
  { key: "gallery", query: "art gallery exhibition modern", match: ["graphic", "multimedia", "media", "digital", "multidiscip", "visual"] },
  { key: "painting", query: "artist painting studio easel", match: ["paint"] },
  { key: "rural", query: "old stone house countryside village", match: [] }, // fallback
];

const tmp = mkdtempSync(resolve(tmpdir(), "demo-photos-"));

async function fetchBucket(bucket) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(bucket.query)}&per_page=4&orientation=landscape&size=large`;
  const res = await fetch(url, { headers: { Authorization: KEY } });
  if (!res.ok) throw new Error(`Pexels ${bucket.key} → ${res.status}`);
  const data = await res.json();
  const files = [];
  let i = 0;
  for (const photo of data.photos || []) {
    i += 1;
    const srcUrl = photo.src.large2x || photo.src.large || photo.src.original;
    const jpg = resolve(tmp, `${bucket.key}-${i}.jpg`);
    const buf = Buffer.from(await (await fetch(srcUrl)).arrayBuffer());
    writeFileSync(jpg, buf);
    const name = `demo-${bucket.key}-${i}.webp`;
    execFileSync("cwebp", ["-quiet", "-q", "80", "-resize", "1600", "0", jpg, "-o", resolve(OUT, name)], { stdio: "inherit" });
    files.push(`/assets/images/colonies/${name}`);
  }
  return files;
}

// --- fetch all buckets -------------------------------------------------------
const images = {};
for (const bucket of BUCKETS) {
  images[bucket.key] = await fetchBucket(bucket);
  console.log(`${bucket.key}: ${images[bucket.key].length} photos`);
}

function bucketFor(colony) {
  const field = String(colony.art_field || "").toLowerCase();
  for (const b of BUCKETS) {
    if (b.match.some((kw) => field.includes(kw))) return b.key;
  }
  return "rural";
}

// --- assign to every colony (rotating within each bucket) --------------------
const FILES = ["colonies-serbia.json", "colonies-bosnia-and-herzegovina.json", "colonies-north-macedonia.json"];
const counters = {};
let total = 0;
for (const file of FILES) {
  const path = resolve(root, "public/data", file);
  const json = JSON.parse(readFileSync(path, "utf8"));
  const list = Array.isArray(json) ? json : json.colonies || [];
  for (const colony of list) {
    const key = bucketFor(colony);
    const pool = images[key] && images[key].length ? images[key] : images.rural;
    counters[key] = (counters[key] || 0) + 1;
    colony.photos = [pool[counters[key] % pool.length]];
    total += 1;
  }
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
}

console.log(`\nAssigned demo photos to ${total} colonies.`);
