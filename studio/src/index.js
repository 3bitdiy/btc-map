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

// Canonical disciplines for the "Art field" multi-select (matches the CMS list).
// Stored as a comma-separated string to keep the format the map reads.
const DISCIPLINES = [
  "Painting", "Sculpture", "Visual arts", "Graphic arts", "Photography",
  "Film & video", "Multimedia", "Literature", "Calligraphy", "Applied arts",
  "Crafts & pottery", "Street art", "Folk & naive art", "Performance",
  "Dance", "Multidisciplinary",
];

// Photo upload constraints. Colony photos live under public/ and are referenced
// as /assets/images/colonies/<file>; the map/colony page show photos[0].
const PHOTO_DIR = "public/assets/images/colonies";
const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const IMAGE_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Blog posts: one markdown file per post (front-matter + body).
const BLOG_DIR = "public/data/blog";
const BLOG_IMG_DIR = "public/assets/images/blog";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const origin = url.origin;

    try {
      // Basic write rate limit (protects the GitHub token from abuse).
      if (pathname.startsWith("/api/") && (request.method === "POST" || request.method === "PUT" || request.method === "DELETE")) {
        const s = await getSession(request, env);
        if (s && !(await rateOk(env, s.email))) {
          return json({ error: "rate_limited", detail: "Too many changes — wait a minute." }, 429);
        }
      }

      if (pathname === "/health") return health(env);
      if (pathname === "/auth/google") return authStart(request, env, origin);
      if (pathname === "/auth/callback") return authCallback(request, env, origin);
      if (pathname === "/auth/logout") return authLogout(origin);
      if (pathname === "/api/me") return apiMe(request, env);
      if (pathname === "/api/colonies") return apiColonies(request, env);

      const photoMatch = pathname.match(/^\/api\/colony\/(\d+)\/photo$/);
      if (photoMatch) {
        if (request.method === "POST") return apiColonyPhotoPost(request, env, photoMatch[1]);
        if (request.method === "DELETE") return apiColonyPhotoDelete(request, env, photoMatch[1]);
        return json({ error: "method_not_allowed" }, 405);
      }

      const colonyMatch = pathname.match(/^\/api\/colony\/(\d+)$/);
      if (colonyMatch) {
        if (request.method === "GET") return apiColonyGet(request, env, colonyMatch[1]);
        if (request.method === "PUT") return apiColonyPut(request, env, colonyMatch[1]);
        return json({ error: "method_not_allowed" }, 405);
      }

      if (pathname === "/api/posts") return apiPostsList(request, env);
      if (pathname === "/api/upload" && request.method === "POST") return apiUpload(request, env);

      if (pathname === "/api/access") {
        if (request.method === "GET") return apiAccessGet(request, env);
        if (request.method === "PUT") return apiAccessPut(request, env);
        return json({ error: "method_not_allowed" }, 405);
      }

      const postMatch = pathname.match(/^\/api\/post\/([a-z0-9-]+)$/i);
      if (postMatch) {
        if (request.method === "GET") return apiPostGet(request, env, postMatch[1]);
        if (request.method === "PUT") return apiPostPut(request, env, postMatch[1]);
        if (request.method === "DELETE") return apiPostDelete(request, env, postMatch[1]);
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
  const resolved = resolveRole(access, claims.email, ownerEmails(env));
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
    owner: !!resolved.owner,
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

// Lightweight list for the editor's colony picker. Admin → all; organizer →
// only their assigned colonies.
async function apiColonies(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);

  const all = [];
  for (const path of COUNTRY_FILES) {
    const file = await ghGetFile(env, path);
    if (!file) continue;
    const data = JSON.parse(file.text);
    const list = Array.isArray(data) ? data : data.colonies || [];
    for (const c of list) {
      const place = [c.city, c.place].map((v) => String(v || "").trim()).filter(Boolean);
      all.push({
        id: c.id,
        name: c.art_colony_name,
        country: c.country,
        place: [...new Set(place)].join(" · "),
      });
    }
  }

  let out = all;
  if (session.role !== "admin") {
    const mine = new Set((session.colonies || []).map(String));
    out = all.filter((c) => mine.has(String(c.id)));
  }
  out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return json({ colonies: out });
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

// Set the colony's photos[0] by committing an uploaded image + patching the JSON.
async function apiColonyPhotoPost(request, env, id) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  if (!canEditColony(session, id)) return json({ error: "forbidden" }, 403);

  let file;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return json({ error: "invalid_upload" }, 400);
  }
  if (!file || typeof file === "string") return json({ error: "no_file" }, 400);

  const ext = IMAGE_EXT[file.type];
  if (!ext) return json({ error: "unsupported_type", detail: "Use JPEG, PNG or WebP." }, 415);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > PHOTO_MAX_BYTES) return json({ error: "too_large", detail: "Max 5 MB." }, 413);

  const found = await findColony(env, id);
  if (!found) return json({ error: "colony_not_found" }, 404);
  const colony = found.list[found.index];

  // SEO/readable filename: colony-name slug + a short unique suffix.
  const slug = slugify(colony.art_colony_name) || `colony-${id}`;
  const name = `${slug}-${Date.now()}.${ext}`;
  const imgPath = `${PHOTO_DIR}/${name}`;
  const publicPath = `/assets/images/colonies/${name}`;

  const imgRes = await ghCommitFile(env, imgPath, bytesToBase64(bytes), null, `photo: ${colony.art_colony_name || "colony " + id} (studio, ${session.email})`);
  if (!imgRes.ok) return json({ error: "image_commit_failed", detail: imgRes.detail }, 502);

  const existing = Array.isArray(colony.photos) ? colony.photos : [];
  const prevMain = existing[0];
  colony.photos = [publicPath, ...existing.slice(1)];
  found.list[found.index] = colony;

  const jsonRes = await ghPutFile(
    env, found.path, JSON.stringify(found.data, null, 2) + "\n", found.sha,
    `edit: ${colony.art_colony_name || "colony " + id} main photo (studio, ${session.email})`,
  );
  if (!jsonRes.ok) return json({ error: "commit_failed", detail: jsonRes.detail }, 502);
  if (prevMain && prevMain !== publicPath) await deleteRepoImage(env, prevMain, session.email);
  return json({ ok: true, photo: publicPath, photos: colony.photos, commit: jsonRes.commit });
}

async function apiColonyPhotoDelete(request, env, id) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  if (!canEditColony(session, id)) return json({ error: "forbidden" }, 403);

  const found = await findColony(env, id);
  if (!found) return json({ error: "colony_not_found" }, 404);
  const colony = found.list[found.index];
  const existing = Array.isArray(colony.photos) ? colony.photos : [];
  if (!existing.length) return json({ ok: true, photos: [], unchanged: true });
  const removed = existing[0];
  colony.photos = existing.slice(1);
  found.list[found.index] = colony;

  const res = await ghPutFile(
    env, found.path, JSON.stringify(found.data, null, 2) + "\n", found.sha,
    `edit: ${colony.art_colony_name || "colony " + id} remove main photo (studio, ${session.email})`,
  );
  if (!res.ok) return json({ error: "commit_failed", detail: res.detail }, 502);
  await deleteRepoImage(env, removed, session.email);
  return json({ ok: true, photos: colony.photos, commit: res.commit });
}

// --- blog posts (A2.2 / A3.3) ------------------------------------------------
// Which colonies (if any) a post is scoped to decides who may edit it.
function canEditPost(session, colonies) {
  if (session.role === "admin") return true;
  const mine = new Set((session.colonies || []).map(String));
  return (colonies || []).some((c) => mine.has(String(c)));
}

async function apiPostsList(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);

  const entries = await ghListDir(env, BLOG_DIR);
  const posts = [];
  for (const e of entries) {
    if (e.type !== "file" || !e.name.endsWith(".md")) continue;
    const file = await ghGetFile(env, `${BLOG_DIR}/${e.name}`);
    if (!file) continue;
    const { data } = parseFrontMatter(file.text);
    const colonies = normalizeColonies(data.colonies);
    if (!canEditPost(session, colonies)) continue;
    posts.push({
      slug: e.name.replace(/\.md$/, ""),
      title: data.title || "(untitled)",
      date: data.date || "",
      draft: String(data.draft).toLowerCase() === "true",
      colonies,
    });
  }
  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  // Colonies the user may tag a post with (for the editor's picker).
  const taggable =
    session.role === "admin" ? await listAllColonies(env) : await listMyColonies(env, session);
  return json({ posts, taggable, role: session.role });
}

async function apiPostGet(request, env, slug) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  const file = await ghGetFile(env, `${BLOG_DIR}/${slug}.md`);
  if (!file) return json({ error: "post_not_found" }, 404);
  const { data, body } = parseFrontMatter(file.text);
  const colonies = normalizeColonies(data.colonies);
  if (!canEditPost(session, colonies)) return json({ error: "forbidden" }, 403);
  return json({
    post: {
      slug,
      title: data.title || "",
      date: data.date || "",
      author: data.author || "",
      excerpt: data.excerpt || "",
      cover: data.cover || "",
      tags: Array.isArray(data.tags) ? data.tags : [],
      colonies,
      draft: String(data.draft).toLowerCase() === "true",
      body: (body || "").trim(),
    },
  });
}

async function apiPostPut(request, env, slug) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body.title || !String(body.title).trim()) return json({ error: "title_required" }, 400);

  const colonies = normalizeColonies(body.colonies);
  // Organizer may only tag their own colonies.
  if (session.role !== "admin") {
    const mine = new Set((session.colonies || []).map(String));
    if (!colonies.every((c) => mine.has(String(c)))) {
      return json({ error: "forbidden_colony", detail: "You can only tag your own colonies." }, 403);
    }
  }

  const existing = await ghGetFile(env, `${BLOG_DIR}/${slug}.md`);
  if (existing) {
    // Editing an existing post — must be allowed to edit the current one.
    const cur = normalizeColonies(parseFrontMatter(existing.text).data.colonies);
    if (!canEditPost(session, cur)) return json({ error: "forbidden" }, 403);
  } else if (session.role !== "admin" && colonies.length === 0) {
    // A brand-new general (unscoped) post is admin-only.
    return json({ error: "forbidden", detail: "Only admins can create general posts." }, 403);
  }

  const md = serializePost({
    title: String(body.title).trim(),
    date: body.date || new Date().toISOString().slice(0, 10),
    author: body.author || "",
    excerpt: body.excerpt || "",
    cover: body.cover || "",
    tags: (Array.isArray(body.tags) ? body.tags : []).map((t) => String(t).trim()).filter(Boolean),
    colonies,
    draft: Boolean(body.draft),
    body: body.body || "",
  });

  const res = await ghCommitFile(
    env, `${BLOG_DIR}/${slug}.md`, toBase64(md), existing ? existing.sha : null,
    `${existing ? "edit" : "post"}: ${String(body.title).trim()} (studio, ${session.email})`,
  );
  if (res.status === 409) return json({ error: "conflict" }, 409);
  if (!res.ok) return json({ error: "commit_failed", detail: res.detail }, 502);
  if (existing) {
    const oldCover = parseFrontMatter(existing.text).data.cover;
    if (oldCover && oldCover !== (body.cover || "")) await deleteRepoImage(env, oldCover, session.email);
  }
  return json({ ok: true, slug, commit: res.commit });
}

async function apiPostDelete(request, env, slug) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  const file = await ghGetFile(env, `${BLOG_DIR}/${slug}.md`);
  if (!file) return json({ error: "post_not_found" }, 404);
  const colonies = normalizeColonies(parseFrontMatter(file.text).data.colonies);
  if (!canEditPost(session, colonies)) return json({ error: "forbidden" }, 403);

  const cover = parseFrontMatter(file.text).data.cover;
  const res = await ghDeleteFile(env, `${BLOG_DIR}/${slug}.md`, file.sha, `delete post: ${slug} (studio, ${session.email})`);
  if (!res.ok) return json({ error: "delete_failed", detail: res.detail }, 502);
  if (cover) await deleteRepoImage(env, cover, session.email);
  return json({ ok: true, commit: res.commit });
}

// Generic image upload (blog covers). Commits to public/assets/images/blog/.
async function apiUpload(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);

  let file, title, replace;
  try {
    const form = await request.formData();
    file = form.get("file");
    title = form.get("title");
    replace = form.get("replace"); // a just-uploaded, unsaved cover to clean up
  } catch {
    return json({ error: "invalid_upload" }, 400);
  }
  if (!file || typeof file === "string") return json({ error: "no_file" }, 400);
  const ext = IMAGE_EXT[file.type];
  if (!ext) return json({ error: "unsupported_type", detail: "Use JPEG, PNG or WebP." }, 415);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > PHOTO_MAX_BYTES) return json({ error: "too_large", detail: "Max 5 MB." }, 413);

  // SEO/readable filename from the post title, e.g. open-call-2026-cover-<ts>.webp
  const slug = slugify(title);
  const name = `${slug ? slug + "-" : ""}cover-${Date.now()}.${ext}`;
  const res = await ghCommitFile(env, `${BLOG_IMG_DIR}/${name}`, bytesToBase64(bytes), null, `blog image (studio, ${session.email})`);
  if (!res.ok) return json({ error: "image_commit_failed", detail: res.detail }, 502);
  // Drop the previous, unsaved cover from this editing session (blog folder only).
  if (typeof replace === "string" && replace.startsWith("/assets/images/blog/")) {
    await deleteRepoImage(env, replace, session.email);
  }
  return json({ ok: true, path: `/assets/images/blog/${name}` });
}

// --- access / allowlist admin (A4.5) -----------------------------------------
async function apiAccessGet(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  if (session.role !== "admin") return json({ error: "forbidden" }, 403);
  const owners = ownerEmails(env);
  const access = await loadAccess(env);
  // Owners are implicit admins — don't also list them among removable admins.
  access.admins = (access.admins || []).filter(
    (a) => !owners.some((o) => o.toLowerCase() === String(a).toLowerCase()),
  );
  return json({ access, colonies: await listAllColonies(env), owners, isOwner: !!session.owner });
}

async function apiAccessPut(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  if (session.role !== "admin") return json({ error: "forbidden" }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const owners = ownerEmails(env);
  const current = await loadAccess(env);
  // Only owners may change the admin list; other admins keep it as-is.
  let admins;
  if (session.owner) {
    admins = (Array.isArray(body.admins) ? body.admins : []).map((e) => String(e).trim()).filter(Boolean);
    // Owners are implicit admins — never store them in the list.
    admins = admins.filter((a) => !owners.some((o) => o.toLowerCase() === a.toLowerCase()));
  } else {
    admins = current.admins;
  }
  if (!owners.length && !admins.length) return json({ error: "need_admin", detail: "Keep at least one admin." }, 400);

  const organizers = {};
  const src = body.organizers && typeof body.organizers === "object" ? body.organizers : {};
  for (const email of Object.keys(src)) {
    const e = String(email).trim();
    if (!e) continue;
    const ids = (Array.isArray(src[email]) ? src[email] : []).map((n) => String(n).trim()).filter(Boolean);
    organizers[e] = [...new Set(ids)];
  }
  await env.ACCESS.put("access", JSON.stringify({ admins: [...new Set(admins)], organizers }));
  return json({ ok: true });
}

// --- front-matter parse / serialize (mirrors scripts/gen-blog.mjs) ------------
function parseFrontMatter(raw) {
  const m = String(raw).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2].trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      data[key] = val.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else if (val === "") {
      const items = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
        items.push(lines[++i].replace(/^\s*-\s+/, "").trim().replace(/^["']|["']$/g, ""));
      }
      data[key] = items.length ? items : "";
    } else {
      data[key] = val.replace(/^["']|["']$/g, "");
    }
  }
  return { data, body: m[2] };
}

function serializePost(p) {
  const fm = [
    `title: ${p.title}`,
    `date: ${p.date}`,
    `author: ${p.author}`,
    `excerpt: ${p.excerpt}`,
    `cover: ${p.cover}`,
    `tags: [${(p.tags || []).join(", ")}]`,
    `colonies: [${(p.colonies || []).join(", ")}]`,
    `draft: ${p.draft ? "true" : "false"}`,
  ];
  return `---\n${fm.join("\n")}\n---\n\n${String(p.body || "").trim()}\n`;
}

function slugify(s) {
  const map = { č: "c", ć: "c", ž: "z", š: "s", đ: "dj", Č: "c", Ć: "c", Ž: "z", Š: "s", Đ: "dj" };
  return String(s || "")
    .replace(/[čćžšđČĆŽŠĐ]/g, (m) => map[m] || m)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeColonies(v) {
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  return arr.map((n) => String(n).trim()).filter(Boolean);
}

async function listAllColonies(env) {
  const out = [];
  for (const path of COUNTRY_FILES) {
    const file = await ghGetFile(env, path);
    if (!file) continue;
    const data = JSON.parse(file.text);
    const list = Array.isArray(data) ? data : data.colonies || [];
    for (const c of list) out.push({ id: String(c.id), name: c.art_colony_name });
  }
  out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return out;
}

async function listMyColonies(env, session) {
  const mine = new Set((session.colonies || []).map(String));
  return (await listAllColonies(env)).filter((c) => mine.has(c.id));
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

async function ghListDir(env, path) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders(env) });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub GET dir ${path} → ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// Best-effort delete of a previously-uploaded image (colony photo or blog
// cover). Restricted to our upload folders so it can never touch the shared
// placeholder or anything else. Failures are ignored.
async function deleteRepoImage(env, publicPath, email) {
  if (typeof publicPath !== "string") return;
  if (
    !publicPath.startsWith("/assets/images/colonies/") &&
    !publicPath.startsWith("/assets/images/blog/")
  ) {
    return;
  }
  const path = `public${publicPath}`;
  try {
    const file = await ghGetFile(env, path);
    if (file) {
      await ghDeleteFile(env, path, file.sha, `cleanup: remove unused ${publicPath} (studio, ${email})`);
    }
  } catch {
    /* best effort — leave the orphan if anything goes wrong */
  }
}

async function ghDeleteFile(env, path, sha, message) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { ...ghHeaders(env), "content-type": "application/json" },
    body: JSON.stringify({ message, sha, branch: env.GITHUB_BRANCH }),
  });
  if (!res.ok) return { ok: false, status: res.status, detail: await res.text() };
  const out = await res.json();
  return { ok: true, commit: out.commit && out.commit.sha };
}

function ghPutFile(env, path, text, sha, message) {
  return ghCommitFile(env, path, toBase64(text), sha, message);
}

// Core commit for one file. `sha` is required to update an existing file,
// omitted to create a new one. `contentB64` is standard base64.
async function ghCommitFile(env, path, contentB64, sha, message) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`;
  const body = { message, content: contentB64, branch: env.GITHUB_BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders(env), "content-type": "application/json" },
    body: JSON.stringify(body),
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

// Fixed-window write rate limit, keyed by email, stored in the ACCESS KV.
async function rateOk(env, email) {
  const windowSec = 60;
  const limit = 40;
  const bucket = `rl:${email}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const cur = parseInt((await env.ACCESS.get(bucket)) || "0", 10);
  if (cur >= limit) return false;
  await env.ACCESS.put(bucket, String(cur + 1), { expirationTtl: windowSec });
  return true;
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

function ownerEmails(env) {
  return String(env.OWNER_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function resolveRole(access, email, owners) {
  const e = email.toLowerCase();
  if ((owners || []).some((o) => o.toLowerCase() === e)) {
    return { role: "admin", owner: true, colonies: "all" };
  }
  if (access.admins.some((a) => String(a).toLowerCase() === e)) {
    return { role: "admin", owner: false, colonies: "all" };
  }
  for (const key of Object.keys(access.organizers)) {
    if (key.toLowerCase() === e) {
      const ids = (access.organizers[key] || []).map((n) => String(n));
      return { role: "organizer", owner: false, colonies: ids };
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
  return editorPage(session, env);
}

// Minimal colony editor (A4.1 shell + A4.2 form). Posts / access come next. The
// client script below uses no template literals so it can live inside this one.
function editorPage(session, env) {
  const rawBase = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/${env.GITHUB_BRANCH}/public`;
  const field = (name, label) =>
    `<label class="fld"><span>${label}</span><input id="f-${name}" type="text" /></label>`;
  const select = (name, label, opts) =>
    `<label class="fld"><span>${label}</span><select id="f-${name}">` +
    `<option value=""></option>` +
    opts.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("") +
    `</select></label>`;
  // Repeatable text field (stored joined by ", " in one string).
  const multi = (name, label, addLabel) =>
    `<div class="fld full"><span>${label}</span><div id="ml-${name}" class="multiline"></div>` +
    `<button type="button" class="btn ghost ml-add" onclick="addMulti('${name}','')">${addLabel}</button></div>`;

  const artChips = DISCIPLINES.map(
    (d) => `<button type="button" class="chip" data-v="${escapeHtml(d)}">${escapeHtml(d)}</button>`,
  ).join("");
  const artField =
    `<div class="fld full"><span>Art field</span>` +
    `<div id="art-chips" class="chips">${artChips}</div>` +
    `<input id="f-art_field_other" type="text" placeholder="Other (comma-separated)…" style="margin-top:8px"/></div>`;

  const photoField =
    `<div class="fld full"><span>Main photo</span>` +
    `<div class="photo"><img id="photo-preview" alt="" />` +
    `<div class="photo-ctl">` +
    `<input type="file" id="photo-file" accept="image/png,image/jpeg,image/webp"/>` +
    `<div style="display:flex;gap:8px"><button type="button" class="btn ghost" onclick="uploadPhoto()">Upload photo</button>` +
    `<button type="button" class="btn ghost" onclick="removePhoto()">Remove</button></div>` +
    `<span id="photo-status" style="font-size:12px"></span>` +
    `<span style="font-size:11px;opacity:.7">Committed immediately · JPEG/PNG/WebP · max 5 MB</span>` +
    `</div></div></div>`;

  const form =
    field("art_colony_name", "Name") +
    field("city", "City") +
    field("place", "Place") +
    select("country", "Country", ["Serbia", "Bosnia and Herzegovina", "North Macedonia"]) +
    field("latitude", "Latitude") +
    field("longitude", "Longitude") +
    artField +
    photoField +
    select("scope", "Scope", ["National", "Regional", "International", "Unspecified"]) +
    field("art_colony_organisers", "Organisers") +
    field("contact_person", "Contact person") +
    multi("contact_telephone", "Telephone(s)", "+ Add phone") +
    multi("email_address", "Email(s)", "+ Add email") +
    multi("web_page", "Website(s)", "+ Add website") +
    field("time_period", "Time period") +
    field("duration", "Duration");

  const postEditor =
    `<div id="post-editor" style="display:none">` +
    `<h3 id="pe-title" style="color:#000;margin:0 0 12px"></h3>` +
    `<div class="grid">` +
    `<label class="fld"><span>Title</span><input id="p-title" type="text"/></label>` +
    `<label class="fld"><span>Date</span><input id="p-date" type="date"/></label>` +
    `<label class="fld"><span>Author</span><input id="p-author" type="text"/></label>` +
    `<label class="fld"><span>Tags (comma-separated)</span><input id="p-tags" type="text"/></label>` +
    `<label class="fld full"><span>Excerpt</span><textarea id="p-excerpt" rows="2"></textarea></label>` +
    `<div class="fld full"><span>Colonies this post is news for (leave empty for a general post)</span>` +
    `<div id="p-colonies-chips" class="chips"></div>` +
    `<select id="p-colonies-add" style="margin-top:8px"><option value="">+ add colony…</option></select></div>` +
    `<div class="fld full"><span>Cover image</span><div class="photo"><img id="p-cover-preview" alt=""/>` +
    `<div class="photo-ctl"><input type="file" id="p-cover-file" accept="image/png,image/jpeg,image/webp"/>` +
    `<button type="button" class="btn ghost" onclick="uploadCover()">Upload cover</button>` +
    `<span id="p-cover-status" style="font-size:12px"></span></div></div></div>` +
    `<label class="fld full"><span>Body (markdown)</span><textarea id="p-body" rows="12"></textarea></label>` +
    `<label class="fld" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="p-draft" style="width:auto"/><span>Draft (kept off the blog)</span></label>` +
    `</div>` +
    `<div class="actions"><button class="btn" onclick="savePost()">Save post</button>` +
    `<button class="btn ghost" id="pe-delete" onclick="deletePost()">Delete</button>` +
    `<button class="btn ghost" onclick="cancelPost()">Cancel</button><span id="p-status"></span></div></div>`;

  const isAdmin = session.role === "admin";
  const accessTab = isAdmin
    ? `<button id="tab-access" class="tab" onclick="showTab('access')">Access</button>`
    : "";
  const accessPanel = isAdmin
    ? `<div id="panel-access" style="display:none">` +
      `<h2 style="color:#000;margin:0 0 4px">Access</h2>` +
      `<p style="opacity:.75;font-size:13px;margin:0 0 18px">Changes take effect the next time the person signs in.</p>` +
      `<div class="acc-sec"><h3>Admins — can edit everything</h3><div id="admins-list"></div>` +
      `<div class="acc-add" id="add-admin-row"><input id="admin-email" type="email" placeholder="email@example.com"/>` +
      `<button class="btn ghost" onclick="addAdmin()">Add admin</button></div></div>` +
      `<div class="acc-sec"><h3>Organizers — edit only their assigned colonies</h3><div id="orgs-list"></div>` +
      `<div class="acc-add"><input id="org-email" type="email" placeholder="email@example.com"/>` +
      `<button class="btn ghost" onclick="addOrganizer()">Add organizer</button></div></div>` +
      `<div class="actions"><button class="btn" onclick="saveAccess()">Save access</button><span id="access-status"></span></div></div>`
    : "";

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/>` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"/>` +
    `<title>Studio · Beyond the Cities</title>` +
    `<link rel="icon" type="image/svg+xml" href="https://beyondthecities.org/favicon.svg"/>` +
    `<link rel="stylesheet" href="https://beyondthecities.org/fonts.css"/>` +
    `<style>` +
    `*{box-sizing:border-box}body{margin:0;font-family:'Montserrat',system-ui,sans-serif;background:#f1f1ee;color:#1c1c1c}` +
    `.bar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 20px;` +
    `background:#fff;border-bottom:1px solid rgba(28,28,28,.15);flex-wrap:wrap}` +
    `.bar b{color:#000}.badge{background:#ff4326;color:#fff;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700}` +
    `.badge-soft{background:transparent;border:1px solid rgba(28,28,28,.25);color:#1c1c1c;border-radius:999px;padding:1px 9px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}` +
    `.bar-brand{display:flex;align-items:center;gap:10px}.bar-logo{height:30px;width:auto;display:block}` +
    `.bar-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:14px}` +
    `.bar-site{font-weight:700;opacity:.7}.bar-site:hover{opacity:1;color:#ff4326}` +
    `.studio-foot{border-top:1px solid rgba(28,28,28,.12);text-align:center;padding:30px 20px;font-size:13px;font-weight:600}` +
    `.studio-foot__meta{opacity:.6;font-weight:500;margin-top:4px}` +
    `.wrap{max-width:760px;margin:0 auto;padding:24px 20px 80px}` +
    `.load{display:flex;gap:8px;margin:8px 0 20px}` +
    `.picker{margin:8px 0 20px}` +
    `.picker-head{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#ff4326;margin-bottom:9px}` +
    `#picker-results{margin-top:10px;display:grid;gap:6px;max-height:320px;overflow:auto}` +
    `.picker-item{width:100%;text-align:left;border:1px solid rgba(28,28,28,.15);background:#fff;border-radius:10px;` +
    `padding:9px 12px;cursor:pointer;font:inherit;color:#1c1c1c;display:flex;flex-direction:column;gap:2px;align-items:flex-start}` +
    `.picker-item:hover{border-color:#ff4326}.picker-item.on{background:#ff4326;border-color:#ff4326;color:#fff}` +
    `.pi-name{font-weight:700}.pi-sub{font-size:11.5px;opacity:.65;text-transform:uppercase;letter-spacing:.03em}` +
    `.picker-item.on .pi-sub{opacity:.85}` +
    `input,select,textarea{font:inherit;padding:9px 12px;border:1px solid rgba(28,28,28,.3);border-radius:10px;background:#fff;color:#1c1c1c;width:100%}` +
    `textarea{resize:vertical;min-height:56px;line-height:1.5}` +
    `.tabs{display:flex;gap:6px;margin:6px 0 18px}` +
    `.tab{background:#fff;border:1.5px solid rgba(28,28,28,.25);color:#1c1c1c;border-radius:999px;padding:7px 16px;font:inherit;font-weight:700;font-size:13px;cursor:pointer;width:auto}` +
    `.tab.on{background:#1c1c1c;border-color:#1c1c1c;color:#fff}` +
    `.posts-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}` +
    `.post-row{display:flex;justify-content:space-between;align-items:center;gap:12px;background:#fff;border:1px solid rgba(28,28,28,.15);border-radius:12px;padding:12px 14px;margin-bottom:10px}` +
    `.post-row .meta{font-size:12px;opacity:.7;margin-top:2px}` +
    `#post-editor{background:#fff;border:1px solid rgba(28,28,28,.15);border-radius:16px;padding:20px;margin-top:14px}` +
    `.acc-sec{margin-bottom:22px}.acc-sec h3{color:#000;margin:0 0 10px;font-size:16px}` +
    `.acc-sec+.acc-sec{border-top:1px solid rgba(28,28,28,.14);padding-top:26px;margin-top:8px}` +
    `.acc-row{display:flex;justify-content:space-between;align-items:center;gap:12px;background:#fff;border:1px solid rgba(28,28,28,.15);border-radius:12px;padding:10px 14px;margin-bottom:8px}` +
    `.acc-org{flex-direction:column;align-items:stretch;gap:8px}` +
    `.acc-org-head{display:flex;justify-content:space-between;align-items:center}` +
    `.acc-add{display:flex;gap:8px;margin-top:10px}` +
    `.btn{background:#ff4326;color:#fff;border:0;border-radius:999px;padding:10px 20px;font-weight:700;cursor:pointer;white-space:nowrap}` +
    `.btn.ghost{background:#fff;border:1.5px solid rgba(28,28,28,.35);color:#1c1c1c}` +
    `#form{display:none;background:#fff;border:1px solid rgba(28,28,28,.15);border-radius:16px;padding:20px}` +
    `.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}` +
    `.fld{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600}` +
    `.fld.full{grid-column:1/-1}` +
    `.chips{display:flex;flex-wrap:wrap;gap:6px}` +
    `.chip{border:1.5px solid rgba(28,28,28,.3);background:#fff;color:#1c1c1c;border-radius:999px;` +
    `padding:5px 12px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;width:auto}` +
    `.chip.on{background:#ff4326;border-color:#ff4326;color:#fff}` +
    `.multiline{display:flex;flex-direction:column;gap:6px}` +
    `.ml-row{display:flex;gap:6px}.ml-row input{flex:1}` +
    `.ml-rm{width:auto;flex:0 0 auto;padding:0 13px}` +
    `.ml-add{width:auto;margin-top:6px;font-size:12px;padding:6px 12px}` +
    `.photo{display:flex;gap:14px;align-items:flex-start}` +
    `#photo-preview,#p-cover-preview{width:150px;height:100px;object-fit:cover;border-radius:10px;` +
    `background:#f7f7f5;border:1px solid rgba(28,28,28,.2);flex:0 0 auto}` +
    `.photo-ctl{display:flex;flex-direction:column;gap:8px}` +
    `input[type=file]{border:0;padding:0;font-size:12px}` +
    `.fld span{opacity:.8}.actions{margin-top:18px;display:flex;gap:10px;align-items:center}` +
    `#status{font-size:13px;font-weight:600;opacity:.85}a{color:#1c1c1c}` +
    `.EasyMDEContainer .CodeMirror{border-radius:10px;border:1px solid rgba(28,28,28,.3);color:#000}` +
    `.editor-toolbar{border-radius:10px 10px 0 0;border-color:rgba(28,28,28,.3)}` +
    `</style>` +
    `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/easymde@2.18.0/dist/easymde.min.css"/>` +
    `<script src="https://cdn.jsdelivr.net/npm/easymde@2.18.0/dist/easymde.min.js"></script>` +
    `</head><body data-role="${escapeHtml(session.role)}" data-raw="${escapeHtml(rawBase)}">` +
    `<div class="bar"><span class="bar-brand"><img class="bar-logo" src="https://beyondthecities.org/favicon.svg" alt=""/><span><b>Beyond the Cities</b> · Studio</span></span>` +
    `<span class="bar-right"><a class="bar-site" href="https://beyondthecities.org/">View site ↗</a><span class="badge">${escapeHtml(session.role)}</span> ${escapeHtml(session.email)} · <a href="/auth/logout">Log out</a></span></div>` +
    `<div class="wrap">` +
    `<div class="tabs"><button id="tab-colony" class="tab on" onclick="showTab('colony')">Colony details</button>` +
    `<button id="tab-posts" class="tab" onclick="showTab('posts')">Blog posts</button>` + accessTab + `</div>` +
    `<div id="panel-colony">` +
    `<div class="picker"><div class="picker-head">${session.role === "organizer" ? "Colonies you can edit" : "Select a colony"}</div>` +
    `<input id="picker-search" type="search" placeholder="Search colonies…" autocomplete="off"/>` +
    `<div id="picker-countries" class="chips" style="margin-top:8px"></div>` +
    `<div id="picker-results"><p style="opacity:.7;font-size:13px;padding:8px 2px">Loading colonies…</p></div></div>` +
    `<h2 id="title" style="color:#000"></h2>` +
    `<div id="form"><div class="grid">${form}</div>` +
    `<div class="actions"><button class="btn" onclick="save()">Save changes</button><span id="status"></span></div></div>` +
    `</div>` +
    `<div id="panel-posts" style="display:none">` +
    `<div class="posts-head"><div><h2 style="color:#000;margin:0">Blog posts</h2><span id="posts-status" style="font-size:12px;opacity:.85"></span></div><button class="btn" onclick="newPost()">+ New post</button></div>` +
    `<div id="posts-list"></div>` + postEditor +
    `</div>` + accessPanel +
    `</div>` +
    `<footer class="studio-foot"><p>Beyond the Cities — Artists' Residencies of the Western Balkans</p>` +
    `<p class="studio-foot__meta">A Goethe-Institut project · 2026–2028</p></footer>` +
    `<script>` + EDITOR_JS + `</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

// Client script — plain concatenation, no backticks/template literals.
const EDITOR_JS =
  "var FIELDS=['art_colony_name','city','place','country','latitude','longitude','scope','art_colony_organisers','contact_person','time_period','duration'];" +
  "var MULTI=['contact_telephone','email_address','web_page'];" +
  "function splitMulti(v){return String(v||'').split(/\\s*[&,;]\\s*|\\s+and\\s+/i).map(function(s){return s.trim()}).filter(Boolean)}" +
  "function addMulti(name,value){var box=q('ml-'+name);var row=document.createElement('div');row.className='ml-row';" +
  "var inp=document.createElement('input');inp.type='text';inp.value=value||'';" +
  "var rm=document.createElement('button');rm.type='button';rm.className='btn ghost ml-rm';rm.textContent='\\u00d7';" +
  "rm.onclick=function(){row.remove();if(!box.children.length)addMulti(name,'')};" +
  "row.appendChild(inp);row.appendChild(rm);box.appendChild(row)}" +
  "function renderMulti(name,values){var box=q('ml-'+name);box.innerHTML='';var vals=(values&&values.length)?values:[''];vals.forEach(function(v){addMulti(name,v)})}" +
  "function getMulti(name){return [].slice.call(q('ml-'+name).querySelectorAll('input')).map(function(i){return i.value.trim()}).filter(Boolean).join(', ')}" +
  "var currentId=null;var currentPhotos=[];var RAW=document.body.dataset.raw;" +
  "var editingSlug=null;var postCover='';var savedCover='';var taggable=[];var easyMDE=null;var postColonies=[];" +
  "function q(id){return document.getElementById(id)}" +
  "function setStatus(t){q('status').textContent=t}" +
  "function setPhotoStatus(t){q('photo-status').textContent=t}" +
  "var pickerColonies=[];var pickerTerm='';var pickerCountry='';" +
  "async function loadColonies(){" +
  "var r=await fetch('/api/colonies');if(!r.ok){setStatus('Could not load colony list');return}" +
  "var data=await r.json();pickerColonies=data.colonies||[];" +
  "q('picker-search').addEventListener('input',function(e){pickerTerm=e.target.value;renderPicker()});" +
  "renderCountryChips();renderPicker();" +
  "if(document.body.dataset.role!=='admin'&&pickerColonies.length===1){loadColony(pickerColonies[0].id)}}" +
  "function renderCountryChips(){var box=q('picker-countries');box.innerHTML='';" +
  "var cs=[];pickerColonies.forEach(function(c){if(cs.indexOf(c.country)===-1)cs.push(c.country)});" +
  "if(cs.length<2){box.style.display='none';return}box.style.display='flex';" +
  "function mk(label,val){var b=document.createElement('button');b.type='button';b.className='chip'+(pickerCountry===val?' on':'');b.textContent=label;b.onclick=function(){pickerCountry=val;renderCountryChips();renderPicker()};return b}" +
  "box.appendChild(mk('All',''));cs.sort().forEach(function(c){box.appendChild(mk(c,c))})}" +
  "function foldSearch(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/đ/g,'dj')}" +
  "function renderPicker(){var box=q('picker-results');box.innerHTML='';var term=foldSearch(pickerTerm.trim());" +
  "var list=pickerColonies.filter(function(c){if(pickerCountry&&c.country!==pickerCountry)return false;" +
  "if(term){var hay=foldSearch(c.name+' '+(c.place||''));if(hay.indexOf(term)===-1)return false}return true});" +
  "if(!list.length){var p=document.createElement('p');p.style.cssText='opacity:.7;font-size:13px;padding:6px 2px';p.textContent='No colonies match.';box.appendChild(p);return}" +
  "list.slice(0,60).forEach(function(c){var b=document.createElement('button');b.type='button';b.className='picker-item'+(String(c.id)===String(currentId)?' on':'');" +
  "var n=document.createElement('span');n.className='pi-name';n.textContent=c.name;" +
  "var sub=document.createElement('span');sub.className='pi-sub';sub.textContent=[(c.place||''),c.country].filter(Boolean).join(' · ');" +
  "b.appendChild(n);b.appendChild(sub);b.onclick=function(){loadColony(c.id)};box.appendChild(b)})}" +
  "async function loadColony(id){" +
  "setStatus('Loading…');q('title').textContent='';" +
  "var r=await fetch('/api/colony/'+id);" +
  "if(!r.ok){var e=await r.json();setStatus('Could not load: '+(e.error||r.status));q('form').style.display='none';return}" +
  "var data=await r.json();var c=data.colony;" +
  "FIELDS.forEach(function(f){var el=q('f-'+f);if(el)el.value=(c[f]==null?'':c[f])});" +
  "MULTI.forEach(function(f){renderMulti(f,splitMulti(c[f]))});" +
  "setArtField(c.art_field||'');" +
  "currentPhotos=Array.isArray(c.photos)?c.photos:[];setPhotoPreview();q('photo-file').value='';setPhotoStatus('');" +
  "currentId=id;q('title').textContent=c.art_colony_name||('Colony '+id);" +
  "renderPicker();q('form').style.display='block';setStatus('Loaded from '+data.file)}" +
  "function mainPhoto(){return currentPhotos.length?String(currentPhotos[0]):''}" +
  "function setPhotoPreview(){var p=mainPhoto();var src;" +
  "if(!p||p.indexOf('placehold.co')!==-1){src=RAW+'/assets/images/colony-placeholder.png'}" +
  "else if(/^https?:/.test(p)){src=p}else{src=RAW+p}q('photo-preview').src=src}" +
  // Resize (max 1600px) + convert to WebP in the browser before upload.
  "function optimizeImage(file){return new Promise(function(resolve){" +
  "if(!/^image\\/(jpeg|png|webp)$/.test(file.type)){resolve(file);return}" +
  "var url=URL.createObjectURL(file);var img=new Image();" +
  "img.onload=function(){URL.revokeObjectURL(url);var maxW=1600;var w=img.naturalWidth,h=img.naturalHeight;" +
  "if(w>maxW){h=Math.round(h*maxW/w);w=maxW}var cv=document.createElement('canvas');cv.width=w;cv.height=h;" +
  "cv.getContext('2d').drawImage(img,0,0,w,h);cv.toBlob(function(b){resolve(b&&b.size<file.size?b:file)},'image/webp',0.82)};" +
  "img.onerror=function(){URL.revokeObjectURL(url);resolve(file)};img.src=url})}" +
  "async function uploadPhoto(){if(!currentId)return;var f=q('photo-file').files[0];" +
  "if(!f){setPhotoStatus('Choose an image first');return}" +
  "q('photo-preview').src=URL.createObjectURL(f);setPhotoStatus('Optimising…');var blob=await optimizeImage(f);" +
  "setPhotoStatus('Uploading…');var fd=new FormData();fd.append('file',blob,'photo.webp');" +
  "var r=await fetch('/api/colony/'+currentId+'/photo',{method:'POST',body:fd});var out=await r.json();" +
  "if(!r.ok){setPhotoStatus('Upload failed: '+(out.detail||out.error));return}" +
  "currentPhotos=out.photos||[out.photo];q('photo-file').value='';" +
  "setPhotoStatus('Photo updated \\u2713 commit '+String(out.commit||'').slice(0,7)+' — live in ~1–2 min')}" +
  "async function removePhoto(){if(!currentId)return;setPhotoStatus('Removing…');" +
  "var r=await fetch('/api/colony/'+currentId+'/photo',{method:'DELETE'});var out=await r.json();" +
  "if(!r.ok){setPhotoStatus('Remove failed: '+(out.detail||out.error));return}" +
  "currentPhotos=out.photos||[];setPhotoPreview();q('photo-file').value='';" +
  "setPhotoStatus(out.unchanged?'No photo to remove':('Photo removed \\u2713 commit '+String(out.commit||'').slice(0,7)))}" +
  "function setArtField(v){" +
  "var chips=document.querySelectorAll('#art-chips .chip');chips.forEach(function(ch){ch.classList.remove('on')});" +
  "var other=[];String(v).split(',').map(function(s){return s.trim()}).filter(Boolean).forEach(function(t){" +
  "var m=null;chips.forEach(function(ch){if(ch.dataset.v.toLowerCase()===t.toLowerCase())m=ch});" +
  "if(m){m.classList.add('on')}else{other.push(t)}});" +
  "q('f-art_field_other').value=other.join(', ')}" +
  "function getArtField(){var out=[];" +
  "document.querySelectorAll('#art-chips .chip.on').forEach(function(ch){out.push(ch.dataset.v)});" +
  "var o=q('f-art_field_other').value.trim();if(o){o.split(',').forEach(function(s){s=s.trim();if(s)out.push(s)})}" +
  "return out.join(', ')}" +
  "document.addEventListener('click',function(e){var ch=e.target.closest('#art-chips .chip');if(ch)ch.classList.toggle('on')});" +
  "async function save(){if(!currentId)return;var body={};" +
  "FIELDS.forEach(function(f){body[f]=q('f-'+f).value});" +
  "MULTI.forEach(function(f){body[f]=getMulti(f)});" +
  "body.art_field=getArtField();" +
  "['latitude','longitude'].forEach(function(k){var v=String(body[k]).trim();if(v!==''&&!isNaN(Number(v))){body[k]=Number(v)}else{delete body[k]}});" +
  "setStatus('Saving…');" +
  "var r=await fetch('/api/colony/'+currentId,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});" +
  "var out=await r.json();" +
  "if(!r.ok){setStatus('Save failed: '+(out.detail||out.error));return}" +
  "if(out.unchanged){setStatus('No changes to save');return}" +
  "setStatus('Saved \\u2713  commit '+String(out.commit||'').slice(0,7)+' — live in ~1–2 min')}" +
  // --- tabs + blog posts ---
  "function showTab(name){['colony','posts','access'].forEach(function(n){" +
  "var p=q('panel-'+n);if(p)p.style.display=(n===name?'block':'none');" +
  "var t=q('tab-'+n);if(t)t.classList.toggle('on',n===name)});" +
  "if(name==='posts')loadPosts();if(name==='access')loadAccessPanel()}" +
  "function setPostStatus(t){q('p-status').textContent=t}" +
  "async function loadPosts(){var box=q('posts-list');box.innerHTML='<p style=\"opacity:.7\">Loading…</p>';" +
  "var r=await fetch('/api/posts');if(!r.ok){box.innerHTML='<p>Could not load posts</p>';return}" +
  "var data=await r.json();taggable=data.taggable||[];renderPosts(data.posts||[])}" +
  "function renderPosts(list){var box=q('posts-list');box.innerHTML='';" +
  "if(!list.length){box.innerHTML='<p style=\"opacity:.7\">No posts yet.</p>';return}" +
  "list.forEach(function(p){var row=document.createElement('div');row.className='post-row';" +
  "var left=document.createElement('div');var t=document.createElement('div');t.style.fontWeight='700';t.style.color='#000';t.textContent=p.title+(p.draft?'  (draft)':'');" +
  "var meta=document.createElement('div');meta.className='meta';meta.textContent=p.date+' · '+(p.colonies&&p.colonies.length?('colonies '+p.colonies.join(', ')):'general');" +
  "left.appendChild(t);left.appendChild(meta);" +
  "var btns=document.createElement('div');btns.style.display='flex';btns.style.gap='8px';" +
  "var ed=document.createElement('button');ed.className='btn ghost';ed.textContent='Edit';ed.onclick=function(){editPost(p.slug)};" +
  "var de=document.createElement('button');de.className='btn ghost';de.textContent='Delete';de.onclick=function(){deletePost(p.slug)};" +
  "btns.appendChild(ed);btns.appendChild(de);row.appendChild(left);row.appendChild(btns);box.appendChild(row)})}" +
  "function slugify(s){var map={'č':'c','ć':'c','ž':'z','š':'s','đ':'dj','Č':'c','Ć':'c','Ž':'z','Š':'s','Đ':'dj'};" +
  "s=String(s).replace(/[čćžšđČĆŽŠĐ]/g,function(m){return map[m]||m});" +
  "return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}" +
  "function setCoverPreview(p){var src;if(!p){src=RAW+'/assets/images/colony-placeholder.png'}else if(/^https?:/.test(p)){src=p}else{src=RAW+p}q('p-cover-preview').src=src}" +
  "function taggableName(id){var c=taggable.filter(function(x){return String(x.id)===String(id)})[0];return c?c.name:('#'+id)}" +
  "function renderPostColonies(){var box=q('p-colonies-chips');box.innerHTML='';" +
  "postColonies.forEach(function(id){var c=elx('span','chip on');c.textContent=taggableName(id)+'  \\u00d7';c.style.cursor='pointer';c.onclick=function(){removePostColony(id)};box.appendChild(c)});" +
  "var sel=q('p-colonies-add');sel.innerHTML='';var ph=document.createElement('option');ph.value='';ph.textContent='+ add colony…';sel.appendChild(ph);" +
  "taggable.forEach(function(c){if(postColonies.indexOf(String(c.id))===-1){var o=document.createElement('option');o.value=c.id;o.textContent=c.name;sel.appendChild(o)}});" +
  "sel.onchange=function(){if(sel.value)addPostColony(sel.value)}}" +
  "function addPostColony(id){if(postColonies.indexOf(String(id))===-1)postColonies.push(String(id));renderPostColonies()}" +
  "function removePostColony(id){postColonies=postColonies.filter(function(x){return x!==String(id)});renderPostColonies()}" +
  "function initEditor(){if(easyMDE)return;easyMDE=new EasyMDE({element:q('p-body'),spellChecker:false,status:false,maxHeight:'420px',autofocus:false,toolbar:['bold','italic','|','heading-2','heading-3','|','unordered-list','ordered-list','quote','|','link','image','|','preview','guide']})}" +
  "function getBody(){return easyMDE?easyMDE.value():q('p-body').value}" +
  "function newPost(){editingSlug=null;postCover='';savedCover='';q('pe-title').textContent='New post';" +
  "['p-title','p-author','p-excerpt','p-tags'].forEach(function(id){q(id).value=''});" +
  "q('p-date').value=new Date().toISOString().slice(0,10);q('p-draft').checked=false;" +
  "postColonies=(document.body.dataset.role!=='admin'?taggable.map(function(c){return String(c.id)}):[]);renderPostColonies();" +
  "setCoverPreview('');setPostStatus('');q('p-cover-file').value='';q('p-cover-status').textContent='';q('posts-status').textContent='';" +
  "q('pe-delete').style.display='none';q('post-editor').style.display='block';initEditor();easyMDE.value('');" +
  "q('post-editor').scrollIntoView({behavior:'smooth'});setTimeout(function(){easyMDE.codemirror.refresh()},50)}" +
  "async function editPost(slug){setPostStatus('');var r=await fetch('/api/post/'+slug);var out=await r.json();" +
  "if(!r.ok){alert('Could not open: '+(out.error||r.status));return}var p=out.post;editingSlug=slug;postCover=p.cover||'';savedCover=p.cover||'';" +
  "q('pe-title').textContent='Edit post';q('p-title').value=p.title;q('p-date').value=p.date;q('p-author').value=p.author;" +
  "q('p-excerpt').value=p.excerpt;q('p-tags').value=(p.tags||[]).join(', ');postColonies=(p.colonies||[]).map(String);renderPostColonies();" +
  "q('p-draft').checked=!!p.draft;setCoverPreview(postCover);q('p-cover-file').value='';q('p-cover-status').textContent='';" +
  "q('pe-delete').style.display='';q('post-editor').style.display='block';initEditor();easyMDE.value(p.body||'');" +
  "q('post-editor').scrollIntoView({behavior:'smooth'});setTimeout(function(){easyMDE.codemirror.refresh()},50)}" +
  "async function uploadCover(){var f=q('p-cover-file').files[0];if(!f){q('p-cover-status').textContent='Choose an image first';return}" +
  "q('p-cover-preview').src=URL.createObjectURL(f);q('p-cover-status').textContent='Optimising…';var blob=await optimizeImage(f);" +
  "q('p-cover-status').textContent='Uploading…';var fd=new FormData();fd.append('file',blob,'cover.webp');fd.append('title',q('p-title').value||'');" +
  "if(postCover&&postCover!==savedCover&&postCover.indexOf('/assets/images/blog/')===0)fd.append('replace',postCover);" +
  "var r=await fetch('/api/upload',{method:'POST',body:fd});var out=await r.json();" +
  "if(!r.ok){q('p-cover-status').textContent='Upload failed: '+(out.detail||out.error);return}" +
  "postCover=out.path;q('p-cover-status').textContent='Cover uploaded \\u2713'}" +
  "async function savePost(){var title=q('p-title').value.trim();if(!title){setPostStatus('Title is required');return}" +
  "var slug=editingSlug||slugify(title);if(!slug){setPostStatus('Could not build a slug from the title');return}" +
  "var body={title:title,date:q('p-date').value||'',author:q('p-author').value,excerpt:q('p-excerpt').value,cover:postCover,body:getBody(),draft:q('p-draft').checked," +
  "tags:q('p-tags').value.split(',').map(function(s){return s.trim()}).filter(Boolean)," +
  "colonies:postColonies.slice()};" +
  "setPostStatus('Saving…');var r=await fetch('/api/post/'+slug,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});" +
  "var out=await r.json();if(!r.ok){setPostStatus('Save failed: '+(out.detail||out.error));return}" +
  "q('post-editor').style.display='none';editingSlug=null;" +
  "q('posts-status').textContent='Saved \\u2713 commit '+String(out.commit||'').slice(0,7)+' — live in ~1–2 min';loadPosts()}" +
  "async function deletePost(slug){var s=slug||editingSlug;if(!s)return;if(!confirm('Delete this post?'))return;" +
  "var r=await fetch('/api/post/'+s,{method:'DELETE'});var out=await r.json();" +
  "if(!r.ok){alert('Delete failed: '+(out.detail||out.error));return}" +
  "if(editingSlug===s){cancelPost()}q('posts-status').textContent='Post deleted \\u2713';loadPosts()}" +
  "function cancelPost(){q('post-editor').style.display='none';editingSlug=null}" +
  // --- access (admin only) ---
  "var accessState={admins:[],organizers:{}};var allColonies=[];var accessOwners=[];var isOwner=false;" +
  "function elx(tag,cls){var e=document.createElement(tag);if(cls)e.className=cls;return e}" +
  "function btnx(txt){var b=elx('button','btn ghost');b.type='button';b.textContent=txt;return b}" +
  "function setAccessStatus(t){q('access-status').textContent=t}" +
  "function colonyName(id){var c=allColonies.filter(function(x){return String(x.id)===String(id)})[0];return c?c.name:('#'+id)}" +
  "async function loadAccessPanel(){setAccessStatus('');var r=await fetch('/api/access');if(!r.ok){setAccessStatus('Could not load');return}" +
  "var d=await r.json();accessState={admins:(d.access.admins||[]).slice(),organizers:JSON.parse(JSON.stringify(d.access.organizers||{}))};" +
  "allColonies=d.colonies||[];accessOwners=d.owners||[];isOwner=!!d.isOwner;renderAccess()}" +
  "function renderAccess(){renderAdmins();renderOrgs()}" +
  "function renderAdmins(){var box=q('admins-list');box.innerHTML='';" +
  "accessOwners.forEach(function(email){var row=elx('div','acc-row');var s=elx('span');s.style.fontWeight='600';s.textContent=email+' ';" +
  "var b=elx('span','badge');b.textContent='owner';b.style.marginLeft='6px';s.appendChild(b);row.appendChild(s);box.appendChild(row)});" +
  "accessState.admins.forEach(function(email){var row=elx('div','acc-row');var s=elx('span');s.style.fontWeight='600';s.textContent=email+' ';" +
  "var b=elx('span','badge-soft');b.textContent='admin';b.style.marginLeft='6px';s.appendChild(b);row.appendChild(s);" +
  "if(isOwner){var rm=btnx('Remove');rm.onclick=function(){removeAdmin(email)};row.appendChild(rm)}box.appendChild(row)});" +
  "var addRow=q('add-admin-row');if(addRow)addRow.style.display=isOwner?'flex':'none'}" +
  "function renderOrgs(){var box=q('orgs-list');box.innerHTML='';Object.keys(accessState.organizers).forEach(function(email){" +
  "var ids=accessState.organizers[email]||[];var row=elx('div','acc-row acc-org');" +
  "var head=elx('div','acc-org-head');var s=elx('span');s.style.fontWeight='600';s.textContent=email+' ';" +
  "var b=elx('span','badge-soft');b.textContent='organizer';b.style.marginLeft='6px';s.appendChild(b);" +
  "var rm=btnx('Remove');rm.onclick=function(){removeOrganizer(email)};head.appendChild(s);head.appendChild(rm);" +
  "var chips=elx('div','chips');ids.forEach(function(id){var c=elx('span','chip on');c.textContent=colonyName(id)+'  \\u00d7';c.style.cursor='pointer';c.onclick=function(){removeColonyFromOrg(email,id)};chips.appendChild(c)});" +
  "var sel=document.createElement('select');var ph=document.createElement('option');ph.value='';ph.textContent='+ add colony…';sel.appendChild(ph);" +
  "allColonies.forEach(function(c){if(ids.indexOf(String(c.id))===-1){var o=document.createElement('option');o.value=c.id;o.textContent=c.name;sel.appendChild(o)}});" +
  "sel.onchange=function(){if(sel.value)addColonyToOrg(email,sel.value)};" +
  "row.appendChild(head);row.appendChild(chips);row.appendChild(sel);box.appendChild(row)})}" +
  "function addAdmin(){var e=q('admin-email').value.trim();if(!e)return;if(accessState.admins.indexOf(e)===-1)accessState.admins.push(e);q('admin-email').value='';renderAccess()}" +
  "function removeAdmin(email){accessState.admins=accessState.admins.filter(function(x){return x!==email});renderAccess()}" +
  "function addOrganizer(){var e=q('org-email').value.trim();if(!e)return;if(!accessState.organizers[e])accessState.organizers[e]=[];q('org-email').value='';renderAccess()}" +
  "function removeOrganizer(email){delete accessState.organizers[email];renderAccess()}" +
  "function addColonyToOrg(email,id){var a=accessState.organizers[email]||[];if(a.indexOf(String(id))===-1)a.push(String(id));accessState.organizers[email]=a;renderAccess()}" +
  "function removeColonyFromOrg(email,id){accessState.organizers[email]=(accessState.organizers[email]||[]).filter(function(x){return x!==String(id)});renderAccess()}" +
  "async function saveAccess(){setAccessStatus('Saving…');var r=await fetch('/api/access',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(accessState)});" +
  "var out=await r.json();if(!r.ok){setAccessStatus('Save failed: '+(out.detail||out.error));return}setAccessStatus('Saved \\u2713')}" +
  "loadColonies();";

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
<link rel="icon" type="image/svg+xml" href="https://beyondthecities.org/favicon.svg"/>
<link rel="stylesheet" href="https://beyondthecities.org/fonts.css"/>
<style>
  body{font-family:'Montserrat',system-ui,sans-serif;background:#f1f1ee;color:#1c1c1c;margin:0;
       min-height:100vh;display:grid;place-items:center;padding:24px}
  .brand{display:flex;align-items:center;gap:11px;margin-bottom:18px;font-weight:700;letter-spacing:.02em}
  .brand img{height:40px;width:auto}
  .brand b{color:#000}
  .card{background:#fff;border:1px solid rgba(28,28,28,.15);border-radius:18px;
        padding:32px 36px;max-width:440px;box-shadow:0 14px 40px rgba(28,28,28,.12)}
  h1{font-size:20px;margin:0 0 12px;color:#000}
  p{line-height:1.6;margin:0 0 12px}
  a{color:#1c1c1c}
  .btn{display:inline-block;background:#ff4326;color:#fff;text-decoration:none;
       padding:11px 20px;border-radius:999px;font-weight:700;margin-top:6px}
  .back-site{display:inline-block;margin-top:16px;font-size:13px;font-weight:600;opacity:.6;text-decoration:underline;text-underline-offset:2px}
  .back-site:hover{opacity:1}
</style></head><body><div><div class="brand"><img src="https://beyondthecities.org/favicon.svg" alt=""/><span><b>Beyond the Cities</b> · Studio</span></div><div class="card"><h1>${escapeHtml(title)}</h1>${inner}</div><div style="text-align:center"><a class="back-site" href="https://beyondthecities.org/">← Back to site</a></div></div></body></html>`;
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
  return bytesToBase64(new TextEncoder().encode(str));
}
function bytesToBase64(bytes) {
  let bin = "";
  const CHUNK = 0x8000; // avoid arg-count limits on large images
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
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
