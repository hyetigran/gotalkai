package expo.modules.livepcmcapture

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Matches voice-service/src/stt.test.ts and mobile/src/lib/voice-service/
 * voice-connection.test.ts, both of which exercise the wire protocol at
 * 16000Hz — that's the sample rate ElevenLabs' realtime STT and this
 * app's own tests already assume throughout the pipeline. 16kHz mono is
 * also a rate every Android device is required to support for
 * AudioRecord (unlike e.g. 44100 or 48000, which are common but not
 * universally guaranteed for the mic input path), so picking it avoids
 * introducing a resampling step this codebase has nowhere else.
 */
private const val SAMPLE_RATE_HZ = 16000
private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
private const val AUDIO_ENCODING = AudioFormat.ENCODING_PCM_16BIT

/** ~100ms of audio per emitted JS event at 16kHz mono — small enough to keep turn-taking latency low (PRD §7.3's timestamps start from when the server receives audio), large enough not to spam the JS bridge with an event every few milliseconds. Not tuned against a real device; see this module's index.ts for what's unverified. */
private const val SAMPLES_PER_FRAME = 1600

class MicPermissionDeniedException : CodedException(
  "RECORD_AUDIO permission has not been granted. This module does not request it — call expo-audio's requestRecordingPermissionsAsync() first (see use-mic-capture.ts), then retry startCapture()."
)

class AlreadyCapturingException : CodedException(
  "startCapture() was called while a capture session was already running. Call stopCapture() first."
)

class AudioRecordInitializationException(reason: String) : CodedException(
  "AudioRecord failed to initialize: $reason"
)

/**
 * Android-only local Expo module: streams live mono PCM from the
 * microphone straight to JS via `AudioRecord.read()` on a dedicated
 * background thread — see this module's `src/index.ts` for why this
 * exists (docs/adr/0017's disclosed gap) and what's unverified without a
 * physical device.
 *
 * Deliberately thin: this class owns capture lifecycle and the
 * int16-to-float sample conversion (the inverse of `pcm-encode.ts`'s
 * `floatSampleToInt16`, so the two stay symmetric) and nothing else — no
 * downmixing (already mono), no PCM16 packing, no base64 encoding. That
 * logic already exists, real and unit-tested, in `pcm-encode.ts`; this
 * module's whole job is to get real samples into JS in the shape that
 * code already expects, not to re-implement it in Kotlin.
 */
class ExpoLivePcmCaptureModule : Module() {
  private var audioRecord: AudioRecord? = null
  private var captureThread: Thread? = null

  /**
   * The single source of truth for "are we capturing right now," checked
   * by the capture loop on every iteration to decide whether to keep
   * reading. `compareAndSet` makes `startCapture`/`stopCapture` safe
   * against being called back-to-back from JS before the previous call's
   * promise has resolved (e.g. rapid enable/disable from a React effect).
   */
  private val isCapturing = AtomicBoolean(false)

  override fun definition() = ModuleDefinition {
    Name("ExpoLivePcmCapture")

    Constants(
      "sampleRateHz" to SAMPLE_RATE_HZ
    )

    Events("onAudioFrame", "onCaptureError")

    Function("hasRecordAudioPermission") {
      hasRecordAudioPermission()
    }

    AsyncFunction("startCapture") { promise: expo.modules.kotlin.Promise ->
      startCapture(promise)
    }

    AsyncFunction("stopCapture") { promise: expo.modules.kotlin.Promise ->
      stopCaptureInternal()
      promise.resolve(null)
    }

    // A dropped connection or backgrounded app tearing down the module
    // instance shouldn't leave AudioRecord holding the mic open
    // indefinitely — same defensive intent as AudioModule.kt's own
    // OnDestroy (verified pattern, not invented here).
    OnDestroy {
      stopCaptureInternal()
    }
  }

  private fun hasRecordAudioPermission(): Boolean {
    val context = appContext.reactContext ?: return false
    return ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
      PackageManager.PERMISSION_GRANTED
  }

  private fun startCapture(promise: expo.modules.kotlin.Promise) {
    if (!hasRecordAudioPermission()) {
      promise.reject(MicPermissionDeniedException())
      return
    }
    if (!isCapturing.compareAndSet(false, true)) {
      promise.reject(AlreadyCapturingException())
      return
    }

    val minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE_HZ, CHANNEL_CONFIG, AUDIO_ENCODING)
    if (minBufferSize == AudioRecord.ERROR || minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
      isCapturing.set(false)
      promise.reject(
        AudioRecordInitializationException(
          "getMinBufferSize returned $minBufferSize for sampleRateHz=$SAMPLE_RATE_HZ — this combination is unsupported on this device."
        )
      )
      return
    }
    // Headroom above the OS-reported minimum: a slow JS/bridge tick
    // shouldn't cause AudioRecord to drop samples internally before our
    // read loop gets back around to it. 4x is a conservative guess, not a
    // number tuned against real device scheduling jitter — genuinely
    // unverifiable without hardware.
    val bufferSizeBytes = maxOf(minBufferSize, SAMPLES_PER_FRAME * 2 * 4)

    val record = AudioRecord(
      // VOICE_COMMUNICATION (not MIC): on many OEM implementations this
      // routes through the device's hardware AEC/NS audio effect chain,
      // since it's the source Android expects VoIP-style two-way-audio
      // apps to use. This is a disclosed best-effort mitigation for part
      // of docs/adr/0017's AEC gap, NOT a fix for it — that ADR's gap is
      // about WebRTC-level AEC being structurally absent from this
      // WS-chunk transport, which this source choice doesn't change.
      // Whether this device/OEM combination actually engages any AEC
      // here is unverified — no physical device available.
      MediaRecorder.AudioSource.VOICE_COMMUNICATION,
      SAMPLE_RATE_HZ,
      CHANNEL_CONFIG,
      AUDIO_ENCODING,
      bufferSizeBytes
    )

    if (record.state != AudioRecord.STATE_INITIALIZED) {
      record.release()
      isCapturing.set(false)
      promise.reject(
        AudioRecordInitializationException(
          "AudioRecord.state was ${record.state}, not STATE_INITIALIZED, after construction."
        )
      )
      return
    }

    try {
      record.startRecording()
    } catch (e: IllegalStateException) {
      record.release()
      isCapturing.set(false)
      promise.reject(AudioRecordInitializationException("startRecording() threw: ${e.message}"))
      return
    }

    if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
      record.release()
      isCapturing.set(false)
      promise.reject(
        AudioRecordInitializationException(
          "recordingState was ${record.recordingState}, not RECORDSTATE_RECORDING, after startRecording()."
        )
      )
      return
    }

    audioRecord = record

    // A dedicated Thread, not appContext.mainQueue/a coroutine on the JS
    // thread: AudioRecord.read() blocks until data is available, and
    // blocking the JS thread or a shared coroutine dispatcher here would
    // stall everything else in the app for the duration of every read.
    // This is the standard, documented pattern for AudioRecord (Android's
    // own docs put the read loop on its own thread) — not something
    // invented for this module.
    val thread = Thread({ runCaptureLoop(record) }, "ExpoLivePcmCaptureThread")
    captureThread = thread
    thread.start()

    promise.resolve(null)
  }

  private fun runCaptureLoop(record: AudioRecord) {
    val shortBuffer = ShortArray(SAMPLES_PER_FRAME)
    while (isCapturing.get()) {
      val samplesRead = record.read(shortBuffer, 0, shortBuffer.size)
      if (samplesRead < 0) {
        // A negative return is one of AudioRecord's ERROR_* constants
        // (e.g. ERROR_INVALID_OPERATION, ERROR_DEAD_OBJECT), not a
        // sample count — surface it as a real event rather than looping
        // forever reading nothing.
        emitCaptureError("AudioRecord.read() returned error code $samplesRead")
        break
      }
      if (samplesRead == 0) {
        continue
      }

      val floatSamples = FloatArray(samplesRead)
      for (i in 0 until samplesRead) {
        // Int16 (-32768..32767) -> float [-1.0, 1.0]: the exact inverse
        // of pcm-encode.ts's floatSampleToInt16, so round-tripping
        // through this bridge and back through that pure function is
        // symmetric (modulo the ordinary quantization from int16 in the
        // first place, which is unavoidable — AudioRecord's own output
        // format).
        val sample = shortBuffer[i]
        floatSamples[i] = if (sample < 0) sample / 32768f else sample / 32767f
      }

      emitAudioFrame(floatSamples)
    }
  }

  /**
   * Both emit helpers hop onto `appContext.mainQueue` before calling
   * `sendEvent`, even though `sendEvent` is called here from the
   * dedicated capture thread, not the JS thread. This is a defensive
   * choice, not a verified requirement: `KModuleEventEmitterWrapper`'s
   * `sendEvent` ultimately calls into JNI/JSI
   * (node_modules/expo-modules-core/android/.../KModuleEventEmitterWrapper.kt),
   * and whether that path is safe to call from an arbitrary raw
   * `Thread` (as opposed to a known-safe queue) could not be confirmed
   * by reading source alone — `appContext.mainQueue.launch { ... }` is a
   * `kotlinx.coroutines` `CoroutineScope`, and launching onto it is
   * thread-safe from any caller thread by construction, so this removes
   * the question entirely rather than leaving it unverified. Whether
   * this in turn adds meaningful latency to frame delivery is itself
   * unverified without a device.
   */
  private fun emitAudioFrame(samples: FloatArray) {
    appContext.mainQueue.launch {
      sendEvent(
        "onAudioFrame",
        mapOf(
          "samples" to samples,
          "sampleRateHz" to SAMPLE_RATE_HZ.toDouble()
        )
      )
    }
  }

  private fun emitCaptureError(message: String) {
    appContext.mainQueue.launch {
      sendEvent("onCaptureError", mapOf("message" to message))
    }
  }

  private fun stopCaptureInternal() {
    if (!isCapturing.compareAndSet(true, false)) {
      // Already stopped (or never started) — idempotent, matches the
      // JS-side contract documented in ExpoLivePcmCaptureModule.ts.
      return
    }
    // Join with a bounded timeout rather than indefinitely: the loop
    // checks isCapturing.get() every read, so it should exit promptly,
    // but a wedged AudioRecord.read() call (e.g. a dead audio HAL) must
    // not hang stopCapture()'s promise forever.
    captureThread?.join(500)
    captureThread = null

    audioRecord?.let { record ->
      try {
        if (record.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
          record.stop()
        }
      } catch (e: IllegalStateException) {
        // stop() can throw if the record is already stopped/uninitialized
        // — nothing further to do, this instance is being torn down
        // regardless.
      }
      record.release()
    }
    audioRecord = null
  }
}
