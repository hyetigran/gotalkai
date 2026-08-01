import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { colors } from '@/components/ui/design-tokens';

// `design-tokens.ts`'s own `fontFamily` map isn't exported (only the
// derived `typography` roles are) — same literal it resolves `serif` to,
// not a new source of truth.
const SERIF_FONT_FAMILY = 'PTSerif-Regular';

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
 * No icons: every other screen in this app is pure typography (no
 * iconography anywhere in the mockup-driven design), so the tab bar
 * matches that instead of introducing icons that would be new to the
 * product's visual language.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: `${colors.ink}66`,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: `${colors.ink}1A`,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily: SERIF_FONT_FAMILY,
          fontSize: 12,
        },
      }}
    >
      <Tabs.Screen
        name="address-book"
        options={{
          title: 'Home',
          tabBarButtonTestID: 'home-tab',
        }}
      />
      <Tabs.Screen
        name="open"
        options={{
          title: 'Talk',
          tabBarButtonTestID: 'talk-tab',
        }}
      />
      <Tabs.Screen
        name="debrief-history"
        options={{
          title: 'History',
          tabBarButtonTestID: 'history-tab',
        }}
      />
    </Tabs>
  );
}
