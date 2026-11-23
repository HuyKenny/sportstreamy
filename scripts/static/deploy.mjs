#!/usr/bin/env node
// Deploy the edge Worker (src/edge.ts, bundled) together with its static assets from a MANIFEST (scripts/static/snapshot.py
// writes it): rendered files by path on disk, unchanged files by the hash stored after the previous deploy. Cloudflare
// asks only for blobs it does not have, so a normal run uploads just the pages that changed.
// Based on apps/sporteka-web/scripts/cf-assets.mjs (same hashing as wrangler).
//
//   node scripts/static/deploy.mjs <deploy.json> <worker bundle .js> <wrangler config (vars, dataset)>
//
// Credentials: CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID) from the environment (GitHub Actions), or
// CLOUDFLARE_EMAIL + CLOUDFLARE_API_KEY. Prints JSON {worker, total, uploaded, bytes, hashes}; exit 3 + {error:'missing'}
// when Cloudflare wants a blob we only know by hash (the caller then renders everything again).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(fs.realpathSync(path.join(process.cwd(), 'node_modules', 'wrangler', 'package.json')));
const blake3 = require('blake3-wasm');

const API = 'https://api.cloudflare.com/client/v4';
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || '7dcd021a0f64e56889505c60c878f3ab';
const AUTH = process.env.CLOUDFLARE_API_TOKEN ? { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` }
  : { 'X-Auth-Email': process.env.CLOUDFLARE_EMAIL, 'X-Auth-Key': process.env.CLOUDFLARE_API_KEY };
if (!process.env.CLOUDFLARE_API_TOKEN && !process.env.CLOUDFLARE_API_KEY) throw new Error('no Cloudflare credentials in the environment');

const MIME = { html: 'text/html', css: 'text/css', js: 'application/javascript', json: 'application/json', xml: 'application/xml', txt: 'text/plain',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', woff2: 'font/woff2', webmanifest: 'application/manifest+json' };

async function api(method, url, body, headers = {}) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(API + url, { method, headers: { ...headers }, body });
    const j = await r.json().catch(() => ({}));
    if (j.success) return j.result;
    if (attempt >= 5 || (r.status < 500 && r.status !== 429)) throw new Error(`${method} ${url.split('?')[0]} → ${r.status} ${JSON.stringify(j.errors ?? '').slice(0, 300)}`);
    await new Promise((s) => setTimeout(s, 2000 * attempt));
  }
}

const [depFile, bundleFile, wranglerFile] = process.argv.slice(2);
const m = JSON.parse(fs.readFileSync(depFile, 'utf8'));
const wcfg = JSON.parse(fs.readFileSync(wranglerFile, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
const manifest = {};
const local = new Map(); // hash → [path, abs file]
for (const [p, e] of Object.entries(m.files)) {
  if (e.file) {
    const buf = fs.readFileSync(e.file);
    const hash = blake3.hash(buf.toString('base64') + path.extname(p).slice(1)).toString('hex').slice(0, 32);
    manifest[p] = { hash, size: buf.length };
    local.set(hash, [p, e.file]);
  } else {
    if (!e.hash || e.size == null) throw new Error(`no file and no stored hash for ${p}`);
    manifest[p] = { hash: e.hash, size: e.size };
  }
}
if (Object.keys(manifest).length > 20000) throw new Error('more than 20 000 files in one Worker version (Free plan)');

const newSession = () => api('POST', `/accounts/${ACCOUNT}/workers/scripts/${m.worker}/assets-upload-session`, JSON.stringify({ manifest }), { ...AUTH, 'Content-Type': 'application/json' });
let session = await newSession();
let jwt = session.jwt;
const need = (session.buckets ?? []).flat();
let bytes = 0;
const missing = need.filter((h) => !local.has(h));
if (missing.length) {
  const want = new Set(missing);
  const paths = Object.entries(manifest).filter(([, e]) => want.has(e.hash)).map(([p]) => p);
  process.stdout.write(JSON.stringify({ error: 'missing', paths: paths.slice(0, 50), n: paths.length }) + '\n', () => process.exit(3));
  await new Promise(() => {});
}
for (let round = 1; ; round++) {
  const queue = [...(session.buckets ?? [])];
  const upJwt = session.jwt;
  let refused = false;
  async function worker() {
    for (let b = queue.shift(); b && !refused; b = queue.shift()) {
      const form = new FormData();
      let size = 0;
      for (const h of b) {
        const [p, file] = local.get(h);
        const buf = fs.readFileSync(file);
        size += buf.length;
        form.append(h, new File([buf.toString('base64')], h, { type: MIME[path.extname(p).slice(1)] ?? 'application/null' }), h);
      }
      try {
        const res = await api('POST', `/accounts/${ACCOUNT}/workers/assets/upload?base64=true`, form, { Authorization: `Bearer ${upJwt}` });
        bytes += size;
        if (res?.jwt) jwt = res.jwt;
      } catch (e) {
        if (!/ → 401 /.test(String(e.message)) || round >= 4) throw e;
        refused = true;
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  if (!refused) break;
  console.error(`deploy: ${m.worker}: upload token refused (401), new upload session (round ${round + 1})`);
  session = await newSession();
  jwt = session.jwt;
  if (!(session.buckets ?? []).length) break;
}

const bindings = [{ type: 'assets', name: 'ASSETS' }];
for (const d of wcfg.analytics_engine_datasets ?? []) bindings.push({ type: 'analytics_engine', name: d.binding, dataset: d.dataset });
for (const [k, v] of Object.entries(wcfg.vars ?? {})) bindings.push({ type: 'plain_text', name: k, text: String(v) });
const meta = {
  main_module: 'edge.js',
  compatibility_date: wcfg.compatibility_date ?? '2026-10-01',
  compatibility_flags: wcfg.compatibility_flags ?? [],
  bindings,
  // Tipsport/Chance secrets of the old SSR Worker stay on it, so a rollback (wrangler deploy of the SSR build) still works.
  keep_bindings: ['secret_text'],
  observability: { enabled: true, head_sampling_rate: 0.1 },
  assets: { jwt, config: { ...m.config, ...(m.redirects ? { _redirects: m.redirects } : {}), ...(m.headers ? { _headers: m.headers } : {}) } },
};
const form = new FormData();
form.set('metadata', new File([JSON.stringify(meta)], 'metadata.json', { type: 'application/json' }));
form.set('edge.js', new File([fs.readFileSync(bundleFile)], 'edge.js', { type: 'application/javascript+module' }));
await api('PUT', `/accounts/${ACCOUNT}/workers/scripts/${m.worker}`, form, AUTH);
// Workers Free: the account's 5 cron triggers belong to the hub; the SSR era's crons must not fire the edge Worker.
const sched = await api('GET', `/accounts/${ACCOUNT}/workers/scripts/${m.worker}/schedules`, undefined, AUTH);
if ((sched?.schedules ?? []).length) {
  await api('PUT', `/accounts/${ACCOUNT}/workers/scripts/${m.worker}/schedules`, '[]', { ...AUTH, 'Content-Type': 'application/json' });
  console.error(`deploy: ${m.worker}: removed ${sched.schedules.length} cron trigger(s)`);
}
console.log(JSON.stringify({ worker: m.worker, total: Object.keys(manifest).length, uploaded: need.length, bytes,
  hashes: Object.fromEntries(Object.entries(manifest).map(([p, e]) => [p, [e.hash, e.size]])) }));
