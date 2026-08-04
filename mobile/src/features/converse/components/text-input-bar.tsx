import * as React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

type TextInputBarProps = {
  onSubmit: (text: string) => void;
  disabled?: boolean;
};

/**
 * Ticket #32 AC #1's "screens/interaction pattern designed" — the actual
 * typing surface for text mode. Deliberately plain: a single-line-growing
 * field plus a send button, matching this app's established "printed
 * ink" visual language (rounded-16 white card, ink/accent per the design
 * tokens) rather than a chat-bubble composer, since Converse itself
 * doesn't render a chat-bubble transcript either (PRD §6.2: her line
 * renders as one line, tap-to-reveal — not a scrolling message list).
 *
 * Clears itself after a successful submit; does not manage conversation
 * state at all (that's `use-live-converse-session.ts`'s job) — this
 * component only knows how to turn "the learner typed something and
 * pressed send" into one `onSubmit(text)` call.
 */
export function TextInputBar({ onSubmit, disabled }: TextInputBarProps) {
  const [text, setText] = React.useState('');

  const handleSubmit = React.useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed)
      return;
    onSubmit(trimmed);
    setText('');
  }, [text, onSubmit]);

  const canSubmit = text.trim().length > 0 && !disabled;

  return (
    <View className="flex-row items-end gap-[10px]">
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Type instead of speaking…"
        placeholderTextColor="rgba(0,0,0,0.35)"
        editable={!disabled}
        multiline
        accessibilityLabel="Type your message"
        className="font-cyrillic-medium max-h-[110px] flex-1 rounded-[16px] border border-ink/16 bg-white px-[14px] py-[11px] text-[15px] text-ink"
      />
      <Pressable
        onPress={handleSubmit}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel="Send"
        className={`items-center justify-center rounded-[16px] px-[16px] py-[13px] ${canSubmit ? 'bg-accent' : 'border border-ink/22'}`}
      >
        <Text className={`font-sans-semibold text-[15px] ${canSubmit ? 'text-page' : 'text-ink/40'}`}>Send</Text>
      </Pressable>
    </View>
  );
}
