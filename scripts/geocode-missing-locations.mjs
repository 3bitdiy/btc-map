import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "public", "data");
const reportsDir = path.join(rootDir, "reports");

const MANIFEST_PATH = path.join(dataDir, "colonies.manifest.json");
const REPORT_JSON_PATH = path.join(reportsDir, "missing-locations.json");
const REPORT_MD_PATH = path.join(reportsDir, "missing-locations.md");

const PROVIDERS = [
  {
    name: "nominatim",
    buildUrl: (query) =>
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=en&q=" +
      encodeURIComponent(query),
    extract: (payload) => {
      const first = Array.isArray(payload) ? payload[0] : null;
      if (!first) return null;
      return {
        latitude: Number(first.lat),
        longitude: Number(first.lon),
        label: first.display_name || null,
      };
    },
  },
  {
    name: "open-meteo",
    buildUrl: (query) =>
      "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" +
      encodeURIComponent(query),
    extract: (payload) => {
      const first = payload?.results?.[0];
      if (!first) return null;
      return {
        latitude: Number(first.latitude),
        longitude: Number(first.longitude),
        label: first.name || null,
      };
    },
  },
  {
    name: "photon",
    buildUrl: (query) =>
      "https://photon.komoot.io/api/?limit=1&q=" + encodeURIComponent(query),
    extract: (payload) => {
      const first = payload?.features?.[0];
      const coords = first?.geometry?.coordinates;
      if (!first || !Array.isArray(coords) || coords.length < 2) return null;
      return {
        latitude: Number(coords[1]),
        longitude: Number(coords[0]),
        label: first?.properties?.name || null,
      };
    },
  },
];

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

async function readManifest() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  return Array.isArray(manifest?.files) ? manifest.files : [];
}

async function loadRows() {
  const files = await readManifest();
  const rows = [];

  for (const file of files) {
    const fullPath = path.join(dataDir, file);
    const data = JSON.parse(await readFile(fullPath, "utf8"));
    if (!Array.isArray(data)) continue;

    for (const row of data) {
      rows.push({
        file,
        row,
      });
    }
  }

  return rows;
}

function getMissingRows(rows) {
  return rows
    .filter(({ row }) => row.latitude == null || row.longitude == null)
    .map(({ file, row }) => ({
      file,
      id: row.id,
      country: row.country,
      name: row.art_colony_name,
      place: row.place,
      city: row.city,
      scope: row.scope,
      art_field: row.art_field,
      query: buildQuery(row),
    }));
}

function buildQuery(row) {
  const pieces = [clean(row.place), clean(row.city), clean(row.country)];
  return pieces.filter(Boolean).join(", ");
}

function writeMarkdownReport(missing) {
  const lines = [
    "# Missing colony coordinates",
    "",
    `Total missing: ${missing.length}`,
    "",
    "| File | ID | Country | Name | Place | City | Scope | Art field | Query |",
    "| --- | ---: | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const item of missing) {
    lines.push(
      `| ${item.file} | ${item.id} | ${item.country} | ${escapeMarkdown(item.name)} | ${escapeMarkdown(item.place)} | ${escapeMarkdown(item.city)} | ${item.scope} | ${escapeMarkdown(item.art_field)} | ${escapeMarkdown(item.query)} |`,
    );
  }

  return lines.join("\n") + "\n";
}

function escapeMarkdown(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}

async function geocodeQuery(query) {
  for (const provider of PROVIDERS) {
    const url = provider.buildUrl(query);
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "btc-map/1.0",
          Accept: "application/json",
        },
      });
      if (!response.ok) continue;
      const payload = await response.json();
      const result = provider.extract(payload);
      if (!result) continue;

      return {
        provider: provider.name,
        ...result,
      };
    } catch {
      continue;
    }
  }

  return null;
}

async function applyGeocoding(rows, missing) {
  const updatesByFile = new Map();
  const results = [];

  for (const item of missing) {
    const geocoded = await geocodeQuery(item.query);
    results.push({
      ...item,
      geocoded,
    });

    if (!geocoded) continue;

    const list = updatesByFile.get(item.file) || [];
    list.push({
      id: item.id,
      latitude: Number(geocoded.latitude.toFixed(6)),
      longitude: Number(geocoded.longitude.toFixed(6)),
    });
    updatesByFile.set(item.file, list);
  }

  for (const [file, updates] of updatesByFile.entries()) {
    const fullPath = path.join(dataDir, file);
    const data = JSON.parse(await readFile(fullPath, "utf8"));
    const updateMap = new Map(updates.map((entry) => [entry.id, entry]));

    const patched = data.map((row) => {
      const patch = updateMap.get(row.id);
      if (!patch) return row;
      return {
        ...row,
        latitude: patch.latitude,
        longitude: patch.longitude,
      };
    });

    await writeFile(fullPath, JSON.stringify(patched, null, 2) + "\n", "utf8");
  }

  return results;
}

async function main() {
  const rows = await loadRows();
  const missing = getMissingRows(rows);

  await writeFile(
    REPORT_JSON_PATH,
    JSON.stringify(missing, null, 2) + "\n",
    "utf8",
  );
  await writeFile(REPORT_MD_PATH, writeMarkdownReport(missing), "utf8");

  console.log(`Wrote ${REPORT_JSON_PATH}`);
  console.log(`Wrote ${REPORT_MD_PATH}`);
  console.log(`Missing rows: ${missing.length}`);

  const shouldApply = process.argv.includes("--apply");
  if (!shouldApply) return;

  const results = await applyGeocoding(rows, missing);
  const resolved = results.filter((item) => item.geocoded).length;
  console.log(`Resolved ${resolved} of ${results.length} missing rows`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
