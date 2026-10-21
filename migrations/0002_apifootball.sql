-- api-football as the second source (docs/vysledky-provoz.md): pairing, final-result confirmation, details, H2H.
-- Additive only.
ALTER TABLE matches ADD COLUMN af_id TEXT;            -- paired api-football fixture id
ALTER TABLE matches ADD COLUMN af_status TEXT;        -- last api-football status code (FT, AET, PEN, PST…)
ALTER TABLE matches ADD COLUMN af_checked_at INTEGER;
ALTER TABLE matches ADD COLUMN result_src TEXT;       -- who confirmed the final result: tipsport | apifootball
ALTER TABLE matches ADD COLUMN mismatch INTEGER NOT NULL DEFAULT 0; -- sources disagree on the final score
ALTER TABLE matches ADD COLUMN h2h TEXT;              -- JSON, api-football head-to-head (last finished meetings)
CREATE INDEX IF NOT EXISTS matches_af ON matches (af_id);

-- Verified team pairs (Tipsport participant id ↔ api-football team id), learned from unambiguous fixtures.
CREATE TABLE IF NOT EXISTS team_link (
  tip_id TEXT PRIMARY KEY,
  af_id TEXT NOT NULL,
  tip_name TEXT NOT NULL,
  af_name TEXT NOT NULL,
  created INTEGER NOT NULL
);

-- When a day's fixture list was last fetched (one request covers the whole day).
CREATE TABLE IF NOT EXISTS af_fetch (
  day TEXT PRIMARY KEY,
  at INTEGER NOT NULL
);
