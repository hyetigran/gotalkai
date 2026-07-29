import type { Pool } from 'pg';
import { z } from 'zod';

/**
 * Ticket #35: the monthly comprehension benchmark (PRD §6.3). See
 * docs/adr/0018 for the full design reasoning — multiple-choice
 * questions per audio clip, scored server-side, current set resolved by
 * `month_key`, trend read back as plain counts (not a chart).
 */

export type BenchmarkChoice = string;

/** Client-facing item shape — deliberately omits `correctChoiceIndex` (docs/adr/0018: "scoring integrity"). */
export type BenchmarkItemView = {
  id: string;
  order: number;
  audioUrl: string;
  question: string;
  choices: BenchmarkChoice[];
};

export type BenchmarkSetView = {
  id: string;
  monthKey: string;
  title: string;
  items: BenchmarkItemView[];
};

/**
 * The most recent set at or before the current month, falling back to
 * the latest set available at all if none exists for/before this exact
 * month (e.g. content was seeded for a future month, or this is the
 * very first month any content exists) — there's no requirement that a
 * set exist for literally every calendar month, only that whichever set
 * is "current" isn't stale relative to what's actually been authored.
 * Returns null if no benchmark content has been seeded at all.
 */
export async function getCurrentBenchmarkSet(pool: Pool): Promise<BenchmarkSetView | null> {
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  // Two branches with opposite sort directions (most recent past/current
  // set; otherwise the earliest future one), so a single ORDER BY can't
  // express both cleanly — a UNION ALL of two cheap, index-backed LIMIT-1
  // queries stays more readable than a CASE-based sort-key trick for what
  // is, either way, one query round-trip.
  const setResult = await pool.query<{ id: string; month_key: string; title: string }>(
    `(SELECT id, month_key, title FROM benchmark_sets WHERE month_key <= $1 ORDER BY month_key DESC LIMIT 1)
     UNION ALL
     (SELECT id, month_key, title FROM benchmark_sets WHERE NOT EXISTS (SELECT 1 FROM benchmark_sets WHERE month_key <= $1) ORDER BY month_key ASC LIMIT 1)
     LIMIT 1`,
    [currentMonthKey],
  );
  const set = setResult.rows[0];
  if (!set)
    return null;

  const itemsResult = await pool.query<{ id: string; item_order: number; audio_url: string; question: string; choices: BenchmarkChoice[] }>(
    'SELECT id, item_order, audio_url, question, choices FROM benchmark_items WHERE benchmark_set_id = $1 ORDER BY item_order ASC',
    [set.id],
  );

  return {
    id: set.id,
    monthKey: set.month_key,
    title: set.title,
    items: itemsResult.rows.map(row => ({ id: row.id, order: row.item_order, audioUrl: row.audio_url, question: row.question, choices: row.choices })),
  };
}

/** `POST /learners/:id/benchmark-attempts` request body. */
export const submitBenchmarkAttemptRequestSchema = z.object({
  benchmarkSetId: z.string().uuid(),
  answers: z.array(z.object({
    itemId: z.string().uuid(),
    selectedChoiceIndex: z.number().int().min(0),
  })).min(1),
});

export type SubmitBenchmarkAttemptRequest = z.infer<typeof submitBenchmarkAttemptRequestSchema>;

export type BenchmarkAttemptResult = {
  id: string;
  correctCount: number;
  totalCount: number;
  completedAt: string;
};

/** Thrown when `benchmarkSetId` doesn't exist, or `answers` doesn't cover exactly that set's items — a malformed/stale submission, not a scoring edge case. */
export class InvalidBenchmarkAttemptError extends Error {}

/**
 * Scores the attempt server-side against the stored correct answers
 * (never trusting a client-reported score) and writes one
 * `benchmark_attempts` row. `total_count` is the set's real item count,
 * not merely `answers.length` — a submission missing items still scores
 * against the true total rather than a shortened one, and one omitting
 * or duplicating an item id is rejected outright as malformed rather
 * than silently scored against whatever happened to be submitted.
 */
export async function submitBenchmarkAttempt(pool: Pool, learnerId: string, request: SubmitBenchmarkAttemptRequest): Promise<BenchmarkAttemptResult> {
  const itemsResult = await pool.query<{ id: string; correct_choice_index: number }>(
    'SELECT id, correct_choice_index FROM benchmark_items WHERE benchmark_set_id = $1',
    [request.benchmarkSetId],
  );
  if (itemsResult.rows.length === 0)
    throw new InvalidBenchmarkAttemptError(`no such benchmark set: ${request.benchmarkSetId}`);

  const correctByItemId = new Map(itemsResult.rows.map(row => [row.id, row.correct_choice_index]));
  const answeredItemIds = new Set(request.answers.map(answer => answer.itemId));
  if (answeredItemIds.size !== request.answers.length)
    throw new InvalidBenchmarkAttemptError('duplicate itemId in answers');
  if (answeredItemIds.size !== correctByItemId.size || ![...answeredItemIds].every(id => correctByItemId.has(id)))
    throw new InvalidBenchmarkAttemptError('answers do not exactly match this set\'s items');

  const correctCount = request.answers.filter(answer => correctByItemId.get(answer.itemId) === answer.selectedChoiceIndex).length;
  const totalCount = itemsResult.rows.length;

  const result = await pool.query<{ id: string; completed_at: string }>(
    `INSERT INTO benchmark_attempts (learner_id, benchmark_set_id, correct_count, total_count)
     VALUES ($1, $2, $3, $4)
     RETURNING id, completed_at`,
    [learnerId, request.benchmarkSetId, correctCount, totalCount],
  );
  const row = result.rows[0];
  if (!row)
    throw new Error('insert did not return a row');

  return { id: row.id, correctCount, totalCount, completedAt: row.completed_at };
}

export type BenchmarkTrendEntry = {
  attemptId: string;
  monthKey: string;
  correctCount: number;
  totalCount: number;
  completedAt: string;
};

/** Ordered oldest-first — docs/adr/0018: "lists past attempts chronologically", the trend view's only real requirement. */
export async function getBenchmarkTrend(pool: Pool, learnerId: string): Promise<BenchmarkTrendEntry[]> {
  const result = await pool.query<{ id: string; month_key: string; correct_count: number; total_count: number; completed_at: string }>(
    `SELECT a.id, s.month_key, a.correct_count, a.total_count, a.completed_at
     FROM benchmark_attempts a
     JOIN benchmark_sets s ON s.id = a.benchmark_set_id
     WHERE a.learner_id = $1
     ORDER BY a.completed_at ASC`,
    [learnerId],
  );
  return result.rows.map(row => ({ attemptId: row.id, monthKey: row.month_key, correctCount: row.correct_count, totalCount: row.total_count, completedAt: row.completed_at }));
}
