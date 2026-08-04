import { Pressable, Text, View } from 'react-native';

import { useSessionZeroAnswerHandler } from './use-session-zero-screen';

/**
 * The real onboarding screen (ticket #30) — distinct from the unrelated,
 * unused Obytes-scaffold `onboarding-screen.tsx`/`use-is-first-time`,
 * left untouched (see PR notes: this product's real entry point never
 * routed through that scaffold). Asks the Cyrillic-literacy question
 * exactly once (AC #1) and never again — `useLearnerId` persisting a
 * real learner id (in `use-session-zero-screen.ts`) is what makes
 * `index.tsx` skip straight to Open on every later app open.
 *
 * Deliberately not framed as an assessment or a "placement test" (PRD
 * risk #6, AC #4) — no score, no "let's see your level" copy, just the
 * one practical accommodation question. Session zero's actual placement
 * function is structural, not a screen: the first real session simply
 * starts at complication level 0 with no prior signal
 * (scenario-selector.ts's `computeNextComplicationLevel`, ticket #21) —
 * there is nothing here to add for that half of the AC, only something
 * to confirm doesn't exist.
 */
export function SessionZeroScreen() {
  const { handleAnswer, isPending, isError } = useSessionZeroAnswerHandler();

  return (
    <View className="flex-1 items-center justify-center bg-page px-[28px]">
      <Text className="font-sans-semibold text-center text-[24px] leading-[30px] tracking-[-0.24px] text-ink">
        Do you read Cyrillic?
      </Text>
      <Text className="mt-[10px] text-center text-[15px] leading-[22px] text-ink/60">
        We'll show a phonetic version of her lines instead of a translation if not — you can change this later.
      </Text>

      <View className="mt-[26px] w-full gap-[12px]">
        <Pressable
          onPress={() => handleAnswer(true)}
          disabled={isPending}
          accessibilityRole="button"
          accessibilityLabel="Yes, I read Cyrillic"
          className="items-center rounded-[16px] bg-accent py-[19px] disabled:opacity-50"
        >
          <Text className="font-sans-semibold text-[17px] text-page">Yes, I read Cyrillic</Text>
        </Pressable>
        <Pressable
          onPress={() => handleAnswer(false)}
          disabled={isPending}
          accessibilityRole="button"
          accessibilityLabel="Not yet"
          className="items-center rounded-[16px] border border-ink/22 py-[19px] disabled:opacity-50"
        >
          <Text className="font-sans-semibold text-[17px] text-ink">Not yet</Text>
        </Pressable>
      </View>

      {isError && (
        <Text className="mt-[16px] text-center text-[13px] text-ink/55">
          Could not save your answer — check your connection and try again.
        </Text>
      )}
    </View>
  );
}
