import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { TOMORROW_FIXTURE as fixture } from './tomorrow-fixture';

/**
 * The Tomorrow screen — fixture data only. Layout and copy per
 * `Initial mockup request/design_handoff_conversation_loop/README.md`
 * ("4. Tomorrow"). `bg-paper-stepped` is the one background change in the
 * product, marking "session over" — every other screen uses `bg-paper`.
 */
export function TomorrowScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-paper-stepped px-[22px] pt-[66px] pb-[44px]">
      <Text className="font-mono-medium text-[10px] tracking-[0.12em] text-ink/42 uppercase">
        {fixture.eyebrow}
      </Text>
      <Text className="mt-[16px] font-serif text-[27px] leading-[35px] text-ink">
        {fixture.title}
      </Text>
      <Text className="mt-[12px] text-[16px] leading-[24px] text-ink/60">
        {fixture.intro}
      </Text>

      <View className="mt-[28px] rounded-[18px] border border-ink/10 bg-white p-[19px]">
        <Text className="font-mono-medium mb-[14px] text-[10px] tracking-widest text-ink/42 uppercase">
          {fixture.ladderHeading}
        </Text>
        {fixture.ladder.map((label, index) => {
          const isCurrent = index === fixture.currentStepIndex;
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
        onPress={() => router.push('/open')}
        accessibilityRole="button"
        accessibilityLabel={fixture.close}
        className="mt-auto items-center rounded-[16px] border border-ink/22 py-[18px]"
      >
        <Text className="font-serif text-[17px] text-ink">{fixture.close}</Text>
      </Pressable>
    </View>
  );
}
