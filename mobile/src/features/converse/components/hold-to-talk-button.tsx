import * as React from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

import { shadows } from '@/components/ui/design-tokens';

type HoldToTalkButtonProps = {
  pressed: boolean;
  /** PRD §7.9: disabled while she's speaking or generating a reply — no barge-in via this button, unlike the old open-mic model. */
  disabled: boolean;
  /** Real mic amplitude, 0-1, only meaningful while `pressed` — drives `FrequencyBars`. */
  amplitude: number;
  onPressIn: () => void;
  onPressOut: () => void;
};

/**
 * UAT: "move the frequency icon animation for the user to be inside the
 * hold to talk button on the left side." A smaller, leaner cousin of
 * `LevelMeter`'s own `MeterBar` (same visual language — animated-height
 * bars, one scalar amplitude driving all of them — deliberately not
 * imported from there: that component also owns a pill container and a
 * text label neither belongs inside a button, and five bars read better
 * than ten at this size).
 */
const BAR_HEIGHT_RATIOS = [0.5, 1, 0.65, 0.85, 0.4];
const BAR_MAX_HEIGHT_PX = 18;
const IDLE_MIN_SCALE = 0.15;
const AMPLITUDE_TRANSITION_MS = 150;

function FrequencyBar({ ratio, live, amplitude, colorClassName }: {
  ratio: number;
  live: boolean;
  amplitude: number;
  colorClassName: string;
}) {
  const scale = React.useRef(new Animated.Value(IDLE_MIN_SCALE)).current;

  React.useEffect(() => {
    if (!live) {
      scale.stopAnimation();
      scale.setValue(IDLE_MIN_SCALE);
      return;
    }
    Animated.timing(scale, {
      toValue: Math.max(IDLE_MIN_SCALE, amplitude),
      duration: AMPLITUDE_TRANSITION_MS,
      useNativeDriver: true,
    }).start();
  }, [live, amplitude, scale]);

  return (
    <Animated.View
      className={`w-[3px] rounded-[2px] ${colorClassName}`}
      style={{ height: BAR_MAX_HEIGHT_PX * ratio, transform: [{ scaleY: scale }] }}
    />
  );
}

function FrequencyBars({ live, amplitude, colorClassName }: { live: boolean; amplitude: number; colorClassName: string }) {
  return (
    <View className="flex-row items-center gap-[3px]">
      {BAR_HEIGHT_RATIOS.map((ratio, index) => (
        <FrequencyBar
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          ratio={ratio}
          live={live}
          amplitude={amplitude}
          colorClassName={colorClassName}
        />
      ))}
    </View>
  );
}

/**
 * UAT: "it's a primary button though, can we design it to be more
 * prominent?" — sized and weighted closer to the Open screen's "Answer"
 * button (`open-screen.tsx`: `py-[19px]`, `rounded-[16px]`, solid accent)
 * than the old secondary hold-to-think treatment this was visually
 * cloned from. An accent-tinted border in the idle state (not neutral
 * ink/20) signals this is the primary action on the whole screen, not an
 * optional aid.
 *
 * Ticket #40 (PRD §6.2/§7.9): replaces the open mic entirely — this is
 * now the only way a learner speaks to her, not an optional accessibility
 * setting. Always visible from session start (no `HoldToThinkButton`-style
 * progressive-disclosure fade-in — there's no "the first time they
 * hesitate" moment to wait for when pressing is the only way to talk at
 * all).
 *
 * Wired to Pressable's own `onPressIn`/`onPressOut` — not the
 * `onPointerDown`/`onPointerUp`/`onPointerLeave`/`onPointerCancel` pattern
 * `HoldToThinkButton` uses. UAT: "button is still disabled" / "no
 * feedback when pressing" — on this real device, those W3C pointer-event
 * props never fired at all for a touchscreen tap (no other component in
 * this codebase uses them, and nothing had actually confirmed them
 * working via a real touch on real hardware — RN's pointer-event support
 * on Android has long-standing gaps outside mouse/stylus input).
 * `onPressIn`/`onPressOut` are Pressable's own native responder-based
 * API, built for exactly this press-and-hold interaction, and already
 * fire correctly on release *or* on a scroll/system-gesture interrupting
 * the hold — no separate cancel/leave handling needed.
 */
export function HoldToTalkButton({ pressed, disabled, amplitude, onPressIn, onPressOut }: HoldToTalkButtonProps) {
  const barColorClassName = disabled ? 'bg-ink/15' : pressed ? 'bg-paper' : 'bg-accent/50';

  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="hold to talk"
      accessibilityState={{ disabled }}
      testID="hold-to-talk-button"
      className={`w-full flex-row items-center justify-center gap-[14px] rounded-[16px] px-[16px] py-[21px] ${
        disabled ? 'border border-ink/10 bg-ink/5' : pressed ? 'bg-accent' : 'border-2 border-accent/50 bg-white'
      }`}
      style={disabled || pressed ? undefined : shadows.holdToThinkRest}
    >
      <FrequencyBars live={pressed} amplitude={amplitude} colorClassName={barColorClassName} />
      <Text className={`font-serif text-[18px] ${disabled ? 'text-ink/35' : pressed ? 'text-paper' : 'text-ink'}`}>
        hold to talk
      </Text>
    </Pressable>
  );
}
