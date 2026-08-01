import { Pool } from 'pg';

import { seedBenchmark } from './seed-benchmark';
import { applySchema } from '../db/schema';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/lingoai_app_service';
const SEEDED_MONTH_KEYS = ['2026-06', '2026-07'];

let pool: Pool;

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  await applySchema(pool);
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await pool.query('DELETE FROM benchmark_sets WHERE month_key = ANY($1)', [SEEDED_MONTH_KEYS]);
});

describe('seedBenchmark', () => {
  it('writes real benchmark sets across two different months, each with at least one item', async () => {
    await seedBenchmark(pool);

    const setResult = await pool.query<{ id: string; month_key: string }>('SELECT id, month_key FROM benchmark_sets WHERE month_key = ANY($1)', [SEEDED_MONTH_KEYS]);
    expect(setResult.rows.map(row => row.month_key).sort()).toEqual(SEEDED_MONTH_KEYS);

    for (const row of setResult.rows) {
      const itemsResult = await pool.query('SELECT * FROM benchmark_items WHERE benchmark_set_id = $1', [row.id]);
      expect(itemsResult.rows.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('is idempotent — re-running does not create duplicate sets or items', async () => {
    await seedBenchmark(pool);
    await seedBenchmark(pool);

    const setResult = await pool.query('SELECT id FROM benchmark_sets WHERE month_key = ANY($1)', [SEEDED_MONTH_KEYS]);
    expect(setResult.rows).toHaveLength(2);

    for (const row of setResult.rows) {
      const itemsResult = await pool.query('SELECT id FROM benchmark_items WHERE benchmark_set_id = $1', [row.id]);
      expect(itemsResult.rows).toHaveLength(1);
    }
  });
});
