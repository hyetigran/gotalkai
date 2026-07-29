import type { Pool } from 'pg';

/**
 * Retention policy for `sessions`/`turns` (PRD §7.7: "Turn-level rows
 * carrying `timings` JSONB are the highest-volume table by an order of
 * magnitude. Set the policy before the data exists.").
 *
 * Deletes `sessions` older than `retentionDays` (by `started_at`);
 * `turns`, `observations`, and `debrief_items` cascade-delete with them
 * via the FK graph in schema.sql. `learner_structures`, `persona_memories`,
 * and `persona_world_state` are per-learner, not per-session, and are
 * untouched — the policy only covers what PRD §7.7 names.
 */
export async function deleteExpiredSessions(pool: Pool, retentionDays: number): Promise<number> {
  const result = await pool.query(
    "DELETE FROM sessions WHERE started_at < now() - ($1 || ' days')::interval",
    [retentionDays],
  );
  return result.rowCount ?? 0;
}
