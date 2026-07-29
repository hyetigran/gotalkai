import { useRouter } from 'expo-router';
import * as React from 'react';

import { useLearnerId } from '@/lib/hooks/use-learner-id';
import { useCreateLearner } from './api';

/**
 * Orchestration for the literacy-question flow (ticket #30), split from
 * the screen component matching the `open`/`use-open-screen.ts`
 * precedent (ticket #24) — a `react-query-kit` mutation hook (`api.ts`)
 * plus a screen-level hook wiring it to navigation, rather than an
 * inline `try/catch` in the component.
 *
 * `translitEnabled`'s initial value is derived from the literacy answer
 * (not literate → on; literate → off) — see
 * docs/adr/0008-translit-enabled-derived-from-literacy-answer.md.
 */
export function useSessionZeroAnswerHandler() {
  const router = useRouter();
  const [, setLearnerId] = useLearnerId();
  const createLearner = useCreateLearner();

  const handleAnswer = React.useCallback((cyrillicLiterate: boolean) => {
    createLearner.mutate(
      { cyrillicLiterate, translitEnabled: !cyrillicLiterate },
      {
        onSuccess: (data) => {
          setLearnerId(data.id);
          router.replace({ pathname: '/open', params: { learnerId: data.id } });
        },
      },
    );
  }, [router, setLearnerId, createLearner]);

  return { handleAnswer, isPending: createLearner.isPending, isError: createLearner.isError };
}
