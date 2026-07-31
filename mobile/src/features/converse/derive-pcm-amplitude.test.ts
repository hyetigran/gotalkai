import { derivePcmAmplitude } from './derive-pcm-amplitude';

function silentFrame(length: number): number[] {
  return Array.from<number>({ length }).fill(0);
}

function fullScaleFrame(length: number): number[] {
  // A square wave at full scale is the maximum-RMS signal a [-1, 1] PCM
  // stream can carry (RMS === peak here, unlike a sine wave).
  return Array.from({ length }, (_, i) => (i % 2 === 0 ? 1 : -1));
}

describe('derivePcmAmplitude', () => {
  it('returns zero for an empty frame', () => {
    expect(derivePcmAmplitude([])).toBe(0);
  });

  it('maps digital silence (all-zero samples) to zero amplitude', () => {
    expect(derivePcmAmplitude(silentFrame(160))).toBe(0);
  });

  it('maps a full-scale signal to (close to) full amplitude', () => {
    expect(derivePcmAmplitude(fullScaleFrame(160))).toBeCloseTo(1);
  });

  it('is monotonically non-decreasing as signal amplitude increases', () => {
    const scales = [0, 0.001, 0.01, 0.1, 0.5, 1];
    const amplitudes = scales.map(scale => derivePcmAmplitude(Array.from({ length: 160 }, (_, i) => scale * (i % 2 === 0 ? 1 : -1))));
    for (let i = 1; i < amplitudes.length; i += 1) {
      expect(amplitudes[i]).toBeGreaterThanOrEqual(amplitudes[i - 1]);
    }
  });

  it('never returns a value outside [0, 1] regardless of input', () => {
    const frames = [silentFrame(160), fullScaleFrame(160), [2, -2, 5, -5], [Number.NaN, 0.5]];
    for (const frame of frames) {
      const amplitude = derivePcmAmplitude(frame);
      expect(amplitude).toBeGreaterThanOrEqual(0);
      expect(amplitude).toBeLessThanOrEqual(1);
    }
  });
});
