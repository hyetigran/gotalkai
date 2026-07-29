import type { AxiosError } from 'axios';
import { createQuery } from 'react-query-kit';

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
