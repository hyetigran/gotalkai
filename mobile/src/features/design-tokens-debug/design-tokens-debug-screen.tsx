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
 * Rewritten for the Aug 2026 purple/Poppins reskin: Poppins (the new
 * system's font) ships with zero Cyrillic glyphs, so target-language rows
 * below check Inter instead (see `font-manifest.ts`'s doc comment) — this
 * screen exists specifically to catch a font swap that silently drops
 * Cyrillic coverage, so it needs to track whichever font actually carries
 * that content, not the mockup's font-of-the-moment.
 */
export function DesignTokensDebugScreen() {
  return (
    <ScrollView className="flex-1 bg-page px-6 pt-16">
      <Text className="font-sans-semibold text-[10px] tracking-[0.12em] text-ink/42 uppercase">
        Ticket #2 UAT — font + Cyrillic check
      </Text>

      <View className="mt-8">
        <Text className="font-sans-semibold text-[11px] text-ink/55 uppercase">
          ёщъыэюя at chip size (15px, Inter Medium) — none of these should be
          dropped or replaced with a fallback glyph
        </Text>
        <Text className="font-cyrillic-medium mt-2 text-[15px] text-ink">
          ёщъыэюя
        </Text>
      </View>

      <View className="mt-8">
        <Text className="font-sans-semibold text-[11px] text-ink/55 uppercase">
          Stress mark (U+0301 combining acute) at 20px, Inter Medium — the
          mark must render as a diacritic over the о, not a separate
          character or a tofu box
        </Text>
        <Text className="font-cyrillic-medium mt-2 text-[20px] text-ink">
          молоко́
        </Text>
      </View>

      <View className="mt-8">
        <Text className="font-sans-semibold text-[11px] text-ink/55 uppercase">
          Her voice sample line, as it will actually appear on Converse
        </Text>
        <Text className="font-cyrillic-medium mt-2 text-[17px] leading-[25.5px] text-ink">
          Ну наконе́ц-то ты позвони́л. Ты говори́л, что соба́ка пропа́ла — нашла́сь?
        </Text>
      </View>

      <View className="mt-8">
        <Text className="font-sans-semibold text-[11px] text-ink/55 uppercase">
          JetBrains Mono — regular (400) and medium (500), for code/value
          display only (not used for app UI text — see global.css)
        </Text>
        <Text className="mt-2 font-mono text-[12px] text-ink">
          JetBrains Mono 400 — ёщъыэюя
        </Text>
        <Text className="font-mono-medium mt-1 text-[12px] text-ink">
          JetBrains Mono 500 — ёщъыэюя
        </Text>
      </View>

      <View className="mt-8">
        <Text className="font-sans-semibold text-[11px] text-ink/55 uppercase">
          Poppins (the new system's primary UI font) — Latin only, no
          Cyrillic glyphs. This line should render as tofu/boxes, not
          Cyrillic text — that's the expected, correct failure this row is
          checking for
        </Text>
        <Text className="mt-2 font-sans text-[15px] text-ink">
          ёщъыэюя
        </Text>
      </View>

      <View className="mt-8 mb-16 h-px bg-ink/10" />
      <Text className="mb-16 font-mono text-[12px] text-ink/50">
        Pass: every Inter/JetBrains Mono line above is legible, no dropped
        ё, no missing/boxed stress mark, no fallback glyphs. The Poppins row
        is the one intentional exception — it should show broken glyphs.
      </Text>
    </ScrollView>
  );
}
