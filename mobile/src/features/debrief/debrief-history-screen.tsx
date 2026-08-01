import { View } from 'react-native';

import { Text } from '@/components/ui';

/**
 * The History tab (new nav restructuring — see `src/app/(tabs)/_layout.tsx`'s
 * own comment for the tab shell this lives in).
 *
 * Deliberately not fixture data standing in as if real, unlike
 * `debrief-fixture.ts`'s role on the single-session `DebriefScreen`: there
 * is no "list past sessions for a learner" endpoint anywhere in
 * app-service yet (confirmed by grepping its routes — the closest thing,
 * `GET /sessions/:id/debrief`, needs a specific session id, not a
 * learner-wide listing), so there's nothing to fetch, real or otherwise.
 * `sessions`/`debrief_items` already carry everything a real version of
 * this screen would need (`schema.sql`'s `idx_sessions_learner_id`,
 * `idx_sessions_started_at`) — the gap is purely the missing endpoint
 * and this screen's own list UI, not the underlying data.
 */
export function DebriefHistoryScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-paper px-[32px]">
      <Text className="font-serif text-[19px] text-ink/70">
        Your past conversations will show up here.
      </Text>
      <Text className="mt-[10px] text-center text-[13px] leading-[19px] text-ink/50">
        This list isn't wired up to real sessions yet.
      </Text>
    </View>
  );
}
