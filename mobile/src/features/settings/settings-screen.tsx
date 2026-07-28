import type { LanguageId } from './settings-copy';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, Text, View } from 'react-native';

import { SETTINGS_COPY as copy, LANGUAGE_CHOICES } from './settings-copy';

/**
 * The Settings screen. Layout and copy per
 * `Initial mockup request/design_handoff_conversation_loop/README.md`
 * ("6. Settings"). `bg-paper-stepped` matches the Tomorrow screen's
 * background — both are outside the daily loop.
 *
 * Language selection is local component state only for this ticket — real
 * persistence to `learners.ui_language` comes with the backend in a later
 * wave. Nothing else in the app reads this value yet; selecting a language
 * only changes the segmented control's own visual state.
 */
export function SettingsScreen() {
  const router = useRouter();
  const [selectedLanguage, setSelectedLanguage] = React.useState<LanguageId>('en');

  return (
    <View className="flex-1 bg-paper-stepped px-[22px] pt-[60px] pb-[44px]">
      <View className="flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="back">
          <Text className="text-[15px] text-accent">‹</Text>
        </Pressable>
        <Text className="font-serif text-[13px] text-ink/60">{copy.settingsHead}</Text>
        <View className="w-[12px]" />
      </View>

      <Text className="font-mono-medium mt-[30px] text-[10px] tracking-[0.12em] text-ink/42 uppercase">
        {copy.langSection}
      </Text>
      <View className="mt-[12px] flex-row gap-[9px]">
        {LANGUAGE_CHOICES.map((choice) => {
          const isSelected = selectedLanguage === choice.id;
          return (
            <Pressable
              key={choice.id}
              onPress={() => setSelectedLanguage(choice.id)}
              accessibilityRole="button"
              accessibilityLabel={choice.label}
              className={`flex-1 items-center rounded-[13px] px-[10px] py-[13px] ${
                isSelected ? 'bg-accent' : 'border border-ink/16 bg-white'
              }`}
            >
              <Text className={`font-serif text-[17px] ${isSelected ? 'text-paper' : 'text-ink/70'}`}>
                {choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="mt-[14px] text-[13px] leading-[21px] text-ink/55">
        {copy.langNote}
      </Text>

      <Text className="font-mono-medium mt-[34px] text-[10px] tracking-[0.12em] text-ink/42 uppercase">
        {copy.otherSection}
      </Text>
      <View className="mt-[12px] overflow-hidden rounded-[16px] border border-ink/10 bg-white">
        {copy.rows.map((row, index) => (
          <View
            key={row}
            className={`flex-row items-center justify-between gap-[10px] px-[17px] py-[16px] ${
              index === copy.rows.length - 1 ? '' : 'border-b border-ink/7'
            }`}
          >
            <Text className="font-serif text-[16px] text-ink">{row}</Text>
            <Text className="text-[14px] text-ink/30">›</Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={copy.close}
        className="mt-auto items-center rounded-[16px] border border-ink/22 py-[18px]"
      >
        <Text className="font-serif text-[17px] text-ink">{copy.close}</Text>
      </Pressable>
    </View>
  );
}
