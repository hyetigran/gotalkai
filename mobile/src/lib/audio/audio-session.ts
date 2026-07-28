import { setAudioModeAsync } from 'expo-audio';

/**
 * Configures the iOS audio session for the Converse screen: continuous,
 * open-mic recording that can later coexist with her voice being played
 * back (PRD §6.2 — no press-to-speak, the mic is live for the whole
 * session).
 *
 * `allowsRecording: true` is what puts the session into (the iOS-native
 * equivalent of) the `playAndRecord` category — the only category that
 * supports simultaneous recording and playback; every other category
 * would silently kill one or the other, which is exactly the failure mode
 * ticket #10 calls out.
 *
 * `interruptionMode: 'doNotMix'` requests exclusive audio focus, matching
 * how a real phone call behaves — appropriate for a focused conversation
 * session. Recovering from an actual interruption (e.g. an incoming call)
 * is handled separately in `use-mic-capture.ts` (duck-and-auto-resume,
 * per product decision): this function only sets up the steady-state
 * session, not interruption recovery.
 */
export async function configureConverseAudioSession(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
    shouldPlayInBackground: false,
    allowsBackgroundRecording: false,
  });
}
