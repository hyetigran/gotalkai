import type { ConverseTurn } from '../use-live-converse-session';
import * as React from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';

import { motion } from '@/components/ui/design-tokens';

function LearnerTurn({ ru }: { ru: string }) {
  return (
    <View className="flex-row justify-end">
      <Text className="font-cyrillic-medium max-w-[78%] text-right text-[16px] leading-[24.8px] text-ink/52">
        {ru}
      </Text>
    </View>
  );
}

/**
 * The thinking-indicator ellipsis — visible only while her reply is
 * generating. UAT: previously the Cyrillic «ну…» ("well…") — legible as
 * Cyrillic, but at a glance reads like the Latin "hy..." to someone not
 * parsing it as Cyrillic, which is confusing rather than in-character.
 * Plain "…" avoids that entirely without losing the thinking cue.
 */
function ThinkingFiller() {
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
    <Animated.Text className="font-cyrillic-medium text-[17px] leading-[25.5px] text-ink/35" style={{ opacity }}>
      …
    </Animated.Text>
  );
}

/**
 * Her turn, live-pipeline version. PRD §6.2 tap-to-reveal — `persona_turn`
 * carries a real `translation` (turn-orchestrator.ts generates one
 * alongside every reply; persona.ts's schema, not fabricated
 * client-side), rendered behind the same dotted-underline reveal
 * affordance. No transliteration slot: translit is real-learner-only data
 * (ticket #30) the live pipeline's `persona_turn` message doesn't carry —
 * English-only reveal for now.
 */
function LivePersonaTurn({ text, translation, revealed, onToggleReveal }: {
  text: string;
  translation?: string;
  revealed: boolean;
  onToggleReveal: () => void;
}) {
  return (
    <Pressable onPress={onToggleReveal} accessibilityRole="button" accessibilityLabel="toggle translation">
      <Text
        className="font-cyrillic-medium text-[17px] leading-[25.5px] text-ink"
        style={{
          textDecorationLine: 'underline',
          textDecorationStyle: 'dotted',
          textDecorationColor: 'rgba(108,92,231,0.4)',
        }}
      >
        {text}
      </Text>
      {revealed && translation && (
        <Text className="mt-[8px] text-[14px] leading-[21px] text-ink/60">{translation}</Text>
      )}
    </Pressable>
  );
}

/**
 * The out-of-character safety escape hatch (ticket #27, docs/adr/0019) —
 * deliberately distinct from both speakers: centered and visually quiet,
 * never styled as Валентина speaking or as the learner's own line.
 */
function SystemTurn({ text }: { text: string }) {
  return (
    <View className="items-center">
      <Text className="font-mono-medium max-w-[85%] text-center text-[13px] leading-[19px] text-ink/55">
        {text}
      </Text>
    </View>
  );
}

type LiveTranscriptProps = {
  turns: ConverseTurn[];
  /** Her reply is generating — filler visible. */
  thinking: boolean;
  /** `use-live-converse-session.ts`'s `markRevealed` — persists the real "you understood her without help" signal (ticket #29 AC #3) server-side. Optional so this component still works with no backing session; fired only on the false→true transition, never to un-reveal (the server-side flag is one-way). */
  onReveal?: (index: number) => void;
};

/**
 * Renders `ConverseTurn[]` (`use-live-converse-session.ts`'s real turn
 * shape), scrolling to the end as new turns arrive. Turns only ever
 * append here (the reducer in `use-live-converse-session.ts` never
 * reorders or removes one), so the array index is a stable, correct list
 * key.
 */
export function LiveTranscript({ turns, thinking, onReveal }: LiveTranscriptProps) {
  const scrollRef = React.useRef<ScrollView>(null);
  // Local, UI-only state — which turns' translations are currently shown.
  // Not threaded through use-live-converse-session.ts's state machine: a
  // tap-to-reveal toggle has no bearing on `phase`/connection state, same
  // separation the scripted demo's own `revealed` (use-converse-session.ts)
  // doesn't quite make, but there it's driven by scripted content, not a
  // live WS-connected hook. `onReveal` (persisting the flag server-side,
  // ticket #29 AC #3) is a separate, deliberately one-way side effect
  // fired alongside this local toggle, not a replacement for it — the UI
  // still needs to know what's currently shown regardless of network state.
  const [revealed, setRevealed] = React.useState<Record<number, boolean>>({});
  const toggleReveal = React.useCallback((index: number) => {
    // Side effect kept out of the updater function itself (React can
    // invoke that more than once, e.g. under StrictMode) — read the
    // previous value from the state variable already in scope instead.
    if (!revealed[index])
      onReveal?.(index);
    setRevealed(prev => ({ ...prev, [index]: !prev[index] }));
  }, [revealed, onReveal]);

  React.useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [turns.length, thinking]);

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1 px-[22px] pt-[12px]"
      // UAT: "the text still gets cut off at the bottom by the footer" —
      // `pb-[8px]` (on the ScrollView itself, not its content) gave the
      // last turn almost no breathing room before the controls below it;
      // this is content-container padding, so it's real scrollable space
      // after the last turn, not just viewport inset.
      contentContainerClassName="gap-[18px] pb-[24px]"
    >
      {turns.map((turn, index) => (
        turn.speaker === 'persona'
          ? (
              <LivePersonaTurn
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                text={turn.text}
                translation={turn.translation}
                revealed={!!revealed[index]}
                onToggleReveal={() => toggleReveal(index)}
              />
            )
          : turn.speaker === 'system'
            // eslint-disable-next-line react/no-array-index-key
            ? <SystemTurn key={index} text={turn.text} />
            // eslint-disable-next-line react/no-array-index-key
            : <LearnerTurn key={index} ru={turn.text} />
      ))}
      {thinking && <ThinkingFiller />}
    </ScrollView>
  );
}
