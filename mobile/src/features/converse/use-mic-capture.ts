import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as React from 'react';
import { AppState } from 'react-native';

import { configureConverseAudioSession } from '@/lib/audio/audio-session';
import { deriveMeterAmplitude } from './derive-meter-amplitude';

/** How often to poll the recorder for a fresh metering reading. */
const METERING_POLL_MS = 100;
/** One-shot retry delay after detecting an involuntary stop (e.g. a call interruption), before falling back to the AppState listener. */
const INTERRUPTION_RETRY_DELAY_MS = 1000;

type UseMicCaptureOptions = {
  /** Suspend capture without tearing it down — while hold-to-think is engaged, README: "STT muted". */
  paused: boolean;
};

/**
 * Continuous, open-mic capture for the Converse screen (PRD §6.2 — no
 * press-to-speak) — ticket #10. Recording starts once mounted and keeps
 * running for the screen's whole lifetime, pausing only for hold-to-think
 * and system interruptions.
 *
 * Interruption recovery ("duck and auto-resume", product decision):
 * expo-audio doesn't expose a dedicated interruption-began/ended event to
 * JS, so recovery is inferred from two signals — an involuntary drop in
 * `isRecording` (we didn't call `pause`/`stop` ourselves) triggers one
 * delayed retry, and an `AppState` transition to `active` (the reliable
 * signal for "the user is back") retries again. Deliberately NOT retried
 * on every polled tick while still interrupted — that would hammer the
 * native recorder in a tight loop for the duration of a real phone call.
 *
 * This has not been verified on physical hardware — the ticket itself
 * notes the simulator misreports audio routing, and there's no dedicated
 * interruption-simulation tool available in this environment.
 */
export function useMicCapture({ paused }: UseMicCaptureOptions) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, METERING_POLL_MS);
  const [permissionGranted, setPermissionGranted] = React.useState(false);

  /** Whether the screen wants capture running right now, independent of what the native recorder is actually doing. */
  const wantsRecordingRef = React.useRef(false);
  const wasRecordingRef = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      await configureConverseAudioSession();
      const { granted } = await requestRecordingPermissionsAsync();
      if (cancelled || !granted)
        return;
      setPermissionGranted(true);
      await recorder.prepareToRecordAsync();
      if (cancelled)
        return;
      wantsRecordingRef.current = true;
      recorder.record();
    })();
    return () => {
      cancelled = true;
      wantsRecordingRef.current = false;
      recorder.stop().catch(() => {});
    };
    // `recorder` is a stable instance for the hook's lifetime (like a ref),
    // so listing it here doesn't cause this to re-run on every render.
  }, [recorder]);

  React.useEffect(() => {
    if (!permissionGranted)
      return;
    if (paused)
      recorder.pause();
    else if (wantsRecordingRef.current)
      recorder.record();
  }, [paused, permissionGranted, recorder]);

  React.useEffect(() => {
    // Track this on every run, even while paused/ungranted below, so a
    // hold-to-think release doesn't see a stale pre-pause "was recording"
    // value and misread the pause itself as an involuntary interruption.
    const wasRecording = wasRecordingRef.current;
    wasRecordingRef.current = recorderState.isRecording;
    if (!permissionGranted || paused)
      return undefined;
    if (!wasRecording || recorderState.isRecording || !wantsRecordingRef.current)
      return undefined;
    const retryTimeoutId = setTimeout(() => {
      if (wantsRecordingRef.current && !paused)
        recorder.record();
    }, INTERRUPTION_RETRY_DELAY_MS);
    return () => clearTimeout(retryTimeoutId);
  }, [recorderState.isRecording, paused, permissionGranted, recorder]);

  React.useEffect(() => {
    if (!permissionGranted)
      return undefined;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && wantsRecordingRef.current && !paused && !recorderState.isRecording)
        recorder.record();
    });
    return () => subscription.remove();
  }, [permissionGranted, paused, recorderState.isRecording, recorder]);

  const amplitude = !paused && recorderState.isRecording && typeof recorderState.metering === 'number'
    ? deriveMeterAmplitude(recorderState.metering)
    : 0;

  return {
    amplitude,
    isRecording: recorderState.isRecording,
    permissionGranted,
  };
}
