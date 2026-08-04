import type { SessionHistoryEntry } from './api';
import { useRouter } from 'expo-router';
import * as React from 'react';

import { FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tabBarClearance } from '@/components/ui/design-tokens';
import { useLearnerId } from '@/lib/hooks/use-learner-id';
import { useSessionHistory } from './api';
import { SESSION_HISTORY_FIXTURE } from './debrief-history-fixture';
import { derivePatternTitle } from './map-debrief-item';

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function formatSessionDate(startedAt: string): string {
  return DATE_FORMATTER.format(new Date(startedAt));
}

function SessionRow({ session, onPress }: { session: SessionHistoryEntry; onPress: () => void }) {
  const patternTitle = session.topPattern ? derivePatternTitle(session.topPattern.kind, session.topPattern.detail) : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`session from ${formatSessionDate(session.startedAt)}`}
      className="rounded-[16px] border border-ink/10 bg-card px-[17px] py-[16px]"
    >
      <View className="flex-row items-baseline justify-between">
        <Text className="font-sans-semibold text-[17px] text-ink">{formatSessionDate(session.startedAt)}</Text>
        <Text className="font-mono-medium text-[10px] text-ink/40">
          {session.turnCount}
          {' turns'}
        </Text>
      </View>
      <Text className="mt-[7px] text-[13px] leading-[19px] text-ink/55">
        {patternTitle ?? 'No patterns recorded for this session yet.'}
      </Text>
    </Pressable>
  );
}

function HistoryHeader() {
  return (
    <View className="pb-[20px]">
      <Text className="font-sans-semibold text-[22px] text-ink">Your history</Text>
      <Text className="font-mono-medium mt-[7px] text-[10px] tracking-[0.03em] text-ink/45">
        Past conversations, most recent first
      </Text>
    </View>
  );
}

/**
 * The History tab (new nav restructuring — see `src/app/(tabs)/_layout.tsx`'s
 * own comment for the tab shell this lives in). Real data: `GET
 * /learners/:id/sessions` (app-service, `session-history.ts`) —
 * keyset-paginated newest-first, each session with a real turn count
 * and its #1-ranked debrief pattern. Loads more on scroll (learner
 * feedback), not one big fetch — `FlatList`'s `onEndReached`, not
 * `ScrollView`, which has no built-in "near the bottom" signal. Tapping
 * a row reuses the existing single-session Debrief screen (`/debrief`)
 * rather than building a second read path for the same data.
 *
 * `learnerId` comes from `useLearnerId()`, not a route param — this is a
 * tab root reached by switching tabs, not pushed into with params like
 * the daily-loop screens (`loop-nav-params.ts`'s own header comment).
 *
 * Falls back to `SESSION_HISTORY_FIXTURE` only when there's no
 * `learnerId` at all — same convention as the Open/Debrief screens (see
 * their own doc comments). Once a real `learnerId` is present, this
 * never silently substitutes fixture content for a loading, errored, or
 * genuinely-empty real result.
 */
export function DebriefHistoryScreen() {
  const router = useRouter();
  const [learnerId] = useLearnerId();
  const hasLearner = Boolean(learnerId);
  const insets = useSafeAreaInsets();
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSessionHistory({
    variables: { learnerId: learnerId ?? '' },
    enabled: hasLearner,
  });
  const realSessions = React.useMemo(() => data?.pages.flatMap(page => page.sessions) ?? [], [data]);
  const sessions = hasLearner ? realSessions : SESSION_HISTORY_FIXTURE;

  const handleEndReached = React.useCallback(() => {
    if (hasNextPage && !isFetchingNextPage)
      void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = React.useCallback(({ item }: { item: SessionHistoryEntry }) => (
    <SessionRow
      session={item}
      // Fixture rows have no real `sessionId` the app-service knows about —
      // route to Debrief's own fixture fallback rather than a sessionId
      // that would 404, matching `hasRealSession` there.
      // `viewedFromHistory` (always set from this call site, unlike
      // `sessionId`/`learnerId`) is how Debrief tells "reached by
      // browsing old sessions" apart from "landed here straight off the
      // daily loop" — it shows a back button and hides "Tomorrow" only
      // for the former; see debrief-screen.tsx's own doc comment.
      onPress={() => router.push({
        pathname: '/debrief',
        params: hasLearner
          ? { sessionId: item.id, learnerId: learnerId ?? undefined, viewedFromHistory: 'true' }
          : { viewedFromHistory: 'true' },
      })}
    />
  ), [router, learnerId, hasLearner]);

  return (
    <FlatList
      className="flex-1 bg-page px-[22px] pt-[60px]"
      contentContainerClassName="gap-[10px]"
      contentContainerStyle={{ paddingBottom: insets.bottom + tabBarClearance }}
      data={sessions}
      keyExtractor={session => session.id}
      renderItem={renderItem}
      ListHeaderComponent={HistoryHeader}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={() => (
        <>
          {hasLearner && isLoading && (
            <Text className="text-[13px] text-ink/55">Loading your history…</Text>
          )}
          {hasLearner && isError && (
            <Text className="text-[13px] text-ink/55">Couldn't load your history — check your connection and try again.</Text>
          )}
          {hasLearner && !isLoading && !isError && (
            <>
              <Text className="font-sans-semibold text-[19px] text-ink/70">
                Your past conversations will show up here.
              </Text>
              <Text className="mt-[2px] text-[13px] leading-[19px] text-ink/50">
                Finish a session and it'll appear the next time you check.
              </Text>
            </>
          )}
        </>
      )}
      ListFooterComponent={isFetchingNextPage
        ? () => <Text className="mt-[10px] text-center text-[13px] text-ink/45">Loading more…</Text>
        : undefined}
    />
  );
}
