import { shouldSampleSession } from './audio-sampling';

describe('shouldSampleSession', () => {
  it('never samples without consent, regardless of sample rate or randomness', () => {
    // rate 1 would sample every consenting session — consent is what gates it.
    expect(shouldSampleSession(false, 1, () => 0)).toBe(false);
  });

  it('samples deterministically against the injected random source once consent is given', () => {
    expect(shouldSampleSession(true, 0.03, () => 0.02)).toBe(true);
    expect(shouldSampleSession(true, 0.03, () => 0.5)).toBe(false);
  });

  it('the real (uninjected) sampling rate lands within the 2-5% band over many trials (ticket #31 AC #2)', () => {
    const trials = 50_000;
    const sampleRate = 0.03;
    let sampled = 0;
    for (let i = 0; i < trials; i++) {
      if (shouldSampleSession(true, sampleRate))
        sampled++;
    }
    const empiricalRate = sampled / trials;
    // Not all, not none (the AC's own framing) — and close enough to the
    // configured 3% to prove this is a real sample, not a fixed constant.
    expect(empiricalRate).toBeGreaterThan(0.02);
    expect(empiricalRate).toBeLessThan(0.05);
  });
});
