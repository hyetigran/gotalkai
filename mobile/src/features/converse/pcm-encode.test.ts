import { Buffer } from 'node:buffer';

import { downmixToMono, encodeAudioChunk, floatSampleToInt16, pcm16ToBase64 } from './pcm-encode';

describe('floatSampleToInt16', () => {
  it('maps 0 to 0', () => {
    expect(floatSampleToInt16(0)).toBe(0);
  });

  it('maps 1.0 to the positive int16 max', () => {
    expect(floatSampleToInt16(1)).toBe(32767);
  });

  it('maps -1.0 to the negative int16 min', () => {
    expect(floatSampleToInt16(-1)).toBe(-32768);
  });

  it('clamps values outside [-1, 1]', () => {
    expect(floatSampleToInt16(2)).toBe(32767);
    expect(floatSampleToInt16(-2)).toBe(-32768);
  });

  it('scales the midpoint proportionally', () => {
    expect(floatSampleToInt16(0.5)).toBe(16384);
  });
});

describe('downmixToMono', () => {
  it('passes a single channel through unchanged', () => {
    expect(downmixToMono([[0.1, 0.2, 0.3]])).toEqual([0.1, 0.2, 0.3]);
  });

  it('averages two channels sample-by-sample', () => {
    expect(downmixToMono([[1, 0], [0, 1]])).toEqual([0.5, 0.5]);
  });

  it('returns an empty array for no frames', () => {
    expect(downmixToMono([[]])).toEqual([]);
  });

  it('returns an empty array for no channels', () => {
    expect(downmixToMono([])).toEqual([]);
  });
});

describe('pcm16ToBase64', () => {
  it('round-trips through base64 as little-endian int16 bytes', () => {
    const samples = [0, 32767, -32768, -1, 1000];
    const encoded = pcm16ToBase64(samples);
    const decoded = Buffer.from(encoded, 'base64');
    const view = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength);
    const roundTripped = samples.map((_, i) => view.getInt16(i * 2, true));
    expect(roundTripped).toEqual(samples);
  });

  it('produces a byte length of exactly 2x the sample count', () => {
    const encoded = pcm16ToBase64([1, 2, 3, 4, 5]);
    expect(Buffer.from(encoded, 'base64').byteLength).toBe(10);
  });
});

describe('encodeAudioChunk', () => {
  it('downmixes and encodes stereo frames end-to-end', () => {
    // left full-scale positive, right full-scale negative -> mono averages to ~0
    const encoded = encodeAudioChunk([[1, 1], [-1, -1]]);
    const decoded = Buffer.from(encoded, 'base64');
    const view = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength);
    expect(view.getInt16(0, true)).toBe(0);
    expect(view.getInt16(2, true)).toBe(0);
  });

  it('matches pcm16ToBase64 directly for already-mono input', () => {
    const mono = [0.25, -0.25, 0.5];
    const viaEncode = encodeAudioChunk([mono]);
    const viaDirect = pcm16ToBase64(mono.map(floatSampleToInt16));
    expect(viaEncode).toBe(viaDirect);
  });
});
