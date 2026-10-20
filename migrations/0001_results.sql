-- Results pilot (docs/vysledky-provoz.md). Additive only: new tables, nothing existing is touched.
-- Times are UTC epoch milliseconds. A NULL score means "not known", never 0.

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,              -- 'tipsport', 'apifootball'
  sport INTEGER NOT NULL,              -- Tipsport idSuperSport (16 = football)
  ext_id TEXT NOT NULL,                -- provider's match id
  comp TEXT NOT NULL,                  -- our competition slug (competitions.ts)
  lg TEXT NOT NULL DEFAULT '',         -- provider's competition name (kept for competitionOf())
  season TEXT,                         -- provider season id (Tipsport competitionAnnualId), NULL when unknown
  home TEXT NOT NULL,
  away TEXT NOT NULL,
  home_ext TEXT,                       -- provider participant ids: pairing never relies on names alone
  away_ext TEXT,
  start_utc INTEGER NOT NULL,
  status TEXT NOT NULL,                -- see src/lib/results/status.ts
  status_raw TEXT,                     -- provider's own status text, shown when we cannot classify it
  minute_raw TEXT,                     -- provider's minute text; we never compute the minute ourselves
  sh INTEGER,
  sa INTEGER,
  periods TEXT,                        -- JSON [[h,a],…] as published by the provider
  pen_h INTEGER,
  pen_a INTEGER,
  stream INTEGER NOT NULL DEFAULT 0,   -- Tipsport has video for it
  path TEXT NOT NULL DEFAULT '',       -- Tipsport matchUrl (deeplink for /go/)
  slug TEXT NOT NULL,                  -- our URL slug, fixed at first insert and never rewritten
  src_at INTEGER NOT NULL,             -- when the provider data was fetched (guards against older answers)
  checked_at INTEGER NOT NULL,         -- last time the provider confirmed this record
  final_at INTEGER,                    -- first time (or last correction) of a final result = sitemap lastmod
  review INTEGER NOT NULL DEFAULT 0,   -- 1 = ambiguous pairing, kept out of public pages
  stats TEXT,                          -- optional JSON (lineups/statistics) — NULL = not available
  UNIQUE (provider, sport, ext_id)
);
CREATE INDEX IF NOT EXISTS matches_sport_start ON matches (sport, start_utc);
CREATE INDEX IF NOT EXISTS matches_comp_start ON matches (comp, start_utc);
CREATE INDEX IF NOT EXISTS matches_status_checked ON matches (status, checked_at);
CREATE INDEX IF NOT EXISTS matches_final ON matches (final_at);

-- Provider participant id → what kind of team it is. A changed kind (men → women…) flags the match for review.
CREATE TABLE IF NOT EXISTS team_map (
  provider TEXT NOT NULL,
  ext_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                  -- men | women | youth | reserve
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (provider, ext_id)
);

-- Quota ledger: one row per provider and provider quota day (api-football resets at 00:00 UTC).
CREATE TABLE IF NOT EXISTS api_usage (
  provider TEXT NOT NULL,
  day TEXT NOT NULL,                   -- YYYY-MM-DD (UTC)
  used INTEGER NOT NULL DEFAULT 0,
  cap INTEGER NOT NULL,
  remaining_reported INTEGER,          -- what the provider said in its rate-limit headers
  PRIMARY KEY (provider, day)
);

CREATE TABLE IF NOT EXISTS locks (
  name TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  until INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job TEXT NOT NULL,
  started INTEGER NOT NULL,
  finished INTEGER,
  ok INTEGER,
  error TEXT,
  seen INTEGER,
  written INTEGER,
  review INTEGER
);
CREATE INDEX IF NOT EXISTS sync_runs_job ON sync_runs (job, started);
