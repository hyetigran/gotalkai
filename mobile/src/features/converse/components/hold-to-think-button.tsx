import * as React from 'react';
import { Animated, Pressable, Text } from 'react-native';

import { motion, shadows } from '@/components/ui/design-tokens';

type HoldToThinkButtonProps = {
  holding: boolean;
  onHoldOn: () => void;
  onHoldOff: () => void;
};

/**
 * The hold-to-think button. Only ever mounted once `holdSeen` flips true
 * (see `use-converse-session.ts`), so "on mount" is exactly the moment the
 * README calls for a fade-in entrance: "Fades in the first time the
 * learner goes quiet mid-utterance."
 *
 * Release is wired to `pointerup`, `pointerleave`, *and* `pointercancel` —
 * per the acceptance criteria, an iOS scroll or system-gesture interruption
 * mid-hold fires `pointercancel` with no `pointerup`, which would otherwise
 * latch the held state.
 */
export function HoldToThinkButton({ holding, onHoldOn, onHoldOff }: HoldToThinkButtonProps) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(6)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: motion.buttonFadeInMs, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: motion.buttonFadeInMs, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View style={{ flex: 1, opacity, transform: [{ translateY }] }}>
      <Pressable
        onPointerDown={onHoldOn}
        onPointerUp={onHoldOff}
        onPointerLeave={onHoldOff}
        onPointerCancel={onHoldOff}
        accessibilityRole="button"
        accessibilityLabel="hold to think"
        testID="hold-to-think-button"
        className={`items-center justify-center rounded-[14px] px-[16px] py-[15px] ${
          holding ? 'bg-accent' : 'border border-ink/20 bg-white'
        }`}
        style={holding ? undefined : shadows.holdToThinkRest}
      >
        <Text className={`font-serif text-[16px] ${holding ? 'text-paper' : 'text-ink/75'}`}>
          hold to think
        </Text>
      </Pressable>
    </Animated.View>
  );
}
