import type { AxiosError } from 'axios';
import { createMutation, createQuery } from 'react-query-kit';

import { appServiceClient } from '@/lib/app-service/client';

/** Ticket #35 (PRD §6.3) — see docs/adr/0018 for the design behind this shape. */
export type BenchmarkItem = {
  id: string;
  order: number;
  audioUrl: string;
  question: string;
  choices: string[];
};

export type BenchmarkSet = {
  id: string;
  monthKey: string;
  title: string;
  items: BenchmarkItem[];
};

type CurrentBenchmarkSetResponse = { benchmarkSet: BenchmarkSet };

/** `GET /benchmark-sets/current` (app-service) — no variables: the current set doesn't depend on which learner is asking. */
export const useCurrentBenchmarkSet = createQuery<BenchmarkSet, void, AxiosError>({
  queryKey: ['current-benchmark-set'],
  fetcher: () =>
    appServiceClient.get<CurrentBenchmarkSetResponse>('benchmark-sets/current').then(response => response.data.benchmarkSet),
});

export type BenchmarkAttemptResult = {
  id: string;
  correctCount: number;
  totalCount: number;
  completedAt: string;
};

type SubmitBenchmarkAttemptResponse = { result: BenchmarkAttemptResult };
type SubmitBenchmarkAttemptVariables = {
  learnerId: string;
  benchmarkSetId: string;
  answers: { itemId: string; selectedChoiceIndex: number }[];
};

/** `POST /learners/:id/benchmark-attempts` (app-service) — scored server-side; the response is the real result, not an echo of what was submitted. */
export const useSubmitBenchmarkAttempt = createMutation<BenchmarkAttemptResult, SubmitBenchmarkAttemptVariables, AxiosError>({
  mutationFn: ({ learnerId, ...body }) =>
    appServiceClient
      .post<SubmitBenchmarkAttemptResponse>(`learners/${learnerId}/benchmark-attempts`, body)
      .then(response => response.data.result),
});

export type BenchmarkTrendEntry = {
  attemptId: string;
  monthKey: string;
  correctCount: number;
  totalCount: number;
  completedAt: string;
};

type BenchmarkTrendResponse = { trend: BenchmarkTrendEntry[] };
type BenchmarkTrendVariables = { learnerId: string };

/** `GET /learners/:id/benchmark-attempts` (app-service) — chronological, oldest first (docs/adr/0018: "numbers, not a chart"). */
export const useBenchmarkTrend = createQuery<BenchmarkTrendEntry[], BenchmarkTrendVariables, AxiosError>({
  queryKey: ['benchmark-trend'],
  fetcher: variables =>
    appServiceClient.get<BenchmarkTrendResponse>(`learners/${variables.learnerId}/benchmark-attempts`).then(response => response.data.trend),
});
