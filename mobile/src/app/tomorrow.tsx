import { Text, View } from 'react-native';

/**
 * Placeholder only — the real Tomorrow screen is ticket #6. This exists
 * solely so Debrief's "Tomorrow" CTA (ticket #5) has a real route to
 * navigate to instead of hitting expo-router's unmatched-route fallback.
 * Ticket #6 replaces this file's contents entirely.
 */
export default function TomorrowPlaceholder() {
  return (
    <View className="flex-1 items-center justify-center bg-paper-stepped px-[22px]">
      <Text className="text-center text-[15px] text-ink/55">
        Tomorrow screen — ticket #6
      </Text>
    </View>
  );
}
