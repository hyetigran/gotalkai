import { useRouter } from 'expo-router';
import * as React from 'react';

import { realParamsOrBarePath } from '@/lib/navigation/loop-nav-params';
import { useCallbackLine, useStartSession } from './api';
import { SCRIPTED_OPEN_DATA as openData } from './scripted-open-data';

/**
 * Callback-line state (PRD risk #2, ticket #22). Four distinct states,
 * not collapsed into one fallback: no real learner (scripted copy),
 * still loading, errored, or a successful real response that's
 * genuinely empty (a learner with zero memories — shouldn't happen once
 * seeding runs, but is a real, non-alarming server response, not a
 * network failure) versus one with content.
 */
export function useOpenCallbackLine(learnerId: string | undefined) {
  const hasRealLearner = Boolean(learnerId);
  const { data: realCallbackLine, isLoading, isError } = useCallbackLine({
    variables: { learnerId: learnerId ?? '' },
    enabled: hasRealLearner,
  });
  const callbackLineStatusText = !hasRealLearner
    ? null
    : (isLoading
        ? 'Loading…'
        : (isError
            ? 'Could not load her line — check your connection and try again.'
            : (realCallbackLine ? null : 'No memories yet.')));
  const callbackLine = !hasRealLearner ? openData.callbackLine : (realCallbackLine ?? null);
  return { callbackLine, callbackLineStatusText };
}

/**
 * Daily session cap (ticket #24; PRD §9). Only real (`hasRealLearner`)
 * flows call the server at all — without a real learner there's no
 * server-side state to cap. On a real 429/`daily_cap_reached`, this
 * routes to Tomorrow instead of Converse: its existing copy ("No
 * homework. Come back tomorrow. One session a day. Distributed practice
 * beats massed practice.") already matches the "come back tomorrow,"
 * not-a-paywall framing the ticket's AC asks for — reusing it here
 * avoids inventing a second copy of the same message.
 */
export function useOpenAnswerHandler(options: {
  learnerId: string | undefined;
  isFirstSession: boolean;
  setIsFirstSession: (value: boolean) => void;
}) {
  const { learnerId, isFirstSession, setIsFirstSession } = options;
  const hasRealLearner = Boolean(learnerId);
  const router = useRouter();
  const startSession = useStartSession();

  const handleAnswer = React.useCallback(() => {
    if (isFirstSession)
      setIsFirstSession(false);
    if (!hasRealLearner) {
      router.replace('/converse');
      return;
    }
    startSession.mutate(
      { learnerId: learnerId ?? '' },
      {
        onSuccess: (data) => {
          // learnerId, not just sessionId — Converse needs it to know
          // whether this learner has transliteration enabled (ticket
          // #30 AC #3). Forgetting it here would silently fall back to
          // showing translation for every real learner, regardless of
          // their actual onboarding answer.
          //
          // voiceServiceToken (docs/adr/0023): forwarded the same way —
          // Converse needs it to open the live voice-service connection.
          // Without it, Converse falls back to the scripted demo (see
          // its own "real when present" branch), same as it already does
          // for a missing learnerId/sessionId.
          router.replace({ pathname: '/converse', params: { sessionId: data.id, learnerId, voiceServiceToken: data.voiceServiceToken } });
        },
        onError: (error) => {
          if (error.response?.status === 429 && error.response.data.code === 'daily_cap_reached') {
            // No sessionId (the cap rejected before one was ever created) — Tomorrow falls back
            // to its own fixture scenario content here, which is correct: there's no real
            // session to show. learnerId still forwards, so the loop doesn't lose the learner
            // on the "come back tomorrow" path (ticket #25).
            router.replace(realParamsOrBarePath('/tomorrow', { learnerId }));
          }
          // Any other error leaves the learner on Open; isUnexpectedError below renders it.
        },
      },
    );
  }, [isFirstSession, setIsFirstSession, router, hasRealLearner, learnerId, startSession]);

  const isUnexpectedError = startSession.isError
    && !(startSession.error.response?.status === 429 && startSession.error.response.data.code === 'daily_cap_reached');

  return { handleAnswer, isPending: startSession.isPending, isUnexpectedError };
}
