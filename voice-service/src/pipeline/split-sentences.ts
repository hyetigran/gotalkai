/**
 * Splits text on sentence-terminal punctuation (., !, ?, …) followed by
 * whitespace. Not a full NLP sentence tokenizer — doesn't special-case
 * abbreviations, decimal numbers, etc. — a real but minor limitation for
 * the short, simple persona turns this pipeline actually produces
 * (ADR-0003: 1-2 sentences per turn).
 *
 * Shared by tts.ts (ticket #17 AC #1: sentence-boundary chunking so
 * playback can begin before the full response is generated) and
 * eval/mechanical-assertions.ts's `checkTurnLength` (ticket #28) — both
 * needed the exact same heuristic independently before this was
 * extracted; a single shared implementation means the two can't drift.
 */
export function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 0);
}
