import type { AxiosError } from 'axios';
import { createQuery } from 'react-query-kit';

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

type SessionHistoryResponse = { sessions: SessionHistoryEntry[] };
type SessionHistoryVariables = { learnerId: string };

/** `GET /learners/:id/sessions` (app-service) — the History tab's real, most-recent-first session list. */
export const useSessionHistory = createQuery<SessionHistoryEntry[], SessionHistoryVariables, AxiosError>({
  queryKey: ['session-history'],
  fetcher: variables =>
    appServiceClient
      .get<SessionHistoryResponse>(`learners/${variables.learnerId}/sessions`)
      .then(response => response.data.sessions),
});
