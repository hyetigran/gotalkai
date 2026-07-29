import { Pool } from 'pg';

import { applySchema } from '../schema';
import { recordTurn } from '../turns';
import { checkP95Budget, getRecentStageP95 } from './p95';

/** Runs against a REAL local Postgres instance, matching turns.test.ts's own precedent. */
describe('getRecentStageP95 / checkP95Budget', () => {
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
    const sessionResult = await pool.query<{ id: string }>('INSERT INTO sessions (learner_id) VALUES ($1) RETURNING id', [learnerRow.id]);
    const sessionRow = sessionResult.rows[0];
    if (!sessionRow)
      throw new Error('insert did not return a row');
    return sessionRow.id;
  }

  it('returns null when the window excludes every row — a deterministic "no data" case, not dependent on other tests\' cleanup timing', async () => {
    const sessionId = await makeSession();
    await recordTurn(pool, sessionId, { speaker: 'persona', content: 'а', timings: { t0TurnDetected: 0, t1SttFinal: 100, t2PersonaStart: 100, t3PersonaComplete: 400, t4StressAnnotated: 420, t5FirstAudio: 700 } });

    // A negative window pushes the cutoff into the future — no real row's created_at can ever satisfy it.
    const result = await getRecentStageP95(pool, -1);
    expect(result).toBeNull();
  });

  it('computes real per-stage P95 from persisted timings, excluding learner rows', async () => {
    const sessionId = await makeSession();
    const timings = { t0TurnDetected: 0, t1SttFinal: 100, t2PersonaStart: 100, t3PersonaComplete: 400, t4StressAnnotated: 420, t5FirstAudio: 700 };
    await recordTurn(pool, sessionId, { speaker: 'persona', content: 'а', timings });
    // Learner row has no timings — must not pollute the P95 computation even if it somehow carried timings-shaped data.
    await recordTurn(pool, sessionId, { speaker: 'learner', content: 'б' });

    const p95 = await getRecentStageP95(pool);
    expect(p95).not.toBeNull();
    expect(p95?.total).toBeGreaterThanOrEqual(700);
  });

  it('checkP95Budget reports a breach when a real persisted turn exceeds the budget', async () => {
    const sessionId = await makeSession();
    const slowTimings = { t0TurnDetected: 0, t1SttFinal: 100, t2PersonaStart: 100, t3PersonaComplete: 400, t4StressAnnotated: 420, t5FirstAudio: 5000 };
    await recordTurn(pool, sessionId, { speaker: 'persona', content: 'а', timings: slowTimings });

    const breach = await checkP95Budget(pool, 900);
    expect(breach).not.toBeNull();
    expect(breach?.stage).toBe('total');
  });
});
