/**
 * Ticket #15 AC #2 (PRD §9's own framing: "VAD-gated STT"): "billed
 * audio duration reflects speech, not the full open-mic session." A
 * cheap, local, energy-threshold VAD — deciding *whether to forward
 * audio to the STT vendor at all*, upstream of and independent from
 * whatever ElevenLabs' own realtime endpoint does internally with its
 * `commit_strategy` (docs/adr/0013's research: ElevenLabs bills "per
 * minute of audio processed," and audio streamed to an open connection
 * is processed whether or not the vendor's own VAD later decides it
 * wasn't speech worth committing — the actual cost saving PRD asks for
 * has to happen before that point, not after it).
 *
 * ARCHITECTURE.md's pipeline diagram (`VAD → streaming STT`) treats VAD
 * as its own upstream stage for exactly this reason.
 */

/** Root-mean-square energy of a 16-bit PCM frame — the standard cheap proxy for "how loud is this frame," used as the VAD threshold input. Pure. */
export function computeRmsEnergy(samples: Int16Array): number {
  if (samples.length === 0)
    return 0;
  let sumOfSquares = 0;
  for (const sample of samples) sumOfSquares += sample * sample;
  return Math.sqrt(sumOfSquares / samples.length);
}

export type VadState = 'silence' | 'speech';

export type VadConfig = {
  /** RMS energy at or above which a frame counts as speech, not silence. Int16 samples range ±32767; a real threshold needs tuning against real mic input (see docs/adr/0014's disclosed on-device gap) — no default is asserted here as universally correct. */
  speechThresholdRms: number;
  /**
   * How long sustained sub-threshold energy must continue before speech
   * is considered actually over — a hangover/hysteresis window so a
   * brief mid-sentence pause doesn't fragment one utterance into several
   * (and doesn't repeatedly toggle the STT connection open/closed).
   */
  silenceHangoverMs: number;
};

export type VadTransition = 'speech_start' | 'speech_end';

/**
 * A small state machine, not a one-shot classifier: speech starts the
 * instant a frame crosses the threshold, but only ends after
 * `silenceHangoverMs` of sustained sub-threshold frames — this asymmetry
 * (instant start, delayed end) is deliberate: missing the first syllable
 * of an utterance is worse than forwarding a few hundred extra
 * milliseconds of trailing silence.
 */
export class VadGate {
  private state: VadState = 'silence';
  private sustainedSilenceMs = 0;

  constructor(private readonly config: VadConfig) {}

  get currentState(): VadState {
    return this.state;
  }

  /**
   * Feed one frame's RMS energy and its duration. Returns the transition
   * that just occurred, or null if the state didn't change (including
   * "still in silence" and "still in speech, within the hangover
   * countdown but not yet past it").
   */
  pushFrame(rmsEnergy: number, frameDurationMs: number): VadTransition | null {
    const isLoud = rmsEnergy >= this.config.speechThresholdRms;

    if (this.state === 'silence') {
      if (!isLoud)
        return null;
      this.state = 'speech';
      this.sustainedSilenceMs = 0;
      return 'speech_start';
    }

    // state === 'speech'
    if (isLoud) {
      this.sustainedSilenceMs = 0;
      return null;
    }
    this.sustainedSilenceMs += frameDurationMs;
    if (this.sustainedSilenceMs < this.config.silenceHangoverMs)
      return null;
    this.state = 'silence';
    this.sustainedSilenceMs = 0;
    return 'speech_end';
  }
}
