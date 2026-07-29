import { GOLDEN_SET } from './golden-set';
import { getCanarySet } from './canary';

describe('getCanarySet', () => {
  it('returns exactly five entries, per PRD §11\'s "~$0.20/day budget"', () => {
    expect(getCanarySet()).toHaveLength(5);
  });

  it('every returned entry is a real, unmodified GOLDEN_SET entry (same object reference)', () => {
    const canarySet = getCanarySet();
    for (const entry of canarySet)
      expect(GOLDEN_SET).toContain(entry);
  });

  it('includes at least one clean-input entry, so no_false_recast — PRD\'s "single most important assertion" — is actually exercised', () => {
    const canarySet = getCanarySet();
    expect(canarySet.some(entry => !entry.shouldRecast)).toBe(true);
  });

  it('returns the same five entries on every call — a fixed subset, not a random sample', () => {
    expect(getCanarySet().map(entry => entry.id)).toEqual(getCanarySet().map(entry => entry.id));
  });
});
