import type { ConverseTurn } from '../use-live-converse-session';
import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { LearnerTurn, ThinkingFiller } from './transcript';

/**
 * Her turn, live-pipeline version. Deliberately NOT `Transcript.tsx`'s
 * `HerTurn` (no tap-to-reveal, no underline affordance): `persona_turn`'s
 * wire shape (voice-connection.ts's `ServerMessage`) carries `text`,
 * `comprehension`, and `affect` — no translation/transliteration field —
 * so there's nothing to reveal yet. This is a real, disclosed gap
 * upstream of this component (the server-side pipeline doesn't generate
 * one), not something to fabricate here.
 */
function LivePersonaTurn({ text }: { text: string }) {
  return (
    <Text className="font-serif text-[20px] leading-[30px] text-ink">
      {text}
    </Text>
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
        turn.speaker === 'persona'
          // eslint-disable-next-line react/no-array-index-key
          ? <LivePersonaTurn key={index} text={turn.text} />
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
