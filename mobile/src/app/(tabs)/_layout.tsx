import Feather from '@expo/vector-icons/Feather';
import { Icon, Label, NativeTabs, VectorIcon } from 'expo-router/unstable-native-tabs';

import { colorsDark } from '@/components/ui/design-tokens';

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
  // `NativeTabs`' color props are resolved `ColorValue`s, not CSS
  // variables — they don't theme-swap on their own the way `bg-page`-style
  // Tailwind classes do. Hardcoded to `colorsDark`, not picked via
  // `useUniwind()`/`useColorScheme()`: verified on-device (2026-08-04)
  // that both report `'light'` even though every `bg-page`/`text-ink`
  // Tailwind-class screen in this build renders dark regardless — a
  // build-vs-runtime `prefers-color-scheme` mismatch upstream of this
  // file (see memory `project-uniwind-theme-signal-mismatch`), not
  // something to work around per-call-site. `nav` (solid, not an
  // alpha-modified `ink`) as the unselected color and `accent` as the
  // selected one gives icons a real color *change* on selection, not
  // just a small opacity bump.
  const palette = colorsDark;

  return (
    <NativeTabs
      blurEffect="systemMaterial"
      iconColor={{ default: palette.nav, selected: palette.accent }}
      tintColor={palette.accent}
      backgroundColor={palette.card}
      // `systemMaterial`'s blur tracks the OS-level (native) light/dark
      // trait, not this app's own custom Uniwind theme — the two can
      // disagree. At rest that's masked by blurring our own dark content
      // behind it, but the default "become transparent when scrolled to
      // the edge" behavior (e.g. History's `FlatList` scrolled toward the
      // bottom) swaps to a starker system-default tint, which read as a
      // stray light/white bar. Disabling that keeps the explicit
      // `backgroundColor`/`iconColor` above in effect regardless of scroll
      // position.
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="address-book">
        <Label hidden>Home</Label>
        <Icon src={<VectorIcon family={Feather} name="book-open" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="open">
        <Label hidden>Talk</Label>
        <Icon src={<VectorIcon family={Feather} name="phone-call" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="debrief-history">
        <Label hidden>History</Label>
        <Icon src={<VectorIcon family={Feather} name="clock" />} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
