import type Anthropic from '@anthropic-ai/sdk';
import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type { ServerMessage, TurnTimestamps } from './messages';
import type { TranscriptTurn } from './persona';
import type { GeneratePersonaTurnResult } from './persona-turn';
import type { PersonaDefinition } from './personas';
import type { SafetyCategory, SafetyTriggerCategory } from './safety-detection';
import type { AnnotatedText } from './stress/stress-annotation';
import type { SttEventHandlers, SttTranscript, SttWord } from './stt';
import type { TtsEventHandlers } from './tts';
import { estimateLlmCostUsd, estimateSttCostUsd, estimateTtsCostUsd } from './cost';
import { getSafetyResponseText } from './safety-detection';
import { logTrace } from './tracing';
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

/** Ticket #29 / docs/adr/0022: what `deps.recordTurn` posts to app-service's `POST /sessions/:id/turns` — field-for-field the same shape as `app-service/src/turns.ts`'s `recordTurnRequestSchema` (duplicated, not imported — no pnpm workspace links the two services, same constraint docs/adr/0012 already hit). */
export type RecordedTurnInput = {
  speaker: 'persona' | 'learner';
  content: string;
  personaRegister?: string;
  learnerRegister?: string;
  timings?: TurnTimestamps;
  costUsd?: number;
};

/** Ticket #29: see `lastPersonaTurn`'s own doc comment (below) for why `turnId` starts `null` and gets filled in-place. */
type PersonaTurnMarker = { turnId: string | null; audioStartMs: number };

/** Injected dependencies — production wiring passes the real functions from persona-turn.ts/stt.ts/tts.ts/stress-annotation.ts directly; tests pass fakes. Matches the DI seam every one of those modules already uses. */
export type TurnOrchestratorDeps = {
  createSttSession: (apiKey: string, handlers: SttEventHandlers) => { sendAudioChunk: (pcmBase64: string, sampleRateHz: number, commit?: boolean) => void; close: () => void };
  /** Ticket #34 / docs/adr/0023: takes the active session's own `PersonaDefinition` — generalized off the Валентина-hardcoded signature. */
  generatePersonaTurn: (client: Anthropic, transcript: TranscriptTurn[], persona: PersonaDefinition) => Promise<GeneratePersonaTurnResult>;
  /** Ticket #27: the separate detection path PRD §12.1 requires — runs on every learner turn, gating whether the normal persona pipeline below even runs. */
  detectSafetyTrigger: (client: Anthropic, learnerText: string) => Promise<SafetyCategory>;
  annotateText: (text: string) => AnnotatedText;
  synthesizeSpeech: (client: ElevenLabsClient, voiceId: string, text: string, handlers?: TtsEventHandlers) => Promise<unknown>;
  anthropicClient: Anthropic;
  elevenLabsClient: ElevenLabsClient;
  elevenLabsApiKey: string;
  /** Ticket #34: the connection's initial/default persona — Валентина in production (server.ts), overridable per session via `selectPersona` once `session_start` names a different one. */
  persona: PersonaDefinition;
  /** The initial/default voice id, paired with `persona` above — also overridable via `selectPersona`. */
  voiceId: string;
  sendMessage: (message: ServerMessage) => void;
  /**
   * Ticket #29: posts one artefact per turn to app-service, once
   * `sessionStart` has been called with a real session id — the
   * persistence link docs/adr/0022 found missing and built. Returns the
   * new row's id (so a later barge-in can be attributed to it) or `null`
   * on any failure; a recording failure must never affect the live
   * pipeline (ARCHITECTURE.md: "Voice has zero DB mid-turn"), so callers
   * always treat this as fire-and-forget. Optional: undefined in tests
   * that don't exercise the observability path — those existing tests
   * don't need to change to keep passing.
   */
  recordTurn?: (sessionId: string, turn: RecordedTurnInput) => Promise<string | null>;
  /** Ticket #29: records a barge-in's elapsed ms since the interrupted persona turn's own `t5FirstAudio` — docs/adr/0022's false-interruption-rate signal. Also fire-and-forget/optional, same reasoning as `recordTurn`. */
  recordInterruption?: (turnId: string, interruptedAfterMs: number) => Promise<void>;
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
 *
 * Wording deliberately says "didn't understand" (не поняла), not
 * "didn't hear" (не расслышала) — matching PRD §5.7's own framing of
 * this mechanic exactly ("doesn't understand you"), not a hard-of-hearing
 * characterization of the persona, which was never the intent here.
 */
const DIDNT_UNDERSTAND_LINE = 'Прости, я не поняла — повтори, пожалуйста?';

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
  /** Ticket #29: the real session id, set once `session_start` arrives (server.ts). Turn recording/tracing is a no-op until this is set — there's no session to attribute a turn to yet. */
  private sessionId: string | null = null;
  /** Ticket #29: ms of audio actually forwarded to the STT vendor for the utterance currently in flight — `cost.ts`'s `estimateSttCostUsd` input. Accumulated in `pushAudioFrame`, read and reset at the top of `handleTurnDetected`. */
  private speechAudioMsThisTurn = 0;
  /**
   * Ticket #29: tracks the most recently *started-speaking* persona
   * turn, for false-interruption-rate (docs/adr/0022). Set synchronously
   * in the TTS `onChunk` handler the moment her audio actually starts —
   * not after `recordTurn`'s HTTP round-trip resolves — because a
   * barge-in can land before that promise settles; waiting for it would
   * leave this pointing at the *previous* turn during exactly the window
   * a real interruption needs to attribute correctly. `turnId` is filled
   * in-place once the DB write resolves; a barge-in landing before that
   * happens has nothing to attribute to and is silently not recorded
   * (disclosed, narrow gap — not a correctness issue like misattribution
   * would be).
   */
  private lastPersonaTurn: PersonaTurnMarker | null = null;
  /** Ticket #34: the persona this session is actually talking to — starts as `deps.persona` (Валентина, by default), swappable once via `selectPersona` before any turn runs. One persona per session (PRD §6.4: "talk to her daily"), not a mid-conversation switch. */
  private activePersona: PersonaDefinition;
  /** Paired with `activePersona` — the ElevenLabs voice id for whichever persona is currently active. */
  private activeVoiceId: string;

  constructor(private readonly deps: TurnOrchestratorDeps) {
    this.vadGate = new VadGate(deps.vadConfig ?? DEFAULT_VAD_CONFIG);
    this.activePersona = deps.persona;
    this.activeVoiceId = deps.voiceId;
  }

  get currentState(): OrchestratorState {
    return this.state;
  }

  /** Ticket #29: called from server.ts on the `session_start` message — the real session id every subsequent `recordTurn`/`recordInterruption` call needs. */
  sessionStart(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /** Ticket #34 / docs/adr/0023: called from server.ts when `session_start` names a persona other than the connection-time default. `voiceId` is supplied by the caller (server.ts resolves it from env) — this class stays env-free, matching the rest of this pipeline's separation between pure orchestration and vendor-config resolution. */
  selectPersona(persona: PersonaDefinition, voiceId: string): void {
    this.activePersona = persona;
    this.activeVoiceId = voiceId;
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
    // Ticket #29: only frames actually forwarded to the vendor count toward STT cost — this line, not every frame pushAudioFrame receives (many return early above: held, pre-speech silence).
    this.speechAudioMsThisTurn += frameDurationMs;
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

    // No STT stage ran for typed input — zero attributable STT cost (ticket #29's cost.ts).
    await this.runPersonaCascade(myToken, trimmed, t0TurnDetected, t1SttFinal, 0);
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
    this.recordInterruptionIfAny();
  }

  /** Ticket #29: fires exactly when a real barge-in happens (`handleBargeIn`'s only caller) — see `lastPersonaTurn`'s own doc comment for why this reads a synchronously-set marker rather than waiting on `recordTurn`'s promise. */
  private recordInterruptionIfAny(): void {
    const marker = this.lastPersonaTurn;
    this.lastPersonaTurn = null;
    if (!marker || !marker.turnId || !this.deps.recordInterruption)
      return;
    const now = this.deps.now ?? Date.now;
    const interruptedAfterMs = Math.max(0, now() - marker.audioStartMs);
    void this.deps.recordInterruption(marker.turnId, interruptedAfterMs).catch((error) => {
      console.error('[turn-orchestrator] failed to record interruption', { error });
    });
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
    // Ticket #29: captures this utterance's real STT-forwarded audio duration and resets the accumulator for the next one — must happen here, before any `await`, not inside beginTurn (which runs before speech_end's own frame finishes accumulating).
    const sttAudioMs = this.speechAudioMsThisTurn;
    this.speechAudioMsThisTurn = 0;

    let transcript: SttTranscript;
    try {
      transcript = await new Promise<SttTranscript>((resolve, reject) => {
        this.pendingTranscript = { resolve, reject };
      });
    }
    catch {
      if (myToken !== this.generationToken)
        return;
      this.respondWithDidntCatchThat(myToken, t0TurnDetected, undefined, sttAudioMs);
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
      this.respondWithDidntCatchThat(myToken, t0TurnDetected, t1SttFinal, sttAudioMs, transcript.text);
      return;
    }

    await this.runPersonaCascade(myToken, transcript.text, t0TurnDetected, t1SttFinal, sttAudioMs);
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
  private async runPersonaCascade(myToken: number, learnerText: string, t0TurnDetected: number, t1SttFinal: number, sttAudioMs: number): Promise<void> {
    const now = this.deps.now ?? Date.now;
    this.history.push({ speaker: 'learner', text: learnerText });
    this.recordLearnerTurn(learnerText, sttAudioMs);
    const t2PersonaStart = now();
    // A snapshot, not the live mutable array: `this.history` gets the
    // persona's own reply pushed onto it a few lines below, and nothing
    // about `generatePersonaTurn`'s contract promises it won't hold onto
    // the reference it's given (it doesn't today, but that's an
    // implementation detail, not a guarantee) — passing a copy is what
    // "generate this turn from exactly this history" actually means.
    const generated = await this.deps.generatePersonaTurn(this.deps.anthropicClient, [...this.history], this.activePersona);
    if (myToken !== this.generationToken)
      return;
    const t3PersonaComplete = now();
    this.history.push({ speaker: 'persona', text: generated.turn.text });
    this.deps.sendMessage({ type: 'persona_turn', text: generated.turn.text, comprehension: generated.turn.comprehension, affect: generated.turn.affect });

    const annotated = this.deps.annotateText(generated.turn.text);
    const t4StressAnnotated = now();

    this.state = 'speaking';
    // Ticket #29: a real barge-in can land in the gap between `state`
    // flipping to 'speaking' above and the first TTS chunk actually
    // arriving below (synthesis is still fetching sentence one's audio)
    // — clearing this now means that window correctly finds no marker
    // to misattribute to, rather than stale-pointing at the *previous*
    // persona turn (which recordInterruptionIfAny would otherwise happily
    // — and wrongly — mark as interrupted).
    this.lastPersonaTurn = null;
    let finalTimestamps: TurnTimestamps | null = null;
    await this.deps.synthesizeSpeech(this.deps.elevenLabsClient, this.activeVoiceId, annotated.text, {
      onChunk: (chunk, sentenceIndex) => {
        if (myToken !== this.generationToken)
          return;
        // Ticket #29 / docs/adr/0022: recorded here, at the *first* chunk —
        // not after the whole (possibly multi-sentence) synthesis finishes.
        // t5FirstAudio genuinely means "first chunk ready" (messages.ts's
        // own doc comment), and recording here is what makes the turn id
        // available for `recordInterruptionIfAny` to attribute a barge-in
        // to *while she's still speaking* — recording only after the full
        // cascade completes would mean a real interruption (which, by
        // definition, happens during this exact window) could never find
        // a turn id to attach to at all.
        if (!finalTimestamps) {
          finalTimestamps = { t0TurnDetected, t1SttFinal, t2PersonaStart, t3PersonaComplete, t4StressAnnotated, t5FirstAudio: now() };
          this.recordPersonaTurn(generated.turn.text, finalTimestamps, generated.usage, annotated.text.length);
        }
        this.deps.sendMessage({ type: 'tts_chunk', sentenceIndex, audioBase64: chunk.audioBase64 });
      },
    });
    if (myToken !== this.generationToken)
      return;
    // Every sentence's synthesis failed (tts.ts's onChunk was never called at all) — still worth persisting, with t5 collapsed to t4 since no real "audio start" ever happened.
    if (!finalTimestamps) {
      finalTimestamps = { t0TurnDetected, t1SttFinal, t2PersonaStart, t3PersonaComplete, t4StressAnnotated, t5FirstAudio: t4StressAnnotated };
      this.recordPersonaTurn(generated.turn.text, finalTimestamps, generated.usage, annotated.text.length);
    }

    this.sendTurnComplete(finalTimestamps);
    this.state = 'listening';
  }

  /** Ticket #29: fire-and-forget — a recording failure must never affect the live turn (docs/adr/0022). No-op when `sessionId`/`recordTurn` aren't set (tests, or before `session_start` arrives). */
  private recordLearnerTurn(content: string, sttAudioMs: number): void {
    if (!this.sessionId || !this.deps.recordTurn)
      return;
    const costUsd = estimateSttCostUsd(sttAudioMs / 1000);
    void this.deps.recordTurn(this.sessionId, { speaker: 'learner', content, learnerRegister: this.activePersona.learnerRegister, costUsd }).catch((error) => {
      console.error('[turn-orchestrator] failed to record learner turn', { error });
    });
  }

  /**
   * Ticket #29: fire-and-forget, same reasoning as `recordLearnerTurn`.
   * Sets `lastPersonaTurn` synchronously (before the HTTP call even
   * starts) so `recordInterruptionIfAny` has an `audioStartMs` to work
   * with immediately; `turnId` is filled in-place once the DB write
   * resolves. A barge-in landing before that resolution has nothing to
   * attribute to yet and is silently not recorded — narrow, and far
   * better than the alternative of recording nothing that starts speaking
   * at all until the entire (possibly multi-sentence) synthesis finishes.
   */
  private recordPersonaTurn(content: string, timestamps: TurnTimestamps, usage: GeneratePersonaTurnResult['usage'], ttsCharacterCount: number): void {
    if (!this.sessionId || !this.deps.recordTurn)
      return;
    const sessionId = this.sessionId;
    const marker: PersonaTurnMarker = { turnId: null, audioStartMs: timestamps.t5FirstAudio };
    this.lastPersonaTurn = marker;
    const costUsd = estimateLlmCostUsd(usage) + estimateTtsCostUsd(ttsCharacterCount);
    void this.deps.recordTurn(sessionId, { speaker: 'persona', content, personaRegister: this.activePersona.personaRegister, timings: timestamps, costUsd })
      .then((turnId) => {
        if (!turnId)
          return;
        logTrace(sessionId, turnId, timestamps);
        marker.turnId = turnId;
      })
      .catch((error) => {
        console.error('[turn-orchestrator] failed to record persona turn', { error });
      });
  }

  private respondWithDidntCatchThat(myToken: number, t0TurnDetected: number, t1SttFinal?: number, sttAudioMs = 0, learnerContent?: string): void {
    if (myToken !== this.generationToken)
      return;
    const now = this.deps.now ?? Date.now;
    const timestamp = t1SttFinal ?? now();
    this.deps.sendMessage({ type: 'persona_turn', text: DIDNT_UNDERSTAND_LINE, comprehension: 'not_understood', affect: 'concerned' });
    // Collapsed: no real per-stage timing exists for a turn that skipped LLM/TTS entirely.
    const timestamps: TurnTimestamps = { t0TurnDetected, t1SttFinal: timestamp, t2PersonaStart: timestamp, t3PersonaComplete: timestamp, t4StressAnnotated: timestamp, t5FirstAudio: timestamp };
    this.sendTurnComplete(timestamps);
    if (this.sessionId && this.deps.recordTurn) {
      // Ticket #29: learner content is only recorded when it's actually known — the STT-vendor-error path (handleTurnDetected's catch) has no transcript at all, only the low-confidence path does.
      if (learnerContent !== undefined) {
        const sttCost = estimateSttCostUsd(sttAudioMs / 1000);
        void this.deps.recordTurn(this.sessionId, { speaker: 'learner', content: learnerContent, learnerRegister: this.activePersona.learnerRegister, costUsd: sttCost }).catch((error) => {
          console.error('[turn-orchestrator] failed to record learner turn', { error });
        });
      }
      void this.deps.recordTurn(this.sessionId, { speaker: 'persona', content: DIDNT_UNDERSTAND_LINE, personaRegister: this.activePersona.personaRegister, timings: timestamps }).catch((error) => {
        console.error('[turn-orchestrator] failed to record persona turn', { error });
      });
    }
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
    // Ticket #29: this path deliberately doesn't record a turn (docs/adr/0022 — persisting distress-disclosure content deserves its own explicit product decision, not a default made inside this ticket). Clearing the marker here matters: without it, a barge-in during *this* playback would misattribute the interruption to whatever normal persona turn happened before it.
    this.lastPersonaTurn = null;
    let t5FirstAudio: number | null = null;
    await this.deps.synthesizeSpeech(this.deps.elevenLabsClient, this.activeVoiceId, text, {
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
