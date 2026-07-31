import { useRouter } from 'expo-router';
import * as React from 'react';
import { BackHandler } from 'react-native';

import { realParamsOrBarePath } from '@/lib/navigation/loop-nav-params';

/**
 * Open -> Converse navigates via `router.replace` (`loop-nav-params.ts`'s
 * own header comment: the daily loop deliberately doesn't accumulate back
 * history — Open replaces whatever redirected to it, Converse replaces
 * Open, and so on), which means Converse has no "/open" left in its own
 * navigation stack for the OS back gesture/button to pop to. Android's
 * default behavior in that case is to exit the app outright, not return
 * to Open — unlike the on-screen "‹" back button (`ConverseHeader`),
 * which already does the right thing by calling `router.replace` itself.
 * This hook makes the hardware back button match that same behavior
 * instead of silently exiting a live (or scripted) conversation.
 *
 * `BackHandler.addEventListener` is a documented no-op on iOS (no
 * hardware back button exists there) — safe to call unconditionally,
 * no `Platform.OS` guard needed.
 */
export function useHardwareBackToOpen(learnerId: string | undefined) {
  const router = useRouter();

  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace(realParamsOrBarePath('/open', { learnerId }));
      return true; // handled — prevents the default pop/exit behavior
    });
    return () => subscription.remove();
  }, [router, learnerId]);
}
