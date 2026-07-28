import { Redirect } from 'expo-router';

/**
 * The app's true root route. Open is the real product's entry point — the
 * daily loop (Open → Converse → Debrief → Tomorrow → Open) plus Address
 * book and Settings reachable outside it, per PRD §6.1. `(app)`'s tab bar
 * (Feed/Style/Settings) is unused Obytes-starter scaffolding, still
 * reachable by direct navigation but no longer the cold-launch screen.
 */
export default function Index() {
  return <Redirect href="/open" />;
}
