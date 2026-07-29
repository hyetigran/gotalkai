import type { Pool } from 'pg';
import type { Env } from './env';
import { createServer as createHttpServer } from 'node:http';

export type AppServiceHandle = {
  /** The port actually bound — matters when `env.PORT` is `0` (tests ask the OS for a free port). */
  port: number;
  close: () => Promise<void>;
};

function sendJson(res: import('node:http').ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Starts the app service: a minimal HTTP server with one endpoint, `GET
 * /health`, which round-trips a real query through the Postgres pool
 * (`SELECT now()`) rather than returning a stubbed response — that's the
 * whole point of this ticket's acceptance criteria. Everything else (auth,
 * persistence, memory, debrief analysis — ARCHITECTURE.md §3.2) is later
 * ticket work.
 */
export function startServer(env: Env, pool: Pool): Promise<AppServiceHandle> {
  return new Promise((resolve, reject) => {
    const httpServer = createHttpServer((req, res) => {
      if (req.method === 'GET' && req.url === '/health') {
        pool
          .query<{ server_time: Date }>('SELECT now() AS server_time')
          .then((result) => {
            sendJson(res, 200, { status: 'ok', serverTime: result.rows[0]?.server_time });
          })
          .catch(() => {
            sendJson(res, 503, { status: 'error', message: 'database unavailable' });
          });
        return;
      }
      sendJson(res, 404, { status: 'not found' });
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
