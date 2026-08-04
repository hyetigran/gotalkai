import type { InputMode } from '@/features/converse/use-live-converse-session';
import { Pressable, Text, View } from 'react-native';

type InputModeToggleProps = {
  mode: InputMode;
  onChange: (mode: InputMode) => void;
};

/**
 * Ticket #32 AC #2: "switchable per session... rather than a permanent
 * account-level setting" — a small in-conversation toggle, not a
 * settings-screen switch, so a learner can drop into text mode mid-day
 * (e.g. a quiet room) without leaving Converse. No mockup exists for
 * this (PRD §12.3: "not yet designed") — two pill buttons matching the
 * existing suggestion-chip/hold-button visual language (rounded-full,
 * ink/accent per this app's established design tokens) is the interaction
 * pattern chosen here.
 */
export function InputModeToggle({ mode, onChange }: InputModeToggleProps) {
  return (
    <View className="flex-row gap-[8px]">
      <Pressable
        onPress={() => onChange('voice')}
        accessibilityRole="button"
        accessibilityLabel="Voice mode"
        accessibilityState={{ selected: mode === 'voice' }}
        className={`rounded-full px-[14px] py-[8px] ${mode === 'voice' ? 'bg-accent' : 'border border-ink/18 bg-white'}`}
      >
        <Text className={`font-sans-semibold text-[11px] ${mode === 'voice' ? 'text-page' : 'text-ink/60'}`}>Voice</Text>
      </Pressable>
      <Pressable
        onPress={() => onChange('text')}
        accessibilityRole="button"
        accessibilityLabel="Text mode"
        accessibilityState={{ selected: mode === 'text' }}
        className={`rounded-full px-[14px] py-[8px] ${mode === 'text' ? 'bg-accent' : 'border border-ink/18 bg-white'}`}
      >
        <Text className={`font-sans-semibold text-[11px] ${mode === 'text' ? 'text-page' : 'text-ink/60'}`}>Text</Text>
      </Pressable>
    </View>
  );
}
