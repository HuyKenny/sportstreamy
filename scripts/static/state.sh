#!/usr/bin/env bash
# Encrypted state of the live job (PUBLIC repo, the pattern of apps/kurzovyradar and apps/vian): <dir>/wrangler (local KV +
# the results SQLite with the D1 schema) and <dir>/snap (hashes of the deployed files). The release asset `state` is
# unreadable without STATE_KEY (GitHub secret; copy in ~/ai/credentials/.sportstreamy-credentials.env).
#   scripts/static/state.sh pull <dir>   # download + decrypt (fails if there is none: seed it with scripts/static/seed.sh)
#   scripts/static/state.sh push <dir>   # encrypt + upload; also keeps a daily copy (state-YYYY-MM-DD.enc, last 7 days)
set -euo pipefail
: "${STATE_KEY:?STATE_KEY missing}"
DIR=${2:?state dir}
TMP=${RUNNER_TEMP:-/tmp}/state.enc
case "${1:-}" in
  pull)
    mkdir -p "$DIR"
    if gh release download state -p 'state.enc' -O "$TMP" --clobber 2>/dev/null; then
      openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:STATE_KEY -in "$TMP" | tar xz -C "$DIR"
      rm -f "$TMP"
      echo "state restored ($(du -sh "$DIR" | cut -f1))"
    else
      # never render from an empty results database: the first state comes from scripts/static/seed.sh
      echo "no state release asset - seed it first (scripts/static/seed.sh)"; exit 1
    fi ;;
  push)
    [ -d "$DIR/wrangler" ] || { echo "no state to save"; exit 0; }
    # never replace the stored results with an empty database (a failed restore, a broken run)
    db=$(ls "$DIR"/wrangler/v3/d1/miniflare-D1DatabaseObject/*.sqlite 2>/dev/null | grep -v metadata | head -1 || true)
    { [ -n "$db" ] && [ "$(stat -c %s "$db")" -gt 1000000 ]; } || { echo "results database missing or tiny - state NOT saved"; exit 1; }
    # miniflare's cache is rebuilt on every run (and must not serve old pages)
    tar cz -C "$DIR" --exclude='./wrangler/v3/cache' --exclude='./wrangler/v3/observability' . \
      | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:STATE_KEY -out "$TMP"
    gh release view state >/dev/null 2>&1 || gh release create state --title "live state (encrypted)" \
      --notes "Encrypted data of the live job between runs (results database, deployed file hashes). Not a software release." --latest=false
    gh release upload state "$TMP" --clobber
    day=$(date -u +%F)
    if ! gh release view state --json assets --jq '.assets[].name' | grep -qx "state-$day.enc"; then
      cp "$TMP" "${TMP%.enc}-$day.enc"
      gh release upload state "${TMP%.enc}-$day.enc" --clobber
      rm -f "${TMP%.enc}-$day.enc"
      for old in $(gh release view state --json assets --jq '.assets[].name' | grep -E '^state-[0-9-]+\.enc$' | sort | head -n -7); do
        gh release delete-asset state "$old" -y
      done
    fi
    echo "state saved ($(du -h "$TMP" | cut -f1))"
    rm -f "$TMP" ;;
  *) echo "usage: $0 pull|push <dir>"; exit 2 ;;
esac
