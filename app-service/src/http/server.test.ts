import type { Env } from '../config/env';
import http from 'node:http';
import { Pool } from 'pg';
import { applySchema } from '../db/schema';
import { seedBenchmark } from '../benchmark/seed-benchmark';
import { seedScenarios } from '../scenarios/seed-scenarios';
import { startServer } from './server';
import { verifySessionToken } from '../learners/session-token';

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
    SUBSCRIPTION_PRICE_USD: 12,
    P95_LATENCY_BUDGET_MS: 900,
    SESSION_TOKEN_SECRET: 'test-session-token-secret-0123456789abcdef',
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

function patch(port: number, path: string, body?: unknown): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    // Ticket #29's own reveal endpoint takes no body; ticket #36's calibration-variant endpoint does — `body` stays optional so both keep using this one helper.
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'PATCH',
        headers: payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
      },
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
      // docs/adr/0017's disclosed credential-issuance gap, closed: every
      // POST /sessions response carries a real, verifiable voice-service
      // token scoped to this exact session id.
      expect(typeof sessionResponse.body?.voiceServiceToken).toBe('string');
      const verified = verifySessionToken('test-session-token-secret-0123456789abcdef', sessionResponse.body?.voiceServiceToken as string);
      expect(verified?.sessionId).toBe(sessionId);

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
      expect(getResponse.body?.learner).toEqual({ id: learnerId, cyrillicLiterate: false, translitEnabled: true, calibrationVariant: 'partner_learner' });

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

      const stored = await pool.query('SELECT cyrillic_literate, translit_enabled, calibration_variant FROM learners WHERE id = $1', [learnerId]);
      expect(stored.rows[0]).toEqual({ cyrillic_literate: false, translit_enabled: true, calibration_variant: 'partner_learner' });

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

    it('ticket #36: POST /learners accepts calibrationVariant at onboarding, and GET /learners/:id reads it back', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', { calibrationVariant: 'heritage_speaker' });
      expect(learnerResponse.statusCode).toBe(201);
      const learnerId = learnerResponse.body?.id as string;

      const getResponse = await get(handle.port, `/learners/${learnerId}`);
      expect(getResponse.body?.learner).toMatchObject({ calibrationVariant: 'heritage_speaker' });

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('ticket #36 UAT #1: PATCH /learners/:id/calibration-variant flips an existing learner\'s calibration', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;

      const patchResponse = await patch(handle.port, `/learners/${learnerId}/calibration-variant`, { calibrationVariant: 'heritage_speaker' });
      expect(patchResponse.statusCode).toBe(200);

      const getResponse = await get(handle.port, `/learners/${learnerId}`);
      expect(getResponse.body?.learner).toMatchObject({ calibrationVariant: 'heritage_speaker' });

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('PATCH /learners/:id/calibration-variant returns 404 for a nonexistent learner', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await patch(handle.port, '/learners/00000000-0000-0000-0000-000000000000/calibration-variant', { calibrationVariant: 'heritage_speaker' });
      expect(response.statusCode).toBe(404);

      await handle.close();
      await pool.end();
    });

    it('PATCH /learners/:id/calibration-variant rejects an unrecognized variant with 400', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await patch(handle.port, '/learners/00000000-0000-0000-0000-000000000000/calibration-variant', { calibrationVariant: 'not-a-real-variant' });
      expect(response.statusCode).toBe(400);

      await handle.close();
      await pool.end();
    });

    it('ticket #36 UAT #1: POST /sessions writes noticeably different dial defaults for heritage_speaker than the standard partner_learner calibration', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      await seedScenarios(pool);
      const handle = await startServer(testEnv(), pool);

      const partnerLearnerResponse = await post(handle.port, '/learners', {});
      const partnerLearnerId = partnerLearnerResponse.body?.id as string;
      const heritageResponse = await post(handle.port, '/learners', { calibrationVariant: 'heritage_speaker' });
      const heritageLearnerId = heritageResponse.body?.id as string;

      const partnerSession = await post(handle.port, '/sessions', { learnerId: partnerLearnerId });
      const heritageSession = await post(handle.port, '/sessions', { learnerId: heritageLearnerId });

      const partnerCalibration = await pool.query<{ calibration: { comprehensionLoad: number; productionDemand: number } }>(
        'SELECT calibration FROM sessions WHERE id = $1',
        [partnerSession.body?.id],
      );
      const heritageCalibration = await pool.query<{ calibration: { comprehensionLoad: number; productionDemand: number } }>(
        'SELECT calibration FROM sessions WHERE id = $1',
        [heritageSession.body?.id],
      );

      expect(heritageCalibration.rows[0]?.calibration.comprehensionLoad).toBeGreaterThan(partnerCalibration.rows[0]?.calibration.comprehensionLoad as number);
      expect(heritageCalibration.rows[0]?.calibration.productionDemand).toBeLessThan(partnerCalibration.rows[0]?.calibration.productionDemand as number);

      await pool.query('DELETE FROM learners WHERE id = ANY($1)', [[partnerLearnerId, heritageLearnerId]]);
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

  describe('turn observability endpoints (ticket #29)', () => {
    async function makeSession(handle: { port: number }): Promise<{ learnerId: string; sessionId: string }> {
      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;
      const sessionResponse = await post(handle.port, '/sessions', { learnerId });
      return { learnerId, sessionId: sessionResponse.body?.id as string };
    }

    it('POST /sessions/:id/turns writes a real row, and PATCH /turns/:id/reveal + POST /turns/:id/interruption update it', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);
      const { learnerId, sessionId } = await makeSession(handle);

      const turnResponse = await post(handle.port, `/sessions/${sessionId}/turns`, {
        speaker: 'persona',
        content: 'Ах, конечно.',
        personaRegister: 'ty',
        timings: { t0TurnDetected: 0, t1SttFinal: 10, t2PersonaStart: 20, t3PersonaComplete: 100, t4StressAnnotated: 110, t5FirstAudio: 150 },
        costUsd: 0.0042,
      });
      expect(turnResponse.statusCode).toBe(201);
      const turnId = turnResponse.body?.id as string;
      expect(typeof turnId).toBe('string');

      const revealResponse = await patch(handle.port, `/turns/${turnId}/reveal`);
      expect(revealResponse.statusCode).toBe(200);

      const interruptionResponse = await post(handle.port, `/turns/${turnId}/interruption`, { interruptedAfterMs: 320 });
      expect(interruptionResponse.statusCode).toBe(200);

      const stored = await pool.query<{ revealed: boolean; interrupted_after_ms: number }>(
        'SELECT revealed, interrupted_after_ms FROM turns WHERE id = $1',
        [turnId],
      );
      expect(stored.rows[0]).toEqual({ revealed: true, interrupted_after_ms: 320 });

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('POST /sessions/:id/turns rejects an invalid speaker with 400', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);
      const { learnerId, sessionId } = await makeSession(handle);

      const response = await post(handle.port, `/sessions/${sessionId}/turns`, { speaker: 'narrator', content: 'invalid' });
      expect(response.statusCode).toBe(400);

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('PATCH /turns/:id/reveal returns 404 for a nonexistent turn', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await patch(handle.port, '/turns/00000000-0000-0000-0000-000000000000/reveal');
      expect(response.statusCode).toBe(404);

      await handle.close();
      await pool.end();
    });

    it('POST /turns/:id/interruption returns 404 for a nonexistent turn', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await post(handle.port, '/turns/00000000-0000-0000-0000-000000000000/interruption', { interruptedAfterMs: 100 });
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

    it('ticket #34: POST /learners/:id/memories with personaId writes that persona\'s row, and GET /learners/:id/callback?personaId scopes the read to it', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;

      const memoryResponse = await post(handle.port, `/learners/${learnerId}/memories`, {
        content: 'Она рассказала о родительском собрании.',
        personaId: 'elena',
      });
      expect(memoryResponse.statusCode).toBe(201);

      const stored = await pool.query<{ persona_id: string }>('SELECT persona_id FROM persona_memories WHERE id = $1', [memoryResponse.body?.id]);
      expect(stored.rows[0]?.persona_id).toBe('elena');

      // Валентина's own callback (no query param, the default) never sees Елена's memory.
      const valentinaCallback = await get(handle.port, `/learners/${learnerId}/callback`);
      expect(valentinaCallback.body?.callbackLine).not.toBe('Она рассказала о родительском собрании.');

      const elenaCallback = await get(handle.port, `/learners/${learnerId}/callback?personaId=elena`);
      expect(elenaCallback.body?.callbackLine).toBe('Она рассказала о родительском собрании.');

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('ticket #34: GET /learners/:id/callback rejects an unrecognized personaId with 400', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await get(handle.port, '/learners/00000000-0000-0000-0000-000000000000/callback?personaId=not-a-real-persona');
      expect(response.statusCode).toBe(400);

      await handle.close();
      await pool.end();
    });

    it('ticket #34: POST /learners/:id/memories rejects an unrecognized personaId with 400', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await post(handle.port, '/learners/00000000-0000-0000-0000-000000000000/memories', {
        content: 'test',
        personaId: 'not-a-real-persona',
      });
      expect(response.statusCode).toBe(400);

      await handle.close();
      await pool.end();
    });
  });

  describe('address book endpoint (ticket #34)', () => {
    it('GET /learners/:id/address-book returns Валентина reached and Елена next for a fresh learner', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;

      const response = await get(handle.port, `/learners/${learnerId}/address-book`);
      expect(response.statusCode).toBe(200);
      expect(response.body?.entries).toEqual(expect.arrayContaining([
        { personaId: 'valentina', status: 'reached', dials: { comprehensionLoad: 2, productionDemand: 2, repairBehaviour: 1 } },
        { personaId: 'elena', status: 'next', dials: { comprehensionLoad: 4, productionDemand: 3, repairBehaviour: 4 } },
      ]));

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('ticket #34 AC #2: Елена\'s address-book dial calibration is her own, distinct from Валентина\'s — not the same numbers under a different name', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;

      const response = await get(handle.port, `/learners/${learnerId}/address-book`);
      const entries = response.body?.entries as { personaId: string; dials: Record<string, number> }[];
      const valentinaDials = entries.find(entry => entry.personaId === 'valentina')?.dials;
      const elenaDials = entries.find(entry => entry.personaId === 'elena')?.dials;
      expect(elenaDials).not.toEqual(valentinaDials);

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('GET /learners/:id/address-book returns Елена reached once real learner_structures data crosses B1-readiness', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;
      for (const structureKey of ['aspect_perfective', 'verbs_of_motion', 'case_government']) {
        await pool.query(
          `INSERT INTO learner_structures (learner_id, structure_key, stability) VALUES ($1, $2, 0.9)`,
          [learnerId, structureKey],
        );
      }

      const response = await get(handle.port, `/learners/${learnerId}/address-book`);
      expect(response.body?.entries).toEqual(expect.arrayContaining([
        { personaId: 'elena', status: 'reached', dials: { comprehensionLoad: 4, productionDemand: 3, repairBehaviour: 4 } },
      ]));

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('GET /learners/:id/address-book with a malformed learner id returns 400', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await get(handle.port, '/learners/not-a-uuid/address-book');
      expect(response.statusCode).toBe(400);

      await handle.close();
      await pool.end();
    });
  });

  describe('session history endpoint (History tab)', () => {
    it('GET /learners/:id/sessions returns real sessions, newest first, with turn counts', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;
      const olderSession = await pool.query<{ id: string }>(
        'INSERT INTO sessions (learner_id, started_at) VALUES ($1, $2) RETURNING id',
        [learnerId, new Date('2026-07-01T10:00:00Z')],
      );
      const olderSessionId = olderSession.rows[0]?.id;
      await pool.query('INSERT INTO turns (session_id, speaker, content) VALUES ($1, $2, $3)', [olderSessionId, 'learner', 'привет']);
      const newerSession = await pool.query<{ id: string }>(
        'INSERT INTO sessions (learner_id, started_at) VALUES ($1, $2) RETURNING id',
        [learnerId, new Date('2026-07-15T10:00:00Z')],
      );
      const newerSessionId = newerSession.rows[0]?.id;

      const response = await get(handle.port, `/learners/${learnerId}/sessions`);
      expect(response.statusCode).toBe(200);
      expect(response.body?.sessions).toEqual([
        { id: newerSessionId, startedAt: expect.any(String), endedAt: null, turnCount: 0, topPattern: null },
        { id: olderSessionId, startedAt: expect.any(String), endedAt: null, turnCount: 1, topPattern: null },
      ]);
      expect(response.body?.nextCursor).toBeNull();

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('GET /learners/:id/sessions?limit= paginates: a real nextCursor comes back, and passing it forward returns the next page with no overlap', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;
      const sessionIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const session = await pool.query<{ id: string }>(
          'INSERT INTO sessions (learner_id, started_at) VALUES ($1, $2) RETURNING id',
          [learnerId, new Date(2026, 6, 1 + i, 10)],
        );
        sessionIds.push(session.rows[0]?.id as string);
      }

      const firstPage = await get(handle.port, `/learners/${learnerId}/sessions?limit=2`);
      expect(firstPage.statusCode).toBe(200);
      const firstIds = (firstPage.body?.sessions as { id: string }[]).map(session => session.id);
      expect(firstIds).toEqual([sessionIds[2], sessionIds[1]]);
      const nextCursor = firstPage.body?.nextCursor as { startedAt: string; id: string };
      expect(nextCursor).not.toBeNull();

      const secondPage = await get(
        handle.port,
        `/learners/${learnerId}/sessions?limit=2&cursorStartedAt=${encodeURIComponent(nextCursor.startedAt)}&cursorId=${nextCursor.id}`,
      );
      expect(secondPage.statusCode).toBe(200);
      const secondIds = (secondPage.body?.sessions as { id: string }[]).map(session => session.id);
      expect(secondIds).toEqual([sessionIds[0]]);
      expect(secondPage.body?.nextCursor).toBeNull();

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('GET /learners/:id/sessions rejects a cursorStartedAt without a matching cursorId with 400', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;

      const response = await get(handle.port, `/learners/${learnerId}/sessions?cursorStartedAt=${encodeURIComponent(new Date().toISOString())}`);
      expect(response.statusCode).toBe(400);

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });

    it('GET /learners/:id/sessions with a malformed learner id returns 400', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const response = await get(handle.port, '/learners/not-a-uuid/sessions');
      expect(response.statusCode).toBe(400);

      await handle.close();
      await pool.end();
    });

    it('GET /learners/:id/sessions for a learner with no sessions returns an empty array', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      const handle = await startServer(testEnv(), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;

      const response = await get(handle.port, `/learners/${learnerId}/sessions`);
      expect(response.statusCode).toBe(200);
      expect(response.body?.sessions).toEqual([]);

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
    // seedBenchmark writes real, persistent rows to the shared dev DB (it's idempotent, not
    // temporary) — every test in this block deletes them afterward so later runs/other test
    // files don't inherit real "current" benchmark content that breaks their own assumptions
    // (matching seed-benchmark.test.ts/benchmark.test.ts's own cleanup of the same months).
    const SEEDED_MONTH_KEYS = ['2026-06', '2026-07'];

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
      await pool.query('DELETE FROM benchmark_sets WHERE month_key = ANY($1)', [SEEDED_MONTH_KEYS]);
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

      // Deletes the learner first — cascades away its benchmark_attempts row, so the
      // benchmark_sets delete right after doesn't hit the (deliberately no-cascade) FK from
      // benchmark_attempts.benchmark_set_id.
      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.query('DELETE FROM benchmark_sets WHERE month_key = ANY($1)', [SEEDED_MONTH_KEYS]);
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
      await pool.query('DELETE FROM benchmark_sets WHERE month_key = ANY($1)', [SEEDED_MONTH_KEYS]);
      await pool.end();
    });
  });

  describe('full daily loop sequence (ticket #25)', () => {
    /**
     * The concrete, buildable substitute for the ticket's own UAT ("complete
     * three to five real consecutive days... behaving deliberately... confirm
     * the loop never falls back to Wave 1 scripted content at any point") —
     * that UAT needs a human on a real device (Converse's own live pipeline
     * is a separate, already-disclosed gap — ticket #18). What's genuinely
     * testable here, deterministically, is everything Converse is NOT: a
     * real learner running several real sessions end to end through the
     * actual HTTP API, confirming Open/Debrief/Tomorrow's real-data paths
     * (the ones ticket #25's mobile-side fix now actually wires into the
     * live navigation chain) return real, evolving content throughout, and
     * that the session cap still enforces during that real sequence.
     */
    it('a learner completing several real sessions sees real, evolving scenario/debrief/callback data throughout, and the cap still enforces', async () => {
      const pool = new Pool({ connectionString: DATABASE_URL });
      await applySchema(pool);
      await seedScenarios(pool);
      const cap = 3;
      const handle = await startServer(testEnv({ DAILY_SESSION_CAP: cap }), pool);

      const learnerResponse = await post(handle.port, '/learners', {});
      const learnerId = learnerResponse.body?.id as string;

      // Genuinely distinct per day, not just "day 0 differs from the rest" — days 1 and 2 used to
      // submit the identical observation, which meant nothing about real, non-repeating content
      // was actually being exercised (found in this ticket's own code review).
      const dailyObservations = [
        [{ kind: 'grammar_error', structureKey: 'genitive_plural', detail: { tag: 'missed the genitive plural' } }],
        [{ kind: 'avoidance', structureKey: 'aspect_perfective', impeded: true, detail: { tag: 'steered around this' } }],
        [{ kind: 'grammar_error', structureKey: 'motion_verbs', detail: { tag: 'mixed up a motion verb' } }],
      ];

      const scenarioTitles: string[] = [];
      for (let day = 0; day < cap; day++) {
        const sessionResponse = await post(handle.port, '/sessions', { learnerId });
        expect(sessionResponse.statusCode).toBe(201);
        const sessionId = sessionResponse.body?.id as string;

        // Real scenario assignment (ticket #21) — Tomorrow's real-data path has something real to show.
        const scenarioResponse = await get(handle.port, `/sessions/${sessionId}/scenario`);
        expect(scenarioResponse.statusCode).toBe(200);
        const scenario = scenarioResponse.body?.scenario as { title: string; ladder: unknown[] };
        expect(typeof scenario.title).toBe('string');
        expect(scenario.ladder.length).toBeGreaterThan(0);
        scenarioTitles.push(scenario.title);

        // Real, genuinely different performance each day — real observations -> real ranked debrief
        // that actually reflects *that day's* structureKey, not just "some non-empty list."
        const observations = dailyObservations[day] as typeof dailyObservations[number];
        const observationsResponse = await post(handle.port, `/sessions/${sessionId}/observations`, { learnerId, observations });
        expect(observationsResponse.statusCode).toBe(201);
        const promotedItems = observationsResponse.body?.debriefItems as { detail: { structureKey?: string } }[];
        expect(promotedItems.length).toBeGreaterThan(0);
        expect(promotedItems.some(item => item.detail.structureKey === observations[0]?.structureKey)).toBe(true);

        // Debrief's own real-data path (ticket #20), fetched independently — exactly what the
        // live navigation now actually reaches, since this ticket's mobile fix forwards sessionId
        // through Converse instead of dropping it. Checks the specific structureKey survives the
        // read path too, not just that *some* items exist.
        const debriefResponse = await get(handle.port, `/sessions/${sessionId}/debrief`);
        expect(debriefResponse.statusCode).toBe(200);
        const debriefItems = debriefResponse.body?.debriefItems as { detail: { structureKey?: string } }[];
        expect(debriefItems.length).toBeGreaterThan(0);
        expect(debriefItems.some(item => item.detail.structureKey === observations[0]?.structureKey)).toBe(true);

        // Real callback line (ticket #22) — checks the actual response shape, not just that the
        // endpoint didn't error (a 200 with an unrelated/empty body would have passed a
        // status-only check, which is what this test originally did before its own review caught it).
        const callbackResponse = await get(handle.port, `/learners/${learnerId}/callback`);
        expect(callbackResponse.statusCode).toBe(200);
        expect(callbackResponse.body).toHaveProperty('callbackLine');
        const callbackLine = callbackResponse.body?.callbackLine;
        expect(callbackLine === null || typeof callbackLine === 'string').toBe(true);
      }

      // Real scenario selection responds to real history (least-recently-used rotation, ticket
      // #21), not a static value — with only two seeded scenarios and three real sessions, it
      // shouldn't be the same scenario every single day.
      expect(new Set(scenarioTitles).size).toBeGreaterThan(1);

      // Session cap (ticket #24) still enforces during this real sequence — the (cap+1)th session is rejected.
      const overCapResponse = await post(handle.port, '/sessions', { learnerId });
      expect(overCapResponse.statusCode).toBe(429);
      expect(overCapResponse.body?.code).toBe('daily_cap_reached');

      await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
      await handle.close();
      await pool.end();
    });
  });
});
