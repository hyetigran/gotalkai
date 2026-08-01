import type { Env } from '../config/env';
import { Pool } from 'pg';

/**
 * A connection pool, not a single client — PRD §7.7: "Connection pooler
 * ... Long-lived Node processes plus per-request connections exhaust
 * Postgres connections faster than expected." No schema/queries beyond
 * the health check live here yet; that's later ticket work once
 * migrations exist (ARCHITECTURE.md §3.5).
 */
export function createPool(env: Env): Pool {
  return new Pool({ connectionString: env.DATABASE_URL });
}
