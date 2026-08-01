import {
  computeNextComplicationLevel,
  COMPLICATION_LEVELS,
  selectLeastRecentlyUsedScenario,
  STRUGGLE_DEESCALATE_THRESHOLD,
  SUCCESS_ESCALATE_THRESHOLD,
} from './scenario-selection';

describe('computeNextComplicationLevel', () => {
  it('holds at the previous level when there is no performance signal yet', () => {
    expect(computeNextComplicationLevel({ previousLevel: 1, performanceRate: null })).toBe(1);
  });

  it('escalates by one level after strong success', () => {
    expect(computeNextComplicationLevel({ previousLevel: 0, performanceRate: SUCCESS_ESCALATE_THRESHOLD })).toBe(1);
    expect(computeNextComplicationLevel({ previousLevel: 0, performanceRate: 1 })).toBe(1);
  });

  it('never escalates past the top level', () => {
    expect(computeNextComplicationLevel({ previousLevel: COMPLICATION_LEVELS - 1, performanceRate: 1 })).toBe(COMPLICATION_LEVELS - 1);
  });

  it('de-escalates by one level after struggle', () => {
    expect(computeNextComplicationLevel({ previousLevel: 2, performanceRate: STRUGGLE_DEESCALATE_THRESHOLD - 0.01 })).toBe(1);
  });

  it('never de-escalates below level 0', () => {
    expect(computeNextComplicationLevel({ previousLevel: 0, performanceRate: 0 })).toBe(0);
  });

  it('holds at the previous level for middling performance (neither success nor struggle)', () => {
    expect(computeNextComplicationLevel({ previousLevel: 1, performanceRate: 0.5 })).toBe(1);
  });
});

describe('selectLeastRecentlyUsedScenario', () => {
  it('prefers a never-used scenario over any used one', () => {
    const picked = selectLeastRecentlyUsedScenario([
      { id: 'used', sessionsSinceLastUse: 100 },
      { id: 'never', sessionsSinceLastUse: null },
    ]);
    expect(picked.id).toBe('never');
  });

  it('prefers the scenario with the largest sessions-since-last-use gap', () => {
    const picked = selectLeastRecentlyUsedScenario([
      { id: 'recent', sessionsSinceLastUse: 1 },
      { id: 'stale', sessionsSinceLastUse: 5 },
    ]);
    expect(picked.id).toBe('stale');
  });

  it('breaks ties deterministically by id', () => {
    const first = selectLeastRecentlyUsedScenario([
      { id: 'b', sessionsSinceLastUse: 3 },
      { id: 'a', sessionsSinceLastUse: 3 },
    ]);
    expect(first.id).toBe('a');
  });

  it('throws on an empty candidate list', () => {
    expect(() => selectLeastRecentlyUsedScenario([])).toThrow();
  });
});
