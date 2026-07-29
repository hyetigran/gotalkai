import { loadEnv } from './env';
import { startServer } from './server';

/**
 * Entrypoint. Validates env at boot (crashes loudly on invalid config,
 * per PRD §7.8) and starts the long-lived process — never serverless
 * (PRD §7.6: cold starts exceed the latency budget, warm provider
 * connections must stick — not that this skeleton holds any yet).
 */
async function main() {
  const env = loadEnv();
  const handle = await startServer(env);
  console.log(`voice-service listening on :${handle.port} (${env.NODE_ENV})`);

  const shutdown = (signal: string) => {
    console.log(`voice-service received ${signal}, shutting down`);
    handle.close().then(() => process.exit(0)).catch(() => process.exit(1));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('voice-service failed to start:', error);
  process.exit(1);
});
