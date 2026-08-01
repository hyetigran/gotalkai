import { Pool } from 'pg';
import { deleteLearner, recordAudioSamplingConsent } from './privacy';
import { applySchema } from '../db/schema';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/lingoai_app_service';

describe('deleteLearner', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await applySchema(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('returns false for a learner that does not exist', async () => {
    const deleted = await deleteLearner(pool, '00000000-0000-0000-0000-000000000000');
    expect(deleted).toBe(false);
  });

  it(
    'a single call clears memories, transcripts (turns), and observations/debrief_items together — '
    + 'verified by querying every table directly, not just trusting the call\'s return value (ticket #31 AC #4, UAT #3)',
    async () => {
      const learner = await pool.query<{ id: string }>(
        'INSERT INTO learners (cyrillic_literate, translit_enabled) VALUES (false, true) RETURNING id',
      );
      const learnerId = learner.rows[0]?.id as string;

      await pool.query('INSERT INTO learner_structures (learner_id, structure_key) VALUES ($1, $2)', [learnerId, 'genitive_plural']);
      await pool.query('INSERT INTO persona_memories (learner_id, content) VALUES ($1, $2)', [learnerId, 'She mentioned a trip.']);

      const session = await pool.query<{ id: string }>('INSERT INTO sessions (learner_id) VALUES ($1) RETURNING id', [learnerId]);
      const sessionId = session.rows[0]?.id as string;
      await pool.query(
        "INSERT INTO turns (session_id, speaker, content) VALUES ($1, 'persona', $2)",
        [sessionId, 'Привет!'],
      );
      const observation = await pool.query<{ id: string }>(
        "INSERT INTO observations (session_id, learner_id, kind) VALUES ($1, $2, 'grammar_error') RETURNING id",
        [sessionId, learnerId],
      );
      const observationId = observation.rows[0]?.id as string;
      await pool.query(
        'INSERT INTO debrief_items (session_id, observation_id, rank) VALUES ($1, $2, 1)',
        [sessionId, observationId],
      );

      const deleted = await deleteLearner(pool, learnerId);
      expect(deleted).toBe(true);

      const remaining = await Promise.all([
        pool.query('SELECT 1 FROM learners WHERE id = $1', [learnerId]),
        pool.query('SELECT 1 FROM learner_structures WHERE learner_id = $1', [learnerId]),
        pool.query('SELECT 1 FROM persona_memories WHERE learner_id = $1', [learnerId]),
        pool.query('SELECT 1 FROM sessions WHERE learner_id = $1', [learnerId]),
        pool.query('SELECT 1 FROM turns WHERE session_id = $1', [sessionId]),
        pool.query('SELECT 1 FROM observations WHERE learner_id = $1', [learnerId]),
        pool.query('SELECT 1 FROM debrief_items WHERE session_id = $1', [sessionId]),
      ]);
      for (const result of remaining)
        expect(result.rows).toHaveLength(0);
    },
  );
});

describe('recordAudioSamplingConsent', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await applySchema(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('returns false for a learner that does not exist', async () => {
    const recorded = await recordAudioSamplingConsent(pool, '00000000-0000-0000-0000-000000000000');
    expect(recorded).toBe(false);
  });

  it('writes a real timestamp, not just a boolean, distinct from row creation time', async () => {
    const learner = await pool.query<{ id: string }>('INSERT INTO learners DEFAULT VALUES RETURNING id');
    const learnerId = learner.rows[0]?.id as string;

    const before = await pool.query<{ audio_sampling_consent_at: Date | null }>(
      'SELECT audio_sampling_consent_at FROM learners WHERE id = $1',
      [learnerId],
    );
    expect(before.rows[0]?.audio_sampling_consent_at).toBeNull();

    const recorded = await recordAudioSamplingConsent(pool, learnerId);
    expect(recorded).toBe(true);

    const after = await pool.query<{ audio_sampling_consent_at: Date | null }>(
      'SELECT audio_sampling_consent_at FROM learners WHERE id = $1',
      [learnerId],
    );
    const consentedAt = after.rows[0]?.audio_sampling_consent_at;
    expect(consentedAt).not.toBeNull();
    expect(Math.abs(Date.now() - new Date(consentedAt as Date).getTime())).toBeLessThan(10_000);

    await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
  });
});
