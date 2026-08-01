import { CALIBRATION_VARIANTS, DEFAULT_CALIBRATION_VARIANT, getDialDefaults } from './calibration-profiles';

describe('getDialDefaults', () => {
  it('has an entry for every declared CalibrationVariant', () => {
    for (const variant of CALIBRATION_VARIANTS)
      expect(getDialDefaults(variant)).toBeDefined();
  });

  it('partner_learner matches Валентина\'s own already-committed fixture dials [2, 2, 1]', () => {
    expect(getDialDefaults('partner_learner')).toEqual({ comprehensionLoad: 2, productionDemand: 2, repairBehaviour: 1 });
  });

  it('heritage_speaker: comprehension load is higher and production demand is lower than partner_learner — the "listens well, produces little" signature, not a uniform difficulty bump', () => {
    const partnerLearner = getDialDefaults('partner_learner');
    const heritage = getDialDefaults('heritage_speaker');

    expect(heritage.comprehensionLoad).toBeGreaterThan(partnerLearner.comprehensionLoad);
    expect(heritage.productionDemand).toBeLessThan(partnerLearner.productionDemand);
  });

  it('every dial value is within PRD §5.2\'s 1-5 range', () => {
    for (const variant of CALIBRATION_VARIANTS) {
      const dials = getDialDefaults(variant);
      for (const value of Object.values(dials)) {
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(5);
      }
    }
  });
});

describe('DEFAULT_CALIBRATION_VARIANT', () => {
  it('is partner_learner — every learner\'s default until onboarding/settings says otherwise', () => {
    expect(DEFAULT_CALIBRATION_VARIANT).toBe('partner_learner');
  });
});
