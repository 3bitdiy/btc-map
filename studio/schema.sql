-- Beyond the Cities · Studio — "Network" database (Cloudflare D1, SQLite).
-- Holds organizer profiles, the notice board and the newsletter log. This data
-- is NOT in the (public) Git repo on purpose — emails/phones stay out of Git.
--
-- Apply (idempotent):
--   npx wrangler d1 execute btc-network --remote --file studio/schema.sql --config studio/wrangler.jsonc
-- Local dev copy:
--   npx wrangler d1 execute btc-network --local  --file studio/schema.sql --config studio/wrangler.jsonc

-- One row per studio account (created/refreshed at sign-in). Who is allowed in
-- is still decided by the KV allowlist; this only stores what they tell us.
CREATE TABLE IF NOT EXISTS profiles (
  email        TEXT PRIMARY KEY,                -- lower-cased Google email
  google_name  TEXT NOT NULL DEFAULT '',        -- display name from Google at last sign-in
  name         TEXT NOT NULL DEFAULT '',        -- name shown in the directory (self-edited; falls back to google_name)
  phone        TEXT NOT NULL DEFAULT '',        -- optional, international format → WhatsApp link
  about        TEXT NOT NULL DEFAULT '',        -- short bio / what they're looking for
  languages    TEXT NOT NULL DEFAULT '',        -- comma-separated, e.g. "sr, en, de"
  show_email   INTEGER NOT NULL DEFAULT 1,      -- 1 = email visible to other organizers
  visible      INTEGER NOT NULL DEFAULT 1,      -- 0 = hidden from the directory
  newsletter   INTEGER NOT NULL DEFAULT 1,      -- 0 = unsubscribed from the monthly digest
  unsub_token  TEXT NOT NULL DEFAULT '',        -- random token for the one-click unsubscribe link
  created_at   TEXT NOT NULL,                   -- ISO 8601 UTC
  updated_at   TEXT NOT NULL,                   -- last profile edit
  last_login   TEXT                             -- last sign-in
);

-- Notice board: open calls, partner searches, offers, questions.
CREATE TABLE IF NOT EXISTS notices (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL,                   -- open_call | partners | offering | question | other
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',        -- plain text
  deadline     TEXT,                            -- YYYY-MM-DD, optional
  colony_id    TEXT NOT NULL DEFAULT '',        -- colony the notice is posted for ('' = none)
  author_email TEXT NOT NULL,                   -- profiles.email
  is_public    INTEGER NOT NULL DEFAULT 0,      -- 1 = may be shown on the public /calls page
  status       TEXT NOT NULL DEFAULT 'open',    -- open | closed
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL                    -- auto-hide after this (deadline, else created + 90 days)
);
CREATE INDEX IF NOT EXISTS notices_open_idx   ON notices (status, expires_at);
CREATE INDEX IF NOT EXISTS notices_author_idx ON notices (author_email);

-- One row per newsletter send (monthly cron or a manual test).
CREATE TABLE IF NOT EXISTS newsletter_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sent_at      TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'monthly', -- monthly | test
  recipients   INTEGER NOT NULL DEFAULT 0,
  summary      TEXT NOT NULL DEFAULT ''         -- what was included (counts), for the Access tab
);

-- Email sign-in (link or 6-digit code), for organizers without a Google account.
-- One row per "email me a sign-in link" request; rows older than a day are
-- pruned on the next request. Tokens and codes are stored only as hashes.
CREATE TABLE IF NOT EXISTS login_tokens (
  id           TEXT PRIMARY KEY,                -- SHA-256 (hex) of the link token
  email        TEXT NOT NULL,                   -- lower-cased address it was sent to
  code_hash    TEXT NOT NULL,                   -- HMAC(SESSION_SECRET, id:code)
  ip           TEXT NOT NULL DEFAULT '',        -- requester IP (rate limit only)
  created_at   INTEGER NOT NULL,                -- epoch ms
  expires_at   INTEGER NOT NULL,                -- epoch ms (created + 15 min)
  used_at      INTEGER,                         -- epoch ms, set once on sign-in
  attempts     INTEGER NOT NULL DEFAULT 0       -- wrong code entries
);
CREATE INDEX IF NOT EXISTS login_tokens_email_idx ON login_tokens (email, created_at);
CREATE INDEX IF NOT EXISTS login_tokens_ip_idx    ON login_tokens (ip, created_at);
