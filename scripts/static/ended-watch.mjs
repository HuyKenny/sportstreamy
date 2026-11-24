#!/usr/bin/env node
// Final results watcher (GitHub Actions, .github/workflows/ended-watch.yml). Tipsport keeps a finished match in the live
// feed with `ended: true` and the final score for only ~1–4 minutes; the live job runs every 10 minutes and misses most of
// them, and api-football (which used to confirm them) is suspended since 24. 11. 2026. So once a minute this reads the
// live feed of OUR OWN Tipsport.sk partner account (ziveprenosy.sk – the Czech account's agreed set of calls stays
// untouched; match ids are the same on both platforms) and keeps the finished matches. The live job applies them to the
// results database (src/lib/results/store.ts applyEnded) for both sites.
//
// Stored encrypted as the release asset `ended.enc` of the `state` release (PUBLIC repo: the log prints counts only).
// Env: TIPSPORT_SK_USER/PASS/PRODUCT_ID, STATE_KEY, GH_TOKEN; WATCH_MINUTES (default 55), KEEP_HOURS (default 12).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';

const HOST = 'https://partners.tipsport.sk';
const UA = 'Mozilla/5.0 (compatible; ZivePrenosy/1.0; +https://ziveprenosy.sk)';
const SPORTS = new Set([16, 23, 7, 47, 20]); // football, hockey, basketball, volleyball, handball (= results sports)
const MINUTES = Number(process.env.WATCH_MINUTES ?? 55);
const KEEP = Number(process.env.KEEP_HOURS ?? 12) * 3600_000;
const TMP = process.env.RUNNER_TEMP ?? '/tmp';
const PLAIN = `${TMP}/ended.json`;
const ENC = `${TMP}/ended.enc`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

const openssl = (args) => execFileSync('openssl', ['enc', ...args, '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-pass', 'env:STATE_KEY'], { stdio: ['ignore', 'ignore', 'inherit'] });

function load() {
  try {
    execFileSync('gh', ['release', 'download', 'state', '-p', 'ended.enc', '-O', ENC, '--clobber'], { stdio: 'ignore' });
    openssl(['-d', '-in', ENC, '-out', PLAIN]);
    return new Map(Object.entries(JSON.parse(readFileSync(PLAIN, 'utf8')).items ?? {}));
  } catch {
    log('no previous ended.enc - starting empty');
    return new Map();
  } finally {
    rmSync(PLAIN, { force: true });
  }
}

function save(items) {
  const now = Date.now();
  for (const [id, it] of items) if (now - it.at > KEEP) items.delete(id);
  writeFileSync(PLAIN, JSON.stringify({ at: now, items: Object.fromEntries(items) }));
  openssl(['-salt', '-in', PLAIN, '-out', ENC]);
  rmSync(PLAIN, { force: true });
  for (let i = 1; i <= 3; i++) {
    try {
      execFileSync('gh', ['release', 'upload', 'state', ENC, '--clobber'], { stdio: 'ignore' });
      return true;
    } catch {
      log(`upload attempt ${i} failed`);
    }
  }
  return false;
}

async function login() {
  const res = await fetch(`${HOST}/rest/external/common/v2/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ username: process.env.TIPSPORT_SK_USER, password: process.env.TIPSPORT_SK_PASS, productId: Number(process.env.TIPSPORT_SK_PRODUCT_ID ?? 3) }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  const j = await res.json();
  const cookie = /JSESSIONID=[^;]+/.exec(res.headers.get('set-cookie') ?? '')?.[0];
  if (!j.sessionToken || !cookie) throw new Error('login: no token/session');
  return { token: j.sessionToken, cookie };
}

async function live(s) {
  const res = await fetch(`${HOST}/rest/external/offer/v2/live/matches`, {
    headers: { Authorization: `Bearer ${s.token}`, Cookie: s.cookie, 'User-Agent': UA, Accept: 'application/json' },
  });
  if (res.status === 401) return null; // session expired: log in again
  if (!res.ok) throw new Error(`live ${res.status}`);
  return (await res.json()).matches ?? [];
}

const KEYS = ['id', 'idSuperSport', 'dateStart', 'ended', 'statusOffer', 'home', 'away', 'homeParticipant', 'visitingParticipant'];

const items = load();
log(`loaded ${items.size} finished matches`);
const until = Date.now() + MINUTES * 60_000;
let s = await login();
let polls = 0, fresh = 0, errors = 0;
while (Date.now() < until) {
  const t0 = Date.now();
  try {
    let list = await live(s);
    if (list === null) { s = await login(); list = (await live(s)) ?? []; }
    polls++;
    for (const m of list) {
      if (!m?.ended || !SPORTS.has(m.idSuperSport) || !m.homeParticipant || !m.visitingParticipant) continue;
      if (m.home === undefined || m.home === null || m.home === '' || m.away === undefined || m.away === null || m.away === '') continue;
      const prev = items.get(String(m.id));
      const it = Object.fromEntries(KEYS.map((k) => [k, m[k]]));
      if (!prev) fresh++;
      // keep the first time we saw it finished; refresh the record (a late correction of the score wins)
      items.set(String(m.id), { ...it, at: prev?.at ?? Date.now() });
    }
  } catch (e) {
    errors++;
    log(`poll failed: ${String(e).slice(0, 80)}`);
    if (errors > 20) break;
  }
  if (polls % 5 === 0 && fresh) { save(items); fresh = 0; }
  await sleep(Math.max(5_000, 60_000 - (Date.now() - t0)));
}
const ok = save(items);
log(`${polls} polls, ${errors} errors, ${items.size} finished matches kept, saved: ${ok}`);
if (existsSync(ENC)) rmSync(ENC);
