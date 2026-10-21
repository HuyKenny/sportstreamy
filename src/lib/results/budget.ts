import type { Db } from './db';

/**
 * Reserve one provider request before making it. Atomic in SQLite/D1: the UPDATE only succeeds while we are under
 * our own daily cap AND the provider's last reported remaining quota is above `floor` (the key is shared with other
 * projects, so our counter alone is not enough). Retries reserve again — every HTTP call counts.
 */
export async function reserve(db: Db, provider: string, day: string, cap: number, floor: number): Promise<boolean> {
  await db.prepare('INSERT OR IGNORE INTO api_usage (provider, day, used, cap) VALUES (?, ?, 0, ?)').bind(provider, day, cap).run();
  const r = await db
    .prepare('UPDATE api_usage SET used = used + 1, cap = ? WHERE provider = ? AND day = ? AND used < ? AND (remaining_reported IS NULL OR remaining_reported > ?) RETURNING used')
    .bind(cap, provider, day, cap, floor)
    .first<{ used: number }>();
  return !!r;
}

/** Give a reservation back: the provider rejected the request without counting it (per-minute limit). */
export async function refund(db: Db, provider: string, day: string): Promise<void> {
  await db.prepare('UPDATE api_usage SET used = MAX(used - 1, 0) WHERE provider = ? AND day = ?').bind(provider, day).run();
}

/** Store what the provider says is left today (rate-limit headers), the source of truth for a shared key. */
export async function reportRemaining(db: Db, provider: string, day: string, remaining: number): Promise<void> {
  await db.prepare('UPDATE api_usage SET remaining_reported = ? WHERE provider = ? AND day = ?').bind(remaining, provider, day).run();
}

/** Lease lock: only one run of a job at a time; a crashed run frees it when the lease expires. */
export async function acquire(db: Db, name: string, owner: string, now: number, ttlMs: number): Promise<boolean> {
  const r = await db
    .prepare('INSERT INTO locks (name, owner, until) VALUES (?, ?, ?) ON CONFLICT (name) DO UPDATE SET owner = excluded.owner, until = excluded.until WHERE locks.until < ? RETURNING owner')
    .bind(name, owner, now + ttlMs, now)
    .first<{ owner: string }>();
  return r?.owner === owner;
}

export async function release(db: Db, name: string, owner: string): Promise<void> {
  await db.prepare('DELETE FROM locks WHERE name = ? AND owner = ?').bind(name, owner).run();
}

export interface RunResult { skipped?: boolean; seen?: number; written?: number; review?: number; error?: string }

/** Run a sync job under its lock and log it to sync_runs (last success / last error for the ops view). */
export async function runJob(db: Db, job: string, now: number, ttlMs: number, fn: () => Promise<RunResult>): Promise<RunResult> {
  const owner = `${job}:${now}:${Math.random().toString(36).slice(2, 8)}`;
  if (!(await acquire(db, job, owner, now, ttlMs))) return { skipped: true };
  const run = await db.prepare('INSERT INTO sync_runs (job, started) VALUES (?, ?) RETURNING id').bind(job, now).first<{ id: number }>();
  try {
    const r = await fn();
    await db.prepare('UPDATE sync_runs SET finished = ?, ok = 1, seen = ?, written = ?, review = ? WHERE id = ?')
      .bind(Date.now(), r.seen ?? 0, r.written ?? 0, r.review ?? 0, run?.id ?? 0).run();
    return r;
  } catch (e) {
    const error = String(e instanceof Error ? e.message : e).slice(0, 300);
    await db.prepare('UPDATE sync_runs SET finished = ?, ok = 0, error = ? WHERE id = ?').bind(Date.now(), error, run?.id ?? 0).run();
    return { error };
  } finally {
    await release(db, job, owner);
  }
}
