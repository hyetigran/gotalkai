import type { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_PATH = path.join(__dirname, '..', 'schema.sql');

/**
 * Applies schema.sql. Idempotent — every statement in the file is
 * `CREATE ... IF NOT EXISTS`, so re-running against an already-migrated
 * database is a no-op. Shared by src/migrate.ts and the integration
 * tests, so both apply the schema the exact same way.
 */
export async function applySchema(pool: Pool): Promise<void> {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await pool.query(schema);
}
