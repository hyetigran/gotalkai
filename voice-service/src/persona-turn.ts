import type { ParseableMessageCreateParams } from '@anthropic-ai/sdk';
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  buildValentinaSystemPrompt,
  FILLER_LINE,
  PERSONA_AFFECT_VALUES,
  PERSONA_COMPREHENSION_VALUES,
  personaTurnSchema,
  toMessageParams,
} from './persona';
import type { PersonaAffect, PersonaComprehension, PersonaTurn, TranscriptTurn } from './persona';

/** ADR-0003: Claude Sonnet 5, thinking disabled, effort low/medium. Low, not medium — turns are 1-2 sentences (ADR-0003's own reasoning), not worth the latency of a higher tier. */
const MODEL = 'claude-sonnet-5';
const EFFORT = 'low';
/** Generous for a 1-2 sentence Russian reply plus JSON schema overhead (comprehension/affect enums + text). Not tuned against real output yet — no real API access in this environment to measure against (see docs/adr/0010). */
const MAX_TOKENS = 300;

export type PartialPersonaFields = {
  comprehension?: PersonaComprehension;
  affect?: PersonaAffect;
};

const COMPREHENSION_PATTERN = new RegExp(`"comprehension"\\s*:\\s*"(${PERSONA_COMPREHENSION_VALUES.join('|')})"`);
const AFFECT_PATTERN = new RegExp(`"affect"\\s*:\\s*"(${PERSONA_AFFECT_VALUES.join('|')})"`);

/**
 * Ticket #14 AC #4: "comprehension/affect fields parseable incrementally
 * mid-stream, ahead of full-object validation" (PRD §6.5/§7.8). Pure —
 * scans a possibly-incomplete JSON snapshot for the two early fields
 * without requiring the object to be parseable yet (mid-stream it usually
 * isn't: a dangling `"text": "она сказала...` with no closing quote/brace).
 *
 * A targeted regex is safe here specifically because both fields are
 * closed enums (persona.ts) with no escaping concerns — this is not a
 * general partial-JSON parser and must not be reused for `text`, which is
 * free-form Russian prose that can legitimately contain escaped quotes.
 * Depends on `persona.ts`'s schema field order (comprehension/affect
 * before text) actually being what the model streams first — see that
 * file's comment on why that ordering is load-bearing, not cosmetic.
 */
export function extractPartialFields(jsonSnapshot: string): PartialPersonaFields {
  const comprehensionMatch = COMPREHENSION_PATTERN.exec(jsonSnapshot);
  const affectMatch = AFFECT_PATTERN.exec(jsonSnapshot);
  return {
    comprehension: comprehensionMatch?.[1] as PersonaComprehension | undefined,
    affect: affectMatch?.[1] as PersonaAffect | undefined,
  };
}

/**
 * The full request, built fresh per call — pure and independently
 * testable, so the streaming/network seam in `generatePersonaTurn` stays
 * as thin as possible (this environment has no real `ANTHROPIC_API_KEY`,
 * see docs/adr/0010, so keeping the untestable surface minimal matters
 * more than usual here).
 */
export function buildPersonaTurnRequest(transcript: TranscriptTurn[]): ParseableMessageCreateParams {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: buildValentinaSystemPrompt(),
    messages: toMessageParams(transcript),
    // ADR-0003: thinking disabled — dialogue generation for 1-2 sentence
    // turns is not reasoning-heavy work.
    thinking: { type: 'disabled' },
    output_config: {
      effort: EFFORT,
      format: zodOutputFormat(personaTurnSchema),
    },
  };
}

/**
 * Ticket #14 AC #5 / PRD §7.8's failure path: a filler line, never a raw
 * `comprehension`/`affect` guess. `comprehension: 'partial'` and
 * `affect: 'warm'` are documented placeholders, not a real signal — the
 * model's actual output was unusable, so there is nothing honest to report
 * for either field. `'partial'` reads as "uncertain" rather than falsely
 * claiming full understanding or failure; `'warm'` is Валентина's baseline
 * demeanor (PRD §6.4), the safest default when no real affect was produced.
 */
function buildFallbackTurn(): PersonaTurn {
  return { comprehension: 'partial', affect: 'warm', text: FILLER_LINE };
}

export type GeneratePersonaTurnResult = {
  turn: PersonaTurn;
  /** True when `turn` is the filler fallback, not a real model response — callers should skip debrief/memory writes for this turn (PRD §7.8: "log the raw output, continue", not treat it as real content). */
  fellBackToFiller: boolean;
  /** The raw (possibly incomplete or invalid) JSON text the model produced, always captured independently of whether structured-output validation succeeded — this is what PRD §7.8 means by "log the raw output" on failure, and is empty only if the stream produced no text at all. */
  rawOutput: string;
  /**
   * Ticket #29 / docs/adr/0022: captured from the Anthropic response's
   * own `usage` field (real billing data, not a token-count estimate),
   * for `cost.ts`'s `estimateLlmCostUsd`. Zeroed out only when the
   * stream itself threw before `finalMessage()` ever resolved — a real
   * call still happened and still cost something in that case, but no
   * usage figure is recoverable from a thrown stream; this is a
   * disclosed undercount for that one failure path, not a claim of
   * zero spend.
   */
  usage: { inputTokens: number; outputTokens: number; cacheCreationInputTokens: number; cacheReadInputTokens: number };
};

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };

/**
 * Ticket #14: generates one Валентина turn from a fixed transcript (AC
 * #1), streaming (AC #1), with mid-stream partial parsing for
 * `comprehension`/`affect` (AC #4 — see `extractPartialFields`), falling
 * back to an in-character filler line on any failure — malformed
 * structured output *or* a network/stream error — without crashing or
 * surfacing a raw error (AC #5). PRD §7.8 only names "validation failure"
 * explicitly, but a mid-conversation network hiccup demands the exact same
 * graceful degradation for the exact same reason (there is no way to
 * surface an error to someone mid-sentence); narrowing the catch to only
 * `AnthropicError` would leave the service crashing on the failure mode
 * that is, in production, the more likely one.
 *
 * `onPartial` fires at most once per field, the first time each of
 * `comprehension`/`affect` becomes readable in the growing JSON snapshot —
 * this is the hook the (v2, deferred) Rive face reacts through.
 */
export async function generatePersonaTurn(
  client: Anthropic,
  transcript: TranscriptTurn[],
  options: { onPartial?: (partial: PartialPersonaFields) => void } = {},
): Promise<GeneratePersonaTurnResult> {
  const request = buildPersonaTurnRequest(transcript);
  const stream = client.messages.stream(request);

  let rawOutput = '';
  let sawComprehension = false;
  let sawAffect = false;
  stream.on('text', (_delta, snapshot) => {
    rawOutput = snapshot;
    if (!options.onPartial)
      return;
    const partial = extractPartialFields(snapshot);
    const newlyAvailable: PartialPersonaFields = {};
    if (partial.comprehension && !sawComprehension) {
      newlyAvailable.comprehension = partial.comprehension;
      sawComprehension = true;
    }
    if (partial.affect && !sawAffect) {
      newlyAvailable.affect = partial.affect;
      sawAffect = true;
    }
    if (newlyAvailable.comprehension || newlyAvailable.affect)
      options.onPartial(newlyAvailable);
  });

  try {
    const message = await stream.finalMessage();
    const usage = {
      inputTokens: message.usage.input_tokens ?? 0,
      outputTokens: message.usage.output_tokens,
      cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
    };
    if (!message.parsed_output) {
      // Defensive: the SDK's own contract is that `finalMessage()` throws
      // when structured-output parsing fails (zodOutputFormat's `.parse`
      // throws inside message accumulation), so this branch shouldn't be
      // reachable in practice — but PRD §7.8's "log the raw output" applies
      // to every path that produces a filler turn, not just the one the SDK
      // is documented to take, so it gets the same logging as the catch below.
      console.error('[persona-turn] falling back to filler line: stream resolved without parsed_output', { rawOutput });
      return { turn: buildFallbackTurn(), fellBackToFiller: true, rawOutput, usage };
    }
    return { turn: message.parsed_output, fellBackToFiller: false, rawOutput, usage };
  }
  catch (error) {
    console.error('[persona-turn] falling back to filler line', { rawOutput, error });
    return { turn: buildFallbackTurn(), fellBackToFiller: true, rawOutput, usage: ZERO_USAGE };
  }
}
