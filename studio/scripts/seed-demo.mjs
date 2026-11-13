#!/usr/bin/env node
// Demo content for the Studio (presentation on 2026-11-20): six fictional
// organizers with profiles, spread over the three countries, and a handful of
// notices on the board. Nothing here is a real person; the emails are on our
// own domain and cannot sign in (they are not Google accounts).
//
//   node studio/scripts/seed-demo.mjs          # add (idempotent)
//   node studio/scripts/seed-demo.mjs --remove # take it all out again
//
// Writes to the live D1 database (profiles, notices) and the ACCESS KV
// allowlist through wrangler, so it needs a logged-in wrangler.

import { execFileSync } from "node:child_process";

const CONFIG = "studio/wrangler.jsonc";
const KV_ID = "277fbe5444964a60a86e12b910a3e04f"; // ACCESS namespace (see wrangler.jsonc)
const DOMAIN = "demo.beyondthecities.org";
const REMOVE = process.argv.includes("--remove");

const PEOPLE = [
  { key: "marija", name: "Marija Petrović", colony: "33", phone: "+381 64 000 1001",
    about: "Curator at the Niš gallery, running the Sićevo colony since 2019. Happy to swap artists with other colonies and co-apply for Creative Europe calls." },
  { key: "nikola.v", name: "Nikola Vasić", colony: "5", phone: "+381 63 000 1002",
    about: "Sculptor and coordinator of Terra in Kikinda. We have a large terracotta workshop and kilns that stand idle outside July." },
  { key: "amira", name: "Amira Hadžić", colony: "61", phone: "+387 61 000 1003",
    about: "Running the KOLO colony in Trebinje since 2015. Interested in ceramics exchanges and joint residencies with Serbian and Macedonian colonies." },
  { key: "dzenan", name: "Dženan Kovačević", colony: "65", phone: "",
    about: "Painter, volunteer organiser of JajceArt. We host ten artists every July in the old town; looking for partners for a touring show." },
  { key: "nikola.s", name: "Nikola Stojanovski", colony: "73", phone: "+389 70 000 1005",
    about: "Mountain village colony each August. We can offer accommodation for up to twelve artists and a small exhibition space in Skopje." },
  { key: "elena", name: "Elena Trajkovska", colony: "79", phone: "+389 71 000 1006",
    about: "Poet and editor, I run the literary colony in Galičnik. Translating between Macedonian, Serbian and English is my day job." },
];

const NOTICES = [
  { by: "amira", type: "open_call", title: "Residency 2027 in Trebinje: two places for ceramicists", deadline: "2026-12-15", created: "2026-11-08",
    body: "We have two funded places for artists working with clay, 1 to 20 June 2027. Stay and materials covered, travel up to 200 EUR. Send a short portfolio and a few lines about what you would make in Trebinje." },
  { by: "nikola.s", type: "partners", title: "Joint exhibition Niš and Skopje, autumn 2027", deadline: "", created: "2026-11-10",
    body: "Galičnik is planning a touring show of works made in Balkan colonies. Looking for one Serbian and one Bosnian partner colony to co-host and co-apply for the Balkan Culture Fund in March." },
  { by: "marija", type: "offering", title: "Free stay for a printmaker in Sićevo, June 2027", deadline: "", created: "2026-11-02",
    body: "Our etching press is free in June. We can host one printmaker for two weeks: room, studio, paper. Ideal for someone from a partner colony who wants to produce a small edition." },
  { by: "nikola.v", type: "open_call", title: "Terra 2027: call for sculptors working in clay", deadline: "2027-02-01", created: "2026-11-12",
    body: "Five to eight sculptors, July 2027, Kikinda. Large-format terracotta, kilns up to 3 m. Applications with a portfolio and a sketch of the proposed piece. Travel, stay and materials are covered." },
  { by: "dzenan", type: "question", title: "How do you handle travel insurance for visiting artists?", deadline: "", created: "2026-11-11",
    body: "We had a question from an artist coming from Austria about insurance during the colony. Does anyone have a template or a provider they use? Happy to share what we find." },
  { by: "elena", type: "offering", title: "Help translating open calls into Macedonian and English", deadline: "", created: "2026-11-05",
    body: "If your colony wants to reach artists in North Macedonia, send me the call and I will translate it. Short texts within a week, no charge between colonies." },
];

const emailOf = (p) => `${p.key}@${DOMAIN}`;
const byKey = Object.fromEntries(PEOPLE.map((p) => [p.key, p]));
const sq = (s) => "'" + String(s).replace(/'/g, "''") + "'";

function wrangler(args, input) {
  return execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", input, stdio: ["pipe", "pipe", "inherit"] });
}
function d1(sql) {
  const out = wrangler(["d1", "execute", "btc-network", "--remote", "--config", CONFIG, "--json", "--command", sql]);
  return JSON.parse(out.slice(out.indexOf("[")));
}

// ---- KV allowlist ----------------------------------------------------------
const raw = wrangler(["kv", "key", "get", "access", "--namespace-id", KV_ID, "--remote"]);
const access = JSON.parse(raw.slice(raw.indexOf("{")));
access.organizers = access.organizers || {};
for (const p of PEOPLE) {
  if (REMOVE) delete access.organizers[emailOf(p)];
  else access.organizers[emailOf(p)] = [p.colony];
}
wrangler(["kv", "key", "put", "access", JSON.stringify(access), "--namespace-id", KV_ID, "--remote"]);
console.log((REMOVE ? "removed" : "added") + " demo organizers in the allowlist");

// ---- D1 --------------------------------------------------------------------
const emails = PEOPLE.map((p) => sq(emailOf(p))).join(",");
if (REMOVE) {
  d1(`DELETE FROM notices WHERE author_email IN (${emails})`);
  d1(`DELETE FROM profiles WHERE email IN (${emails})`);
  console.log("removed demo profiles and notices");
  process.exit(0);
}

const now = new Date().toISOString();
const profileRows = PEOPLE.map((p) => {
  const created = "2026-11-10T09:00:00.000Z", login = "2026-11-12T18:30:00.000Z";
  return `(${sq(emailOf(p))}, ${sq(p.name)}, ${sq(p.name)}, ${sq(p.phone)}, ${sq(p.about)}, '', 1, 1, 1, '', ${sq(created)}, ${sq(login)}, ${sq(login)})`;
}).join(",\n");
d1(`INSERT OR REPLACE INTO profiles (email, google_name, name, phone, about, languages, show_email, visible, newsletter, unsub_token, created_at, updated_at, last_login) VALUES\n${profileRows}`);

d1(`DELETE FROM notices WHERE author_email IN (${emails})`);
const noticeRows = NOTICES.map((n) => {
  const createdAt = n.created + "T10:00:00.000Z";
  const expires = n.deadline ? n.deadline + "T23:59:59.000Z" : new Date(Date.parse(createdAt) + 90 * 864e5).toISOString();
  return `(${sq(n.type)}, ${sq(n.title)}, ${sq(n.body)}, ${n.deadline ? sq(n.deadline) : "NULL"}, ${sq(byKey[n.by].colony)}, ${sq(emailOf(byKey[n.by]))}, 0, 'open', ${sq(createdAt)}, ${sq(createdAt)}, ${sq(expires)})`;
}).join(",\n");
d1(`INSERT INTO notices (type, title, body, deadline, colony_id, author_email, is_public, status, created_at, updated_at, expires_at) VALUES\n${noticeRows}`);
console.log(`seeded ${PEOPLE.length} profiles and ${NOTICES.length} notices (${now})`);
