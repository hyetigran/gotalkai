import type { Env } from './env';
import http from 'node:http';
import { Pool } from 'pg';
import { applySchema } from './schema';
import { seedBenchmark } from './seed-benchmark';
import { seedScenarios } from './seed-scenarios';
import { startServer } from './server';

/**
 * Runs against a REAL local Postgres instance — no mocking the DB layer,
 * matching voice-service's precedent of testing with real running
 * processes rather than stand-ins. Requires a reachable Postgres; set
 * DATABASE_URL to override the local default. See README.md for how to
 * create the local database this defaults to.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/lingoai_app_service';

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    PORT: 0, // ask the OS for a free port
    NODE_ENV: 'test',
    DATABASE_URL,
    RETENTION_DAYS: 180,
    DAILY_SESSION_CAP: 1,
    AUDIO_SAMPLE_RATE: 0.03,
    AUDIO_SAMPLE_RETENTION_DAYS: 30,
    ...overrides,
  };
}

type JsonResponse = { statusCode: number; body: Record<string, unknown> | null };

function get(port: number, path: string): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let raw = '';
      res.on('data', chunk => (raw += chunk));
      res.on('end', () => {
        resolve({ statusCode: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : null });
      });
    }).on('error', reject);
  });
}

function post(port: number, path: string, body: unknown): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } },
      (res) => {
        let raw = '';
        res.on('data', chunk => (raw += chunk));
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : null });
        });
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

function del(port: number, path: string): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'DELETE' },
      (res) => {
        let raw = '';
        res.on('data', chunk => (raw += chunk));
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : null });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('app service server', () => {
  it('round-trips a real query through Postgres on GET /health', async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const handle = await startServer(testEnv(), pool);

    const first = await get(handle.port, '/health');
    expect(first.statusCode).toBe(200);
    expect(first.body).not.toBeNull();
    expect(first.body?.status).toBe('ok');
    const firstTime = new Date(first.body?.serverTime as string);
    expect(Number.isNaN(firstTime.getTime())).toBe(false);
    // Recent, not a hardcoded/stubbed timestamp from some other moment.
    expect(Math.abs(Date.now() - firstTime.getTime())).toBeLessThan(10_000);

    await handle.close();
    await pool.end();
  });

  it('returns 404 for an unrecognized route', async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const handle = await startServer(testEnv(), pool);

    const response = await get(handle.port, '/nope');
    expect(response.statusCode).toBe(404);

    await handle.close();
    await pool.end();
  });

  it('returns 503 rather than crashing when the database is unreachable', async () => {
    const pool = new Pool({ connectionString: 'postgres://127.0.0.1:1/does-not-exist', connectionTimeoutMillis: 500 });
    // Queries against an unreachable pool reject — suppress the
    // unhandled-rejection noise pg's internal reconnect logic can emit,
    // it's expected and not what this test is asserting on.
    pool.on('error', () => {});
    const handle = await startServer(testEnv(), pool);

    const response = await get(handle.port, '/health');
    expect(response.statusCode).toBe(503);

    await handle.close();
    await pool.end();
  });

  describe('learner/session creation endpoints', () => {
    it('POST /learners then POST /sessions creates real rows usable by the observations endpoint', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      // POST /sessions runs real scenario selection (ticket #21), which
      // requires at least one seeded scenario to exist.
      await seedScenarios(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      expect(learnerResponse.statusCode).toBe(201);
      const learnerId = learnerResponse.body?.id as string;
      expect(typeof learnerId).toBe('string');

      const sessionResponse = await post(handle.port, '/sessions', { learnerId });
      expect(sessionResponse.statusCode).toBe(201);
      const sessionId = sessionResponse.body?.id as string;
      expect(typeof sessionId).toBe('string');

      const observationsResponse = await post(handle.port, `/sessions/${sessionId}/observations`, {
        learnerId,
        observations: [{ kind: 'grammar_error' }],
      });
      expect(observationsResponse.statusCode).toBe(201);

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('POST /sessions rejects a missing learnerId', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await post(handle.port, '/sessions', {});
      expect(response.statusCode).toBe(400);

      await handle.close();
      await pool.end();
    });

    it('POST /learners writes real onboarding answers, and GET /learners/:id reads them back (ticket #30 AC #1/#2)', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', { cyrillicLiterate: false, translitEnabled: true });
      expect(learnerResponse.statusCode).toBe(201);
      const learnerId = learnerResponse.body?.id as string;

      const getResponse = await get(handle.port, `/learners/${learnerId}`);
      expect(getResponse.statusCode).toBe(200);
      expect(getResponse.body?.learner).toEqual({ id: learnerId, cyrillicLiterate: false, translitEnabled: true });

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('POST /learners with no body falls back to schema.sql\'s own column defaults, not silently different app-level defaults', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;

      const stored = await pool.query('SELECT cyrillic_literate, translit_enabled FROM learners WHERE id = $1', [learnerId]);
      expect(stored.rows[0]).toEqual({ cyrillic_literate: false, translit_enabled: true });

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('GET /learners/:id returns 404 for a nonexistent learner', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await get(handle.port, '/learners/00000000-0000-0000-0000-000000000000');
      expect(response.statusCode).toBe(404);

      await handle.close();
      await pool.end();
    });

    it('POST /sessions rejects a real learner\'s second session of the day with 429, server-side — a direct API call cannot bypass it (ticket #24 UAT #3)', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      await seedScenarios(pool);
      const handle = await startServer(testEnv({ DAILY_SESSION_CAP: 1 }), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;

      const first = await post(handle.port, '/sessions', { learnerId });
      expect(first.statusCode).toBe(201);

      const second = await post(handle.port, '/sessions', { learnerId });
      expect(second.statusCode).toBe(429);
      expect(second.body?.code).toBe('daily_cap_reached');
      // Framed as "come back tomorrow," not an error/paywall (ticket #24 AC #3).
      expect(second.body?.message).toContain('tomorrow');

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('honors a higher configured DAILY_SESSION_CAP', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      await seedScenarios(pool);
      const handle = await startServer(testEnv({ DAILY_SESSION_CAP: 2 }), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;

      const first = await post(handle.port, '/sessions', { learnerId });
      expect(first.statusCode).toBe(201);
      const second = await post(handle.port, '/sessions', { learnerId });
      expect(second.statusCode).toBe(201);
      const third = await post(handle.port, '/sessions', { learnerId });
      expect(third.statusCode).toBe(429);

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('never lets concurrent requests exceed the cap — a race, not just the sequential case', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      await seedScenarios(pool);
      const handle = await startServer(testEnv({ DAILY_SESSION_CAP: 1 }), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;

      // Five simultaneous requests for a learner capped at 1 — without
      // the per-learner advisory lock serializing the count-then-insert,
      // more than one of these could read "count < cap" before any of
      // them commit.
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => post(handle.port, '/sessions', { learnerId })),
      );
      const successCount = responses.filter(response => response.statusCode === 201).length;
      const capReachedCount = responses.filter(response => response.statusCode === 429).length;
      expect(successCount).toBe(1);
      expect(capReachedCount).toBe(4);

      const stored = await pool.query('SELECT count(*)::int AS count FROM sessions WHERE learner_id = $1', [learnerId]);
      expect(stored.rows[0]?.count).toBe(1);

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });
  });

  describe('session observations/debrief endpoints', () => {
    async function makeLearnerAndSession(pool: Pool): Promise<{ learnerId: string; sessionId: string }> {
      const learner = await pool.query<{ id: string }>('INSERT INTO learners DEFAULT VALUES RETURNING id');
      const learnerId = learner.rows[0]?.id;
      if (!learnerId)
        throw new Error('insert did not return a row');
      const session = await pool.query<{ id: string }>('INSERT INTO sessions (learner_id) VALUES ($1) RETURNING id', [learnerId]);
      const sessionId = session.rows[0]?.id;
      if (!sessionId)
        throw new Error('insert did not return a row');
      return { learnerId, sessionId };
    }

    it('POST /sessions/:id/observations writes observations and returns promoted debrief_items', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);
      const { learnerId, sessionId } = await makeLearnerAndSession(pool);

      const response = await post(handle.port, `/sessions/${sessionId}/observations`, {
        learnerId,
        observations: [
          { kind: 'grammar_error', structureKey: 'genitive_plural', impeded: true },
        ],
      });
      expect(response.statusCode).toBe(201);
      expect(Array.isArray(response.body?.debriefItems)).toBe(true);
      expect((response.body?.debriefItems as unknown[]).length).toBe(1);

      // A real write, not a stub — the row is genuinely in observations.
      const stored = await pool.query('SELECT kind FROM observations WHERE session_id = $1', [sessionId]);
      expect(stored.rows).toEqual([{ kind: 'grammar_error' }]);

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('POST /sessions/:id/observations rejects a request body missing learnerId', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await post(handle.port, '/sessions/00000000-0000-0000-0000-000000000000/observations', {
        observations: [{ kind: 'grammar_error' }],
      });
      expect(response.statusCode).toBe(400);

      await handle.close();
      await pool.end();
    });

    it('GET /sessions/:id/debrief returns previously promoted items', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);
      const { learnerId, sessionId } = await makeLearnerAndSession(pool);

      await post(handle.port, `/sessions/${sessionId}/observations`, {
        learnerId,
        observations: [{ kind: 'avoidance', impeded: false }],
      });

      const response = await get(handle.port, `/sessions/${sessionId}/debrief`);
      expect(response.statusCode).toBe(200);
      expect((response.body?.debriefItems as unknown[]).length).toBe(1);

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });
  });

  describe('avoidance detection (ticket #23)', () => {
    async function makeSessionAtVetNarrationLevel(pool: Pool, learnerId: string): Promise<string> {
      const scenario = await pool.query<{ id: string }>('SELECT id FROM scenarios WHERE scene_key = $1', ['cat_vet_visit']);
      const scenarioId = scenario.rows[0]?.id;
      if (!scenarioId)
        throw new Error('expected cat_vet_visit to be seeded');
      // Level 1 is seeded with target_structure_key = 'aspect_perfective' (seed-scenarios.ts).
      const session = await pool.query<{ id: string }>(
        'INSERT INTO sessions (learner_id, scenario_id, calibration) VALUES ($1, $2, $3) RETURNING id',
        [learnerId, scenarioId, JSON.stringify({ complicationLevel: 1 })],
      );
      const sessionId = session.rows[0]?.id;
      if (!sessionId)
        throw new Error('insert did not return a row');
      return sessionId;
    }

    it(
      'POST /sessions/:id/observations detects an avoided target structure end to end and surfaces it in the debrief '
      + 'with distinct framing (UAT #1/#2: complete a session steering around the target, confirm a distinct "steered around" note)',
      async () => {
        const pool = new Pool({ connectionString: DATABASE_URL });
        await applySchema(pool);
        await seedScenarios(pool);
        const handle = await startServer(testEnv(), pool);

        const learnerResponse = await post(handle.port, '/learners', {});
        const learnerId = learnerResponse.body?.id as string;
        const sessionId = await makeSessionAtVetNarrationLevel(pool, learnerId);

        // The learner talks throughout the session but never touches the
        // target structure — an unrelated real observation, not silence.
        const response = await post(handle.port, `/sessions/${sessionId}/observations`, {
          learnerId,
          observations: [{ kind: 'grammar_error', structureKey: 'genitive_plural', impeded: false }],
        });
        expect(response.statusCode).toBe(201);

        const debriefItems = response.body?.debriefItems as { kind: string; detail: Record<string, unknown> }[];
        const avoidanceItem = debriefItems.find(item => item.kind === 'avoidance');
        expect(avoidanceItem).toBeDefined();
        expect(avoidanceItem?.detail.structureKey).toBe('aspect_perfective');
        // Distinct framing (AC #3), not a generic impeded-communication tag.
        expect(avoidanceItem?.detail.tag).toBe('you steered around this');

        const stored = await pool.query<{ avoidances: number }>(
          'SELECT avoidances FROM learner_structures WHERE learner_id = $1 AND structure_key = $2',
          [learnerId, 'aspect_perfective'],
        );
        expect(stored.rows[0]?.avoidances).toBe(1);

        await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
        await handle.close();
        await pool.end();
      },
    );

    it(
      'does not mislabel an outright wrong attempt at the target structure as avoidance '
      + '(UAT #3: attempt the target and get it wrong; confirm a normal error pattern, not avoidance)',
      async () => {
        const pool = new Pool({ connectionString: DATABASE_URL });
        await applySchema(pool);
        await seedScenarios(pool);
        const handle = await startServer(testEnv(), pool);

        const learnerResponse = await post(handle.port, '/learners', {});
        const learnerId = learnerResponse.body?.id as string;
        const sessionId = await makeSessionAtVetNarrationLevel(pool, learnerId);

        const response = await post(handle.port, `/sessions/${sessionId}/observations`, {
          learnerId,
          observations: [{ kind: 'grammar_error', structureKey: 'aspect_perfective', impeded: true }],
        });
        expect(response.statusCode).toBe(201);

        const debriefItems = response.body?.debriefItems as { kind: string }[];
        expect(debriefItems.some(item => item.kind === 'avoidance')).toBe(false);
        expect(debriefItems.some(item => item.kind === 'grammar_error')).toBe(true);

        await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
        await handle.close();
        await pool.end();
      },
    );
  });

  describe('session scenario endpoint', () => {
    it('GET /sessions/:id/scenario returns the session\'s real, selected scenario content', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      await seedScenarios(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;
      const sessionResponse = await post(handle.port, '/sessions', { learnerId });
      const sessionId = sessionResponse.body?.id as string;

      const response = await get(handle.port, `/sessions/${sessionId}/scenario`);
      expect(response.statusCode).toBe(200);
      const scenario = response.body?.scenario as Record<string, unknown>;
      expect(typeof scenario.title).toBe('string');
      expect(Array.isArray(scenario.ladder)).toBe(true);
      expect((scenario.ladder as unknown[]).length).toBeGreaterThan(0);
      expect(scenario.currentStepIndex).toBe(0); // first-ever session for this learner

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('GET /sessions/:id/scenario returns 404 for a nonexistent session', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await get(handle.port, '/sessions/00000000-0000-0000-0000-000000000000/scenario');
      expect(response.statusCode).toBe(404);

      await handle.close();
      await pool.end();
    });
  });

  describe('persona memory endpoints', () => {
    it('POST /learners seeds starter memories, and GET /learners/:id/callback returns a real one for session one', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;

      // Session one — no prior real session, but never cold (ticket #22 AC #3).
      const response = await get(handle.port, `/learners/${learnerId}/callback`);
      expect(response.statusCode).toBe(200);
      expect(typeof response.body?.callbackLine).toBe('string');
      expect((response.body?.callbackLine as string).length).toBeGreaterThan(0);

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('POST /learners/:id/memories writes a real, later-readable memory', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;

      const memoryResponse = await post(handle.port, `/learners/${learnerId}/memories`, {
        content: 'Она упомянула поездку в Ярославль.',
      });
      expect(memoryResponse.statusCode).toBe(201);
      expect(typeof memoryResponse.body?.id).toBe('string');

      const stored = await pool.query('SELECT content FROM persona_memories WHERE id = $1', [memoryResponse.body?.id]);
      expect(stored.rows).toEqual([{ content: 'Она упомянула поездку в Ярославль.' }]);

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('POST /learners/:id/memories rejects a request body missing content', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await post(handle.port, '/learners/00000000-0000-0000-0000-000000000000/memories', {});
      expect(response.statusCode).toBe(400);

      await handle.close();
      await pool.end();
    });

    it('GET /learners/:id/callback returns null for a learner with no memories (defensive fallback, not expected once seeding runs)', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);
      const learner = await pool.query<{ id: string }>('INSERT INTO learners DEFAULT VALUES RETURNING id');
      const learnerId = learner.rows[0]?.id as string;

      const response = await get(handle.port, `/learners/${learnerId}/callback`);
      expect(response.statusCode).toBe(200);
      expect(response.body?.callbackLine).toBeNull();

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });
  });

  describe('privacy endpoints (ticket #31)', () => {
    it('POST /learners/:id/audio-sampling-consent records consent, and DELETE /learners/:id clears the learner and its memories', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;

      const consentResponse = await post(handle.port, `/learners/${learnerId}/audio-sampling-consent`, {});
      expect(consentResponse.statusCode).toBe(200);
      const stored = await pool.query('SELECT audio_sampling_consent_at FROM learners WHERE id = $1', [learnerId]);
      expect(stored.rows[0]?.audio_sampling_consent_at).not.toBeNull();

      // POST /learners seeds starter memories (ticket #22/#30) — real
      // rows exist for this learner before deletion, not just the row itself.
      const memoriesBefore = await pool.query('SELECT count(*)::int AS count FROM persona_memories WHERE learner_id = $1', [learnerId]);
      expect(memoriesBefore.rows[0]?.count).toBeGreaterThan(0);

      const deleteResponse = await del(handle.port, `/learners/${learnerId}`);
      expect(deleteResponse.statusCode).toBe(200);

      const learnerAfter = await pool.query('SELECT 1 FROM learners WHERE id = $1', [learnerId]);
      expect(learnerAfter.rows).toHaveLength(0);
      const memoriesAfter = await pool.query('SELECT 1 FROM persona_memories WHERE learner_id = $1', [learnerId]);
      expect(memoriesAfter.rows).toHaveLength(0);

      await handle.close();
      await pool.end();
    });

    it('POST /learners/:id/audio-sampling-consent returns 404 for a nonexistent learner', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await post(handle.port, '/learners/00000000-0000-0000-0000-000000000000/audio-sampling-consent', {});
      expect(response.statusCode).toBe(404);

      await handle.close();
      await pool.end();
    });

    it('POST /learners/:id/audio-sampling-consent with a malformed learner id returns 400', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await post(handle.port, '/learners/not-a-uuid/audio-sampling-consent', {});
      expect(response.statusCode).toBe(400);

      await handle.close();
      await pool.end();
    });

    it('DELETE /learners/:id returns 404 for a nonexistent learner', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await del(handle.port, '/learners/00000000-0000-0000-0000-000000000000');
      expect(response.statusCode).toBe(404);

      await handle.close();
      await pool.end();
    });

    it('DELETE /learners/:id with a malformed learner id returns 400', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await del(handle.port, '/learners/not-a-uuid');
      expect(response.statusCode).toBe(400);

      await handle.close();
      await pool.end();
    });
  });

  describe('runtime validation hardening (ticket #26)', () => {
    it('GET /sessions/:id/debrief with a malformed session id returns 400, not a database-error 503', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await get(handle.port, '/sessions/not-a-uuid/debrief');
      expect(response.statusCode).toBe(400);

      await handle.close();
      await pool.end();
    });

    it('GET /sessions/:id/scenario with a malformed session id returns 400', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await get(handle.port, '/sessions/not-a-uuid/scenario');
      expect(response.statusCode).toBe(400);

      await handle.close();
      await pool.end();
    });

    it('POST /sessions/:id/observations with a malformed session id returns 400', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await post(handle.port, '/sessions/not-a-uuid/observations', {
        learnerId: '00000000-0000-0000-0000-000000000000',
        observations: [{ kind: 'grammar_error' }],
      });
      expect(response.statusCode).toBe(400);

      await handle.close();
      await pool.end();
    });

    it('GET /learners/:id/callback with a malformed learner id returns 400', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await get(handle.port, '/learners/not-a-uuid/callback');
      expect(response.statusCode).toBe(400);

      await handle.close();
      await pool.end();
    });

    it('POST /sessions rejects a malformed (non-UUID) learnerId in the body with 400', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await post(handle.port, '/sessions', { learnerId: 'not-a-uuid' });
      expect(response.statusCode).toBe(400);

      await handle.close();
      await pool.end();
    });

    it('POST /sessions/:id/observations rejects a malformed (non-UUID) learnerId in the body with 400', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await post(handle.port, '/sessions/00000000-0000-0000-0000-000000000000/observations', {
        learnerId: 'not-a-uuid',
        observations: [{ kind: 'grammar_error' }],
      });
      expect(response.statusCode).toBe(400);

      await handle.close();
      await pool.end();
    });

    it('a well-formed but nonexistent learnerId is not rejected by app-level validation — it passes Zod and falls through to the generic database-error path (ticket #26 AC #3)', async () => {
      // This test proves there is no *separate app-level existence
      // check* (no 4xx branch anywhere for "learner not found") — it
      // does not, by itself, prove the FK constraint specifically is
      // what rejects the insert versus some other DB-level failure; the
      // route's catch block is a blanket 503 for any non-cap error. The
      // FK constraint itself — confirmed as the actual mechanism, with
      // its specific Postgres error code — is tested directly in
      // schema.test.ts's "rejects a session referencing a learner_id
      // that does not exist" test.
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      await seedScenarios(pool);
      const handle = await startServer(testEnv(), pool);

      // Well-formed UUID, Zod accepts it — whether a learner with this
      // id actually exists is left entirely to sessions_learner_id_fkey.
      const response = await post(handle.port, '/sessions', { learnerId: '00000000-0000-0000-0000-000000000000' });
      expect(response.statusCode).not.toBe(400); // not rejected by Zod
      expect(response.statusCode).not.toBe(201); // not silently accepted either
      expect(response.statusCode).toBe(503); // falls through to the same generic path as any other unexpected DB failure

      await handle.close();
      await pool.end();
    });
  });

  describe('benchmark endpoints (ticket #35)', () => {
    it('GET /benchmark-sets/current returns the seeded set without leaking correct answers', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      await seedBenchmark(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await get(handle.port, '/benchmark-sets/current');
      expect(response.statusCode).toBe(200);
      const benchmarkSet = response.body?.benchmarkSet as Record<string, unknown>;
      expect(typeof benchmarkSet.monthKey).toBe('string');
      const items = benchmarkSet.items as Record<string, unknown>[];
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) expect(item).not.toHaveProperty('correctChoiceIndex');

      await handle.close();
      await pool.end();
    });

    it('POST /learners/:id/benchmark-attempts scores a real submission and GET .../benchmark-attempts reflects it in the trend', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      await seedBenchmark(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;
      const setResponse = await get(handle.port, '/benchmark-sets/current');
      const benchmarkSet = setResponse.body?.benchmarkSet as { id: string; items: { id: string }[] };

      const submitResponse = await post(handle.port, `/learners/${learnerId}/benchmark-attempts`, {
        benchmarkSetId: benchmarkSet.id,
        answers: benchmarkSet.items.map(item => ({ itemId: item.id, selectedChoiceIndex: 0 })),
      });
      expect(submitResponse.statusCode).toBe(201);
      const result = submitResponse.body?.result as { correctCount: number; totalCount: number };
      expect(result.totalCount).toBe(benchmarkSet.items.length);

      const trendResponse = await get(handle.port, `/learners/${learnerId}/benchmark-attempts`);
      expect(trendResponse.statusCode).toBe(200);
      const trend = trendResponse.body?.trend as unknown[];
      expect(trend).toHaveLength(1);

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('POST /learners/:id/benchmark-attempts rejects a malformed submission with 400, not a generic 503', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      await seedBenchmark(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;

      const response = await post(handle.port, `/learners/${learnerId}/benchmark-attempts`, {
        benchmarkSetId: '00000000-0000-0000-0000-000000000000',
        answers: [{ itemId: '00000000-0000-0000-0000-000000000001', selectedChoiceIndex: 0 }],
      });
      expect(response.statusCode).toBe(400);

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });
  });
});
