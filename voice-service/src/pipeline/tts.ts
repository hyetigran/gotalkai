import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { z } from 'zod';
import { splitIntoSentences } from './split-sentences';

/**
 * Ticket #17: real TTS integration via ElevenLabs (docs/adr/0013's
 * vendor decision). Unlike STT (stt.ts, which had to hand-roll a
 * WebSocket client), the official `@elevenlabs/elevenlabs-js` SDK does
 * properly wrap text-to-speech, including `convertWithTimestamps` — the
 * endpoint this module uses, since AC #3 requires capturing
 * character-level alignment data alongside the audio.
 *
 * Zod validates every vendor response (PRD §7.8: "Zod belongs at
 * untrusted boundaries") — the same house rule stt.ts follows for
 * ElevenLabs' STT messages and persona.ts follows for the persona LLM's
 * output. A malformed or unexpected response degrades to `onError`
 * rather than propagating a raw, unchecked shape.
 */

const characterAlignmentSchema = z.object({
  characters: z.array(z.string()),
  characterStartTimesSeconds: z.array(z.number()),
  characterEndTimesSeconds: z.array(z.number()),
});

const ttsResponseSchema = z.object({
  audioBase64: z.string(),
  alignment: characterAlignmentSchema.optional(),
});

export type TtsChunk = {
  /** One sentence's synthesized audio, base64-encoded (the format ElevenLabs itself returns — not re-encoded here). */
  audioBase64: string;
  /** Character-level timing data for this sentence, when the vendor returns it — AC #3: "captured... even though nothing consumes it yet" (the Rive face, a later ticket). */
  alignment?: z.infer<typeof characterAlignmentSchema>;
};

export type TtsEventHandlers = {
  /** Fires as soon as each sentence's audio is ready — the real "start playback early" hook a caller (ticket #18) would use. Matches persona-turn.ts's `onPartial`/stt.ts's `SttEventHandlers` shape: an options bag, not a bare positional callback. */
  onChunk?: (chunk: TtsChunk, sentenceIndex: number) => void;
  /** Fires on a vendor call failure or an unexpected response shape for any one sentence — the rest of the turn's sentences are still attempted (a failure on sentence 2 shouldn't discard sentence 1's already-delivered audio), matching the graceful-degradation contract generatePersonaTurn (persona-turn.ts) and stt.ts both establish for their own vendor boundaries. */
  onError?: (error: Error, sentenceIndex: number) => void;
};

/**
 * `eleven_v3` specifically — required for IPA phoneme tags in non-English
 * languages (docs/adr/0013), which is how stress-annotation.ts's output
 * (via phoneme-format.ts) reaches ElevenLabs at all. Every persona
 * utterance in this pipeline is phoneme-tagged (ticket #16), so there is
 * no plain-text synthesis path this pins v3 unnecessarily for.
 */
const MODEL_ID = 'eleven_v3';

/**
 * Ticket #17 AC #1/#3: synthesizes one persona turn as a sequence of
 * per-sentence chunks — the unit PRD's own "sentence-chunked TTS"
 * language names, and the actual streaming behavior this ticket asks
 * for: a caller gets sentence 1's audio (and can start playback)
 * immediately, not after the whole multi-sentence turn finishes
 * generating. Each sentence's own synthesis is requested as a single
 * call (`convertWithTimestamps`), not the lower-level frame-by-frame
 * streaming endpoint — for this product's short (1-2 sentence) turns,
 * sentence-level chunking is the latency win PRD actually asks for; the
 * additional complexity of intra-sentence streaming isn't warranted
 * here (see docs/adr/0016).
 *
 * A failure on one sentence (vendor error, or a response that fails
 * `ttsResponseSchema`) is reported via `onError` and that sentence is
 * skipped — synthesis continues with the remaining sentences rather than
 * throwing and discarding whatever chunks already succeeded. The
 * returned array only contains sentences that actually succeeded.
 */
export async function synthesizeSpeech(
  client: ElevenLabsClient,
  voiceId: string,
  text: string,
  handlers: TtsEventHandlers = {},
): Promise<TtsChunk[]> {
  const sentences = splitIntoSentences(text);
  const chunks: TtsChunk[] = [];
  for (const [index, sentence] of sentences.entries()) {
    try {
      const response = await client.textToSpeech.convertWithTimestamps(voiceId, {
        text: sentence,
        modelId: MODEL_ID,
        outputFormat: 'mp3_44100_128',
      });
      const parsed = ttsResponseSchema.safeParse(response);
      if (!parsed.success) {
        handlers.onError?.(new Error(`malformed TTS response for sentence ${index}: ${parsed.error.message}`), index);
        continue;
      }
      const chunk: TtsChunk = { audioBase64: parsed.data.audioBase64, alignment: parsed.data.alignment };
      chunks.push(chunk);
      handlers.onChunk?.(chunk, index);
    }
    catch (error) {
      handlers.onError?.(error instanceof Error ? error : new Error(String(error)), index);
    }
  }
  return chunks;
}
