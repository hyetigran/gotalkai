import type Anthropic from '@anthropic-ai/sdk';
import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type { ServerMessage, TurnTimestamps } from './messages';
import type { TranscriptTurn } from './persona';
import type { GeneratePersonaTurnResult } from './persona-turn';
import type { SafetyCategory, SafetyTriggerCategory } from './safety-detection';
import type { AnnotatedText } from './stress/stress-annotation';
import type { SttEventHandlers, SttTranscript, SttWord } from './stt';
import type { TtsEventHandlers } from './tts';
import { getSafetyResponseText } from './safety-detection';
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
 *
 * Ticket #32 adds `submitTextInput` as a second entry point alongside
 * the voice path's `pushAudioFrame`/`handleTurnDetected` — both funnel
 * into the same `checkSafetyAndRespond`/`runPersonaCascade` (persona
 * generation, stress annotation, TTS, history, timestamps), per AC #3:
 * "no duplicated pipeline logic." Only what's genuinely specific to
 * voice (VAD, STT, the low-confidence "didn't catch that" mechanic —
 * there's no ASR confidence concept for exact typed text) stays in the
 * voice-only path.
 */

/** Injected dependencies — production wiring passes the real functions from persona-turn.ts/stt.ts/tts.ts/stress-annotation.ts directly; tests pass fakes. Matches the DI seam every one of those modules already uses. */
export type TurnOrchestratorDeps = {
  createSttSession: (apiKey: string, handlers: SttEventHandlers) => { sendAudioChunk: (pcmBase64: string, sampleRateHz: number, commit?: boolean) => void; close: () => void };
  generatePersonaTurn: (client: Anthropic, transcript: TranscriptTurn[]) => Promise<GeneratePersonaTurnResult>;
  /** Ticket #27: the separate detection path PRD §12.1 requires — runs on every learner turn, gating whether the normal persona pipeline below even runs. */
  detectSafetyTrigger: (client: Anthropic, learnerText: string) => Promise<SafetyCategory>;
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

/** PRD §7.9: "A learner who holds and puts the phone down must not hang the session." Mirrors the client's own ~45s auto-release (mobile/src/features/converse/use-live-converse-session.ts) as a server-side backstop for when hold_end never arrives at all — a dropped connection or crashed client, not just a slow one. */
const HOLD_AUTO_RELEASE_MS = 45_000;

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
  private holdAutoReleaseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: TurnOrchestratorDeps) {
    this.vadGate = new VadGate(deps.vadConfig ?? DEFAULT_VAD_CONFIG);
  }

  get currentState(): OrchestratorState {
    return this.state;
  }

  /** PRD §7.9: "While held, turn detection is suspended entirely and no audio is sent to STT." The client already stops sending audio_chunk messages while held (see mobile's hold wiring) — this is the server-side half of the same guarantee, in case a stray chunk arrives anyway. Applies uniformly to text input too (ticket #32) — hold-to-think is about giving the learner space, not specifically about audio. */
  holdStart(): void {
    this.held = true;
    if (this.holdAutoReleaseTimer)
      clearTimeout(this.holdAutoReleaseTimer);
    this.holdAutoReleaseTimer = setTimeout(() => this.holdEnd(), HOLD_AUTO_RELEASE_MS);
    // Node-only: doesn't block process shutdown while a hold is outstanding.
    this.holdAutoReleaseTimer.unref?.();
  }

  holdEnd(): void {
    this.held = false;
    if (this.holdAutoReleaseTimer) {
      clearTimeout(this.holdAutoReleaseTimer);
      this.holdAutoReleaseTimer = null;
    }
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
        // PRD §6.2's live "what did I just say" feedback — see messages.ts's
        // transcript_partial doc comment. Not authoritative; transcript_final
        // (sent once STT resolves, below) is what actually drives the turn.
        onPartialTranscript: (text) => {
          this.deps.sendMessage({ type: 'transcript_partial', text });
        },
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
   * Ticket #32 / PRD §12.3: the text-input path — bypasses VAD/STT
   * entirely, since the learner's exact typed text already *is* the
   * transcript. No ASR-confidence concept exists for it, so the
   * voice-only low-confidence "didn't catch that" mechanic has no
   * analog here and is skipped outright, not approximated. Everything
   * else downstream — safety detection, persona generation, stress
   * annotation, TTS, history, six-timestamp instrumentation — is the
   * exact same `checkSafetyAndRespond`/`runPersonaCascade` the voice
   * path uses (AC #3: "no duplicated pipeline logic").
   */
  async submitTextInput(text: string): Promise<void> {
    if (this.held)
      return;
    const trimmed = text.trim();
    if (trimmed.length === 0)
      return;

    // Typing while she's still speaking interrupts her — the text-input
    // equivalent of speaking over her (pushAudioFrame's own barge-in check).
    if (this.state === 'speaking')
      this.handleBargeIn();

    const { myToken, t0TurnDetected } = this.beginTurn();
    // No real STT stage exists for typed input — t0/t1 collapse to the instant the text arrived,
    // matching how the voice-only stages collapse to a single timestamp elsewhere when they didn't
    // really run (see respondWithDidntCatchThat/respondWithSafetyMessage).
    const t1SttFinal = t0TurnDetected;
    this.deps.sendMessage({ type: 'transcript_final', text: trimmed });

    if (await this.checkSafetyAndRespond(myToken, trimmed, t0TurnDetected, t1SttFinal))
      return;

    await this.runPersonaCascade(myToken, trimmed, t0TurnDetected, t1SttFinal);
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

  /**
   * Shared turn-initiation preamble for both entry points (ticket #32):
   * snapshot the generation token, mark t0, flip to `processing`, and
   * send the in-character filler. Everything after this point diverges
   * (STT wait vs. immediate text) until both rejoin at
   * `checkSafetyAndRespond`/`runPersonaCascade`.
   */
  private beginTurn(): { myToken: number; t0TurnDetected: number } {
    const myToken = this.generationToken;
    const now = this.deps.now ?? Date.now;
    const t0TurnDetected = now();
    this.state = 'processing';
    this.deps.sendMessage({ type: 'persona_filler', text: FILLER_LINES[this.history.length % FILLER_LINES.length] as string });
    return { myToken, t0TurnDetected };
  }

  private async handleTurnDetected(): Promise<void> {
    const { myToken, t0TurnDetected } = this.beginTurn();
    const now = this.deps.now ?? Date.now;

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

    // Ticket #27 / PRD §12.1: runs before the normal pipeline gets a say,
    // including before the low-confidence check below — a real disclosure
    // deserves the escape hatch even if STT wasn't fully confident in the
    // exact words.
    if (await this.checkSafetyAndRespond(myToken, transcript.text, t0TurnDetected, t1SttFinal))
      return;

    if (transcript.words.length === 0 || averageLogprob(transcript.words) < LOW_CONFIDENCE_AVG_LOGPROB_THRESHOLD) {
      this.respondWithDidntCatchThat(myToken, t0TurnDetected, t1SttFinal);
      return;
    }

    await this.runPersonaCascade(myToken, transcript.text, t0TurnDetected, t1SttFinal);
  }

  /**
   * Ticket #27's separate detection path, shared by both input
   * modalities (ticket #32 AC #3). Returns `true` if the caller should
   * stop (either a real trigger was handled, or this turn went stale
   * while the classifier call was in flight) — `false` means clear to
   * continue into the normal pipeline.
   */
  private async checkSafetyAndRespond(myToken: number, learnerText: string, t0TurnDetected: number, t1SttFinal: number): Promise<boolean> {
    if (learnerText.trim().length === 0)
      return false; // nothing to classify
    const safetyCategory = await this.deps.detectSafetyTrigger(this.deps.anthropicClient, learnerText);
    if (myToken !== this.generationToken)
      return true;
    if (safetyCategory !== 'none') {
      await this.respondWithSafetyMessage(myToken, safetyCategory, t0TurnDetected, t1SttFinal);
      return true;
    }
    return false;
  }

  /**
   * Persona generation → stress annotation → TTS → history → six-timestamp
   * completion — identical regardless of whether `learnerText` arrived via
   * STT or was typed directly (ticket #32 AC #3/#4: recasts, register
   * asymmetry, and everything downstream "work identically... no
   * duplicated pipeline logic"). Callers have already run the safety check
   * and (for voice) the low-confidence check before reaching here.
   */
  private async runPersonaCascade(myToken: number, learnerText: string, t0TurnDetected: number, t1SttFinal: number): Promise<void> {
    const now = this.deps.now ?? Date.now;
    this.history.push({ speaker: 'learner', text: learnerText });
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
        this.deps.sendMessage({ type: 'tts_chunk', sentenceIndex, audioBase64: chunk.audioBase64 });
      },
    });
    if (myToken !== this.generationToken)
      return;

    this.sendTurnComplete({
      t0TurnDetected,
      t1SttFinal,
      t2PersonaStart,
      t3PersonaComplete,
      t4StressAnnotated,
      t5FirstAudio: t5FirstAudio ?? t4StressAnnotated,
    });
    this.state = 'listening';
  }

  private respondWithDidntCatchThat(myToken: number, t0TurnDetected: number, t1SttFinal?: number): void {
    if (myToken !== this.generationToken)
      return;
    const now = this.deps.now ?? Date.now;
    const timestamp = t1SttFinal ?? now();
    this.deps.sendMessage({ type: 'persona_turn', text: DIDNT_CATCH_THAT_LINE, comprehension: 'not_understood', affect: 'concerned' });
    // Collapsed: no real per-stage timing exists for a turn that skipped LLM/TTS entirely.
    this.sendTurnComplete({ t0TurnDetected, t1SttFinal: timestamp, t2PersonaStart: timestamp, t3PersonaComplete: timestamp, t4StressAnnotated: timestamp, t5FirstAudio: timestamp });
    this.state = 'listening';
  }

  /**
   * Ticket #27 / PRD §12.1: breaks character entirely — deliberately does
   * NOT push anything onto `this.history`. The triggering text and this
   * response both stay out of the persona LLM's conversation context
   * permanently, not just for this turn: "separate detection path,
   * separate response mode" means the normal pipeline never sees this
   * exchange happened at all, on this turn or any later one.
   *
   * Still goes through real `synthesizeSpeech` (this is a voice-first
   * product — a text-only response the learner never sees, since the
   * transcript only appears after she finishes "speaking" per PRD §6.2,
   * would make the escape hatch practically silent). Skips
   * `annotateText`: the response text is English, and stress annotation
   * is Cyrillic-specific.
   */
  private async respondWithSafetyMessage(myToken: number, category: SafetyTriggerCategory, t0TurnDetected: number, t1SttFinal: number): Promise<void> {
    const now = this.deps.now ?? Date.now;
    const text = getSafetyResponseText(category);
    this.deps.sendMessage({ type: 'safety_response', category, text });

    this.state = 'speaking';
    let t5FirstAudio: number | null = null;
    await this.deps.synthesizeSpeech(this.deps.elevenLabsClient, this.deps.voiceId, text, {
      onChunk: (chunk, sentenceIndex) => {
        if (myToken !== this.generationToken)
          return;
        t5FirstAudio ??= now();
        this.deps.sendMessage({ type: 'tts_chunk', sentenceIndex, audioBase64: chunk.audioBase64 });
      },
    });
    if (myToken !== this.generationToken)
      return;

    // t2/t3/t4 collapsed to t1: no persona-LLM or stress-annotation stage really ran for this turn.
    this.sendTurnComplete({
      t0TurnDetected,
      t1SttFinal,
      t2PersonaStart: t1SttFinal,
      t3PersonaComplete: t1SttFinal,
      t4StressAnnotated: t1SttFinal,
      t5FirstAudio: t5FirstAudio ?? t1SttFinal,
    });
    this.state = 'listening';
  }

  private sendTurnComplete(timestamps: TurnTimestamps): void {
    this.deps.sendMessage({ type: 'turn_complete', timestamps });
  }
}

export type { TurnTimestamps };
