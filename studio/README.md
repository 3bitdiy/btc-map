# Beyond the Cities · Studio

The login-required editing layer for colony organizers and admins. A standalone
Cloudflare Worker — the public map/blog stay 100% static; every edit here is
committed back to this repo (`3bitdiy/btc-map`) via the GitHub API, which
triggers a Cloudflare Pages rebuild.

Live: **https://btc-studio.stevan-266.workers.dev** (custom domain
`studio.beyondthecities.org` — see below).

## What it does

- **Google sign-in** → role resolved from an allowlist in KV.
- **Owner** (`OWNER_EMAILS`): always admin, unremovable, and the only role that
  can edit the admin list.
- **Admin**: edit any colony, any blog post, and manage organizers.
- **Organizer**: edit only their assigned colony/colonies + write blog posts
  for them.
- Edits commit to the repo: colony data → `public/data/colonies-*.json`,
  posts → `public/data/blog/<slug>.md`, images → `public/assets/images/…`.

## Roles & access — how to add an organizer

1. Sign in as an owner/admin → **Access** tab.
2. Under **Organizers**, type their Google email → **Add organizer**.
3. Use **+ add colony…** to assign one or more colonies (chips show the names).
4. **Save access**. They can sign in immediately; changes take effect on their
   next sign-in (sessions last 12h).

Admins are added the same way (owners only). To make someone an **owner**, add
their email to `OWNER_EMAILS` in `wrangler.jsonc` and redeploy.

## How organizers use it

1. Go to the studio URL → **Continue with Google**.
2. **Colony details** — their colony loads automatically (or pick it); edit
   fields, choose art fields from the list, upload a main photo → **Save**.
3. **Blog posts** — **+ New post**, write with the toolbar editor (bold, H2/H3,
   lists, quote, link, image, preview), optionally set a cover and which
   colonies the post is news for → **Save post**.
4. Changes go live in ~1–2 minutes (after the rebuild).

## Config

`wrangler.jsonc`:
- Vars: `GITHUB_REPO`, `GITHUB_BRANCH`, `STUDIO_URL`, `GOOGLE_CLIENT_ID`,
  `OWNER_EMAILS` (comma-separated).
- KV: `ACCESS` (allowlist under key `access`; also holds `rl:*` rate-limit
  counters).

Secrets (set with `wrangler secret put … --config studio/wrangler.jsonc`):
`GITHUB_TOKEN` (fine-grained, contents:write), `GOOGLE_CLIENT_SECRET`,
`SESSION_SECRET`.

## Deploy

```bash
npx wrangler deploy --config studio/wrangler.jsonc
```

`GET /health` returns config booleans (no secret values) to confirm bindings.

## Custom domain (studio.beyondthecities.org)

Requires the `beyondthecities.org` zone to be on this Cloudflare account.

1. Cloudflare dashboard → the Worker `btc-studio` → **Settings → Domains &
   Routes → Add → Custom Domain** → `studio.beyondthecities.org`. Cloudflare
   creates the DNS record and certificate.
2. In Google Cloud Console → the OAuth client, add:
   - Authorized JavaScript origin: `https://studio.beyondthecities.org`
   - Authorized redirect URI: `https://studio.beyondthecities.org/auth/callback`
3. The Worker derives the redirect URI from the request origin, so no code
   change is needed. Once verified, the workers.dev origin/redirect can be
   removed from Google (optional).

## Known follow-ups (deferred)

- Orphan images (replaced photos/covers) remain in the repo — harmless; could
  be cleaned up on replace later.
- Blog markdown is rendered as-is by the build; authors are trusted (invited),
  but raw HTML in a post body is not sanitized. Consider sanitizing at build if
  the author base widens.
