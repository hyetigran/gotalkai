import type { ScriptedTurn } from '../scripted-demo-script';
import * as React from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';

import { motion } from '@/components/ui/design-tokens';

type HerTurnProps = {
  ru: string;
  en?: string;
  translit?: string;
  /** Whether the shared reveal slot shows `translit` instead of `en` (ticket #30 AC #3) — never both. */
  translitEnabled: boolean;
  revealed: boolean;
  onToggleReveal: () => void;
};

/**
 * README: underline-dotted is the tap-to-reveal affordance; RN's Text
 * style API exposes `textDecorationStyle: 'dotted'` but has no equivalent
 * for the mockup's `text-decoration-thickness`/`text-underline-offset` —
 * those two are a platform-level substitution, not a missed spec value.
 */
export function HerTurn({ ru, en, translit, translitEnabled, revealed, onToggleReveal }: HerTurnProps) {
  const revealContent = translitEnabled ? translit : en;
  return (
    <Pressable onPress={onToggleReveal} accessibilityRole="button" accessibilityLabel="toggle translation">
      <Text
        className="font-serif text-[20px] leading-[30px] text-ink"
        style={{
          textDecorationLine: 'underline',
          textDecorationStyle: 'dotted',
          textDecorationColor: 'rgba(160,84,58,0.4)',
        }}
      >
        {ru}
      </Text>
      {revealed && revealContent && (
        <Text className="mt-[8px] text-[14px] leading-[21px] text-ink/60">{revealContent}</Text>
      )}
    </Pressable>
  );
}

export function LearnerTurn({ ru }: { ru: string }) {
  return (
    <View className="flex-row justify-end">
      <Text className="max-w-[78%] text-right font-serif text-[16px] leading-[23px] text-ink/52">
        {ru}
      </Text>
    </View>
  );
}

/** The «ну…» thinking filler — visible only while her reply is generating. */
export function ThinkingFiller() {
  const opacity = React.useRef(new Animated.Value(0.25)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: motion.fillerBlinkMs / 2, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.25, duration: motion.fillerBlinkMs / 2, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.Text className="font-serif text-[20px] leading-[30px] text-ink/35" style={{ opacity }}>
      ну…
    </Animated.Text>
  );
}

type TranscriptProps = {
  turns: ScriptedTurn[];
  /** Her reply is generating — filler visible, her line not revealed yet. */
  thinking: boolean;
  revealed: Record<number, boolean>;
  onToggleReveal: (turnIndex: number) => void;
  translitEnabled: boolean;
};

/**
 * Turns are always `CONVERSE_SCRIPT.slice(0, n)` — an append-only prefix of
 * a fixed script, never reordered or removed — so using the slice index as
 * the list key is stable and correct here.
 */
export function Transcript({ turns, thinking, revealed, onToggleReveal, translitEnabled }: TranscriptProps) {
  const scrollRef = React.useRef<ScrollView>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [turns.length, thinking]);

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1 px-[22px] pt-[12px] pb-[8px]"
      contentContainerClassName="gap-[18px]"
    >
      {turns.map((turn, index) => (
        turn.who === 'her'
          ? (
              <HerTurn
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                ru={turn.ru}
                en={turn.en}
                translit={turn.translit}
                translitEnabled={translitEnabled}
                revealed={!!revealed[index]}
                onToggleReveal={() => onToggleReveal(index)}
              />
            )
          : (
              // eslint-disable-next-line react/no-array-index-key
              <LearnerTurn key={index} ru={turn.ru} />
            )
      ))}
      {thinking && <ThinkingFiller />}
    </ScrollView>
  );
}
