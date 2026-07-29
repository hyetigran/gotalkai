import { Text, View } from 'react-native';

import { Button } from '@/components/ui';
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
    <View className="flex-1 items-center justify-center bg-paper px-[28px]">
      <Text className="text-center font-serif text-[24px] leading-[32px] text-ink">
        Do you read Cyrillic?
      </Text>
      <Text className="mt-[10px] text-center text-[15px] leading-[22px] text-ink/60">
        We'll show a phonetic version of her lines instead of a translation if not — you can change this later.
      </Text>

      <View className="mt-[26px] w-full gap-[12px]">
        <Button label="Yes, I read Cyrillic" onPress={() => handleAnswer(true)} disabled={isPending} />
        <Button label="Not yet" onPress={() => handleAnswer(false)} disabled={isPending} variant="secondary" />
      </View>

      {isError && (
        <Text className="mt-[16px] text-center text-[13px] text-ink/55">
          Could not save your answer — check your connection and try again.
        </Text>
      )}
    </View>
  );
}
