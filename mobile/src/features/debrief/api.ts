import type { AxiosError } from 'axios';
import { createInfiniteQuery, createMutation, createQuery } from 'react-query-kit';

import { appServiceClient } from '@/lib/app-service/client';

export type DebriefItem = {
  rank: number;
  observationId: string;
  kind: string;
  detail: Record<string, unknown>;
};

type SessionDebriefResponse = { debriefItems: DebriefItem[] };
type SessionDebriefVariables = { sessionId: string };

/** `GET /sessions/:id/debrief` (app-service, ticket #20) — the real, ranked debrief_items for a session. */
export const useSessionDebrief = createQuery<DebriefItem[], SessionDebriefVariables, AxiosError>({
  queryKey: ['session-debrief'],
  fetcher: variables =>
    appServiceClient
      .get<SessionDebriefResponse>(`sessions/${variables.sessionId}/debrief`)
      .then(response => response.data.debriefItems),
});

export type SessionSummary = {
  totalTurns: number;
  personaTurns: number;
  learnerTurns: number;
  /** Persona turns the learner tapped to reveal a translation for — "you understood her without help" is `personaTurns - revealedCount`. */
  revealedCount: number;
  /** Persona turns where the live pipeline's own comprehension check came back 'understood' — "she understood you X of Y." */
  understoodCount: number;
  startedAt: string;
  endedAt: string | null;
};

type SessionSummaryResponse = { summary: SessionSummary };
type SessionSummaryVariables = { sessionId: string };

/** `GET /sessions/:id/summary` (app-service, session-summary.ts) — the real figures behind the Debrief screen's top section (turn counts, comprehension, duration), the counterpart to `useSessionDebrief`'s pattern cards. */
export const useSessionSummary = createQuery<SessionSummary, SessionSummaryVariables, AxiosError>({
  queryKey: ['session-summary'],
  fetcher: variables =>
    appServiceClient
      .get<SessionSummaryResponse>(`sessions/${variables.sessionId}/summary`)
      .then(response => response.data.summary),
});

type EndSessionVariables = { sessionId: string };

/**
 * `POST /sessions/:id/end` (app-service) — marks the session ended and
 * runs the post-session analyser against its real turns server-side
 * before responding, so this screen's `/debrief` and `/summary` reads
 * see finished data rather than a race against an in-flight analysis.
 * Called by `DebriefScreen` itself (not Converse, which navigates here
 * immediately on "End") whenever it lands on a session whose `summary`
 * comes back with `endedAt: null` — that's the real signal for "this
 * session hasn't been finalized yet," true whether this screen was
 * reached straight from Converse or, in principle, any other path that
 * lands on an unfinished session. Keeping the trigger here means the
 * screen that shows the resulting "analysing…" state is the same one
 * that kicks it off, rather than Converse awaiting a real LLM call with
 * nothing to show for the wait.
 */
export const useEndSession = createMutation<void, EndSessionVariables, AxiosError>({
  mutationFn: ({ sessionId }) => appServiceClient.post(`sessions/${sessionId}/end`).then(() => undefined),
});

export type SessionHistoryEntry = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  turnCount: number;
  topPattern: { kind: string; detail: Record<string, unknown> } | null;
};

/** Keyset-pagination coordinates — `session-history.ts` (app-service)'s own `SessionHistoryCursor`, echoed back verbatim as the next page's `?cursorStartedAt=&cursorId=`. */
export type SessionHistoryCursor = { startedAt: string; id: string };

type SessionHistoryPage = { sessions: SessionHistoryEntry[]; nextCursor: SessionHistoryCursor | null };
type SessionHistoryVariables = { learnerId: string };

/**
 * `GET /learners/:id/sessions` (app-service) — the History tab's real
 * session list, "loading more on scroll" per learner feedback.
 * `initialPageParam: undefined` (not `null`) matches
 * `appServiceClient`'s query-param serialization: an `undefined` value
 * on the `params` object is omitted from the querystring entirely,
 * which is what "no cursor, give me the first page" needs to mean here.
 */
export const useSessionHistory = createInfiniteQuery<SessionHistoryPage, SessionHistoryVariables, AxiosError, SessionHistoryCursor | undefined>({
  queryKey: ['session-history'],
  initialPageParam: undefined,
  getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
  fetcher: (variables, { pageParam }) =>
    appServiceClient
      .get<SessionHistoryPage>(`learners/${variables.learnerId}/sessions`, {
        params: { cursorStartedAt: pageParam?.startedAt, cursorId: pageParam?.id },
      })
      .then(response => response.data),
});
