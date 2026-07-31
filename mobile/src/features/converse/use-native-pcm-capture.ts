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
   * (docs/adr/0023: live mode, so as not to run two concurrent Android
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
  }, [isSupported]);

  const startCaptureIfWanted = React.useCallback(async () => {
    if (!isSupported || !ExpoLivePcmCaptureModule || !wantsCaptureRef.current)
      return;
    try {
      await ExpoLivePcmCaptureModule.startCapture();
      setError(null);
      setIsCapturing(true);
    }
    catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // "already running" is the native module's AlreadyCapturingException
      // message — a benign race (e.g. this effect and the AppState
      // listener both firing before the first startCapture() promise
      // settles), not a real failure: whatever called this wanted capture
      // running, and it already is. Surfacing it as a user-facing error
      // would be misleading.
      if (message.includes('already running'))
        return;
      setIsCapturing(false);
      setAmplitude(0);
      reportError(message);
    }
  }, [isSupported, reportError]);

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
  }, [enabled, startCaptureIfWanted, stopCapture]);

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
