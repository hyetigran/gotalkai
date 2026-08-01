import { createPool } from './db/db';
import { loadEnv } from './config/env';
import { deleteExpiredSessions } from './db/retention';
import { startServer } from './http/server';

const RETENTION_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Entrypoint. Validates env at boot (crashes loudly on invalid config,
 * per PRD §7.8) and starts the long-lived process — never serverless
 * (PRD §7.6: cold starts exceed the latency budget).
 *
 * Deployed as a separate process from voice-service (ARCHITECTURE.md
 * §7.6/§7.7's two-service split) — this file has no import, dependency,
 * or code path reaching into voice-service, and voice-service has none
 * reaching into this one. That's what makes AC #4 ("no voice-service code
 * path queries this service or the database mid-conversation") true
 * structurally: there's no shared module either could call into, not just
 * a convention neither happens to violate yet.
 */
async function main() {
  const env = loadEnv();
  const pool = createPool(env);
  const handle = await startServer(env, pool);
  console.log(`app-service listening on :${handle.port} (${env.NODE_ENV})`);

  // Enforce the retention policy (PRD §7.7) before data accumulates, not
  // once it's already a problem: sweep once at boot, then daily.
  const runRetentionSweep = () => {
    deleteExpiredSessions(pool, env.RETENTION_DAYS)
      .then((deleted) => {
        if (deleted > 0)
          console.log(`retention sweep: deleted ${deleted} session(s) older than ${env.RETENTION_DAYS} days`);
      })
      .catch(error => console.error('retention sweep failed:', error));
  };
  runRetentionSweep();
  const retentionIntervalId = setInterval(runRetentionSweep, RETENTION_SWEEP_INTERVAL_MS);

  const shutdown = (signal: string) => {
    console.log(`app-service received ${signal}, shutting down`);
    clearInterval(retentionIntervalId);
    handle.close()
      .then(() => pool.end())
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('app-service failed to start:', error);
  process.exit(1);
});
