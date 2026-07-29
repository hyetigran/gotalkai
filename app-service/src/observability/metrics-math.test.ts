import {
  computeAbandonmentByLevel,
  computeFalseInterruptionRate,
  computeRepeatRequestRate,
  computeRevealRate,
  isRepeatRequest,
} from './metrics-math';

describe('computeFalseInterruptionRate', () => {
  it('rates interruptions under the 500ms threshold as false, grouped by level', () => {
    const result = computeFalseInterruptionRate([
      { level: '0', interruptedAfterMs: 200 },
      { level: '0', interruptedAfterMs: 800 },
      { level: '1', interruptedAfterMs: 100 },
    ]);
    expect(result).toEqual(expect.arrayContaining([
      { level: '0', falseInterruptionRate: 0.5, totalInterruptions: 2 },
      { level: '1', falseInterruptionRate: 1, totalInterruptions: 1 },
    ]));
  });

  it('returns an empty array when there are no recorded interruptions at all', () => {
    expect(computeFalseInterruptionRate([])).toEqual([]);
  });

  it('a delta exactly at 500ms does not count as false (strictly under, not at-or-under)', () => {
    const result = computeFalseInterruptionRate([{ level: '0', interruptedAfterMs: 500 }]);
    expect(result).toEqual([{ level: '0', falseInterruptionRate: 0, totalInterruptions: 1 }]);
  });
});

describe('computeRevealRate', () => {
  it('computes the fraction of revealed persona turns', () => {
    expect(computeRevealRate([{ revealed: true }, { revealed: false }, { revealed: true }, { revealed: false }])).toBe(0.5);
  });

  it('returns 0 for an empty set rather than NaN', () => {
    expect(computeRevealRate([])).toBe(0);
  });
});

describe('computeAbandonmentByLevel', () => {
  it('averages final turn count per calibration level', () => {
    const result = computeAbandonmentByLevel([
      { sessionId: 'a', level: '0', turnCount: 4 },
      { sessionId: 'b', level: '0', turnCount: 8 },
      { sessionId: 'c', level: '1', turnCount: 20 },
    ]);
    expect(result).toEqual(expect.arrayContaining([
      { level: '0', averageFinalTurnIndex: 6, sessionCount: 2 },
      { level: '1', averageFinalTurnIndex: 20, sessionCount: 1 },
    ]));
  });
});

describe('isRepeatRequest / computeRepeatRequestRate', () => {
  it('recognizes common Russian repeat-request cue phrases', () => {
    expect(isRepeatRequest('Простите, повторите, пожалуйста.')).toBe(true);
    expect(isRepeatRequest('Что?')).toBe(true);
    expect(isRepeatRequest('Ещё раз, пожалуйста.')).toBe(true);
  });

  it('does not flag ordinary conversation as a repeat request', () => {
    expect(isRepeatRequest('Я вчера ходил в магазин.')).toBe(false);
  });

  it('computeRepeatRequestRate is the fraction of learner turns matching a cue phrase', () => {
    const rate = computeRepeatRequestRate([{ content: 'Что?' }, { content: 'Я понял.' }, { content: 'Повтори, пожалуйста.' }, { content: 'Хорошо.' }]);
    expect(rate).toBe(0.5);
  });

  it('returns 0 for an empty set rather than NaN', () => {
    expect(computeRepeatRequestRate([])).toBe(0);
  });
});
