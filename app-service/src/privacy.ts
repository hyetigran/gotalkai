import type { Pool } from 'pg';

/**
 * Ticket #31 AC #4: "a single deletion path clears memories, audio, and
 * transcripts together ... verified to actually cascade across all
 * three, not three separate manual steps a developer could forget."
 *
 * One statement, not three: schema.sql's existing `ON DELETE CASCADE`
 * graph (ticket #19-#22) already removes every row that hangs off a
 * learner — `learner_structures`, `observations`, `persona_memories`,
 * and `sessions` (which itself cascades to `turns` and
 * `debrief_items`) — the moment the `learners` row goes. There is
 * nothing here to orchestrate; the guarantee is structural (the FK
 * graph), not procedural (a list of deletes this function has to
 * remember to keep in sync as tables are added).
 *
 * There is no audio-storage table yet — no audio-storage subsystem has
 * been designed (ARCHITECTURE.md), so "audio" isn't literally a table
 * this cascades through today. When one is added it must hang off
 * `learners` (directly, or via a table that itself cascades from
 * `learners`) so this same statement keeps covering it automatically,
 * rather than becoming a second deletion path someone has to remember
 * to update.
 *
 * Returns whether a learner was actually deleted (false for an id that
 * didn't exist) — a boolean rather than this codebase's usual null-for-
 * not-found convention (getScenarioViewForSession,
 * selectAndMarkCallbackMemory), since a DELETE has no row to hand back.
 */
export async function deleteLearner(pool: Pool, learnerId: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM learners WHERE id = $1', [learnerId]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Ticket #31 AC #2: consent "separate from the general ToS acceptance."
 * This codebase has no ToS-acceptance flow at all, so "separate" is
 * trivially true today — recorded as its own explicit action regardless,
 * so it stays true if a ToS flow is ever added later instead of becoming
 * accidentally bundled with it.
 *
 * Writes a timestamp (schema.sql's `audio_sampling_consent_at`), not a
 * boolean, so there's a real record of *when* consent was given, not
 * just that it currently is. Returns whether the learner existed.
 */
export async function recordAudioSamplingConsent(pool: Pool, learnerId: string): Promise<boolean> {
  const result = await pool.query(
    'UPDATE learners SET audio_sampling_consent_at = now() WHERE id = $1',
    [learnerId],
  );
  return (result.rowCount ?? 0) > 0;
}
