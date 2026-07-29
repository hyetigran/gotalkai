import type { Pool } from 'pg';

import { computeNextComplicationLevel, selectLeastRecentlyUsedScenario } from './scenario-selection';
import type { ScenarioCandidate } from './scenario-selection';

export type ScenarioSelection = {
  scenarioId: string;
  level: number;
  sessionsSinceLastUse: number | null;
};

async function getPreviousComplicationLevel(pool: Pool, learnerId: string): Promise<number> {
  const result = await pool.query<{ level: string | null }>(
    `SELECT calibration->>'complicationLevel' AS level
     FROM sessions
     WHERE learner_id = $1
     ORDER BY started_at DESC, id DESC
     LIMIT 1`,
    [learnerId],
  );
  const raw = result.rows[0]?.level;
  return raw !== null && raw !== undefined ? Number(raw) : 0;
}

/**
 * successes / (attempts + avoidances) across the learner's tracked
 * structures, or null with no signal at all yet (ticket #21 AC #1:
 * reads learner_structures). Avoidances count against the rate the same
 * way a failed attempt does — PRD §5.5 treats steering around a
 * structure as a stronger signal than an outright error ("You steered
 * around this is more useful than you got this wrong"), so folding it
 * into "no, not ready to escalate" rather than ignoring it entirely
 * matches that. `exposures`/`stability` are deliberately not read here —
 * see docs/adr/0005-complication-level-step-function.md.
 */
async function getPerformanceRate(pool: Pool, learnerId: string): Promise<number | null> {
  const result = await pool.query<{ successes: string; attempts: string; avoidances: string }>(
    `SELECT COALESCE(SUM(successes), 0) AS successes, COALESCE(SUM(attempts), 0) AS attempts, COALESCE(SUM(avoidances), 0) AS avoidances
     FROM learner_structures
     WHERE learner_id = $1`,
    [learnerId],
  );
  const attempts = Number(result.rows[0]?.attempts ?? 0);
  const avoidances = Number(result.rows[0]?.avoidances ?? 0);
  const denominator = attempts + avoidances;
  if (denominator === 0)
    return null;
  return Number(result.rows[0]?.successes ?? 0) / denominator;
}

/** Two queries total regardless of how many scenarios exist — one correlated-subquery lookup for each scenario's last use, one for the learner's full session timeline to count gaps against. */
async function getScenarioCandidates(pool: Pool, learnerId: string): Promise<ScenarioCandidate[]> {
  const scenarioLastUsed = await pool.query<{ id: string; last_used_at: Date | null }>(
    `SELECT s.id,
       (SELECT started_at FROM sessions se WHERE se.learner_id = $1 AND se.scenario_id = s.id ORDER BY se.started_at DESC LIMIT 1) AS last_used_at
     FROM scenarios s`,
    [learnerId],
  );
  const sessionTimes = await pool.query<{ started_at: Date }>(
    'SELECT started_at FROM sessions WHERE learner_id = $1 ORDER BY started_at DESC',
    [learnerId],
  );

  return scenarioLastUsed.rows.map(({ id, last_used_at }): ScenarioCandidate => {
    if (!last_used_at)
      return { id, sessionsSinceLastUse: null };
    const sessionsSinceLastUse = sessionTimes.rows.filter(row => row.started_at > last_used_at).length;
    return { id, sessionsSinceLastUse };
  });
}

/**
 * Selects tomorrow's scenario and complication level from real data
 * (ticket #21 AC #1). Requires at least one seeded scenario
 * (src/seed-scenarios.ts) — throws otherwise, since silently returning
 * nothing would leave the caller with no scenario to assign.
 */
export async function selectNextScenario(pool: Pool, learnerId: string): Promise<ScenarioSelection> {
  const [previousLevel, performanceRate, candidates] = await Promise.all([
    getPreviousComplicationLevel(pool, learnerId),
    getPerformanceRate(pool, learnerId),
    getScenarioCandidates(pool, learnerId),
  ]);
  if (candidates.length === 0)
    throw new Error('no scenarios available — run `pnpm db:migrate` to seed them');

  const chosen = selectLeastRecentlyUsedScenario(candidates);
  const level = computeNextComplicationLevel({ previousLevel, performanceRate });
  return { scenarioId: chosen.id, level, sessionsSinceLastUse: chosen.sessionsSinceLastUse };
}
