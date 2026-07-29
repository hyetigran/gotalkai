import type { Pool, PoolClient } from 'pg';

/**
 * PRD §9: "a daily session cap... not just a client-side nag" — bounds
 * COGS for a power user without contradicting the product's own
 * pedagogical stance ("distributed practice beats massed practice").
 * Thrown by `createSession` (src/sessions.ts) and translated by the
 * server into a 429, never a silent no-op — the point is that a direct
 * API call can't bypass it either (ticket #24's UAT #3).
 */
export class DailySessionCapReachedError extends Error {
  constructor(public readonly cap: number) {
    super(`daily session cap of ${cap} reached`);
    this.name = 'DailySessionCapReachedError';
  }
}

/** Pure: whether today's count has already reached (or exceeded) the cap. */
export function hasReachedDailyCap(todaysSessionCount: number, cap: number): boolean {
  return todaysSessionCount >= cap;
}

/**
 * Sessions this learner has started since the start of today, in the
 * database server's own clock/timezone (`date_trunc('day', now())`) — a
 * single source of truth for "today" rather than trusting a client- or
 * app-server-supplied timestamp, which is exactly the kind of check a
 * modified client could otherwise spoof.
 *
 * Accepts a `Pool` or a checked-out `PoolClient` — `createSession`
 * (src/sessions.ts) calls this from inside a transaction holding a
 * per-learner advisory lock, so the count-then-insert can't race two
 * concurrent requests into both passing the check before either commits.
 */
export async function countSessionsToday(pool: Pool | PoolClient, learnerId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::int AS count
     FROM sessions
     WHERE learner_id = $1
       AND started_at >= date_trunc('day', now())`,
    [learnerId],
  );
  return Number(result.rows[0]?.count ?? 0);
}
