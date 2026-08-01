// Relative import, not `@/`-prefixed: `mobile/modules/expo-live-pcm-capture`
// is a local Expo module living outside `src/`, per Expo's own documented
// convention for local modules (see the module's own `src/index.ts` header
// comment for the full autolinking/resolution story). A `@modules/*`
// alias was tried and reverted — it resolves fine for normal imports, but
// Jest's `moduleNameMapper` + `jest.mock()` on a directory-style aliased
// target silently fails to intercept it (confirmed empirically: mocking
// the identical relative path works, mocking the alias to the same
// directory does not) — not worth the fragility for one module.
import type { LivePcmAudioFrame, LivePcmCaptureError } from '../../../modules/expo-live-pcm-capture';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import * as React from 'react';

import { AppState, Platform } from 'react-native';
import { ExpoLivePcmCaptureModule } from '../../../modules/expo-live-pcm-capture';
import { derivePcmAmplitude } from './derive-pcm-amplitude';
import { encodeAudioChunk } from './pcm-encode';

/**
 * React binding for the `expo-live-pcm-capture` local Expo module
 * (`mobile/modules/expo-live-pcm-capture`) — the missing piece
 * docs/adr/0017 identifies: neither `expo-audio` nor
 * `react-native-webrtc` can stream raw float PCM to JS on Android, so
 * `use-mic-capture.ts` (this file's sibling, used for the level-meter UI
 * today) never had real samples to hand anywhere. This hook is that
 * source, wired to the one place `pcm-encode.ts`'s pure functions were
 * always ready to be called from.
 *
 * Deliberately NOT wired into `converse-screen.tsx` or
 * `use-live-converse-session.ts` — per this ticket's scope, that
 * integration is a separate, later step, also blocked on real
 * per-session auth credentials (docs/adr/0017's second, independent
 * blocker). This hook just proves frames can get from the mic into JS
 * and out the other end as `audio_chunk`-ready base64.
 *
 * Android only, matching the native module. On any other platform (or
 * in Jest, where no native module is registered at all) `isSupported` is
 * `false` and every method here is a safe no-op — this hook must never
 * throw just because it was imported somewhere that isn't Android.
 */

export type UseNativePcmCaptureOptions = {
  /**
   * Whether capture should be running right now — same on/off shape as
   * `use-mic-capture.ts`'s `paused` option (inverted), so a future caller
   * driving both off the same state (e.g. hold-to-think) can do so
   * consistently. Not consumed by anything in this ticket.
   */
  enabled: boolean;
  /**
   * Called with each captured chunk already run through
   * `pcm-encode.ts`'s `encodeAudioChunk` — ready to hand to
   * `VoiceConnection.sendAudioChunk(pcmBase64, sampleRateHz)` once that
   * wiring exists. This hook never imports or calls `VoiceConnection`
   * itself, on purpose — see this file's header comment.
   */
  onChunk: (pcmBase64: string, sampleRateHz: number) => void;
  /**
   * Any capture failure: permission missing, `AudioRecord`
   * initialization failure, or a mid-capture read error reported via the
   * native `onCaptureError` event. Not called for the benign
   * "already capturing" race — see `startCaptureIfWanted` below.
   */
  onError?: (message: string) => void;
};

export function useNativePcmCapture({ enabled, onChunk, onError }: UseNativePcmCaptureOptions) {
  const isSupported = Platform.OS === 'android' && ExpoLivePcmCaptureModule != null;

  const [isCapturing, setIsCapturing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /**
   * Mirrors `use-mic-capture.ts`'s own `{ amplitude, ... }` shape
   * deliberately — callers driving the level meter off this hook instead
   * (docs/adr/0026: live mode, so as not to run two concurrent Android
   * audio-capture sessions competing for the mic) shouldn't need a
   * different contract to do it. Derived from each frame's real samples
   * via `derivePcmAmplitude`, not a separate polled metering reading —
   * this module has no equivalent to `expo-audio`'s `metering`, only the
   * frames themselves.
   */
  const [amplitude, setAmplitude] = React.useState(0);

  /** What the caller currently wants, independent of what the native side is actually doing right now — same pattern as `use-mic-capture.ts`'s `wantsRecordingRef`. */
  const wantsCaptureRef = React.useRef(false);
  const onChunkRef = React.useRef(onChunk);
  onChunkRef.current = onChunk;
  const onErrorRef = React.useRef(onError);
  onErrorRef.current = onError;

  const reportError = React.useCallback((message: string) => {
    setError(message);
    onErrorRef.current?.(message);
  }, []);

  // `requireOptionalNativeModule` (expo-live-pcm-capture-module.ts) returns
  // null, silently, if the native module isn't registered — correct
  // behavior on iOS/web/Jest (this module is Android-only by design), but
  // on Android itself a null result means the native side never actually
  // linked into this build (e.g. a stale install predating this module,
  // or a Gradle/autolinking failure) — every symptom of that looks
  // identical to "the mic is just off," with nothing to distinguish it:
  // no permission prompt (the code path is never reached), no error text,
  // level meter never moves — indistinguishable from a permission or VAD
  // problem (UAT: "my voice doesn't get captured", even after a full
  // `expo run:android` rebuild). Surfacing it loudly here is the only way
  // this failure mode is diagnosable at all instead of a dead end.
  React.useEffect(() => {
    if (Platform.OS === 'android' && ExpoLivePcmCaptureModule == null)
      reportError('ExpoLivePcmCapture native module did not load — try a full rebuild (expo run:android or a fresh dev-client/EAS build), not just a JS/Metro reload.');
  }, [reportError]);

  const { startCaptureIfWanted, stopCapture } = useCaptureLifecycleActions({
    isSupported,
    wantsCaptureRef,
    setIsCapturing,
    setAmplitude,
    setError,
    reportError,
  });

  // Handlers below are wrapped in `useCallback` with genuinely stable
  // deps (refs, or already-stable `reportError`/`setIsCapturing`) so the
  // two extracted hooks can list them as real effect dependencies rather
  // than needing an exhaustive-deps suppression.
  const handleFrame = React.useCallback((frame: LivePcmAudioFrame) => {
    setAmplitude(derivePcmAmplitude(frame.samples));
    const pcmBase64 = encodeAudioChunk([frame.samples]);
    onChunkRef.current(pcmBase64, frame.sampleRateHz);
  }, []);

  const handleCaptureError = React.useCallback((captureError: LivePcmCaptureError) => {
    setIsCapturing(false);
    setAmplitude(0);
    reportError(captureError.message);
  }, [reportError]);

  // Subscribing and the background/foreground sync are each pulled out
  // into their own small hooks below — partly to keep this function under
  // this repo's max-lines-per-function budget, partly because each is a
  // genuinely separate concern from start/stop lifecycle itself.
  useCaptureEventSubscriptions(isSupported, handleFrame, handleCaptureError);

  React.useEffect(() => {
    wantsCaptureRef.current = enabled;
    if (enabled)
      startCaptureIfWanted();
    else
      stopCapture();
  }, [enabled, startCaptureIfWanted, stopCapture, isSupported]);

  useAppStateCaptureSync({ isSupported, wantsCaptureRef, startCaptureIfWanted, stopCapture });

  React.useEffect(() => {
    return () => {
      wantsCaptureRef.current = false;
      stopCapture();
    };
  }, [stopCapture]);

  return { isSupported, isCapturing, error, amplitude };
}

/**
 * start/stop, pulled out of the main hook body purely to stay under this
 * repo's max-lines-per-function budget — same reasoning as
 * useCaptureEventSubscriptions/useAppStateCaptureSync below, not a
 * meaningfully separate concern on its own.
 */
function useCaptureLifecycleActions(options: {
  isSupported: boolean;
  wantsCaptureRef: { current: boolean };
  setIsCapturing: (value: boolean) => void;
  setAmplitude: (value: number) => void;
  setError: (value: string | null) => void;
  reportError: (message: string) => void;
}) {
  const { isSupported, wantsCaptureRef, setIsCapturing, setAmplitude, setError, reportError } = options;

  /**
   * Guards `startCaptureIfWanted` against overlapping calls — a real,
   * observed crash, not a theoretical one. `useAppStateCaptureSync` calls
   * this on every transition to `'active'`, and the RECORD_AUDIO
   * permission prompt (`requestRecordingPermissionsAsync` below) is
   * itself a system UI that steals foreground focus, which on at least
   * one real device produced a rapid `active` <-> `background` bounce —
   * observed via `adb logcat` as ~9 round-trips through
   * `com.google.android.permissioncontroller` in under 2 seconds, each
   * one re-entering this function *while the previous call was still
   * awaiting its own permission prompt*, each independently calling
   * `requestRecordingPermissionsAsync()` and `ExpoLivePcmCaptureModule.
   * startCapture()` again. The native side's own `AlreadyCapturingException`
   * (see its catch block below) only guards the *native* startCapture()
   * call — it never got a chance to, because every overlapping call was
   * still stuck earlier, awaiting its own redundant permission prompt.
   * Ten-plus AudioRecord create/start/stop/destroy cycles in ~1 second
   * (also confirmed via logcat) crashed the app outright. This ref caps
   * concurrency at one in-flight attempt; every overlapping call becomes
   * a no-op instead of piling on another prompt.
   */
  const startInFlightRef = React.useRef(false);

  const stopCapture = React.useCallback(async () => {
    if (!isSupported || !ExpoLivePcmCaptureModule)
      return;
    setIsCapturing(false);
    setAmplitude(0);
    try {
      await ExpoLivePcmCaptureModule.stopCapture();
    }
    catch {
      // Documented idempotent on the native side (ExpoLivePcmCaptureModule.kt's
      // stopCaptureInternal) — a rejection here would be unexpected, but
      // there's nothing actionable to do with it: capture is being torn
      // down regardless.
    }
  }, [isSupported, setIsCapturing, setAmplitude]);

  const startCaptureIfWanted = React.useCallback(async () => {
    if (!isSupported || !ExpoLivePcmCaptureModule || !wantsCaptureRef.current)
      return;
    if (startInFlightRef.current)
      return; // an overlapping call is already awaiting its own permission prompt/startCapture() — see startInFlightRef's own comment
    startInFlightRef.current = true;
    try {
      // The native module deliberately does not request this itself
      // (ExpoLivePcmCaptureModule.kt's MicPermissionDeniedException spells
      // out the contract) — without this, startCapture() below always
      // rejects on a device that's never separately run the scripted
      // demo's useMicCapture (the only other place this permission used to
      // get requested), which is every real learner going straight into a
      // live session (UAT: "my voice doesn't get registered").
      const { granted } = await requestRecordingPermissionsAsync();
      if (!wantsCaptureRef.current)
        return; // capture was disabled again while the permission prompt was up
      if (!granted) {
        reportError('RECORD_AUDIO permission was not granted.');
        return;
      }
      await ExpoLivePcmCaptureModule.startCapture();
      setError(null);
      setIsCapturing(true);
    }
    catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // "already running" is the native module's AlreadyCapturingException
      // message. startInFlightRef above closes the main window this could
      // fire through (this function re-entering itself); this remains as
      // a narrower backup — e.g. a real native-side capture session this
      // hook doesn't know about yet — so it stays a benign no-op rather
      // than a user-facing error, which would be misleading either way.
      if (message.includes('already running'))
        return;
      setIsCapturing(false);
      setAmplitude(0);
      reportError(message);
    }
    finally {
      startInFlightRef.current = false;
    }
  }, [isSupported, wantsCaptureRef, setIsCapturing, setAmplitude, setError, reportError]);

  return { startCaptureIfWanted, stopCapture };
}

/**
 * Subscribes to the native `onAudioFrame`/`onCaptureError` events for the
 * hook's whole lifetime, independent of `enabled` — no events fire while
 * the native side isn't capturing, so there's no cost to staying
 * subscribed, and it avoids a subscribe/unsubscribe cycle racing against
 * start/stop.
 */
function useCaptureEventSubscriptions(
  isSupported: boolean,
  onFrame: (frame: LivePcmAudioFrame) => void,
  onCaptureError: (error: LivePcmCaptureError) => void,
) {
  React.useEffect(() => {
    if (!isSupported || !ExpoLivePcmCaptureModule)
      return undefined;
    const frameSubscription = ExpoLivePcmCaptureModule.addListener('onAudioFrame', onFrame);
    const errorSubscription = ExpoLivePcmCaptureModule.addListener('onCaptureError', onCaptureError);
    return () => {
      frameSubscription.remove();
      errorSubscription.remove();
    };
  }, [isSupported, onFrame, onCaptureError]);
}

/**
 * Same underlying concern as `use-mic-capture.ts`'s interruption
 * recovery, handled differently: Android can reclaim the mic (or
 * otherwise stop it being readable) when the app backgrounds, and this
 * module deliberately doesn't run a foreground service to hold onto it
 * (out of scope here). `use-mic-capture.ts` detects this *after the
 * fact* via expo-audio's polled `isRecording` state; this module has no
 * equivalent polled signal to infer an involuntary stop from, so instead
 * this proactively stops on background and restarts on foreground.
 * `stopCapture`'s idempotency means calling it on every background
 * transition (even if already stopped) is safe. Untested against real
 * background/foreground transitions or an actual OS mic reclaim — no
 * physical device available in this environment.
 */
function useAppStateCaptureSync(options: {
  isSupported: boolean;
  wantsCaptureRef: { current: boolean };
  startCaptureIfWanted: () => Promise<void>;
  stopCapture: () => Promise<void>;
}) {
  const { isSupported, wantsCaptureRef, startCaptureIfWanted, stopCapture } = options;
  React.useEffect(() => {
    if (!isSupported)
      return undefined;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (wantsCaptureRef.current)
          startCaptureIfWanted();
      }
      else {
        stopCapture();
      }
    });
    return () => subscription.remove();
  }, [isSupported, wantsCaptureRef, startCaptureIfWanted, stopCapture]);
}
