import type { AxiosError } from 'axios';
import { createMutation, createQuery } from 'react-query-kit';

import { appServiceClient } from '@/lib/app-service/client';

export type Learner = {
  id: string;
  cyrillicLiterate: boolean;
  translitEnabled: boolean;
};

type LearnerResponse = { learner: Learner };
type LearnerVariables = { learnerId: string };

/** `GET /learners/:id` (app-service, ticket #30) — a learner's onboarding answers, for the shared reveal slot's translation-vs-transliteration choice. */
export const useLearner = createQuery<Learner, LearnerVariables, AxiosError>({
  queryKey: ['learner'],
  fetcher: variables =>
    appServiceClient
      .get<LearnerResponse>(`learners/${variables.learnerId}`)
      .then(response => response.data.learner),
});

/** Mirrors app-service's own TURN_COMPREHENSION_VALUES (turns.ts) — duplicated across the mobile/backend boundary, same convention this codebase already uses for `timings`/`TurnTimestamps`. */
export type TurnComprehension = 'understood' | 'partial' | 'not_understood';

type RecordTurnVariables = {
  sessionId: string;
  speaker: 'learner' | 'persona';
  content: string;
  /** Only ever meaningful on a 'persona' turn — the live pipeline's own `comprehension` field describes whether *she* understood the learner's preceding turn. */
  comprehension?: TurnComprehension;
};
type RecordTurnResponse = { id: string };

/** `POST /sessions/:id/turns` (app-service, ticket #29 / docs/adr/0022) — the persistence link nothing on the mobile client called before now (that ADR's own disclosed gap). Real-time-only turn content becomes a durable row the Debrief screen's summary and the post-session analyser both read back from. */
export const useRecordTurn = createMutation<RecordTurnResponse, RecordTurnVariables, AxiosError>({
  mutationFn: ({ sessionId, ...body }) =>
    appServiceClient.post<RecordTurnResponse>(`sessions/${sessionId}/turns`, body).then(response => response.data),
});

type MarkTurnRevealedVariables = { turnId: string };

/** `PATCH /turns/:id/reveal` (app-service, ticket #29 AC #3) — the real "you understood her without help" signal. No body; a one-way flag, so this is only ever called when a translation is revealed, never to un-reveal. */
export const useMarkTurnRevealed = createMutation<void, MarkTurnRevealedVariables, AxiosError>({
  mutationFn: ({ turnId }) => appServiceClient.patch(`turns/${turnId}/reveal`).then(() => undefined),
});

type EndSessionVariables = { sessionId: string };

/**
 * `POST /sessions/:id/end` (app-service) — marks the session ended and
 * runs the post-session analyser against its real turns server-side
 * before responding, so the Debrief screen's subsequent `/debrief` and
 * `/summary` reads see finished data rather than a race against an
 * in-flight analysis. That's real API latency (a real LLM call), not a
 * quick "mark ended" — callers should await this (and show a pending
 * state) before navigating to Debrief, the same `mutate` → `onSuccess` →
 * `router.replace` pattern `use-open-screen.ts`'s `useOpenAnswerHandler`
 * already establishes for `useStartSession`.
 */
export const useEndSession = createMutation<void, EndSessionVariables, AxiosError>({
  mutationFn: ({ sessionId }) => appServiceClient.post(`sessions/${sessionId}/end`).then(() => undefined),
});
