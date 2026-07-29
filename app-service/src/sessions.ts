import type { Pool } from 'pg';
import { z } from 'zod';

/** `POST /sessions` request body. */
export const createSessionRequestSchema = z.object({
  learnerId: z.string().min(1),
});

export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

/**
 * Minimal learner/session creation — just enough to exercise the
 * observations/debrief endpoints end to end (ticket #20). Not the real
 * onboarding flow (ticket #30) or session-assembly logic (scenario
 * selection, calibration — ticket #21): those own the real request
 * shapes for creating learners/sessions in earnest. This exists because
 * without *some* way to create a learner and a session, ticket #20's own
 * acceptance criteria (a real session with real, client-visible
 * debrief_items) would be undemonstrable from the client at all.
 */
export async function createLearner(pool: Pool): Promise<string> {
  const result = await pool.query<{ id: string }>('INSERT INTO learners DEFAULT VALUES RETURNING id');
  const row = result.rows[0];
  if (!row)
    throw new Error('insert did not return a row');
  return row.id;
}

export async function createSession(pool: Pool, learnerId: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    'INSERT INTO sessions (learner_id) VALUES ($1) RETURNING id',
    [learnerId],
  );
  const row = result.rows[0];
  if (!row)
    throw new Error('insert did not return a row');
  return row.id;
}
