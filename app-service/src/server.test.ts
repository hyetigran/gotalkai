import type { Env } from './env';
import http from 'node:http';
import { Pool } from 'pg';
import { applySchema } from './schema';
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
});
