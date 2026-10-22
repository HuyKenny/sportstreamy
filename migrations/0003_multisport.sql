-- More sports from api-sports (one host and one daily quota per sport). Additive only.
-- When a day's game list was last fetched, per provider (af_fetch was football only and stays as it is).
CREATE TABLE IF NOT EXISTS api_fetch (
  provider TEXT NOT NULL,
  day TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (provider, day)
);
INSERT OR IGNORE INTO api_fetch (provider, day, at) SELECT 'apifootball', day, at FROM af_fetch;
