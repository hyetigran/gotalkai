import type { Pool } from 'pg';

export type ScenarioLadderStep = {
  level: number;
  label: string;
};

export type ScenarioView = {
  title: string;
  intro: string;
  ladder: ScenarioLadderStep[];
  currentStepIndex: number;
  sessionsSinceLastUse: number | null;
};

/**
 * Resolves a session's assigned scenario_id/complication level into the
 * full content the Tomorrow screen renders (title, ladder, current
 * step, intro for the assigned level) — ticket #21 AC #4. Returns null
 * if the session has no scenario assigned yet (e.g. it predates this
 * ticket, or scenario selection hasn't run for it).
 */
export async function getScenarioViewForSession(pool: Pool, sessionId: string): Promise<ScenarioView | null> {
  const sessionResult = await pool.query<{ scenario_id: string | null; scenario_sessions_since_last_use: number | null; complication_level: string | null }>(
    `SELECT scenario_id, scenario_sessions_since_last_use, calibration->>'complicationLevel' AS complication_level
     FROM sessions
     WHERE id = $1`,
    [sessionId],
  );
  const session = sessionResult.rows[0];
  if (!session || !session.scenario_id)
    return null;

  const scenarioResult = await pool.query<{ title: string }>('SELECT title FROM scenarios WHERE id = $1', [session.scenario_id]);
  const scenario = scenarioResult.rows[0];
  if (!scenario)
    return null;

  const laddersResult = await pool.query<{ level: number; label: string; intro: string }>(
    'SELECT level, label, intro FROM scenario_complications WHERE scenario_id = $1 ORDER BY level ASC',
    [session.scenario_id],
  );
  const currentStepIndex = session.complication_level !== null ? Number(session.complication_level) : 0;
  const currentStep = laddersResult.rows.find(row => row.level === currentStepIndex);

  return {
    title: scenario.title,
    intro: currentStep?.intro ?? '',
    ladder: laddersResult.rows.map(row => ({ level: row.level, label: row.label })),
    currentStepIndex,
    sessionsSinceLastUse: session.scenario_sessions_since_last_use,
  };
}
