#!/usr/bin/env bash
# One-time cutover from the SSR Worker (run on the Raspberry, from apps/sportstreamy, after `pnpm build`):
# export D1 `sportstreamy-results` → the local results SQLite of the live job → encrypted state release asset.
# Run it AFTER the old writers stopped (Worker crons of `sportstreamy`, bin/sportstreamy-af.sh), otherwise their last
# writes are lost. Reads D1 once (~40 k rows). Credentials: ~/ai/credentials (Cloudflare global key for wrangler, STATE_KEY).
#   scripts/static/seed.sh <empty work dir>
set -euo pipefail
DIR=$(realpath "${1:?work dir}")
[ -e "$DIR/wrangler" ] && { echo "$DIR/wrangler exists - use an empty dir"; exit 1; }
mkdir -p "$DIR/wrangler" "$DIR/snap"
set -a; . /home/kenny/ai/credentials/.cloudflare-credentials.env; set +a
export CLOUDFLARE_EMAIL=$CF_EMAIL CLOUDFLARE_API_KEY=$CF_GLOBAL_API_KEY CLOUDFLARE_ACCOUNT_ID=7dcd021a0f64e56889505c60c878f3ab
STATE_KEY=$(grep '^STATE_KEY=' /home/kenny/ai/credentials/.sportstreamy-credentials.env | cut -d= -f2-)
export STATE_KEY
W=node_modules/.bin/wrangler
python3 - <<'PY'
import json
c = json.load(open('dist/server/wrangler.json'))
c.pop('routes', None); c['triggers'] = {'crons': []}; c['observability'] = {'enabled': False}
c['kv_namespaces'] = [{'binding': 'DATA', 'id': 'DATA'}]; c.pop('analytics_engine_datasets', None)
json.dump(c, open('dist/server/wrangler.ci.json', 'w'))
PY
"$W" d1 export sportstreamy-results --remote --output "$DIR/results.sql"
"$W" d1 execute sportstreamy-results --local --persist-to "$DIR/wrangler" -c dist/server/wrangler.ci.json --file "$DIR/results.sql" > /dev/null
rm -f "$DIR/results.sql"
ls -la "$DIR"/wrangler/v3/d1/miniflare-D1DatabaseObject/
GH_REPO=HuyKenny/sportstreamy scripts/static/state.sh push "$DIR"
