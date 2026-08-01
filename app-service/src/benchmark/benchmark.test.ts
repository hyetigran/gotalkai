import { Pool } from 'pg';

import { getCurrentBenchmarkSet, getBenchmarkTrend, InvalidBenchmarkAttemptError, submitBenchmarkAttempt } from './benchmark';
import { applySchema } from '../db/schema';

/** Runs against a REAL local Postgres instance, no mocking — matching debrief.test.ts's precedent. */
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/lingoai_app_service';

let pool: Pool;
let createdLearnerIds: string[];
let createdBenchmarkSetIds: string[];

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  await applySchema(pool);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(() => {
  createdLearnerIds = [];
  createdBenchmarkSetIds = [];
});

afterEach(async () => {
  if (createdLearnerIds.length > 0)
    await pool.query('DELETE FROM learners WHERE id = ANY($1)', [createdLearnerIds]);
  if (createdBenchmarkSetIds.length > 0)
    await pool.query('DELETE FROM benchmark_sets WHERE id = ANY($1)', [createdBenchmarkSetIds]);
});

async function makeLearner(): Promise<string> {
  const result = await pool.query<{ id: string }>('INSERT INTO learners DEFAULT VALUES RETURNING id');
  const row = result.rows[0];
  if (!row)
    throw new Error('insert did not return a row');
  createdLearnerIds.push(row.id);
  return row.id;
}

type SeedItem = { question: string; choices: string[]; correctChoiceIndex: number };

async function makeBenchmarkSet(monthKey: string, items: SeedItem[]): Promise<{ setId: string; itemIds: string[] }> {
  const setResult = await pool.query<{ id: string }>(
    'INSERT INTO benchmark_sets (month_key, title) VALUES ($1, $2) RETURNING id',
    [monthKey, `Set ${monthKey}`],
  );
  const setId = setResult.rows[0]?.id;
  if (!setId)
    throw new Error('insert did not return a row');
  createdBenchmarkSetIds.push(setId);

  const itemIds: string[] = [];
  for (const [order, item] of items.entries()) {
    const itemResult = await pool.query<{ id: string }>(
      `INSERT INTO benchmark_items (benchmark_set_id, item_order, audio_url, question, choices, correct_choice_index)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [setId, order, 'https://example.invalid/clip.mp3', item.question, JSON.stringify(item.choices), item.correctChoiceIndex],
    );
    const itemId = itemResult.rows[0]?.id;
    if (!itemId)
      throw new Error('insert did not return a row');
    itemIds.push(itemId);
  }
  return { setId, itemIds };
}

describe('getCurrentBenchmarkSet', () => {
  // No "returns null when no benchmark content exists" test here, deliberately: jest.config.js
  // runs test files in parallel (maxWorkers: 4) against one shared local Postgres instance, and
  // this function's query is genuinely global (by design — "the current set" isn't scoped to
  // anything a test could isolate). Asserting the whole benchmark_sets table is empty raced
  // against seed-benchmark.test.ts's own writes/cleanup running concurrently in another worker —
  // reproduced as a real, non-deterministic failure. Every other test in this file (and file
  // in this suite) scopes its assertions to rows it created for exactly this reason; the
  // `if (!set) return null` branch this would have covered is otherwise exercised by the
  // "falls back to the earliest available set" test below, whenever its WHERE NOT EXISTS
  // fallback branch itself matches zero rows.
  //
  // The three tests below still depend on knowing the *entire* set of rows currently in
  // benchmark_sets (there's no per-test scoping key for a genuinely global "current set"
  // lookup, unlike every other table in this schema, which is scoped by learner_id/session_id
  // and so never hit this problem). A residual cross-file race is possible in principle if
  // another file's seedBenchmark() call is mid-flight at exactly the wrong moment — but
  // server.test.ts and seed-benchmark.test.ts both now clean up their seeded rows within the
  // same test (see their own comments), so the window is a single test's duration, not
  // (as it was before that fix, and as reproduced once already) the data persisting
  // indefinitely across the whole suite. Deliberately not adding a table-wide DELETE here to
  // narrow it further — benchmark_attempts.benchmark_set_id has no ON DELETE cascade, so an
  // unscoped delete while another file's attempt row is live would trade this race for a
  // foreign-key-violation failure instead, which isn't an improvement.

  it('returns the most recent set at or before the current month, with items and no correct-answer field', async () => {
    const pastMonthKey = '2000-01'; // always <= "current month" for as long as this test exists
    await makeBenchmarkSet(pastMonthKey, [{ question: 'Q1?', choices: ['A', 'B'], correctChoiceIndex: 1 }]);

    const set = await getCurrentBenchmarkSet(pool);

    expect(set?.monthKey).toBe(pastMonthKey);
    expect(set?.items).toHaveLength(1);
    expect(set?.items[0]).toMatchObject({ question: 'Q1?', choices: ['A', 'B'] });
    expect(set?.items[0]).not.toHaveProperty('correctChoiceIndex');
  });

  it('picks the latest of several past sets, not the earliest', async () => {
    await makeBenchmarkSet('2000-01', [{ question: 'old', choices: ['A'], correctChoiceIndex: 0 }]);
    await makeBenchmarkSet('2000-02', [{ question: 'new', choices: ['A'], correctChoiceIndex: 0 }]);

    const set = await getCurrentBenchmarkSet(pool);
    expect(set?.monthKey).toBe('2000-02');
  });

  it('falls back to the earliest available set when none exists at or before the current month', async () => {
    const futureMonthKey = '2999-01';
    await makeBenchmarkSet(futureMonthKey, [{ question: 'Q1?', choices: ['A'], correctChoiceIndex: 0 }]);

    const set = await getCurrentBenchmarkSet(pool);
    expect(set?.monthKey).toBe(futureMonthKey);
  });
});

describe('submitBenchmarkAttempt', () => {
  it('scores correctly and writes an attempt row', async () => {
    const learnerId = await makeLearner();
    const { setId, itemIds } = await makeBenchmarkSet('2000-03', [
      { question: 'Q1?', choices: ['A', 'B'], correctChoiceIndex: 0 },
      { question: 'Q2?', choices: ['A', 'B'], correctChoiceIndex: 1 },
    ]);

    const result = await submitBenchmarkAttempt(pool, learnerId, {
      benchmarkSetId: setId,
      answers: [
        { itemId: itemIds[0] as string, selectedChoiceIndex: 0 }, // correct
        { itemId: itemIds[1] as string, selectedChoiceIndex: 0 }, // wrong (correct is 1)
      ],
    });

    expect(result.correctCount).toBe(1);
    expect(result.totalCount).toBe(2);

    const trend = await getBenchmarkTrend(pool, learnerId);
    expect(trend).toEqual([{ attemptId: result.id, monthKey: '2000-03', correctCount: 1, totalCount: 2, completedAt: result.completedAt }]);
  });

  it('never trusts a client-reported score — recomputes from stored correct answers regardless of what a caller might wish were true', async () => {
    const learnerId = await makeLearner();
    const { setId, itemIds } = await makeBenchmarkSet('2000-04', [{ question: 'Q1?', choices: ['A', 'B'], correctChoiceIndex: 1 }]);

    const result = await submitBenchmarkAttempt(pool, learnerId, {
      benchmarkSetId: setId,
      answers: [{ itemId: itemIds[0] as string, selectedChoiceIndex: 0 }], // wrong
    });

    expect(result.correctCount).toBe(0);
  });

  it('rejects a nonexistent benchmark set', async () => {
    const learnerId = await makeLearner();
    await expect(submitBenchmarkAttempt(pool, learnerId, {
      benchmarkSetId: '00000000-0000-4000-8000-000000000000',
      answers: [{ itemId: '00000000-0000-4000-8000-000000000001', selectedChoiceIndex: 0 }],
    })).rejects.toThrow(InvalidBenchmarkAttemptError);
  });

  it('rejects answers that omit an item from the set', async () => {
    const learnerId = await makeLearner();
    const { setId, itemIds } = await makeBenchmarkSet('2000-05', [
      { question: 'Q1?', choices: ['A'], correctChoiceIndex: 0 },
      { question: 'Q2?', choices: ['A'], correctChoiceIndex: 0 },
    ]);

    await expect(submitBenchmarkAttempt(pool, learnerId, {
      benchmarkSetId: setId,
      answers: [{ itemId: itemIds[0] as string, selectedChoiceIndex: 0 }], // missing itemIds[1]
    })).rejects.toThrow(InvalidBenchmarkAttemptError);
  });

  it('rejects duplicate item ids in the submission', async () => {
    const learnerId = await makeLearner();
    const { setId, itemIds } = await makeBenchmarkSet('2000-06', [{ question: 'Q1?', choices: ['A'], correctChoiceIndex: 0 }]);

    await expect(submitBenchmarkAttempt(pool, learnerId, {
      benchmarkSetId: setId,
      answers: [
        { itemId: itemIds[0] as string, selectedChoiceIndex: 0 },
        { itemId: itemIds[0] as string, selectedChoiceIndex: 0 },
      ],
    })).rejects.toThrow(InvalidBenchmarkAttemptError);
  });
});

describe('getBenchmarkTrend', () => {
  it('returns attempts ordered oldest first, across multiple sets', async () => {
    const learnerId = await makeLearner();
    const { setId: setId1, itemIds: itemIds1 } = await makeBenchmarkSet('2000-07', [{ question: 'Q?', choices: ['A', 'B'], correctChoiceIndex: 0 }]);
    const { setId: setId2, itemIds: itemIds2 } = await makeBenchmarkSet('2000-08', [{ question: 'Q?', choices: ['A', 'B'], correctChoiceIndex: 0 }]);

    await submitBenchmarkAttempt(pool, learnerId, { benchmarkSetId: setId1, answers: [{ itemId: itemIds1[0] as string, selectedChoiceIndex: 0 }] });
    await submitBenchmarkAttempt(pool, learnerId, { benchmarkSetId: setId2, answers: [{ itemId: itemIds2[0] as string, selectedChoiceIndex: 1 }] });

    const trend = await getBenchmarkTrend(pool, learnerId);
    expect(trend.map(entry => entry.monthKey)).toEqual(['2000-07', '2000-08']);
    expect(trend[1]?.correctCount).toBe(0);
  });

  it('returns an empty array for a learner with no attempts', async () => {
    const learnerId = await makeLearner();
    const trend = await getBenchmarkTrend(pool, learnerId);
    expect(trend).toEqual([]);
  });
});
