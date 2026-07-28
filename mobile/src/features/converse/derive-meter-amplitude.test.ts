import { deriveMeterAmplitude } from './derive-meter-amplitude';

describe('deriveMeterAmplitude', () => {
  it('maps 0dB (max/clipping) to full amplitude', () => {
    expect(deriveMeterAmplitude(0)).toBe(1);
  });

  it('maps the silence floor (-60dB) to zero amplitude', () => {
    expect(deriveMeterAmplitude(-60)).toBe(0);
  });

  it('maps the midpoint (-30dB) to half amplitude', () => {
    expect(deriveMeterAmplitude(-30)).toBeCloseTo(0.5);
  });

  it('clamps values below the silence floor to zero', () => {
    expect(deriveMeterAmplitude(-160)).toBe(0);
    expect(deriveMeterAmplitude(-90)).toBe(0);
  });

  it('clamps values above 0dB to full amplitude', () => {
    expect(deriveMeterAmplitude(6)).toBe(1);
  });

  it('treats non-finite readings as silence rather than throwing', () => {
    expect(deriveMeterAmplitude(Number.NaN)).toBe(0);
    expect(deriveMeterAmplitude(Number.POSITIVE_INFINITY)).toBe(0);
    expect(deriveMeterAmplitude(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('is monotonically non-decreasing as dB increases', () => {
    const samples = [-60, -50, -40, -30, -20, -10, 0];
    const amplitudes = samples.map(deriveMeterAmplitude);
    for (let i = 1; i < amplitudes.length; i += 1) {
      expect(amplitudes[i]).toBeGreaterThanOrEqual(amplitudes[i - 1]);
    }
  });
});
