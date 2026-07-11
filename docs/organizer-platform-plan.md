# Organizer Platform — design (draft)

A login-required editing layer so **colony organizers** can maintain their own
colony's data **and** write blog posts for it, while **1–2 project admins** can
edit everything. No maintainer moderation (logged-in = trusted). The public
site stays **100% static** — this is an editing layer, not a runtime backend.

> Planned as a separate concern from the map (see CLAUDE.md). Lives in its own
> Cloudflare Worker; the public map/blog keep their zero-backend guarantee.

## Core idea: edits are commits

The editor never serves the site. On **Save**, the Worker commits the changed
files to the GitHub repo via the GitHub API → Cloudflare Pages rebuilds → the
existing generators (`gen-colonies.mjs`, `gen-blog.mjs`) produce the static
pages → live. **The repo stays the single source of truth.**

```
Organizer → Studio (Worker, Google login) → commit JSON/MD to repo
          → Cloudflare Pages build (gen-colonies + gen-blog) → static site
```

Consequence: **D1 is not needed for content.** Content stays in the repo. A tiny
store is only needed for *who-can-edit-what* — and even that can start as a repo
file (Phase A), moving to D1 later if it grows.

## Auth

- **Google OAuth 2.0**, handled by the Worker. On callback: verify Google ID
  token → look up email in the allowlist → issue a **signed session cookie**
  (HMAC/JWT, HttpOnly + Secure + SameSite=Lax). No session database.
- **Allowlist** (`access/access.json`, in repo **root** so it's never part of the
  built/public site; Worker reads it via GitHub API):

```json
{
  "admins": ["you@gmail.com", "coordinator@gmail.com"],
  "organizers": {
    "organizer1@gmail.com": [12, 47],
    "organizer2@gmail.com": [5]
  }
}
```

  Colony ids match the `id` field in `public/data/colonies-*.json`.

## Roles & permissions

| Role | Can edit |
|------|----------|
| `admin` | all colonies, all blog posts, the allowlist |
| `organizer` | only their assigned colony/colonies (data + that colony's posts) |

Every write carries a `colony_id`; the Worker asserts
`role === "admin" || colony_id ∈ user.colonies`. A blog post's front-matter
`colonies:` is forced to the allowed set (an organizer can't tag someone else's
colony).

## Worker API (sketch)

```
GET  /studio                → editor SPA (or login if no session)
GET  /auth/google           → redirect to Google
GET  /auth/callback         → verify, set cookie, redirect
POST /auth/logout
GET  /api/me                → { email, role, colonies }

GET  /api/colony/:id        → colony object (from repo)
PUT  /api/colony/:id        → perms → patch country JSON → commit

GET  /api/posts?colony=:id  → that colony's posts
PUT  /api/post/:slug        → create/update public/data/blog/<slug>.md
DELETE /api/post/:slug
```

## Commit mechanics

- Worker holds a **fine-grained GitHub token** (contents:write on this repo) as a
  Worker secret — never sent to the client.
- **Colony data:** each colony is an item (keyed by `id`) inside a country file
  (`colonies-serbia.json`, …). GET file (content + sha) → replace the matching
  object → PUT with `sha`. Retry on 409 (concurrent edit).
- **Blog:** write/delete `public/data/blog/<slug>.md` (front-matter + body).
- **Images:** cover uploads committed to `public/assets/images/blog/` (base64 via
  GitHub API), same as Sveltia does. Fine for low volume; swap to R2 later.
- Commit message: `edit: <what> (studio, <email>)` — full audit trail in git.

## Editor UI (minimal, vanilla JS to match the project)

- **Organizer:** sees only their colony/colonies. Per colony → "Details" form
  (same fields as the Sveltia colony schema) + "Posts" list (new/edit: title,
  date, cover, markdown body).
- **Admin:** colony picker (all) + same forms + an "Access" screen to edit the
  allowlist.
- Served by the Worker (or a Pages route) as a tiny static SPA. No framework.

## Where it lives

Recommended: a `studio/` folder in **this repo** (convenient — commits to the same
repo, shares the colony schema and the generators) but deployed as an
**independent Worker**, not part of the Vite/map build. (Alternative: a separate
repo for stronger isolation — more overhead, deferred.)

## Security notes

- GitHub token + Google client secret: Worker secrets only.
- Signed, HttpOnly session cookie; short-ish expiry + refresh.
- Validate/escape all input; enforce the `colonies` scope on every write.
- Rate-limit writes. Allowlist edits: admin only.

## Phasing

- **Phase A (MVP):** Google login · repo-file allowlist · edit blog posts (scoped)
  + colony data · commit-to-repo. **No D1.** Delivers the whole ask for a handful
  of users.
- **Phase B:** move allowlist (and optionally content) to **D1** · admin UI for
  access · drafts/preview.
- **Phase C:** fold in the **forum** (the other planned deliverable) behind the
  same Google auth.

## Sveltia CMS — relationship

Not a prerequisite and largely redundant with the `admin` role here (both just
commit to the repo, so they coexist safely). Keep Sveltia as an optional
maintainer tool for bulk-editing all colonies; set up its auth only if/when you
want it. Don't block this platform on it.

---

# Phase A — task breakdown

Goal of Phase A: Google login · scoped editing of a colony's data + its blog
posts · admin who can edit everything · edits commit to the repo · **no D1**.
Public site stays static.

## Decisions to lock before coding

1. **Allowlist storage** — plan originally said `access/access.json` in the repo,
   but this repo is **public**, so organizer emails would be exposed. **Use
   Cloudflare KV** for the allowlist instead (still free, still "no D1", emails
   stay private). Content (colony JSON + blog MD) still lives in the repo.
2. **Origin/hosting** — serve UI **and** API from **one Worker** on
   `studio.beyondthecities.org` (same origin → no CORS, one cookie domain).
   Avoid a `/studio` path split.
3. **Markdown editor** — start with a plain `<textarea>` + a small toolbar (zero
   dependency, matches the vanilla ethos). A lib (e.g. EasyMDE) can come later.

## Suggested first slice (walking skeleton — de-risk before full UI)  ✅ DONE

Login → `/api/me` → read one colony → change one field → Save → commit lands.
Verified live 2026-07-11 (commit `60ce681` written by the studio Worker). Guard
added: identical content returns `{ok, unchanged}` instead of an empty commit.

## Milestone 0 — Scaffolding & secrets
- [x] **A0.1** `studio/` Worker scaffolded (`studio/wrangler.jsonc` +
  `src/index.js`), deployed → `https://btc-studio.stevan-266.workers.dev`
  (`/health` returns config booleans).
- [ ] **A0.2** Register a **Google OAuth client** (client id/secret, redirect
  `https://studio.…/auth/callback`). Store as Worker secrets.
- [ ] **A0.3** Create a **fine-grained GitHub token** (contents:write on this
  repo only). Store as a Worker secret.
- [x] **A0.4** KV namespace `ACCESS` created
  (`277fbe5444964a60a86e12b910a3e04f`) and bound in `studio/wrangler.jsonc`.
  (Seeding the admin email happens in M1.)

## Milestone 1 — Auth  ✅ done (verified: login works, role admin)
- [x] **A1.1** `/auth/google` + `/auth/callback` (code flow) + `/auth/logout`.
- [x] **A1.2** Signed session cookie (HMAC-SHA256 via Web Crypto, HttpOnly +
  Secure + SameSite=Lax) + `getSession` middleware.
- [x] **A1.3** Allowlist lookup (KV key `access`) → `{ role, colonies }`;
  `GET /api/me`; invite-only screen for unknown emails. Admin seeded:
  stevankojic.com@gmail.com.

## Milestone 2 — Read APIs
- [x] **A2.1** `GET /api/colony/:id` — reads across country files via GitHub
  contents API (deployed; live browser confirm pending).
- [x] **A2.2** `GET /api/posts` (scoped: admin all, organizer → posts whose
  `colonies` intersect theirs) + `GET /api/post/:slug`. Front-matter
  parser/serializer mirrors gen-blog.mjs.

## Milestone 3 — Write APIs (commit engine)
- [x] **A3.1** Commit helper `ghGetFile`/`ghPutFile` (content + sha → PUT;
  surfaces 409 conflict). Deployed; commit not yet exercised live.
- [x] **A3.2** `PUT /api/colony/:id` — perms check → whitelist-merge editable
  fields → patch country file → commit. Deployed; live test pending (needs UI).
- [x] **A3.3** `PUT /api/post/:slug` + `DELETE /api/post/:slug` (write/delete
  the MD file; enforce `colonies ⊆ allowed`; general posts admin-only) +
  `POST /api/upload` for blog cover images. Client slugifies the title.
- [x] **A3.4** `POST/DELETE /api/colony/:id/photo` — commit an uploaded image to
  `public/assets/images/colonies/` + set `photos[0]` (JPEG/PNG/WebP, ≤5 MB).
  Blog cover upload (`public/assets/images/blog/`) still to come with A3.3.

## Milestone 4 — Editor UI (vanilla)
- [x] **A4.1** App shell: top bar (brand · email · role badge · logout) served
  by the Worker; login card when signed out.
- [x] **A4.2** Colony-details form (load-by-id → editable fields) → Save → A3.2.
  Verified live.
- [x] **A4.3** "Blog posts" tab: posts list (New/Edit/Delete) + post editor
  (title/date/author/excerpt/tags/colony-ids/cover upload/markdown/draft).
  Organizer's colony ids prefilled; server enforces the scope.
- [x] **A4.4** Colony picker: `GET /api/colonies` (admin → all, organizer →
  own); dropdown replaces the id input; organizer with one colony auto-loads.
  Art field is now a canonical multi-select (chips + "Other"); main-photo
  widget with preview + upload/remove.
- [x] **A4.5** Admin **Access** tab (admin-only): add/remove admins + organizers,
  assign colonies via a dropdown (chips with remove) → `GET/PUT /api/access`
  writes the KV `access` key. Changes apply on next sign-in.
- [x] **Owner tier** — `OWNER_EMAILS` (wrangler var). Owners are always admin,
  never stored in the KV admin list, cannot be removed via the UI, and are the
  **only** role allowed to edit the admin list (regular admins manage organizers
  + content only). Prevents self-lockout and admin-vs-admin removal. Requires a
  fresh sign-in to pick up `owner` in the session.

## Milestone 5 — Hardening & ship
- [x] **A5.1** Scope re-checked on every write server-side; editor UI uses
  textContent / server escapes HTML in rendered pages.
- [x] **A5.2** Write rate limit (40/min per email, KV fixed-window) + clear
  save-failed status messages.
- [x] **A5.3** Concurrent-edit conflicts surfaced (GitHub 409 → `conflict`).
- [x] **A5.4** Custom domain **live**: `studio.beyondthecities.org` (Worker
  custom domain + Google origin/redirect added). `/health` + home OK. Worker
  derives the redirect URI from the request origin, so the workers.dev URL
  keeps working too.
- [x] **A5.5** `studio/README.md` — deploy, config, how to add an organizer,
  how organizers use it, custom-domain steps.
- Deferred: delete orphan images on replace; sanitize blog markdown at build.

## Order & parallelism
`M0 → M1 → (M2 ∥ M3) → M4 → M5`. Do the **walking skeleton** across M1/M3/M4
first (one field, one colony), then widen.
