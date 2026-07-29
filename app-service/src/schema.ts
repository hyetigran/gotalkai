import type { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_PATH = path.join(__dirname, '..', 'schema.sql');

/**
 * An arbitrary fixed key for the advisory lock below — any two calls
 * using the same key serialize against each other. Doesn't need to mean
 * anything; just needs to be stable.
 */
const SCHEMA_LOCK_KEY = 8_412_001;

/**
 * Applies schema.sql. Idempotent — every `CREATE` statement in the file
 * is `IF NOT EXISTS`, and the `ALTER TABLE ... ADD CONSTRAINT` is
 * preceded by a `DROP CONSTRAINT IF EXISTS`, so re-running against an
 * already-migrated database is a no-op. Shared by src/migrate.ts and the
 * integration tests, so both apply the schema the exact same way.
 *
 * Serialized via a transaction-scoped advisory lock: every test file in
 * this project calls this independently in its own `beforeAll`, and Jest
 * runs test files in parallel worker processes against the same shared
 * local database — without serializing, concurrent `ALTER TABLE`
 * statements (which need an ACCESS EXCLUSIVE lock) genuinely deadlock
 * against each other rather than just being a slow-but-safe race.
 */
export async function applySchema(pool: Pool): Promise<void> {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [SCHEMA_LOCK_KEY]);
    await client.query(schema);
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
