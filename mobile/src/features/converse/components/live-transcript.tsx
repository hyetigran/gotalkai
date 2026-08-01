import type { ConverseTurn } from '../use-live-converse-session';
import * as React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { LearnerTurn, ThinkingFiller } from './transcript';

/**
 * Her turn, live-pipeline version. PRD §6.2 tap-to-reveal, real-pipeline
 * counterpart to `Transcript.tsx`'s `HerTurn` — `persona_turn` now
 * carries a real `translation` (turn-orchestrator.ts generates one
 * alongside every reply; persona.ts's schema, not fabricated
 * client-side), so this can use the same dotted-underline affordance
 * `HerTurn` does. No transliteration slot here (unlike `HerTurn`,
 * which switches between `en`/`translit`): translit is real-learner-only
 * data (ticket #30) the live pipeline's `persona_turn` message doesn't
 * carry — English-only reveal for now, not a regression, a narrower
 * scope than the scripted demo's.
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
        className="font-serif text-[20px] leading-[30px] text-ink"
        style={{
          textDecorationLine: 'underline',
          textDecorationStyle: 'dotted',
          textDecorationColor: 'rgba(160,84,58,0.4)',
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
  /** Her reply is generating — filler visible. Same signal `Transcript.tsx` uses, different phase enum (`LiveConversePhase` vs `ConversePhase`) — the screen maps it, this component just takes the boolean. */
  thinking: boolean;
};

/**
 * Live-pipeline counterpart to `Transcript.tsx` — same scroll-to-end
 * behavior and per-speaker layout, but over `ConverseTurn[]`
 * (`use-live-converse-session.ts`'s real turn shape) instead of the
 * scripted demo's `ScriptedTurn[]`. Turns only ever append here (the
 * reducer in `use-live-converse-session.ts` never reorders or removes
 * one), so the array index is a stable, correct list key, same
 * justification as `Transcript.tsx`'s own.
 */
export function LiveTranscript({ turns, thinking }: LiveTranscriptProps) {
  const scrollRef = React.useRef<ScrollView>(null);
  // Local, UI-only state — which turns' translations are currently shown.
  // Not threaded through use-live-converse-session.ts: a tap-to-reveal
  // toggle has no bearing on the session/connection state machine, same
  // separation the scripted demo's own `revealed` (use-converse-session.ts)
  // doesn't quite make, but there it's driven by scripted content, not a
  // live WS-connected hook.
  const [revealed, setRevealed] = React.useState<Record<number, boolean>>({});
  const toggleReveal = React.useCallback((index: number) => {
    setRevealed(prev => ({ ...prev, [index]: !prev[index] }));
  }, []);

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
