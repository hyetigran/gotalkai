import type { Pool } from 'pg';

import { getTurnsForSession } from '../turns/turns';

export type SessionSummary = {
  totalTurns: number;
  personaTurns: number;
  learnerTurns: number;
  /** Persona turns the learner tapped to reveal a translation for — the real "you understood her without help" figure is `personaTurns - revealedCount`. */
  revealedCount: number;
  /** Persona turns where the server's own comprehension check (voice-service's persona LLM, PERSONA_COMPREHENSION_VALUES) came back 'understood' — "she understood you X of Y." */
  understoodCount: number;
  startedAt: string;
  endedAt: string | null;
};

/**
 * Aggregates a session's real `turns` rows into the figures the Debrief
 * screen's top section needs (mobile's `debrief-screen.tsx`) — the
 * counterpart to `getDebriefForSession`'s pattern cards, for the summary
 * copy above them. Returns null for a nonexistent session, matching this
 * codebase's established "not found" convention
 * (`getScenarioViewForSession`, `selectAndMarkCallbackMemory`).
 *
 * Aggregated in JS over `getTurnsForSession`'s raw rows rather than a
 * separate SQL `COUNT(...) FILTER (...)` query — one shared read, same
 * "small enough per session to aggregate in JS" reasoning
 * `getTurnsForSession`'s own comment already gives.
 */
export async function getSessionSummary(pool: Pool, sessionId: string): Promise<SessionSummary | null> {
  const sessionResult = await pool.query<{ started_at: Date; ended_at: Date | null }>(
    'SELECT started_at, ended_at FROM sessions WHERE id = $1',
    [sessionId],
  );
  const sessionRow = sessionResult.rows[0];
  if (!sessionRow)
    return null;

  const turns = await getTurnsForSession(pool, sessionId);
  const personaTurns = turns.filter(turn => turn.speaker === 'persona');

  return {
    totalTurns: turns.length,
    personaTurns: personaTurns.length,
    learnerTurns: turns.length - personaTurns.length,
    revealedCount: personaTurns.filter(turn => turn.revealed).length,
    understoodCount: personaTurns.filter(turn => turn.comprehension === 'understood').length,
    startedAt: sessionRow.started_at.toISOString(),
    endedAt: sessionRow.ended_at ? sessionRow.ended_at.toISOString() : null,
  };
}

/**
 * Marks a session ended (PRD §8's session duration figure needs a real
 * `ended_at`, which nothing wrote before this). `COALESCE(ended_at, now())`
 * makes a second call idempotent — the same "nothing stops this endpoint
 * from being called more than once" caution `debrief.ts` already
 * documents for the observations endpoint, here guarding against the
 * loop's own goToDebrief firing twice (e.g. a fast double-tap on "End")
 * from moving `endedAt` forward a second time. Returns false for a
 * nonexistent session id, same "not found" convention as the rest of
 * this module.
 */
export async function endSession(pool: Pool, sessionId: string): Promise<boolean> {
  const result = await pool.query(
    'UPDATE sessions SET ended_at = COALESCE(ended_at, now()) WHERE id = $1',
    [sessionId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * The one extra lookup the finish-session flow (server.ts's `POST
 * /sessions/:id/end`) needs beyond `endSession`/`getTurnsForSession`:
 * `recordObservations`/`detectAndRecordAvoidance` both key their writes
 * on `learnerId`, not just `sessionId` (the same shape the observations
 * endpoint's own request body already required of a manual caller) —
 * this reads it back off the session row itself instead of requiring
 * the client to send a value the server already knows. Returns null for
 * a nonexistent session, same "not found" convention as the rest of
 * this module.
 */
export async function getLearnerIdForSession(pool: Pool, sessionId: string): Promise<string | null> {
  const result = await pool.query<{ learner_id: string }>(
    'SELECT learner_id FROM sessions WHERE id = $1',
    [sessionId],
  );
  return result.rows[0]?.learner_id ?? null;
}
