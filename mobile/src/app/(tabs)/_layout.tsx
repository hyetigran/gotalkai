import Feather from '@expo/vector-icons/Feather';
import { Icon, Label, NativeTabs, VectorIcon } from 'expo-router/unstable-native-tabs';

import { colors } from '@/components/ui/design-tokens';

/**
 * Three-tab shell for the daily-loop screens that live outside a single
 * conversation: Talk (Open — today's persona card, the "Answer" CTA),
 * Home (Address book — the cast list), and History (past debriefs).
 *
 * `Converse`/`Debrief`/`Tomorrow` deliberately stay *outside* this group,
 * as siblings at the root `Stack` (`src/app/_layout.tsx`) — the daily
 * loop already navigates between them via `router.replace`, never
 * `push` (`loop-nav-params.ts`'s own header comment: "doesn't accumulate
 * back history"). Because `/converse` is a route the root `Stack` owns
 * directly, replacing into it from a screen nested inside this `Tabs`
 * navigator replaces the *whole* tabs screen in the root stack, not
 * something inside it — the tab bar disappears for the length of a
 * conversation for free, with no explicit "hide the tab bar" prop
 * anywhere. Reappears the same way once the loop replaces back to
 * `/open`, since that route re-enters this group.
 *
 * `NativeTabs` (expo-router/unstable-native-tabs) renders a real
 * UITabBarController on iOS / native bottom nav on Android instead of a
 * JS-drawn bar — on iOS 26 that's what gets the system's floating
 * "Liquid Glass" tab bar for free, no custom blur view to build or
 * maintain. `blurEffect="systemMaterial"` is the explicit ask for that
 * translucent look pre-26 too (adapts to light/dark automatically); it's
 * a no-op label-only hint on Android. Trade-off vs. the old `Tabs`: this
 * is a native control, so styling goes through these typed props, not
 * arbitrary NativeWind classes.
 */
export default function TabsLayout() {
  return (
    <NativeTabs blurEffect="systemMaterial" iconColor={`${colors.ink}66`} tintColor={colors.accent}>
      <NativeTabs.Trigger name="address-book">
        <Label>Home</Label>
        <Icon src={<VectorIcon family={Feather} name="book-open" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="open">
        <Label>Talk</Label>
        <Icon src={<VectorIcon family={Feather} name="phone-call" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="debrief-history">
        <Label>History</Label>
        <Icon src={<VectorIcon family={Feather} name="clock" />} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
