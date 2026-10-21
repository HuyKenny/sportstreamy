import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { Db, Stmt } from '../src/lib/results/db';

/** In-memory SQLite with the D1 surface the results code uses, loaded with the real migration. */
export function testDb(): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  for (const f of ['0001_results.sql', '0002_apifootball.sql']) raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  const changes = () => Number((raw.prepare('SELECT changes() AS c').get() as { c: number }).c);
  const stmt = (sql: string, args: unknown[] = []): Stmt => {
    const a = () => args.map((v) => (typeof v === 'boolean' ? Number(v) : v === undefined ? null : v)) as never[];
    return {
      bind: (...v: unknown[]) => stmt(sql, v),
      first: async <T>() => (raw.prepare(sql).get(...a()) ?? null) as T | null,
      // node:sqlite executes writes through all() too (returning [] or the RETURNING rows).
      all: async <T>() => ({ results: raw.prepare(sql).all(...a()) as T[] }),
      run: async () => {
        raw.prepare(sql).all(...a());
        return { meta: { changes: changes() } };
      },
    };
  };
  return {
    raw,
    prepare: (sql) => stmt(sql),
    // D1 runs a batch as one transaction and returns { results, meta } per statement.
    batch: async (list) => {
      raw.exec('BEGIN');
      try {
        const out = [];
        for (const s of list) {
          const r = await s.all();
          out.push({ results: r.results, meta: { changes: changes() } });
        }
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
