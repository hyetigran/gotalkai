/**
 * Ticket #29 (PRD §11 / §9): "Cost, live." Estimates this turn's own
 * attributable vendor spend from usage actually captured at each call
 * site — Anthropic's `usage` field (persona-turn.ts), TTS character
 * count (the text actually sent to `synthesizeSpeech`), and STT audio
 * duration (turn-orchestrator.ts's own accumulator of frames actually
 * forwarded to the vendor). See docs/adr/0022's "Cost" section: PRD's
 * own text gives the reason this has to be an estimate rather than a
 * reconciled figure — "vendor invoices arrive four weeks late."
 *
 * Pricing constants below are current published list prices, not
 * verified against a real invoice in this environment (no live billing
 * account exists here) — same disclosure posture as
 * `turn-orchestrator.ts`'s own `LOW_CONFIDENCE_AVG_LOGPROB_THRESHOLD`
 * placeholder. Update these constants if vendor pricing changes; nothing
 * else in this module needs to.
 */

/** $ per million tokens (ADR-0003: Claude Sonnet 5). */
const CLAUDE_SONNET_5_INPUT_USD_PER_MTOK = 3;
const CLAUDE_SONNET_5_OUTPUT_USD_PER_MTOK = 15;
/** Prompt-caching write is more expensive than a fresh input token; a cache read is far cheaper — ADR-0003 flags caching economics as load-bearing for this persona's system-prompt-heavy calls. */
const CLAUDE_SONNET_5_CACHE_WRITE_USD_PER_MTOK = 3.75;
const CLAUDE_SONNET_5_CACHE_READ_USD_PER_MTOK = 0.3;

/** $ per 1,000 characters (docs/adr/0013's ElevenLabs vendor decision). */
const ELEVENLABS_TTS_USD_PER_1K_CHARS = 0.3;

/** $ per second of audio actually sent to the realtime STT endpoint. */
const ELEVENLABS_STT_USD_PER_SECOND = 0.0001_1667; // ≈ $0.42/hour

export type AnthropicUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
};

/** Persona LLM turn cost, or the safety-detection classifier's own call — same model, same pricing, either usage shape. */
export function estimateLlmCostUsd(usage: AnthropicUsage): number {
  return (
    (usage.inputTokens / 1_000_000) * CLAUDE_SONNET_5_INPUT_USD_PER_MTOK
    + (usage.outputTokens / 1_000_000) * CLAUDE_SONNET_5_OUTPUT_USD_PER_MTOK
    + (usage.cacheCreationInputTokens / 1_000_000) * CLAUDE_SONNET_5_CACHE_WRITE_USD_PER_MTOK
    + (usage.cacheReadInputTokens / 1_000_000) * CLAUDE_SONNET_5_CACHE_READ_USD_PER_MTOK
  );
}

export function estimateTtsCostUsd(characterCount: number): number {
  return (characterCount / 1000) * ELEVENLABS_TTS_USD_PER_1K_CHARS;
}

export function estimateSttCostUsd(audioSeconds: number): number {
  return audioSeconds * ELEVENLABS_STT_USD_PER_SECOND;
}
