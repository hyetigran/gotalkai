import type { Pool } from 'pg';
import { z } from 'zod';

import { selectNextScenario } from './scenario-selector';
import { seedStarterMemories } from './seed-starter-memories';

/** `POST /sessions` request body. */
export const createSessionRequestSchema = z.object({
  learnerId: z.string().min(1),
});

export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

/**
 * Minimal learner creation — just enough to exercise the
 * observations/debrief/scenario/memory endpoints end to end (ticket
 * #20). Not the real onboarding flow (ticket #30): that owns the real
 * request shape for creating learners in earnest. This exists because
 * without *some* way to create a learner, ticket #20's own acceptance
 * criteria (a real session with real, client-visible debrief_items)
 * would be undemonstrable from the client at all.
 *
 * Also seeds 1–2 starter persona_memories (ticket #22 AC #3) so session
 * one is never cold — see src/seed-starter-memories.ts. The learner row
 * and its starter memories are written in one transaction: a learner
 * that exists but silently has zero memories (because seeding failed
 * after the learner insert already committed) would quietly violate AC
 * #3 for that one learner, with no retry or visibility into it.
 */
export async function createLearner(pool: Pool): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: string }>('INSERT INTO learners DEFAULT VALUES RETURNING id');
    const row = result.rows[0];
    if (!row)
      throw new Error('insert did not return a row');
    await seedStarterMemories(client, row.id);
    await client.query('COMMIT');
    return row.id;
  }
  catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  finally {
    client.release();
  }
}

/**
 * Creating a session runs scenario selection (ticket #21 AC #1/#3): the
 * caller doesn't choose a scenario — the server does, from the
 * learner's real learner_structures/session history — and the result is
 * written onto the new session row (`scenario_id`,
 * `scenario_sessions_since_last_use`, `calibration.complicationLevel`)
 * so it can be read back by the selector next time and rendered by the
 * Tomorrow screen this time.
 */
export async function createSession(pool: Pool, learnerId: string): Promise<string> {
  const selection = await selectNextScenario(pool, learnerId);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO sessions (learner_id, scenario_id, scenario_sessions_since_last_use, calibration)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [learnerId, selection.scenarioId, selection.sessionsSinceLastUse, JSON.stringify({ complicationLevel: selection.level })],
  );
  const row = result.rows[0];
  if (!row)
    throw new Error('insert did not return a row');
  return row.id;
}
