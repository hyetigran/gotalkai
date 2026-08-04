import type { BenchmarkSet } from '../api';
import { Pressable, Text, View } from 'react-native';

import { BenchmarkItemCard } from './benchmark-item-card';

type BenchmarkTakingFlowProps = {
  learnerId: string | undefined;
  benchmarkSet: BenchmarkSet | undefined;
  isSetLoading: boolean;
  isSetError: boolean;
  answers: Record<string, number>;
  allAnswered: boolean;
  isSubmitPending: boolean;
  isSubmitError: boolean;
  onPlayClip: (audioUrl: string) => void;
  onSelectChoice: (itemId: string, choiceIndex: number) => void;
  onSubmit: () => void;
};

/** The clip-listen-and-answer flow, up to submission — extracted from benchmark-screen.tsx to keep the screen component under the line-count limit. */
export function BenchmarkTakingFlow({
  learnerId,
  benchmarkSet,
  isSetLoading,
  isSetError,
  answers,
  allAnswered,
  isSubmitPending,
  isSubmitError,
  onPlayClip,
  onSelectChoice,
  onSubmit,
}: BenchmarkTakingFlowProps) {
  if (!learnerId)
    return <Text className="text-[14px] text-ink/55">No learner set up yet.</Text>;
  if (isSetLoading)
    return <Text className="text-[14px] text-ink/55">Loading this month's benchmark…</Text>;
  if (isSetError)
    return <Text className="text-[14px] text-ink/55">Couldn't load the benchmark — check your connection and try again.</Text>;
  if (!benchmarkSet)
    return <Text className="text-[14px] text-ink/55">No benchmark content available yet.</Text>;

  return (
    <View>
      <Text className="font-mono-medium mb-[4px] text-[10px] tracking-widest text-ink/40 uppercase">
        {benchmarkSet.title}
      </Text>
      <Text className="mb-[16px] text-[13px] leading-[20px] text-ink/55">
        Listen to each clip, then answer what you understood.
      </Text>
      {benchmarkSet.items.map(item => (
        <BenchmarkItemCard
          key={item.id}
          item={item}
          selectedChoiceIndex={answers[item.id]}
          onPlayClip={onPlayClip}
          onSelectChoice={onSelectChoice}
        />
      ))}

      <Pressable
        onPress={onSubmit}
        disabled={!allAnswered || isSubmitPending}
        accessibilityRole="button"
        accessibilityLabel="Submit"
        className={`items-center rounded-[16px] py-[18px] ${allAnswered ? 'bg-accent' : 'border border-ink/22'}`}
      >
        <Text className={`font-sans-semibold text-[17px] ${allAnswered ? 'text-page' : 'text-ink/40'}`}>
          {isSubmitPending ? 'Submitting…' : 'Submit'}
        </Text>
      </Pressable>
      {isSubmitError && (
        <Text className="mt-[10px] text-[13px] text-ink/55">Couldn't submit — check your connection and try again.</Text>
      )}
    </View>
  );
}
