import { Text, View } from 'react-native';

type RegisterMeterProps = {
  leftLabel: string;
  rightLabel: string;
  /** Dot position along the track, 0-100. */
  dotPercent: number;
  /** Reached entries get an accent dot; next/sealed get a dimmer ink dot. */
  reached: boolean;
};

/**
 * A `5px` track with an `11px` dot positioned by percentage — README:
 * "a `5px` track `rgba(35,31,24,.09)` with an `11px` dot positioned by
 * percentage; axis labels beneath in mono caps `9px`."
 */
export function RegisterMeter({ leftLabel, rightLabel, dotPercent, reached }: RegisterMeterProps) {
  return (
    <View>
      <View className="relative h-[5px] rounded-[3px] bg-ink/9">
        <View
          className={`absolute -mt-[3px] size-[11px] rounded-full ${reached ? 'bg-accent' : 'bg-ink/30'}`}
          style={{ left: `${dotPercent}%`, marginLeft: -5.5 }}
        />
      </View>
      <View className="mt-[8px] flex-row justify-between">
        <Text className="font-mono-medium text-[9px] tracking-[0.08em] text-ink/40 uppercase">{leftLabel}</Text>
        <Text className="font-mono-medium text-[9px] tracking-[0.08em] text-ink/40 uppercase">{rightLabel}</Text>
      </View>
    </View>
  );
}
