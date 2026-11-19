// Beyond the Cities · Studio — Worker entry.
// M0 scaffold + M1 auth: Google OAuth (code flow) → signed session cookie →
// allowlist lookup (KV) → /api/me. Read/write APIs (M2/M3) and the editor UI
// (M4) slot in later.

import UI_CSS from "./ui.css";
import UI_JS from "./ui.client.js";
import ICONS from "./icons.svg";
import { renderStudio } from "./page.js";
import { loginMail, inviteMail, sendMail, sendMailBatch } from "./mail.js";

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
      if (pathname === "/auth/email") return authEmailRequest(request, env, origin);
      if (pathname === "/auth/email/link") return authEmailLink(request, env, origin);
      if (pathname === "/auth/email/code") return authEmailCode(request, env, origin);
      if (pathname === "/api/me") return apiMe(request, env);
      if (pathname === "/api/network/me") {
        if (request.method === "GET") return apiNetworkMe(request, env);
        if (request.method === "PUT") return apiNetworkMePut(request, env);
        return json({ error: "method_not_allowed" }, 405);
      }
      if (pathname === "/api/network/directory") return apiNetworkDirectory(request, env);
      if (pathname === "/api/network/community" && request.method === "PUT") return apiNetworkCommunityPut(request, env);
      if (pathname === "/api/network/invite/preview") return apiInvitePreview(request, env);
      if (pathname === "/api/network/invite" && request.method === "POST") return apiInviteSend(request, env);
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

  return startSession(env, origin, claims.email, claims.name || "", [cookie(STATE_COOKIE, "", { maxAge: 0 })]);
}

// Shared by Google and email sign-in: the address is verified by now; check the
// allowlist, sign the session cookie and refresh the profile row.
async function startSession(env, origin, email, googleName, extraCookies = []) {
  const access = await loadAccess(env);
  const resolved = resolveRole(access, email, ownerEmails(env));
  if (!resolved) {
    return page(
      403,
      "Access is invite-only",
      `Signed in as <b>${escapeHtml(email)}</b>, but this address isn't on the access list yet. Ask the project team to add you.`,
      origin,
    );
  }

  // Network: remember who signed in (display name for the directory).
  await touchProfile(env, email, googleName);
  let name = googleName;
  if (!name && env.NETWORK) {
    try {
      const row = await env.NETWORK.prepare("SELECT name, google_name FROM profiles WHERE email = ?1").bind(profileKey(email)).first();
      if (row) name = row.name || row.google_name || "";
    } catch { /* name is cosmetic */ }
  }

  const session = {
    email,
    name: name || "",
    role: resolved.role,
    owner: !!resolved.owner,
    colonies: resolved.colonies,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const token = await signSession(env, session);

  const headers = new Headers({ Location: `${origin}/` });
  headers.append("Set-Cookie", cookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL_MS / 1000 }));
  for (const c of extraCookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

// --- auth: email link / code ---------------------------------------------------
// For organizers without a Google account: type any address, get a one-time
// link (and a 6-digit code for when mail is read on another device). Only
// hashes are stored (D1 `login_tokens`, strongly consistent, so a link opened
// a second after it was sent still works). The link page asks for a click
// before signing in, because mail scanners prefetch links and would otherwise
// burn the one-time token.
const LOGIN_TTL_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5; // wrong codes per link
const LOGIN_PER_EMAIL_HOUR = 5;
const LOGIN_PER_IP_HOUR = 20;
const EMAIL_RE = /^[^\s@<>()",;]{1,64}@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/;

function isDevOrigin(origin) {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

// Cross-site form posts are refused (login CSRF). Browsers send Origin on POST.
function sameOrigin(request, origin) {
  const o = request.headers.get("Origin");
  return !o || o === origin;
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sixDigitCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, "0");
}

async function authEmailRequest(request, env, origin) {
  if (request.method !== "POST") return Response.redirect(`${origin}/`, 302);
  if (!sameOrigin(request, origin)) return page(403, "Sign-in failed", "This request did not come from the Studio sign-in page.");
  if (!mailEnabled(env, origin)) return page(503, "Email sign-in unavailable", "Email sign-in is not set up yet. Please use Google, or contact the project team.");
  const form = await request.formData();
  const email = profileKey(form.get("email"));
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return signInPage({ email, error: "That doesn't look like an email address. Please check it and try again." }, 400);
  }

  const now = Date.now();
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const db = env.NETWORK;
  await db.prepare("DELETE FROM login_tokens WHERE created_at < ?1").bind(now - 24 * 3600 * 1000).run();
  const hourAgo = now - 3600 * 1000;
  const perEmail = await db.prepare("SELECT COUNT(*) AS n FROM login_tokens WHERE email = ?1 AND created_at > ?2").bind(email, hourAgo).first();
  const perIp = ip ? await db.prepare("SELECT COUNT(*) AS n FROM login_tokens WHERE ip = ?1 AND created_at > ?2").bind(ip, hourAgo).first() : { n: 0 };
  if ((perEmail && perEmail.n >= LOGIN_PER_EMAIL_HOUR) || (perIp && perIp.n >= LOGIN_PER_IP_HOUR)) {
    return signInPage({ email, error: "Too many sign-in emails were requested. Please wait an hour, or use the code from an email you already received." }, 429);
  }

  // Only addresses on the allowlist get mail.
  const access = await loadAccess(env);
  if (resolveRole(access, email, ownerEmails(env))) {
    const token = randomToken();
    const id = await sha256Hex(token);
    const code = sixDigitCode();
    const codeHash = await hmac(env.SESSION_SECRET, `${id}:${code}`);
    await db.prepare(
      "INSERT INTO login_tokens (id, email, code_hash, ip, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    ).bind(id, email, codeHash, ip, now, now + LOGIN_TTL_MS).run();

    const link = `${origin}/auth/email/link?t=${encodeURIComponent(token)}`;
    const sent = await sendMail(env, { to: email, ...loginMail({ link, code }) });
    if (!sent.ok) {
      if (isDevOrigin(origin)) {
        console.log(`[dev] sign-in for ${email}: code ${code} · ${link}`);
      } else {
        console.error("login mail failed:", sent.detail);
        await db.prepare("DELETE FROM login_tokens WHERE id = ?1").bind(id).run();
        return signInPage({ email, error: "We couldn't send the email right now. Please try again in a few minutes, or use Google." }, 502);
      }
    }
    return codePage(email);
  }
  // Not on the allowlist: say so plainly (organizer emails are public on the
  // site anyway, and a silent page left people waiting for mail that never
  // came). The row still counts toward the per-IP limit, so probing stays slow.
  await db.prepare(
    "INSERT INTO login_tokens (id, email, code_hash, ip, created_at, expires_at, used_at) VALUES (?1, ?2, '', ?3, ?4, ?4, ?4)",
  ).bind(await sha256Hex(randomToken()), email, ip, now).run();
  return signInPage({
    email,
    errorHtml: `<b>${escapeHtml(email)}</b> has no Studio access. Check the address for a typo, or use the one the project team invited. Need access? Write to <a href="mailto:${escapeHtml(env.MAIL_REPLY_TO || "beyondthecitiesadm@gmail.com")}">${escapeHtml(env.MAIL_REPLY_TO || "beyondthecitiesadm@gmail.com")}</a>.`,
  });
}

// GET: show a confirm button (mail scanners only GET). POST: sign in.
async function authEmailLink(request, env, origin) {
  if (!env.NETWORK) return page(503, "Email sign-in unavailable", "Email sign-in is not set up yet.");
  const now = Date.now();
  if (request.method === "GET") {
    const token = new URL(request.url).searchParams.get("t") || "";
    const row = token
      ? await env.NETWORK.prepare("SELECT email FROM login_tokens WHERE id = ?1 AND used_at IS NULL AND expires_at > ?2").bind(await sha256Hex(token), now).first()
      : null;
    if (!row) return expiredPage();
    return htmlPage(
      "Sign in to Studio",
      `<p class="lead">Continue as <b>${escapeHtml(row.email)}</b>.</p>
       <form method="post" action="/auth/email/link"><input type="hidden" name="t" value="${escapeHtml(token)}"/>
       <button class="btn-main" type="submit">Sign in</button></form>
       <p class="note">Not you? Just close this page.</p>`,
    );
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!sameOrigin(request, origin)) return page(403, "Sign-in failed", "This request did not come from the Studio sign-in page.");
  const form = await request.formData();
  const token = String(form.get("t") || "");
  if (!token) return expiredPage();
  const row = await env.NETWORK.prepare(
    "UPDATE login_tokens SET used_at = ?2 WHERE id = ?1 AND used_at IS NULL AND expires_at > ?2 AND code_hash <> '' RETURNING email",
  ).bind(await sha256Hex(token), now).first();
  if (!row) return expiredPage();
  return finishEmailLogin(env, origin, row.email, now);
}

async function authEmailCode(request, env, origin) {
  if (request.method !== "POST") return Response.redirect(`${origin}/`, 302);
  if (!sameOrigin(request, origin)) return page(403, "Sign-in failed", "This request did not come from the Studio sign-in page.");
  if (!env.NETWORK) return page(503, "Email sign-in unavailable", "Email sign-in is not set up yet.");
  const form = await request.formData();
  const email = profileKey(form.get("email"));
  const code = String(form.get("code") || "").replace(/\D/g, "");
  const now = Date.now();
  const row = await env.NETWORK.prepare(
    "SELECT id, code_hash, attempts FROM login_tokens WHERE email = ?1 AND used_at IS NULL AND expires_at > ?2 AND code_hash <> '' ORDER BY created_at DESC LIMIT 1",
  ).bind(email, now).first();
  if (!row) return codePage(email, "This code has expired or was already used. Request a new email below.", 400);
  if (row.attempts >= LOGIN_MAX_ATTEMPTS) return codePage(email, "Too many wrong codes. Request a new email below.", 429);
  const expected = await hmac(env.SESSION_SECRET, `${row.id}:${code}`);
  if (code.length !== 6 || !timingSafeEqual(expected, row.code_hash)) {
    await env.NETWORK.prepare("UPDATE login_tokens SET attempts = attempts + 1 WHERE id = ?1").bind(row.id).run();
    const left = LOGIN_MAX_ATTEMPTS - row.attempts - 1;
    return codePage(email, left > 0 ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong codes. Request a new email below.", 400);
  }
  const used = await env.NETWORK.prepare("UPDATE login_tokens SET used_at = ?2 WHERE id = ?1 AND used_at IS NULL RETURNING email").bind(row.id, now).first();
  if (!used) return codePage(email, "This code was already used. Request a new email below.", 400);
  return finishEmailLogin(env, origin, used.email, now);
}

async function finishEmailLogin(env, origin, email, now) {
  // One sign-in burns every other open link for this address.
  await env.NETWORK.prepare("UPDATE login_tokens SET used_at = ?2 WHERE email = ?1 AND used_at IS NULL").bind(email, now).run();
  return startSession(env, origin, email, "");
}

function codePage(email, error = "", status = 200) {
  return htmlPage(
    "Check your email",
    `<p class="lead">We sent a sign-in link and a 6-digit code to <b>${escapeHtml(email)}</b>. Open the link, or type the code here.</p>
     ${error ? `<p class="err" role="alert">${escapeHtml(error)}</p>` : ""}
     <form method="post" action="/auth/email/code" class="stack">
       <input type="hidden" name="email" value="${escapeHtml(email)}"/>
       <label class="lbl" for="code">Sign-in code</label>
       <input class="field code" id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]*" maxlength="7" placeholder="123456" required autofocus/>
       <button class="btn-main" type="submit">Sign in</button>
     </form>
     <form method="post" action="/auth/email" class="resend"><input type="hidden" name="email" value="${escapeHtml(email)}"/><button type="submit" class="linkish">Send a new email</button> · <a href="/">Use another address</a></form>
     <p class="note">The code is valid for 15 minutes. Nothing arrived after a minute or two? Check your spam folder, then use "Send a new email".</p>`,
    status,
  );
}

function expiredPage() {
  return htmlPage(
    "Link expired",
    `<p>This sign-in link has expired or was already used. Links work once and for 15 minutes.</p>
     <a class="btn" href="/">Back to sign-in</a>`,
    400,
  );
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
      const photos = realPhotos(c.photos);
      all.push({
        id: c.id,
        name: c.art_colony_name,
        country: c.country,
        place: [...new Set(place)].join(" · "),
        photo: photos[0] || "",
        photos: photos.length,
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
      author: data.author || "",
      cover: data.cover || "",
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
        "ON CONFLICT(email) DO UPDATE SET google_name = CASE WHEN ?2 <> '' THEN ?2 ELSE google_name END, last_login = ?3",
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
// --- network: invitation emails (admin) -------------------------------------
// Branded "you have access" mail (studio/src/mail.js) for people on the
// allowlist. Sent only when an admin presses the button; KV `invites` keeps
// {email: last sent ISO} so the directory can show "Invited 19 Nov".
const DEMO_EMAIL_RE = /@demo\.beyondthecities\.org$/i;
const INVITE_MAX = 50; // per request (Resend free tier: 100 mails/day)

async function loadInvites(env) {
  try { return JSON.parse((await env.ACCESS.get("invites")) || "{}") || {}; } catch { return {}; }
}

// The invitation for one allowlisted address, or null if it isn't on the list.
async function buildInvite(env, email, access, colonies) {
  const key = profileKey(email);
  const resolved = resolveRole(access, key, ownerEmails(env));
  if (!resolved) return null;
  const ids = resolved.colonies === "all" ? [] : resolved.colonies;
  const names = ids.map((id) => (colonies.find((c) => c.id === id) || {}).name).filter(Boolean);
  let name = "";
  if (env.NETWORK) {
    try {
      const row = await env.NETWORK.prepare("SELECT name, google_name FROM profiles WHERE email = ?1").bind(key).first();
      if (row) name = row.name || row.google_name || "";
    } catch { /* cosmetic */ }
  }
  return { to: key, ...inviteMail({ email: key, name, colonies: names, studioUrl: (env.STUDIO_URL || "https://studio.beyondthecities.org").replace(/\/+$/, "") }) };
}

// GET ?email=…[&format=text] → the exact email that would be sent (no sending).
async function apiInvitePreview(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  if (session.role !== "admin") return json({ error: "forbidden" }, 403);
  const url = new URL(request.url);
  const [access, colonies] = await Promise.all([loadAccess(env), listAllColonies(env)]);
  const m = await buildInvite(env, url.searchParams.get("email") || session.email, access, colonies);
  if (!m) return json({ error: "not_on_access_list" }, 404);
  if (url.searchParams.get("format") === "text") {
    return new Response(`Subject: ${m.subject}\n\n${m.text}`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  return new Response(m.html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

// POST { emails: [...] } → sends one invitation per address (batch).
async function apiInviteSend(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  if (session.role !== "admin") return json({ error: "forbidden" }, 403);
  if (!env.RESEND_API_KEY) return json({ error: "mail_unavailable", detail: "RESEND_API_KEY is not set." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const emails = [...new Set((Array.isArray(body.emails) ? body.emails : []).map(profileKey).filter(Boolean))];
  if (!emails.length) return json({ error: "no_recipients" }, 400);
  if (emails.length > INVITE_MAX) return json({ error: "too_many", detail: `At most ${INVITE_MAX} invitations at a time.` }, 400);

  const [access, colonies] = await Promise.all([loadAccess(env), listAllColonies(env)]);

  // { test: true }: the invitation for emails[0], sent to the admin only, not recorded.
  if (body.test) {
    const m = await buildInvite(env, emails[0], access, colonies);
    if (!m) return json({ error: "not_on_access_list" }, 404);
    const res = await sendMail(env, { ...m, to: profileKey(session.email), subject: `[Test] ${m.subject}` });
    if (!res.ok) { console.error("invite test failed:", res.detail); return json({ error: "send_failed", detail: "The mail service refused the request." }, 502); }
    return json({ sent: 1, test: true, to: profileKey(session.email) });
  }

  const messages = [], skipped = [];
  for (const e of emails) {
    if (DEMO_EMAIL_RE.test(e)) { skipped.push({ email: e, reason: "demo account" }); continue; }
    const m = await buildInvite(env, e, access, colonies);
    if (!m) { skipped.push({ email: e, reason: "not on the access list" }); continue; }
    messages.push(m);
  }
  if (!messages.length) return json({ sent: 0, skipped });
  const res = await sendMailBatch(env, messages);
  if (!res.ok) {
    console.error("invite batch failed:", res.detail);
    return json({ error: "send_failed", detail: "The mail service refused the request. Nothing was sent." }, 502);
  }
  const invites = await loadInvites(env);
  const now = nowIso();
  for (const m of messages) invites[m.to] = now;
  await env.ACCESS.put("invites", JSON.stringify(invites));
  return json({ sent: messages.length, skipped, invited_at: now });
}

async function apiNetworkDirectory(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: "unauthenticated" }, 401);
  if (!env.NETWORK) return json({ error: "network_unavailable" }, 503);
  const isAdmin = session.role === "admin";
  const me = profileKey(session.email);

  const [access, colonies, community, invites] = await Promise.all([loadAccess(env), listAllColonies(env), loadCommunity(env), isAdmin ? loadInvites(env) : {}]);
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
    // Invited but never signed in: only admins see them ("Invited, not signed in yet").
    if (!isAdmin && email !== me && !row) continue;
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
      invited_at: isAdmin ? invites[email] || null : undefined,
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
  if (!session) return signInPage({ mail: mailEnabled(env, new URL(request.url).origin) });
  return editorPage(session, env);
}

// Email sign-in shows once mail can actually go out (always in local dev,
// where the link is printed to the console instead).
function mailEnabled(env, origin) {
  return Boolean(env.NETWORK) && (Boolean(env.RESEND_API_KEY) || isDevOrigin(origin));
}

function signInPage({ email = "", error = "", errorHtml = "", mail = true } = {}, status = 200) {
  const emailForm = mail
    ? `<div class="or"><span>or sign in with any email</span></div>
     ${error || errorHtml ? `<p class="err" role="alert">${errorHtml || escapeHtml(error)}</p>` : ""}
     <form method="post" action="/auth/email" class="stack">
       <label class="lbl" for="email">Your email address</label>
       <input class="field" id="email" name="email" type="email" autocomplete="email" inputmode="email" value="${escapeHtml(email)}" placeholder="name@example.com" required/>
       <button class="btn-main" type="submit">Email me a sign-in link</button>
     </form>`
    : "";
  return htmlPage(
    "Sign in to Studio",
    `<p class="lead">Manage your colony's page, photos and news on Beyond the Cities.</p>
     <a class="btn-google" href="/auth/google"><span class="g">${GOOGLE_G}</span>Continue with Google</a>
     ${emailForm}
     <p class="note">Access is for invited colony organisers. Use the address the project team invited. Need an account? Contact the Beyond the Cities team.</p>`,
    status,
  );
}

// Signed-in Studio shell. Markup: page.js; styles: ui.css; behaviour: ui.client.js
// (both imported as text so the page is one self-contained response).
function editorPage(session, env) {
  const html = renderStudio({
    session,
    env,
    css: UI_CSS,
    js: UI_JS,
    icons: ICONS,
    logo: LOGO_SVG,
    disciplines: DISCIPLINES,
    limits: {
      photos: MAX_COLONY_PHOTOS,
      gallery: MAX_POST_GALLERY,
      noticeTitle: NOTICE_LIMITS.title,
      noticeBody: NOTICE_LIMITS.body,
      profileName: PROFILE_LIMITS.name,
      profilePhone: PROFILE_LIMITS.phone,
      profileAbout: PROFILE_LIMITS.about,
    },
    escapeHtml,
  });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

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
  .or{display:flex;align-items:center;gap:12px;margin:22px 0 16px;font-size:12.5px;color:#6b6b6b}
  .or::before,.or::after{content:"";flex:1;height:1px;background:rgba(28,28,28,.14)}
  .stack{display:flex;flex-direction:column;gap:8px;margin:0}
  .lbl{font-size:13px;font-weight:700}
  .field{font:inherit;font-size:16px;width:100%;padding:12px 16px;border:1.5px solid rgba(28,28,28,.25);border-radius:12px;background:#fff;color:#1c1c1c}
  .field:focus{outline:none;border-color:#ff4326;box-shadow:0 0 0 3px rgba(255,67,38,.15)}
  .field.code{font-size:24px;font-weight:800;letter-spacing:.25em;text-align:center}
  .field.code::placeholder{color:#cfcfca;font-weight:600}
  .btn-main{font:inherit;font-weight:700;font-size:15px;width:100%;margin-top:6px;background:#ff4326;color:#fff;border:0;border-radius:999px;padding:13px 18px;cursor:pointer}
  .btn-main:hover{background:#e63a1f}
  .err{background:#fff1ee;border:1px solid rgba(255,67,38,.35);color:#a32411;border-radius:12px;padding:10px 14px;font-size:14px}
  .err a{color:#a32411;font-weight:700}
  .resend{margin:16px 0 0;font-size:13.5px;color:#6b6b6b}
  .linkish{font:inherit;background:none;border:0;padding:0;color:#1c1c1c;text-decoration:underline;cursor:pointer}
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
