import * as React from 'react';
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
 *
 * TEMPORARILY HIDDEN (revert by deleting the effect below and the
 * `triggered` ref): auto-submits `cyrillicLiterate: true` on mount
 * instead of waiting for a tap, so new learners skip straight to Open.
 * `handleAnswer` still calls the real `useCreateLearner` API and
 * persists a real `learnerId` — this only skips the visible question,
 * not the backend learner-creation this screen exists to do.
 */
export function SessionZeroScreen() {
  const { handleAnswer, isPending, isError } = useSessionZeroAnswerHandler();
  const triggered = React.useRef(false);

  React.useEffect(() => {
    if (triggered.current)
      return;
    triggered.current = true;
    handleAnswer(true);
  }, [handleAnswer]);

  return (
    <View className="flex-1 items-center justify-center bg-page px-[28px]">
      {isError && (
        <>
          <Text className="font-sans-semibold text-center text-[17px] text-ink">
            Could not start your session
          </Text>
          <Text className="mt-[10px] text-center text-[15px] leading-[22px] text-ink/60">
            Check your connection and try again.
          </Text>
          <Pressable
            onPress={() => handleAnswer(true)}
            disabled={isPending}
            accessibilityRole="button"
            accessibilityLabel="Retry"
            className="mt-[26px] items-center rounded-[16px] bg-accent px-[26px] py-[19px] disabled:opacity-50"
          >
            <Text className="font-sans-semibold text-[17px] text-page">Retry</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
