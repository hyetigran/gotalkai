import type { AudioPlayer } from 'expo-audio';
import { createAudioPlayer } from 'expo-audio';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useLearnerId } from '@/lib/hooks/use-learner-id';
import { useBenchmarkTrend, useCurrentBenchmarkSet, useSubmitBenchmarkAttempt } from './api';
import { BenchmarkResult } from './components/benchmark-result';
import { BenchmarkTakingFlow } from './components/benchmark-taking-flow';
import { BenchmarkTrend } from './components/benchmark-trend';

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
  const [viewMode, setViewMode] = React.useState<'take' | 'history'>('take');
  const submitAttempt = useSubmitBenchmarkAttempt();
  // Not gated on `result`: a learner should be able to check their trend without retaking (see docs/adr/0018 — AC calls for a trend, not just a post-attempt receipt).
  const trend = useBenchmarkTrend({ variables: { learnerId: learnerId ?? '' }, enabled: Boolean(learnerId) });

  const playerRef = React.useRef<AudioPlayer | null>(null);
  const playClip = React.useCallback((audioUrl: string) => {
    // Only one clip should ever play at a time — release the previous player rather than
    // leaking one native player per tap (expo-audio has no GC hook for this; see
    // use-tts-playback.ts's own player.remove() precedent for the same reason).
    playerRef.current?.remove();
    const player = createAudioPlayer(audioUrl);
    playerRef.current = player;
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (!status.didJustFinish)
        return;
      subscription.remove();
      player.remove();
      if (playerRef.current === player)
        playerRef.current = null;
    });
    player.play();
  }, []);

  React.useEffect(() => () => playerRef.current?.remove(), []);

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
        <Pressable
          onPress={() => setViewMode(mode => (mode === 'take' ? 'history' : 'take'))}
          accessibilityRole="button"
          accessibilityLabel={viewMode === 'take' ? 'View history' : 'Back to benchmark'}
        >
          <Text className="text-[13px] text-accent">{viewMode === 'take' ? 'History' : 'Take'}</Text>
        </Pressable>
      </View>

      <ScrollView className="mt-[24px] flex-1" showsVerticalScrollIndicator={false}>
        {viewMode === 'history' && (
          <BenchmarkTrend entries={trend.data ?? []} isLoading={trend.isLoading} />
        )}

        {viewMode === 'take' && result === null && (
          <BenchmarkTakingFlow
            learnerId={learnerId}
            benchmarkSet={benchmarkSet}
            isSetLoading={isSetLoading}
            isSetError={isSetError}
            answers={answers}
            allAnswered={allAnswered}
            isSubmitPending={submitAttempt.isPending}
            isSubmitError={submitAttempt.isError}
            onPlayClip={playClip}
            onSelectChoice={selectAnswer}
            onSubmit={handleSubmit}
          />
        )}

        {viewMode === 'take' && result !== null && (
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
