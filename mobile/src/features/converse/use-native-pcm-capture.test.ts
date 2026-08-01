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

/**
 * A getter, not a plain value — lets one test (see "when the native module
 * fails to load on Android" below) simulate `requireOptionalNativeModule`
 * returning null (the native side never actually linked into the build)
 * by reassigning `mockNativeModuleOrNull`, without `jest.resetModules()`
 * (which hands the freshly-required hook a *different* React module
 * instance than the one `renderHook` is using — confirmed empirically:
 * "Cannot read properties of null (reading 'useState')" — a real, if
 * indirect, Jest/React footgun, not this hook's own bug).
 */
let mockNativeModuleOrNull: typeof mockNativeModule | null = mockNativeModule;

/** No native-module mock infrastructure exists for expo-audio in this repo (see use-tts-playback.test.ts's own comment) — this hook only needs requestRecordingPermissionsAsync, so a minimal standalone mock is enough rather than reaching for that shared gap. */
const mockRequestRecordingPermissionsAsync = jest.fn(() => Promise.resolve({ granted: true }));
jest.mock('expo-audio', () => ({
  requestRecordingPermissionsAsync: () => mockRequestRecordingPermissionsAsync(),
}));

// Relative path, not the (nonexistent) `@modules` alias — see
// use-native-pcm-capture.ts's import comment for why (an earlier alias
// attempt didn't survive contact with Jest's moduleNameMapper).
jest.mock('../../../modules/expo-live-pcm-capture', () => ({
  get ExpoLivePcmCaptureModule() { return mockNativeModuleOrNull; },
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
  mockRequestRecordingPermissionsAsync.mockImplementation(() => Promise.resolve({ granted: true }));
  mockNativeModuleOrNull = mockNativeModule;
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
describe('useNativePcmCapture RECORD_AUDIO permission', () => {
  it(
    'requests RECORD_AUDIO before starting capture — the native module documents that it does not request this itself (ExpoLivePcmCaptureModule.kt\'s MicPermissionDeniedException)',
    async () => {
      Platform.OS = 'android';
      const { result } = renderHook(() => useNativePcmCapture({ enabled: true, onChunk: jest.fn() }));

      await waitFor(() => expect(result.current.isCapturing).toBe(true));

      expect(mockRequestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(mockNativeModule.startCapture).toHaveBeenCalledTimes(1);
    },
  );

  it('surfaces an error and never calls startCapture when RECORD_AUDIO is denied — UAT: "my voice doesn\'t get registered"', async () => {
    Platform.OS = 'android';
    mockRequestRecordingPermissionsAsync.mockImplementation(() => Promise.resolve({ granted: false }));
    const onError = jest.fn();

    const { result } = renderHook(() => useNativePcmCapture({ enabled: true, onChunk: jest.fn(), onError }));
    await waitFor(() => expect(onError).toHaveBeenCalled());

    expect(mockNativeModule.startCapture).not.toHaveBeenCalled();
    expect(result.current.isCapturing).toBe(false);
    expect(result.current.error).toContain('RECORD_AUDIO permission');
  });

  it(
    'does not call requestRecordingPermissionsAsync again for an overlapping start while the first is still awaiting the permission prompt',
    async () => {
      // Reproduces a real crash (adb logcat): the system permission prompt itself steals
      // foreground focus, which triggered useAppStateCaptureSync's 'active' handler to call
      // startCaptureIfWanted() again *while the first call was still awaiting that same
      // prompt* — ~9 overlapping rounds in under 2 seconds, each firing its own
      // requestRecordingPermissionsAsync()/startCapture(), which crashed the app outright.
      // Toggling `enabled` off/on here is a convenient stand-in for that same "another
      // caller invokes startCaptureIfWanted() before the first call has settled" shape,
      // without needing to mock AppState directly.
      Platform.OS = 'android';
      let resolvePermission: ((value: { granted: boolean }) => void) | undefined;
      mockRequestRecordingPermissionsAsync.mockImplementation(() => new Promise((resolve) => {
        resolvePermission = resolve;
      }));

      const { result, rerender } = renderHook(
        ({ enabled }: { enabled: boolean }) => useNativePcmCapture({ enabled, onChunk: jest.fn() }),
        { initialProps: { enabled: true } },
      );
      await waitFor(() => expect(mockRequestRecordingPermissionsAsync).toHaveBeenCalledTimes(1));

      rerender({ enabled: false });
      rerender({ enabled: true });
      expect(mockRequestRecordingPermissionsAsync).toHaveBeenCalledTimes(1); // the overlapping call was a no-op, not a second prompt

      resolvePermission?.({ granted: true });
      await waitFor(() => expect(result.current.isCapturing).toBe(true));
      expect(mockNativeModule.startCapture).toHaveBeenCalledTimes(1);
    },
  );
});

describe('useNativePcmCapture amplitude (docs/adr/0023)', () => {
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

// Isolated module registry, not the outer static mock (which always returns a populated
// mockNativeModule) — this simulates ExpoLivePcmCaptureModule failing to link into the
// build at all (requireOptionalNativeModule returning null), the one Android-specific
// failure mode that otherwise produces total silence: no permission prompt, no error,
// no level-meter movement (UAT: "my voice doesn't get captured" survived a full
// `expo run:android` rebuild — this is what that dead end looks like from the inside).
describe('useNativePcmCapture when the native module fails to load on Android', () => {
  it('reports a diagnosable error instead of silently behaving like an unsupported platform', async () => {
    mockNativeModuleOrNull = null;
    Platform.OS = 'android';
    const onError = jest.fn();
    const { result } = renderHook(() => useNativePcmCapture({ enabled: true, onChunk: jest.fn(), onError }));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(result.current.isSupported).toBe(false);
    expect(result.current.error).toContain('did not load');
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('rebuild'));
  });
});
