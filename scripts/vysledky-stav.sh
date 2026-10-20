#!/usr/bin/env bash
# Results pilot ops view from the CLI (same numbers as GET /api/vysledky/stav/).
# Usage: scripts/vysledky-stav.sh [--local|--remote]   (default --remote; needs CF creds in env for remote)
set -euo pipefail
cd "$(dirname "$0")/.."
where="${1:---remote}"
stale_ms=$(( ${RESULTS_STALE_MIN:-10} * 60000 ))
now_ms=$(( $(date +%s) * 1000 ))
pnpm exec wrangler d1 execute sportstreamy-results "$where" --command "
SELECT job, datetime(MAX(finished)/1000,'unixepoch') AS last_ok_utc FROM sync_runs WHERE ok = 1 GROUP BY job;
SELECT job, datetime(started/1000,'unixepoch') AS at_utc, error FROM sync_runs WHERE ok = 0 ORDER BY started DESC LIMIT 3;
SELECT provider, day, used, cap, remaining_reported FROM api_usage ORDER BY day DESC LIMIT 4;
SELECT COUNT(*) AS matches, SUM(review) AS review,
  SUM(CASE WHEN status IN ('live','ht','et','pens') AND checked_at < $((now_ms - stale_ms)) THEN 1 ELSE 0 END) AS stale_live,
  SUM(CASE WHEN status = 'unconfirmed' THEN 1 ELSE 0 END) AS unconfirmed,
  SUM(CASE WHEN status IN ('ft','aet','pen') THEN 1 ELSE 0 END) AS final FROM matches;
SELECT ext_id, home, away, comp, datetime(start_utc/1000,'unixepoch') AS start_utc FROM matches WHERE review = 1 ORDER BY start_utc DESC LIMIT 10;"
