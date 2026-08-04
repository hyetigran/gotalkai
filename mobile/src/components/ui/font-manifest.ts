/**
 * Single source of truth for the LingoAI-added font files (Poppins,
 * JetBrains Mono, plus one Inter weight — see below) — the paths
 * themselves, independent of how each consumer needs them shaped.
 * Consumed by:
 *  - `app.config.ts` (iOS flat list + Android per-style `fontDefinitions`)
 *  - `design-tokens.test.ts` (Cyrillic/stress-mark glyph-coverage checks)
 *
 * Otherwise deliberately excludes the starter's pre-existing Inter font
 * files (those are registered separately, weight-grouped, for the
 * scaffold UI) — the one exception is `Inter-Medium` below, registered
 * here as an exact-style family for the same reason every other entry in
 * this manifest is: `design-tokens.test.ts` needs to glyph-check it.
 * Poppins (the new design spec's font) ships with **no Cyrillic glyphs at
 * all** — confirmed by that same test failing outright when Poppins was
 * first wired up for `herVoice`/`learnerTurn`. Those two roles carry the
 * actual target-language dialogue (persona turns and the learner's own
 * turn), so they use this Inter weight instead of Poppins; every other
 * typography role (English UI chrome) still uses Poppins.
 */
export const fontManifest = [
  {
    family: 'Poppins-Regular',
    path: 'node_modules/@expo-google-fonts/poppins/400Regular/Poppins_400Regular.ttf',
    weight: 400,
  },
  {
    family: 'Poppins-Medium',
    path: 'node_modules/@expo-google-fonts/poppins/500Medium/Poppins_500Medium.ttf',
    weight: 500,
  },
  {
    family: 'Poppins-SemiBold',
    path: 'node_modules/@expo-google-fonts/poppins/600SemiBold/Poppins_600SemiBold.ttf',
    weight: 600,
  },
  {
    family: 'Poppins-Bold',
    path: 'node_modules/@expo-google-fonts/poppins/700Bold/Poppins_700Bold.ttf',
    weight: 700,
  },
  {
    family: 'JetBrainsMono-Regular',
    path: 'node_modules/@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf',
    weight: 400,
  },
  {
    family: 'JetBrainsMono-Medium',
    path: 'node_modules/@expo-google-fonts/jetbrains-mono/500Medium/JetBrainsMono_500Medium.ttf',
    weight: 500,
  },
  {
    family: 'Inter-Medium',
    path: 'node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf',
    weight: 500,
  },
] as const;
