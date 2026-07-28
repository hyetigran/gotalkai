/**
 * Converts expo-audio's raw `metering` reading (dBFS — silence is very
 * negative, `0` is max/clipping) into a normalized 0-1 amplitude for the
 * level meter.
 *
 * `SILENCE_FLOOR_DB` is a practical floor, not the recorder's theoretical
 * range (`-160`): typical room noise and mic self-noise rarely register
 * below roughly `-60dB`, so treating everything below that as "silent"
 * avoids the meter reading as permanently near-zero in an ordinary room.
 */
const SILENCE_FLOOR_DB = -60;
const MAX_DB = 0;

export function deriveMeterAmplitude(meteringDb: number): number {
  if (!Number.isFinite(meteringDb))
    return 0;
  const clamped = Math.min(MAX_DB, Math.max(SILENCE_FLOOR_DB, meteringDb));
  return (clamped - SILENCE_FLOOR_DB) / (MAX_DB - SILENCE_FLOOR_DB);
}
