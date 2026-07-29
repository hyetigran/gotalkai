import { Pool } from 'pg';

import { loadEnv } from './env';
import { applySchema } from './schema';

/**
 * CLI entrypoint for applying schema.sql — run explicitly (`pnpm
 * db:migrate`), not automatically at process boot. Automatic
 * migration-on-boot means every replica racing to apply DDL on deploy;
 * an explicit, one-shot step run as part of the deploy pipeline is the
 * safer default.
 */
async function main() {
  const env = loadEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    await applySchema(pool);
    console.log('schema applied');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('migration failed:', error);
  process.exit(1);
});
