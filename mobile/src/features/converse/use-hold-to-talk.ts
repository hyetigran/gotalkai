import * as React from 'react';

// Relative import, not `@/`-prefixed — matches use-native-pcm-capture.ts's
// own import of the same local Expo module; see that file's header
// comment for the full autolinking/resolution story.
import { ExpoLivePcmCaptureModule } from '../../../modules/expo-live-pcm-capture';
import { useNativePcmCapture } from './use-native-pcm-capture';

/**
 * Ticket #40 (PRD §7.9): hold-to-talk replaces open-mic + VAD as the live
 * pipeline's turn-detection mechanism. Press starts native PCM capture
 * (`use-native-pcm-capture.ts`) and streams real frames with
 * `commit: false`; release sends one explicit, synthetic empty chunk with
 * `commit: true` and stops capture.
 *
 * The release chunk is deliberately synthetic (empty PCM, not whatever
 * the native module's own last real frame happens to be) — there's no
 * reliable signal from `useNativePcmCapture`'s callback for "this is the
 * last frame before capture actually stops" (native start/stop is async;
 * 0-1 frames can still be in flight when `enabled` flips to `false`).
 * Decoupling the turn-boundary signal from real audio timing removes that
 * race entirely: the server's `commit` handling (turn-orchestrator.ts's
 * `pushAudioFrame`) doesn't care whether the committing chunk carries real
 * audio, only that it arrives.
 */
const MAX_HOLD_MS = 55_000; // ahead of the server's own MAX_HOLD_MS (60s) backstop, so the button visibly releases instead of the server silently cutting the stream

export function useHoldToTalk(options: {
  /** Whether pressing is currently allowed — phase === 'listening' at the call site. Disabled while she's speaking or generating a reply (PRD §7.9: no barge-in via the button). */
  canTalk: boolean;
  sendAudioChunk: (pcmBase64: string, sampleRateHz: number, commit: boolean) => void;
}) {
  const { canTalk, sendAudioChunk } = options;
  const [pressed, setPressed] = React.useState(false);
  const pressedRef = React.useRef(false);
  const autoReleaseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const capture = useNativePcmCapture({
    enabled: pressed,
    onChunk: React.useCallback((pcmBase64: string, sampleRateHz: number) => sendAudioChunk(pcmBase64, sampleRateHz, false), [sendAudioChunk]),
  });

  const onPressOut = React.useCallback(() => {
    if (!pressedRef.current)
      return;
    pressedRef.current = false;
    setPressed(false);
    if (autoReleaseTimerRef.current) {
      clearTimeout(autoReleaseTimerRef.current);
      autoReleaseTimerRef.current = null;
    }
    sendAudioChunk('', ExpoLivePcmCaptureModule?.sampleRateHz ?? 16000, true);
  }, [sendAudioChunk]);

  const onPressIn = React.useCallback(() => {
    if (!canTalk || pressedRef.current)
      return;
    pressedRef.current = true;
    setPressed(true);
    autoReleaseTimerRef.current = setTimeout(onPressOut, MAX_HOLD_MS);
  }, [canTalk, onPressOut]);

  return { pressed, amplitude: capture.amplitude, error: capture.error, onPressIn, onPressOut };
}
