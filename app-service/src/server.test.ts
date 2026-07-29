import type { Env } from './env';
import http from 'node:http';
import { Pool } from 'pg';
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
});
