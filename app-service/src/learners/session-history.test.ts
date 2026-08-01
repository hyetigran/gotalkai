import { Pool } from 'pg';

import { getSessionHistoryForLearner } from './session-history';
import { applySchema } from '../db/schema';

/** Runs against a REAL local Postgres instance, matching address-book.test.ts's own precedent. */
describe('getSessionHistoryForLearner', () => {
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

  async function makeSession(learnerId: string, startedAt: Date): Promise<string> {
    const result = await pool.query<{ id: string }>(
      'INSERT INTO sessions (learner_id, started_at) VALUES ($1, $2) RETURNING id',
      [learnerId, startedAt],
    );
    const row = result.rows[0];
    if (!row)
      throw new Error('insert did not return a row');
    return row.id;
  }

  async function makeTurn(sessionId: string, speaker: 'persona' | 'learner'): Promise<void> {
    await pool.query(
      'INSERT INTO turns (session_id, speaker, content) VALUES ($1, $2, $3)',
      [sessionId, speaker, 'реплика'],
    );
  }

  async function promoteDebriefItem(sessionId: string, learnerId: string, rank: number, kind: string): Promise<void> {
    const observation = await pool.query<{ id: string }>(
      'INSERT INTO observations (session_id, learner_id, kind, detail) VALUES ($1, $2, $3, $4) RETURNING id',
      [sessionId, learnerId, kind, JSON.stringify({})],
    );
    const observationId = observation.rows[0]?.id;
    await pool.query(
      'INSERT INTO debrief_items (session_id, observation_id, rank) VALUES ($1, $2, $3)',
      [sessionId, observationId, rank],
    );
  }

  it('returns sessions most-recent-first, with real turn counts and the #1-ranked pattern', async () => {
    const learnerId = await makeLearner();
    const olderSessionId = await makeSession(learnerId, new Date('2026-07-01T10:00:00Z'));
    await makeTurn(olderSessionId, 'learner');
    await makeTurn(olderSessionId, 'persona');
    await promoteDebriefItem(olderSessionId, learnerId, 0, 'aspect_error');
    await promoteDebriefItem(olderSessionId, learnerId, 1, 'stress_error');
    const newerSessionId = await makeSession(learnerId, new Date('2026-07-15T10:00:00Z'));
    await makeTurn(newerSessionId, 'learner');

    const history = await getSessionHistoryForLearner(pool, learnerId);

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ id: newerSessionId, turnCount: 1, topPattern: null });
    expect(history[1]).toMatchObject({ id: olderSessionId, turnCount: 2, topPattern: { kind: 'aspect_error', detail: {} } });
  });

  it('includes a session with zero turns and zero debrief items rather than omitting it', async () => {
    const learnerId = await makeLearner();
    const sessionId = await makeSession(learnerId, new Date());

    const history = await getSessionHistoryForLearner(pool, learnerId);

    expect(history).toEqual([{ id: sessionId, startedAt: expect.any(String), endedAt: null, turnCount: 0, topPattern: null }]);
  });

  it('never returns another learner\'s sessions', async () => {
    const learnerId = await makeLearner();
    const otherLearnerId = await makeLearner();
    await makeSession(otherLearnerId, new Date());

    const history = await getSessionHistoryForLearner(pool, learnerId);

    expect(history).toEqual([]);
  });
});
