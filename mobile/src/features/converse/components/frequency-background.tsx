import * as React from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

/**
 * UAT: "the flat white background seems plain... add a 'frequency'
 * background that moves when she speaks" — sits behind `PersonaPortrait3D`'s
 * `<Canvas>` (which is rendered with a transparent clear color so this
 * shows through). No real per-band audio data exists for TTS playback —
 * `expo-audio`'s player exposes no metering, only the recorder does (see
 * `use-mic-capture.ts`'s real `amplitude`) — so, same as `LevelMeter`'s own
 * "skyline" bars, this is a decorative looping animation keyed off
 * `active`, not a true spectrum analysis of her voice.
 */
/** Varied static heights for visual texture, same approach as level-meter.tsx's BAR_HEIGHT_RATIOS. */
const BAR_HEIGHT_RATIOS = [0.3, 0.55, 0.8, 1, 0.7, 0.45, 0.65, 0.9, 0.5, 0.35, 0.6, 0.85, 0.95, 0.4, 0.3, 0.55, 0.8, 1, 0.7, 0.45, 0.65, 0.9, 0.5, 0.35, 0.6, 0.85, 0.95, 0.4];
const MAX_BAR_HEIGHT_PX = 120;
const IDLE_SCALE = 0.12;
const CYCLE_MS = 720;
/** Stagger between neighboring bars so the loop reads as a moving wave, not bars pulsing in lockstep. */
const STAGGER_MS = 35;

type FrequencyBarProps = {
  ratio: number;
  index: number;
  active: boolean;
};

function FrequencyBar({ ratio, index, active }: FrequencyBarProps) {
  const scale = React.useRef(new Animated.Value(IDLE_SCALE)).current;

  React.useEffect(() => {
    if (!active) {
      scale.stopAnimation();
      Animated.timing(scale, { toValue: IDLE_SCALE, duration: 200, useNativeDriver: true }).start();
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1,
          duration: CYCLE_MS / 2,
          delay: (index % 7) * STAGGER_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: IDLE_SCALE,
          duration: CYCLE_MS / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, index, scale]);

  return (
    <Animated.View
      className="w-[3px] rounded-[2px] bg-accent/25"
      style={{ height: MAX_BAR_HEIGHT_PX * ratio, transform: [{ scaleY: scale }] }}
    />
  );
}

export function FrequencyBackground({ active }: { active: boolean }) {
  return (
    <View
      pointerEvents="none"
      className="items-center justify-center overflow-hidden bg-page"
      style={StyleSheet.absoluteFillObject}
    >
      <View className="flex-row items-center gap-[4px]">
        {BAR_HEIGHT_RATIOS.map((ratio, index) => (
          <FrequencyBar
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            ratio={ratio}
            index={index}
            active={active}
          />
        ))}
      </View>
    </View>
  );
}
