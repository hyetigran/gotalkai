import type { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

/**
 * An arbitrary fixed key for the advisory lock below — any two calls
 * using the same key serialize against each other. Doesn't need to mean
 * anything; just needs to be stable.
 */
const SCHEMA_LOCK_KEY = 8_412_001;

/**
 * Applies pending SQL files from `migrations/` in lexical order.
 * Tracks applied files in `schema_migrations` so each file runs once.
 *
 * Shared by src/db/migrate.ts and the integration tests, so both apply
 * the schema the exact same way.
 *
 * Serialized via a transaction-scoped advisory lock: every test file in
 * this project calls this independently in its own `beforeAll`, and Jest
 * runs test files in parallel worker processes against the same shared
 * local database — without serializing, concurrent `ALTER TABLE`
 * statements (which need an ACCESS EXCLUSIVE lock) genuinely deadlock
 * against each other rather than just being a slow-but-safe race.
 *
 * Existing databases that previously applied the monolithic schema.sql
 * still work: `001_init.sql` is idempotent (`IF NOT EXISTS`), then gets
 * recorded in the journal on first run of this migrator.
 */
export async function applySchema(pool: Pool): Promise<void> {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [SCHEMA_LOCK_KEY]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const applied = await client.query<{ id: string }>('SELECT id FROM schema_migrations');
    const appliedSet = new Set(applied.rows.map((row) => row.id));

    for (const file of files) {
      if (appliedSet.has(file))
        continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
    }

    await client.query('COMMIT');
  }
  catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  finally {
    client.release();
  }
}
