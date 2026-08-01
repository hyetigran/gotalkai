import { Pool } from 'pg';

import { applySchema } from '../db/schema';
import { markTurnRevealed, recordInterruption, recordTurn } from './turns';

/** Runs against a REAL local Postgres instance, matching persona-memories.test.ts's own precedent. */
describe('recordTurn / markTurnRevealed / recordInterruption', () => {
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

  const TIMINGS = { t0TurnDetected: 0, t1SttFinal: 10, t2PersonaStart: 20, t3PersonaComplete: 100, t4StressAnnotated: 110, t5FirstAudio: 150 };

  it('writes a real learner turn row that a later read finds', async () => {
    const sessionId = await makeSession();
    const id = await recordTurn(pool, sessionId, { speaker: 'learner', content: 'Привет!' });

    const stored = await pool.query('SELECT session_id, speaker, content, revealed, timings, cost_usd FROM turns WHERE id = $1', [id]);
    expect(stored.rows).toEqual([{ session_id: sessionId, speaker: 'learner', content: 'Привет!', revealed: false, timings: null, cost_usd: null }]);
  });

  it('writes a real persona turn row with register, timings, and cost', async () => {
    const sessionId = await makeSession();
    const id = await recordTurn(pool, sessionId, {
      speaker: 'persona',
      content: 'Ах, конечно.',
      personaRegister: 'ty',
      timings: TIMINGS,
      costUsd: 0.0042,
    });

    const stored = await pool.query<{ persona_register: string; timings: typeof TIMINGS; cost_usd: string }>(
      'SELECT persona_register, timings, cost_usd FROM turns WHERE id = $1',
      [id],
    );
    const row = stored.rows[0];
    expect(row?.persona_register).toBe('ty');
    expect(row?.timings).toEqual(TIMINGS);
    expect(Number(row?.cost_usd)).toBeCloseTo(0.0042);
  });

  it('markTurnRevealed flips revealed to true and returns true', async () => {
    const sessionId = await makeSession();
    const id = await recordTurn(pool, sessionId, { speaker: 'persona', content: 'Ах, конечно.' });

    const result = await markTurnRevealed(pool, id);
    expect(result).toBe(true);

    const stored = await pool.query<{ revealed: boolean }>('SELECT revealed FROM turns WHERE id = $1', [id]);
    expect(stored.rows[0]?.revealed).toBe(true);
  });

  it('markTurnRevealed returns false for a nonexistent turn id', async () => {
    const result = await markTurnRevealed(pool, '00000000-0000-0000-0000-000000000000');
    expect(result).toBe(false);
  });

  it('recordInterruption stores the elapsed ms and returns true', async () => {
    const sessionId = await makeSession();
    const id = await recordTurn(pool, sessionId, { speaker: 'persona', content: 'Ах, конечно.', timings: TIMINGS });

    const result = await recordInterruption(pool, id, 320);
    expect(result).toBe(true);

    const stored = await pool.query<{ interrupted_after_ms: number }>('SELECT interrupted_after_ms FROM turns WHERE id = $1', [id]);
    expect(stored.rows[0]?.interrupted_after_ms).toBe(320);
  });

  it('recordInterruption returns false for a nonexistent turn id', async () => {
    const result = await recordInterruption(pool, '00000000-0000-0000-0000-000000000000', 100);
    expect(result).toBe(false);
  });
});
