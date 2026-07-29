import { inspect } from 'node:util';

import { Pool } from 'pg';

import { deleteExpiredSessions } from './retention';
import { getPersonaMemoriesForLearner } from './persona-memories';
import { applySchema } from './schema';

/**
 * Runs against a REAL local Postgres instance, applying the actual
 * schema.sql — no mocking, matching the precedent set in server.test.ts.
 * Requires a reachable Postgres; set DATABASE_URL to override the local
 * default. See README.md for how to create the local database this
 * defaults to.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/lingoai_app_service';

/**
 * Every test's fixtures hang off a learner via ON DELETE CASCADE, so
 * deleting the learner is enough to clean up everything the test created.
 * Tracking created ids here (cleaned up in `afterEach`, not inline at the
 * end of each `it`) means a mid-test assertion failure still gets cleaned
 * up instead of leaking rows into the shared local database.
 */
let createdLearnerIds: string[];

async function makeLearner(pool: Pool, overrides: { cyrillicLiterate?: boolean; translitEnabled?: boolean } = {}): Promise<string> {
  const result = await pool.query<{ id: string }>(
    'INSERT INTO learners (cyrillic_literate, translit_enabled) VALUES ($1, $2) RETURNING id',
    [overrides.cyrillicLiterate ?? false, overrides.translitEnabled ?? true],
  );
  const row = result.rows[0];
  if (!row)
    throw new Error('insert did not return a row');
  createdLearnerIds.push(row.id);
  return row.id;
}

async function makeSession(pool: Pool, learnerId: string, startedAt: Date): Promise<string> {
  const result = await pool.query<{ id: string }>(
    'INSERT INTO sessions (learner_id, started_at) VALUES ($1, $2) RETURNING id',
    [learnerId, startedAt],
  );
  const row = result.rows[0];
  if (!row)
    throw new Error('insert did not return a row');
  return row.id;
}

describe('schema.sql', () => {
  let pool: Pool;

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

  it('is idempotent — applying it a second time is a no-op, not an error', async () => {
    await expect(applySchema(pool)).resolves.toBeUndefined();
  });

  it('round-trips a learner with the onboarding literacy flags', async () => {
    const learnerId = await makeLearner(pool, { cyrillicLiterate: true, translitEnabled: false });
    const result = await pool.query('SELECT cyrillic_literate, translit_enabled FROM learners WHERE id = $1', [learnerId]);
    expect(result.rows[0]).toEqual({ cyrillic_literate: true, translit_enabled: false });
  });

  it('records a turn with register split and revealed', async () => {
    const learnerId = await makeLearner(pool);
    const sessionId = await makeSession(pool, learnerId, new Date());
    const result = await pool.query<{ id: string }>(
      `INSERT INTO turns (session_id, speaker, content, persona_register, learner_register, revealed)
       VALUES ($1, 'persona', 'Привет!', 'informal', 'formal', true) RETURNING id`,
      [sessionId],
    );
    const turnId = result.rows[0]?.id;
    expect(turnId).toBeDefined();
    const turn = await pool.query('SELECT persona_register, learner_register, revealed FROM turns WHERE id = $1', [turnId]);
    expect(turn.rows[0]).toEqual({ persona_register: 'informal', learner_register: 'formal', revealed: true });
  });

  it('rejects a turn with an unrecognized speaker', async () => {
    const learnerId = await makeLearner(pool);
    const sessionId = await makeSession(pool, learnerId, new Date());
    await expect(
      pool.query("INSERT INTO turns (session_id, speaker, content) VALUES ($1, 'narrator', 'x')", [sessionId]),
    ).rejects.toThrow();
  });

  it('keeps observations even when only some are surfaced as debrief_items', async () => {
    const learnerId = await makeLearner(pool);
    const sessionId = await makeSession(pool, learnerId, new Date());
    const observationIds: string[] = [];
    for (const kind of ['grammar_error', 'avoidance', 'stress_error', 'grammar_error']) {
      const result = await pool.query<{ id: string }>(
        'INSERT INTO observations (session_id, learner_id, kind) VALUES ($1, $2, $3) RETURNING id',
        [sessionId, learnerId, kind],
      );
      const row = result.rows[0];
      if (row)
        observationIds.push(row.id);
    }
    expect(observationIds).toHaveLength(4);

    // Only three surface in the debrief (PRD §8) — the other observation
    // is retained but not linked into debrief_items.
    const surfaced = observationIds.slice(0, 3);
    for (const [index, observationId] of surfaced.entries()) {
      await pool.query(
        'INSERT INTO debrief_items (session_id, observation_id, rank) VALUES ($1, $2, $3)',
        [sessionId, observationId, index],
      );
    }

    const allObservations = await pool.query('SELECT id FROM observations WHERE session_id = $1', [sessionId]);
    expect(allObservations.rows).toHaveLength(4);
    const debriefItems = await pool.query('SELECT observation_id FROM debrief_items WHERE session_id = $1', [sessionId]);
    expect(debriefItems.rows).toHaveLength(3);
  });

  it('tracks learner_structures as one row per learner per structure', async () => {
    const learnerId = await makeLearner(pool);
    await pool.query(
      `INSERT INTO learner_structures (learner_id, structure_key, exposures, attempts, successes, avoidances, stability)
       VALUES ($1, 'genitive_plural', 5, 3, 2, 1, 0.4)`,
      [learnerId],
    );
    // Same learner + structure_key is a conflict, not a second row.
    await expect(
      pool.query(
        "INSERT INTO learner_structures (learner_id, structure_key) VALUES ($1, 'genitive_plural')",
        [learnerId],
      ),
    ).rejects.toThrow();
  });

  it('creates persona_world_state unpopulated but ready', async () => {
    const result = await pool.query('SELECT count(*)::int AS count FROM persona_world_state');
    expect(typeof result.rows[0]?.count).toBe('number');
  });

  describe('persona_memories redaction', () => {
    it('never exposes the real content via toString, JSON.stringify, or console.log formatting', async () => {
      const learnerId = await makeLearner(pool);
      const secret = 'her cat Marfa was sick last week';
      await pool.query('INSERT INTO persona_memories (learner_id, content) VALUES ($1, $2)', [learnerId, secret]);

      const memories = await getPersonaMemoriesForLearner(pool, learnerId);
      expect(memories).toHaveLength(1);
      const memory = memories[0];
      if (!memory)
        throw new Error('expected a memory row');

      expect(String(memory.content)).not.toContain(secret);
      expect(JSON.stringify({ content: memory.content })).not.toContain(secret);
      expect(inspect(memory.content)).not.toContain(secret);
      expect(memory.content.reveal()).toBe(secret);
    });
  });

  describe('retention', () => {
    it('deletes sessions (and cascades to their turns) older than the retention window, keeps recent ones', async () => {
      const learnerId = await makeLearner(pool);
      const now = new Date();
      const old = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000);
      const oldSessionId = await makeSession(pool, learnerId, old);
      const recentSessionId = await makeSession(pool, learnerId, now);
      await pool.query("INSERT INTO turns (session_id, speaker, content) VALUES ($1, 'persona', 'старая реплика')", [oldSessionId]);
      await pool.query("INSERT INTO turns (session_id, speaker, content) VALUES ($1, 'persona', 'новая реплика')", [recentSessionId]);

      const deleted = await deleteExpiredSessions(pool, 180);
      expect(deleted).toBeGreaterThanOrEqual(1);

      const oldSession = await pool.query('SELECT id FROM sessions WHERE id = $1', [oldSessionId]);
      expect(oldSession.rows).toHaveLength(0);
      const oldTurns = await pool.query('SELECT id FROM turns WHERE session_id = $1', [oldSessionId]);
      expect(oldTurns.rows).toHaveLength(0);

      const recentSession = await pool.query('SELECT id FROM sessions WHERE id = $1', [recentSessionId]);
      expect(recentSession.rows).toHaveLength(1);
    });

    it('leaves learner_structures and persona_memories untouched — they are per-learner, not per-session', async () => {
      const learnerId = await makeLearner(pool);
      const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
      await makeSession(pool, learnerId, old);
      await pool.query(
        "INSERT INTO learner_structures (learner_id, structure_key) VALUES ($1, 'dative_case')",
        [learnerId],
      );
      await pool.query('INSERT INTO persona_memories (learner_id, content) VALUES ($1, $2)', [learnerId, 'test memory']);

      await deleteExpiredSessions(pool, 180);

      const structures = await pool.query('SELECT structure_key FROM learner_structures WHERE learner_id = $1', [learnerId]);
      expect(structures.rows).toHaveLength(1);
      const memories = await pool.query('SELECT id FROM persona_memories WHERE learner_id = $1', [learnerId]);
      expect(memories.rows).toHaveLength(1);
    });
  });
});
