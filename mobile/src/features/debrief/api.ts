import type { AxiosError } from 'axios';
import { createInfiniteQuery, createQuery } from 'react-query-kit';

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
