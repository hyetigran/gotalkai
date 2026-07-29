import type { AxiosError } from 'axios';
import { createQuery } from 'react-query-kit';

import { appServiceClient } from '@/lib/app-service/client';

type CallbackLineResponse = { callbackLine: string | null };
type CallbackLineVariables = { learnerId: string };

/** `GET /learners/:id/callback` (app-service, ticket #22) — the real, rotating persona-memory callback line for a learner. */
export const useCallbackLine = createQuery<string | null, CallbackLineVariables, AxiosError>({
  queryKey: ['callback-line'],
  fetcher: variables =>
    appServiceClient
      .get<CallbackLineResponse>(`learners/${variables.learnerId}/callback`)
      .then(response => response.data.callbackLine),
});
