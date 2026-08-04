import type { BenchmarkTrendEntry } from '../api';
import { Text, View } from 'react-native';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** `'2026-07'` -> `'July 2026'`. Falls back to the raw key for anything not matching the expected shape, rather than throwing on a malformed value. */
export function formatMonthKey(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match)
    return monthKey;
  const [, year, month] = match;
  const monthName = MONTH_NAMES[Number(month) - 1];
  return monthName ? `${monthName} ${year}` : monthKey;
}

type BenchmarkTrendProps = {
  entries: BenchmarkTrendEntry[];
  isLoading: boolean;
};

/**
 * Plain chronological counts, not a chart or percentage — docs/adr/0018:
 * the one existing progress surface in this app (address book) is
 * "deliberately not a chart or coverage map", and PRD §6.2's
 * no-streak/no-grade stance sits right next to the benchmark section.
 * Oldest first, so "climbing over time" reads top-to-bottom as improvement.
 */
export function BenchmarkTrend({ entries, isLoading }: BenchmarkTrendProps) {
  if (isLoading)
    return <Text className="text-[13px] text-ink/55">Loading your history…</Text>;

  if (entries.length === 0) {
    return (
      <Text className="text-[13px] text-ink/55">
        This is your first benchmark — come back next month to see it climb.
      </Text>
    );
  }

  return (
    <View className="overflow-hidden rounded-[16px] border border-ink/10 bg-white">
      {entries.map((entry, index) => (
        <View
          key={entry.attemptId}
          className={`flex-row items-center justify-between gap-[10px] px-[17px] py-[14px] ${
            index === entries.length - 1 ? '' : 'border-b border-ink/7'
          }`}
        >
          <Text className="font-sans-medium text-[15px] text-ink/70">{formatMonthKey(entry.monthKey)}</Text>
          <Text className="font-mono-medium text-[13px] text-ink">
            {entry.correctCount}
            {' / '}
            {entry.totalCount}
          </Text>
        </View>
      ))}
    </View>
  );
}
