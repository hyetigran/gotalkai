import { deriveMeterAmplitude } from './derive-meter-amplitude';

/**
 * Avoids `Math.log10(0) === -Infinity` for genuine digital silence (an
 * all-zero frame, e.g. before the mic has picked up any real sound) —
 * clamping the RMS floor here, rather than special-casing `-Infinity`
 * downstream, keeps `deriveMeterAmplitude` untouched and reusable as-is.
 */
const SILENCE_RMS_FLOOR = 1e-6;

/**
 * Level-meter amplitude for the live pipeline's native PCM capture
 * (docs/adr/0023) — the counterpart to `deriveMeterAmplitude`, which
 * expects `expo-audio`'s own dBFS metering reading instead. Deliberately
 * NOT a second, independently-calibrated 0-1 scale: this converts raw
 * float samples to an RMS-derived dBFS value first, then feeds that
 * through the exact same `deriveMeterAmplitude` floor/ceiling
 * (`SILENCE_FLOOR_DB`/`MAX_DB`) the scripted-demo meter already uses, so
 * the meter reads consistently regardless of which capture path is
 * driving it.
 *
 * Exists so the live Converse screen can drive its level meter off
 * `useNativePcmCapture`'s own real frames instead of also running
 * `useMicCapture` (a second, separate `expo-audio` recorder) — two
 * concurrent Android audio-capture sessions competing for the mic is a
 * real, avoidable risk this sidesteps entirely rather than leaving
 * unverified.
 */
export function derivePcmAmplitude(samples: readonly number[]): number {
  if (samples.length === 0)
    return 0;
  let sumOfSquares = 0;
  for (const sample of samples) sumOfSquares += sample * sample;
  const rms = Math.sqrt(sumOfSquares / samples.length);
  const dBFS = 20 * Math.log10(Math.max(rms, SILENCE_RMS_FLOOR));
  return deriveMeterAmplitude(dBFS);
}
