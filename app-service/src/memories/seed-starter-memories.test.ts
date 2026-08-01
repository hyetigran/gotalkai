import { Pool } from 'pg';

import { applySchema } from '../db/schema';
import { seedStarterMemories } from './seed-starter-memories';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/lingoai_app_service';

let pool: Pool;
let createdLearnerIds: string[];

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  await applySchema(pool);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(() => {
  createdLearnerIds = [];
});

afterEach(async () => {
  if (createdLearnerIds.length > 0)
    await pool.query('DELETE FROM learners WHERE id = ANY($1)', [createdLearnerIds]);
});

async function makeLearner(): Promise<string> {
  const result = await pool.query<{ id: string }>('INSERT INTO learners DEFAULT VALUES RETURNING id');
  const row = result.rows[0];
  if (!row)
    throw new Error('insert did not return a row');
  createdLearnerIds.push(row.id);
  return row.id;
}

describe('seedStarterMemories', () => {
  it('writes 1-2 real memory rows for a brand-new learner, so session one is never cold', async () => {
    const learnerId = await makeLearner();
    await seedStarterMemories(pool, learnerId);

    const rows = await pool.query<{ content: string }>('SELECT content FROM persona_memories WHERE learner_id = $1', [learnerId]);
    expect(rows.rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.rows.length).toBeLessThanOrEqual(2);
    for (const row of rows.rows)
      expect(row.content.length).toBeGreaterThan(0);
  });
});
