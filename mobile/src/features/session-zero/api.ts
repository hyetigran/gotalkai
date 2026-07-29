import type { AxiosError } from 'axios';
import { createMutation } from 'react-query-kit';

import { appServiceClient } from '@/lib/app-service/client';

type CreateLearnerResponse = { id: string };
type CreateLearnerVariables = { cyrillicLiterate: boolean; translitEnabled: boolean };

/** `POST /learners` (app-service, ticket #30) — writes the onboarding answers and creates the real learner. */
export const useCreateLearner = createMutation<CreateLearnerResponse, CreateLearnerVariables, AxiosError>({
  mutationFn: variables =>
    appServiceClient.post<CreateLearnerResponse>('learners', variables).then(response => response.data),
});
