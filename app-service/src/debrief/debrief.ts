import type { Pool } from 'pg';

import { detectAndRecordAvoidance } from './avoidance-detection';
import { computeObservationScore, computeReadiness } from './debrief-ranking';

/**
 * How many of the learner's most recent prior sessions count toward
 * "told recently" (PRD §5.4: "don't repeat across sessions"). PRD
 * doesn't specify a window size; provisional, tunable — see
 * docs/adr/0004-debrief-readiness-proxy.md.
 */
export const TOLD_RECENTLY_LOOKBACK_SESSIONS = 3;

/** How many patterns get promoted from `observations` to `debrief_items` (PRD §6.1: "Three patterns, not every slip"). */
export const DEBRIEF_ITEM_COUNT = 3;

export type ObservationInput = {
  kind: string;
  /** Groups observations into a pattern (PRD §5.4's ranking unit). Falls back to `kind` when absent — see groupKey below. */
  structureKey?: string;
  /** Whether this specific occurrence broke communication (PRD §5.4's `impeded` term). */
  impeded?: boolean;
  detail?: Record<string, unknown>;
};

/**
 * Writes every observation the analyser noticed — all of them, not just
 * the ones that end up promoted (PRD §8: "we keep everything the
 * analyser noticed even though only three are shown. That is the
 * training data for tuning the ranking function.").
 */
export async function recordObservations(
  pool: Pool,
  sessionId: string,
  learnerId: string,
  observations: ObservationInput[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const observation of observations) {
    const detail = { ...observation.detail, structureKey: observation.structureKey, impeded: observation.impeded ?? false };
    const result = await pool.query<{ id: string }>(
      'INSERT INTO observations (session_id, learner_id, kind, detail) VALUES ($1, $2, $3, $4) RETURNING id',
      [sessionId, learnerId, observation.kind, JSON.stringify(detail)],
    );
    const row = result.rows[0];
    if (row)
      ids.push(row.id);
  }
  return ids;
}

/**
 * The full post-observations pipeline (ticket #23): writes the given
 * observations, checks/records avoidance against them, then ranks and
 * promotes the top `DEBRIEF_ITEM_COUNT` into `debrief_items`. Shared by
 * the `POST /sessions/:id/observations` endpoint (server.ts, originally
 * a test harness's own entry point) and the post-session analyser's own
 * finish-session flow (`POST /sessions/:id/end`) — same three-call
 * sequence, same ordering `detectAndRecordAvoidance`'s own comment
 * documents (avoidance-detection.ts): after `recordObservations` so
 * "was the target attempted" can be checked against this session's real
 * data, before `rankAndPromoteDebrief` so a detected avoidance is
 * itself eligible for promotion into the debrief.
 */
export async function writeAndRankObservations(pool: Pool, sessionId: string, learnerId: string, observations: ObservationInput[]): Promise<DebriefItemView[]> {
  await recordObservations(pool, sessionId, learnerId, observations);
  await detectAndRecordAvoidance(pool, sessionId, learnerId);
  return rankAndPromoteDebrief(pool, sessionId, learnerId);
}

type ObservationRow = {
  id: string;
  kind: string;
  detail: { structureKey?: string; impeded?: boolean } & Record<string, unknown>;
  created_at: Date;
};

function groupKey(observation: Pick<ObservationRow, 'kind' | 'detail'>): string {
  return observation.detail.structureKey ?? observation.kind;
}

/**
 * Ranks this session's observations per PRD §5.4 and promotes the top
 * `DEBRIEF_ITEM_COUNT` patterns into `debrief_items`. Observations are
 * grouped by structure (or `kind` when no structure applies); each
 * group's `frequency` is how many times that pattern occurred in this
 * session, `impeded` is true if any occurrence broke communication,
 * `readiness` comes from the learner's `learner_structures` row for that
 * structure (0 for groups keyed by `kind` — no structure means no
 * readiness signal to check), and `told_recently` is true if the same
 * pattern was already promoted in one of the learner's last
 * `TOLD_RECENTLY_LOOKBACK_SESSIONS` sessions.
 */
export async function rankAndPromoteDebrief(pool: Pool, sessionId: string, learnerId: string): Promise<DebriefItemView[]> {
  const observationsResult = await pool.query<ObservationRow>(
    'SELECT id, kind, detail, created_at FROM observations WHERE session_id = $1 ORDER BY created_at ASC',
    [sessionId],
  );
  if (observationsResult.rows.length === 0)
    return [];

  const groups = new Map<string, ObservationRow[]>();
  for (const row of observationsResult.rows) {
    const key = groupKey(row);
    const existing = groups.get(key);
    if (existing)
      existing.push(row);
    else
      groups.set(key, [row]);
  }

  const recentPatternKeys = await getRecentlyToldPatternKeys(pool, learnerId, sessionId);

  const scored: { key: string; representative: ObservationRow; score: number }[] = [];
  for (const [key, rows] of groups) {
    const first = rows[0];
    if (!first)
      continue;
    const structureKey = first.detail.structureKey;
    const readiness = structureKey ? await computeReadinessForStructure(pool, learnerId, structureKey) : 0;
    const impeded = rows.some(row => row.detail.impeded === true);
    const score = computeObservationScore({
      frequency: rows.length,
      impeded,
      readiness,
      toldRecently: recentPatternKeys.has(key),
    });
    scored.push({ key, representative: first, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const promoted = scored.slice(0, DEBRIEF_ITEM_COUNT);

  // Full-replace, not accumulate: nothing stops this session's
  // observations endpoint from being called more than once (the
  // eventual analyser may post incrementally), and re-ranking should
  // always leave exactly the current top DEBRIEF_ITEM_COUNT promoted —
  // never a growing pile of stale rows from earlier calls.
  await pool.query('DELETE FROM debrief_items WHERE session_id = $1', [sessionId]);

  const items: DebriefItemView[] = [];
  for (const [rank, { representative }] of promoted.entries()) {
    await pool.query(
      'INSERT INTO debrief_items (session_id, observation_id, rank) VALUES ($1, $2, $3)',
      [sessionId, representative.id, rank],
    );
    items.push({
      rank,
      observationId: representative.id,
      kind: representative.kind,
      detail: representative.detail,
    });
  }
  return items;
}

async function computeReadinessForStructure(pool: Pool, learnerId: string, structureKey: string): Promise<number> {
  const result = await pool.query<{ exposures: number; stability: string }>(
    'SELECT exposures, stability FROM learner_structures WHERE learner_id = $1 AND structure_key = $2',
    [learnerId, structureKey],
  );
  const row = result.rows[0];
  if (!row)
    return computeReadiness({ exposures: 0, stability: 0 });
  return computeReadiness({ exposures: row.exposures, stability: Number(row.stability) });
}

async function getRecentlyToldPatternKeys(pool: Pool, learnerId: string, currentSessionId: string): Promise<Set<string>> {
  const recentSessions = await pool.query<{ id: string }>(
    // `started_at` alone isn't unique (two sessions can share a
    // timestamp), so tie-break on `id` — otherwise which sessions land
    // inside the LIMIT window could vary nondeterministically across
    // calls.
    'SELECT id FROM sessions WHERE learner_id = $1 AND id <> $2 ORDER BY started_at DESC, id DESC LIMIT $3',
    [learnerId, currentSessionId, TOLD_RECENTLY_LOOKBACK_SESSIONS],
  );
  if (recentSessions.rows.length === 0)
    return new Set();

  const result = await pool.query<{ kind: string; detail: { structureKey?: string } & Record<string, unknown> }>(
    `SELECT o.kind, o.detail
     FROM debrief_items di
     JOIN observations o ON o.id = di.observation_id
     WHERE di.session_id = ANY($1)`,
    [recentSessions.rows.map(row => row.id)],
  );
  return new Set(result.rows.map(row => row.detail.structureKey ?? row.kind));
}

export type DebriefItemView = {
  rank: number;
  observationId: string;
  kind: string;
  detail: Record<string, unknown>;
};

export async function getDebriefForSession(pool: Pool, sessionId: string): Promise<DebriefItemView[]> {
  const result = await pool.query<{ rank: number; observation_id: string; kind: string; detail: Record<string, unknown> }>(
    `SELECT di.rank, di.observation_id, o.kind, o.detail
     FROM debrief_items di
     JOIN observations o ON o.id = di.observation_id
     WHERE di.session_id = $1
     ORDER BY di.rank ASC`,
    [sessionId],
  );
  return result.rows.map(row => ({ rank: row.rank, observationId: row.observation_id, kind: row.kind, detail: row.detail }));
}
