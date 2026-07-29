/**
 * Pure conversion from float PCM frames (-1.0 to 1.0, expo-audio's
 * convention) to the mono 16-bit PCM base64 wire format
 * voice-service/src/messages.ts's `audio_chunk` expects.
 *
 * Nothing calls this yet. `expo-audio`'s `AudioRecorder` (verified
 * directly against node_modules/expo-audio/build/AudioModule.types.d.ts)
 * has no live-streaming API — `setAudioSamplingEnabled`/`audioSampleUpdate`
 * belong to `AudioPlayer` (playback visualization) only, and the recorder
 * only ever produces a file via record()/stop(). There is currently no
 * real source of live float frames on the client — see docs/adr/0017 for
 * why mic capture is a disclosed stub in this ticket. This module is pure,
 * real, and unit-tested regardless, ready for whatever eventually supplies
 * frames (a native module, or a future revisit of this decision).
 *
 * React Native doesn't polyfill `btoa` globally, so base64 encoding is
 * hand-rolled here rather than pulling in a dependency for ~15 lines.
 */

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** One channel's frames per array; all channels must be the same length (expo-audio's own `AudioSample.channels` convention). */
export function downmixToMono(channels: readonly number[][]): number[] {
  const frameCount = channels[0]?.length ?? 0;
  const mono = Array.from<number>({ length: frameCount });
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (const channel of channels) sum += channel[i] ?? 0;
    mono[i] = channels.length > 0 ? sum / channels.length : 0;
  }
  return mono;
}

/** Clamps to [-1, 1] before scaling, since upstream float sources aren't guaranteed to stay in range. */
export function floatSampleToInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF);
}

function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    result += BASE64_CHARS[b0 >> 2];
    result += BASE64_CHARS[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    result += b1 === undefined ? '=' : BASE64_CHARS[((b1 & 0x0F) << 2) | ((b2 ?? 0) >> 6)];
    result += b2 === undefined ? '=' : BASE64_CHARS[b2 & 0x3F];
  }
  return result;
}

/** Little-endian, matching voice-service/src/server.ts's `decodePcm16` (`Int16Array` over raw `Buffer` bytes). */
export function pcm16ToBase64(samples: readonly number[]): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, i) => view.setInt16(i * 2, sample, true));
  return bytesToBase64(bytes);
}

/** End-to-end: multi-channel float frames in, `audio_chunk`-ready base64 out. */
export function encodeAudioChunk(channels: readonly number[][]): string {
  const mono = downmixToMono(channels);
  const int16 = mono.map(floatSampleToInt16);
  return pcm16ToBase64(int16);
}
