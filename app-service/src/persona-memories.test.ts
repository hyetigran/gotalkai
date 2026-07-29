import { inspect } from 'node:util';

import { Pool } from 'pg';

import { recordPersonaMemory, selectAndMarkCallbackMemory, wrapPersonaMemoryContent } from './persona-memories';
import { applySchema } from './schema';

describe('RedactedMemoryContent', () => {
  const secret = 'her cat Marfa was sick last week';

  it('redacts on toString', () => {
    const wrapped = wrapPersonaMemoryContent(secret);
    expect(String(wrapped)).toBe('[REDACTED:persona_memory]');
    expect(String(wrapped)).not.toContain(secret);
  });

  it('redacts on JSON.stringify', () => {
    const wrapped = wrapPersonaMemoryContent(secret);
    expect(JSON.stringify(wrapped)).toBe('"[REDACTED:persona_memory]"');
  });

  it('redacts on console.log-style formatting (util.inspect)', () => {
    const wrapped = wrapPersonaMemoryContent(secret);
    expect(inspect(wrapped)).toBe('[REDACTED:persona_memory]');
    expect(inspect({ content: wrapped })).not.toContain(secret);
  });

  it('reveals the real value only via the explicit reveal() call', () => {
    const wrapped = wrapPersonaMemoryContent(secret);
    expect(wrapped.reveal()).toBe(secret);
  });
});

/**
 * Runs against a REAL local Postgres instance, no mocking — matching the
 * precedent set in debrief.test.ts/scenario-selector.test.ts.
 */
describe('recordPersonaMemory / selectAndMarkCallbackMemory', () => {
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

  it('writes a real row that a later read finds', async () => {
    const learnerId = await makeLearner();
    const content = 'Она спрашивала про поездку в Ярославль.';
    const id = await recordPersonaMemory(pool, learnerId, content);
    expect(typeof id).toBe('string');

    const stored = await pool.query('SELECT content FROM persona_memories WHERE id = $1', [id]);
    expect(stored.rows).toEqual([{ content }]);
  });

  it('returns null for a learner with no memories at all', async () => {
    const learnerId = await makeLearner();
    const callbackLine = await selectAndMarkCallbackMemory(pool, learnerId);
    expect(callbackLine).toBeNull();
  });

  it('picks the never-referenced memory over an already-referenced one, and marks it referenced', async () => {
    const learnerId = await makeLearner();
    const olderId = await recordPersonaMemory(pool, learnerId, 'старое воспоминание');
    await pool.query('UPDATE persona_memories SET last_referenced_at = now() WHERE id = $1', [olderId]);
    const freshId = await recordPersonaMemory(pool, learnerId, 'новое воспоминание');

    const callbackLine = await selectAndMarkCallbackMemory(pool, learnerId);
    expect(callbackLine).toBe('новое воспоминание');

    const freshRow = await pool.query<{ last_referenced_at: Date | null }>('SELECT last_referenced_at FROM persona_memories WHERE id = $1', [freshId]);
    expect(freshRow.rows[0]?.last_referenced_at).not.toBeNull();
  });

  it('rotates through memories rather than always returning the same one — the effect is observable, not just present in code', async () => {
    const learnerId = await makeLearner();
    await recordPersonaMemory(pool, learnerId, 'первое');
    await recordPersonaMemory(pool, learnerId, 'второе');

    const first = await selectAndMarkCallbackMemory(pool, learnerId);
    const second = await selectAndMarkCallbackMemory(pool, learnerId);
    const third = await selectAndMarkCallbackMemory(pool, learnerId);

    expect(first).not.toBe(second);
    // With only two memories, the third call cycles back to whichever
    // was referenced longest ago — the first one again.
    expect(third).toBe(first);
  });
});
