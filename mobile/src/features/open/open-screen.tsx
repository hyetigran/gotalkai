import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors, shadows } from '@/components/ui/design-tokens';
import { PortraitHatch } from '@/components/ui/portrait-hatch';
import { useIsFirstSession } from '@/lib/hooks/use-is-first-session';
import { useCallbackLine } from './api';
import { SCRIPTED_OPEN_DATA as openData } from './scripted-open-data';

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
 * loading, errored, or genuinely-different real result. Everything else
 * on this screen stays scripted — out of this ticket's scope.
 */
export function OpenScreen() {
  const router = useRouter();
  const { learnerId } = useLocalSearchParams<{ learnerId?: string }>();
  const hasRealLearner = Boolean(learnerId);
  const { data: realCallbackLine, isLoading, isError } = useCallbackLine({
    variables: { learnerId: learnerId ?? '' },
    enabled: hasRealLearner,
  });
  // Four distinct states, not collapsed into one fallback: no real
  // learner (scripted copy), still loading, errored, or a successful
  // real response that's genuinely empty (a learner with zero memories —
  // shouldn't happen once seeding runs, but is a real, non-alarming
  // server response, not a network failure) versus one with content.
  const callbackLineStatusText = !hasRealLearner
    ? null
    : (isLoading
        ? 'Loading…'
        : (isError
            ? 'Could not load her line — check your connection and try again.'
            : (realCallbackLine ? null : 'No memories yet.')));
  const callbackLine = !hasRealLearner ? openData.callbackLine : (realCallbackLine ?? null);
  const [isFirstSession, setIsFirstSession] = useIsFirstSession();

  const handleAnswer = React.useCallback(() => {
    if (isFirstSession)
      setIsFirstSession(false);
    // The loop's forward steps replace rather than push, so a repeating
    // daily loop doesn't grow the navigation stack without bound.
    router.replace('/converse');
  }, [isFirstSession, setIsFirstSession, router]);

  return (
    <View className="flex-1 bg-paper px-[22px] pt-[66px] pb-[44px]">
      <View className="flex-row items-baseline justify-between gap-[12px]">
        <Text className="font-mono-medium text-[10px] tracking-[0.12em] text-ink/42 uppercase">
          {openData.openDay}
        </Text>
        <View className="flex-row items-baseline gap-[14px]">
          <Pressable onPress={() => router.push('/address-book')} accessibilityRole="button" accessibilityLabel={openData.whoElse}>
            <Text className="text-[13px] text-accent">{openData.whoElse}</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel={openData.settingsLink}>
            <Text className="text-[13px] text-ink/42">{openData.settingsLink}</Text>
          </Pressable>
        </View>
      </View>

      {/* Shadow on this outer wrapper, clipping on the inner one — RN/iOS
          clips shadows when overflow:hidden and a shadow share one view. */}
      <View className="mt-[26px] rounded-[20px]" style={shadows.card}>
        <View className="overflow-hidden rounded-[20px] border border-ink/10 bg-white">
          <View className="h-[196px] items-center justify-end pb-[14px]">
            <View className="absolute inset-0">
              <PortraitHatch
                stop1={colors.portraitHatch.stop1}
                stop2={colors.portraitHatch.stop2}
                stripeWidth={7}
              />
            </View>
            <Text className="rounded-[4px] bg-paper/90 px-[8px] py-[5px] font-mono text-[10px] text-ink/50">
              portrait — Rive character, v2
            </Text>
          </View>
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
        <Pressable
          onPress={handleAnswer}
          accessibilityRole="button"
          accessibilityLabel={openData.answer}
          className="items-center rounded-[16px] bg-accent py-[19px]"
        >
          <Text className="font-serif text-[18px] text-paper">{openData.answer}</Text>
        </Pressable>
      </View>
    </View>
  );
}
