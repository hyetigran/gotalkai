import { formatMonthKey } from './benchmark-trend';

describe('formatMonthKey', () => {
  it('formats a well-formed month key as "Month Year"', () => {
    expect(formatMonthKey('2026-07')).toBe('July 2026');
  });

  it('handles all twelve months', () => {
    expect(formatMonthKey('2026-01')).toBe('January 2026');
    expect(formatMonthKey('2026-12')).toBe('December 2026');
  });

  it('falls back to the raw key for a malformed value rather than throwing', () => {
    expect(formatMonthKey('not-a-month-key')).toBe('not-a-month-key');
    expect(formatMonthKey('2026-13')).toBe('2026-13'); // no 13th month
    expect(formatMonthKey('')).toBe('');
  });
});
