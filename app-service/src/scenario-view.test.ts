import { Pool } from 'pg';

import { applySchema } from './schema';
import { getScenarioViewForSession } from './scenario-view';
import { seedScenarios } from './seed-scenarios';

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

describe('getScenarioViewForSession', () => {
  it('resolves a session\'s scenario_id/complication level into the full ladder and current-step content', async () => {
    const learnerId = await makeLearner();
    const scenarios = await pool.query<{ id: string; title: string }>('SELECT id, title FROM scenarios LIMIT 1');
    const scenario = scenarios.rows[0];
    if (!scenario)
      throw new Error('expected at least one seeded scenario');

    const sessionResult = await pool.query<{ id: string }>(
      `INSERT INTO sessions (learner_id, scenario_id, scenario_sessions_since_last_use, calibration)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [learnerId, scenario.id, 2, JSON.stringify({ complicationLevel: 1 })],
    );
    const sessionId = sessionResult.rows[0]?.id;
    if (!sessionId)
      throw new Error('insert did not return a row');

    const expectedIntro = await pool.query<{ intro: string }>(
      'SELECT intro FROM scenario_complications WHERE scenario_id = $1 AND level = 1',
      [scenario.id],
    );

    const view = await getScenarioViewForSession(pool, sessionId);
    expect(view).not.toBeNull();
    expect(view?.title).toBe(scenario.title);
    expect(view?.ladder).toHaveLength(3);
    expect(view?.currentStepIndex).toBe(1);
    expect(view?.sessionsSinceLastUse).toBe(2);
    // The current step's own intro (level 1), not some other level's.
    expect(view?.intro).toBe(expectedIntro.rows[0]?.intro);
  });

  it('returns null for a session with no scenario assigned', async () => {
    const learnerId = await makeLearner();
    const sessionResult = await pool.query<{ id: string }>(
      'INSERT INTO sessions (learner_id) VALUES ($1) RETURNING id',
      [learnerId],
    );
    const sessionId = sessionResult.rows[0]?.id;
    if (!sessionId)
      throw new Error('insert did not return a row');

    const view = await getScenarioViewForSession(pool, sessionId);
    expect(view).toBeNull();
  });

  it('returns null for a nonexistent session', async () => {
    const view = await getScenarioViewForSession(pool, '00000000-0000-0000-0000-000000000000');
    expect(view).toBeNull();
  });
});
