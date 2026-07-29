import { Pool } from 'pg';
import { detectAndRecordAvoidance, detectAvoidance } from './avoidance-detection';
import { applySchema } from './schema';
import { seedScenarios } from './seed-scenarios';

describe('detectAvoidance', () => {
  it('is never avoidance when there is no target structure for this level', () => {
    expect(detectAvoidance(null, [])).toBe(false);
    expect(detectAvoidance(null, ['aspect_perfective'])).toBe(false);
  });

  it('is avoidance when the target structure never appears in the session\'s observations', () => {
    expect(detectAvoidance('aspect_perfective', [])).toBe(true);
    expect(detectAvoidance('aspect_perfective', ['genitive_plural', undefined])).toBe(true);
  });

  it('is not avoidance when the target was attempted at all, correctly or not (UAT #3: an outright wrong attempt is a normal error, not avoidance)', () => {
    expect(detectAvoidance('aspect_perfective', ['aspect_perfective'])).toBe(false);
    expect(detectAvoidance('aspect_perfective', ['genitive_plural', 'aspect_perfective'])).toBe(false);
  });
});

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/lingoai_app_service';

describe('detectAndRecordAvoidance', () => {
  let pool: Pool;
  let scenarioId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await applySchema(pool);
    await seedScenarios(pool);
    const scenario = await pool.query<{ id: string }>('SELECT id FROM scenarios WHERE scene_key = $1', ['cat_vet_visit']);
    scenarioId = scenario.rows[0]?.id as string;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function makeLearner(): Promise<string> {
    const result = await pool.query<{ id: string }>('INSERT INTO learners DEFAULT VALUES RETURNING id');
    return result.rows[0]?.id as string;
  }

  /** Level 1 of cat_vet_visit is seeded with `target_structure_key = 'aspect_perfective'` — see seed-scenarios.ts. */
  async function makeSessionAtVetNarrationLevel(learnerId: string): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO sessions (learner_id, scenario_id, calibration) VALUES ($1, $2, $3) RETURNING id`,
      [learnerId, scenarioId, JSON.stringify({ complicationLevel: 1 })],
    );
    return result.rows[0]?.id as string;
  }

  it('does nothing for a session with no target structure (most levels)', async () => {
    const learnerId = await makeLearner();
    const session = await pool.query<{ id: string }>(
      `INSERT INTO sessions (learner_id, scenario_id, calibration) VALUES ($1, $2, $3) RETURNING id`,
      [learnerId, scenarioId, JSON.stringify({ complicationLevel: 0 })], // level 0 has no target_structure_key
    );
    const sessionId = session.rows[0]?.id as string;

    const observationId = await detectAndRecordAvoidance(pool, sessionId, learnerId);
    expect(observationId).toBeNull();

    const stored = await pool.query('SELECT 1 FROM observations WHERE session_id = $1', [sessionId]);
    expect(stored.rows).toHaveLength(0);

    await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
  });

  it(
    'writes a distinctly-kinded avoidance observation and increments learner_structures.avoidances '
    + 'when the target structure is never attempted across the session\'s real observations (AC #2/#3)',
    async () => {
      const learnerId = await makeLearner();
      const sessionId = await makeSessionAtVetNarrationLevel(learnerId);
      // Real observations exist for this session, but none reference the
      // target structure — a genuinely produced-but-unrelated pattern.
      await pool.query(
        "INSERT INTO observations (session_id, learner_id, kind, detail) VALUES ($1, $2, 'grammar_error', $3)",
        [sessionId, learnerId, JSON.stringify({ structureKey: 'genitive_plural', impeded: false })],
      );

      const observationId = await detectAndRecordAvoidance(pool, sessionId, learnerId);
      expect(observationId).not.toBeNull();

      const stored = await pool.query<{ kind: string; detail: Record<string, unknown> }>(
        'SELECT kind, detail FROM observations WHERE id = $1',
        [observationId],
      );
      expect(stored.rows[0]?.kind).toBe('avoidance');
      expect(stored.rows[0]?.detail).toEqual({
        structureKey: 'aspect_perfective',
        impeded: true,
        tag: 'you steered around this',
      });

      const structureRow = await pool.query<{ avoidances: number }>(
        'SELECT avoidances FROM learner_structures WHERE learner_id = $1 AND structure_key = $2',
        [learnerId, 'aspect_perfective'],
      );
      expect(structureRow.rows[0]?.avoidances).toBe(1);

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
    },
  );

  it(
    'writes nothing when the target structure WAS attempted this session, even if the attempt failed '
    + '(UAT #3: an outright wrong attempt must not be mislabeled as avoidance)',
    async () => {
      const learnerId = await makeLearner();
      const sessionId = await makeSessionAtVetNarrationLevel(learnerId);
      await pool.query(
        "INSERT INTO observations (session_id, learner_id, kind, detail) VALUES ($1, $2, 'grammar_error', $3)",
        [sessionId, learnerId, JSON.stringify({ structureKey: 'aspect_perfective', impeded: true })],
      );

      const observationId = await detectAndRecordAvoidance(pool, sessionId, learnerId);
      expect(observationId).toBeNull();

      const avoidanceRows = await pool.query("SELECT 1 FROM observations WHERE session_id = $1 AND kind = 'avoidance'", [sessionId]);
      expect(avoidanceRows.rows).toHaveLength(0);

      const structureRow = await pool.query<{ avoidances: number }>(
        'SELECT avoidances FROM learner_structures WHERE learner_id = $1 AND structure_key = $2',
        [learnerId, 'aspect_perfective'],
      );
      expect(structureRow.rows[0]?.avoidances ?? 0).toBe(0);

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
    },
  );

  it('accumulates avoidances across repeated calls for the same learner/structure rather than overwriting', async () => {
    const learnerId = await makeLearner();
    const firstSession = await makeSessionAtVetNarrationLevel(learnerId);
    const secondSession = await makeSessionAtVetNarrationLevel(learnerId);

    await detectAndRecordAvoidance(pool, firstSession, learnerId);
    await detectAndRecordAvoidance(pool, secondSession, learnerId);

    const structureRow = await pool.query<{ avoidances: number }>(
      'SELECT avoidances FROM learner_structures WHERE learner_id = $1 AND structure_key = $2',
      [learnerId, 'aspect_perfective'],
    );
    expect(structureRow.rows[0]?.avoidances).toBe(2);

    await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
  });

  it(
    'never double-counts avoidance for concurrent calls on the same session — a race, not just the sequential case '
    + '(observations.ts\'s own POST endpoint can be called more than once for a session; without the advisory lock, '
    + 'two concurrent calls could both read "not yet attempted" before either commits)',
    async () => {
      const learnerId = await makeLearner();
      const sessionId = await makeSessionAtVetNarrationLevel(learnerId);

      const results = await Promise.all(
        Array.from({ length: 5 }, () => detectAndRecordAvoidance(pool, sessionId, learnerId)),
      );
      const writtenCount = results.filter(id => id !== null).length;
      expect(writtenCount).toBe(1);

      const avoidanceRows = await pool.query("SELECT 1 FROM observations WHERE session_id = $1 AND kind = 'avoidance'", [sessionId]);
      expect(avoidanceRows.rows).toHaveLength(1);

      const structureRow = await pool.query<{ avoidances: number }>(
        'SELECT avoidances FROM learner_structures WHERE learner_id = $1 AND structure_key = $2',
        [learnerId, 'aspect_perfective'],
      );
      expect(structureRow.rows[0]?.avoidances).toBe(1);

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
    },
  );
});
