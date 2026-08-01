import type { Pool } from 'pg';

/**
 * Ticket #23 (PRD §5.5): "we inject target structures at session start,
 * so we can diff intent against production and detect what the learner
 * steered around." What actually classifies raw turns into structured
 * observations (kind, structureKey) is a separate, not-yet-built
 * component — observations-request.ts's own comment calls it "the
 * post-session analyser, ticket #14+" — so avoidance detection here
 * operates on that analyser's already-classified output, not on raw
 * transcript text. Building a real Russian aspect/tense classifier from
 * scratch is a different, much larger problem (closer to the stress-
 * annotation-tier NLP work blocked on #13's bake-off) than this ticket's
 * own scope of "diff intent against production."
 *
 * Pure: true iff the target structure was never attempted (in any
 * observation — success, failure, or otherwise) across the session's own
 * observations. "Attempted at all" is the bar, not "attempted correctly"
 * — UAT #3 requires an outright wrong attempt to surface as a normal
 * error pattern, not get mislabeled as avoidance, and this function
 * doesn't need to know success/failure to make that distinction: any
 * observation naming the target structure proves it wasn't avoided.
 */
export function detectAvoidance(targetStructureKey: string | null, sessionObservationStructureKeys: (string | undefined)[]): boolean {
  if (!targetStructureKey)
    return false;
  return !sessionObservationStructureKeys.includes(targetStructureKey);
}

/**
 * Ticket #23 AC #1: resolves a session's assigned (scenario_id,
 * complication level) back to that level's authored target structure —
 * the same join scenario-view.ts uses to resolve a session's ladder step,
 * kept separate here since it's in service of avoidance detection, not
 * the Tomorrow screen's view model.
 */
async function getTargetStructureForSession(pool: Pool, sessionId: string): Promise<string | null> {
  const result = await pool.query<{ target_structure_key: string | null }>(
    `SELECT sc.target_structure_key
     FROM sessions s
     JOIN scenario_complications sc
       ON sc.scenario_id = s.scenario_id
      AND sc.level = (s.calibration->>'complicationLevel')::int
     WHERE s.id = $1`,
    [sessionId],
  );
  return result.rows[0]?.target_structure_key ?? null;
}

/**
 * Ticket #23 AC #2/#3: diffs this session's real observations against its
 * injected target structure, and — if avoided — writes a distinctly-kinded
 * `avoidance` observation and increments the learner's tracked
 * `avoidances` count for that structure (the counter scenario-selector.ts
 * already reads via `getPerformanceRate`, previously never written
 * anywhere).
 *
 * `detail.tag` is set directly on the observation ("you steered around
 * this") rather than requiring any change to the mobile Debrief screen —
 * `mapDebriefItemToPattern` (mobile/src/features/debrief/map-debrief-item.ts)
 * already renders `detail.tag` verbatim when present, falling back to a
 * generic "impeded communication" tag only when it's absent. AC #3's
 * "distinct in framing" is satisfied by using that existing hook, not by
 * adding a new one.
 *
 * Called after `recordObservations` (so the target's presence/absence can
 * be checked against this session's real observations) and before
 * `rankAndPromoteDebrief` (so a detected avoidance is itself eligible for
 * promotion into the debrief, same as any other observation).
 *
 * Returns the new observation's id, or null if nothing was targeted or
 * the target wasn't avoided.
 */
export async function detectAndRecordAvoidance(pool: Pool, sessionId: string, learnerId: string): Promise<string | null> {
  const targetStructureKey = await getTargetStructureForSession(pool, sessionId);
  if (!targetStructureKey)
    return null;

  // debrief.ts's own comment notes "nothing stops this session's
  // observations endpoint from being called more than once." Without a
  // lock, two concurrent calls for the same session could both read "not
  // yet attempted" before either commits, both insert an `avoidance`
  // observation, and double-count `learner_structures.avoidances` —
  // exactly the read-then-write race `createSession` (sessions.ts) guards
  // against with a per-learner advisory lock. This is the same pattern,
  // keyed on `sessionId` instead: the read (checking whether the target
  // was attempted) and the write (recording avoidance) both happen inside
  // one locked transaction, so a second concurrent call blocks until the
  // first commits, then re-reads and correctly sees the first call's own
  // avoidance observation as proof the target is no longer un-attempted —
  // it exits via the same `detectAvoidance` check, no duplicate write.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [sessionId]);

    const observations = await client.query<{ detail: { structureKey?: string } }>(
      'SELECT detail FROM observations WHERE session_id = $1',
      [sessionId],
    );
    const producedStructureKeys = observations.rows.map(row => row.detail.structureKey);
    if (!detectAvoidance(targetStructureKey, producedStructureKeys)) {
      await client.query('COMMIT');
      return null;
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO observations (session_id, learner_id, kind, detail)
       VALUES ($1, $2, 'avoidance', $3)
       RETURNING id`,
      [sessionId, learnerId, JSON.stringify({ structureKey: targetStructureKey, impeded: true, tag: 'you steered around this' })],
    );
    await client.query(
      `INSERT INTO learner_structures (learner_id, structure_key, avoidances)
       VALUES ($1, $2, 1)
       ON CONFLICT (learner_id, structure_key)
       DO UPDATE SET avoidances = learner_structures.avoidances + 1, updated_at = now()`,
      [learnerId, targetStructureKey],
    );
    await client.query('COMMIT');
    return inserted.rows[0]?.id ?? null;
  }
  catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  finally {
    client.release();
  }
}
