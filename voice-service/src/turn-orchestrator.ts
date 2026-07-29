import type Anthropic from '@anthropic-ai/sdk';
import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type { ServerMessage, TurnTimestamps } from './messages';
import type { TranscriptTurn } from './persona';
import type { GeneratePersonaTurnResult } from './persona-turn';
import type { AnnotatedText } from './stress/stress-annotation';
import type { SttEventHandlers, SttTranscript, SttWord } from './stt';
import type { TtsEventHandlers } from './tts';
import { computeRmsEnergy, VadGate } from './vad';

/**
 * Ticket #18: assembles the components built in #14-#17
 * (generatePersonaTurn, createSttSession, annotateText, synthesizeSpeech)
 * into one live, per-turn cascade — the piece every one of those tickets'
 * own ADRs deferred to this ticket. Real, unit-tested orchestration logic
 * (all four vendor calls are injected, same DI pattern as every module
 * this depends on); wiring it to real audio in/out over a WebSocket is
 * server.ts's job, and *that* wiring is unverified (docs/adr/0017 — no
 * physical device exists in this environment).
 */

/** Injected dependencies — production wiring passes the real functions from persona-turn.ts/stt.ts/tts.ts/stress-annotation.ts directly; tests pass fakes. Matches the DI seam every one of those modules already uses. */
export type TurnOrchestratorDeps = {
  createSttSession: (apiKey: string, handlers: SttEventHandlers) => { sendAudioChunk: (pcmBase64: string, sampleRateHz: number, commit?: boolean) => void; close: () => void };
  generatePersonaTurn: (client: Anthropic, transcript: TranscriptTurn[]) => Promise<GeneratePersonaTurnResult>;
  annotateText: (text: string) => AnnotatedText;
  synthesizeSpeech: (client: ElevenLabsClient, voiceId: string, text: string, handlers?: TtsEventHandlers) => Promise<unknown>;
  anthropicClient: Anthropic;
  elevenLabsClient: ElevenLabsClient;
  elevenLabsApiKey: string;
  voiceId: string;
  sendMessage: (message: ServerMessage) => void;
  /** Injectable clock, for the six-timestamp log to be testable without real wall-clock timing. */
  now?: () => number;
  vadConfig?: { speechThresholdRms: number; silenceHangoverMs: number };
};

const DEFAULT_VAD_CONFIG = { speechThresholdRms: 5000, silenceHangoverMs: 500 };

/** PRD §7.3: "In-character filler (ну…, сейчас…) on end-of-turn detection, masking 300-500ms." Rotated, not randomized — deterministic and testable; real variety is a smaller concern than genuinely masking the gap. */
const FILLER_LINES = ['Ну…', 'Сейчас…', 'Так…'];

/**
 * PRD §5.7: "She doesn't understand you. Triggered off STT confidence."
 * No exact copy is specified there (unlike persona.ts's FILLER_LINE,
 * which PRD *does* quote verbatim for structured-output failures — a
 * different mechanic). This line is a judgment call: in-character, and
 * deliberately distinct from FILLER_LINE so the two failure modes read
 * differently to anyone debugging logs later.
 */
const DIDNT_CATCH_THAT_LINE = 'Прости, я не расслышала — повтори, пожалуйста?';

/**
 * PRD §5.7 doesn't specify a numeric threshold — ElevenLabs' `logprob` is
 * a log-probability (range (-∞, 0]), not the 0-100% score PRD's own
 * framing implicitly assumes. This value is an unvalidated placeholder:
 * real tuning needs real accented-learner STT data, which docs/adr/0013
 * already discloses as unavailable in this environment.
 */
const LOW_CONFIDENCE_AVG_LOGPROB_THRESHOLD = -1.5;

function averageLogprob(words: SttWord[]): number {
  const scored = words.filter(word => word.type === 'word');
  if (scored.length === 0)
    return 0; // no words at all isn't "low confidence" in the STT sense — see isEmptyTranscript below, handled separately.
  return scored.reduce((sum, word) => sum + word.logprob, 0) / scored.length;
}

export type OrchestratorState = 'listening' | 'processing' | 'speaking';

/**
 * One instance per live Converse session (one WebSocket connection).
 * Holds the conversation's real history (fed to `generatePersonaTurn` on
 * every turn) and the VAD gate across the whole session — barge-in
 * (PRD §7.10) is detected by the same gate transitioning to `speech_start`
 * while `state === 'speaking'`, not a separate mechanism.
 */
export class TurnOrchestrator {
  private readonly vadGate: VadGate;
  private readonly history: TranscriptTurn[] = [];
  private state: OrchestratorState = 'listening';
  private held = false;
  private generationToken = 0;
  private sttSession: ReturnType<TurnOrchestratorDeps['createSttSession']> | null = null;
  private pendingTranscript: { resolve: (transcript: SttTranscript) => void; reject: (error: Error) => void } | null = null;

  constructor(private readonly deps: TurnOrchestratorDeps) {
    this.vadGate = new VadGate(deps.vadConfig ?? DEFAULT_VAD_CONFIG);
  }

  get currentState(): OrchestratorState {
    return this.state;
  }

  /** PRD §7.9: "While held, turn detection is suspended entirely and no audio is sent to STT." The client already stops sending audio_chunk messages while held (see mobile's hold wiring) — this is the server-side half of the same guarantee, in case a stray chunk arrives anyway. */
  holdStart(): void {
    this.held = true;
  }

  holdEnd(): void {
    this.held = false;
  }

  /**
   * Called for every incoming audio_chunk message. `pcmBase64` is
   * forwarded to the vendor as-is (already the wire format `stt.ts`
   * expects) — only the RMS-energy decision (from the decoded samples)
   * happens here, not re-encoding.
   */
  pushAudioFrame(samples: Int16Array, pcmBase64: string, sampleRateHz: number): void {
    if (this.held)
      return;

    const frameDurationMs = (samples.length / sampleRateHz) * 1000;
    const rms = computeRmsEnergy(samples);
    const transition = this.vadGate.pushFrame(rms, frameDurationMs);

    if (this.state === 'speaking' && transition === 'speech_start') {
      this.handleBargeIn();
      // Fall through: this frame is also the start of the learner's new utterance.
    }

    // The frame that triggers `speech_end` must still be forwarded (it's
    // the commit signal) even though VadGate's own state has already
    // flipped to 'silence' by the time this line runs — checking
    // `currentState !== 'speech'` alone would silently drop exactly the
    // one frame that's supposed to finalize the utterance.
    if (this.vadGate.currentState !== 'speech' && transition !== 'speech_end')
      return;

    if (!this.sttSession) {
      this.state = 'listening';
      this.sttSession = this.deps.createSttSession(this.deps.elevenLabsApiKey, {
        onFinalTranscript: (transcript) => {
          this.pendingTranscript?.resolve(transcript);
          this.pendingTranscript = null;
        },
        onError: (error) => {
          this.pendingTranscript?.reject(error);
          this.pendingTranscript = null;
        },
      });
    }

    const commit = transition === 'speech_end';
    this.sttSession.sendAudioChunk(pcmBase64, sampleRateHz, commit);

    if (commit)
      void this.handleTurnDetected();
  }

  /**
   * PRD §7.10: "interruption must stop playback, cancel in-flight TTS,
   * cancel LLM generation, and reset stream state." Cancellation here
   * means every in-flight continuation of the superseded turn checks its
   * `generationToken` before sending anything further and drops its
   * result if it's stale — this is *logical* cancellation (results
   * discarded, no further messages sent), not physically aborting the
   * underlying HTTP/WS requests to Anthropic/ElevenLabs (neither
   * persona-turn.ts nor tts.ts currently accept an AbortSignal — adding
   * that is real, disclosed follow-up work, not done here). The `client`
   * still sees the effect PRD asks for: no further audio from the
   * abandoned turn, ever.
   */
  private handleBargeIn(): void {
    this.generationToken++;
    this.state = 'listening';
    this.sttSession?.close();
    this.sttSession = null;
    this.pendingTranscript = null;
    this.deps.sendMessage({ type: 'barge_in' });
  }

  private async handleTurnDetected(): Promise<void> {
    const myToken = this.generationToken;
    const now = this.deps.now ?? Date.now;
    const t0TurnDetected = now();
    this.state = 'processing';
    this.deps.sendMessage({ type: 'persona_filler', text: FILLER_LINES[this.history.length % FILLER_LINES.length] as string });

    let transcript: SttTranscript;
    try {
      transcript = await new Promise<SttTranscript>((resolve, reject) => {
        this.pendingTranscript = { resolve, reject };
      });
    }
    catch {
      if (myToken !== this.generationToken)
        return;
      this.respondWithDidntCatchThat(myToken, t0TurnDetected);
      return;
    }
    finally {
      this.sttSession?.close();
      this.sttSession = null;
    }
    if (myToken !== this.generationToken)
      return;
    const t1SttFinal = now();
    // PRD §6.2: Converse shows "her turn, learner's transcribed turn" — the
    // client has no other way to learn what STT actually heard. Sent even
    // on the low-confidence path below: "here's what I heard" is honest
    // even when it wasn't confident enough to act on.
    this.deps.sendMessage({ type: 'transcript_final', text: transcript.text });

    if (transcript.words.length === 0 || averageLogprob(transcript.words) < LOW_CONFIDENCE_AVG_LOGPROB_THRESHOLD) {
      this.respondWithDidntCatchThat(myToken, t0TurnDetected, t1SttFinal);
      return;
    }

    this.history.push({ speaker: 'learner', text: transcript.text });
    const t2PersonaStart = now();
    // A snapshot, not the live mutable array: `this.history` gets the
    // persona's own reply pushed onto it a few lines below, and nothing
    // about `generatePersonaTurn`'s contract promises it won't hold onto
    // the reference it's given (it doesn't today, but that's an
    // implementation detail, not a guarantee) — passing a copy is what
    // "generate this turn from exactly this history" actually means.
    const generated = await this.deps.generatePersonaTurn(this.deps.anthropicClient, [...this.history]);
    if (myToken !== this.generationToken)
      return;
    const t3PersonaComplete = now();
    this.history.push({ speaker: 'persona', text: generated.turn.text });
    this.deps.sendMessage({ type: 'persona_turn', text: generated.turn.text, comprehension: generated.turn.comprehension, affect: generated.turn.affect });

    const annotated = this.deps.annotateText(generated.turn.text);
    const t4StressAnnotated = now();

    this.state = 'speaking';
    let t5FirstAudio: number | null = null;
    await this.deps.synthesizeSpeech(this.deps.elevenLabsClient, this.deps.voiceId, annotated.text, {
      onChunk: (chunk, sentenceIndex) => {
        if (myToken !== this.generationToken)
          return;
        t5FirstAudio ??= now();
        this.deps.sendMessage({ type: 'tts_chunk', sentenceIndex, audioBase64: (chunk as { audioBase64: string }).audioBase64 });
      },
    });
    if (myToken !== this.generationToken)
      return;

    this.deps.sendMessage({
      type: 'turn_complete',
      timestamps: {
        t0TurnDetected,
        t1SttFinal,
        t2PersonaStart,
        t3PersonaComplete,
        t4StressAnnotated,
        t5FirstAudio: t5FirstAudio ?? t4StressAnnotated,
      },
    });
    this.state = 'listening';
  }

  private respondWithDidntCatchThat(myToken: number, t0TurnDetected: number, t1SttFinal?: number): void {
    if (myToken !== this.generationToken)
      return;
    const now = this.deps.now ?? Date.now;
    const timestamp = t1SttFinal ?? now();
    this.deps.sendMessage({ type: 'persona_turn', text: DIDNT_CATCH_THAT_LINE, comprehension: 'not_understood', affect: 'concerned' });
    this.deps.sendMessage({
      type: 'turn_complete',
      timestamps: { t0TurnDetected, t1SttFinal: timestamp, t2PersonaStart: timestamp, t3PersonaComplete: timestamp, t4StressAnnotated: timestamp, t5FirstAudio: timestamp },
    });
    this.state = 'listening';
  }
}

export type { TurnTimestamps };
