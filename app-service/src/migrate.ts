import { Pool } from 'pg';

import { loadEnv } from './env';
import { applySchema } from './schema';
import { seedScenarios } from './seed-scenarios';

/**
 * CLI entrypoint for applying schema.sql (and seeding hand-authored
 * scenario content, ticket #21) — run explicitly (`pnpm db:migrate`),
 * not automatically at process boot. Automatic migration-on-boot means
 * every replica racing to apply DDL on deploy; an explicit, one-shot
 * step run as part of the deploy pipeline is the safer default.
 */
async function main() {
  const env = loadEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    await applySchema(pool);
    console.log('schema applied');
    await seedScenarios(pool);
    console.log('scenarios seeded');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('migration failed:', error);
  process.exit(1);
});
