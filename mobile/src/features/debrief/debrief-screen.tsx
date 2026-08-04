import type { SessionSummary } from './api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { realParamsOrBarePath } from '@/lib/navigation/loop-nav-params';
import { useEndSession, useSessionDebrief, useSessionSummary } from './api';
import { DEBRIEF_FIXTURE as fixture } from './debrief-fixture';
import { formatSessionMeta } from './format-session-meta';
import { mapDebriefItemToPattern } from './map-debrief-item';

type SummaryFigures = {
  understoodCount: number;
  totalTurns: number;
  understoodWithoutHelp: number;
  sessionMetaText: string;
};

/**
 * Fires `POST /sessions/:id/end` (the post-session analyser) exactly
 * once, the moment a real, loaded `summary` comes back with
 * `endedAt: null` — never for `summary === undefined` (not yet loaded),
 * which is not the same thing as "not ended." Returns whether the
 * caller should still be showing a "finishing up" state: true from the
 * moment `endedAt: null` is seen until the post-mutation refetch comes
 * back with a real `endedAt`. Split out purely to keep `DebriefScreen`
 * itself under this repo's max-lines-per-function budget, same
 * reasoning `use-native-pcm-capture.ts`/`use-live-converse-session.ts`
 * already document for their own extracted sub-hooks.
 */
function useFinishSessionIfNeeded(sessionId: string | undefined, summary: SessionSummary | undefined, refetchSummary: () => Promise<unknown>): boolean {
  const needsFinishing = Boolean(sessionId) && summary !== undefined && summary.endedAt === null;
  const endSession = useEndSession();
  const triggered = React.useRef(false);

  React.useEffect(() => {
    if (!needsFinishing || triggered.current)
      return;
    triggered.current = true;
    endSession.mutate({ sessionId: sessionId as string }, {
      onSettled: () => void refetchSummary(),
    });
  }, [needsFinishing, sessionId, endSession, refetchSummary]);

  return needsFinishing;
}

/** The top section's three lines — split out purely to keep `DebriefScreen` itself under this repo's max-lines-per-function budget, same reasoning `use-native-pcm-capture.ts`/`use-live-converse-session.ts` already document for their own extracted sub-hooks. */
function SessionSummaryHeader({ figures }: { figures: SummaryFigures }) {
  return (
    <>
      <Text className="mt-[16px] font-serif text-[27px] leading-[35px] text-ink">
        {'She understood you '}
        <Text className="text-accent">{`${figures.understoodCount} times of ${figures.totalTurns}`}</Text>
        .
      </Text>
      <Text className="mt-[10px] font-serif text-[19px] leading-[26px] text-ink/62">
        {`You understood her without help ${figures.understoodWithoutHelp} of ${figures.totalTurns}.`}
      </Text>
      <Text className="mt-[12px] font-mono text-[12px] leading-[18px] text-ink/50">
        {figures.sessionMetaText}
      </Text>
    </>
  );
}

/**
 * The Debrief screen. Layout and copy per
 * `Initial mockup request/design_handoff_conversation_loop/README.md`
 * ("3. Debrief"). Part of the daily loop (ticket #9): reached from
 * Converse and advances to Tomorrow via the real router.
 *
 * Deliberately absent, per the ticket and PRD §6.3: any streak counter,
 * accuracy percentage, grade, or badge. Progress is expressed only through
 * the two ability figures and the ranked patterns below.
 *
 * Patterns render real, ranked `debrief_items` (PRD §5.4, ticket #20) when
 * a `sessionId` route param is present — falls back to fixture patterns
 * only when there's no `sessionId` at all. Once a `sessionId` is present,
 * this never silently substitutes fixture content for a loading, errored,
 * or genuinely-empty real result — that would misrepresent the real-data
 * path's state as fixture data instead of surfacing it.
 *
 * Converse's "End" navigates here immediately, without waiting on the
 * post-session analyser (a real LLM call) first — this screen is what
 * owns that wait instead, via `summary.endedAt`: `null` means the
 * session hasn't been finalized yet, so `POST /sessions/:id/end` fires
 * from here (once, guarded by a ref) and a "finishing up" state shows
 * until a refetched summary comes back with a real `endedAt`, at which
 * point the patterns query (previously held disabled) fires for the
 * first time. Converse showing nothing for that wait — just a static
 * disabled button — was the previous shape; this screen already has a
 * loading state to reuse for the same wait.
 */
export function DebriefScreen() {
  const router = useRouter();
  // Ticket #25: `learnerId` isn't used by this screen itself, only relayed onward to Tomorrow
  // (and from there back to Open) so the loop doesn't lose track of who the learner is.
  const { sessionId, learnerId } = useLocalSearchParams<{ sessionId?: string; learnerId?: string }>();
  const hasRealSession = Boolean(sessionId);
  const { data: summary, isLoading: summaryLoading, isError: summaryError, refetch: refetchSummary } = useSessionSummary({
    variables: { sessionId: sessionId ?? '' },
    enabled: hasRealSession,
  });
  const needsFinishing = useFinishSessionIfNeeded(sessionId, summary, refetchSummary);

  const { data: debriefItems, isLoading, isError } = useSessionDebrief({
    variables: { sessionId: sessionId ?? '' },
    enabled: hasRealSession && !needsFinishing,
  });
  const patterns = hasRealSession
    ? (debriefItems ?? []).map(mapDebriefItemToPattern)
    : fixture.patterns;
  const summaryFigures: SummaryFigures | null = hasRealSession
    ? (summary
        ? {
            understoodCount: summary.understoodCount,
            totalTurns: summary.totalTurns,
            understoodWithoutHelp: summary.personaTurns - summary.revealedCount,
            sessionMetaText: formatSessionMeta(summary),
          }
        : null)
    : {
        understoodCount: fixture.understoodCount,
        totalTurns: fixture.totalTurns,
        understoodWithoutHelp: fixture.totalTurns - fixture.revealedTurnCount,
        sessionMetaText: fixture.sessionMeta,
      };

  return (
    <ScrollView className="flex-1 bg-paper px-[22px] pt-[66px]" contentContainerClassName="pb-[44px]">
      <Text className="font-mono-medium text-[10px] tracking-[0.12em] text-ink/42 uppercase">
        After the conversation
      </Text>
      {hasRealSession && summaryLoading && (
        <Text className="mt-[16px] text-[13px] text-ink/55">Loading your summary…</Text>
      )}
      {hasRealSession && summaryError && (
        <Text className="mt-[16px] text-[13px] text-ink/55">Couldn't load your summary — check your connection and try again.</Text>
      )}
      {summaryFigures && <SessionSummaryHeader figures={summaryFigures} />}

      <View className="mt-[26px] gap-[10px]">
        {hasRealSession && needsFinishing && (
          <Text className="text-[13px] text-ink/55">Finishing up your analysis…</Text>
        )}
        {hasRealSession && !needsFinishing && isLoading && (
          <Text className="text-[13px] text-ink/55">Loading your patterns…</Text>
        )}
        {hasRealSession && !needsFinishing && isError && (
          <Text className="text-[13px] text-ink/55">Couldn't load your patterns — check your connection and try again.</Text>
        )}
        {(!hasRealSession || (!needsFinishing && !isLoading && !isError)) && patterns.map(pattern => (
          <View key={pattern.index} className="rounded-[16px] border border-ink/10 bg-white px-[17px] py-[16px]">
            <View className="flex-row items-baseline gap-[10px]">
              <Text className="font-mono-medium text-[10px] text-ink/40">{pattern.index}</Text>
              <View className="flex-1">
                <Text className="font-serif text-[17px] leading-[24px] text-ink">{pattern.title}</Text>
                <Text className="mt-[7px] text-[13px] leading-[19px] text-ink/55">{pattern.body}</Text>
                {pattern.tag && (
                  <Text className="font-mono-medium mt-[9px] text-[10px] text-accent">{pattern.tag}</Text>
                )}
              </View>
            </View>
          </View>
        ))}
      </View>

      {/*
        Fixture-only: a real detected avoidance isn't a separate summary
        field at all — app-service's detectAndRecordAvoidance writes it
        as a regular `observations` row (kind: 'avoidance', tag: "you
        steered around this"), so it already renders inline above as a
        normal, distinctly-tagged pattern card once promoted
        (map-debrief-item.ts reads `detail.tag` verbatim). This dashed
        box exists only to give the scripted/no-session fixture path the
        same "there's something to call out" affordance real data gets
        for free through the tag.
      */}
      {!hasRealSession && (
        <View className="mt-[20px] rounded-[16px] border border-dashed border-accent/45 bg-accent/5 p-[17px]">
          <Text className="font-mono-medium text-[10px] tracking-widest text-accent uppercase">
            {fixture.avoidance.heading}
          </Text>
          <Text className="mt-[9px] font-serif text-[16px] leading-[23px] text-ink">
            {fixture.avoidance.body}
          </Text>
        </View>
      )}

      <Pressable
        onPress={() => router.replace(realParamsOrBarePath('/tomorrow', { sessionId, learnerId }))}
        accessibilityRole="button"
        accessibilityLabel="Tomorrow"
        className="mt-[26px] items-center rounded-[16px] bg-accent py-[19px]"
      >
        <Text className="font-serif text-[18px] text-paper">Tomorrow</Text>
      </Pressable>
    </ScrollView>
  );
}
