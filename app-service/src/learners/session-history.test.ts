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

    const page = await getSessionHistoryForLearner(pool, learnerId);

    expect(page.sessions).toHaveLength(2);
    expect(page.sessions[0]).toMatchObject({ id: newerSessionId, turnCount: 1, topPattern: null });
    expect(page.sessions[1]).toMatchObject({ id: olderSessionId, turnCount: 2, topPattern: { kind: 'aspect_error', detail: {} } });
  });

  it('includes a session with zero turns and zero debrief items rather than omitting it', async () => {
    const learnerId = await makeLearner();
    const sessionId = await makeSession(learnerId, new Date());

    const page = await getSessionHistoryForLearner(pool, learnerId);

    expect(page.sessions).toEqual([{ id: sessionId, startedAt: expect.any(String), endedAt: null, turnCount: 0, topPattern: null }]);
  });

  it('never returns another learner\'s sessions', async () => {
    const learnerId = await makeLearner();
    const otherLearnerId = await makeLearner();
    await makeSession(otherLearnerId, new Date());

    const page = await getSessionHistoryForLearner(pool, learnerId);

    expect(page.sessions).toEqual([]);
  });

  describe('pagination (learner feedback: "loading more on scroll")', () => {
    it('nextCursor is null when every session fits on one page', async () => {
      const learnerId = await makeLearner();
      await makeSession(learnerId, new Date());

      const page = await getSessionHistoryForLearner(pool, learnerId, { limit: 5 });

      expect(page.sessions).toHaveLength(1);
      expect(page.nextCursor).toBeNull();
    });

    it('a limit smaller than the real session count returns exactly `limit` rows and a real nextCursor', async () => {
      const learnerId = await makeLearner();
      const sessionIds = [];
      for (let i = 0; i < 3; i++)
        sessionIds.push(await makeSession(learnerId, new Date(2026, 6, 1 + i, 10)));

      const page = await getSessionHistoryForLearner(pool, learnerId, { limit: 2 });

      expect(page.sessions.map(session => session.id)).toEqual([sessionIds[2], sessionIds[1]]);
      expect(page.nextCursor).toEqual({ startedAt: page.sessions[1]?.startedAt, id: sessionIds[1] });
    });

    it('passing the previous page\'s nextCursor back returns the next older page, with no overlap or gap', async () => {
      const learnerId = await makeLearner();
      const sessionIds = [];
      for (let i = 0; i < 3; i++)
        sessionIds.push(await makeSession(learnerId, new Date(2026, 6, 1 + i, 10)));

      const firstPage = await getSessionHistoryForLearner(pool, learnerId, { limit: 2 });
      expect(firstPage.nextCursor).not.toBeNull();
      const secondPage = await getSessionHistoryForLearner(pool, learnerId, { limit: 2, cursor: firstPage.nextCursor! });

      expect(secondPage.sessions.map(session => session.id)).toEqual([sessionIds[0]]);
      expect(secondPage.nextCursor).toBeNull();
    });

    it('tie-breaks on id when two sessions share the exact same started_at, still with no duplicate or skipped row across pages', async () => {
      const learnerId = await makeLearner();
      const sharedTimestamp = new Date('2026-07-10T10:00:00.000Z');
      const firstId = await makeSession(learnerId, sharedTimestamp);
      const secondId = await makeSession(learnerId, sharedTimestamp);
      // ORDER BY id DESC on a tie: the lexicographically larger id comes first (page 1's "newer" slot).
      const [newerTiedId, olderTiedId] = [firstId, secondId].sort().reverse();

      const firstPage = await getSessionHistoryForLearner(pool, learnerId, { limit: 1 });
      expect(firstPage.sessions[0]?.id).toBe(newerTiedId);
      expect(firstPage.nextCursor).toEqual({ startedAt: sharedTimestamp.toISOString(), id: newerTiedId });

      const secondPage = await getSessionHistoryForLearner(pool, learnerId, { limit: 1, cursor: firstPage.nextCursor! });
      expect(secondPage.sessions[0]?.id).toBe(olderTiedId);
      expect(secondPage.nextCursor).toBeNull();
    });
  });
});
