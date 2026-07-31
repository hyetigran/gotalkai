import type { AxiosError } from 'axios';
import { createMutation, createQuery } from 'react-query-kit';

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

/**
 * `voiceServiceToken` (docs/adr/0023): a short-lived, session-scoped
 * credential for voice-service's WS upgrade — see
 * app-service/src/session-token.ts. Forwarded straight through to
 * Converse (`use-open-screen.ts`'s `handleAnswer`) rather than fetched
 * separately, since app-service mints it as part of session creation
 * itself, not a distinct endpoint.
 */
type StartSessionResponse = { id: string; voiceServiceToken: string };
type StartSessionVariables = { learnerId: string };
export type StartSessionErrorBody = { code?: string; message?: string };

/**
 * `POST /sessions` (app-service, ticket #24) — the caller-side of the
 * daily session cap. A 429 with `code: 'daily_cap_reached'` is an
 * expected, distinct outcome (see `open-screen.tsx`'s `handleAnswer`),
 * not a generic failure — check `error.response?.data.code`, not the
 * HTTP status alone, since other 4xx/5xx responses should be handled as
 * real errors.
 */
export const useStartSession = createMutation<StartSessionResponse, StartSessionVariables, AxiosError<StartSessionErrorBody>>({
  mutationFn: variables =>
    appServiceClient.post<StartSessionResponse>('sessions', variables).then(response => response.data),
});
