/**
 * api-football sync, run from the Raspberry (bin/sportstreamy-af.sh, every 15 min).
 * Why not from the Worker: requests from Cloudflare's shared egress IPs get api-football's per-minute refusal after
 * the first call (21. 10. 2026, same story as IndexNow), from the Raspberry they go through. Same code
 * (src/lib/results/sync.ts) and the same D1 database, reached through Cloudflare's D1 REST API.
 * Bundled with esbuild and run by node; config comes from wrangler.jsonc vars, secrets from ~/ai/credentials.
 */
import { readFileSync } from 'node:fs';
import type { Db, Stmt } from '../src/lib/results/db';
import { resultsConfig, type ResultsEnv } from '../src/lib/results/config';
import { syncApiFootball } from '../src/lib/results/sync';
import { opsStatus } from '../src/lib/results/store';

const APP = process.env.APP ?? '/home/kenny/ai/apps/sportstreamy/';
const creds = (file: string) =>
  Object.fromEntries(readFileSync(`/home/kenny/ai/credentials/${file}`, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
  }));
const cf = creds('.cloudflare-credentials.env');
const ss = creds('.sportstreamy-credentials.env');
const wrangler = JSON.parse(readFileSync(`${APP}wrangler.jsonc`, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
const ACCOUNT = '7dcd021a0f64e56889505c60c878f3ab';
const DB_ID = wrangler.d1_databases.find((d: { binding: string }) => d.binding === 'RESULTS').database_id;

/** D1 over the REST API: one HTTP call per statement; a "batch" runs sequentially (not one transaction). */
function d1(): Db {
  const query = async (sql: string, params: unknown[]) => {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB_ID}/query`, {
      method: 'POST',
      headers: { 'X-Auth-Email': cf.CF_EMAIL, 'X-Auth-Key': cf.CF_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params: params.map((v) => (typeof v === 'boolean' ? Number(v) : v === undefined ? null : v)) }),
      signal: AbortSignal.timeout(30_000),
    });
    const j = (await res.json()) as { success: boolean; errors?: unknown; result?: { results: unknown[]; meta: { changes?: number } }[] };
    if (!j.success || !j.result) throw new Error(`D1 ${res.status} ${JSON.stringify(j.errors).slice(0, 200)}`);
    return j.result[0];
  };
  const stmt = (sql: string, params: unknown[] = []): Stmt => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    first: async <T>() => ((await query(sql, params)).results[0] ?? null) as T | null,
    all: async <T>() => ({ results: (await query(sql, params)).results as T[] }),
    run: async () => ({ meta: { changes: (await query(sql, params)).meta.changes } }),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (list) => {
      const out = [];
      for (const s of list) {
        const r = await s.all();
        out.push({ results: r.results, meta: { changes: undefined } });
      }
      return out;
    },
  };
}

const env: ResultsEnv = { ...wrangler.vars, RESULTS: {}, RESULTS_APIFOOTBALL: 'on', APISPORTS_KEY: ss.APISPORTS_KEY };
const cfg = resultsConfig(env);
if (!cfg.sync) process.exit(0); // results sync switched off in wrangler.jsonc
const db = d1();
const r = await syncApiFootball(db, cfg, { key: ss.APISPORTS_KEY, cap: cfg.cap, floor: cfg.reserve });
const s = await opsStatus(db, Date.now(), cfg.staleMs);
console.log(new Date().toISOString(), JSON.stringify({ run: r, usage: s.usage[0] ?? null, paired: s.paired, confirmedByApiFootball: s.confirmedByApiFootball, mismatch: s.mismatch, unconfirmed: s.unconfirmed }));
// Budget and per-minute refusals are expected states, not failures worth an alert.
process.exit(r.error && !/ratelimit|too many|budget/i.test(r.error) ? 1 : 0);
