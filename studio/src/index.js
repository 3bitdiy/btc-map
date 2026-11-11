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
  "email_address", "web_page", "time_period", "duration",
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
// as /assets/images/colonies/<file>. photos[0] is the main photo (map, cards);
// the rest form the gallery. Blog posts get the same gallery via front-matter.
const PHOTO_DIR = "public/assets/images/colonies";
const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_COLONY_PHOTOS = 7; // main + 6 more
const MAX_POST_GALLERY = 12;
const IMAGE_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Site logo mark (copied from index.html's #btc-logo symbol).
const LOGO_SVG = `<svg class="bar-mark" viewBox="0 0 70 115" aria-hidden="true">${'<symbol id="btc-logo" viewBox="0 0 70 115" fill="none"> <path d="M24.7312 23.7012L46.4029 1.78394L58.641 14.2717C64.5051 20.1333 67.8196 28.0337 67.8196 36.189V113.409L24.7312 113.664V23.7012Z" fill="#fff"/> <path d="M46.4029 3.56793L57.8761 15.2911C63.4853 20.8979 66.5448 28.5435 66.5448 36.4439V112.135L26.006 112.39V24.211L46.4029 3.56793ZM46.4029 0L23.4564 23.1916V114.938L69.0944 114.684V36.4439C69.0944 27.7789 65.7799 19.6236 59.6608 13.5072L46.4029 0Z" fill="#1c1c1c"/> <path d="M0.254921 114.429V22.937L23.7113 0.255127H45.8929L23.2014 22.937V114.684L0.254921 114.429Z" fill="#1c1c1c"/> <path d="M45.1281 0.764557L22.9465 22.6819V22.9367V23.1916V114.429L0.764883 114.174V23.1916L23.7114 0.764557H45.1281ZM46.6579 0H23.4564L0 22.9367V114.684L23.4564 114.938V23.1916L46.6579 0Z" fill="#1c1c1c"/> <path d="M46.148 113.664V77.3802C46.148 72.8448 49.9724 69.0652 54.5617 69.0652H68.5846V113.664H46.148Z" fill="#fff"/> <path d="M67.3321 69.3087V112.917H46.3693V77.2827C46.3693 73.0465 49.7818 69.5579 53.9256 69.5579H67.3321M67.8196 68.8103H53.9256C49.2943 68.8103 45.638 72.5481 45.638 77.2827V113.664H67.8196V68.8103Z" fill="#1c1c1c"/> <path d="M67.3321 69.3087V112.917H46.3693V77.2827C46.3693 73.0465 49.7818 69.5579 53.9256 69.5579H67.3321M67.8196 68.8103H53.9256C49.2943 68.8103 45.638 72.5481 45.638 77.2827V113.664H67.8196V68.8103Z" stroke="#1c1c1c"/> <path d="M54.5617 106.019V69.5747H68.5845V113.919L54.5617 106.019Z" fill="#1c1c1c"/> <path d="M68.0746 70.0843V113.154L55.0716 105.764L54.8166 70.0843H68.0746ZM68.8395 69.0649H53.7968L54.0517 106.019L68.8395 114.684V69.0649Z" fill="#1c1c1c"/> <path d="M67.8196 56.0675H29.0137C28.7742 56.0675 28.7742 55.8127 28.7742 55.8127V24.7207H29.2532V55.5578H67.8196V56.0675Z" fill="#1c1c1c" stroke="#1c1c1c"/> <path d="M26.5159 24.7208L66.6114 54.4005L35.1846 17.0752L26.5159 24.7208Z" fill="#fff"/> <path d="M46.6579 35.9342C51.4454 35.9342 55.3265 32.0548 55.3265 27.2692C55.3265 22.4837 51.4454 18.6042 46.6579 18.6042C41.8703 18.6042 37.9892 22.4837 37.9892 27.2692C37.9892 32.0548 41.8703 35.9342 46.6579 35.9342Z" fill="#1c1c1c"/> <path d="M46.6579 18.8591C51.2472 18.8591 55.0716 22.6819 55.0716 27.2692C55.0716 31.8566 51.2472 35.6794 46.6579 35.6794C42.0686 35.6794 38.2442 31.8566 38.2442 27.2692C38.2442 22.6819 41.8136 18.8591 46.6579 18.8591ZM46.6579 18.6042C41.8136 18.6042 37.7342 22.427 37.7342 27.5241C37.7342 32.3663 41.5587 36.4439 46.6579 36.4439C51.5021 36.4439 55.5815 32.6211 55.5815 27.5241C55.3266 22.427 51.5021 18.6042 46.6579 18.6042Z" fill="#1c1c1c"/> </symbol>'.replace(/<\/?symbol[^>]*>/g, "")}</svg>`;

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
          return json({ error: "rate_limited", detail: "Too many changes. Wait a minute." }, 429);
        }
      }

      if (pathname === "/health") return health(env);
      // Post bodies reference site-relative images (/assets/images/…). In the
      // studio editor, send them to the repo copy so fresh uploads show at once.
      if (request.method === "GET" && /^\/assets\/images\/[A-Za-z0-9._\/-]+$/.test(pathname) && !pathname.includes("..")) {
        return Response.redirect(`https://raw.githubusercontent.com/${env.GITHUB_REPO}/${env.GITHUB_BRANCH}/public${pathname}`, 302);
      }
      if (pathname === "/auth/google") return authStart(request, env, origin);
      if (pathname === "/auth/callback") return authCallback(request, env, origin);
      if (pathname === "/auth/logout") return authLogout(origin);
      if (pathname === "/api/me") return apiMe(request, env);
      if (pathname === "/api/network/me") {
        if (request.method === "GET") return apiNetworkMe(request, env);
        if (request.method === "PUT") return apiNetworkMePut(request, env);
        return json({ error: "method_not_allowed" }, 405);
      }
      if (pathname === "/api/network/directory") return apiNetworkDirectory(request, env);
      if (pathname === "/api/network/community" && request.method === "PUT") return apiNetworkCommunityPut(request, env);
      if (pathname === "/api/network/notices") {
        if (request.method === "GET") return apiNoticesList(request, env);
        if (request.method === "POST") return apiNoticeCreate(request, env);
        return json({ error: "method_not_allowed" }, 405);
      }
      const noticeMatch = pathname.match(/^\/api\/network\/notice\/(\d+)$/);
      if (noticeMatch) {
        if (request.method === "PUT") return apiNoticeUpdate(request, env, noticeMatch[1]);
        if (request.method === "DELETE") return apiNoticeDelete(request, env, noticeMatch[1]);
        return json({ error: "method_not_allowed" }, 405);
      }
      if (pathname === "/api/colonies") return apiColonies(request, env);

      const photoMatch = pathname.match(/^\/api\/colony\/(\d+)\/photos?$/);
      if (photoMatch) {
        if (request.method === "POST") return apiColonyPhotoPost(request, env, photoMatch[1]);
        if (request.method === "PUT") return apiColonyPhotosPut(request, env, photoMatch[1]);
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
  // Network: remember who signed in (display name for the directory).
  await touchProfile(env, claims.email, claims.name);

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
  if (res.status === 409) return json({ error: "conflict", detail: "This file changed since you loaded it. Reload and retry." }, 409);
  if (!res.ok) return json({ error: "commit_failed", detail: res.detail }, 502);
  return json({ ok: true, commit: res.commit, colony });
}

// Add one photo to the colony (appended; becomes main if it's the first one).
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
  const existing = realPhotos(colony.photos);
  if (existing.length >= MAX_COLONY_PHOTOS) {
    return json({ error: "too_many", detail: `Max ${MAX_COLONY_PHOTOS} photos. Remove one first.` }, 409);
  }

  // SEO/readable filename: colony-name slug + a short unique suffix.
  const slug = slugify(colony.art_colony_name) || `colony-${id}`;
  const name = `${slug}-${Date.now()}.${ext}`;
  const imgPath = `${PHOTO_DIR}/${name}`;
  const publicPath = `/assets/images/colonies/${name}`;

  const imgRes = await ghCommitFile(env, imgPath, bytesToBase64(bytes), null, `photo: ${colony.art_colony_name || "colony " + id} (studio, ${session.email})`);
  if (!imgRes.ok) return json({ error: "image_commit_failed", detail: imgRes.detail }, 502);

  colony.photos = [...existing, publicPath];
  found.list[found.index] = colony;

  const jsonRes = await ghPutFile(
    env, found.path, JSON.stringify(found.data, null, 2) + "\n", found.sha,
    `edit: ${colony.art_colony_name || "colony " + id} add photo (studio, ${session.email})`,
  );
  if (!jsonRes.ok) {
    await deleteRepoImage(env, publicPath, session.email); // don't leave an orphan
    return json({ error: "commit_failed", detail: jsonRes.detail }, 502);
  }
  return json({ ok: true, photo: publicPath, photos: colony.photos, commit: jsonRes.commit });
}

// Real (non-placeholder) photo paths.
function realPhotos(list) {
  return (Array.isArray(list) ? list : [])
    .map((p) => String(p || "").trim())
    .filter((p) => p && !p.includes("placehold.co"));
}

// Reorder / choose the main photo / remove photos. Body: { photos: [...] } —
// must be a subset of the current photos (no new paths can be injected here).
// Photos left out are deleted from the repo.
async function apiColonyPhotosPut(request, env, id) {
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
  const colony = found.list[found.index];
  const existing = realPhotos(colony.photos);

  const next = [...new Set(realPhotos(body.photos))];
  if (next.some((p) => !existing.includes(p))) {
    return json({ error: "unknown_photo", detail: "Photos changed since you loaded them. Reload and retry." }, 409);
  }
  if (next.join("\n") === existing.join("\n") && existing.length === (colony.photos || []).length) {
    return json({ ok: true, photos: existing, unchanged: true });
  }
  colony.photos = next;
  found.list[found.index] = colony;

  const removed = existing.filter((p) => !next.includes(p));
  const what = removed.length
    ? `remove ${removed.length} photo${removed.length > 1 ? "s" : ""}`
    : "reorder photos";
  const res = await ghPutFile(
    env, found.path, JSON.stringify(found.data, null, 2) + "\n", found.sha,
    `edit: ${colony.art_colony_name || "colony " + id} ${what} (studio, ${session.email})`,
  );
  if (res.status === 409) return json({ error: "conflict", detail: "This file changed since you loaded it. Reload and retry." }, 409);
  if (!res.ok) return json({ error: "commit_failed", detail: res.detail }, 502);
  for (const p of removed) await deleteRepoImage(env, p, session.email);
  return json({ ok: true, photos: next, commit: res.commit });
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
      gallery: realPhotos(data.gallery),
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
    gallery: realPhotos(body.gallery)
      .filter((g) => g.startsWith("/assets/images/"))
      .slice(0, MAX_POST_GALLERY),
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
    const old = parseFrontMatter(existing.text);
    const keep = bodyImages(body.body);
    if (body.cover) keep.add(body.cover);
    for (const g of realPhotos(body.gallery)) keep.add(g);
    // Cover, inline and gallery images dropped since the last save.
    const before = new Set([old.data.cover, ...bodyImages(old.body), ...realPhotos(old.data.gallery)]);
    for (const img of before) {
      if (img && !keep.has(img)) await deleteRepoImage(env, img, session.email);
    }
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

  const parsed = parseFrontMatter(file.text);
  const cover = parsed.data.cover;
  const res = await ghDeleteFile(env, `${BLOG_DIR}/${slug}.md`, file.sha, `delete post: ${slug} (studio, ${session.email})`);
  if (!res.ok) return json({ error: "delete_failed", detail: res.detail }, 502);
  const imgs = new Set([cover, ...bodyImages(parsed.body), ...realPhotos(parsed.data.gallery)]);
  for (const img of imgs) {
    if (img) await deleteRepoImage(env, img, session.email);
  }
  return json({ ok: true, commit: res.commit });
}

// Generic image upload (blog covers). Commits to public/assets/images/blog/.
async function apiUpload(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);

  let file, title, replace, kind;
  try {
    const form = await request.formData();
    file = form.get("file");
    title = form.get("title");
    kind = form.get("kind"); // "inline" = in the post body, "gallery" = post gallery
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
  const rnd = Math.random().toString(36).slice(2, 6);
  const role = kind === "inline" ? `img-${rnd}` : kind === "gallery" ? `gallery-${rnd}` : "cover";
  const name = `${slug ? slug + "-" : ""}${role}-${Date.now()}.${ext}`;
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
  return json({ access, colonies: await listAllColonies(env), owners, isOwner: !!session.owner, community: await loadCommunity(env) });
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

// --- network: organizer directory / notices (D1) -----------------------------
// Profiles, notices and the newsletter log live in the NETWORK D1 database
// (studio/schema.sql) — never in the public repo. The KV allowlist still
// decides who may sign in; D1 only stores what people choose to share.
function nowIso() {
  return new Date().toISOString();
}

function profileKey(email) {
  return String(email || "").trim().toLowerCase();
}

// Create or refresh the signed-in person's profile row. Best-effort: a D1
// hiccup must never block sign-in.
async function touchProfile(env, email, googleName) {
  if (!env.NETWORK) return;
  const now = nowIso();
  try {
    await env.NETWORK.prepare(
      "INSERT INTO profiles (email, google_name, created_at, updated_at, last_login, unsub_token) " +
        "VALUES (?1, ?2, ?3, ?3, ?3, ?4) " +
        "ON CONFLICT(email) DO UPDATE SET google_name = ?2, last_login = ?3",
    )
      .bind(profileKey(email), String(googleName || "").slice(0, 120), now, randomToken())
      .run();
  } catch (err) {
    console.error("profile upsert failed:", err && err.message || err);
  }
}

// What the client sees of a profile row (no tokens).
function profileView(row) {
  return {
    email: row.email,
    name: row.name || row.google_name || "",
    google_name: row.google_name || "",
    phone: row.phone || "",
    about: row.about || "",
    languages: row.languages || "",
    show_email: !!row.show_email,
    visible: !!row.visible,
    newsletter: !!row.newsletter,
    updated_at: row.updated_at,
    last_login: row.last_login,
  };
}

async function apiNetworkMe(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  if (!env.NETWORK) return json({ error: "network_unavailable", detail: "The network database is not configured." }, 503);
  const key = profileKey(session.email);
  const q = env.NETWORK.prepare("SELECT * FROM profiles WHERE email = ?1").bind(key);
  let row = await q.first();
  if (!row) {
    // Accounts that signed in before the network existed get a row on demand.
    await touchProfile(env, key, session.name);
    row = await q.first();
  }
  if (!row) return json({ error: "server_error", detail: "Could not load your profile." }, 500);
  return json({ profile: profileView(row), role: session.role });
}

// Field limits for the self-edited profile.
const PROFILE_LIMITS = { name: 80, phone: 40, about: 600, languages: 80 };

// A profile counts as "filled in" once the person has saved it at least once.
function profileFilled(row) {
  return !!row && row.updated_at !== row.created_at;
}

async function apiNetworkMePut(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  if (!env.NETWORK) return json({ error: "network_unavailable" }, 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const key = profileKey(session.email);
  const str = (k) => String(body[k] == null ? "" : body[k]).trim().slice(0, PROFILE_LIMITS[k]);
  const name = str("name");
  const phone = str("phone").replace(/[^\d+\s().\/-]/g, "").trim();
  const about = str("about");
  const languages = str("languages").split(",").map((x) => x.trim()).filter(Boolean).join(", ");
  const flag = (k, dflt) => (body[k] == null ? dflt : body[k] ? 1 : 0);
  // Make sure the row exists (accounts from before the network).
  await touchProfile(env, key, session.name);
  await env.NETWORK.prepare(
    "UPDATE profiles SET name = ?2, phone = ?3, about = ?4, languages = ?5, show_email = ?6, visible = ?7, newsletter = ?8, updated_at = ?9 WHERE email = ?1",
  )
    .bind(key, name, phone, about, languages, flag("show_email", 1), flag("visible", 1), flag("newsletter", 1), nowIso())
    .run();
  const row = await env.NETWORK.prepare("SELECT * FROM profiles WHERE email = ?1").bind(key).first();
  return json({ ok: true, profile: profileView(row) });
}

// Link to the organizers' group chat (Viber/WhatsApp), set by admins in the
// Access tab. Stored in KV so it can change without a redeploy.
async function loadCommunity(env) {
  try {
    const raw = await env.ACCESS.get("community");
    const c = raw ? JSON.parse(raw) : {};
    return { url: String(c.url || ""), label: String(c.label || "") };
  } catch {
    return { url: "", label: "" };
  }
}

async function apiNetworkCommunityPut(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  if (session.role !== "admin") return json({ error: "forbidden" }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const url = String(body.url || "").trim().slice(0, 300);
  if (url && !/^https:\/\//i.test(url)) return json({ error: "bad_url", detail: "The link must start with https://" }, 400);
  const label = String(body.label || "").trim().slice(0, 60);
  await env.ACCESS.put("community", JSON.stringify({ url, label }));
  return json({ ok: true, community: { url, label } });
}

// Everyone with a studio account, joined with their profile, for the directory.
// Organizers only see what people chose to share; admins also see who has not
// filled in a profile or never signed in.
async function apiNetworkDirectory(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  if (!env.NETWORK) return json({ error: "network_unavailable" }, 503);
  const isAdmin = session.role === "admin";
  const me = profileKey(session.email);

  const [access, colonies, community] = await Promise.all([loadAccess(env), listAllColonies(env), loadCommunity(env)]);
  const byId = new Map(colonies.map((c) => [c.id, c]));
  const owners = ownerEmails(env);

  // email (lower-cased) → { role, colonyIds }
  const accounts = new Map();
  for (const e of owners) accounts.set(profileKey(e), { role: "admin", owner: true, ids: [] });
  for (const e of access.admins || []) if (!accounts.has(profileKey(e))) accounts.set(profileKey(e), { role: "admin", owner: false, ids: [] });
  for (const e of Object.keys(access.organizers || {})) {
    const k = profileKey(e);
    const ids = (access.organizers[e] || []).map(String);
    if (accounts.has(k)) accounts.get(k).ids.push(...ids);
    else accounts.set(k, { role: "organizer", owner: false, ids });
  }

  const keys = [...accounts.keys()];
  const rows = new Map();
  if (keys.length) {
    const ph = keys.map((_, i) => "?" + (i + 1)).join(",");
    const res = await env.NETWORK.prepare("SELECT * FROM profiles WHERE email IN (" + ph + ")").bind(...keys).all();
    for (const r of res.results || []) rows.set(r.email, r);
  }

  const people = [];
  for (const [email, acc] of accounts) {
    const row = rows.get(email);
    const cols = [...new Set(acc.ids)].map((id) => byId.get(id)).filter(Boolean);
    const countries = [...new Set(cols.map((c) => c.country).filter(Boolean))];
    const visible = row ? !!row.visible : true;
    const filled = profileFilled(row);
    if (!isAdmin && email !== me && !visible) continue;
    const showEmail = isAdmin || email === me || !row || !!row.show_email;
    people.push({
      email: showEmail ? email : "",
      name: (row && (row.name || row.google_name)) || "",
      role: acc.role,
      owner: acc.owner,
      colonies: cols.map((c) => ({ id: c.id, name: c.name, city: c.city, country: c.country })),
      countries,
      phone: row ? row.phone || "" : "",
      about: row ? row.about || "" : "",
      languages: row ? row.languages || "" : "",
      me: email === me,
      // admin-only hints
      visible: isAdmin ? visible : undefined,
      filled: isAdmin ? filled : undefined,
      signed_in: isAdmin ? !!row : undefined,
      last_login: isAdmin && row ? row.last_login : undefined,
    });
  }
  people.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  return json({ people, community, isAdmin });
}

// --- network: notice board ---------------------------------------------------
// Open calls, partner searches, offers and questions between organizers. A
// notice is visible to every signed-in organizer until its deadline passes
// (or 90 days after posting when there is none); the author can edit, close
// or delete it, admins can close or delete any. Replies go straight to the
// author (email / WhatsApp / Viber) — there are no comments.
const NOTICE_TYPES = ["open_call", "partners", "offering", "question", "other"];
const NOTICE_LIMITS = { title: 120, body: 2000 };
const NOTICE_DEFAULT_DAYS = 90;
const MAX_OPEN_NOTICES = 20;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// When a notice drops off the board: end of the deadline day, else N days on.
function noticeExpiry(deadline, fromIso) {
  if (deadline) return deadline + "T23:59:59.999Z";
  const d = new Date(fromIso);
  d.setUTCDate(d.getUTCDate() + NOTICE_DEFAULT_DAYS);
  return d.toISOString();
}

// Validate + normalise the fields a client sends for a notice.
function readNotice(body, session) {
  const type = String(body.type || "").trim();
  if (!NOTICE_TYPES.includes(type)) return { error: "bad_type", detail: "Pick a notice type." };
  const title = String(body.title || "").trim().slice(0, NOTICE_LIMITS.title);
  if (!title) return { error: "missing_title", detail: "A title is required." };
  const text = String(body.body || "").trim().slice(0, NOTICE_LIMITS.body);
  const deadline = String(body.deadline || "").trim();
  if (deadline) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(Date.parse(deadline))) {
      return { error: "bad_deadline", detail: "The deadline must be a date." };
    }
    if (deadline < todayIso()) return { error: "past_deadline", detail: "The deadline is in the past." };
  }
  const colonyId = String(body.colony_id || "").trim();
  if (colonyId && session.role !== "admin" && !(session.colonies || []).map(String).includes(colonyId)) {
    return { error: "forbidden_colony", detail: "You can only post for your own colony." };
  }
  return { data: { type, title, body: text, deadline: deadline || null, colony_id: colonyId, is_public: body.is_public ? 1 : 0 } };
}

function noticeView(r, author, colony, me, isAdmin, now) {
  const mine = r.author_email === me;
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    deadline: r.deadline,
    colony_id: r.colony_id,
    colony: colony ? { id: colony.id, name: colony.name, city: colony.city, country: colony.country } : null,
    // The author posted to get replies, so their email is always shown here
    // (the directory's "show my email" switch does not apply to notices).
    author: {
      email: r.author_email,
      name: (author && (author.name || author.google_name)) || "",
      phone: author ? author.phone || "" : "",
    },
    status: r.status,
    expired: r.expires_at <= now,
    created_at: r.created_at,
    updated_at: r.updated_at,
    expires_at: r.expires_at,
    mine,
    can_edit: mine,
    can_close: mine || isAdmin,
    can_delete: mine || isAdmin,
  };
}

// Open notices for everyone, plus the caller's own closed/expired ones (so
// they can repost or delete them).
async function apiNoticesList(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  if (!env.NETWORK) return json({ error: "network_unavailable" }, 503);
  const me = profileKey(session.email);
  const isAdmin = session.role === "admin";
  const now = nowIso();
  const [open, mine, colonies] = await Promise.all([
    env.NETWORK.prepare("SELECT * FROM notices WHERE status = 'open' AND expires_at > ?1 ORDER BY created_at DESC").bind(now).all(),
    env.NETWORK.prepare(
      "SELECT * FROM notices WHERE author_email = ?1 AND (status != 'open' OR expires_at <= ?2) ORDER BY updated_at DESC LIMIT 30",
    ).bind(me, now).all(),
    listAllColonies(env),
  ]);
  const openRows = open.results || [];
  const mineRows = mine.results || [];
  const emails = [...new Set([...openRows, ...mineRows].map((r) => r.author_email))];
  const authors = new Map();
  if (emails.length) {
    const ph = emails.map((_, i) => "?" + (i + 1)).join(",");
    const res = await env.NETWORK.prepare("SELECT email, name, google_name, phone FROM profiles WHERE email IN (" + ph + ")").bind(...emails).all();
    for (const r of res.results || []) authors.set(r.email, r);
  }
  const byId = new Map(colonies.map((c) => [c.id, c]));
  const view = (r) => noticeView(r, authors.get(r.author_email), byId.get(r.colony_id), me, isAdmin, now);
  return json({ notices: openRows.map(view), mine: mineRows.map(view), isAdmin });
}

async function apiNoticeCreate(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  if (!env.NETWORK) return json({ error: "network_unavailable" }, 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = readNotice(body, session);
  if (parsed.error) return json(parsed, 400);
  const d = parsed.data;
  const me = profileKey(session.email);
  const now = nowIso();
  const cnt = await env.NETWORK.prepare(
    "SELECT COUNT(*) AS n FROM notices WHERE author_email = ?1 AND status = 'open' AND expires_at > ?2",
  ).bind(me, now).first();
  if (cnt && cnt.n >= MAX_OPEN_NOTICES) {
    return json({ error: "too_many", detail: `You already have ${MAX_OPEN_NOTICES} open notices. Close some first.` }, 400);
  }
  await touchProfile(env, me, session.name);
  const res = await env.NETWORK.prepare(
    "INSERT INTO notices (type, title, body, deadline, colony_id, author_email, is_public, status, created_at, updated_at, expires_at) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open', ?8, ?8, ?9)",
  )
    .bind(d.type, d.title, d.body, d.deadline, d.colony_id, me, d.is_public, now, noticeExpiry(d.deadline, now))
    .run();
  return json({ ok: true, id: res.meta && res.meta.last_row_id }, 201);
}

// Two shapes: `{status:'open'|'closed'}` alone closes/reopens (author or
// admin); a full notice body edits it (author only) and reposts it.
async function apiNoticeUpdate(request, env, id) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  if (!env.NETWORK) return json({ error: "network_unavailable" }, 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const row = await env.NETWORK.prepare("SELECT * FROM notices WHERE id = ?1").bind(Number(id)).first();
  if (!row) return json({ error: "not_found" }, 404);
  const me = profileKey(session.email);
  const mine = row.author_email === me;
  const isAdmin = session.role === "admin";
  const now = nowIso();

  if (body.status !== undefined && body.title === undefined) {
    if (!mine && !isAdmin) return json({ error: "forbidden" }, 403);
    const status = body.status === "closed" ? "closed" : "open";
    if (status === "open" && row.expires_at <= now) {
      return json({ error: "expired", detail: "This notice has expired. Edit it with a new deadline to repost it." }, 400);
    }
    await env.NETWORK.prepare("UPDATE notices SET status = ?2, updated_at = ?3 WHERE id = ?1").bind(row.id, status, now).run();
    return json({ ok: true, status });
  }

  if (!mine) return json({ error: "forbidden", detail: "Only the author can edit a notice." }, 403);
  const parsed = readNotice(body, session);
  if (parsed.error) return json(parsed, 400);
  const d = parsed.data;
  await env.NETWORK.prepare(
    "UPDATE notices SET type = ?2, title = ?3, body = ?4, deadline = ?5, colony_id = ?6, is_public = ?7, status = 'open', updated_at = ?8, expires_at = ?9 WHERE id = ?1",
  )
    .bind(row.id, d.type, d.title, d.body, d.deadline, d.colony_id, d.is_public, now, noticeExpiry(d.deadline, now))
    .run();
  return json({ ok: true });
}

async function apiNoticeDelete(request, env, id) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  if (!env.NETWORK) return json({ error: "network_unavailable" }, 503);
  const row = await env.NETWORK.prepare("SELECT id, author_email FROM notices WHERE id = ?1").bind(Number(id)).first();
  if (!row) return json({ error: "not_found" }, 404);
  if (row.author_email !== profileKey(session.email) && session.role !== "admin") return json({ error: "forbidden" }, 403);
  await env.NETWORK.prepare("DELETE FROM notices WHERE id = ?1").bind(row.id).run();
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
  if (p.gallery && p.gallery.length) {
    fm.push("gallery:", ...p.gallery.map((g) => `  - ${g}`));
  }
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
    for (const c of list) out.push({ id: String(c.id), name: c.art_colony_name, country: c.country || "", city: c.city || "" });
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
// Blog-folder images referenced in a markdown body (inline uploads).
function bodyImages(md) {
  return new Set(String(md || "").match(/\/assets\/images\/blog\/[A-Za-z0-9._-]+/g) || []);
}

async function deleteRepoImage(env, publicPath, email) {
  if (typeof publicPath !== "string") return;
  if (
    !publicPath.startsWith("/assets/images/colonies/") &&
    !publicPath.startsWith("/assets/images/blog/")
  ) {
    return;
  }
  // Demo/placeholder images are shared between colonies — never delete them.
  if (/\/demo-[^/]*$/.test(publicPath)) return;
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
      "Sign in to Studio",
      `<p class="lead">Manage your colony's page, photos and news on Beyond the Cities.</p>
       <a class="btn-google" href="/auth/google"><span class="g">${GOOGLE_G}</span>Continue with Google</a>
       <p class="note">Access is for invited colony organisers. Need an account? Contact the Beyond the Cities team.</p>`,
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
    `<div class="fld full"><span>Photos <b id="photo-count" class="pcount"></b></span>` +
    `<div id="photo-grid" class="pgrid"></div>` +
    `<div class="photo-add"><label class="btn ghost file-btn">+ Add photos` +
    `<input type="file" id="photo-file" multiple accept="image/png,image/jpeg,image/webp" onchange="addPhotos(this.files)"/></label>` +
    `<span id="photo-status" class="pstatus"></span></div>` +
    `<span class="hint">The first photo is the <b>main</b> one, shown on the map and colony cards. Up to ${MAX_COLONY_PHOTOS} photos; ` +
    `landscape (about 16:9), at least 1600 px wide. You can select several at once. Changes are saved immediately.</span></div>`;

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
    multi("contact_person", "Contact person(s)", "+ Add person") +
    multi("contact_telephone", "Telephone(s)", "+ Add phone") +
    multi("email_address", "Email(s)", "+ Add email") +
    multi("web_page", "Website(s)", "+ Add website") +
    field("time_period", "Time period") +
    field("duration", "Duration");

  const postEditor =
    `<div id="post-editor" style="display:none">` +
    `<button type="button" class="back" onclick="cancelPost()">\u2039 All posts</button>` +
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
    `<div class="photo-ctl"><label class="btn ghost file-btn">Choose cover image` +
    `<input type="file" id="p-cover-file" accept="image/png,image/jpeg,image/webp" onchange="uploadCover()"/></label>` +
    `<span id="p-cover-status" style="font-size:12px"></span></div></div></div>` +
    `<div class="fld full"><span>Gallery <b id="pg-count" class="pcount"></b></span>` +
    `<div id="pg-grid" class="pgrid"></div>` +
    `<div class="photo-add"><label class="btn ghost file-btn">+ Add gallery photos` +
    `<input type="file" id="pg-file" multiple accept="image/png,image/jpeg,image/webp" onchange="addGallery(this.files)"/></label>` +
    `<span id="pg-status" class="pstatus"></span></div>` +
    `<span class="hint">Optional. Shown as thumbnails under the post; a click opens them full-screen. Up to ${MAX_POST_GALLERY}. ` +
    `For a photo inside the text, use the image button in the editor below (or drag / paste it in).</span></div>` +
    `<div class="fld full"><span>Text</span><div id="p-body"></div></div>` +
    `<label class="fld" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="p-draft" style="width:auto"/><span>Draft (kept off the blog)</span></label>` +
    `</div>` +
    `<div class="actions"><button class="btn" onclick="savePost()">Save post</button>` +
    `<button class="btn ghost" id="pe-delete" onclick="deletePost()">Delete</button>` +
    `<button class="btn ghost" onclick="cancelPost()">Cancel</button><span id="p-status"></span></div></div>`;

  const isAdmin = session.role === "admin";
  const roleClass = session.owner ? "owner" : session.role;
  const roleLabel = session.owner ? "maintainer" : session.role;
  const accessTab = isAdmin
    ? `<button id="tab-access" class="tab" onclick="showTab('access')">Access</button>`
    : "";
  const accessPanel = isAdmin
    ? `<div id="panel-access" style="display:none">` +
      `<h2 style="color:#000;margin:0 0 4px">Access</h2>` +
      `<p style="opacity:.75;font-size:13px;margin:0 0 18px">Changes take effect the next time the person signs in.</p>` +
      `<div class="acc-sec"><h3>Admins <span class="h-sub">(can edit everything)</span></h3><div id="admins-list"></div>` +
      `<div class="acc-add" id="add-admin-row"><input id="admin-email" type="email" placeholder="email@example.com"/>` +
      `<button class="btn ghost" onclick="addAdmin()">Add admin</button></div></div>` +
      `<div class="acc-sec"><h3>Organizers <span class="h-sub">(edit only their assigned colonies)</span></h3><div id="orgs-list"></div>` +
      `<div class="acc-add"><input id="org-email" type="email" placeholder="email@example.com"/>` +
      `<button class="btn ghost" onclick="addOrganizer()">Add organizer</button></div></div>` +
      `<div class="actions"><button class="btn" onclick="saveAccess()">Save access</button><span id="access-status"></span></div>` +
      `<div class="acc-sec" style="margin-top:28px"><h3>Organizers' group chat <span class="h-sub">(shown in the Network tab)</span></h3>` +
      `<div class="grid"><label class="fld"><span>Invite link (Viber / WhatsApp)</span><input id="community-url" type="url" placeholder="https://invite.viber.com/…" maxlength="300"/></label>` +
      `<label class="fld"><span>Label</span><input id="community-label" type="text" placeholder="Viber group" maxlength="60"/></label></div>` +
      `<div class="actions"><button class="btn" onclick="saveCommunity()">Save group link</button><span id="community-status"></span></div></div></div>`
    : "";

  // Network tab: Directory / Notices sub-views.
  const networkPanel =
    `<div id="panel-network" style="display:none">` +
    `<div class="net-head"><h2 style="color:#000;margin:0 0 4px">Network</h2>` +
    `<p style="opacity:.75;font-size:13px;margin:0 0 14px">Other colony organizers across the Western Balkans: find each other, share calls and offers. Visible only to signed-in organizers.</p></div>` +
    `<div class="subtabs" role="tablist"><button id="sub-directory" class="subtab on" role="tab" onclick="showSub('directory')">Directory</button>` +
    `<button id="sub-notices" class="subtab" role="tab" onclick="showSub('notices')">Notices</button></div>` +
    `<div id="subpanel-directory">` +
    `<div class="net-card" id="me-card"><div class="picker-head">You</div>` +
    `<div id="me-view"><p id="net-me" class="net-me">Loading…</p><p id="me-summary" class="me-summary"></p>` +
    `<div class="actions" style="margin-top:10px"><button class="btn ghost" onclick="editProfile()">Edit profile</button></div></div>` +
    `<div id="me-edit" style="display:none"><div class="grid">` +
    `<label class="fld"><span>Name</span><input id="me-name" type="text" maxlength="${PROFILE_LIMITS.name}"/></label>` +
    `<label class="fld"><span>Phone (WhatsApp / Viber, with country code)</span><input id="me-phone" type="tel" placeholder="+381 6x xxx xxxx" maxlength="${PROFILE_LIMITS.phone}"/></label>` +
    `<label class="fld full"><span>About you: what you do, what you're looking for</span><textarea id="me-about" rows="3" maxlength="${PROFILE_LIMITS.about}"></textarea></label>` +
    `<label class="fld full"><span>Languages (comma-separated)</span><input id="me-languages" type="text" placeholder="Serbian, English, German" maxlength="${PROFILE_LIMITS.languages}"/></label>` +
    `<label class="fld chk"><input type="checkbox" id="me-show_email"/><span>Show my email to other organizers</span></label>` +
    `<label class="fld chk"><input type="checkbox" id="me-visible"/><span>List me in the directory</span></label>` +
    `<label class="fld chk"><input type="checkbox" id="me-newsletter"/><span>Send me the monthly network digest</span></label>` +
    `</div><div class="actions"><button class="btn" onclick="saveProfile()">Save profile</button>` +
    `<button class="btn ghost" onclick="cancelProfile()">Cancel</button><span id="me-status"></span></div></div></div>` +
    `<div id="community-card" class="net-card community" hidden><div class="picker-head">Group chat</div>` +
    `<p class="net-me">Quick questions and day-to-day chat happen in the organizers' group.</p>` +
    `<div class="actions" style="margin-top:10px"><a id="community-link" class="btn" target="_blank" rel="noopener">Open group ↗</a></div>` +
    `<p id="community-admin" class="hint" hidden>No group link yet. Set it in the Access tab.</p></div>` +
    `<p id="dir-admin-note" class="hint" style="margin:0 0 10px" hidden></p>` +
    `<div class="search-wrap" style="margin-bottom:14px"><svg class="search-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M20 20l-4.2-4.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>` +
    `<input id="dir-search" type="search" placeholder="Search people, colonies, cities…" autocomplete="off" enterkeyhint="search"/><button type="button" class="search-clear" data-for="dir-search" aria-label="Clear search" hidden>×</button></div>` +
    `<div id="dir-list"><p style="opacity:.7;font-size:13px">Loading…</p></div></div>` +
    `<div id="subpanel-notices" style="display:none">` +
    `<div id="notices-index"><div class="notice-head"><p>Open calls, partner searches, offers and questions for other organizers. A notice stays up until its deadline, or for 90 days.</p>` +
    `<button class="btn" onclick="newNotice()">+ New notice</button></div>` +
    `<div id="notice-filters" class="chips" style="margin-bottom:14px"></div>` +
    `<div id="notices-list"><p class="pempty">Loading…</p></div>` +
    `<div id="notices-mine" hidden><div class="dir-group">Your closed &amp; expired notices</div><div id="notices-mine-list"></div></div></div>` +
    `<div id="notice-editor" style="display:none">` +
    `<button type="button" class="back" onclick="cancelNotice()">‹ All notices</button>` +
    `<h3 id="ne-title" style="color:#000;margin:0 0 12px"></h3>` +
    `<div class="grid">` +
    `<label class="fld"><span>Type</span><select id="n-type">` +
    `<option value="open_call">Open call</option><option value="partners">Looking for partners</option><option value="offering">Offering</option>` +
    `<option value="question">Question</option><option value="other">Other</option></select></label>` +
    `<label class="fld"><span>Deadline (optional)</span><input id="n-deadline" type="date"/></label>` +
    `<label class="fld full"><span>Title</span><input id="n-title" type="text" maxlength="${NOTICE_LIMITS.title}" placeholder="e.g. Open call: residency for ceramic artists, July 2027"/></label>` +
    `<label class="fld full"><span>Details</span><textarea id="n-body" rows="6" maxlength="${NOTICE_LIMITS.body}" placeholder="What you are offering or looking for, for whom, when, and how to reply."></textarea></label>` +
    `<label class="fld full"><span>Colony</span><select id="n-colony"></select></label>` +
    `<p id="n-contact" class="hint" style="grid-column:1/-1;margin:0"></p></div>` +
    `<div class="actions"><button id="n-save" class="btn" onclick="saveNotice()">Post notice</button>` +
    `<button class="btn ghost" onclick="cancelNotice()">Cancel</button><span id="n-status"></span></div></div>` +
    `</div>` +
    `</div>`;

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/>` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"/>` +
    `<meta name="format-detection" content="telephone=no,email=no,address=no"/>` +
    `<title>Studio · Beyond the Cities</title>` +
    `<link rel="icon" type="image/svg+xml" href="https://beyondthecities.org/favicon.svg"/>` +
    `<link rel="stylesheet" href="https://beyondthecities.org/fonts.css"/>` +
    `<style>` +
    `*{box-sizing:border-box}body{margin:0;font-family:'Montserrat',system-ui,sans-serif;background:#f1f1ee;color:#1c1c1c}` +
    `.bar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 20px;` +
    `background:#fff;border-bottom:1px solid rgba(28,28,28,.15);flex-wrap:wrap}` +
    `.bar b{color:#000}.badge{background:#ff4326;color:#fff;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700}` +
    `.role{display:inline-block;border-radius:999px;padding:2px 9px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;line-height:1.5;vertical-align:middle}` +
    `.role.owner{background:#726a5d;color:#fff}.role.admin{background:#1c1c1c;color:#fff}.role.organizer{background:transparent;border:1px solid rgba(28,28,28,.3);color:#1c1c1c}` +
    `.bar-brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:#1c1c1c;min-width:0}` +
    `.bar-mark{width:20px;height:33px;flex:0 0 auto}` +
    `.bar-name{font-weight:900;font-size:14px;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}.bar-name em{font-weight:400;font-style:normal}` +
    `.bar-tag{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#ff4326;border:1.5px solid #ff4326;border-radius:999px;padding:2px 8px;line-height:1.4}` +
    `.bar-right{display:flex;align-items:center;gap:16px;font-size:14px}` +
    `.bar-site{font-weight:700;color:#1c1c1c;text-decoration:none;opacity:.75}.bar-site:hover{opacity:1;color:#ff4326}` +
    `.acct{position:relative}` +
    `.acct-btn{display:flex;align-items:center;gap:4px;background:none;border:0;padding:2px;cursor:pointer;color:#1c1c1c;font:inherit}` +
    `.avatar{display:grid;place-items:center;width:34px;height:34px;border-radius:999px;background:#1c1c1c;color:#fff;font-weight:700;font-size:14px}` +
    `.acct-btn:hover .avatar,.acct-btn[aria-expanded=true] .avatar{background:#ff4326}.acct-btn:focus-visible .avatar{outline:2px solid #ff4326;outline-offset:2px}` +
    `.acct-menu{position:absolute;right:0;top:calc(100% + 8px);z-index:50;min-width:240px;background:#fff;border:1px solid rgba(28,28,28,.15);border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.14);padding:6px}` +
    `.acct-menu[hidden]{display:none}` +
    `a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font:inherit!important}` +
    `.acct-who{display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:10px 12px 12px;border-bottom:1px solid rgba(28,28,28,.1);margin-bottom:4px}` +
    `.acct-label{font-size:11px;opacity:.6;font-weight:600}.acct-email{font-weight:700;font-size:13.5px;word-break:break-all}` +
    `.acct-item,.acct-item:visited{display:block;padding:10px 12px;border-radius:9px;text-decoration:none!important;color:#1c1c1c;font-weight:600;font-size:14px}` +
    `.acct-item:hover{background:#f3f1ea;color:#ff4326}.acct-site{display:none}` +
    `.studio-foot{border-top:1px solid rgba(28,28,28,.12);text-align:center;padding:30px 20px;font-size:13px;font-weight:600}` +
    `.studio-foot__meta{opacity:.6;font-weight:500;margin-top:4px}` +
    `.wrap{max-width:760px;margin:0 auto;padding:24px 20px 80px}` +
    `.load{display:flex;gap:8px;margin:8px 0 20px}` +
    `.picker{margin:8px 0 6px;background:#f3f1ea;border:1px solid rgba(28,28,28,.12);border-radius:14px;padding:14px 16px}` +
    `.picker-sep{border:0;border-top:2px solid rgba(28,28,28,.14);margin:0 0 22px}` +
    `.picker-head{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#ff4326;margin-bottom:9px}` +
    `.picker-count{font-size:11px;font-weight:600;color:#6b6b6b;text-transform:none;letter-spacing:0;margin-left:6px}` +
    `#picker-results{margin-top:10px;display:grid;gap:6px}` +
    `.search-wrap{position:relative}.search-wrap input{padding-left:40px;padding-right:42px}` +
    `.search-ico{position:absolute;left:13px;top:50%;width:18px;height:18px;transform:translateY(-50%);color:#8a8a8a;pointer-events:none}` +
    `.search-clear{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:32px;height:32px;border:0;border-radius:999px;` +
    `background:rgba(28,28,28,.08);color:#1c1c1c;font:400 20px/1 system-ui,sans-serif;cursor:pointer;padding:0 0 2px}` +
    `.search-clear:hover{background:#ff4326;color:#fff}.search-clear[hidden]{display:none}` +
    `input[type=search]::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none}` +
    `.back{display:inline-block;background:none;border:0;padding:4px 0;margin:0 0 8px;font:inherit;font-size:14px;font-weight:700;color:#ff4326;cursor:pointer;width:auto}` +
    `.back:hover{text-decoration:underline}` +
    `input[type=date]{-webkit-appearance:none;appearance:none;display:block;min-width:0;max-width:100%;min-height:44px;text-align:left}` +
    `input[type=date]::-webkit-date-and-time-value{text-align:left}` +
    `#picker-results::-webkit-scrollbar{width:10px}#picker-results::-webkit-scrollbar-track{background:rgba(28,28,28,.08);border-radius:6px}#picker-results::-webkit-scrollbar-thumb{background:rgba(28,28,28,.3);border-radius:6px}` +
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
    `#post-editor{background:#fff;border:1px solid rgba(28,28,28,.15);border-radius:16px;padding:20px}` +
    `.subtabs{display:flex;gap:4px;margin:0 0 16px;border-bottom:1.5px solid rgba(28,28,28,.15)}` +
    `.subtab{background:none;border:0;border-bottom:2.5px solid transparent;margin-bottom:-1.5px;padding:8px 12px;font:inherit;font-weight:700;font-size:13.5px;color:#1c1c1c;opacity:.6;cursor:pointer;width:auto}` +
    `.subtab:hover{opacity:1}.subtab.on{opacity:1;border-bottom-color:#ff4326;color:#000}` +
    `.net-card{margin-bottom:16px;background:#f3f1ea;border:1px solid rgba(28,28,28,.12);border-radius:14px;padding:16px 18px}` +
    `.net-me{margin:0 0 8px;font-size:14px}.net-me b{color:#000}.me-summary{margin:0;font-size:13px;opacity:.8;white-space:pre-line}` +
    `.fld.chk{flex-direction:row;align-items:center;gap:8px}.fld.chk input{width:auto}` +
    `.net-card.community{background:#fff}` +
    `.dir-group{margin:18px 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#ff4326}.dir-group small{font-weight:600;color:#6b6b6b;text-transform:none;letter-spacing:0;margin-left:6px}` +
    `.person{background:#fff;border:1px solid rgba(28,28,28,.15);border-radius:12px;padding:12px 14px;margin-bottom:8px}.person.me{border-color:#ff4326}` +
    `.person-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.person-head b{color:#000;font-size:15px}` +
    `.person-col{font-size:13px;margin-top:3px}.person-col a{font-weight:600}.person-col a:hover{color:#ff4326}` +
    `.person-about{font-size:13.5px;line-height:1.5;margin:8px 0 0;white-space:pre-line}` +
    `.person .chips{margin-top:8px}.person .chip{cursor:default;padding:3px 10px;font-size:11.5px}` +
    `.person-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.person-actions a{font-size:12.5px;padding:7px 14px;text-decoration:none;display:inline-block}` +
    `.person-note{font-size:11.5px;color:#9a3b00;margin-top:8px}` +
    `.notice-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:14px}.notice-head p{margin:0;font-size:13px;opacity:.75;line-height:1.5}` +
    `.notice{background:#fff;border:1px solid rgba(28,28,28,.15);border-radius:12px;padding:14px 16px;margin-bottom:10px}.notice.mine{border-color:#ff4326}.notice.off{opacity:.72}` +
    `.notice-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px}` +
    `.ntype{display:inline-block;border-radius:999px;padding:2px 9px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;line-height:1.5;color:#fff;background:#6b6b6b}` +
    `.ntype.open_call{background:#ff4326}.ntype.partners{background:#726a5d}.ntype.offering{background:#2f6f4f}.ntype.question{background:#1c5f9c}` +
    `.ndead{font-size:12px;font-weight:700;color:#6b6b6b}.ndead.soon{color:#ff4326}` +
    `.notice h4{margin:0;font-size:16px;color:#000;line-height:1.3}` +
    `.nmeta{font-size:12.5px;opacity:.75;margin-top:4px}.nmeta a{font-weight:600}.nmeta a:hover{color:#ff4326}` +
    `.nbody{font-size:13.5px;line-height:1.55;margin:10px 0 0;white-space:pre-line;overflow-wrap:anywhere}` +
    `.nacts{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.nacts a,.nacts button{font-size:12.5px;padding:7px 14px;text-decoration:none;display:inline-block;width:auto}` +
    `.nstate{font-size:11.5px;color:#9a3b00;margin-top:8px}` +
    `#notice-editor{background:#fff;border:1px solid rgba(28,28,28,.15);border-radius:16px;padding:20px}` +
    `.acc-sec{margin-bottom:16px;background:#f3f1ea;border:1px solid rgba(28,28,28,.12);border-radius:14px;padding:16px 18px}.acc-sec h3{color:#000;margin:0 0 12px;font-size:16px}` +
    `.h-sub{font-weight:400;color:#6b6b6b}` +
    `.acc-row{display:flex;justify-content:space-between;align-items:center;gap:12px;background:#fff;border:1px solid rgba(28,28,28,.15);border-radius:12px;padding:10px 14px;margin-bottom:8px}` +
    `.acc-org{flex-direction:column;align-items:stretch;gap:8px}` +
    `.acc-org-head{display:flex;justify-content:space-between;align-items:center}` +
    `.acc-add{display:flex;gap:8px;margin-top:10px}` +
    `.btn{background:#ff4326;color:#fff;border:0;border-radius:999px;padding:10px 20px;font-weight:700;cursor:pointer;white-space:nowrap}` +
    `.btn.ghost{background:#fff;border:1.5px solid rgba(28,28,28,.35);color:#1c1c1c}` +
    `#form{display:none;background:#fff;border:1px solid rgba(28,28,28,.15);border-radius:16px;padding:20px}` +
    `.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}` +
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
    `#p-cover-preview{width:150px;height:100px;object-fit:cover;border-radius:10px;` +
    `background:#f7f7f5;border:1px solid rgba(28,28,28,.2);flex:0 0 auto}` +
    `.photo-ctl{display:flex;flex-direction:column;gap:8px}` +
    `.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}` +
    `.ptile{position:relative;border-radius:10px;overflow:hidden;border:1px solid rgba(28,28,28,.2);background:#f7f7f5;aspect-ratio:3/2}` +
    `.ptile.is-main{border:2.5px solid #ff4326}` +
    `.ptile img{width:100%;height:100%;object-fit:cover;display:block}` +
    `.pmain{position:absolute;top:6px;left:6px;background:#ff4326;color:#fff;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:2px 8px;border-radius:999px;opacity:1!important}` +
    `.pbar{position:absolute;left:0;right:0;bottom:0;display:flex;gap:5px;justify-content:flex-end;padding:6px;background:linear-gradient(transparent,rgba(0,0,0,.5))}` +
    `.pbtn{width:30px;height:30px;flex:0 0 auto;border-radius:999px;border:0;background:rgba(255,255,255,.94);color:#1c1c1c;font:700 16px/1 system-ui,sans-serif;cursor:pointer;padding:0}` +
    `.pbtn:hover{background:#fff;color:#ff4326}.pbtn:disabled{opacity:.35;cursor:default;color:#1c1c1c}` +
    `.pbtn.star{position:absolute;top:6px;right:6px;width:auto;height:24px;padding:0 9px;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}` +
    `.photo-add{display:flex;align-items:center;gap:12px;margin-top:10px;flex-wrap:wrap}` +
    `.file-btn{position:relative;overflow:hidden;display:inline-block;font-size:13px}` +
    `.file-btn input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%}` +
    `.file-btn:has(input:disabled){opacity:.45}.file-btn:has(input:disabled) input{cursor:default}` +
    `.pstatus{font-size:12px}.hint{font-size:11.5px;font-weight:500;opacity:.7!important;line-height:1.45}` +
    `.pcount{font-weight:600;opacity:.6;margin-left:4px}.pempty{font-size:13px;opacity:.7;margin:0;grid-column:1/-1}` +
    `input[type=file]{border:0;padding:0;font-size:12px}` +
    `.fld span{opacity:.8}.actions{margin-top:18px;display:flex;gap:10px;align-items:center}` +
    `#status{font-size:13px;font-weight:600;opacity:.85}a{color:#1c1c1c}` +
    `#p-body{font-weight:400}` +
    `#p-body .toastui-editor-defaultUI{border-color:rgba(28,28,28,.3);border-radius:10px;font-family:inherit}` +
    `#p-body .toastui-editor-defaultUI-toolbar{border-radius:10px 10px 0 0;background:#f7f7f5}` +
    `#p-body .toastui-editor-contents{font-family:'Montserrat',system-ui,sans-serif;font-size:15px;color:#1c1c1c}` +
    `#p-body .toastui-editor-contents p{font-size:15px;line-height:1.65}` +
    `#p-body .toastui-editor-contents img{max-width:100%;border-radius:8px}` +
    `#p-body .ProseMirror{font-family:'Montserrat',system-ui,sans-serif}` +
    `#p-body .toastui-editor-mode-switch{border-radius:0 0 10px 10px}` +
    // --- phones (organizers at the workshop) ---
    // Touch screens: editor tooltips stick after a tap and cover the menus.
    `@media (hover:none){#p-body .toastui-editor-tooltip{display:none!important}}` +
    `@media (max-width:640px){` +
    `.bar{padding:10px 14px;flex-wrap:nowrap}.bar-name{font-size:12.5px}.bar-mark{width:18px;height:30px}` +
    `.bar-right>.bar-site{display:none}.acct-site{display:block}` +
    `.wrap{padding:16px 14px 56px}` +
    `.tabs{overflow-x:auto;flex-wrap:nowrap;margin:2px -14px 16px;padding:0 14px;scrollbar-width:none}.tabs::-webkit-scrollbar{display:none}` +
    `.tab{flex:0 0 auto;padding:9px 15px}` +
    `.picker{padding:12px}` +
    `#form,#post-editor{padding:16px 14px;border-radius:14px}` +
    `.grid{grid-template-columns:minmax(0,1fr);gap:16px}` +
    `input,select,textarea{font-size:16px;padding:11px 12px}` +
    `.photo{flex-direction:column;gap:10px}#p-cover-preview{width:100%;height:auto;aspect-ratio:16/9}` +
    `.pgrid{grid-template-columns:1fr 1fr;gap:8px}` +
    `.pbtn{width:34px;height:34px;font-size:18px}.pbtn.star{height:28px}` +
    `.file-btn{width:100%;text-align:center;padding:12px 20px}` +
    `.actions{flex-wrap:wrap;gap:8px}.actions .btn{flex:1 1 auto;padding:12px 18px}.actions span{flex-basis:100%}` +
    `.posts-head{gap:10px;flex-wrap:wrap}` +
    `.post-row{flex-direction:column;align-items:stretch}.post-row .btn{flex:1}` +
    `.net-card{padding:14px 12px}.subtabs{overflow-x:auto;scrollbar-width:none}.subtab{flex:0 0 auto}.person-actions a{flex:1 1 auto;text-align:center}` +
    `.notice-head{flex-wrap:wrap}.notice-head .btn{width:100%}#notice-editor{padding:16px 14px;border-radius:14px}.nacts a,.nacts button{flex:1 1 auto;text-align:center}` +
    `.acc-sec{padding:14px 12px}.acc-row{flex-wrap:wrap;padding:10px 12px}.acc-row span{overflow-wrap:anywhere}.acc-org-head{flex-wrap:wrap;gap:8px}.acc-add{flex-wrap:wrap}.acc-add .btn{width:100%}.acc-org .chip{max-width:100%;white-space:normal;text-align:left}` +
    `.chip{padding:7px 12px}` +
    `#p-body .toastui-editor-toolbar{overflow-x:auto}` +
    // Toolbar popups (headings, link, image) are placed next to their button and
    // run off a narrow screen — pin them inside the editor instead.
    `#p-body .toastui-editor-popup{left:8px!important;right:auto!important;max-width:calc(100% - 16px);box-sizing:border-box;margin-left:0!important}` +
    `#p-body .toastui-editor-popup-add-link,#p-body .toastui-editor-popup-add-image{width:calc(100% - 16px)!important}` +
    `#p-body .toastui-editor-popup-body input[type=text]{width:100%!important;box-sizing:border-box}` +
    `#p-body .toastui-editor-popup .toastui-editor-button-container{text-align:right}` +
    `.studio-foot{padding:24px 16px;font-size:12px}` +
    `}` +
    `</style>` +
    `<link rel="stylesheet" href="https://uicdn.toast.com/editor/3.2.2/toastui-editor.min.css"/>` +
    `<script src="https://uicdn.toast.com/editor/3.2.2/toastui-editor-all.min.js"></script>` +
    `</head><body data-role="${escapeHtml(session.role)}" data-raw="${escapeHtml(rawBase)}">` +
    `<header class="bar"><a class="bar-brand" href="/" aria-label="Studio home">${LOGO_SVG}` +
    `<span class="bar-name">Beyond <em>the</em> Cities</span><span class="bar-tag">Studio</span></a>` +
    `<div class="bar-right"><a class="bar-site" href="https://beyondthecities.org/" target="_blank" rel="noopener">View site \u2197</a>` +
    `<div class="acct"><button type="button" id="acct-btn" class="acct-btn" aria-haspopup="true" aria-expanded="false" aria-label="Account" onclick="toggleAcct(event)">` +
    `<span class="avatar" aria-hidden="true">${escapeHtml((session.email || '?').charAt(0).toUpperCase())}</span></button>` +
    `<div id="acct-menu" class="acct-menu" hidden><div class="acct-who"><span class="acct-label">Signed in as</span>` +
    `<span class="acct-email">${escapeHtml(session.email)}</span><span class="role ${escapeHtml(roleClass)}">${escapeHtml(roleLabel)}</span></div>` +
    `<a class="acct-item acct-site" href="https://beyondthecities.org/" target="_blank" rel="noopener">View site \u2197</a>` +
    `<a class="acct-item" href="/auth/logout">Log out</a></div></div></div></header>` +
    `<div class="wrap">` +
    `<div class="tabs"><button id="tab-colony" class="tab on" onclick="showTab('colony')">Colony details</button>` +
    `<button id="tab-posts" class="tab" onclick="showTab('posts')">Blog posts</button>` +
    `<button id="tab-network" class="tab" onclick="showTab('network')">Network</button>` + accessTab + `</div>` +
    `<div id="panel-colony">` +
    `<div id="colony-list"><div class="picker"><div class="picker-head">${session.role === "organizer" ? "Colonies you can edit" : "Select a colony"}<span id="picker-count" class="picker-count"></span></div>` +
    `<div class="search-wrap"><svg class="search-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M20 20l-4.2-4.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg><input id="picker-search" type="search" placeholder="Search colonies…" autocomplete="off" enterkeyhint="search"/><button type="button" class="search-clear" data-for="picker-search" aria-label="Clear search" hidden>\u00d7</button></div>` +
    `<div id="picker-countries" class="chips" style="margin-top:8px"></div>` +
    `<div id="picker-results"><p style="opacity:.7;font-size:13px;padding:8px 2px">Loading colonies…</p></div></div></div>` +
    `<div id="colony-edit" style="display:none">` +
    `<button type="button" class="back" onclick="closeColony()">\u2039 All colonies</button>` +
    `<h2 id="title" style="color:#000"></h2>` +
    `<div id="form"><div class="grid">${form}</div>` +
    `<div class="actions"><button class="btn" onclick="save()">Save changes</button>` +
    `<button class="btn ghost" onclick="closeColony()">Cancel</button><span id="status"></span></div></div>` +
    `</div></div>` +
    `<div id="panel-posts" style="display:none">` +
    `<div id="posts-index"><div class="posts-head"><div><h2 style="color:#000;margin:0">Blog posts</h2><span id="posts-status" style="font-size:12px;opacity:.85"></span></div><button class="btn" onclick="newPost()">+ New post</button></div>` +
    `<div id="posts-search-row" hidden style="margin-bottom:12px">` + `<div class="search-wrap"><svg class="search-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M20 20l-4.2-4.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg><input id="posts-search" type="search" placeholder="Search posts…" autocomplete="off" enterkeyhint="search"/><button type="button" class="search-clear" data-for="posts-search" aria-label="Clear search" hidden>\u00d7</button></div>` + `</div>` +
    `<div id="posts-list"></div></div>` + postEditor +
    `</div>` + networkPanel + accessPanel +
    `</div>` +
    `<footer class="studio-foot"><p>Beyond the Cities · Artists' Residencies of the Western Balkans</p>` +
    `<p class="studio-foot__meta">A Goethe-Institut project · 2026–2028</p></footer>` +
    `<script>` + EDITOR_JS + `</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

// Client script — plain concatenation, no backticks/template literals.
const EDITOR_JS =
  "var FIELDS=['art_colony_name','city','place','country','latitude','longitude','scope','art_colony_organisers','time_period','duration'];" +
  "var MULTI=['contact_person','contact_telephone','email_address','web_page'];" +
  "function splitMulti(v){return String(v||'').split(/\\s*[&,;]\\s*|\\s+and\\s+|\\s+i\\s+/i).map(function(s){return s.trim()}).filter(Boolean)}" +
  "function addMulti(name,value){var box=q('ml-'+name);var row=document.createElement('div');row.className='ml-row';" +
  "var inp=document.createElement('input');inp.type='text';inp.value=value||'';" +
  "var rm=document.createElement('button');rm.type='button';rm.className='btn ghost ml-rm';rm.textContent='\\u00d7';" +
  "rm.onclick=function(){row.remove();if(!box.children.length)addMulti(name,'')};" +
  "row.appendChild(inp);row.appendChild(rm);box.appendChild(row)}" +
  "function renderMulti(name,values){var box=q('ml-'+name);box.innerHTML='';var vals=(values&&values.length)?values:[''];vals.forEach(function(v){addMulti(name,v)})}" +
  "function getMulti(name){return [].slice.call(q('ml-'+name).querySelectorAll('input')).map(function(i){return i.value.trim()}).filter(Boolean).join(', ')}" +
  "var currentId=null;var currentPhotos=[];var RAW=document.body.dataset.raw;" +
  "var editingSlug=null;var postCover='';var savedCover='';var taggable=[];var bodyEditor=null;var postColonies=[];" +
  "var MAXP=" + MAX_COLONY_PHOTOS + ";var MAXG=" + MAX_POST_GALLERY + ";var photoBusy=false;var postGallery=[];var galleryBusy=false;var localPrev={};" +
  "function q(id){return document.getElementById(id)}" +
  "function syncClear(id){var b=document.querySelector('.search-clear[data-for=\\''+id+'\\']');if(b)b.hidden=!q(id).value}" +
  "document.addEventListener('click',function(e){var b=e.target.closest('.search-clear');if(!b)return;var inp=q(b.dataset.for);inp.value='';" +
  "inp.dispatchEvent(new Event('input',{bubbles:true}));inp.focus()});" +
  "function toggleAcct(e){e.stopPropagation();var m=q('acct-menu'),b=q('acct-btn');var open=m.hidden;m.hidden=!open;b.setAttribute('aria-expanded',String(open))}" +
  "document.addEventListener('pointerdown',function(e){var m=q('acct-menu');if(m&&!m.hidden&&!e.target.closest('.acct')){m.hidden=true;q('acct-btn').setAttribute('aria-expanded','false')}});" +
  "document.addEventListener('keydown',function(e){if(e.key==='Escape'){var m=q('acct-menu');if(m&&!m.hidden){m.hidden=true;q('acct-btn').setAttribute('aria-expanded','false');q('acct-btn').focus()}}});" +
  "function setStatus(t){q('status').textContent=t}" +
  "function setPhotoStatus(t){q('photo-status').textContent=t}" +
  "var pickerColonies=[];var pickerTerm='';var pickerCountry='';" +
  "async function loadColonies(){" +
  "var r=await fetch('/api/colonies');if(!r.ok){setStatus('Could not load colony list');return}" +
  "var data=await r.json();pickerColonies=data.colonies||[];" +
  "q('picker-search').addEventListener('input',function(e){pickerTerm=e.target.value;syncClear('picker-search');renderPicker()});" +
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
  "var cnt=q('picker-count');if(cnt){var tot=pickerColonies.length;cnt.textContent=list.length+(list.length!==tot?(' of '+tot):'')+(list.length===1?' colony':' colonies')}" +
  "if(!list.length){var p=document.createElement('p');p.style.cssText='opacity:.7;font-size:13px;padding:6px 2px';p.textContent='No colonies match.';box.appendChild(p);return}" +
  "list.forEach(function(c){var b=document.createElement('button');b.type='button';b.className='picker-item'+(String(c.id)===String(currentId)?' on':'');" +
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
  "currentPhotos=realList(c.photos);q('photo-file').value='';setPhotoStatus('');" +
  "currentId=id;renderPhotos();q('title').textContent=c.art_colony_name||('Colony '+id);" +
  "renderPicker();q('form').style.display='block';setStatus('');colonyDirty=false;" +
  "q('colony-list').style.display='none';q('colony-edit').style.display='block';scrollTo(0,0)}" +
  // Unsaved-changes guard (photos are saved immediately, so they don't count).
  "var colonyDirty=false;var postDirty=false;" +
  "function closeColony(){if(colonyDirty&&!confirm('Discard unsaved changes?'))return;colonyDirty=false;" +
  "q('colony-edit').style.display='none';q('colony-list').style.display='block';renderPicker();" +
  // Back to where you were: the colony you just edited, centred in the list.
  "var on=document.querySelector('#picker-results .picker-item.on');if(on){on.scrollIntoView({block:'center'})}else{scrollTo(0,0)}}" +
  "q('posts-search').addEventListener('input',function(e){postTerm=e.target.value;syncClear('posts-search');drawPosts()});" +
  "function markDirty(e){if(e.target&&e.target.type==='file')return;if(e.currentTarget.id==='form')colonyDirty=true;else postDirty=true}" +
  "['form','post-editor'].forEach(function(id){q(id).addEventListener('input',markDirty);q(id).addEventListener('change',markDirty)});" +
  // --- photo grids (colony photos + post gallery) ---
  "function realList(l){return (Array.isArray(l)?l:[]).map(function(p){return String(p||'').trim()}).filter(function(p){return p&&p.indexOf('placehold.co')===-1})}" +
  "function photoSrc(p){if(localPrev[p])return localPrev[p];return /^https?:/.test(p)?p:RAW+p}" +
  "function renderGrid(id,list,markMain,act,busy){var box=q(id);box.innerHTML='';" +
  "list.forEach(function(p,i){var t=elx('div','ptile'+(markMain&&i===0?' is-main':''));" +
  "var img=document.createElement('img');img.src=photoSrc(p);img.alt='';img.loading='lazy';t.appendChild(img);" +
  "if(markMain&&i===0){var m=elx('span','pmain');m.textContent='Main';t.appendChild(m)}" +
  "var bar=elx('div','pbar');" +
  "function mk(txt,title,fn,dis,cls){var b=elx('button','pbtn'+(cls?' '+cls:''));b.type='button';b.textContent=txt;b.title=title;b.setAttribute('aria-label',title);b.disabled=!!dis||busy;b.onclick=fn;(cls==='star'?t:bar).appendChild(b)}" +
  "if(markMain&&i>0)mk('\u2605 Set main','Make this the main photo',function(){act('main',i)},false,'star');" +
  "mk('\u2039','Move left',function(){act('move',i,-1)},i===0);" +
  "mk('\u203a','Move right',function(){act('move',i,1)},i===list.length-1);" +
  "mk('\u00d7','Remove',function(){act('remove',i)});" +
  "t.appendChild(bar);box.appendChild(t)})}" +
  "function reorder(list,op,i,d){var a=list.slice();if(op==='main'){a.unshift(a.splice(i,1)[0])}" +
  "else if(op==='move'){var j=i+d;if(j<0||j>=a.length)return a;var x=a[i];a[i]=a[j];a[j]=x}else if(op==='remove'){a.splice(i,1)}return a}" +
  "function renderPhotos(){renderGrid('photo-grid',currentPhotos,true,photoAction,photoBusy);" +
  "if(!currentPhotos.length)q('photo-grid').innerHTML='<p class=\"pempty\">No photos yet \u2014 the map shows a placeholder.</p>';" +
  "q('photo-count').textContent=currentPhotos.length+' / '+MAXP;q('photo-file').disabled=photoBusy||currentPhotos.length>=MAXP}" +
  "async function photoAction(op,i,d){if(photoBusy||!currentId)return;" +
  "if(op==='remove'&&!confirm('Remove this photo? It will be deleted from the site.'))return;" +
  "var next=reorder(currentPhotos,op,i,d);photoBusy=true;renderPhotos();setPhotoStatus('Saving\u2026');" +
  "try{var r=await fetch('/api/colony/'+currentId+'/photos',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({photos:next})});var out=await r.json();" +
  "if(!r.ok){setPhotoStatus('Failed: '+(out.detail||out.error))}else{currentPhotos=realList(out.photos||next);" +
  "setPhotoStatus(out.unchanged?'No change':('Saved \u2713 commit '+String(out.commit||'').slice(0,7)+' \u2014 live in ~1\u20132 min'))}}" +
  "catch(e){setPhotoStatus('Failed \u2014 check your connection')}photoBusy=false;renderPhotos()}" +
  // Uploads go one at a time (parallel commits to the same branch conflict).
  "async function addPhotos(files){var list=[].slice.call(files||[]);q('photo-file').value='';if(!currentId||photoBusy||!list.length)return;" +
  "var room=MAXP-currentPhotos.length;if(list.length>room){alert('A colony can have up to '+MAXP+' photos \u2014 only the first '+room+' will be added.');list=list.slice(0,room)}" +
  "if(!list.length)return;photoBusy=true;renderPhotos();var done=0,last='';" +
  "for(var k=0;k<list.length;k++){setPhotoStatus('Uploading '+(k+1)+' of '+list.length+'\u2026');" +
  "try{var blob=await optimizeImage(list[k]);var fd=new FormData();fd.append('file',blob,'photo.webp');" +
  "var r=await fetch('/api/colony/'+currentId+'/photo',{method:'POST',body:fd});var out=await r.json();" +
  "if(!r.ok){setPhotoStatus('Upload failed: '+(out.detail||out.error));break}" +
  "localPrev[out.photo]=URL.createObjectURL(blob);currentPhotos=realList(out.photos);done++;last=out.commit;renderPhotos()}" +
  "catch(e){setPhotoStatus('Upload failed \u2014 check your connection');break}}" +
  "photoBusy=false;renderPhotos();" +
  "if(done&&done===list.length)setPhotoStatus((done>1?done+' photos':'Photo')+' added \u2713 commit '+String(last||'').slice(0,7)+' \u2014 live in ~1\u20132 min')}" +
  "function renderGallery(){renderGrid('pg-grid',postGallery,false,galleryAction,galleryBusy);" +
  "q('pg-count').textContent=postGallery.length?(postGallery.length+' / '+MAXG):'';q('pg-file').disabled=galleryBusy||postGallery.length>=MAXG}" +
  "function galleryAction(op,i,d){if(galleryBusy)return;postGallery=reorder(postGallery,op,i,d);renderGallery();q('pg-status').textContent='Changed \u2014 remember to Save post'}" +
  "async function addGallery(files){var list=[].slice.call(files||[]);q('pg-file').value='';if(galleryBusy||!list.length)return;" +
  "var room=MAXG-postGallery.length;if(list.length>room){alert('Up to '+MAXG+' gallery photos \u2014 only the first '+room+' will be added.');list=list.slice(0,room)}" +
  "if(!list.length)return;galleryBusy=true;renderGallery();var st=q('pg-status');" +
  "for(var k=0;k<list.length;k++){st.textContent='Uploading '+(k+1)+' of '+list.length+'\u2026';" +
  "try{var blob=await optimizeImage(list[k]);var fd=new FormData();fd.append('file',blob,'gallery.webp');fd.append('kind','gallery');fd.append('title',q('p-title').value||'');" +
  "var r=await fetch('/api/upload',{method:'POST',body:fd});var out=await r.json();" +
  "if(!r.ok){st.textContent='Upload failed: '+(out.detail||out.error);galleryBusy=false;renderGallery();return}" +
  "localPrev[out.path]=URL.createObjectURL(blob);postGallery.push(out.path);renderGallery()}" +
  "catch(e){st.textContent='Upload failed \u2014 check your connection';galleryBusy=false;renderGallery();return}}" +
  "galleryBusy=false;renderGallery();st.textContent='Uploaded \u2713 \u2014 remember to Save post'}" +
  // Resize (max 1600px) + convert to WebP in the browser before upload.
  "function optimizeImage(file){return new Promise(function(resolve){" +
  "if(!/^image\\/(jpeg|png|webp)$/.test(file.type)){resolve(file);return}" +
  "var url=URL.createObjectURL(file);var img=new Image();" +
  "img.onload=function(){URL.revokeObjectURL(url);var maxW=1600;var w=img.naturalWidth,h=img.naturalHeight;" +
  "if(w>maxW){h=Math.round(h*maxW/w);w=maxW}var cv=document.createElement('canvas');cv.width=w;cv.height=h;" +
  "cv.getContext('2d').drawImage(img,0,0,w,h);cv.toBlob(function(b){resolve(b&&b.size<file.size?b:file)},'image/webp',0.82)};" +
  "img.onerror=function(){URL.revokeObjectURL(url);resolve(file)};img.src=url})}" +
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
  "document.addEventListener('click',function(e){var ch=e.target.closest('#art-chips .chip');if(ch){ch.classList.toggle('on');colonyDirty=true}" +
  "if(e.target.closest('#form .ml-rm'))colonyDirty=true});" +
  "async function save(){if(!currentId)return;var body={};" +
  "FIELDS.forEach(function(f){body[f]=q('f-'+f).value});" +
  "MULTI.forEach(function(f){body[f]=getMulti(f)});" +
  "body.art_field=getArtField();" +
  "['latitude','longitude'].forEach(function(k){var v=String(body[k]).trim();if(v!==''&&!isNaN(Number(v))){body[k]=Number(v)}else{delete body[k]}});" +
  "setStatus('Saving…');" +
  "var r=await fetch('/api/colony/'+currentId,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});" +
  "var out=await r.json();" +
  "if(!r.ok){setStatus('Save failed: '+(out.detail||out.error));return}" +
  "colonyDirty=false;if(out.unchanged){setStatus('No changes to save');return}" +
  "setStatus('Saved \\u2713  commit '+String(out.commit||'').slice(0,7)+' · live in ~1–2 min')}" +
  // --- tabs + blog posts ---
  "function showTab(name){['colony','posts','network','access'].forEach(function(n){" +
  "var p=q('panel-'+n);if(p)p.style.display=(n===name?'block':'none');" +
  "var t=q('tab-'+n);if(t)t.classList.toggle('on',n===name)});" +
  "if(name==='posts')loadPosts();if(name==='network')loadNetwork();if(name==='access')loadAccessPanel()}" +
  // --- network (directory / notices) ---
  "var netSub='directory';var netMe=null;var dirPeople=null;var dirAdmin=false;var dirTerm='';" +
  "var COUNTRY_ORDER=['Serbia','Bosnia and Herzegovina','North Macedonia'];" +
  "function showSub(name){netSub=name;['directory','notices'].forEach(function(n){" +
  "var p=q('subpanel-'+n);if(p)p.style.display=(n===name?'block':'none');" +
  "var t=q('sub-'+n);if(t){t.classList.toggle('on',n===name);t.setAttribute('aria-selected',String(n===name))}});" +
  "if(name==='notices'&&!notices)loadNotices()}" +
  "async function loadNetwork(){if(!netMe){var r=await fetch('/api/network/me');var out=await r.json().catch(function(){return{}});" +
  "if(!r.ok){q('net-me').textContent='Could not load your profile: '+(out.detail||out.error||r.status);return}netMe=out.profile}" +
  "renderNetMe();if(!dirPeople)loadDirectory()}" +
  "function renderNetMe(){var box=q('net-me');box.innerHTML='';var b=document.createElement('b');b.textContent=netMe.name||netMe.email;box.appendChild(b);" +
  "if(netMe.name)box.appendChild(document.createTextNode(' \\u00b7 '+netMe.email));" +
  "var parts=[];if(netMe.phone)parts.push(netMe.phone);if(netMe.languages)parts.push(netMe.languages);if(netMe.about)parts.push(netMe.about);" +
  "var sum=q('me-summary');sum.textContent=parts.length?parts.join('\\n'):'Your profile is empty. Add a phone, languages and a line about yourself so other organizers can reach you.';" +
  "var flags=[];if(!netMe.visible)flags.push('hidden from the directory');if(!netMe.show_email)flags.push('email hidden');if(!netMe.newsletter)flags.push('no digest');" +
  "if(flags.length)sum.textContent+='\\n('+flags.join(', ')+')'}" +
  "function editProfile(){q('me-name').value=netMe.name||'';q('me-phone').value=netMe.phone||'';q('me-about').value=netMe.about||'';q('me-languages').value=netMe.languages||'';" +
  "q('me-show_email').checked=!!netMe.show_email;q('me-visible').checked=!!netMe.visible;q('me-newsletter').checked=!!netMe.newsletter;" +
  "q('me-status').textContent='';q('me-view').style.display='none';q('me-edit').style.display='block';q('me-name').focus()}" +
  "function cancelProfile(){q('me-edit').style.display='none';q('me-view').style.display='block'}" +
  "async function saveProfile(){q('me-status').textContent='Saving…';var body={name:q('me-name').value,phone:q('me-phone').value,about:q('me-about').value,languages:q('me-languages').value," +
  "show_email:q('me-show_email').checked,visible:q('me-visible').checked,newsletter:q('me-newsletter').checked};" +
  "var r=await fetch('/api/network/me',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});var out=await r.json().catch(function(){return{}});" +
  "if(!r.ok){q('me-status').textContent='Save failed: '+(out.detail||out.error||r.status);return}" +
  "netMe=out.profile;renderNetMe();cancelProfile();dirPeople=null;loadDirectory()}" +
  "async function loadDirectory(){var box=q('dir-list');box.innerHTML='<p style=\"opacity:.7;font-size:13px\">Loading…</p>';" +
  "var r=await fetch('/api/network/directory');var out=await r.json().catch(function(){return{}});" +
  "if(!r.ok){box.innerHTML='';var pe=elx('p','pempty');pe.textContent='Could not load the directory: '+(out.detail||out.error||r.status);box.appendChild(pe);return}" +
  "dirPeople=out.people||[];dirAdmin=!!out.isAdmin;renderCommunity(out.community||{});renderDirectory()}" +
  "function renderCommunity(c){var card=q('community-card');var a=q('community-link');var note=q('community-admin');" +
  "if(c.url){a.href=c.url;a.textContent='Open '+(c.label||'group')+' \\u2197';a.hidden=false;note.hidden=true;card.hidden=false}" +
  "else if(dirAdmin){a.hidden=true;note.hidden=false;card.hidden=false}else{card.hidden=true}}" +
  "function phoneDigits(p){var d=String(p||'').replace(/\\D/g,'');if(d.indexOf('00')===0)d=d.slice(2);return d}" +
  "function personMatches(p,t){if(!t)return true;var hay=[p.name,p.email,p.about,p.languages].concat(p.colonies.map(function(c){return c.name+' '+c.city+' '+c.country})).join(' ').toLowerCase();return hay.indexOf(t)!==-1}" +
  "function groupOf(p){if(p.countries.length)return p.countries[0];return p.role==='admin'?'Project team':'Other'}" +
  "function renderDirectory(){var box=q('dir-list');box.innerHTML='';var t=dirTerm.trim().toLowerCase();" +
  "var note=q('dir-admin-note');if(dirAdmin){var tot=dirPeople.length,filled=dirPeople.filter(function(p){return p.filled}).length,never=dirPeople.filter(function(p){return !p.signed_in}).length;" +
  "note.textContent=filled+' of '+tot+' accounts have filled in a profile'+(never?' \\u00b7 '+never+' never signed in':'')+'. Only you see these notes.';note.hidden=false}else note.hidden=true;" +
  "var groups={};dirPeople.forEach(function(p){if(!personMatches(p,t))return;var g=groupOf(p);(groups[g]=groups[g]||[]).push(p)});" +
  "var names=Object.keys(groups).sort(function(a,b){var ia=COUNTRY_ORDER.indexOf(a),ib=COUNTRY_ORDER.indexOf(b);if(ia===-1)ia=a==='Project team'?99:50;if(ib===-1)ib=b==='Project team'?99:50;return ia-ib||a.localeCompare(b)});" +
  "if(!names.length){var pe=elx('p','pempty');pe.textContent=t?'No one matches \\u201c'+dirTerm.trim()+'\\u201d.':'No organizers yet.';box.appendChild(pe);return}" +
  "names.forEach(function(g){var h=elx('div','dir-group');h.textContent=g;var sm=document.createElement('small');sm.textContent=String(groups[g].length);h.appendChild(sm);box.appendChild(h);" +
  "groups[g].forEach(function(p){box.appendChild(personCard(p))})})}" +
  "function personCard(p){var card=elx('div','person'+(p.me?' me':''));var head=elx('div','person-head');var b=document.createElement('b');b.textContent=p.name||p.email||'(no name yet)';head.appendChild(b);" +
  "var pill=elx('span','role '+(p.owner?'owner':p.role));pill.textContent=p.owner?'maintainer':p.role;head.appendChild(pill);" +
  "if(p.me){var you=elx('span','hint');you.textContent='you';head.appendChild(you)}card.appendChild(head);" +
  "if(p.colonies.length){var col=elx('div','person-col');p.colonies.forEach(function(c,i){if(i)col.appendChild(document.createTextNode(' \\u00b7 '));" +
  "var a=document.createElement('a');a.href='https://beyondthecities.org/map.html?colony='+encodeURIComponent(c.id);a.target='_blank';a.rel='noopener';a.textContent=c.name;col.appendChild(a);" +
  "if(c.city)col.appendChild(document.createTextNode(', '+c.city))});card.appendChild(col)}" +
  "if(p.about){var ab=elx('p','person-about');ab.textContent=p.about;card.appendChild(ab)}" +
  "if(p.languages){var ch=elx('div','chips');p.languages.split(',').forEach(function(l){l=l.trim();if(!l)return;var c=elx('span','chip');c.textContent=l;ch.appendChild(c)});card.appendChild(ch)}" +
  "var acts=elx('div','person-actions');if(p.email&&!p.me){var m=document.createElement('a');m.className='btn ghost';m.href='mailto:'+p.email;m.textContent='Email';acts.appendChild(m)}" +
  "var d=phoneDigits(p.phone);if(d&&!p.me){var w=document.createElement('a');w.className='btn ghost';w.href='https://wa.me/'+d;w.target='_blank';w.rel='noopener';w.textContent='WhatsApp';acts.appendChild(w);" +
  "var v=document.createElement('a');v.className='btn ghost';v.href='viber://chat?number=%2B'+d;v.textContent='Viber';acts.appendChild(v)}" +
  "if(acts.children.length)card.appendChild(acts);" +
  "if(dirAdmin){var notes=[];if(!p.signed_in)notes.push('Has not signed in yet');else if(!p.filled)notes.push('No profile yet');if(p.visible===false)notes.push('Hidden from the directory');" +
  "if(notes.length){var n=elx('div','person-note');n.textContent=notes.join(' \\u00b7 ');card.appendChild(n)}}" +
  "return card}" +
  "document.addEventListener('input',function(e){if(e.target&&e.target.id==='dir-search'){dirTerm=e.target.value;syncClear('dir-search');if(dirPeople)renderDirectory()}});" +
  // --- network: notice board ---
  "var NOTICE_TYPES={open_call:'Open call',partners:'Looking for partners',offering:'Offering',question:'Question',other:'Other'};" +
  "var notices=null;var noticesMine=[];var noticeAdmin=false;var noticeFilter='all';var editingNotice=null;var noticeDirty=false;" +
  "async function loadNotices(){var box=q('notices-list');box.innerHTML='<p class=\"pempty\">Loading…</p>';" +
  "var r=await fetch('/api/network/notices');var out=await r.json().catch(function(){return{}});" +
  "if(!r.ok){box.innerHTML='';var pe=elx('p','pempty');pe.textContent='Could not load notices: '+(out.detail||out.error||r.status);box.appendChild(pe);return}" +
  "notices=out.notices||[];noticesMine=out.mine||[];noticeAdmin=!!out.isAdmin;renderNoticeFilters();renderNotices();" +
  "q('sub-notices').textContent='Notices'+(notices.length?' ('+notices.length+')':'')}" +
  "function renderNoticeFilters(){var box=q('notice-filters');box.innerHTML='';var counts={};notices.forEach(function(n){counts[n.type]=(counts[n.type]||0)+1});" +
  "if(noticeFilter!=='all'&&!counts[noticeFilter])noticeFilter='all';" +
  "function mk(label,val,cnt){var b=elx('button','chip'+(noticeFilter===val?' on':''));b.type='button';b.textContent=label+(cnt?' \\u00b7 '+cnt:'');b.onclick=function(){noticeFilter=val;renderNoticeFilters();renderNotices()};box.appendChild(b)}" +
  "if(!notices.length)return;mk('All','all',notices.length);Object.keys(NOTICE_TYPES).forEach(function(t){if(counts[t])mk(NOTICE_TYPES[t],t,counts[t])})}" +
  "function fmtDate(s){if(!s)return '';var d=new Date(s.length===10?s+'T12:00:00Z':s);return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}" +
  "function daysUntil(ymd){var t=new Date();var today=Date.UTC(t.getFullYear(),t.getMonth(),t.getDate());var p=ymd.split('-');return Math.round((Date.UTC(+p[0],+p[1]-1,+p[2])-today)/864e5)}" +
  "function renderNotices(){var box=q('notices-list');box.innerHTML='';var list=notices.filter(function(n){return noticeFilter==='all'||n.type===noticeFilter});" +
  "if(!list.length){var pe=elx('p','pempty');pe.textContent=notices.length?'No notices of this type.':'No open notices yet. Post the first one \\u2014 an open call, a partner search, an offer or a question.';box.appendChild(pe)}" +
  "list.forEach(function(n){box.appendChild(noticeCard(n,false))});" +
  "var ml=q('notices-mine-list');ml.innerHTML='';noticesMine.forEach(function(n){ml.appendChild(noticeCard(n,true))});q('notices-mine').hidden=!noticesMine.length}" +
  "function noticeCard(n,off){var card=elx('div','notice'+(n.mine?' mine':'')+(off?' off':''));var top=elx('div','notice-top');" +
  "var ty=elx('span','ntype '+n.type);ty.textContent=NOTICE_TYPES[n.type]||n.type;top.appendChild(ty);" +
  "if(n.deadline){var dl=elx('span','ndead');var d=daysUntil(n.deadline);var when=d<0?'passed':d===0?'today':d===1?'tomorrow':'in '+d+' days';if(d>=0&&d<=7)dl.className+=' soon';dl.textContent='Deadline '+fmtDate(n.deadline)+' \\u00b7 '+when;top.appendChild(dl)}" +
  "card.appendChild(top);var h=document.createElement('h4');h.textContent=n.title;card.appendChild(h);" +
  "var meta=elx('div','nmeta');meta.appendChild(document.createTextNode(n.mine?'You':(n.author.name||n.author.email)));" +
  "if(n.colony){meta.appendChild(document.createTextNode(' \\u00b7 '));var a=document.createElement('a');a.href='https://beyondthecities.org/map.html?colony='+encodeURIComponent(n.colony.id);a.target='_blank';a.rel='noopener';a.textContent=n.colony.name;meta.appendChild(a);if(n.colony.city)meta.appendChild(document.createTextNode(', '+n.colony.city))}" +
  "meta.appendChild(document.createTextNode(' \\u00b7 '+fmtDate(n.created_at)));card.appendChild(meta);" +
  "if(n.body){var b=elx('p','nbody');b.textContent=n.body;card.appendChild(b)}" +
  "var acts=elx('div','nacts');" +
  "if(!n.mine&&!off){var m=document.createElement('a');m.className='btn ghost';m.href='mailto:'+n.author.email+'?subject='+encodeURIComponent('Re: '+n.title);m.textContent='Reply by email';acts.appendChild(m);" +
  "var dg=phoneDigits(n.author.phone);if(dg){var w=document.createElement('a');w.className='btn ghost';w.href='https://wa.me/'+dg+'?text='+encodeURIComponent('Hi, about your notice \\u201c'+n.title+'\\u201d: ');w.target='_blank';w.rel='noopener';w.textContent='WhatsApp';acts.appendChild(w);" +
  "var v=document.createElement('a');v.className='btn ghost';v.href='viber://chat?number=%2B'+dg;v.textContent='Viber';acts.appendChild(v)}}" +
  "if(n.can_edit){var e=btnx(off?'Edit & repost':'Edit');e.onclick=function(){editNotice(n)};acts.appendChild(e)}" +
  "if(n.can_close&&!n.expired){if(n.status==='open'){var c=btnx('Close');c.onclick=function(){setNoticeStatus(n.id,'closed')};acts.appendChild(c)}else{var ro=btnx('Reopen');ro.onclick=function(){setNoticeStatus(n.id,'open')};acts.appendChild(ro)}}" +
  "if(n.can_delete){var del=btnx('Delete');del.onclick=function(){deleteNotice(n.id)};acts.appendChild(del)}" +
  "if(acts.children.length)card.appendChild(acts);" +
  "if(off){var st=elx('div','nstate');st.textContent=n.expired?(n.deadline?'Expired \\u2014 the deadline has passed. Edit it with a new deadline to repost.':'Expired after 90 days. Edit it to repost.'):'Closed';card.appendChild(st)}" +
  "return card}" +
  "function fillNoticeColonies(sel){sel.innerHTML='';var o=document.createElement('option');o.value='';o.textContent='\\u2014 none / general \\u2014';sel.appendChild(o);" +
  "pickerColonies.forEach(function(c){var op=document.createElement('option');op.value=c.id;op.textContent=c.name+(c.place?' \\u00b7 '+c.place:'');sel.appendChild(op)})}" +
  "function noticeContactLine(){var t='Replies come straight to you: other organizers see your email'+(netMe?' ('+netMe.email+')':'')+(netMe&&netMe.phone?' and your phone for WhatsApp / Viber':'')+'. Notices are visible to signed-in organizers only.';q('n-contact').textContent=t}" +
  "function openNoticeEditor(){noticeDirty=false;q('notices-index').style.display='none';q('notice-editor').style.display='block';scrollTo(0,0)}" +
  "function closeNoticeEditor(){q('notice-editor').style.display='none';q('notices-index').style.display='block';editingNotice=null;scrollTo(0,0)}" +
  "function cancelNotice(){if(noticeDirty&&!confirm('Discard unsaved changes?'))return;closeNoticeEditor()}" +
  "function newNotice(){editingNotice=null;q('ne-title').textContent='New notice';q('n-type').value='open_call';q('n-title').value='';q('n-body').value='';q('n-deadline').value='';" +
  "var sel=q('n-colony');fillNoticeColonies(sel);sel.value=pickerColonies.length===1?String(pickerColonies[0].id):'';q('n-status').textContent='';q('n-save').textContent='Post notice';noticeContactLine();openNoticeEditor();q('n-title').focus()}" +
  "function editNotice(n){editingNotice=n.id;q('ne-title').textContent='Edit notice';q('n-type').value=n.type;q('n-title').value=n.title;q('n-body').value=n.body||'';q('n-deadline').value=n.deadline||'';" +
  "var sel=q('n-colony');fillNoticeColonies(sel);sel.value=n.colony_id||'';q('n-status').textContent='';q('n-save').textContent=(n.status!=='open'||n.expired)?'Save & repost':'Save changes';noticeContactLine();openNoticeEditor()}" +
  "async function saveNotice(){var title=q('n-title').value.trim();if(!title){q('n-status').textContent='A title is required';q('n-title').focus();return}q('n-status').textContent='Saving…';" +
  "var body={type:q('n-type').value,title:title,body:q('n-body').value,deadline:q('n-deadline').value,colony_id:q('n-colony').value};" +
  "var r=await fetch(editingNotice?'/api/network/notice/'+editingNotice:'/api/network/notices',{method:editingNotice?'PUT':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});" +
  "var out=await r.json().catch(function(){return{}});if(!r.ok){q('n-status').textContent=out.detail||out.error||('Error '+r.status);return}" +
  "noticeDirty=false;closeNoticeEditor();noticeFilter='all';loadNotices()}" +
  "async function setNoticeStatus(id,status){var r=await fetch('/api/network/notice/'+id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({status:status})});" +
  "var out=await r.json().catch(function(){return{}});if(!r.ok){alert(out.detail||out.error||('Error '+r.status));return}loadNotices()}" +
  "async function deleteNotice(id){if(!confirm('Delete this notice? This cannot be undone.'))return;var r=await fetch('/api/network/notice/'+id,{method:'DELETE'});" +
  "var out=await r.json().catch(function(){return{}});if(!r.ok){alert(out.detail||out.error||('Error '+r.status));return}loadNotices()}" +
  "document.addEventListener('input',function(e){if(e.target&&e.target.closest&&e.target.closest('#notice-editor'))noticeDirty=true});" +
  "function setPostStatus(t){q('p-status').textContent=t}" +
  "async function loadPosts(){var box=q('posts-list');box.innerHTML='<p style=\"opacity:.7\">Loading…</p>';" +
  "var r=await fetch('/api/posts');if(!r.ok){box.innerHTML='<p>Could not load posts</p>';return}" +
  "var data=await r.json();taggable=data.taggable||[];renderPosts(data.posts||[])}" +
  // Post search shows up only once the list gets long.
  "var allPosts=[];var postTerm='';" +
  "function renderPosts(list){allPosts=list;var row=q('posts-search-row');row.hidden=list.length<=8;if(row.hidden){postTerm='';q('posts-search').value='';syncClear('posts-search')}drawPosts()}" +
  "function drawPosts(){var box=q('posts-list');box.innerHTML='';var t=foldSearch(postTerm.trim());" +
  "var list=t?allPosts.filter(function(p){return foldSearch(p.title).indexOf(t)!==-1}):allPosts;" +
  "if(!allPosts.length){box.innerHTML='<p style=\"opacity:.7\">No posts yet.</p>';return}" +
  "if(!list.length){box.innerHTML='<p style=\"opacity:.7\">No posts match.</p>';return}" +
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
  // Word-like editor (Toast UI, WYSIWYG mode). Stored as markdown, so the blog
  // generator and existing posts don't change; "Markdown" tab for those who want it.
  "function initEditor(){if(bodyEditor)return;bodyEditor=new toastui.Editor({el:q('p-body'),height:(innerWidth<640?'380px':'460px'),initialEditType:'wysiwyg',previewStyle:'tab'," +
  "usageStatistics:false,autofocus:false,hideModeSwitch:true,placeholder:'Write your post here\u2026',initialValue:''," +
  "toolbarItems:[['heading','bold','italic'],['link','image'],['ul','ol','quote','hr']]," +
  "hooks:{addImageBlobHook:function(blob,cb){queueBodyImage(blob,cb);return false}}});" +
  "bodyEditor.on('change',function(){if(!bodyLoading)postDirty=true})}var bodyLoading=false;" +
  // Inline images: uploaded one at a time (parallel commits to the same branch conflict).
  "var bodyImgQueue=[];var bodyImgBusy=false;" +
  "function queueBodyImage(file,cb){bodyImgQueue.push({file:file,cb:cb});runBodyImages()}" +
  "async function runBodyImages(){if(bodyImgBusy)return;bodyImgBusy=true;var ok=0;" +
  "while(bodyImgQueue.length){var job=bodyImgQueue.shift();var left=bodyImgQueue.length;" +
  "setPostStatus('Uploading image'+(left?' ('+left+' more queued)':'')+'\u2026');" +
  "try{var blob=await optimizeImage(job.file);var fd=new FormData();fd.append('file',blob,'image.webp');fd.append('kind','inline');fd.append('title',q('p-title').value||'');" +
  "var r=await fetch('/api/upload',{method:'POST',body:fd});var out=await r.json();" +
  "if(!r.ok){setPostStatus('Image upload failed: '+(out.detail||out.error));continue}" +
  "job.cb(out.path,'');ok++" +
  "}catch(e){setPostStatus('Image upload failed \u2014 check your connection')}}" +
  "bodyImgBusy=false;if(ok)setPostStatus('Image'+(ok>1?'s':'')+' inserted \u2713 \u2014 remember to Save post')}" +
  "function getBody(){return bodyEditor?bodyEditor.getMarkdown():''}" +
  "function unwrap(md){var L=String(md||'').split('\\n');var out=[];var BLK=/^\\s*([#>|!]|[-*+]\\s|\\d+[.)]\\s|```|---|___|\\*\\*\\*|<)/;" +
  "for(var i=0;i<L.length;i++){var cur=L[i],prev=out.length?out[out.length-1]:'';" +
  "if(out.length&&prev.trim()&&cur.trim()&&!BLK.test(cur)&&!/^\\s*([#|!]|```)/.test(prev)&&!/  $/.test(prev)&&!/\\\\$/.test(prev)){out[out.length-1]=prev+' '+cur.trim()}else{out.push(cur)}}return out.join('\\n')}" +
  "function setBody(md){initEditor();bodyLoading=true;bodyEditor.setMarkdown(unwrap(md),false);bodyLoading=false;bodyEditor.changeMode('wysiwyg',true)}" +
  "function newPost(){editingSlug=null;postCover='';savedCover='';q('pe-title').textContent='New post';" +
  "['p-title','p-author','p-excerpt','p-tags'].forEach(function(id){q(id).value=''});" +
  "q('p-date').value=new Date().toISOString().slice(0,10);q('p-draft').checked=false;" +
  "postColonies=(document.body.dataset.role!=='admin'?taggable.map(function(c){return String(c.id)}):[]);renderPostColonies();" +
  "setCoverPreview('');setPostStatus('');q('p-cover-file').value='';q('p-cover-status').textContent='';q('posts-status').textContent='';" +
  "postGallery=[];q('pg-status').textContent='';renderGallery();" +
  "q('pe-delete').style.display='none';q('post-editor').style.display='block';setBody('');openPostEditor()}" +
  "async function editPost(slug){setPostStatus('');var r=await fetch('/api/post/'+slug);var out=await r.json();" +
  "if(!r.ok){alert('Could not open: '+(out.error||r.status));return}var p=out.post;editingSlug=slug;postCover=p.cover||'';savedCover=p.cover||'';" +
  "q('pe-title').textContent='Edit post';q('p-title').value=p.title;q('p-date').value=p.date;q('p-author').value=p.author;" +
  "q('p-excerpt').value=p.excerpt;q('p-tags').value=(p.tags||[]).join(', ');postColonies=(p.colonies||[]).map(String);renderPostColonies();" +
  "q('p-draft').checked=!!p.draft;setCoverPreview(postCover);q('p-cover-file').value='';q('p-cover-status').textContent='';" +
  "postGallery=realList(p.gallery);q('pg-status').textContent='';renderGallery();" +
  "q('pe-delete').style.display='';q('post-editor').style.display='block';setBody(p.body||'');openPostEditor()}" +
  "async function uploadCover(){var f=q('p-cover-file').files[0];if(!f){q('p-cover-status').textContent='Choose an image first';return}" +
  "q('p-cover-preview').src=URL.createObjectURL(f);q('p-cover-status').textContent='Optimising…';var blob=await optimizeImage(f);" +
  "q('p-cover-status').textContent='Uploading…';var fd=new FormData();fd.append('file',blob,'cover.webp');fd.append('title',q('p-title').value||'');" +
  "if(postCover&&postCover!==savedCover&&postCover.indexOf('/assets/images/blog/')===0)fd.append('replace',postCover);" +
  "var r=await fetch('/api/upload',{method:'POST',body:fd});var out=await r.json();" +
  "if(!r.ok){q('p-cover-status').textContent='Upload failed: '+(out.detail||out.error);return}" +
  "postCover=out.path;q('p-cover-status').textContent='Cover uploaded \\u2713'}" +
  "async function savePost(){var title=q('p-title').value.trim();if(!title){setPostStatus('Title is required');return}" +
  "var slug=editingSlug||slugify(title);if(!slug){setPostStatus('Could not build a slug from the title');return}" +
  "var body={title:title,date:q('p-date').value||'',author:q('p-author').value,excerpt:q('p-excerpt').value,cover:postCover,gallery:postGallery.slice(),body:getBody(),draft:q('p-draft').checked," +
  "tags:q('p-tags').value.split(',').map(function(s){return s.trim()}).filter(Boolean)," +
  "colonies:postColonies.slice()};" +
  "if(galleryBusy||bodyImgBusy){setPostStatus('Wait for the uploads to finish');return}" +
  "setPostStatus('Saving…');var r=await fetch('/api/post/'+slug,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});" +
  "var out=await r.json();if(!r.ok){setPostStatus('Save failed: '+(out.detail||out.error));return}" +
  "postDirty=false;closePostEditor();" +
  "q('posts-status').textContent='Saved \\u2713 commit '+String(out.commit||'').slice(0,7)+' · live in ~1–2 min';loadPosts()}" +
  "async function deletePost(slug){var s=slug||editingSlug;if(!s)return;if(!confirm('Delete this post?'))return;" +
  "var r=await fetch('/api/post/'+s,{method:'DELETE'});var out=await r.json();" +
  "if(!r.ok){alert('Delete failed: '+(out.detail||out.error));return}" +
  "if(editingSlug===s){postDirty=false;closePostEditor()}q('posts-status').textContent='Post deleted \\u2713';loadPosts()}" +
  "function openPostEditor(){postDirty=false;q('posts-index').style.display='none';q('post-editor').style.display='block';scrollTo(0,0)}" +
  "function closePostEditor(){q('post-editor').style.display='none';q('posts-index').style.display='block';editingSlug=null;scrollTo(0,0)}" +
  "function cancelPost(){if(postDirty&&!confirm('Discard unsaved changes?'))return;postDirty=false;closePostEditor()}" +
  // --- access (admin only) ---
  "var accessState={admins:[],organizers:{}};var allColonies=[];var accessOwners=[];var isOwner=false;" +
  "function elx(tag,cls){var e=document.createElement(tag);if(cls)e.className=cls;return e}" +
  "function btnx(txt){var b=elx('button','btn ghost');b.type='button';b.textContent=txt;return b}" +
  "function setAccessStatus(t){q('access-status').textContent=t}" +
  "function colonyName(id){var c=allColonies.filter(function(x){return String(x.id)===String(id)})[0];return c?c.name:('#'+id)}" +
  "async function loadAccessPanel(){setAccessStatus('');var r=await fetch('/api/access');if(!r.ok){setAccessStatus('Could not load');return}" +
  "var d=await r.json();accessState={admins:(d.access.admins||[]).slice(),organizers:JSON.parse(JSON.stringify(d.access.organizers||{}))};" +
  "allColonies=d.colonies||[];accessOwners=d.owners||[];isOwner=!!d.isOwner;renderAccess();" +
  "if(q('community-url')){q('community-url').value=(d.community&&d.community.url)||'';q('community-label').value=(d.community&&d.community.label)||''}}" +
  "async function saveCommunity(){var st=q('community-status');st.textContent='Saving…';" +
  "var r=await fetch('/api/network/community',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({url:q('community-url').value,label:q('community-label').value})});" +
  "var out=await r.json().catch(function(){return{}});if(!r.ok){st.textContent='Save failed: '+(out.detail||out.error||r.status);return}st.textContent='Saved \u2713';dirPeople=null}" +
  "function renderAccess(){renderAdmins();renderOrgs()}" +
  "function renderAdmins(){var box=q('admins-list');box.innerHTML='';" +
  "accessOwners.forEach(function(email){var row=elx('div','acc-row');var s=elx('span');s.style.fontWeight='600';s.textContent=email+' ';" +
  "var b=elx('span','role owner');b.textContent='maintainer';b.style.marginLeft='6px';s.appendChild(b);row.appendChild(s);box.appendChild(row)});" +
  "accessState.admins.forEach(function(email){var row=elx('div','acc-row');var s=elx('span');s.style.fontWeight='600';s.textContent=email+' ';" +
  "var b=elx('span','role admin');b.textContent='admin';b.style.marginLeft='6px';s.appendChild(b);row.appendChild(s);" +
  "if(isOwner){var rm=btnx('Remove');rm.onclick=function(){removeAdmin(email)};row.appendChild(rm)}box.appendChild(row)});" +
  "var addRow=q('add-admin-row');if(addRow)addRow.style.display=isOwner?'flex':'none'}" +
  "function renderOrgs(){var box=q('orgs-list');box.innerHTML='';Object.keys(accessState.organizers).forEach(function(email){" +
  "var ids=accessState.organizers[email]||[];var row=elx('div','acc-row acc-org');" +
  "var head=elx('div','acc-org-head');var s=elx('span');s.style.fontWeight='600';s.textContent=email+' ';" +
  "var b=elx('span','role organizer');b.textContent='organizer';b.style.marginLeft='6px';s.appendChild(b);" +
  "var rm=btnx('Remove');rm.onclick=function(){removeOrganizer(email)};head.appendChild(s);head.appendChild(rm);" +
  "var chips=elx('div','chips');ids.forEach(function(id){var c=elx('span','chip');c.textContent=colonyName(id)+'  \\u00d7';c.style.cursor='pointer';c.onclick=function(){removeColonyFromOrg(email,id)};chips.appendChild(c)});" +
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
      networkDb: Boolean(env.NETWORK),
      resendApiKey: Boolean(env.RESEND_API_KEY),
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

const GOOGLE_G = `<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

// Sign-in and error pages (no session).
function htmlPage(title, inner, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="format-detection" content="telephone=no,email=no,address=no"/>
<title>${escapeHtml(title)} · Beyond the Cities Studio</title>
<link rel="icon" type="image/svg+xml" href="https://beyondthecities.org/favicon.svg"/>
<link rel="stylesheet" href="https://beyondthecities.org/fonts.css"/>
<style>
  *{box-sizing:border-box}
  body{font-family:'Montserrat',system-ui,sans-serif;background:#f1f1ee;color:#1c1c1c;margin:0;
       min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 16px}
  .wrap{width:100%;max-width:420px}
  .brand{display:flex;flex-direction:column;align-items:center;gap:12px;margin-bottom:22px;text-decoration:none;color:#1c1c1c}
  .brand .bar-mark{width:30px;height:49px}
  .brand-row{display:flex;align-items:center;gap:10px}
  .bar-name{font-weight:900;font-size:15px;letter-spacing:.05em;text-transform:uppercase}.bar-name em{font-weight:400;font-style:normal}
  .bar-tag{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#ff4326;border:1.5px solid #ff4326;border-radius:999px;padding:2px 8px;line-height:1.4}
  .card{background:#fff;border:1px solid rgba(28,28,28,.12);border-radius:20px;padding:30px 28px;box-shadow:0 14px 40px rgba(28,28,28,.10)}
  h1{font-size:23px;font-weight:800;margin:0 0 8px;color:#000;letter-spacing:-.01em}
  p{line-height:1.6;margin:0 0 12px;font-size:15px}
  .lead{color:#4a4a4a;margin-bottom:22px}
  a{color:#1c1c1c}
  .btn-google{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;background:#fff;color:#1c1c1c;text-decoration:none;
       border:1.5px solid rgba(28,28,28,.25);padding:13px 18px;border-radius:999px;font-weight:700;font-size:15px;transition:border-color .15s,box-shadow .15s}
  .btn-google:hover{border-color:#ff4326;box-shadow:0 4px 14px rgba(255,67,38,.15)}
  .btn-google .g{display:grid;place-items:center}
  .note{margin:18px 0 0;font-size:12.5px;color:#6b6b6b;line-height:1.5}
  .btn{display:inline-block;background:#ff4326;color:#fff;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:700;margin-top:6px}
  .foot{text-align:center;margin-top:22px;font-size:12.5px;color:#6b6b6b}
  .foot a{font-weight:700;color:#1c1c1c;text-decoration:none}.foot a:hover{color:#ff4326}
  .foot p{font-size:12px;margin:10px 0 0}
  a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
  @media (max-width:480px){.card{padding:26px 20px;border-radius:18px}h1{font-size:21px}}
</style></head><body><main class="wrap">
<a class="brand" href="https://beyondthecities.org/" aria-label="Beyond the Cities">${LOGO_SVG}<span class="brand-row"><span class="bar-name">Beyond <em>the</em> Cities</span><span class="bar-tag">Studio</span></span></a>
<div class="card"><h1>${escapeHtml(title)}</h1>${inner}</div>
<div class="foot"><a href="https://beyondthecities.org/">\u2190 Back to site</a><p>A Goethe-Institut project \u00b7 2026\u20132028</p></div>
</main></body></html>`;
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
