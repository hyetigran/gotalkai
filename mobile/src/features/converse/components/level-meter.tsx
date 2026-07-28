import type { ConversePhase } from '../use-converse-session';
import * as React from 'react';
import { Animated, Text, View } from 'react-native';

/**
 * README: "10 bars, 3px wide, 4px gap, radius 2px, heights derived from
 * amplitude". Per-bar values give the meter visual variety (a "skyline"
 * silhouette) — every bar still tracks the same live `amplitude` value
 * (ticket #10), since expo-audio's recorder exposes one scalar metering
 * reading, not true per-frequency-band data.
 */
const BAR_HEIGHT_RATIOS = [0.42, 0.68, 1, 0.84, 0.55, 0.9, 0.6, 0.34, 0.72, 0.46];
const METER_HEIGHT_PX = 34;
const HELD_HEIGHT_RATIO = 0.16;
/** Floor scale at silence — a fully zero-height bar reads as broken, not idle. */
const IDLE_MIN_SCALE = 0.08;
/** How long to animate toward each new metering reading. */
const AMPLITUDE_TRANSITION_MS = 150;

type MeterBarProps = {
  ratio: number;
  /** Animated (idle/listening) vs frozen (her turn, or held). */
  live: boolean;
  held: boolean;
  /** Real mic amplitude, 0-1, only meaningful while `live`. */
  amplitude: number;
  colorClassName: string;
};

function MeterBar({ ratio, live, held, amplitude, colorClassName }: MeterBarProps) {
  const scale = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (!live) {
      scale.stopAnimation();
      scale.setValue(1);
      return;
    }
    Animated.timing(scale, {
      toValue: Math.max(IDLE_MIN_SCALE, amplitude),
      duration: AMPLITUDE_TRANSITION_MS,
      useNativeDriver: true,
    }).start();
  }, [live, amplitude, scale]);

  const heightPx = held ? METER_HEIGHT_PX * HELD_HEIGHT_RATIO : METER_HEIGHT_PX * ratio;

  return (
    <Animated.View
      className={`w-[3px] rounded-[2px] ${colorClassName}`}
      style={{ height: heightPx, transform: [{ scaleY: scale }] }}
    />
  );
}

type LevelMeterProps = {
  phase: ConversePhase;
  holding: boolean;
  /** Real mic amplitude, 0-1 (ticket #10) — see `use-mic-capture.ts`. */
  amplitude: number;
};

/**
 * The Converse screen's level meter — per the README, "the highest-leverage
 * element on the Converse screen" and "a pure output driven by mic
 * amplitude" (ticket #10 replaces the ticket #3 mock's fake animated
 * loop with this). The mockup makes the meter tappable to simulate a turn;
 * that's explicitly prototype-only and is not carried over here —
 * suggestion chips are the only turn-advance affordance.
 */
export function LevelMeter({ phase, holding, amplitude }: LevelMeterProps) {
  const live = !holding && phase !== 'thinking';
  const barColorClassName = holding
    ? 'bg-ink/18'
    : phase === 'listening'
      ? 'bg-accent'
      : 'bg-accent/50';

  const label = holding
    ? 'she’s waiting — take your time'
    : phase === 'thinking'
      ? 'she’s talking'
      : phase === 'listening'
        ? 'she heard that'
        : 'she can hear you';

  return (
    <View className="mt-[14px] items-center gap-[12px]">
      <View
        className={`h-[46px] flex-row items-center justify-center gap-[4px] rounded-full px-[22px] ${
          holding ? 'border border-ink/12 bg-ink/5' : 'border border-accent/20 bg-accent/8'
        }`}
      >
        {BAR_HEIGHT_RATIOS.map((ratio, index) => (
          <MeterBar
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            ratio={ratio}
            live={live}
            held={holding}
            amplitude={amplitude}
            colorClassName={barColorClassName}
          />
        ))}
      </View>
      <Text
        className={`font-mono-medium text-[11px] tracking-[0.05em] ${
          holding ? 'text-accent' : 'text-ink/55'
        }`}
      >
        {label}
      </Text>
    </View>
  );
}
