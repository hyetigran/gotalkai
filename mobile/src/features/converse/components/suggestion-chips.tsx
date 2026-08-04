import * as React from 'react';
import { Pressable, Text, View } from 'react-native';

import { chipOpacityLadder } from '@/components/ui/design-tokens';
import { SUGGESTION_CHIPS } from '../scripted-demo-script';

type SuggestionChipsProps = {
  onPress: () => void;
};

/**
 * README: "Opacity ladder [1, 0.6, 0.36, 0.2] by index — the
 * decaying-contrast scaffold." Any chip advances the script by one
 * exchange; the label itself doesn't determine what gets said next (see
 * `scripted-demo-script.ts`).
 *
 * Touch target note (README "Accessibility"): the chips are visually 34px
 * tall, below the 44px guideline — `hitSlop` widens the hit area without
 * changing the visual size, as the README calls for.
 */
export function SuggestionChips({ onPress }: SuggestionChipsProps) {
  return (
    <View className="min-h-[34px] flex-row flex-wrap justify-center gap-[8px]">
      {SUGGESTION_CHIPS.map((label, index) => (
        <Pressable
          key={label}
          onPress={onPress}
          hitSlop={8}
          style={{ opacity: chipOpacityLadder[index] }}
          className="rounded-full border border-ink/18 bg-white px-[14px] py-[9px]"
        >
          <Text className="font-cyrillic-medium text-[15px] text-ink">{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
