import { Text, View } from 'react-native';

type DifficultyDialProps = {
  label: string;
  /** Out of 5. */
  value: number;
  /** Reached entries get a full-strength accent fill; next/sealed get the dimmer tint. */
  reached: boolean;
};

/**
 * One of the three difficulty dials (PRD §5.2) — README: "label column
 * `96px` mono `9px`, then a `4px` track with `#A0543A` fill (or
 * `rgba(160,84,58,0.42)` when sealed)."
 */
export function DifficultyDial({ label, value, reached }: DifficultyDialProps) {
  return (
    <View className="flex-row items-center gap-[10px]">
      <Text className="font-mono-medium w-[96px] text-[9px] tracking-[0.04em] text-ink/45">{label}</Text>
      <View className="h-[4px] flex-1 overflow-hidden rounded-[3px] bg-ink/9">
        <View
          className={`h-full rounded-[3px] ${reached ? 'bg-accent' : 'bg-accent/42'}`}
          style={{ width: `${(value / 5) * 100}%` }}
        />
      </View>
    </View>
  );
}
