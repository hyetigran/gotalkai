import { Pool } from 'pg';

import { seedBenchmark } from './seed-benchmark';
import { applySchema } from './schema';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/lingoai_app_service';

let pool: Pool;

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  await applySchema(pool);
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await pool.query('DELETE FROM benchmark_sets WHERE month_key = $1', ['2026-07']);
});

describe('seedBenchmark', () => {
  it('writes a real benchmark set with at least one item', async () => {
    await seedBenchmark(pool);

    const setResult = await pool.query<{ id: string }>('SELECT id FROM benchmark_sets WHERE month_key = $1', ['2026-07']);
    expect(setResult.rows).toHaveLength(1);

    const itemsResult = await pool.query('SELECT * FROM benchmark_items WHERE benchmark_set_id = $1', [setResult.rows[0]?.id]);
    expect(itemsResult.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('is idempotent — re-running does not create duplicate sets or items', async () => {
    await seedBenchmark(pool);
    await seedBenchmark(pool);

    const setResult = await pool.query('SELECT id FROM benchmark_sets WHERE month_key = $1', ['2026-07']);
    expect(setResult.rows).toHaveLength(1);

    const itemsResult = await pool.query('SELECT id FROM benchmark_items WHERE benchmark_set_id = $1', [setResult.rows[0]?.id]);
    expect(itemsResult.rows).toHaveLength(1);
  });
});
