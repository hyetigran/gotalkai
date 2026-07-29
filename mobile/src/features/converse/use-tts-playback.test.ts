import { act, renderHook } from '@testing-library/react-native';

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

// eslint-disable-next-line import/first -- must follow jest.mock('expo-audio', ...) above
import { toDataUri, useTtsPlayback } from './use-tts-playback';

beforeEach(() => {
  MockPlayer.instances = [];
});

describe('toDataUri', () => {
  it('wraps base64 audio as an MP3 data URI', () => {
    expect(toDataUri('AAAA')).toBe('data:audio/mpeg;base64,AAAA');
  });
});

describe('useTtsPlayback', () => {
  it('plays the first enqueued chunk immediately', () => {
    const { result } = renderHook(() => useTtsPlayback());

    act(() => result.current.enqueue('chunk-0'));

    expect(MockPlayer.instances).toHaveLength(1);
    expect(MockPlayer.instances[0]?.source).toBe(toDataUri('chunk-0'));
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
    expect(MockPlayer.instances[1]?.source).toBe(toDataUri('chunk-1'));
    expect(MockPlayer.instances[1]?.played).toBe(true);
  });

  it('goes idle once the last queued chunk finishes', () => {
    const { result } = renderHook(() => useTtsPlayback());
    act(() => result.current.enqueue('chunk-0'));

    act(() => MockPlayer.instances[0]?.finish());

    expect(result.current.isPlaying).toBe(false);
  });

  it('stopAndClear pauses/removes the current player and drops anything queued', () => {
    const { result } = renderHook(() => useTtsPlayback());
    act(() => result.current.enqueue('chunk-0'));
    act(() => result.current.enqueue('chunk-1'));

    act(() => result.current.stopAndClear());

    expect(MockPlayer.instances[0]?.paused).toBe(true);
    expect(MockPlayer.instances[0]?.removed).toBe(true);
    expect(result.current.isPlaying).toBe(false);

    // The queued second chunk was dropped, not played, by stopAndClear.
    act(() => result.current.enqueue('chunk-2'));
    expect(MockPlayer.instances).toHaveLength(2);
    expect(MockPlayer.instances[1]?.source).toBe(toDataUri('chunk-2'));
  });

  it('stops and clears on unmount', () => {
    const { result, unmount } = renderHook(() => useTtsPlayback());
    act(() => result.current.enqueue('chunk-0'));

    unmount();

    expect(MockPlayer.instances[0]?.paused).toBe(true);
    expect(MockPlayer.instances[0]?.removed).toBe(true);
  });
});
