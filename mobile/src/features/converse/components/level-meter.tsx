import type { ConversePhase } from '../use-converse-session';
import * as React from 'react';
import { Animated, Text, View } from 'react-native';

import { motion } from '@/components/ui/design-tokens';

/**
 * README: "10 bars, 3px wide, 4px gap, radius 2px, heights derived from
 * amplitude (mock uses the ratio set [...] × 34px)". The mock's animation
 * is indicative only — real amplitude comes later, per a live mic input
 * (not this ticket, which has "no live pipeline yet").
 */
const BAR_HEIGHT_RATIOS = [0.42, 0.68, 1, 0.84, 0.55, 0.9, 0.6, 0.34, 0.72, 0.46];
const METER_HEIGHT_PX = 34;
const HELD_HEIGHT_RATIO = 0.16;

type MeterBarProps = {
  index: number;
  ratio: number;
  /** Animated (idle/listening) vs frozen (her turn, or held). */
  live: boolean;
  held: boolean;
  colorClassName: string;
};

function MeterBar({ index, ratio, live, held, colorClassName }: MeterBarProps) {
  const scale = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (!live) {
      scale.stopAnimation();
      scale.setValue(1);
      return undefined;
    }
    const durationMs = motion.barLoopMinMs
      + (index % 4) * ((motion.barLoopMaxMs - motion.barLoopMinMs) / 3);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 0.18, duration: durationMs / 2, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: durationMs / 2, useNativeDriver: true }),
      ]),
    );
    const startTimeout = setTimeout(() => loop.start(), index * motion.barLoopStaggerMs);
    return () => {
      clearTimeout(startTimeout);
      loop.stop();
    };
  }, [live, index, scale]);

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
};

/**
 * The Converse screen's level meter — per the README, "the highest-leverage
 * element on the Converse screen" and, in the real app, "a pure output
 * driven by mic amplitude". The mockup makes the meter tappable to simulate
 * a turn; that's explicitly prototype-only and is not carried over here —
 * suggestion chips are the only turn-advance affordance in this ticket.
 */
export function LevelMeter({ phase, holding }: LevelMeterProps) {
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
            index={index}
            ratio={ratio}
            live={live}
            held={holding}
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
