import type { MediaStream } from 'react-native-webrtc';
import { mediaDevices } from 'react-native-webrtc';

/**
 * Acquires a microphone `MediaStream` through react-native-webrtc rather
 * than a raw platform recorder. This exists purely to establish the AEC
 * (acoustic echo cancellation) path this ticket calls for — libwebrtc's
 * native audio pipeline applies echo cancellation, noise suppression, and
 * automatic gain control to any audio track it captures, which a plain
 * `expo-audio` recording does not get.
 *
 * Nothing is played back yet (no remote peer, no `RTCPeerConnection`), so
 * this stream isn't attached to anything — later pipeline tickets that add
 * real TTS playback and a peer connection reuse this stream instead of
 * standing up their own capture path from scratch. `expo-audio`'s recorder
 * (`use-mic-capture.ts`) remains the source for the level meter's
 * amplitude, since expo-audio exposes `metering` directly and
 * react-native-webrtc's `MediaStreamTrack` does not.
 *
 * react-native-webrtc's `MediaTrackConstraints` type has no explicit
 * `echoCancellation`/`noiseSuppression` fields (unlike a browser's) —
 * requesting an audio track through `getUserMedia` is itself what routes
 * capture through libwebrtc's audio processing module, which applies these
 * unconditionally; there's no separate flag to opt in.
 */
export async function acquireLocalAudioStream(): Promise<MediaStream> {
  return mediaDevices.getUserMedia({ audio: true });
}

export function releaseLocalAudioStream(stream: MediaStream): void {
  stream.release();
}
