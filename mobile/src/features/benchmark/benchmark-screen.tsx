import { createAudioPlayer } from 'expo-audio';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useLearnerId } from '@/lib/hooks/use-learner-id';
import { useBenchmarkTrend, useCurrentBenchmarkSet, useSubmitBenchmarkAttempt } from './api';
import { BenchmarkItemCard } from './components/benchmark-item-card';
import { BenchmarkResult } from './components/benchmark-result';

/**
 * The monthly comprehension benchmark screen (ticket #35, PRD §6.3) — no
 * mockup exists for this ("not designed yet" per the ticket), so layout
 * follows the design tokens/visual language established elsewhere
 * (`bg-paper-stepped` for "outside the daily loop", matching
 * Settings/Tomorrow) rather than a specific handoff. See docs/adr/0018
 * for the design reasoning (multiple-choice scoring, no chart, why the
 * seeded content is a disclosed placeholder rather than real "authentic"
 * audio).
 *
 * Reachable from Settings, not part of the Open→Converse→Debrief→Tomorrow
 * route chain — `router.back()` returns to wherever it was opened from.
 */
export function BenchmarkScreen() {
  const router = useRouter();
  const [learnerId] = useLearnerId();
  const { data: benchmarkSet, isLoading: isSetLoading, isError: isSetError } = useCurrentBenchmarkSet();
  const [answers, setAnswers] = React.useState<Record<string, number>>({});
  const [result, setResult] = React.useState<{ correctCount: number; totalCount: number } | null>(null);
  const submitAttempt = useSubmitBenchmarkAttempt();
  const trend = useBenchmarkTrend({ variables: { learnerId: learnerId ?? '' }, enabled: Boolean(learnerId) && result !== null });

  const playClip = React.useCallback((audioUrl: string) => {
    createAudioPlayer(audioUrl).play();
  }, []);

  const selectAnswer = React.useCallback((itemId: string, choiceIndex: number) => {
    setAnswers(prev => ({ ...prev, [itemId]: choiceIndex }));
  }, []);

  const allAnswered = benchmarkSet ? benchmarkSet.items.every(item => answers[item.id] !== undefined) : false;

  const handleSubmit = React.useCallback(() => {
    if (!benchmarkSet || !learnerId || !allAnswered)
      return;
    submitAttempt.mutate(
      {
        learnerId,
        benchmarkSetId: benchmarkSet.id,
        answers: benchmarkSet.items.map(item => ({ itemId: item.id, selectedChoiceIndex: answers[item.id] as number })),
      },
      { onSuccess: data => setResult({ correctCount: data.correctCount, totalCount: data.totalCount }) },
    );
  }, [benchmarkSet, learnerId, allAnswered, answers, submitAttempt]);

  return (
    <View className="flex-1 bg-paper-stepped px-[22px] pt-[60px] pb-[44px]">
      <View className="flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="back">
          <Text className="text-[15px] text-accent">‹</Text>
        </Pressable>
        <Text className="font-serif text-[13px] text-ink/60">Monthly benchmark</Text>
        <View className="w-[12px]" />
      </View>

      <ScrollView className="mt-[24px] flex-1" showsVerticalScrollIndicator={false}>
        {!learnerId && <Text className="text-[14px] text-ink/55">No learner set up yet.</Text>}
        {learnerId && isSetLoading && <Text className="text-[14px] text-ink/55">Loading this month's benchmark…</Text>}
        {learnerId && isSetError && (
          <Text className="text-[14px] text-ink/55">Couldn't load the benchmark — check your connection and try again.</Text>
        )}
        {learnerId && !isSetLoading && !isSetError && !benchmarkSet && (
          <Text className="text-[14px] text-ink/55">No benchmark content available yet.</Text>
        )}

        {learnerId && benchmarkSet && result === null && (
          <View>
            <Text className="mb-[16px] text-[13px] leading-[20px] text-ink/55">
              Listen to each clip, then answer what you understood.
            </Text>
            {benchmarkSet.items.map(item => (
              <BenchmarkItemCard
                key={item.id}
                item={item}
                selectedChoiceIndex={answers[item.id]}
                onPlayClip={playClip}
                onSelectChoice={selectAnswer}
              />
            ))}

            <Pressable
              onPress={handleSubmit}
              disabled={!allAnswered || submitAttempt.isPending}
              accessibilityRole="button"
              accessibilityLabel="Submit"
              className={`items-center rounded-[16px] py-[18px] ${allAnswered ? 'bg-accent' : 'border border-ink/22'}`}
            >
              <Text className={`font-serif text-[17px] ${allAnswered ? 'text-paper' : 'text-ink/40'}`}>
                {submitAttempt.isPending ? 'Submitting…' : 'Submit'}
              </Text>
            </Pressable>
            {submitAttempt.isError && (
              <Text className="mt-[10px] text-[13px] text-ink/55">Couldn't submit — check your connection and try again.</Text>
            )}
          </View>
        )}

        {result !== null && (
          <BenchmarkResult
            correctCount={result.correctCount}
            totalCount={result.totalCount}
            trendEntries={trend.data ?? []}
            isTrendLoading={trend.isLoading}
          />
        )}
      </ScrollView>
    </View>
  );
}
