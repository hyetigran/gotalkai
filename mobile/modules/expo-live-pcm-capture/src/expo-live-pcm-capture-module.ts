import type { ExpoLivePcmCaptureModuleEvents } from './expo-live-pcm-capture.types';

import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';

declare class ExpoLivePcmCaptureNativeModule extends NativeModule<ExpoLivePcmCaptureModuleEvents> {
  /** Constant, not a function — registered via Kotlin's `Constants(...)` DSL, merged onto this object like `expo-constants`. Always 16000 on the current implementation; see the Kotlin module's `SAMPLE_RATE_HZ`. */
  sampleRateHz: number;

  /** Synchronous permission check — this module deliberately does not request the permission itself (the app already does, via `expo-audio`'s `requestRecordingPermissionsAsync` in `use-mic-capture.ts`); this just answers "has it been granted," so `startCapture()` can fail with a clear, catchable error instead of an opaque `AudioRecord` crash. */
  hasRecordAudioPermission(): boolean;

  /**
   * Starts a dedicated capture thread reading raw PCM via `AudioRecord`.
   * Rejects (does not silently no-op) if: permission isn't granted, a
   * capture session is already running, or `AudioRecord` fails to
   * initialize on this device/sample-rate combination. See the Kotlin
   * module for why each of those is a real, distinct rejection reason.
   */
  startCapture(): Promise<void>;

  /** Idempotent — safe to call even if capture isn't running (mirrors `stopCapture()`'s own Kotlin-side `compareAndSet` no-op path). */
  stopCapture(): Promise<void>;
}

/**
 * `requireOptionalNativeModule` (not `requireNativeModule`) deliberately:
 * this module is Android-only (`expo-module.config.json`'s `"platforms":
 * ["android"]` — no iOS implementation exists, out of scope per
 * docs/adr/0017's decision to build the native-module path for the
 * physical-device Android demo target only). Importing this file on iOS,
 * web, or in a Jest environment without a native module registered must
 * not throw at import time — callers (see
 * `use-native-pcm-capture.ts`) are expected to check for `null` and
 * degrade instead of crashing.
 */
export default requireOptionalNativeModule<ExpoLivePcmCaptureNativeModule>('ExpoLivePcmCapture');
