import type { SafetyTriggerCategory } from './safety-detection';
import { z } from 'zod';

/**
 * Client/server message schemas — the second of Zod's three boundaries
 * (PRD §7.8). Ticket #18 extends the ticket #11 skeleton (`ping` only)
 * with the real pipeline messages: audio in, transcript/persona-turn/
 * audio-chunk out, plus turn-lifecycle and hold-to-think control.
 *
 * Transport is chunked audio over this same WebSocket, not a WebRTC peer
 * connection — see docs/adr/0017 for why, and for the disclosed
 * consequence (no echo cancellation on the audio this carries).
 */

const audioChunkMessageSchema = z.object({
  type: z.literal('audio_chunk'),
  /** Mono, 16-bit PCM, base64-encoded (mobile downmixes+encodes before sending — see pcm-encode.ts). */
  pcmBase64: z.string(),
  sampleRateHz: z.number().int().positive(),
});

const sessionStartMessageSchema = z.object({
  type: z.literal('session_start'),
  learnerId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

/**
 * Purely a clarity/instrumentation signal, not load-bearing for the "no
 * audio sent to STT while held" requirement (PRD §7.9) — the client
 * already achieves that by simply not sending `audio_chunk` messages
 * while held (see mobile's `use-live-converse-session.ts`). Sent anyway
 * so server-side turn state and the six-timestamp log can distinguish
 * "the learner is holding" from "the learner is just being quiet."
 */
const holdStartMessageSchema = z.object({ type: z.literal('hold_start') });
const holdEndMessageSchema = z.object({ type: z.literal('hold_end') });

/** Ticket #32 (PRD §12.3): the text-input path — bypasses VAD/STT entirely, funnels into the same downstream pipeline as a voice turn (turn-orchestrator.ts's `submitTextInput`). */
const textInputMessageSchema = z.object({
  type: z.literal('text_input'),
  text: z.string().min(1),
});

/**
 * PRD §6.2 / docs/adr/0002: "she opens, not the learner." Sent once the
 * client is actually ready to receive `tts_chunk`s — not implied by the
 * WS connection opening (server.ts's connection setup runs before the
 * client has necessarily mounted its playback UI), and not folded into
 * `session_start` above (that message is a legacy no-op the client
 * still sends; auth already comes from the upgrade-time token). No
 * payload: `turn-orchestrator.ts`'s `openConversation` needs nothing
 * beyond "go."
 */
const beginConversationMessageSchema = z.object({ type: z.literal('begin_conversation') });

export const clientMessageSchema = z.union([
  z.object({
    type: z.literal('ping'),
    /** Echoed back verbatim so the client can match responses to requests. */
    requestId: z.string().optional(),
  }),
  audioChunkMessageSchema,
  sessionStartMessageSchema,
  holdStartMessageSchema,
  holdEndMessageSchema,
  textInputMessageSchema,
  beginConversationMessageSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

/**
 * Ticket #18 AC: "six timestamps recorded per turn (t0 turn-detect
 * through t5 first audio)." PRD doesn't name each of the six explicitly
 * beyond the endpoints — this interpretation maps them to the pipeline's
 * own stage boundaries (VAD → STT → LLM → stress annotation → TTS),
 * documented here since it's a judgment call, not a literal PRD list:
 * - t0: turn detected (VAD signals end of learner speech)
 * - t1: STT final transcript received
 * - t2: persona LLM generation started
 * - t3: persona LLM generation complete
 * - t4: stress annotation complete / TTS request dispatched
 * - t5: first TTS audio chunk ready
 */
export type TurnTimestamps = {
  t0TurnDetected: number;
  t1SttFinal: number;
  t2PersonaStart: number;
  t3PersonaComplete: number;
  t4StressAnnotated: number;
  t5FirstAudio: number;
};

/**
 * No Zod schema for outbound messages, deliberately — Zod belongs at
 * untrusted boundaries (PRD §7.8), and the server's own output isn't one
 * from its own perspective. `send()` in server.ts is the single
 * construction site, so there's nowhere for a hand-written literal to
 * drift from this type.
 */
export type ServerMessage
  = | { type: 'pong'; requestId: string | undefined; serverTime: number }
    | { type: 'error'; message: string }
    /** The learner's transcript, updated as STT produces partial results — for live "what did I just say" UI feedback, not authoritative until `transcript_final`. */
    | { type: 'transcript_partial'; text: string }
    | { type: 'transcript_final'; text: string }
    /** In-character filler (PRD §7.3: "ну…", "сейчас…") sent immediately on turn-detect, before the real persona turn is ready — masks generation latency. */
    | { type: 'persona_filler'; text: string }
    /**
     * The real persona turn, once generated (or the "didn't catch that"
     * line — see turn-orchestrator.ts's low-confidence handling, which
     * reuses this same message type rather than inventing a separate
     * one). `translation`: PRD §6.2's tap-to-reveal, same UI slot the
     * scripted demo's hand-authored script already has — every call site
     * that sends this message provides one, including the two fixed
     * lines (opening line, "didn't catch that"), not just real
     * LLM-generated replies.
     */
    | { type: 'persona_turn'; text: string; comprehension: string; affect: string; translation: string }
    /** One sentence's synthesized audio — sent as each becomes ready (tts.ts's onChunk), not batched until the whole turn finishes. */
    | { type: 'tts_chunk'; sentenceIndex: number; audioBase64: string }
    /** All of this turn's audio has been sent; also carries the six-timestamp log for this turn. */
    | { type: 'turn_complete'; timestamps: TurnTimestamps }
    /** The learner started speaking while she was still talking — stop local playback immediately (PRD §7.10: "interruption must stop playback, cancel in-flight TTS, cancel LLM generation, and reset stream state"). The cancellation itself happens server-side; this tells the client to react. */
    | { type: 'barge_in' }
    /**
     * Ticket #27 / PRD §12.1: the out-of-character safety escape hatch —
     * serious distress disclosure or an attempt to sexualize the persona.
     * A distinct message type, not a `persona_turn` variant, because this
     * is deliberately *not* Валентина speaking in character (see
     * safety-detection.ts); `text` is still followed by real `tts_chunk`
     * audio and a `turn_complete`, same as any other turn.
     */
    | { type: 'safety_response'; category: SafetyTriggerCategory; text: string };
