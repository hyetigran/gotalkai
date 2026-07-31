import { Buffer } from 'node:buffer';
import { base64ToBytes } from './base64-decode';

function bytesToAscii(bytes: Uint8Array): string {
  return Array.from(bytes, byte => String.fromCharCode(byte)).join('');
}

describe('base64ToBytes', () => {
  it('decodes a standard padded base64 string', () => {
    // "SGVsbG8=" is the standard base64 encoding of "Hello".
    expect(bytesToAscii(base64ToBytes('SGVsbG8='))).toBe('Hello');
  });

  it('decodes a base64 string with no padding needed (length already a multiple of 4)', () => {
    // "SGVsbG8h" decodes to "Hello!" — 6 bytes, evenly divides into base64 quartets.
    expect(bytesToAscii(base64ToBytes('SGVsbG8h'))).toBe('Hello!');
  });

  it('decodes a base64 string with double padding', () => {
    // "SGk=" decodes to "Hi" (2 bytes -> one partial quartet with '=' padding).
    expect(bytesToAscii(base64ToBytes('SGk='))).toBe('Hi');
  });

  it('returns an empty array for an empty string', () => {
    expect(base64ToBytes('')).toEqual(new Uint8Array(0));
  });

  it('produces the exact byte length implied by the input (no off-by-one padding artifacts)', () => {
    const decoded = base64ToBytes('SGVsbG8=');
    expect(decoded.length).toBe(5); // "Hello" is 5 bytes
  });

  it('round-trips arbitrary byte values, including ones outside printable ASCII', () => {
    // Base64 of the byte sequence [0, 127, 255, 16, 200] — computed via a known-correct
    // encoder (Node's own Buffer, at test-authoring time, not at runtime).
    const base64 = Buffer.from([0, 127, 255, 16, 200]).toString('base64');
    expect(Array.from(base64ToBytes(base64))).toEqual([0, 127, 255, 16, 200]);
  });
});
