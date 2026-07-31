/**
 * One chunk of captured audio, emitted by the native `onAudioFrame` event
 * (see `android/src/main/java/expo/modules/livepcmcapture/ExpoLivePcmCaptureModule.kt`).
 *
 * `samples` are mono float samples in [-1.0, 1.0] — deliberately the same
 * convention `mobile/src/features/converse/pcm-encode.ts` already
 * documents ("expo-audio's convention") and is unit-tested against. The
 * native side converts `AudioRecord`'s raw 16-bit PCM to this range (the
 * exact inverse of `pcm-encode.ts`'s `floatSampleToInt16`) so that this
 * module stays a thin bridge — the actual downmix/PCM16/base64 encoding
 * logic lives in one place (JS, already tested), not duplicated in
 * Kotlin. A mono source is naturally a single channel, so callers pass
 * `[frame.samples]` straight into `pcm-encode.ts`'s
 * `readonly number[][]` channel shape.
 */
export type LivePcmAudioFrame = {
  samples: number[];
  /** Always `ExpoLivePcmCaptureModule.sampleRateHz` (16000) for this module's current Android configuration — included per-frame so consumers don't have to import the constant separately, matching `VoiceConnection.sendAudioChunk(pcmBase64, sampleRateHz)`'s own per-call shape. */
  sampleRateHz: number;
};

/** Emitted by the native capture thread when `AudioRecord.read()` returns a negative (error) result, or when a permission/initialization failure happens outside the normal `startCapture()` promise rejection path. */
export type LivePcmCaptureError = {
  message: string;
};

export type ExpoLivePcmCaptureModuleEvents = {
  onAudioFrame: (frame: LivePcmAudioFrame) => void;
  onCaptureError: (error: LivePcmCaptureError) => void;
};
