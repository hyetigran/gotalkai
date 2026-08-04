import type { SessionSummary } from './api';
import { formatSessionMeta } from './format-session-meta';

const BASE: SessionSummary = {
  totalTurns: 14,
  personaTurns: 8,
  learnerTurns: 6,
  revealedCount: 3,
  understoodCount: 11,
  startedAt: '2026-01-01T00:00:00.000Z',
  endedAt: '2026-01-01T00:08:12.000Z',
};

describe('formatSessionMeta', () => {
  it('matches debrief-fixture.ts\'s own copy shape: "X min Y s · N turns · she spoke P%"', () => {
    expect(formatSessionMeta(BASE)).toBe('8 min 12 s · 14 turns · she spoke 57%');
  });

  it('omits the duration segment (not "0 min 0 s") when endedAt is null', () => {
    expect(formatSessionMeta({ ...BASE, endedAt: null })).toBe('14 turns · she spoke 57%');
  });

  it('rounds the spoken percentage to the nearest whole number', () => {
    expect(formatSessionMeta({ ...BASE, totalTurns: 3, personaTurns: 1, endedAt: null })).toBe('3 turns · she spoke 33%');
  });

  it('reports 0% spoken for a session with no turns yet, without dividing by zero', () => {
    expect(formatSessionMeta({ ...BASE, totalTurns: 0, personaTurns: 0, endedAt: null })).toBe('0 turns · she spoke 0%');
  });

  it('rounds seconds under a full minute correctly', () => {
    expect(formatSessionMeta({ ...BASE, startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-01T00:00:45.000Z' })).toBe('0 min 45 s · 14 turns · she spoke 57%');
  });
});
