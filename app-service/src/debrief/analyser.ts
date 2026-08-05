import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { z } from 'zod';
import type { ObservationInput } from './debrief';

/** ADR-0003's own model pick (voice-service/persona-turn.ts), reused here — no separate bake-off for this call. */
const MODEL = 'claude-sonnet-5';
/**
 * 'medium', not persona-turn.ts's 'low' — that call generates one 1-2
 * sentence reply; this one reads a whole transcript and has to actually
 * reason about which mistakes recurred and which structure they belong
 * to, closer to a real classification task than a dialogue turn.
 */
const EFFORT = 'medium' as const;
const MAX_TOKENS = 1500;
/**
 * The analyser is allowed to notice more than the three the Debrief
 * screen shows (`debrief.ts`'s own `DEBRIEF_ITEM_COUNT`) — `debrief.ts`'s
 * `rankAndPromoteDebrief` is what narrows the field down, per PRD §8:
 * "we keep everything the analyser noticed even though only three are
 * shown. That is the training data for tuning the ranking function."
 * Capping the schema at 8 bounds a single response's cost/latency
 * without meaningfully constraining what a real session (a handful of
 * turns) could ever produce candidates for.
 */
const MAX_OBSERVATIONS = 8;

const analyserObservationSchema = z.object({
  kind: z.enum(['grammar_error', 'stress_error', 'vocab_gap', 'register_error']),
  /** Short snake_case grammatical category (e.g. 'genitive_plural') when one clearly applies — `learner_structures`/`scenario_complications` read/write this same key elsewhere in the schema. Omitted, not guessed, when no clean category fits. */
  structureKey: z.string().min(1).optional(),
  /** Whether this specific pattern actually broke communication in the transcript (she had to ask for clarification), not every minor slip — same bar `ObservationInput.impeded` already documents. */
  impeded: z.boolean(),
  /**
   * Cyrillic, always — this quotes the learner's own actual incorrect
   * Russian next to the correct form (e.g. "Мы иска́ли, not мы и́щем."),
   * matching debrief-fixture.ts's own hand-authored examples field-for-
   * field. Never transliterated: the point being illustrated is a
   * specific Russian word/ending, and romanizing it would erase the
   * exact thing the learner needs to recognize.
   */
  title: z.string().min(1),
  /** Plain-English explanation the learner can act on — the only field of the four that translates. */
  body: z.string().min(1),
  /** Short flag like "impeded communication · 2×" — omitted, not padded with a generic value, when there's nothing notable to call out beyond the title/body. */
  tag: z.string().min(1).optional(),
});

const analyserOutputSchema = z.object({
  observations: z.array(analyserObservationSchema).max(MAX_OBSERVATIONS),
});

export type AnalyserObservation = z.infer<typeof analyserObservationSchema>;

export type TranscriptTurnForAnalysis = {
  speaker: 'persona' | 'learner';
  content: string;
};

/**
 * PRD §5.4's own framing ("diff intent against production," "impeded
 * communication") plus the exact title convention debrief-fixture.ts
 * already established, given as the system prompt's own worked examples
 * rather than only described in prose — structured-output schemas
 * constrain shape, not style, and title's Cyrillic-quoting convention is
 * a style choice a schema can't enforce on its own.
 */
const SYSTEM_PROMPT = `You are the post-session analyser for a Russian conversation-practice app. You will be given the full transcript of one practice session between a Russian-speaking persona and an English-speaking learner (persona lines are in Russian; learner lines may be in Russian, English, or a mix).

Identify the real Russian grammar, stress, vocabulary, or register patterns the LEARNER struggled with — look at the learner's own lines, not the persona's. Only report patterns with real evidence in the transcript; an empty list is the correct answer when nothing stood out.

For each pattern:
- "kind": one of grammar_error, stress_error, vocab_gap, register_error.
- "structureKey": a short snake_case grammatical category (e.g. "genitive_plural", "aspect_perfective", "dative_case") when one clearly applies. Omit it rather than guessing when no clean category fits.
- "impeded": true only if this specific mistake actually broke communication in the transcript (the persona had to ask what the learner meant), not every minor slip.
- "title": ALWAYS in Cyrillic. Quote the learner's own incorrect Russian next to the correct form, in this exact style:
  - "Мы иска́ли, not мы и́щем."
  - "в гараже́, not в гара́ж."
  - "Stress: нашла́сь, not на́шлась."
  Never transliterate or romanize this field — the point is the exact Russian word or ending, and romanizing it erases that.
- "body": a short, plain-English explanation the learner can act on.
- "tag": optional, a short phrase like "impeded communication · 2×" when a pattern recurred or genuinely blocked understanding — omit otherwise.`;

function formatTranscript(transcript: TranscriptTurnForAnalysis[]): string {
  if (transcript.length === 0)
    return '(empty transcript — no turns were recorded for this session)';
  return transcript.map(turn => `${turn.speaker === 'persona' ? 'Persona' : 'Learner'}: ${turn.content}`).join('\n');
}

/**
 * The full request, built fresh per call — pure and independently
 * testable, same reasoning `buildPersonaTurnRequest`
 * (voice-service/persona-turn.ts) already documents for keeping the
 * untestable network seam as thin as possible.
 *
 * Deliberately not return-type-annotated: this calls
 * `client.messages.parse` below (matching judge.ts's, voice-service's,
 * own non-streaming precedent — a post-session batch analysis has no
 * mid-stream UI to feed, so there's no reason to pay `.stream()`'s
 * extra complexity here), and `.parse`'s generic `ExtractParsedContentFromParams`
 * can only recover `analyserOutputSchema`'s specific parsed type from
 * this function's *inferred* literal return type — any explicit
 * `MessageCreateParamsNonStreaming`/`ParseableMessageCreateParams`
 * annotation here widens `output_config.format` back to `JSONOutputFormat`
 * and `parsed_output` resolves to `never` at the call site. Same
 * `safety-detection.ts` (voice-service) already calls out for exactly
 * this reason, on the same SDK.
 */
export function buildAnalyserRequest(transcript: TranscriptTurnForAnalysis[]) {
  const messages: MessageParam[] = [{ role: 'user', content: formatTranscript(transcript) }];
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages,
    // Real reasoning about which mistakes recurred and how to categorize
    // them benefits from thinking, unlike persona-turn.ts's dialogue
    // generation (ADR-0003 disables it there for exactly the opposite
    // reason — 1-2 sentence turns aren't reasoning-heavy).
    //
    // `type: 'adaptive'`, not `'enabled'` + `budget_tokens`: this model
    // rejects the old fixed-budget form outright ("thinking.type.enabled
    // is not supported for this model") when `output_config.effort` is
    // also set — the two are meant to be used together, `effort` is what
    // now controls how much the model thinks. This was a 100%-repro
    // BadRequestError on every single analyser call (silently swallowed
    // by the catch below, which is *why* every session's Debrief showed
    // zero real patterns regardless of transcript content — verified by
    // grepping the server's own logs for "[analyser] session analysis
    // failed", 2026-08-04).
    thinking: { type: 'adaptive' as const },
    output_config: {
      effort: EFFORT,
      format: zodOutputFormat(analyserOutputSchema),
    },
  };
}

function toObservationInput(observation: AnalyserObservation): ObservationInput {
  const detail: Record<string, unknown> = { title: observation.title, body: observation.body };
  if (observation.tag)
    detail.tag = observation.tag;
  return {
    kind: observation.kind,
    structureKey: observation.structureKey,
    impeded: observation.impeded,
    detail,
  };
}

/**
 * Ticket #14+'s own "post-session analyser," finally built: classifies a
 * session's real transcript into structured `observations`
 * (`recordObservations`' own input shape) instead of requiring a test
 * harness to fabricate them. Never throws — a failed or malformed
 * analysis degrades to "no patterns found" (empty array) rather than
 * failing session finalization, same fail-open reasoning
 * `generatePersonaTurn`'s filler-line fallback already establishes for
 * the persona LLM call: a broken analyser call is not a reason to block
 * the learner from reaching their Debrief screen, it just means that
 * session's Debrief has fewer/no real patterns this time.
 */
export async function analyseSessionTranscript(client: Anthropic, transcript: TranscriptTurnForAnalysis[]): Promise<ObservationInput[]> {
  if (transcript.length === 0)
    return [];

  const request = buildAnalyserRequest(transcript);
  try {
    const message = await client.messages.parse(request);
    if (!message.parsed_output) {
      console.error('[analyser] session analysis resolved without parsed_output');
      return [];
    }
    return message.parsed_output.observations.map(toObservationInput);
  }
  catch (error) {
    console.error('[analyser] session analysis failed', error);
    return [];
  }
}
