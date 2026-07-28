import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DEBRIEF_FIXTURE as fixture } from './debrief-fixture';

/**
 * The Debrief screen — fixture data only (no live session assembly yet).
 * Layout and copy per
 * `Initial mockup request/design_handoff_conversation_loop/README.md`
 * ("3. Debrief"). Reachable at the temporary route `/debrief`, ahead of
 * ticket #8's real navigation wiring.
 *
 * Deliberately absent, per the ticket and PRD §6.3: any streak counter,
 * accuracy percentage, grade, or badge. Progress is expressed only through
 * the two ability figures and the ranked patterns below.
 */
export function DebriefScreen() {
  const router = useRouter();
  const understoodWithoutHelp = fixture.totalTurns - fixture.revealedTurnCount;

  return (
    <ScrollView className="flex-1 bg-paper px-[22px] pt-[66px]" contentContainerClassName="pb-[44px]">
      <Text className="font-mono-medium text-[10px] tracking-[0.12em] text-ink/42 uppercase">
        After the conversation
      </Text>
      <Text className="mt-[16px] font-serif text-[27px] leading-[35px] text-ink">
        {'She understood you '}
        <Text className="text-accent">{`${fixture.understoodCount} times of ${fixture.totalTurns}`}</Text>
        .
      </Text>
      <Text className="mt-[10px] font-serif text-[19px] leading-[26px] text-ink/62">
        {`You understood her without help ${understoodWithoutHelp} of ${fixture.totalTurns}.`}
      </Text>
      <Text className="mt-[12px] font-mono text-[12px] leading-[18px] text-ink/50">
        {fixture.sessionMeta}
      </Text>

      <View className="mt-[26px] gap-[10px]">
        {fixture.patterns.map(pattern => (
          <View key={pattern.index} className="rounded-[16px] border border-ink/10 bg-white px-[17px] py-[16px]">
            <View className="flex-row items-baseline gap-[10px]">
              <Text className="font-mono-medium text-[10px] text-ink/40">{pattern.index}</Text>
              <View className="flex-1">
                <Text className="font-serif text-[17px] leading-[24px] text-ink">{pattern.title}</Text>
                <Text className="mt-[7px] text-[13px] leading-[19px] text-ink/55">{pattern.body}</Text>
                {pattern.tag && (
                  <Text className="font-mono-medium mt-[9px] text-[10px] text-accent">{pattern.tag}</Text>
                )}
              </View>
            </View>
          </View>
        ))}
      </View>

      <View className="mt-[20px] rounded-[16px] border border-dashed border-accent/45 bg-accent/5 p-[17px]">
        <Text className="font-mono-medium text-[10px] tracking-widest text-accent uppercase">
          {fixture.avoidance.heading}
        </Text>
        <Text className="mt-[9px] font-serif text-[16px] leading-[23px] text-ink">
          {fixture.avoidance.body}
        </Text>
      </View>

      <Pressable
        onPress={() => router.push('/tomorrow')}
        accessibilityRole="button"
        accessibilityLabel="Tomorrow"
        className="mt-[26px] items-center rounded-[16px] bg-accent py-[19px]"
      >
        <Text className="font-serif text-[18px] text-paper">Tomorrow</Text>
      </Pressable>
    </ScrollView>
  );
}
