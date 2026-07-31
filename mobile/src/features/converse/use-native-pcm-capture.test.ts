// Type-only — erased at compile time, so it never triggers a `require()`
// of its own and can't interfere with the mock below.
import type * as UseNativePcmCaptureModule from './use-native-pcm-capture';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { Platform } from 'react-native';

/**
 * Fake standing in for the `expo-live-pcm-capture` native module. Unlike
 * `use-mic-capture.ts` (untested — no native-module mock infrastructure
 * exists anywhere in this repo for `expo-audio`, per
 * `use-tts-playback.test.ts`'s own comment), this hook's native module is
 * one this same ticket wrote, so its whole JS-side shape (three methods
 * plus an event emitter) is fully known — mockable the same way
 * `use-tts-playback.test.ts` fakes `createAudioPlayer`. This only tests
 * the hook's lifecycle logic against that fake; the Kotlin/`AudioRecord`
 * side has no equivalent test — see `ExpoLivePcmCaptureModule.kt` and
 * `use-native-pcm-capture.ts`'s header comments for what's unverified
 * there (no physical Android device available in this environment).
 */
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
    listenerCount: (event: string) => listeners.get(event)?.size ?? 0,
  };
}

const mockNativeModule = createMockNativeModule();

// Relative path, not the (nonexistent) `@modules` alias — see
// use-native-pcm-capture.ts's import comment for why (an earlier alias
// attempt didn't survive contact with Jest's moduleNameMapper).
jest.mock('../../../modules/expo-live-pcm-capture', () => ({
  ExpoLivePcmCaptureModule: mockNativeModule,
}));

// Pulled in via `require`, not `import`, deliberately: empirically
// verified in this exact toolchain (jest-expo + this babel.config.js) —
// `jest.mock()` on a *relative-path* target does not reliably intercept
// a subsequent ES `import` of that same path (in this file or
// transitively), even though the identical mock reliably intercepts
// `require()`, and reliably intercepts ES `import` when the mocked
// specifier is a bare package name instead (see
// `use-tts-playback.test.ts`'s `jest.mock('expo-audio', ...)`, which
// doesn't hit this). Root-caused via a minimal repro (a same-file
// `jest.mock('./sibling', ...)` + `import { x } from './sibling'` returns
// `undefined` for `x`) before reaching for this workaround — not a guess.

const { useNativePcmCapture } = require('./use-native-pcm-capture') as typeof UseNativePcmCaptureModule;

const originalPlatformOs = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  mockNativeModule.startCapture.mockImplementation(() => Promise.resolve());
  mockNativeModule.stopCapture.mockImplementation(() => Promise.resolve());
  mockNativeModule.hasRecordAudioPermission.mockImplementation(() => true);
});

afterEach(() => {
  Platform.OS = originalPlatformOs;
});

describe('useNativePcmCapture', () => {
  it('reports unsupported and never touches the native module on a non-Android platform', () => {
    Platform.OS = 'ios';
    const { result } = renderHook(() => useNativePcmCapture({ enabled: true, onChunk: jest.fn() }));

    expect(result.current.isSupported).toBe(false);
    expect(mockNativeModule.startCapture).not.toHaveBeenCalled();
  });

  it('starts capture when enabled on Android', async () => {
    Platform.OS = 'android';
    const { result } = renderHook(() => useNativePcmCapture({ enabled: true, onChunk: jest.fn() }));

    await waitFor(() => expect(result.current.isCapturing).toBe(true));

    expect(mockNativeModule.startCapture).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('does not start capture when enabled is false', () => {
    Platform.OS = 'android';
    renderHook(() => useNativePcmCapture({ enabled: false, onChunk: jest.fn() }));

    expect(mockNativeModule.startCapture).not.toHaveBeenCalled();
  });

  it('stops capture when enabled flips from true to false', async () => {
    Platform.OS = 'android';
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useNativePcmCapture({ enabled, onChunk: jest.fn() }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.isCapturing).toBe(true));

    rerender({ enabled: false });

    await waitFor(() => expect(result.current.isCapturing).toBe(false));
    expect(mockNativeModule.stopCapture).toHaveBeenCalledTimes(1);
  });

  it('stops capture on unmount', async () => {
    Platform.OS = 'android';
    const { result, unmount } = renderHook(() => useNativePcmCapture({ enabled: true, onChunk: jest.fn() }));
    await waitFor(() => expect(result.current.isCapturing).toBe(true));
    mockNativeModule.stopCapture.mockClear();

    unmount();

    expect(mockNativeModule.stopCapture).toHaveBeenCalled();
  });

  it('encodes an emitted onAudioFrame via pcm-encode.ts and passes it to onChunk', async () => {
    Platform.OS = 'android';
    const onChunk = jest.fn();
    const { result } = renderHook(() => useNativePcmCapture({ enabled: true, onChunk }));
    await waitFor(() => expect(result.current.isCapturing).toBe(true));

    act(() => {
      mockNativeModule.emit('onAudioFrame', { samples: [0, 0.5, -0.5], sampleRateHz: 16000 });
    });

    expect(onChunk).toHaveBeenCalledTimes(1);
    const [pcmBase64, sampleRateHz] = onChunk.mock.calls[0] as [string, number];
    expect(sampleRateHz).toBe(16000);
    expect(typeof pcmBase64).toBe('string');
    expect(pcmBase64.length).toBeGreaterThan(0);
  });

  it('fails loudly via onError when the native module rejects startCapture (e.g. permission missing) — does not silently no-op', async () => {
    Platform.OS = 'android';
    mockNativeModule.startCapture.mockImplementation(() =>
      Promise.reject(new Error('RECORD_AUDIO permission has not been granted.')));
    const onError = jest.fn();

    const { result } = renderHook(() => useNativePcmCapture({ enabled: true, onChunk: jest.fn(), onError }));
    await waitFor(() => expect(onError).toHaveBeenCalled());

    expect(result.current.isCapturing).toBe(false);
    expect(result.current.error).toContain('RECORD_AUDIO permission');
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('RECORD_AUDIO permission'));
  });

  it('does not surface the benign "already running" race as a user-facing error', async () => {
    Platform.OS = 'android';
    mockNativeModule.startCapture.mockImplementation(() =>
      Promise.reject(new Error('startCapture() was called while a capture session was already running.')));
    const onError = jest.fn();

    const { result } = renderHook(() => useNativePcmCapture({ enabled: true, onChunk: jest.fn(), onError }));
    await waitFor(() => expect(mockNativeModule.startCapture).toHaveBeenCalled());

    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('surfaces a mid-capture onCaptureError event and flips isCapturing off', async () => {
    Platform.OS = 'android';
    const onError = jest.fn();
    const { result } = renderHook(() => useNativePcmCapture({ enabled: true, onChunk: jest.fn(), onError }));
    await waitFor(() => expect(result.current.isCapturing).toBe(true));

    act(() => {
      mockNativeModule.emit('onCaptureError', { message: 'AudioRecord.read() returned error code -3' });
    });

    expect(result.current.isCapturing).toBe(false);
    expect(result.current.error).toContain('AudioRecord.read()');
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('AudioRecord.read()'));
  });
});

// Sibling describe, not nested — keeps each describe callback under the max-lines-per-function limit.
describe('useNativePcmCapture amplitude (docs/adr/0026)', () => {
  it('derives amplitude from each emitted frame via derivePcmAmplitude, and resets it to zero on stop', async () => {
    Platform.OS = 'android';
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useNativePcmCapture({ enabled, onChunk: jest.fn() }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.isCapturing).toBe(true));
    expect(result.current.amplitude).toBe(0);

    act(() => {
      mockNativeModule.emit('onAudioFrame', { samples: [1, -1, 1, -1], sampleRateHz: 16000 });
    });
    expect(result.current.amplitude).toBeGreaterThan(0);

    rerender({ enabled: false });
    await waitFor(() => expect(result.current.isCapturing).toBe(false));
    expect(result.current.amplitude).toBe(0);
  });
});
