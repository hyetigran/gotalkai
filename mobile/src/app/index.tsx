import { Redirect } from 'expo-router';

import { useLearnerId } from '@/lib/hooks/use-learner-id';

/**
 * The app's true root route. Open is the real product's entry point — the
 * daily loop (Open → Converse → Debrief → Tomorrow → Open) plus Address
 * book and Settings reachable outside it, per PRD §6.1. `(app)`'s tab bar
 * (Feed/Style/Settings) is unused Obytes-starter scaffolding, still
 * reachable by direct navigation but no longer the cold-launch screen.
 *
 * Session zero (ticket #30): a device with no real learner yet (no
 * `learnerId` ever persisted, checked via MMKV — not the unrelated
 * Obytes-scaffold `IS_FIRST_TIME` flag) goes through onboarding first;
 * every later cold launch skips straight to Open with the real
 * `learnerId`, since the literacy question is asked exactly once (AC
 * #1) and never again.
 */
export default function Index() {
  const [learnerId] = useLearnerId();
  if (!learnerId)
    return <Redirect href="/session-zero" />;
  return <Redirect href={{ pathname: '/open', params: { learnerId } }} />;
}
