import type { Pool } from 'pg';

/**
 * How many past sessions the History tab shows (mobile:
 * `debrief-history-screen.tsx`). Not a hard product limit — just keeps
 * this endpoint's three queries bounded as a learner's session count
 * grows, matching `debrief.ts`'s own `TOLD_RECENTLY_LOOKBACK_SESSIONS`
 * precedent for "recent, not exhaustive."
 */
export const SESSION_HISTORY_LIMIT = 30;

export type SessionHistoryEntry = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  turnCount: number;
  /** The session's #1-ranked debrief_items row (same shape debrief.ts's DebriefItemView uses), or null when the session has no promoted patterns — either nothing was observed, or the post-session analyser hasn't run yet. */
  topPattern: { kind: string; detail: Record<string, unknown> } | null;
};

type SessionRow = { id: string; started_at: Date; ended_at: Date | null };
type TurnCountRow = { session_id: string; count: string };
type TopPatternRow = { session_id: string; kind: string; detail: Record<string, unknown> };

/**
 * Real counterpart to `debrief-fixture.ts`'s role on the single-session
 * screen — no fixture exists for a *list* of sessions (ticket: "History
 * tab", tab restructuring). Three simple queries rather than one large
 * join, matching this file's siblings' style (`debrief.ts`'s
 * `getRecentlyToldPatternKeys`) — a session with zero turns or zero
 * debrief items is common (an abandoned or just-started session) and a
 * LEFT JOIN version would need the same "might not exist" handling
 * anyway, so three queries plus an in-memory merge is no less clear.
 */
export async function getSessionHistoryForLearner(pool: Pool, learnerId: string): Promise<SessionHistoryEntry[]> {
  const sessionsResult = await pool.query<SessionRow>(
    'SELECT id, started_at, ended_at FROM sessions WHERE learner_id = $1 ORDER BY started_at DESC, id DESC LIMIT $2',
    [learnerId, SESSION_HISTORY_LIMIT],
  );
  const sessions = sessionsResult.rows;
  if (sessions.length === 0)
    return [];
  const sessionIds = sessions.map(session => session.id);

  const turnCountsResult = await pool.query<TurnCountRow>(
    'SELECT session_id, COUNT(*) AS count FROM turns WHERE session_id = ANY($1) GROUP BY session_id',
    [sessionIds],
  );
  const turnCountBySessionId = new Map(turnCountsResult.rows.map(row => [row.session_id, Number(row.count)]));

  const topPatternsResult = await pool.query<TopPatternRow>(
    `SELECT di.session_id, o.kind, o.detail
     FROM debrief_items di
     JOIN observations o ON o.id = di.observation_id
     WHERE di.session_id = ANY($1) AND di.rank = 0`,
    [sessionIds],
  );
  const topPatternBySessionId = new Map(topPatternsResult.rows.map(row => [row.session_id, { kind: row.kind, detail: row.detail }]));

  return sessions.map(session => ({
    id: session.id,
    startedAt: session.started_at.toISOString(),
    endedAt: session.ended_at ? session.ended_at.toISOString() : null,
    turnCount: turnCountBySessionId.get(session.id) ?? 0,
    topPattern: topPatternBySessionId.get(session.id) ?? null,
  }));
}
