import { act, renderHook } from '@testing-library/react-native';

import { base64ToBytes } from './base64-decode';

/** Fake player standing in for expo-audio's native-module-backed AudioPlayer, driven directly by the test — createAudioPlayer isn't mocked anywhere else in this repo (use-mic-capture.ts is similarly untested for the same reason: no native-module mock infrastructure exists here), so this test file owns its own minimal fake. */
class MockPlayer {
  static instances: MockPlayer[] = [];
  source: string;
  played = false;
  paused = false;
  removed = false;
  private listener: ((status: { didJustFinish: boolean }) => void) | null = null;

  constructor(source: string) {
    this.source = source;
    MockPlayer.instances.push(this);
  }

  play() {
    this.played = true;
  }

  pause() {
    this.paused = true;
  }

  remove() {
    this.removed = true;
  }

  addListener(_event: 'playbackStatusUpdate', listener: (status: { didJustFinish: boolean }) => void) {
    this.listener = listener;
    return {
      remove: () => {
        this.listener = null;
      },
    };
  }

  finish() {
    this.listener?.({ didJustFinish: true });
  }
}

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn((source: string) => new MockPlayer(source)),
}));

/**
 * Fake standing in for expo-file-system's `File`/`Directory`/`Paths`
 * classes — no native-module mock infrastructure exists for this package
 * in this repo either, same reasoning as the `expo-audio` fake above.
 * Mirrors just enough of the real API (`.uri`, `.exists`, `.write()`,
 * `.delete()`, `.create()`) for `use-tts-playback.ts`'s own usage.
 */
class MockFile {
  static instances: MockFile[] = [];
  uri: string;
  writtenBytes: Uint8Array | null = null;
  exists = true;

  constructor(..._uris: unknown[]) {
    this.uri = `file:///mock-cache/tts-chunks/chunk-${MockFile.instances.length}.mp3`;
    MockFile.instances.push(this);
  }

  write(bytes: Uint8Array) {
    this.writtenBytes = bytes;
  }

  delete() {
    this.exists = false;
  }
}

class MockDirectory {
  exists = true;
  create() {}
}

// Getters, not plain property values: `jest.mock()`'s factory runs before this file's own
// `class MockFile`/`class MockDirectory` declarations below have executed (import hoisting
// runs the triggering `require('expo-file-system')` — via `use-tts-playback.ts`'s own import —
// ahead of this file's other top-level statements), so a plain `Paths: { cache: new
// MockDirectory() }` would call `new` on an as-yet-uninitialized binding. Getters defer that
// evaluation to first real access, by which point the classes below are fully initialized —
// same reasoning the `expo-audio` mock above already relies on via its `jest.fn(() => new
// MockPlayer(...))` closure.
jest.mock('expo-file-system', () => ({
  get File() { return MockFile; },
  get Directory() { return MockDirectory; },
  get Paths() { return { cache: new MockDirectory() }; },
}));

// eslint-disable-next-line import/first -- must follow the jest.mock() calls above
import { useTtsPlayback } from './use-tts-playback';

beforeEach(() => {
  MockPlayer.instances = [];
  MockFile.instances = [];
});

describe('useTtsPlayback', () => {
  it('writes the decoded chunk to a real file and plays it via a file:// URI, not a data: URI', () => {
    const { result } = renderHook(() => useTtsPlayback());

    // "AAAA" is valid base64 (decodes to 3 zero bytes) — the exact bytes don't matter here, only that
    // writing goes through real base64 decoding, not the raw base64 string itself.
    act(() => result.current.enqueue('AAAA'));

    expect(MockFile.instances).toHaveLength(1);
    expect(MockFile.instances[0]?.writtenBytes).toEqual(base64ToBytes('AAAA'));
    expect(MockPlayer.instances).toHaveLength(1);
    expect(MockPlayer.instances[0]?.source).toBe(MockFile.instances[0]?.uri);
    expect(MockPlayer.instances[0]?.source.startsWith('file://')).toBe(true);
    expect(MockPlayer.instances[0]?.played).toBe(true);
    expect(result.current.isPlaying).toBe(true);
  });

  it('queues a second chunk and plays it only once the first finishes, in receipt order', () => {
    const { result } = renderHook(() => useTtsPlayback());

    act(() => result.current.enqueue('chunk-0'));
    act(() => result.current.enqueue('chunk-1'));
    expect(MockPlayer.instances).toHaveLength(1); // second chunk queued, not yet playing

    act(() => MockPlayer.instances[0]?.finish());

    expect(MockPlayer.instances).toHaveLength(2);
    expect(MockPlayer.instances[0]?.removed).toBe(true);
    expect(MockPlayer.instances[1]?.source).toBe(MockFile.instances[1]?.uri);
    expect(MockPlayer.instances[1]?.played).toBe(true);
  });

  it('deletes the temp file once its chunk finishes playing', () => {
    const { result } = renderHook(() => useTtsPlayback());
    act(() => result.current.enqueue('chunk-0'));
    const file = MockFile.instances[0];

    act(() => MockPlayer.instances[0]?.finish());

    expect(file?.exists).toBe(false);
  });

  it('goes idle once the last queued chunk finishes', () => {
    const { result } = renderHook(() => useTtsPlayback());
    act(() => result.current.enqueue('chunk-0'));

    act(() => MockPlayer.instances[0]?.finish());

    expect(result.current.isPlaying).toBe(false);
  });

  it('stopAndClear pauses/removes the current player, deletes its temp file, and drops anything queued', () => {
    const { result } = renderHook(() => useTtsPlayback());
    act(() => result.current.enqueue('chunk-0'));
    act(() => result.current.enqueue('chunk-1'));
    const file = MockFile.instances[0];

    act(() => result.current.stopAndClear());

    expect(MockPlayer.instances[0]?.paused).toBe(true);
    expect(MockPlayer.instances[0]?.removed).toBe(true);
    expect(file?.exists).toBe(false);
    expect(result.current.isPlaying).toBe(false);

    // The queued second chunk was dropped, not played, by stopAndClear.
    act(() => result.current.enqueue('chunk-2'));
    expect(MockPlayer.instances).toHaveLength(2);
  });

  it('stops and clears on unmount', () => {
    const { result, unmount } = renderHook(() => useTtsPlayback());
    act(() => result.current.enqueue('chunk-0'));

    unmount();

    expect(MockPlayer.instances[0]?.paused).toBe(true);
    expect(MockPlayer.instances[0]?.removed).toBe(true);
  });
});
