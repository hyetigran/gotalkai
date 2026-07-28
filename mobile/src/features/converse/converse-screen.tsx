import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, Text, View } from 'react-native';

import { HoldToThinkButton } from './components/hold-to-think-button';
import { LevelMeter } from './components/level-meter';
import { SuggestionChips } from './components/suggestion-chips';
import { Transcript } from './components/transcript';
import { useConverseSession } from './use-converse-session';

function useElapsedClock() {
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);

  React.useEffect(() => {
    const intervalId = setInterval(() => setElapsedSeconds(prev => prev + 1), 1000);
    return () => clearInterval(intervalId);
  }, []);

  const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
  const seconds = (elapsedSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/**
 * The Converse screen — scripted demo, no live pipeline yet (ticket #3).
 * Layout, states, and copy per
 * `Initial mockup request/design_handoff_conversation_loop/README.md`
 * ("2. Converse").
 */
export function ConverseScreen() {
  const router = useRouter();
  const clock = useElapsedClock();
  const {
    phase,
    turns,
    holding,
    holdSeen,
    revealed,
    chipsVisible,
    speak,
    holdOn,
    holdOff,
    toggleReveal,
  } = useConverseSession();

  return (
    <View className="flex-1 bg-paper">
      <View className="flex-row items-center justify-between px-[22px] pt-[60px] pb-[12px]">
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="back">
          <Text className="text-[15px] text-accent">‹</Text>
        </Pressable>
        <Text className="font-serif text-[13px] text-ink/60">Валентина Сергеевна</Text>
        <Text className="font-mono-medium text-[10px] text-ink/40">{clock}</Text>
      </View>

      <Transcript
        turns={turns}
        thinking={phase === 'thinking'}
        revealed={revealed}
        onToggleReveal={toggleReveal}
      />

      <View className="px-[22px] pt-[14px] pb-[40px]">
        <Text className="font-mono-medium mb-[11px] text-center text-[11px] tracking-[0.05em] text-ink/55">
          Tap her line for a translation
        </Text>

        {chipsVisible && <SuggestionChips onPress={speak} />}

        <LevelMeter phase={phase} holding={holding} />

        <View className="mt-[14px] min-h-[56px] flex-row items-center justify-between gap-[12px]">
          <View className="w-[62px]" />
          {holdSeen && (
            <HoldToThinkButton holding={holding} onHoldOn={holdOn} onHoldOff={holdOff} />
          )}
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="end">
            <Text className="w-[62px] text-right text-[13px] text-ink/50">End</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
