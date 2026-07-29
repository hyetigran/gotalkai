import WebSocket from 'ws';
import { z } from 'zod';

/**
 * Ticket #15: real streaming STT via ElevenLabs' realtime WebSocket
 * endpoint (docs/adr/0013's vendor decision). Not a dependency of this
 * module: the official `@elevenlabs/elevenlabs-js` SDK wraps the batch
 * (whole-file) `speechToText.convert` endpoint but has no realtime
 * WebSocket client — only the message *type* definitions are exported,
 * which don't help without a client to attach them to. This module opens
 * the connection directly with `ws` (already a dependency, used
 * server-side in server.ts) and hand-rolls the wire protocol against
 * ElevenLabs' documented raw JSON schema (snake_case field names,
 * confirmed against their AsyncAPI spec — see docs/adr/0014). The SDK is
 * still the right choice for ticket #17's TTS integration, which the
 * SDK does properly wrap.
 *
 * Zod validates every incoming message (PRD §7.8: "Zod belongs at
 * untrusted boundaries") — ElevenLabs' wire messages are exactly that,
 * no less than the persona LLM's structured output (persona.ts) or the
 * client/server HTTP boundary (app-service). A malformed or
 * unexpectedly-shaped message degrades to `onError`, the same
 * never-crash contract `generatePersonaTurn` (persona-turn.ts) has for
 * its own untrusted model output.
 */

const ELEVENLABS_STT_REALTIME_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';

/**
 * AC #3: "Transcript returned with word-level confidence and n-best
 * alternatives exposed to downstream stages, not collapsed to a single
 * top-1 string." `logprob` is exposed per word, unflattened — but there
 * is no `alternatives`/n-best field here, because ElevenLabs' API does
 * not provide one at all (docs/adr/0013's disclosed, accepted gap). This
 * type does not fabricate a field the vendor doesn't return.
 */
const sttWordSchema = z.object({
  text: z.string(),
  start: z.number().optional(),
  end: z.number().optional(),
  type: z.enum(['word', 'spacing', 'audio_event']),
  /** Log-probability, range (-∞, 0] — higher (closer to 0) means higher confidence. Not a 0-100%/0-1 score; see docs/adr/0013. */
  logprob: z.number(),
});

export type SttWord = z.infer<typeof sttWordSchema>;

export type SttTranscript = {
  text: string;
  languageCode?: string;
  words: SttWord[];
};

export type SttEventHandlers = {
  onPartialTranscript?: (text: string) => void;
  onFinalTranscript?: (transcript: SttTranscript) => void;
  onError?: (error: Error) => void;
};

/**
 * The minimal `ws`-shaped surface this module actually calls —
 * injectable so tests can supply a fake without opening a real network
 * connection, the same seam `test-support/fake-anthropic.ts` uses for
 * the Anthropic SDK.
 */
export type MinimalWebSocket = {
  on: (event: 'open' | 'message' | 'error' | 'close', listener: (...args: never[]) => void) => void;
  send: (data: string) => void;
  close: () => void;
};

function defaultConnect(url: string, options: { headers: Record<string, string> }): MinimalWebSocket {
  return new WebSocket(url, options) as unknown as MinimalWebSocket;
}

// Every message carries at least this much — validated first, before any
// message_type-specific parsing, so a genuinely malformed message (missing
// message_type entirely) is rejected up front rather than reaching a
// switch statement that assumes the field exists.
const sttMessageEnvelopeSchema = z.looseObject({ message_type: z.string() });

const partialTranscriptSchema = z.object({ text: z.string() });
const finalTranscriptWithTimestampsSchema = z.object({
  text: z.string(),
  language_code: z.string().optional(),
  words: z.array(sttWordSchema).optional(),
});
const finalTranscriptSchema = z.object({ text: z.string() });
const errorPayloadSchema = z.looseObject({ error: z.string().optional() });

function handleIncomingMessage(envelope: z.infer<typeof sttMessageEnvelopeSchema>, handlers: SttEventHandlers): void {
  switch (envelope.message_type) {
    case 'partial_transcript': {
      const result = partialTranscriptSchema.safeParse(envelope);
      if (!result.success) {
        handlers.onError?.(new Error(`malformed partial_transcript message: ${result.error.message}`));
        return;
      }
      handlers.onPartialTranscript?.(result.data.text);
      return;
    }
    case 'final_transcript_with_timestamps': {
      const result = finalTranscriptWithTimestampsSchema.safeParse(envelope);
      if (!result.success) {
        handlers.onError?.(new Error(`malformed final_transcript_with_timestamps message: ${result.error.message}`));
        return;
      }
      handlers.onFinalTranscript?.({
        text: result.data.text,
        languageCode: result.data.language_code,
        words: result.data.words ?? [],
      });
      return;
    }
    case 'final_transcript': {
      // Only reachable if the session wasn't configured to request
      // timestamps — this codebase always requests them (buildSttUrl
      // below), so word-level confidence is never silently unavailable
      // in practice. Still handled, not ignored, in case that
      // configuration ever changes.
      const result = finalTranscriptSchema.safeParse(envelope);
      if (!result.success) {
        handlers.onError?.(new Error(`malformed final_transcript message: ${result.error.message}`));
        return;
      }
      handlers.onFinalTranscript?.({ text: result.data.text, words: [] });
      return;
    }
    case 'session_started':
      return;
    default:
      if (envelope.message_type.includes('error')) {
        const result = errorPayloadSchema.safeParse(envelope);
        handlers.onError?.(new Error(result.success && result.data.error ? result.data.error : `STT error: ${envelope.message_type}`));
      }
      // Other message types (committed_transcript*, etc.) aren't used by
      // this ticket's scope — acknowledged, not treated as errors.
  }
}

/**
 * Session config is passed as URL query parameters at connect time
 * (ElevenLabs' realtime protocol — not a separate config message), per
 * their documented AsyncAPI parameter list.
 */
function buildSttUrl(): string {
  const url = new URL(ELEVENLABS_STT_REALTIME_URL);
  url.searchParams.set('model_id', 'scribe_v2');
  url.searchParams.set('language_code', 'ru');
  // AC #3 depends on this: without it, the server sends plain
  // `final_transcript` (no `words[].logprob`), silently losing the
  // confidence signal this ticket exists to plumb through.
  url.searchParams.set('include_timestamps', 'true');
  return url.toString();
}

/**
 * Opens one realtime STT session. Ticket #15 AC #1/#3: real audio in,
 * transcript-with-confidence out — this is the "out to the chosen STT
 * vendor" half. The "real mic audio streams into the voice service" half
 * (receiving audio from the mobile client over its own connection, and
 * VAD-gating when to call `sendAudioChunk` at all — see vad.ts) is
 * ticket #18's job — see docs/adr/0014 for why AC #1 is read the same
 * way AC #4 explicitly is.
 */
export function createSttSession(
  apiKey: string,
  handlers: SttEventHandlers,
  connect: (url: string, options: { headers: Record<string, string> }) => MinimalWebSocket = defaultConnect,
): { sendAudioChunk: (pcmBase64: string, sampleRateHz: number, commit?: boolean) => void; close: () => void } {
  const ws = connect(buildSttUrl(), { headers: { 'xi-api-key': apiKey } });

  ws.on('message', (raw: unknown) => {
    let json: unknown;
    try {
      json = JSON.parse(String(raw));
    }
    catch (error) {
      handlers.onError?.(new Error(`failed to parse STT message as JSON: ${error instanceof Error ? error.message : String(error)}`));
      return;
    }
    const envelope = sttMessageEnvelopeSchema.safeParse(json);
    if (!envelope.success) {
      handlers.onError?.(new Error(`STT message missing message_type: ${envelope.error.message}`));
      return;
    }
    handleIncomingMessage(envelope.data, handlers);
  });

  ws.on('error', (error: unknown) => {
    handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
  });

  return {
    sendAudioChunk: (pcmBase64: string, sampleRateHz: number, commit = false) => {
      ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: pcmBase64, sample_rate: sampleRateHz, commit }));
    },
    close: () => ws.close(),
  };
}
