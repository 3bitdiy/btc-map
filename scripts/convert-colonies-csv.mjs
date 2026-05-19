import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "public", "data");

const SOURCES = [
  {
    input: "colonies-serbia.csv",
    output: "colonies-serbia.json",
    country: "Serbia",
  },
  {
    input: "colonies-bosnia-and-herzegovina.csv",
    output: "colonies-bosnia-and-herzegovina.json",
    country: "Bosnia and Herzegovina",
  },
  {
    input: "colonies-north-macedonia.csv",
    output: "colonies-north-macedonia.json",
    country: "North Macedonia",
  },
];

const HEADER = {
  name: "Art colony's name",
  organisers: "Art colony organisers",
  contactPerson: "Contact person",
  contactTelephone: "Contact telephone",
  email: "E-mail address",
  webPage: "Web page",
  place: "The place where the art colony is held",
  timePeriod: "Time period when the art colony is held",
  artField: "Art field",
  duration: "How long does an art colony last?",
  scope: "Is the art colony national, regional or international",
};

function clean(value) {
  if (value === undefined || value === null) return "";
  const text = String(value).trim();
  if (text === "/") return "";
  return text;
}

function normalizeScope(value) {
  const text = clean(value).toLowerCase();
  if (text.includes("international")) return "International";
  if (text.includes("regional")) return "Regional";
  if (text.includes("national")) return "National";
  return "Unspecified";
}

function deriveCityFromPlace(place) {
  const text = clean(place);
  if (!text) return "";
  const first = text.split(/[\/|]/)[0].split(",")[0].trim();
  return first;
}

const geocodeCache = new Map();

async function geocode(place, country) {
  const raw = clean(place);
  if (!raw) return { latitude: null, longitude: null };

  const query = `${raw}, ${country}`;
  if (geocodeCache.has(query)) return geocodeCache.get(query);

  const url =
    "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" +
    encodeURIComponent(query);

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const first = json?.results?.[0];
    const coords = first
      ? {
          latitude: Number(first.latitude.toFixed(6)),
          longitude: Number(first.longitude.toFixed(6)),
        }
      : { latitude: null, longitude: null };

    geocodeCache.set(query, coords);
    return coords;
  } catch {
    const empty = { latitude: null, longitude: null };
    geocodeCache.set(query, empty);
    return empty;
  }
}

async function convertSource(source, idStart) {
  const csvPath = path.join(dataDir, source.input);
  const csv = await readFile(csvPath, "utf8");

  const rows = parse(csv, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
  });

  const colonies = [];
  let nextId = idStart;

  for (const row of rows) {
    const name = clean(row[HEADER.name]);
    if (!name) continue;

    const place = clean(row[HEADER.place]);
    const coords = await geocode(place, source.country);

    colonies.push({
      id: nextId,
      art_colony_name: name,
      art_colony_organisers: clean(row[HEADER.organisers]),
      contact_person: clean(row[HEADER.contactPerson]),
      contact_telephone: clean(row[HEADER.contactTelephone]),
      email_address: clean(row[HEADER.email]),
      web_page: clean(row[HEADER.webPage]),
      place,
      city: deriveCityFromPlace(place),
      time_period: clean(row[HEADER.timePeriod]),
      art_field: clean(row[HEADER.artField]),
      duration: clean(row[HEADER.duration]),
      scope: normalizeScope(row[HEADER.scope]),
      country: source.country,
      latitude: coords.latitude,
      longitude: coords.longitude,
      photos: [],
    });

    nextId += 1;
  }

  const outputPath = path.join(dataDir, source.output);
  await writeFile(outputPath, JSON.stringify(colonies, null, 2) + "\n", "utf8");

  return { nextId, outputFile: source.output, count: colonies.length };
}

async function main() {
  let nextId = 1;
  const generated = [];

  for (const source of SOURCES) {
    const result = await convertSource(source, nextId);
    nextId = result.nextId;
    generated.push(result.outputFile);
    console.log(`Generated ${result.outputFile} (${result.count})`);
  }

  const manifest = {
    files: generated,
  };

  await writeFile(
    path.join(dataDir, "colonies.manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );

  console.log("Updated colonies.manifest.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
