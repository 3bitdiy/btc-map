# Sveltia CMS — one-time setup

The CMS lives at **`/admin/`** (`public/admin/`). It edits the colony JSON
(`public/data/colonies-*.json`) directly in this repo via GitHub; Cloudflare
Pages rebuilds on push, so saved changes go live. Free, no server.

Editing is **maintainer-only** — organizers don't get CMS access. They propose
changes through a Google Form that the maintainer reviews and enters here.

## 1. GitHub OAuth App

GitHub → Settings → Developer settings → **OAuth Apps → New OAuth App**:

- Application name: `Beyond the Cities CMS`
- Homepage URL: your site (e.g. `https://beyondthecities.org`)
- Authorization callback URL: `https://<your-auth-worker>.workers.dev/callback`
  (fill the real worker subdomain after step 2, then edit it here)

Note the **Client ID** and generate a **Client Secret**.

## 2. Auth proxy — Cloudflare Worker

Sveltia needs a tiny OAuth proxy. Use the official template **`sveltia-cms-auth`**:

1. Create a Worker from `https://github.com/sveltia/sveltia-cms-auth`
   (Deploy to Cloudflare, or `wrangler deploy`).
2. Set Worker variables/secrets:
   - `GITHUB_CLIENT_ID` = the Client ID from step 1
   - `GITHUB_CLIENT_SECRET` = the Client Secret
   - `ALLOWED_DOMAINS` = your site host(s), e.g. `beyondthecities.org,*.pages.dev`
3. Copy the Worker URL (e.g. `https://btc-cms-auth.<account>.workers.dev`).
4. Put that callback (`.../callback`) back into the GitHub OAuth App (step 1).

## 3. Point the CMS at the worker

In `public/admin/config.yml`, set:

```yaml
backend:
  base_url: https://btc-cms-auth.<account>.workers.dev
```

Commit + push. Done.

## 4. Use it

- Go to `https://<your-site>/admin/`, click **Login with GitHub**.
- Edit a country → the **Colonies** list → save. Pages rebuilds, change goes live.
- To add another editor: make them a **collaborator** on the `3bitdiy/btc-map`
  repo (Settings → Collaborators). They need a GitHub account.

## Photos

Colonies currently use the shared placeholder. When real photos arrive (sent
directly or via the Google Form), upload them in a colony's **Photos** field —
they're stored under `public/assets/images/colonies/` and served by Pages. The
map shows `photos[0]` if present, otherwise the placeholder.

## Notes

- Data files are `{ "colonies": [ ... ] }` objects (so the CMS can edit them);
  the map reads `.colonies`. Don't revert them to bare arrays.
- `id` must stay unique per colony (used for marker identity/selection).
- `art_field` is free text but the app normalizes it to a canonical set — prefer
  the canonical discipline names listed in the CMS description.
