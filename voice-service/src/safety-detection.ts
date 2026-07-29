import type Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

/**
 * Ticket #27 / PRD §12.1: "Some users will disclose serious distress. She
 * must not handle that in character, and the base model will try.
 * Separate detection path, separate response mode. The same layer
 * handles attempts to sexualise the persona." This module is that
 * separate detection path — a dedicated classifier call, independent of
 * `persona-turn.ts`'s in-character generation, run on every learner turn
 * before (not instead of, but gating) the normal persona pipeline.
 */

export const SAFETY_CATEGORY_VALUES = ['distress', 'sexualization', 'none'] as const;
export type SafetyCategory = (typeof SAFETY_CATEGORY_VALUES)[number];
/** The two real trigger categories, excluding 'none' — what a `safety_response` message actually carries (messages.ts, turn-orchestrator.ts), named once so the three call sites can't silently drift from each other. */
export type SafetyTriggerCategory = Exclude<SafetyCategory, 'none'>;

const safetyDetectionSchema = z.object({
  category: z.enum(SAFETY_CATEGORY_VALUES),
});

/** Low effort: single-utterance classification into three closed categories, not open-ended generation — no reasoning depth needed. */
const MODEL = 'claude-sonnet-5' as const;
const EFFORT = 'low' as const;
const MAX_TOKENS = 50;

const CLASSIFIER_SYSTEM_PROMPT = `You are a safety classifier for a Russian-language conversation-practice app. You will be shown one message a learner just sent during a practice conversation with an AI conversation partner. Classify it into exactly one category:

- "distress": the message discloses serious personal distress — for example suicidal ideation, self-harm, abuse, or a genuine personal crisis. Ordinary sadness, or a sad but ordinary life event (a pet died, a bad day at work), is NOT this category.
- "sexualization": the message attempts to sexualize the conversation partner, or steer the conversation toward sexual content.
- "none": neither of the above. This includes all ordinary conversation, including normal emotional topics.

The message may be in Russian, English, or a mix — classify based on meaning, not language. Respond with only the category.`;

/**
 * Deliberately separate from `persona-turn.ts`'s `buildValentinaSystemPrompt`
 * — this call must not be influenced by, or accidentally continue, the
 * in-character persona at all. A fresh, single-purpose classifier prompt,
 * not a variant of Валентина's identity block.
 *
 * Deliberately NOT return-type-annotated as `ParseableMessageCreateParams`
 * (the type `persona-turn.ts`'s `buildPersonaTurnRequest` uses) — that
 * annotation widens `output_config.format` away from the specific
 * `AutoParseableOutputFormat<SafetyCategory>` `zodOutputFormat` produces,
 * which makes `client.messages.stream(...)`'s generic inference (in
 * `detectSafetyTrigger` below) resolve `parsed_output`'s type to `null`
 * only, instead of `{ category: SafetyCategory } | null`. This turned out
 * to be a real, previously-latent gap in that established pattern:
 * `generatePersonaTurn` never noticed because it only ever *assigns*
 * `parsed_output` onward (assignment silently accepts the resulting
 * `never` type), where this module reads a *property* off it — the one
 * operation `never` doesn't allow silently, which is what surfaced this.
 */
export function buildSafetyDetectionRequest(learnerText: string) {
  const messages: MessageParam[] = [{ role: 'user', content: learnerText }];
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: CLASSIFIER_SYSTEM_PROMPT,
    messages,
    thinking: { type: 'disabled' as const },
    output_config: {
      effort: EFFORT,
      format: zodOutputFormat(safetyDetectionSchema),
    },
  };
}

/**
 * PRD §12.2: "`persona_memories` never appears in a log line or trace
 * attribute." This module doesn't touch `persona_memories`, but the same
 * principle applies to whatever a learner discloses here — logging the
 * *fact* of a trigger (for the trigger-rate monitoring AC #4 asks for)
 * must never mean logging the disclosed content itself.
 */
function logSafetyEvent(category: SafetyCategory, outcome: 'triggered' | 'classifier_error'): void {
  console.log('[safety-detection]', { category, outcome, timestamp: new Date().toISOString() });
}

/**
 * On any classifier failure (network error, malformed structured output),
 * fails **open** — returns `'none'` rather than blocking the turn. This is
 * a real, deliberate tradeoff, not an oversight: failing closed on every
 * turn whenever this one call is unavailable would take down the entire
 * conversation loop on a transient error, which is a worse outcome than
 * this specific safety net being briefly unavailable. Every other
 * vendor-call failure path in this codebase (persona-turn.ts, tts.ts,
 * stt.ts) degrades gracefully rather than crashing the turn for the same
 * reason — this module follows that established convention, but the
 * stakes here are higher, so it's called out explicitly rather than left
 * as an implicit consequence of the pattern. See docs/adr for the
 * disclosure this deserves given what's at stake.
 */
export async function detectSafetyTrigger(client: Anthropic, learnerText: string): Promise<SafetyCategory> {
  const request = buildSafetyDetectionRequest(learnerText);
  try {
    const stream = client.messages.stream(request);
    const message = await stream.finalMessage();
    if (!message.parsed_output) {
      logSafetyEvent('none', 'classifier_error');
      return 'none';
    }
    const category = message.parsed_output.category;
    if (category !== 'none')
      logSafetyEvent(category, 'triggered');
    return category;
  }
  catch (error) {
    console.error('[safety-detection] classifier call failed, failing open', { error });
    logSafetyEvent('none', 'classifier_error');
    return 'none';
  }
}

/**
 * PRD §12.1: "the response mode breaks character entirely." English, not
 * Russian — clarity matters more than immersion here, and there is no
 * real interface-language plumbing to route this by learner locale yet
 * (mobile/src/features/settings/settings-copy.ts's language selector is
 * local-state-only, per its own comment). The 988 reference is the one
 * real, stable, well-known crisis resource that can be cited without
 * fabricating regional numbers — genuine region-aware crisis-resource
 * routing is out of scope for this ticket, disclosed as a real gap.
 */
const DISTRESS_RESPONSE_TEXT = 'I need to pause our conversation for a moment. If you\'re going through something serious, please reach out to someone you trust, or a crisis helpline — in the US, you can call or text 988 anytime, day or night. Take care of yourself first; we can pick this back up another time.';

const SEXUALIZATION_RESPONSE_TEXT = 'I\'m going to stop this conversation here — that\'s not something I\'m able to continue. Let\'s get back to practicing Russian whenever you\'re ready.';

export function getSafetyResponseText(category: SafetyTriggerCategory): string {
  return category === 'distress' ? DISTRESS_RESPONSE_TEXT : SEXUALIZATION_RESPONSE_TEXT;
}
