import { Pool } from 'pg';

import { applySchema } from '../db/schema';
import { recordTurn } from '../turns/turns';
import { endSession, getSessionSummary } from './session-summary';

/** Runs against a REAL local Postgres instance, matching turns.test.ts's own precedent. */
describe('getSessionSummary / endSession', () => {
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

  async function makeSession(): Promise<string> {
    const learnerResult = await pool.query<{ id: string }>('INSERT INTO learners DEFAULT VALUES RETURNING id');
    const learnerRow = learnerResult.rows[0];
    if (!learnerRow)
      throw new Error('insert did not return a row');
    createdLearnerIds.push(learnerRow.id);
    const sessionResult = await pool.query<{ id: string }>(
      'INSERT INTO sessions (learner_id) VALUES ($1) RETURNING id',
      [learnerRow.id],
    );
    const sessionRow = sessionResult.rows[0];
    if (!sessionRow)
      throw new Error('insert did not return a row');
    return sessionRow.id;
  }

  describe('getSessionSummary', () => {
    it('returns null for a nonexistent session', async () => {
      const summary = await getSessionSummary(pool, '00000000-0000-0000-0000-000000000000');
      expect(summary).toBeNull();
    });

    it('returns zeroed counts and no ended_at for a session with no turns yet', async () => {
      const sessionId = await makeSession();
      const summary = await getSessionSummary(pool, sessionId);
      expect(summary).toMatchObject({
        totalTurns: 0,
        personaTurns: 0,
        learnerTurns: 0,
        revealedCount: 0,
        understoodCount: 0,
        endedAt: null,
      });
      expect(typeof summary?.startedAt).toBe('string');
    });

    it('aggregates real turns into the debrief-screen figures', async () => {
      const sessionId = await makeSession();
      await recordTurn(pool, sessionId, { speaker: 'persona', content: 'Здравствуй!', comprehension: 'understood' });
      await recordTurn(pool, sessionId, { speaker: 'learner', content: 'Привет!' });
      await recordTurn(pool, sessionId, { speaker: 'persona', content: 'Как дела?', comprehension: 'not_understood', revealed: true });
      await recordTurn(pool, sessionId, { speaker: 'learner', content: 'Хорошо!' });

      const summary = await getSessionSummary(pool, sessionId);
      expect(summary).toMatchObject({
        totalTurns: 4,
        personaTurns: 2,
        learnerTurns: 2,
        // one of the two persona turns was revealed, so "understood her without help" = 2 - 1 = 1
        revealedCount: 1,
        // one of the two persona turns had comprehension: 'understood'
        understoodCount: 1,
      });
    });
  });

  describe('endSession', () => {
    it('sets ended_at and returns true', async () => {
      const sessionId = await makeSession();
      const result = await endSession(pool, sessionId);
      expect(result).toBe(true);

      const summary = await getSessionSummary(pool, sessionId);
      expect(summary?.endedAt).not.toBeNull();
    });

    it('is idempotent — a second call does not move ended_at forward', async () => {
      const sessionId = await makeSession();
      await endSession(pool, sessionId);
      const firstSummary = await getSessionSummary(pool, sessionId);

      await endSession(pool, sessionId);
      const secondSummary = await getSessionSummary(pool, sessionId);

      expect(secondSummary?.endedAt).toBe(firstSummary?.endedAt);
    });

    it('returns false for a nonexistent session', async () => {
      const result = await endSession(pool, '00000000-0000-0000-0000-000000000000');
      expect(result).toBe(false);
    });
  });
});
