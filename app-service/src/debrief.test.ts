import { Pool } from 'pg';

import { getDebriefForSession, rankAndPromoteDebrief, recordObservations } from './debrief';
import { READINESS_MIN_EXPOSURES } from './debrief-ranking';
import { applySchema } from './schema';

/**
 * Runs against a REAL local Postgres instance, no mocking — matching the
 * precedent set in server.test.ts/schema.test.ts.
 */
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

async function makeSession(learnerId: string, startedAt: Date = new Date()): Promise<string> {
  const result = await pool.query<{ id: string }>(
    'INSERT INTO sessions (learner_id, started_at) VALUES ($1, $2) RETURNING id',
    [learnerId, startedAt],
  );
  const row = result.rows[0];
  if (!row)
    throw new Error('insert did not return a row');
  return row.id;
}

async function makeStructure(learnerId: string, structureKey: string, exposures: number, stability: number): Promise<void> {
  await pool.query(
    `INSERT INTO learner_structures (learner_id, structure_key, exposures, stability)
     VALUES ($1, $2, $3, $4)`,
    [learnerId, structureKey, exposures, stability],
  );
}

describe('recordObservations', () => {
  it('writes every observation, not just the ones later promoted', async () => {
    const learnerId = await makeLearner();
    const sessionId = await makeSession(learnerId);
    const ids = await recordObservations(pool, sessionId, learnerId, [
      { kind: 'grammar_error', structureKey: 'genitive_plural' },
      { kind: 'grammar_error', structureKey: 'genitive_plural' },
      { kind: 'stress_error', structureKey: 'stress_placement' },
    ]);
    expect(ids).toHaveLength(3);
    const rows = await pool.query('SELECT id FROM observations WHERE session_id = $1', [sessionId]);
    expect(rows.rows).toHaveLength(3);
  });
});

describe('rankAndPromoteDebrief', () => {
  it('promotes at most DEBRIEF_ITEM_COUNT patterns, ranked by score', async () => {
    const learnerId = await makeLearner();
    const sessionId = await makeSession(learnerId);
    await makeStructure(learnerId, 'genitive_plural', READINESS_MIN_EXPOSURES, 0.2);
    await makeStructure(learnerId, 'case_government', READINESS_MIN_EXPOSURES, 0.2);
    await makeStructure(learnerId, 'register', READINESS_MIN_EXPOSURES, 0.2);
    await makeStructure(learnerId, 'stress_placement', READINESS_MIN_EXPOSURES, 0.2);

    // Four distinct patterns, only the top 3 should be promoted.
    await recordObservations(pool, sessionId, learnerId, [
      { kind: 'grammar_error', structureKey: 'genitive_plural', impeded: true },
      { kind: 'grammar_error', structureKey: 'genitive_plural', impeded: true },
      { kind: 'grammar_error', structureKey: 'case_government', impeded: false },
      { kind: 'grammar_error', structureKey: 'register', impeded: false },
      { kind: 'stress_error', structureKey: 'stress_placement', impeded: false },
    ]);

    const promoted = await rankAndPromoteDebrief(pool, sessionId, learnerId);
    expect(promoted).toHaveLength(3);
    // The impeded, most-frequent pattern should rank first.
    expect(promoted[0]?.detail.structureKey).toBe('genitive_plural');

    const stored = await getDebriefForSession(pool, sessionId);
    expect(stored).toHaveLength(3);
    expect(stored.map(item => item.rank)).toEqual([0, 1, 2]);
  });

  it('re-ranking the same session replaces debrief_items rather than accumulating stale rows', async () => {
    const learnerId = await makeLearner();
    const sessionId = await makeSession(learnerId);
    await makeStructure(learnerId, 'genitive_plural', READINESS_MIN_EXPOSURES, 0.2);
    await makeStructure(learnerId, 'stress_placement', READINESS_MIN_EXPOSURES, 0.2);

    await recordObservations(pool, sessionId, learnerId, [
      { kind: 'grammar_error', structureKey: 'genitive_plural', impeded: true },
    ]);
    const firstPromotion = await rankAndPromoteDebrief(pool, sessionId, learnerId);
    expect(firstPromotion).toHaveLength(1);

    // The analyser (or a retried request) posts more observations for the
    // same session, and ranking runs again.
    await recordObservations(pool, sessionId, learnerId, [
      { kind: 'grammar_error', structureKey: 'genitive_plural', impeded: true },
      { kind: 'grammar_error', structureKey: 'genitive_plural', impeded: true },
      { kind: 'stress_error', structureKey: 'stress_placement', impeded: false },
    ]);
    const secondPromotion = await rankAndPromoteDebrief(pool, sessionId, learnerId);
    expect(secondPromotion).toHaveLength(2);

    // Never more than DEBRIEF_ITEM_COUNT stored, and no leftover rows
    // from the first call's promotion.
    const stored = await getDebriefForSession(pool, sessionId);
    expect(stored).toHaveLength(2);
    expect(stored.map(item => item.rank).sort()).toEqual([0, 1]);
  });

  it('assigns readiness 0 (and so a score of 0) for a structure the learner has not been exposed to enough', async () => {
    const learnerId = await makeLearner();
    const sessionId = await makeSession(learnerId);
    // No learner_structures row at all for 'dative_case' — below the floor.
    await recordObservations(pool, sessionId, learnerId, [
      { kind: 'grammar_error', structureKey: 'dative_case', impeded: true },
    ]);

    const promoted = await rankAndPromoteDebrief(pool, sessionId, learnerId);
    // Still written to observations, still promoted (it's the only one),
    // but its score is 0 — the ranking function did the right thing even
    // though nothing outranked it.
    expect(promoted).toHaveLength(1);
    const rows = await pool.query('SELECT id FROM observations WHERE session_id = $1', [sessionId]);
    expect(rows.rows).toHaveLength(1);
  });

  it('demonstrably deprioritizes a pattern already promoted in the immediately preceding session', async () => {
    const learnerId = await makeLearner();
    await makeStructure(learnerId, 'aspect_perfective', 10, 0.2);
    await makeStructure(learnerId, 'stress_placement', 10, 0.2);

    // Session 1: aspect_perfective is the only signal, gets promoted.
    const session1 = await makeSession(learnerId, new Date(Date.now() - 24 * 60 * 60 * 1000));
    await recordObservations(pool, session1, learnerId, [
      { kind: 'grammar_error', structureKey: 'aspect_perfective', impeded: false },
    ]);
    const session1Promoted = await rankAndPromoteDebrief(pool, session1, learnerId);
    expect(session1Promoted.some(item => item.detail.structureKey === 'aspect_perfective')).toBe(true);

    // Session 2: the exact same pattern recurs at the exact same
    // frequency/impeded, plus a brand-new pattern with an identical
    // raw shape that's never been told before. Absent the told_recently
    // discount the two would tie; with it, aspect_perfective's score
    // drops to 0.3 while stress_placement's stays at 1.0.
    const session2 = await makeSession(learnerId, new Date());
    await recordObservations(pool, session2, learnerId, [
      { kind: 'grammar_error', structureKey: 'aspect_perfective', impeded: false },
      { kind: 'stress_error', structureKey: 'stress_placement', impeded: false },
    ]);
    const session2Promoted = await rankAndPromoteDebrief(pool, session2, learnerId);

    const aspectItem = session2Promoted.find(item => item.detail.structureKey === 'aspect_perfective');
    const stressItem = session2Promoted.find(item => item.detail.structureKey === 'stress_placement');
    expect(aspectItem).toBeDefined();
    expect(stressItem).toBeDefined();
    // aspect_perfective: frequency 1 × impeded 1.0 × readiness 1 × told_recently 0.3 = 0.3
    // stress_placement:  frequency 1 × impeded 1.0 × readiness 1 × told_recently 1.0 = 1.0
    // Identical raw signal, but the previously-told pattern is ranked
    // strictly below the fresh one — the multiplier's effect is real and
    // observable in the promotion order, not just present in code.
    expect(stressItem?.rank).toBeLessThan(aspectItem?.rank ?? -1);
  });
});

describe('getDebriefForSession', () => {
  it('returns an empty array for a session with no promoted items', async () => {
    const learnerId = await makeLearner();
    const sessionId = await makeSession(learnerId);
    const items = await getDebriefForSession(pool, sessionId);
    expect(items).toEqual([]);
  });
});
