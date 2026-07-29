import { Pool } from 'pg';

import { applySchema } from '../schema';
import { recordTurn } from '../turns';
import { findCostAlerts, getLearnerCostRollup30Day } from './cost';

describe('findCostAlerts (pure)', () => {
  it('flags only learners whose rolled-up cost exceeds the subscription price', () => {
    const alerts = findCostAlerts(
      [{ learnerId: 'a', totalCostUsd: 15 }, { learnerId: 'b', totalCostUsd: 8 }],
      12,
    );
    expect(alerts).toEqual([{ learnerId: 'a', totalCostUsd: 15, subscriptionPriceUsd: 12 }]);
  });

  it('does not flag a learner exactly at the threshold — "crosses," not "reaches"', () => {
    expect(findCostAlerts([{ learnerId: 'a', totalCostUsd: 12 }], 12)).toEqual([]);
  });
});

/** Runs against a REAL local Postgres instance, matching turns.test.ts's own precedent. */
describe('getLearnerCostRollup30Day', () => {
  const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/lingoai_app_service';
  let pool: Pool;
  let createdLearnerIds: string[];

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await applySchema(pool);
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

  async function makeSession(): Promise<{ learnerId: string; sessionId: string }> {
    const learnerResult = await pool.query<{ id: string }>('INSERT INTO learners DEFAULT VALUES RETURNING id');
    const learnerRow = learnerResult.rows[0];
    if (!learnerRow)
      throw new Error('insert did not return a row');
    createdLearnerIds.push(learnerRow.id);
    const sessionResult = await pool.query<{ id: string }>('INSERT INTO sessions (learner_id) VALUES ($1) RETURNING id', [learnerRow.id]);
    const sessionRow = sessionResult.rows[0];
    if (!sessionRow)
      throw new Error('insert did not return a row');
    return { learnerId: learnerRow.id, sessionId: sessionRow.id };
  }

  it('sums real costed turns for a learner within the trailing 30 days', async () => {
    const { learnerId, sessionId } = await makeSession();
    await recordTurn(pool, sessionId, { speaker: 'persona', content: 'а', costUsd: 0.01 });
    await recordTurn(pool, sessionId, { speaker: 'persona', content: 'б', costUsd: 0.02 });
    // No cost recorded — must not contribute NaN/null to the sum.
    await recordTurn(pool, sessionId, { speaker: 'learner', content: 'в' });

    const rollup = await getLearnerCostRollup30Day(pool);
    const row = rollup.find(r => r.learnerId === learnerId);
    expect(row?.totalCostUsd).toBeCloseTo(0.03);
  });

  it('excludes a learner with no costed turns entirely', async () => {
    const { learnerId } = await makeSession();
    const rollup = await getLearnerCostRollup30Day(pool);
    expect(rollup.some(r => r.learnerId === learnerId)).toBe(false);
  });
});
