import type { Pool } from 'pg';
import { z } from 'zod';

/**
 * Default page size for the History tab's infinite scroll (mobile:
 * `debrief-history-screen.tsx`). Matches `debrief.ts`'s
 * `TOLD_RECENTLY_LOOKBACK_SESSIONS` precedent of "small, deliberate
 * default" rather than an arbitrary round number.
 */
export const SESSION_HISTORY_PAGE_SIZE = 20;

/** Server-side ceiling on a client-requested `limit` — trusted input only up to a point, same reasoning as every other Zod boundary in this file (PRD §7.8). */
export const SESSION_HISTORY_MAX_LIMIT = 50;

/**
 * `GET /learners/:id/sessions` query params. `cursorStartedAt`/`cursorId`
 * are keyset-pagination coordinates (see `getSessionHistoryForLearner`'s
 * own comment for why keyset, not OFFSET) — both-or-neither, since a
 * cursor is one (started_at, id) pair, not two independent filters.
 */
export const sessionHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(SESSION_HISTORY_MAX_LIMIT).optional(),
  cursorStartedAt: z.string().datetime().optional(),
  cursorId: z.string().uuid().optional(),
}).refine(
  data => (data.cursorStartedAt === undefined) === (data.cursorId === undefined),
  { message: 'cursorStartedAt and cursorId must both be present or both be absent' },
);

export type SessionHistoryCursor = { startedAt: string; id: string };

export type SessionHistoryEntry = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  turnCount: number;
  /** The session's #1-ranked debrief_items row (same shape debrief.ts's DebriefItemView uses), or null when the session has no promoted patterns — either nothing was observed, or the post-session analyser hasn't run yet. */
  topPattern: { kind: string; detail: Record<string, unknown> } | null;
};

export type SessionHistoryPage = {
  sessions: SessionHistoryEntry[];
  /** Present iff there's at least one older session past this page — the client's next `cursorStartedAt`/`cursorId` query params, verbatim. */
  nextCursor: SessionHistoryCursor | null;
};

type SessionRow = { id: string; started_at: Date; ended_at: Date | null };
type TurnCountRow = { session_id: string; count: string };
type TopPatternRow = { session_id: string; kind: string; detail: Record<string, unknown> };

/**
 * Real counterpart to `debrief-fixture.ts`'s role on the single-session
 * screen — no fixture exists for a *list* of sessions (ticket: "History
 * tab", tab restructuring; pagination added on learner feedback —
 * "loading more on scroll"). Three simple queries rather than one large
 * join, matching this file's siblings' style (`debrief.ts`'s
 * `getRecentlyToldPatternKeys`) — a session with zero turns or zero
 * debrief items is common (an abandoned or just-started session) and a
 * LEFT JOIN version would need the same "might not exist" handling
 * anyway, so three queries plus an in-memory merge is no less clear.
 *
 * Keyset (`WHERE (started_at, id) < cursor`), not `OFFSET` — OFFSET
 * re-scans and discards every earlier row on each page (O(n) per page,
 * O(n²) overall) and silently skips/duplicates rows if a new session is
 * inserted between page loads (both learner-visible bugs on a list that
 * updates in real time). The tie-break on `id` matches
 * `getRecentlyToldPatternKeys`'s own precedent for why `started_at`
 * alone isn't a stable sort key. Written as two explicit comparisons
 * (`started_at < $x OR (started_at = $x AND id < $y)`), not a Postgres
 * row-constructor comparison (`(started_at, id) < ($x, $y)`) — the
 * row-constructor form leaves Postgres to infer `$x`/`$y`'s types from
 * context, which is less predictable across pg driver versions than two
 * plain scalar comparisons.
 */
export async function getSessionHistoryForLearner(
  pool: Pool,
  learnerId: string,
  options: { limit?: number; cursor?: SessionHistoryCursor } = {},
): Promise<SessionHistoryPage> {
  const limit = options.limit ?? SESSION_HISTORY_PAGE_SIZE;
  // Over-fetches by one row (not a second COUNT(*) round-trip) purely to learn "is there a next page."
  const sessionsResult = options.cursor
    ? await pool.query<SessionRow>(
        `SELECT id, started_at, ended_at FROM sessions
         WHERE learner_id = $1 AND (started_at < $2 OR (started_at = $2 AND id < $3))
         ORDER BY started_at DESC, id DESC LIMIT $4`,
        [learnerId, options.cursor.startedAt, options.cursor.id, limit + 1],
      )
    : await pool.query<SessionRow>(
        'SELECT id, started_at, ended_at FROM sessions WHERE learner_id = $1 ORDER BY started_at DESC, id DESC LIMIT $2',
        [learnerId, limit + 1],
      );

  const hasNextPage = sessionsResult.rows.length > limit;
  const sessions = hasNextPage ? sessionsResult.rows.slice(0, limit) : sessionsResult.rows;
  if (sessions.length === 0)
    return { sessions: [], nextCursor: null };
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

  const lastSession = sessions[sessions.length - 1] as SessionRow;
  return {
    sessions: sessions.map(session => ({
      id: session.id,
      startedAt: session.started_at.toISOString(),
      endedAt: session.ended_at ? session.ended_at.toISOString() : null,
      turnCount: turnCountBySessionId.get(session.id) ?? 0,
      topPattern: topPatternBySessionId.get(session.id) ?? null,
    })),
    nextCursor: hasNextPage ? { startedAt: lastSession.started_at.toISOString(), id: lastSession.id } : null,
  };
}
