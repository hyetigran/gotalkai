import type { Pool } from 'pg';
import type { P95BudgetBreach, P95ByStage, TurnTimings } from './p95-math';
import { computeP95ByStage, computeStageDurations, findP95BudgetBreach } from './p95-math';

/**
 * Ticket #29: DB-fetch half of the P95 tracing check — reads the
 * `timings` this ticket's own turn-persistence write path (turns.ts)
 * now populates. Only persona rows ever carry real six-timestamp data
 * (turn-orchestrator.ts's cascade timing describes the pipeline
 * processing a persona reply, not the learner's own utterance) — learner
 * rows are excluded, not silently included with null-derived garbage.
 */
export async function getRecentStageP95(pool: Pool, windowHours = 24): Promise<P95ByStage | null> {
  const result = await pool.query<{ timings: TurnTimings }>(
    `SELECT timings FROM turns
     WHERE speaker = 'persona' AND timings IS NOT NULL AND created_at >= now() - ($1 || ' hours')::interval`,
    [windowHours],
  );
  if (result.rows.length === 0)
    return null;
  const durations = result.rows.map(row => computeStageDurations(row.timings));
  return computeP95ByStage(durations);
}

export async function checkP95Budget(pool: Pool, budgetMs: number, windowHours = 24): Promise<P95BudgetBreach | null> {
  const p95 = await getRecentStageP95(pool, windowHours);
  if (!p95)
    return null;
  return findP95BudgetBreach(p95, budgetMs);
}
