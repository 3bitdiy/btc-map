// Beyond the Cities · Studio — Worker entry.
// M0 scaffold + M1 auth: Google OAuth (code flow) → signed session cookie →
// allowlist lookup (KV) → /api/me. Read/write APIs (M2/M3) and the editor UI
// (M4) slot in later.

const SESSION_COOKIE = "btc_session";
const STATE_COOKIE = "btc_oauth_state";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

// Colony data lives in these per-country files (each `{ "colonies": [...] }`).
const COUNTRY_FILES = [
  "public/data/colonies-serbia.json",
  "public/data/colonies-bosnia-and-herzegovina.json",
  "public/data/colonies-north-macedonia.json",
];

// Fields an editor may change. `id` is intentionally excluded.
const EDITABLE_COLONY_FIELDS = [
  "art_colony_name", "city", "place", "country",
  "latitude", "longitude", "art_field", "scope",
  "art_colony_organisers", "contact_person", "contact_telephone",
  "email_address", "web_page", "time_period", "duration", "photos",
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const origin = url.origin;

    try {
      if (pathname === "/health") return health(env);
      if (pathname === "/auth/google") return authStart(request, env, origin);
      if (pathname === "/auth/callback") return authCallback(request, env, origin);
      if (pathname === "/auth/logout") return authLogout(origin);
      if (pathname === "/api/me") return apiMe(request, env);

      const colonyMatch = pathname.match(/^\/api\/colony\/(\d+)$/);
      if (colonyMatch) {
        if (request.method === "GET") return apiColonyGet(request, env, colonyMatch[1]);
        if (request.method === "PUT") return apiColonyPut(request, env, colonyMatch[1]);
        return json({ error: "method_not_allowed" }, 405);
      }

      if (pathname === "/") return home(request, env);
      return json({ error: "not_found" }, 404);
    } catch (err) {
      return json({ error: "server_error", detail: String(err && err.message || err) }, 500);
    }
  },
};

// --- auth: start -------------------------------------------------------------
async function authStart(request, env, origin) {
  const state = randomToken();
  const redirectUri = `${origin}/auth/callback`;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  }).toString();

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      "Set-Cookie": cookie(STATE_COOKIE, state, { maxAge: 600 }),
    },
  });
}

// --- auth: callback ----------------------------------------------------------
async function authCallback(request, env, origin) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(request);

  if (!code || !state || state !== cookies[STATE_COOKIE]) {
    return page(400, "Sign-in failed", "The sign-in request was invalid or expired. Please try again.");
  }

  // Exchange the code for tokens (server-to-server, over TLS).
  const redirectUri = `${origin}/auth/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    return page(502, "Sign-in failed", "Could not reach Google to complete sign-in.");
  }
  const tokens = await tokenRes.json();
  const claims = decodeJwtPayload(tokens.id_token);
  if (!claims || !claims.email || claims.email_verified === false) {
    return page(403, "Sign-in failed", "Your Google account did not return a verified email.");
  }

  const access = await loadAccess(env);
  const resolved = resolveRole(access, claims.email);
  if (!resolved) {
    return page(
      403,
      "Access is invite-only",
      `Signed in as <b>${escapeHtml(claims.email)}</b>, but this account isn't on the access list yet. Ask the project team to add you.`,
      origin,
    );
  }

  const session = {
    email: claims.email,
    name: claims.name || "",
    role: resolved.role,
    colonies: resolved.colonies,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const token = await signSession(env, session);

  const headers = new Headers({ Location: `${origin}/` });
  headers.append("Set-Cookie", cookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL_MS / 1000 }));
  headers.append("Set-Cookie", cookie(STATE_COOKIE, "", { maxAge: 0 }));
  return new Response(null, { status: 302, headers });
}

// --- auth: logout ------------------------------------------------------------
function authLogout(origin) {
  return new Response(null, {
    status: 302,
    headers: { Location: `${origin}/`, "Set-Cookie": cookie(SESSION_COOKIE, "", { maxAge: 0 }) },
  });
}

// --- api: me -----------------------------------------------------------------
async function apiMe(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  return json({ email: session.email, name: session.name, role: session.role, colonies: session.colonies });
}

// --- colony read/write (M2/M3) ----------------------------------------------
function canEditColony(session, id) {
  if (session.role === "admin") return true;
  return Array.isArray(session.colonies) && session.colonies.includes(String(id));
}

// Locate a colony across the country files. Returns the parsed file (with its
// GitHub sha, for writing back), the colony object and its index.
async function findColony(env, id) {
  for (const path of COUNTRY_FILES) {
    const file = await ghGetFile(env, path);
    if (!file) continue;
    const data = JSON.parse(file.text);
    const list = Array.isArray(data) ? data : data.colonies || [];
    const index = list.findIndex((c) => String(c.id) === String(id));
    if (index !== -1) return { path, sha: file.sha, text: file.text, data, list, index };
  }
  return null;
}

async function apiColonyGet(request, env, id) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  if (!canEditColony(session, id)) return json({ error: "forbidden" }, 403);

  const found = await findColony(env, id);
  if (!found) return json({ error: "colony_not_found" }, 404);
  return json({ colony: found.list[found.index], file: found.path });
}

async function apiColonyPut(request, env, id) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  if (!canEditColony(session, id)) return json({ error: "forbidden" }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const found = await findColony(env, id);
  if (!found) return json({ error: "colony_not_found" }, 404);

  // Merge only whitelisted fields; `id` and unknown keys are ignored.
  const colony = found.list[found.index];
  for (const key of EDITABLE_COLONY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) colony[key] = body[key];
  }
  found.list[found.index] = colony;

  const newText = JSON.stringify(found.data, null, 2) + "\n";
  if (newText === found.text) return json({ ok: true, unchanged: true });

  const message = `edit: ${colony.art_colony_name || "colony " + id} (studio, ${session.email})`;
  const res = await ghPutFile(env, found.path, newText, found.sha, message);
  if (res.status === 409) return json({ error: "conflict", detail: "This file changed since you loaded it — reload and retry." }, 409);
  if (!res.ok) return json({ error: "commit_failed", detail: res.detail }, 502);
  return json({ ok: true, commit: res.commit, colony });
}

// --- GitHub contents API -----------------------------------------------------
function ghHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "btc-studio",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghGetFile(env, path) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders(env) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path} → ${res.status}`);
  const data = await res.json();
  return { sha: data.sha, text: fromBase64(data.content || "") };
}

async function ghPutFile(env, path, text, sha, message) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders(env), "content-type": "application/json" },
    body: JSON.stringify({ message, content: toBase64(text), sha, branch: env.GITHUB_BRANCH }),
  });
  if (res.status === 409) return { ok: false, status: 409 };
  if (!res.ok) return { ok: false, status: res.status, detail: await res.text() };
  const out = await res.json();
  return { ok: true, commit: out.commit && out.commit.sha };
}

// --- session helpers ---------------------------------------------------------
async function getSession(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = await hmac(env.SESSION_SECRET, body);
  if (!timingSafeEqual(sig, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(b64urlDecode(body));
  } catch {
    return null;
  }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

async function signSession(env, payload) {
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = await hmac(env.SESSION_SECRET, body);
  return `${body}.${sig}`;
}

// --- allowlist (KV) ----------------------------------------------------------
async function loadAccess(env) {
  const raw = await env.ACCESS.get("access");
  if (!raw) return { admins: [], organizers: {} };
  try {
    const parsed = JSON.parse(raw);
    return { admins: parsed.admins || [], organizers: parsed.organizers || {} };
  } catch {
    return { admins: [], organizers: {} };
  }
}

function resolveRole(access, email) {
  const e = email.toLowerCase();
  if (access.admins.some((a) => String(a).toLowerCase() === e)) {
    return { role: "admin", colonies: "all" };
  }
  for (const key of Object.keys(access.organizers)) {
    if (key.toLowerCase() === e) {
      const ids = (access.organizers[key] || []).map((n) => String(n));
      return { role: "organizer", colonies: ids };
    }
  }
  return null;
}

// --- home / editor -----------------------------------------------------------
async function home(request, env) {
  const session = await getSession(request, env);
  if (!session) {
    return htmlPage(
      "Beyond the Cities · Studio",
      `<p>Sign in to manage your colony's page and its news.</p>
       <p><a class="btn" href="/auth/google">Continue with Google</a></p>`,
    );
  }
  return editorPage(session);
}

// Minimal colony editor (A4.1 shell + A4.2 form). Posts / picker / access come
// next. The client script below uses no template literals so it can live inside
// this one safely.
function editorPage(session) {
  const roleLine =
    session.role === "organizer"
      ? `colonies: ${escapeHtml((session.colonies || []).join(", ") || "none")}`
      : "all colonies";
  const field = (name, label) =>
    `<label class="fld"><span>${label}</span><input id="f-${name}" type="text" /></label>`;
  const select = (name, label, opts) =>
    `<label class="fld"><span>${label}</span><select id="f-${name}">` +
    `<option value=""></option>` +
    opts.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("") +
    `</select></label>`;

  const form =
    field("art_colony_name", "Name") +
    field("city", "City") +
    field("place", "Place") +
    select("country", "Country", ["Serbia", "Bosnia and Herzegovina", "North Macedonia"]) +
    field("latitude", "Latitude") +
    field("longitude", "Longitude") +
    field("art_field", "Art field") +
    select("scope", "Scope", ["National", "Regional", "International", "Unspecified"]) +
    field("art_colony_organisers", "Organisers") +
    field("contact_person", "Contact person") +
    field("contact_telephone", "Telephone") +
    field("email_address", "Email") +
    field("web_page", "Website") +
    field("time_period", "Time period") +
    field("duration", "Duration");

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/>` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"/>` +
    `<title>Studio · Beyond the Cities</title><style>` +
    `*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:#f6e8d5;color:#8d313a}` +
    `.bar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 20px;` +
    `background:#fff;border-bottom:1px solid rgba(141,49,58,.15)}` +
    `.bar b{color:#000}.badge{background:#eb5160;color:#fff;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700}` +
    `.wrap{max-width:760px;margin:0 auto;padding:24px 20px 80px}` +
    `.load{display:flex;gap:8px;margin:8px 0 20px}` +
    `input,select{font:inherit;padding:9px 12px;border:1px solid rgba(141,49,58,.3);border-radius:10px;background:#fff;color:#8d313a;width:100%}` +
    `.btn{background:#eb5160;color:#fff;border:0;border-radius:999px;padding:10px 20px;font-weight:700;cursor:pointer;white-space:nowrap}` +
    `.btn.ghost{background:#fff;border:1.5px solid rgba(141,49,58,.35);color:#8d313a}` +
    `#form{display:none;background:#fff;border:1px solid rgba(141,49,58,.15);border-radius:16px;padding:20px}` +
    `.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}` +
    `.fld{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600}` +
    `.fld span{opacity:.8}.actions{margin-top:18px;display:flex;gap:10px;align-items:center}` +
    `#status{font-size:13px;font-weight:600;opacity:.85}a{color:#8d313a}` +
    `</style></head><body>` +
    `<div class="bar"><span><b>Beyond the Cities</b> · Studio</span>` +
    `<span><span class="badge">${escapeHtml(session.role)}</span> ${escapeHtml(session.email)} · <a href="/auth/logout">Log out</a></span></div>` +
    `<div class="wrap"><p style="opacity:.8">Signed in — ${roleLine}.</p>` +
    `<div class="load"><input id="colony-id" type="text" inputmode="numeric" placeholder="Colony ID (e.g. 1)"/>` +
    `<button class="btn ghost" onclick="loadColony()">Load</button></div>` +
    `<h2 id="title" style="color:#000"></h2>` +
    `<div id="form"><div class="grid">${form}</div>` +
    `<div class="actions"><button class="btn" onclick="save()">Save changes</button><span id="status"></span></div></div>` +
    `</div><script>` + EDITOR_JS + `</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

// Client script — plain concatenation, no backticks/template literals.
const EDITOR_JS =
  "var FIELDS=['art_colony_name','city','place','country','latitude','longitude','art_field','scope','art_colony_organisers','contact_person','contact_telephone','email_address','web_page','time_period','duration'];" +
  "var currentId=null;" +
  "function q(id){return document.getElementById(id)}" +
  "function setStatus(t){q('status').textContent=t}" +
  "async function loadColony(){" +
  "var id=q('colony-id').value.trim();if(!id)return;" +
  "setStatus('Loading…');q('title').textContent='';" +
  "var r=await fetch('/api/colony/'+id);" +
  "if(!r.ok){var e=await r.json();setStatus('Could not load: '+(e.error||r.status));q('form').style.display='none';return}" +
  "var data=await r.json();var c=data.colony;" +
  "FIELDS.forEach(function(f){var el=q('f-'+f);if(el)el.value=(c[f]==null?'':c[f])});" +
  "currentId=id;q('title').textContent=c.art_colony_name||('Colony '+id);" +
  "q('form').style.display='block';setStatus('Loaded from '+data.file)}" +
  "async function save(){if(!currentId)return;var body={};" +
  "FIELDS.forEach(function(f){body[f]=q('f-'+f).value});" +
  "['latitude','longitude'].forEach(function(k){var v=String(body[k]).trim();if(v!==''&&!isNaN(Number(v))){body[k]=Number(v)}else{delete body[k]}});" +
  "setStatus('Saving…');" +
  "var r=await fetch('/api/colony/'+currentId,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});" +
  "var out=await r.json();" +
  "if(!r.ok){setStatus('Save failed: '+(out.detail||out.error));return}" +
  "if(out.unchanged){setStatus('No changes to save');return}" +
  "setStatus('Saved \\u2713  commit '+String(out.commit||'').slice(0,7)+' — live in ~1–2 min')}";

// --- misc responders ---------------------------------------------------------
function health(env) {
  return json({
    ok: true,
    service: "btc-studio",
    config: {
      repo: env.GITHUB_REPO ?? null,
      branch: env.GITHUB_BRANCH ?? null,
      studioUrl: env.STUDIO_URL ?? null,
      googleClientId: Boolean(env.GOOGLE_CLIENT_ID) && env.GOOGLE_CLIENT_ID !== "PASTE_YOUR_GOOGLE_CLIENT_ID_HERE",
      googleClientSecret: Boolean(env.GOOGLE_CLIENT_SECRET),
      githubToken: Boolean(env.GITHUB_TOKEN),
      sessionSecret: Boolean(env.SESSION_SECRET),
      accessKv: Boolean(env.ACCESS),
    },
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function page(status, title, message, origin) {
  const back = origin ? `<p><a href="${origin}/auth/logout">Try another account</a></p>` : "";
  return htmlPage(title, `<p>${message}</p>${back}`, status);
}

function htmlPage(title, inner, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
  body{font-family:system-ui,sans-serif;background:#f6e8d5;color:#8d313a;margin:0;
       min-height:100vh;display:grid;place-items:center;padding:24px}
  .card{background:#fff;border:1px solid rgba(141,49,58,.15);border-radius:18px;
        padding:32px 36px;max-width:440px;box-shadow:0 14px 40px rgba(141,49,58,.12)}
  h1{font-size:20px;margin:0 0 12px}
  p{line-height:1.6;margin:0 0 12px}
  a{color:#8d313a}
  .btn{display:inline-block;background:#eb5160;color:#fff;text-decoration:none;
       padding:11px 20px;border-radius:999px;font-weight:700;margin-top:6px}
</style></head><body><div class="card"><h1>${escapeHtml(title)}</h1>${inner}</div></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

// --- low-level utils ---------------------------------------------------------
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return b64urlBytes(bytes);
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64urlBytes(new Uint8Array(sig));
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function decodeJwtPayload(jwt) {
  if (!jwt || typeof jwt !== "string") return null;
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(b64urlDecode(parts[1]));
  } catch {
    return null;
  }
}

function b64urlBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlEncode(str) {
  return b64urlBytes(new TextEncoder().encode(str));
}
function b64urlDecode(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Standard base64 (GitHub contents API), UTF-8 safe.
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function fromBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function cookie(name, value, { maxAge } = {}) {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "Secure", "SameSite=Lax"];
  if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  return parts.join("; ");
}
function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function escapeHtml(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
