// Type-only — erased at compile time, so it never triggers a `require()`
// of its own and can't interfere with the mock below.
import type * as UseHoldToTalkModule from './use-hold-to-talk';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { Platform } from 'react-native';

/** Same fake shape as use-native-pcm-capture.test.ts's own — see that file's header comment for why this is mockable at all (a native module this codebase wrote, not a third-party one). */
function createMockNativeModule() {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  return {
    sampleRateHz: 16000,
    startCapture: jest.fn(() => Promise.resolve()),
    stopCapture: jest.fn(() => Promise.resolve()),
    hasRecordAudioPermission: jest.fn(() => true),
    addListener: jest.fn((event: string, listener: (payload: unknown) => void) => {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
      return {
        remove: () => {
          listeners.get(event)?.delete(listener);
        },
      };
    }),
    emit: (event: string, payload: unknown) => {
      listeners.get(event)?.forEach(listener => listener(payload));
    },
  };
}

const mockNativeModule = createMockNativeModule();

const mockRequestRecordingPermissionsAsync = jest.fn(() => Promise.resolve({ granted: true }));
jest.mock('expo-audio', () => ({
  requestRecordingPermissionsAsync: () => mockRequestRecordingPermissionsAsync(),
}));

// Relative path — see use-native-pcm-capture.ts's import comment for why
// (`jest.mock` on a relative-path target doesn't reliably intercept a
// same-file ES `import` of that path in this toolchain).
jest.mock('../../../modules/expo-live-pcm-capture', () => ({
  get ExpoLivePcmCaptureModule() { return mockNativeModule; },
}));

// Pulled in via `require`, not `import` — same reasoning as
// use-native-pcm-capture.test.ts's own (a same-file `jest.mock` +
// `import` of the mocked relative path returns `undefined` in this
// toolchain; verified there, not re-verified here).
const { useHoldToTalk } = require('./use-hold-to-talk') as typeof UseHoldToTalkModule;

const originalPlatformOs = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  mockNativeModule.startCapture.mockImplementation(() => Promise.resolve());
  mockNativeModule.stopCapture.mockImplementation(() => Promise.resolve());
  mockRequestRecordingPermissionsAsync.mockImplementation(() => Promise.resolve({ granted: true }));
  Platform.OS = 'android';
});

afterEach(() => {
  Platform.OS = originalPlatformOs;
});

describe('useHoldToTalk', () => {
  it('onPressIn starts native capture; real frames are sent with commit: false', async () => {
    const sendAudioChunk = jest.fn();
    const { result } = renderHook(() => useHoldToTalk({ canTalk: true, sendAudioChunk }));

    act(() => result.current.onPressIn());
    await waitFor(() => expect(mockNativeModule.startCapture).toHaveBeenCalledTimes(1));
    expect(result.current.pressed).toBe(true);

    act(() => mockNativeModule.emit('onAudioFrame', { samples: [0.5, -0.5], sampleRateHz: 16000 }));

    expect(sendAudioChunk).toHaveBeenCalledWith(expect.any(String), 16000, false);
  });

  it('onPressOut sends one synthetic empty commit: true chunk and stops capture, regardless of native frame timing', async () => {
    const sendAudioChunk = jest.fn();
    const { result } = renderHook(() => useHoldToTalk({ canTalk: true, sendAudioChunk }));

    act(() => result.current.onPressIn());
    await waitFor(() => expect(mockNativeModule.startCapture).toHaveBeenCalledTimes(1));

    act(() => result.current.onPressOut());

    expect(sendAudioChunk).toHaveBeenLastCalledWith('', 16000, true);
    expect(result.current.pressed).toBe(false);
    await waitFor(() => expect(mockNativeModule.stopCapture).toHaveBeenCalled());
  });

  it('onPressIn is a no-op while canTalk is false — the button is disabled while she is speaking or generating a reply (PRD §7.9)', () => {
    const sendAudioChunk = jest.fn();
    const { result } = renderHook(() => useHoldToTalk({ canTalk: false, sendAudioChunk }));

    act(() => result.current.onPressIn());

    expect(result.current.pressed).toBe(false);
    expect(mockNativeModule.startCapture).not.toHaveBeenCalled();
  });

  it('a second onPressIn while already pressed is a no-op — does not restart capture or double-fire anything', async () => {
    const sendAudioChunk = jest.fn();
    const { result } = renderHook(() => useHoldToTalk({ canTalk: true, sendAudioChunk }));

    act(() => result.current.onPressIn());
    await waitFor(() => expect(mockNativeModule.startCapture).toHaveBeenCalledTimes(1));

    act(() => result.current.onPressIn());

    expect(mockNativeModule.startCapture).toHaveBeenCalledTimes(1);
  });

  it('onPressOut while not pressed is a no-op — no spurious commit chunk from e.g. a stray pointerleave', () => {
    const sendAudioChunk = jest.fn();
    const { result } = renderHook(() => useHoldToTalk({ canTalk: true, sendAudioChunk }));

    act(() => result.current.onPressOut());

    expect(sendAudioChunk).not.toHaveBeenCalled();
  });

  it('auto-releases after MAX_HOLD_MS — a client-side backstop ahead of the server\'s own, so the button visibly releases instead of the server silently cutting the stream', async () => {
    jest.useFakeTimers();
    try {
      const sendAudioChunk = jest.fn();
      const { result } = renderHook(() => useHoldToTalk({ canTalk: true, sendAudioChunk }));

      act(() => result.current.onPressIn());
      await waitFor(() => expect(mockNativeModule.startCapture).toHaveBeenCalledTimes(1));

      act(() => jest.advanceTimersByTime(55_000));

      expect(result.current.pressed).toBe(false);
      expect(sendAudioChunk).toHaveBeenLastCalledWith('', 16000, true);
    }
    finally {
      jest.useRealTimers();
    }
  });

  it('an explicit release before the auto-release deadline cancels it — no late, spurious second commit', async () => {
    jest.useFakeTimers();
    try {
      const sendAudioChunk = jest.fn();
      const { result } = renderHook(() => useHoldToTalk({ canTalk: true, sendAudioChunk }));

      act(() => result.current.onPressIn());
      await waitFor(() => expect(mockNativeModule.startCapture).toHaveBeenCalledTimes(1));
      act(() => result.current.onPressOut());
      sendAudioChunk.mockClear();

      act(() => jest.advanceTimersByTime(55_000));

      expect(sendAudioChunk).not.toHaveBeenCalled();
    }
    finally {
      jest.useRealTimers();
    }
  });

  it('exposes live amplitude from the underlying capture while pressed', async () => {
    const sendAudioChunk = jest.fn();
    const { result } = renderHook(() => useHoldToTalk({ canTalk: true, sendAudioChunk }));

    act(() => result.current.onPressIn());
    await waitFor(() => expect(mockNativeModule.startCapture).toHaveBeenCalledTimes(1));
    act(() => mockNativeModule.emit('onAudioFrame', { samples: [1, -1, 1, -1], sampleRateHz: 16000 }));

    expect(result.current.amplitude).toBeGreaterThan(0);
  });
});
