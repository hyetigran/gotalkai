/**
 * Single source of truth for the LingoAI-added font files (PT Serif, IBM
 * Plex Mono) — the paths themselves, independent of how each consumer
 * needs them shaped. Consumed by:
 *  - `app.config.ts` (iOS flat list + Android per-style `fontDefinitions`)
 *  - `design-tokens.test.ts` (Cyrillic/stress-mark glyph-coverage checks)
 *
 * Deliberately excludes the starter's pre-existing Inter font files —
 * those aren't part of this manifest's reason to exist.
 */
export const fontManifest = [
  {
    family: 'PTSerif-Regular',
    path: 'node_modules/@expo-google-fonts/pt-serif/400Regular/PTSerif_400Regular.ttf',
    weight: 400,
  },
  {
    family: 'PTSerif-Italic',
    path: 'node_modules/@expo-google-fonts/pt-serif/400Regular_Italic/PTSerif_400Regular_Italic.ttf',
    weight: 400,
    style: 'italic',
  },
  {
    family: 'IBMPlexMono-Regular',
    path: 'node_modules/@expo-google-fonts/ibm-plex-mono/400Regular/IBMPlexMono_400Regular.ttf',
    weight: 400,
  },
  {
    family: 'IBMPlexMono-Medium',
    path: 'node_modules/@expo-google-fonts/ibm-plex-mono/500Medium/IBMPlexMono_500Medium.ttf',
    weight: 500,
  },
] as const;
