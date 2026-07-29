import type { BenchmarkTrendEntry } from '../api';
import { Text, View } from 'react-native';

import { BenchmarkTrend } from './benchmark-trend';

type BenchmarkResultProps = {
  correctCount: number;
  totalCount: number;
  trendEntries: BenchmarkTrendEntry[];
  isTrendLoading: boolean;
};

/** Post-submission view: this attempt's score plus the chronological trend — extracted from benchmark-screen.tsx to keep the screen component under the line-count limit. */
export function BenchmarkResult({ correctCount, totalCount, trendEntries, isTrendLoading }: BenchmarkResultProps) {
  return (
    <View>
      <Text className="mb-[8px] font-serif text-[27px] leading-[35px] text-ink">
        {correctCount}
        {' of '}
        {totalCount}
        {' understood'}
      </Text>
      <Text className="mb-[24px] text-[14px] leading-[21px] text-ink/55">
        Ability, not attendance — this is tracked over time, not a single score.
      </Text>
      <BenchmarkTrend entries={trendEntries} isLoading={isTrendLoading} />
    </View>
  );
}
