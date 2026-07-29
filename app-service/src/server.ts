import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import type { Env } from './env';
import { createServer as createHttpServer } from 'node:http';

import { getDebriefForSession, rankAndPromoteDebrief, recordObservations } from './debrief';
import { recordObservationsRequestSchema } from './observations-request';
import { createLearner, createSession, createSessionRequestSchema } from './sessions';

export type AppServiceHandle = {
  /** The port actually bound — matters when `env.PORT` is `0` (tests ask the OS for a free port). */
  port: number;
  close: () => Promise<void>;
};

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      }
      catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const SESSION_OBSERVATIONS_PATH = /^\/sessions\/([^/]+)\/observations$/;
const SESSION_DEBRIEF_PATH = /^\/sessions\/([^/]+)\/debrief$/;

async function handleRequest(req: IncomingMessage, res: ServerResponse, pool: Pool): Promise<void> {
  const url = req.url ?? '';

  if (req.method === 'GET' && url === '/health') {
    try {
      const result = await pool.query<{ server_time: Date }>('SELECT now() AS server_time');
      sendJson(res, 200, { status: 'ok', serverTime: result.rows[0]?.server_time });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  if (req.method === 'POST' && url === '/learners') {
    try {
      const id = await createLearner(pool);
      sendJson(res, 201, { status: 'ok', id });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  if (req.method === 'POST' && url === '/sessions') {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    }
    catch {
      sendJson(res, 400, { status: 'error', message: 'invalid JSON body' });
      return;
    }
    const parsed = createSessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(res, 400, { status: 'error', message: 'invalid request body', issues: parsed.error.issues });
      return;
    }
    try {
      const id = await createSession(pool, parsed.data.learnerId);
      sendJson(res, 201, { status: 'ok', id });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  const observationsMatch = SESSION_OBSERVATIONS_PATH.exec(url);
  if (req.method === 'POST' && observationsMatch) {
    const sessionId = observationsMatch[1] as string;
    let body: unknown;
    try {
      body = await readJsonBody(req);
    }
    catch {
      sendJson(res, 400, { status: 'error', message: 'invalid JSON body' });
      return;
    }
    const parsed = recordObservationsRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(res, 400, { status: 'error', message: 'invalid request body', issues: parsed.error.issues });
      return;
    }
    try {
      await recordObservations(pool, sessionId, parsed.data.learnerId, parsed.data.observations);
      const debriefItems = await rankAndPromoteDebrief(pool, sessionId, parsed.data.learnerId);
      sendJson(res, 201, { status: 'ok', debriefItems });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  const debriefMatch = SESSION_DEBRIEF_PATH.exec(url);
  if (req.method === 'GET' && debriefMatch) {
    const sessionId = debriefMatch[1] as string;
    try {
      const debriefItems = await getDebriefForSession(pool, sessionId);
      sendJson(res, 200, { status: 'ok', debriefItems });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  sendJson(res, 404, { status: 'not found' });
}

/**
 * Starts the app service. Endpoints:
 * - `GET /health` — round-trips a real query through the Postgres pool
 *   (`SELECT now()`) rather than returning a stubbed response.
 * - `POST /learners`, `POST /sessions` — minimal creation, just enough
 *   to exercise the endpoints below end to end (see src/sessions.ts —
 *   not the real onboarding/session-assembly flow, tickets #30/#21).
 * - `POST /sessions/:id/observations` — writes every observation the
 *   caller reports, then ranks and promotes the top patterns into
 *   `debrief_items` (PRD §5.4, ticket #20).
 * - `GET /sessions/:id/debrief` — the promoted `debrief_items` for a
 *   session, for the Debrief screen to render.
 *
 * Everything else (auth, persona LLM output, memory) is later ticket
 * work (ARCHITECTURE.md §3.2).
 */
export function startServer(env: Env, pool: Pool): Promise<AppServiceHandle> {
  return new Promise((resolve, reject) => {
    const httpServer = createHttpServer((req, res) => {
      handleRequest(req, res, pool).catch(() => {
        sendJson(res, 500, { status: 'error', message: 'internal error' });
      });
    });

    httpServer.once('error', reject);
    httpServer.listen(env.PORT, () => {
      const address = httpServer.address();
      const port = typeof address === 'object' && address !== null ? address.port : env.PORT;
      resolve({
        port,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            httpServer.close((err) => {
              if (err)
                closeReject(err);
              else
                closeResolve();
            });
          }),
      });
    });
  });
}
