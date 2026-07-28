import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';

/**
 * Dev-only screen for the UAT in ticket #2 ("Scaffold app + design system
 * foundation"): visual confirmation that the bundled fonts render Cyrillic
 * and stress marks correctly on a real device. Automated coverage lives in
 * `src/components/ui/design-tokens.test.ts` — this screen is for the human
 * check that automated glyph-presence checks can't do (does it actually
 * "look" right, not just "is the glyph present").
 *
 * Not part of the shipping product — no route links to it from the app's
 * own navigation. Reachable directly at `/design-tokens-debug`.
 *
 * `font-mono-medium` / `font-serif-italic` below trip
 * `better-tailwindcss/no-unknown-classes` as warnings (not errors) — the
 * plugin recognized the single-segment `--font-family-*` tokens added in
 * the same edit (`font-serif`, `font-mono`) but not the compound-suffix
 * ones. Tailwind's own theme-key-to-utility mapping is a mechanical prefix
 * strip with no such restriction, so this reads as a plugin parsing gap
 * rather than a real unknown class; a full compile-check to prove it
 * definitively hit an unrelated Tailwind CLI bug in this environment.
 */
export function DesignTokensDebugScreen() {
  return (
    <ScrollView className="flex-1 bg-paper px-6 pt-16">
      <Text className="font-mono-medium text-[10px] tracking-[0.12em] text-ink/42 uppercase">
        Ticket #2 UAT — font + Cyrillic check
      </Text>

      <View className="mt-8">
        <Text className="font-mono-medium text-[11px] text-ink/55 uppercase">
          ёщъыэюя at chip size (15px, PT Serif) — none of these should be
          dropped or replaced with a fallback glyph
        </Text>
        <Text className="mt-2 font-serif text-[15px] text-ink">
          ёщъыэюя
        </Text>
      </View>

      <View className="mt-8">
        <Text className="font-mono-medium text-[11px] text-ink/55 uppercase">
          Stress mark (U+0301 combining acute) at 20px, PT Serif — the mark
          must render as a diacritic over the о, not a separate character or
          a tofu box
        </Text>
        <Text className="mt-2 font-serif text-[20px] text-ink">
          молоко́
        </Text>
      </View>

      <View className="mt-8">
        <Text className="font-mono-medium text-[11px] text-ink/55 uppercase">
          Her voice sample line, as it will actually appear on Converse
        </Text>
        <Text className="mt-2 font-serif text-[20px] leading-[30px] text-ink">
          Ну наконе́ц-то ты позвони́л. Ты говори́л, что соба́ка пропа́ла — нашла́сь?
        </Text>
      </View>

      <View className="mt-8">
        <Text className="font-mono-medium text-[11px] text-ink/55 uppercase">
          IBM Plex Mono — regular (400) and medium (500)
        </Text>
        <Text className="mt-2 font-mono text-[12px] text-ink">
          IBM Plex Mono 400 — ёщъыэюя
        </Text>
        <Text className="font-mono-medium mt-1 text-[12px] text-ink">
          IBM Plex Mono 500 — ёщъыэюя
        </Text>
      </View>

      <View className="mt-8">
        <Text className="font-mono-medium text-[11px] text-ink/55 uppercase">
          PT Serif italic (Address book role line)
        </Text>
        <Text className="font-serif-italic mt-2 text-[13px] text-ink/62">
          Бабушка-по-мужу · библиотекарь на пенсии
        </Text>
      </View>

      <View className="mt-8 mb-16 h-px bg-ink/10" />
      <Text className="mb-16 font-mono text-[12px] text-ink/50">
        Pass: every line above is legible, no dropped ё, no missing/boxed
        stress mark, no fallback (non-PT-Serif/non-IBM-Plex-Mono) glyphs
        visible anywhere on this screen.
      </Text>
    </ScrollView>
  );
}
