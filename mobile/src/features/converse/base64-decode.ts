/**
 * Decodes a base64 string to raw bytes. React Native doesn't polyfill
 * `atob` globally (the same reason `pcm-encode.ts` hand-rolls its own
 * base64 *encoder* rather than using `btoa`) — this is the decode
 * counterpart, needed by `use-tts-playback.ts` to write ElevenLabs'
 * base64 MP3 chunks to a real file (`data:` URIs aren't playable on
 * Android — see that file's own comment for why).
 */
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64ToBytes(base64: string): Uint8Array {
  let bitBuffer = 0;
  let bitCount = 0;
  const bytes: number[] = [];
  for (const char of base64) {
    const value = BASE64_CHARS.indexOf(char);
    if (value === -1)
      continue; // skips padding ('=') and any stray whitespace
    bitBuffer = (bitBuffer << 6) | value;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((bitBuffer >> bitCount) & 0xFF);
    }
  }
  return new Uint8Array(bytes);
}
