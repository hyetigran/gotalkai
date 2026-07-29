import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useSessionScenario } from './api';
import { TOMORROW_FIXTURE as fixture } from './tomorrow-fixture';

/**
 * The Tomorrow screen. Layout and copy per
 * `Initial mockup request/design_handoff_conversation_loop/README.md`
 * ("4. Tomorrow"). `bg-paper-stepped` is the one background change in the
 * product, marking "session over" — every other screen uses `bg-paper`.
 *
 * The scenario title/intro/ladder/currentStepIndex render real, selected
 * scenario data (PRD §5.3, ticket #21) when a `sessionId` route param is
 * present — falls back to fixture content only when there's no
 * `sessionId` at all, matching the pattern established (and
 * bug-fixed — see ticket #20's review) on the Debrief screen: never
 * silently substitutes fixture content for a loading, errored, or
 * genuinely-different real result. `content` is `null` whenever a real
 * session's data isn't ready yet (loading/errored) — every render below
 * that would otherwise show stale/wrong fixture text falls through to an
 * explicit loading/error message instead. `eyebrow`/`homework`/`close`
 * stay fixture-driven regardless — static copy, not scenario content.
 */
type TomorrowContent = { title: string; intro: string; ladder: string[]; currentStepIndex: number };

export function TomorrowScreen() {
  const router = useRouter();
  // Ticket #25: `learnerId` isn't used by this screen itself, only relayed back to Open so the
  // next lap of the loop still knows who the learner is instead of losing them at the seam.
  const { sessionId, learnerId } = useLocalSearchParams<{ sessionId?: string; learnerId?: string }>();
  const hasRealSession = Boolean(sessionId);
  const { data: scenario, isLoading, isError } = useSessionScenario({
    variables: { sessionId: sessionId ?? '' },
    enabled: hasRealSession,
  });

  const content: TomorrowContent | null = !hasRealSession
    ? { title: fixture.title, intro: fixture.intro, ladder: [...fixture.ladder], currentStepIndex: fixture.currentStepIndex }
    : (scenario && !isLoading && !isError
        ? { title: scenario.title, intro: scenario.intro, ladder: scenario.ladder.map(step => step.label), currentStepIndex: scenario.currentStepIndex }
        : null);

  return (
    <View className="flex-1 bg-paper-stepped px-[22px] pt-[66px] pb-[44px]">
      <Text className="font-mono-medium text-[10px] tracking-[0.12em] text-ink/42 uppercase">
        {fixture.eyebrow}
      </Text>
      <Text className="mt-[16px] font-serif text-[27px] leading-[35px] text-ink">
        {content ? content.title : (isLoading ? 'Loading…' : 'Couldn\'t load tomorrow\'s scenario')}
      </Text>
      <Text className="mt-[12px] text-[16px] leading-[24px] text-ink/60">
        {content?.intro ?? ''}
      </Text>

      <View className="mt-[28px] rounded-[18px] border border-ink/10 bg-white p-[19px]">
        <Text className="font-mono-medium mb-[14px] text-[10px] tracking-widest text-ink/42 uppercase">
          {fixture.ladderHeading}
        </Text>
        {!content && isLoading && (
          <Text className="text-[13px] text-ink/55">Loading tomorrow's scenario…</Text>
        )}
        {!content && isError && (
          <Text className="text-[13px] text-ink/55">Couldn't load tomorrow's scenario — check your connection and try again.</Text>
        )}
        {content?.ladder.map((label, index) => {
          const isCurrent = index === content.currentStepIndex;
          return (
            <View key={label} className="flex-row items-center gap-[12px] py-[9px]">
              <View
                className={
                  isCurrent
                    ? 'size-[11px] rounded-full bg-accent'
                    : 'size-[8px] rounded-full border-[1.5px] border-ink/28'
                }
              />
              <Text className={`font-serif text-[16px] leading-[22px] ${isCurrent ? 'text-ink' : 'text-ink/42'}`}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      <Text className="mt-[20px] font-mono text-[12px] leading-[19px] text-ink/50">
        {fixture.homework}
        {'\n'}
        {fixture.homeworkSub}
      </Text>

      <Pressable
        onPress={() => router.replace(learnerId ? { pathname: '/open', params: { learnerId } } : '/open')}
        accessibilityRole="button"
        accessibilityLabel={fixture.close}
        className="mt-auto items-center rounded-[16px] border border-ink/22 py-[18px]"
      >
        <Text className="font-serif text-[17px] text-ink">{fixture.close}</Text>
      </Pressable>
    </View>
  );
}
