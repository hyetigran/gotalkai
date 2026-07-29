import type { Pool } from 'pg';

/**
 * Ticket #29 (PRD §11): "Cost, live. Per session at close, rolling
 * 30-day per user, alert when a user crosses their subscription price."
 * The per-turn `cost_usd` values this rolls up are themselves estimates
 * from captured vendor usage (voice-service's cost.ts), not reconciled
 * invoices — see docs/adr/0022's "Cost" section for why that's the
 * correct reading of "live" here, not a shortcut.
 */

export type LearnerCostRollup = { learnerId: string; totalCostUsd: number };

/** Every learner with at least one costed turn in the trailing 30 days, summed. Learners with zero costed turns don't appear — there's nothing to roll up. */
export async function getLearnerCostRollup30Day(pool: Pool): Promise<LearnerCostRollup[]> {
  const result = await pool.query<{ learner_id: string; total_cost_usd: string }>(
    `SELECT s.learner_id, SUM(t.cost_usd) AS total_cost_usd
     FROM turns t
     JOIN sessions s ON s.id = t.session_id
     WHERE t.cost_usd IS NOT NULL AND t.created_at >= now() - interval '30 days'
     GROUP BY s.learner_id`,
  );
  return result.rows.map(row => ({ learnerId: row.learner_id, totalCostUsd: Number(row.total_cost_usd) }));
}

export type CostAlert = { learnerId: string; totalCostUsd: number; subscriptionPriceUsd: number };

/** Pure: which rollup rows exceed the subscription price — the "alert when a user crosses" half of the AC, kept separate from the fetch so it's unit-testable without a database. */
export function findCostAlerts(rollup: LearnerCostRollup[], subscriptionPriceUsd: number): CostAlert[] {
  return rollup
    .filter(row => row.totalCostUsd > subscriptionPriceUsd)
    .map(row => ({ learnerId: row.learnerId, totalCostUsd: row.totalCostUsd, subscriptionPriceUsd }));
}
