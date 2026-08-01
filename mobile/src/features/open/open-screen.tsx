import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, shadows } from '@/components/ui/design-tokens';
import { PortraitHatch } from '@/components/ui/portrait-hatch';
import { useIsFirstSession } from '@/lib/hooks/use-is-first-session';
import { PersonaPortrait3D } from '../converse/components/persona-portrait-3d';
import { SCRIPTED_OPEN_DATA as openData } from './scripted-open-data';
import { useOpenAnswerHandler, useOpenCallbackLine } from './use-open-screen';

/**
 * The Open screen. Layout and copy per
 * `Initial mockup request/design_handoff_conversation_loop/README.md`
 * ("1. Open"). The app's real entry point (`src/app/index.tsx` redirects
 * here) and the head of the daily loop (ticket #9).
 *
 * `callbackLine` renders a real, rotating `persona_memories` entry (PRD
 * risk #2, ticket #22) when a `learnerId` route param is present —
 * falls back to scripted copy only when there's no `learnerId` at all,
 * matching the pattern established on the Debrief/Tomorrow screens
 * (tickets #20/#21): never silently substitutes scripted text for a
 * loading, errored, or genuinely-different real result.
 *
 * The "Answer" button enforces the real daily session cap (ticket #24)
 * when a real learner is present — see `use-open-screen.ts`.
 */
export function OpenScreen() {
  const router = useRouter();
  const { learnerId } = useLocalSearchParams<{ learnerId?: string }>();
  const { callbackLine, callbackLineStatusText } = useOpenCallbackLine(learnerId);
  const [isFirstSession, setIsFirstSession] = useIsFirstSession();
  const { handleAnswer, isPending, isUnexpectedError } = useOpenAnswerHandler({ learnerId, isFirstSession, setIsFirstSession });

  return (
    <View className="flex-1 bg-paper px-[22px] pt-[66px] pb-[44px]">
      {/* UAT: tabs restructuring — "who else" used to push to Address book from here; now that it's the Home tab (src/app/(tabs)/_layout.tsx), the tab bar already provides that navigation, so the in-header link was just a redundant second path to the same place. */}
      <View className="flex-row items-baseline justify-between gap-[12px]">
        <Text className="font-mono-medium text-[10px] tracking-[0.12em] text-ink/42 uppercase">
          {openData.openDay}
        </Text>
        <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel={openData.settingsLink}>
          <Text className="text-[13px] text-ink/42">{openData.settingsLink}</Text>
        </Pressable>
      </View>

      {/* Shadow on this outer wrapper, clipping on the inner one — RN/iOS
          clips shadows when overflow:hidden and a shadow share one view. */}
      <View className="mt-[26px] rounded-[20px]" style={shadows.card}>
        <View className="overflow-hidden rounded-[20px] border border-ink/10 bg-white">
          <PersonaPortrait3D
            background={(
              <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
                <PortraitHatch
                  stop1={colors.portraitHatch.stop1}
                  stop2={colors.portraitHatch.stop2}
                  stripeWidth={7}
                />
              </View>
            )}
          />
          <View className="px-[20px] pt-[20px] pb-[22px]">
            <Text className="font-serif text-[21px] text-ink">{openData.personaName}</Text>
            <Text className="mt-[6px] font-mono text-[12px] text-ink/50">{openData.personaMeta}</Text>
            <View className="mt-[18px] border-t border-ink/9 pt-[18px]">
              <Text className="font-serif text-[19px] leading-[27px] text-ink">
                {callbackLine ?? callbackLineStatusText}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View className="mt-auto pt-[26px]">
        <Text className="mb-[10px] font-mono text-[12px] leading-[18px] text-ink/50">
          {openData.scenarioLine}
        </Text>
        {isFirstSession && (
          <Text className="mb-[16px] font-serif text-[15px] leading-[22px] text-ink/62">
            {openData.openMicLine}
          </Text>
        )}
        {isUnexpectedError && (
          <Text className="mb-[16px] font-serif text-[15px] leading-[22px] text-ink/62">
            Could not start a session — check your connection and try again.
          </Text>
        )}
        <Pressable
          onPress={handleAnswer}
          accessibilityRole="button"
          accessibilityLabel={openData.answer}
          disabled={isPending}
          className="items-center rounded-[16px] bg-accent py-[19px] disabled:opacity-50"
        >
          <Text className="font-serif text-[18px] text-paper">{openData.answer}</Text>
        </Pressable>
      </View>
    </View>
  );
}
