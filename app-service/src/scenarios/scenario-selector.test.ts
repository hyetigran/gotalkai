import { Pool } from 'pg';

import { applySchema } from '../db/schema';
import { selectNextScenario } from './scenario-selector';
import { seedScenarios } from './seed-scenarios';

/**
 * Runs against a REAL local Postgres instance, no mocking — matching the
 * precedent set in server.test.ts/debrief.test.ts.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/lingoai_app_service';

let pool: Pool;
let createdLearnerIds: string[];

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  await applySchema(pool);
  await seedScenarios(pool);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(() => {
  createdLearnerIds = [];
});

afterEach(async () => {
  if (createdLearnerIds.length > 0)
    await pool.query('DELETE FROM learners WHERE id = ANY($1)', [createdLearnerIds]);
});

async function makeLearner(): Promise<string> {
  const result = await pool.query<{ id: string }>('INSERT INTO learners DEFAULT VALUES RETURNING id');
  const row = result.rows[0];
  if (!row)
    throw new Error('insert did not return a row');
  createdLearnerIds.push(row.id);
  return row.id;
}

async function makeSessionWithScenario(learnerId: string, scenarioId: string, level: number, startedAt: Date = new Date()): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO sessions (learner_id, scenario_id, calibration, started_at)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [learnerId, scenarioId, JSON.stringify({ complicationLevel: level }), startedAt],
  );
  const row = result.rows[0];
  if (!row)
    throw new Error('insert did not return a row');
  return row.id;
}

async function setStructurePerformance(learnerId: string, structureKey: string, successes: number, attempts: number, avoidances = 0): Promise<void> {
  await pool.query(
    `INSERT INTO learner_structures (learner_id, structure_key, successes, attempts, avoidances)
     VALUES ($1, $2, $3, $4, $5)`,
    [learnerId, structureKey, successes, attempts, avoidances],
  );
}

describe('selectNextScenario', () => {
  it('a first-ever session holds at complication level 0 (no performance signal yet)', async () => {
    const learnerId = await makeLearner();
    const selection = await selectNextScenario(pool, learnerId);
    expect(selection.level).toBe(0);
    expect(selection.sessionsSinceLastUse).toBeNull();
  });

  it('escalates complication level after strong prior performance', async () => {
    const learnerId = await makeLearner();
    const scenarios = await pool.query<{ id: string }>('SELECT id FROM scenarios LIMIT 1');
    const scenarioId = scenarios.rows[0]?.id;
    if (!scenarioId)
      throw new Error('expected at least one seeded scenario');

    await makeSessionWithScenario(learnerId, scenarioId, 0, new Date(Date.now() - 60_000));
    await setStructurePerformance(learnerId, 'aspect_perfective', 9, 10); // 90% success

    const selection = await selectNextScenario(pool, learnerId);
    expect(selection.level).toBe(1);
  });

  it('de-escalates complication level after struggle', async () => {
    const learnerId = await makeLearner();
    const scenarios = await pool.query<{ id: string }>('SELECT id FROM scenarios LIMIT 1');
    const scenarioId = scenarios.rows[0]?.id;
    if (!scenarioId)
      throw new Error('expected at least one seeded scenario');

    await makeSessionWithScenario(learnerId, scenarioId, 2, new Date(Date.now() - 60_000));
    await setStructurePerformance(learnerId, 'aspect_perfective', 1, 10); // 10% success

    const selection = await selectNextScenario(pool, learnerId);
    expect(selection.level).toBe(1);
  });

  it('heavy avoidance de-escalates even with a decent raw success rate on attempted structures (PRD §5.5)', async () => {
    const learnerId = await makeLearner();
    const scenarios = await pool.query<{ id: string }>('SELECT id FROM scenarios LIMIT 1');
    const scenarioId = scenarios.rows[0]?.id;
    if (!scenarioId)
      throw new Error('expected at least one seeded scenario');

    await makeSessionWithScenario(learnerId, scenarioId, 2, new Date(Date.now() - 60_000));
    // 4/5 of attempted structures succeed (80% raw success rate — would
    // escalate on its own), but the learner avoided the structure 20
    // times — steering around it counts against readiness the same way
    // a failed attempt would, so the real rate is 4/25, not 4/5.
    await setStructurePerformance(learnerId, 'aspect_perfective', 4, 5, 20);

    const selection = await selectNextScenario(pool, learnerId);
    expect(selection.level).toBe(1);
  });

  it('prefers a never-used scenario over one the learner has already had', async () => {
    const learnerId = await makeLearner();
    const scenarios = await pool.query<{ id: string }>('SELECT id FROM scenarios ORDER BY scene_key');
    const usedScenarioId = scenarios.rows[0]?.id;
    const neverUsedScenarioId = scenarios.rows[1]?.id;
    if (!usedScenarioId || !neverUsedScenarioId)
      throw new Error('expected at least two seeded scenarios');

    await makeSessionWithScenario(learnerId, usedScenarioId, 0);

    const selection = await selectNextScenario(pool, learnerId);
    expect(selection.scenarioId).toBe(neverUsedScenarioId);
    expect(selection.sessionsSinceLastUse).toBeNull();
  });

  it('tracks sessions-since-last-use across a real sequence of sessions', async () => {
    const learnerId = await makeLearner();
    const scenarios = await pool.query<{ id: string }>('SELECT id FROM scenarios ORDER BY scene_key');
    const scenarioA = scenarios.rows[0]?.id;
    const scenarioB = scenarios.rows[1]?.id;
    if (!scenarioA || !scenarioB)
      throw new Error('expected at least two seeded scenarios');

    // Session 1 uses A, session 2 uses B — by session 3, A was used 1 session ago.
    await makeSessionWithScenario(learnerId, scenarioA, 0, new Date(Date.now() - 3 * 60_000));
    await makeSessionWithScenario(learnerId, scenarioB, 0, new Date(Date.now() - 2 * 60_000));

    const selection = await selectNextScenario(pool, learnerId);
    expect(selection.scenarioId).toBe(scenarioA);
    expect(selection.sessionsSinceLastUse).toBe(1);
  });

  // The "no scenarios available" error path (scenario-selector.ts's thin
  // wrapper around selectLeastRecentlyUsedScenario) is covered by the
  // pure-function unit test in scenario-selection.test.ts ("throws on an
  // empty candidate list"). Not re-tested here against real Postgres:
  // doing so would mean deleting every row from the shared `scenarios`
  // table this database uses, racing against other test files querying
  // the same local Postgres instance in parallel worker processes.
});
