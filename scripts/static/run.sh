#!/usr/bin/env bash
# One live run (GitHub Actions, .github/workflows/live.yml): fresh data → static pages of sportstreamy.cz and
# ziveprenosy.sk → deploy. Replaces the Worker crons, KV and D1 of the SSR era (Cloudflare Workers Free, 23. 11. 2026).
#
#   scripts/static/run.sh <state dir> <ziveprenosy-sk checkout>
#
# State dir (kept between runs as a release asset): wrangler/ = local KV + D1 (miniflare), snap/ = what is deployed.
# Env: TIPSPORT_CLIENT_ID/SECRET, CHANCE_API_USER/PASS, APISPORTS_KEY, CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID),
#      TIPSPORT_SK_USER/PASS/PRODUCT_ID (ziveprenosy.sk's own Tipsport.sk feed; without them it renders from the Czech feed),
#      SNAP_MODE (auto|full|hot), SS_BUILD / ZP_BUILD (code ids, a change forces a full render),
#      NO_DEPLOY=1 (local test: render only, nothing uploaded, snapshot state untouched).
set -euo pipefail
SS=$(pwd)
STATE=$(realpath "$1")
ZP=$(realpath "$2")
WORK=${RUNNER_TEMP:-/tmp}/live
mkdir -p "$STATE/wrangler" "$STATE/snap" "$WORK/data" "$WORK/data-zp"
PERSIST="$STATE/wrangler"
rm -rf "$PERSIST/v3/cache" # the SSR entry's Cache API copy would serve pages of the previous run
MODE=${SNAP_MODE:-auto}
W="$SS/node_modules/.bin/wrangler"
log() { echo "[$(date -u +%H:%M:%S)] $*"; }

# Local-only configs: no routes, no crons, one shared KV namespace ("DATA") for both sites.
ci_config() {
  python3 - "$1" <<'PY'
import json, sys
p = sys.argv[1] + '/dist/server/wrangler.json'
c = json.load(open(p))
c.pop('routes', None)
c['triggers'] = {'crons': []}
c['observability'] = {'enabled': False}
c['kv_namespaces'] = [{'binding': 'DATA', 'id': 'DATA'}] + [k for k in c.get('kv_namespaces', []) if k['binding'] != 'DATA']
c.pop('analytics_engine_datasets', None)
json.dump(c, open(sys.argv[1] + '/dist/server/wrangler.ci.json', 'w'))
PY
}
ci_config "$SS"
ci_config "$ZP"

d1_file() { ls "$PERSIST"/v3/d1/miniflare-D1DatabaseObject/*.sqlite 2>/dev/null | grep -v metadata | head -1 || true; }

DEV_PID=""
start_dev() { # <app dir> <port>
  (cd "$1" && "$W" dev -c dist/server/wrangler.ci.json --local --persist-to "$PERSIST" --port "$2" --inspector-port $(( $2 + 1000 )) \
      --test-scheduled --show-interactive-dev-session=false > "$WORK/dev-$2.log" 2>&1) &
  DEV_PID=$!
  for _ in $(seq 1 90); do
    curl -sf -o /dev/null "http://127.0.0.1:$2/robots.txt" && return 0
    sleep 1
  done
  tail -40 "$WORK/dev-$2.log"
  return 1
}
stop_dev() {
  [ -n "$DEV_PID" ] && { pkill -P "$DEV_PID" 2>/dev/null || true; kill "$DEV_PID" 2>/dev/null || true; wait "$DEV_PID" 2>/dev/null || true; }
  [ -n "${CI:-}" ] && { pkill -f "workerd serve" 2>/dev/null || true; } # on the runner only this job's dev servers exist
  DEV_PID=""
  sleep 1
}
cleanup() {
  stop_dev
  rm -f "$SS/dist/server/.dev.vars" "$SS/.dev.vars" "$ZP/dist/server/.dev.vars"
  if [ -f "$SS/.dev.vars.keep" ]; then mv "$SS/.dev.vars.keep" "$SS/.dev.vars"; fi
}
trap cleanup EXIT

kv_put() { # <key> <file>
  (cd "$SS" && "$W" kv key put "$1" --path "$2" --binding DATA --local --persist-to "$PERSIST" -c dist/server/wrangler.ci.json >/dev/null)
}
kv_get() { # <key> <file>
  (cd "$SS" && "$W" kv key get "$1" --binding DATA --local --persist-to "$PERSIST" -c dist/server/wrangler.ci.json > "$2" 2>/dev/null) || true
}

# Secrets for the refresh (only the local dev server sees them). A developer's own .dev.vars is put back at the end.
[ -f "$SS/.dev.vars" ] && [ ! -f "$SS/.dev.vars.keep" ] && mv "$SS/.dev.vars" "$SS/.dev.vars.keep"
umask 077
{
  echo "TIPSPORT_CLIENT_ID=${TIPSPORT_CLIENT_ID}"
  echo "TIPSPORT_CLIENT_SECRET=${TIPSPORT_CLIENT_SECRET}"
  echo "CHANCE_API_USER=${CHANCE_API_USER}"
  echo "CHANCE_API_PASS=${CHANCE_API_PASS}"
} > "$SS/.dev.vars"
cp "$SS/.dev.vars" "$SS/dist/server/.dev.vars"
umask 022

kv_put pobocky "$SS/data/pobocky.json"

# 1. api-football (results confirmation, details, H2H) on the local results copy; its own budget lives in that database.
DB=$(d1_file)
# Account suspended since 24. 11. 2026 (dashboard: "Your account is Suspended"): no calls until Kenny reactivates it and
# deletes scripts/static/af.disabled. Final results come from the Tipsport.sk watcher meanwhile (ended-watch.yml).
if [ -f "$SS/scripts/static/af.disabled" ]; then
  log "api-football disabled (scripts/static/af.disabled)"
elif [ -n "$DB" ] && [ -n "${APISPORTS_KEY:-}" ]; then
  log "api-football sync"
  "$SS/node_modules/.bin/esbuild" "$SS/scripts/af-sync.ts" --bundle --platform=node --format=esm --target=node22 --outfile="$WORK/af-sync.mjs" --log-level=error
  APP="$SS/" RESULTS_SQLITE="$DB" timeout 300 node "$WORK/af-sync.mjs" | tail -n 8 || log "api-football sync failed (results stay as they are)"
fi

# 2. sportstreamy: refresh from Tipsport/Chance (the Worker's old cron handler, unchanged), render, deploy.
deploy_site() { # <site> <app dir> <port> <build id> <data dir: live.json / pre.json with the Tipsport paths>
  local site=$1 app=$2 port=$3 build=$4 data=$5 mode=$MODE
  local out="$WORK/render/$site"
  "$SS/node_modules/.bin/esbuild" "$app/src/edge.ts" --bundle --format=esm --platform=neutral --target=es2022 \
    --external:cloudflare:* --external:node:* --outfile="$WORK/edge-$site.js" --log-level=error
  for attempt in 1 2; do
    python3 "$SS/scripts/static/snapshot.py" --site "$site" --base "http://127.0.0.1:$port" --dist "$app/dist/client" \
      --state "$STATE/snap" --out "$out" --data "$data" --db "$(d1_file)" --mode "$mode" --build "$build"
    python3 "$SS/scripts/static/verify_no_secrets.py" --dir "$out/files"
    if [ "${NO_DEPLOY:-}" = 1 ]; then log "$site: NO_DEPLOY=1, rendered into $out"; return 0; fi
    set +e
    (cd "$SS" && node scripts/static/deploy.mjs "$out/deploy.json" "$WORK/edge-$site.js" "$app/wrangler.jsonc") > "$WORK/deploy-$site.json"
    rc=$?
    set -e
    if [ $rc -eq 0 ]; then
      python3 "$SS/scripts/static/snapshot.py" --site "$site" --state "$STATE/snap" --out "$out" --result "$WORK/deploy-$site.json" --build "$build" --commit
      rm -rf "$out"
      return 0
    fi
    head -c 600 "$WORK/deploy-$site.json"; echo
    [ $rc -eq 3 ] && [ "$mode" != full ] && { log "$site: Cloudflare lacks stored blobs → full render"; mode=full; continue; }
    return 1
  done
  return 1
}

# Final results caught by the watcher (ended-watch.yml) → KV `ended`, applied by refreshLive() in the scheduled handler.
if gh release download state -p 'ended.enc' -O "$WORK/ended.enc" --clobber 2>/dev/null \
   && openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:STATE_KEY -in "$WORK/ended.enc" -out "$WORK/ended.json" 2>/dev/null; then
  kv_put ended "$WORK/ended.json"
  python3 -c "import json,sys,time;d=json.load(open(sys.argv[1]));print(f\"ended watcher: {len(d['items'])} finished matches, {round(time.time()-d['at']/1000)} s old\")" "$WORK/ended.json"
  rm -f "$WORK/ended.enc" "$WORK/ended.json"
else
  log "ended watcher: no data yet"
fi
log "sportstreamy: dev server"
start_dev "$SS" 8787
log "refresh (Tipsport + Chance + results)"
curl -sf --max-time 240 "http://127.0.0.1:8787/cdn-cgi/handler/scheduled?cron=*/15+*+*+*+*" -o /dev/null || log "scheduled handler call failed"
kv_get live "$WORK/data/live.json"
kv_get pre "$WORK/data/pre.json"
python3 - "$WORK/data" <<'PY'
import json, sys, time
for k in ('live', 'pre'):
    try:
        d = json.load(open(f'{sys.argv[1]}/{k}.json'))
        print(f"{k}: {len(d['items'])} matches, {round(time.time() - d['at'] / 1000)} s old")
    except Exception as e:
        print(f'{k}: missing ({e})')
PY
log "sportstreamy: render + deploy"
deploy_site sportstreamy "$SS" 8787 "${SS_BUILD:-dev}" "$WORK/data"
stop_dev

# 3. ziveprenosy.sk: its own Tipsport.sk feed (since 24. 11. 2026) → KV sk:live / sk:pre via its scheduled handler.
# Without the secrets or on an error the site renders from the Czech feed above (lib/matches.ts falls back) and its
# watch buttons go to the plain TV link (empty data dir = no match paths for the /go/ deeplinks).
if [ -n "${TIPSPORT_SK_USER:-}" ] && [ -n "${TIPSPORT_SK_PASS:-}" ]; then
  umask 077
  {
    echo "TIPSPORT_SK_USER=${TIPSPORT_SK_USER}"
    echo "TIPSPORT_SK_PASS=${TIPSPORT_SK_PASS}"
    echo "TIPSPORT_SK_PRODUCT_ID=${TIPSPORT_SK_PRODUCT_ID:-3}"
  } > "$ZP/dist/server/.dev.vars"
  umask 022
fi
log "ziveprenosy: dev server"
start_dev "$ZP" 8797
if [ -f "$ZP/dist/server/.dev.vars" ]; then
  log "ziveprenosy: refresh (Tipsport.sk)"
  curl -sf --max-time 120 "http://127.0.0.1:8797/cdn-cgi/handler/scheduled" -o /dev/null || log "tipsport.sk refresh failed"
  kv_get sk:live "$WORK/data-zp/live.json"
  kv_get sk:pre "$WORK/data-zp/pre.json"
  python3 - "$WORK/data-zp" <<'PY2'
import json, sys, time
for k in ('live', 'pre'):
    p = f'{sys.argv[1]}/{k}.json'
    try:
        d = json.load(open(p))
        age = round(time.time() - d['at'] / 1000)
        print(f"sk {k}: {len(d['items'])} matches, {age} s old")
        if age > 2 * 3600:
            open(p, 'w').write('{"items":[]}')  # stale: the pages use the Czech feed, so no tipsport.sk paths either
    except Exception as e:
        open(p, 'w').write('{"items":[]}')
        print(f'sk {k}: missing ({e})')
PY2
fi
log "ziveprenosy: render + deploy"
deploy_site ziveprenosy "$ZP" 8797 "${ZP_BUILD:-dev}" "$WORK/data-zp"
stop_dev

# Keep the state small: the run log of the sync jobs only needs the last week.
DB=$(d1_file)
[ -n "$DB" ] && python3 - "$DB" <<'PY'
import sqlite3, sys, time
c = sqlite3.connect(sys.argv[1])
c.execute('DELETE FROM sync_runs WHERE started < ?', (int(time.time() * 1000) - 7 * 86_400_000,))
c.commit()
c.execute('PRAGMA wal_checkpoint(TRUNCATE)')
c.close()
PY
log "done"
