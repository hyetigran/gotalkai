import { Pool } from 'pg';

import { applySchema } from '../schema';
import { recordTurn } from '../turns';
import { abandonmentByLevel, computeQualityMetricsReport, falseInterruptionRate, repeatRequestRate, revealRate } from './metrics';

/** Runs against a REAL local Postgres instance, matching turns.test.ts's own precedent. */
describe('derived quality metrics (ticket #29)', () => {
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

  async function makeSession(complicationLevel: number): Promise<string> {
    const learnerResult = await pool.query<{ id: string }>('INSERT INTO learners DEFAULT VALUES RETURNING id');
    const learnerRow = learnerResult.rows[0];
    if (!learnerRow)
      throw new Error('insert did not return a row');
    createdLearnerIds.push(learnerRow.id);
    const sessionResult = await pool.query<{ id: string }>(
      'INSERT INTO sessions (learner_id, calibration) VALUES ($1, $2) RETURNING id',
      [learnerRow.id, JSON.stringify({ complicationLevel })],
    );
    const sessionRow = sessionResult.rows[0];
    if (!sessionRow)
      throw new Error('insert did not return a row');
    return sessionRow.id;
  }

  it('falseInterruptionRate groups real interrupted_after_ms values by the session\'s own calibration level', async () => {
    const sessionId = await makeSession(2);
    const nearId = await recordTurn(pool, sessionId, { speaker: 'persona', content: 'а' });
    await pool.query('UPDATE turns SET interrupted_after_ms = 200 WHERE id = $1', [nearId]);
    const farId = await recordTurn(pool, sessionId, { speaker: 'persona', content: 'б' });
    await pool.query('UPDATE turns SET interrupted_after_ms = 900 WHERE id = $1', [farId]);
    // No interruption recorded — must not appear as a false 0ms interruption.
    await recordTurn(pool, sessionId, { speaker: 'persona', content: 'в' });

    const result = await falseInterruptionRate(pool);
    const level2 = result.find(row => row.level === '2');
    expect(level2).toEqual({ level: '2', falseInterruptionRate: 0.5, totalInterruptions: 2 });
  });

  it('revealRate reads real revealed persona turns from the database', async () => {
    const sessionId = await makeSession(0);
    const revealedId = await recordTurn(pool, sessionId, { speaker: 'persona', content: 'а' });
    await pool.query('UPDATE turns SET revealed = true WHERE id = $1', [revealedId]);
    await recordTurn(pool, sessionId, { speaker: 'persona', content: 'б' });

    const rate = await revealRate(pool);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThanOrEqual(1);
  });

  it('abandonmentByLevel reflects real per-session turn counts grouped by level', async () => {
    const sessionId = await makeSession(1);
    await recordTurn(pool, sessionId, { speaker: 'learner', content: 'а' });
    await recordTurn(pool, sessionId, { speaker: 'persona', content: 'б' });

    const result = await abandonmentByLevel(pool);
    const level1 = result.find(row => row.level === '1');
    expect(level1?.sessionCount).toBeGreaterThanOrEqual(1);
  });

  it('repeatRequestRate reads real learner turn content', async () => {
    const sessionId = await makeSession(0);
    await recordTurn(pool, sessionId, { speaker: 'learner', content: 'Что?' });
    await recordTurn(pool, sessionId, { speaker: 'learner', content: 'Понятно, спасибо.' });

    const rate = await repeatRequestRate(pool);
    expect(rate).toBeGreaterThan(0);
  });

  it('computeQualityMetricsReport assembles all four metrics from real data in one call', async () => {
    const sessionId = await makeSession(0);
    await recordTurn(pool, sessionId, { speaker: 'learner', content: 'Привет' });
    await recordTurn(pool, sessionId, { speaker: 'persona', content: 'Ах, конечно.' });

    const report = await computeQualityMetricsReport(pool);
    expect(Array.isArray(report.falseInterruptionRate)).toBe(true);
    expect(typeof report.revealRate).toBe('number');
    expect(Array.isArray(report.abandonmentByLevel)).toBe(true);
    expect(typeof report.repeatRequestRate).toBe('number');
  });
});
