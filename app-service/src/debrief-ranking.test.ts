import {
  computeObservationScore,
  computeReadiness,
  READINESS_MASTERY_STABILITY,
  READINESS_MIN_EXPOSURES,
} from './debrief-ranking';

describe('computeReadiness', () => {
  it('is 0 below the exposure floor', () => {
    expect(computeReadiness({ exposures: READINESS_MIN_EXPOSURES - 1, stability: 0.4 })).toBe(0);
    expect(computeReadiness({ exposures: 0, stability: 0.4 })).toBe(0);
  });

  it('is 0 once stability is at or above the mastery ceiling ("far above")', () => {
    expect(computeReadiness({ exposures: 5, stability: READINESS_MASTERY_STABILITY })).toBe(0);
    expect(computeReadiness({ exposures: 5, stability: 0.99 })).toBe(0);
  });

  it('is 1 in the eligible band between the two boundaries', () => {
    expect(computeReadiness({ exposures: READINESS_MIN_EXPOSURES, stability: 0 })).toBe(1);
    expect(computeReadiness({ exposures: 10, stability: READINESS_MASTERY_STABILITY - 0.01 })).toBe(1);
  });
});

describe('computeObservationScore', () => {
  const base = { frequency: 1, impeded: false, readiness: 1, toldRecently: false };

  it('is exactly frequency when every other multiplier is neutral', () => {
    expect(computeObservationScore({ ...base, frequency: 3 })).toBe(3);
  });

  it('doubles the score when the error impeded communication', () => {
    expect(computeObservationScore({ ...base, frequency: 2, impeded: true })).toBe(4);
  });

  it('zeroes the score when readiness is 0', () => {
    expect(computeObservationScore({ ...base, frequency: 5, readiness: 0 })).toBe(0);
  });

  it('cuts the score to 30% when told recently', () => {
    expect(computeObservationScore({ ...base, frequency: 10, toldRecently: true })).toBeCloseTo(3);
  });

  it('a rarer impeding error outranks a more frequent non-impeding one', () => {
    const rareImpeding = computeObservationScore({ frequency: 2, impeded: true, readiness: 1, toldRecently: false });
    const frequentNonImpeding = computeObservationScore({ frequency: 3, impeded: false, readiness: 1, toldRecently: false });
    expect(rareImpeding).toBeGreaterThan(frequentNonImpeding);
  });

  it('composes all four multipliers together', () => {
    const score = computeObservationScore({ frequency: 4, impeded: true, readiness: 1, toldRecently: true });
    expect(score).toBeCloseTo(4 * 2.0 * 1 * 0.3);
  });
});
