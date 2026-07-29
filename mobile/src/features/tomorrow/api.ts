import type { AxiosError } from 'axios';
import { createQuery } from 'react-query-kit';

import { appServiceClient } from '@/lib/app-service/client';

export type ScenarioLadderStep = {
  level: number;
  label: string;
};

export type SessionScenario = {
  title: string;
  intro: string;
  ladder: ScenarioLadderStep[];
  currentStepIndex: number;
  sessionsSinceLastUse: number | null;
};

type SessionScenarioResponse = { scenario: SessionScenario };
type SessionScenarioVariables = { sessionId: string };

/** `GET /sessions/:id/scenario` (app-service, ticket #21) — the real, selected scenario/complication level for a session. */
export const useSessionScenario = createQuery<SessionScenario, SessionScenarioVariables, AxiosError>({
  queryKey: ['session-scenario'],
  fetcher: variables =>
    appServiceClient
      .get<SessionScenarioResponse>(`sessions/${variables.sessionId}/scenario`)
      .then(response => response.data.scenario),
});
