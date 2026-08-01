import { Pool } from 'pg';

import { countSessionsToday, hasReachedDailyCap } from './session-cap';
import { applySchema } from '../db/schema';

describe('hasReachedDailyCap', () => {
  it('is false below the cap', () => {
    expect(hasReachedDailyCap(0, 1)).toBe(false);
  });

  it('is true at exactly the cap', () => {
    expect(hasReachedDailyCap(1, 1)).toBe(true);
  });

  it('is true above the cap', () => {
    expect(hasReachedDailyCap(3, 1)).toBe(true);
  });

  it('respects a cap greater than 1', () => {
    expect(hasReachedDailyCap(2, 3)).toBe(false);
    expect(hasReachedDailyCap(3, 3)).toBe(true);
  });
});

/**
 * Runs against a REAL local Postgres instance, no mocking — matching the
 * precedent set in debrief.test.ts/scenario-selector.test.ts.
 */
describe('countSessionsToday', () => {
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

  async function makeLearner(): Promise<string> {
    const result = await pool.query<{ id: string }>('INSERT INTO learners DEFAULT VALUES RETURNING id');
    const row = result.rows[0];
    if (!row)
      throw new Error('insert did not return a row');
    createdLearnerIds.push(row.id);
    return row.id;
  }

  async function makeSession(learnerId: string, startedAt: Date): Promise<void> {
    await pool.query('INSERT INTO sessions (learner_id, started_at) VALUES ($1, $2)', [learnerId, startedAt]);
  }

  it('counts only today\'s sessions for this learner', async () => {
    const learnerId = await makeLearner();
    await makeSession(learnerId, new Date());
    await makeSession(learnerId, new Date());
    await makeSession(learnerId, new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)); // two days ago

    const count = await countSessionsToday(pool, learnerId);
    expect(count).toBe(2);
  });

  it('is 0 for a learner with no sessions today', async () => {
    const learnerId = await makeLearner();
    await makeSession(learnerId, new Date(Date.now() - 24 * 60 * 60 * 1000)); // yesterday

    const count = await countSessionsToday(pool, learnerId);
    expect(count).toBe(0);
  });

  it('does not count another learner\'s sessions', async () => {
    const learnerId = await makeLearner();
    const otherLearnerId = await makeLearner();
    await makeSession(otherLearnerId, new Date());

    const count = await countSessionsToday(pool, learnerId);
    expect(count).toBe(0);
  });
});
