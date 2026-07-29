import { COMBINING_ACUTE, VOWELS } from './constants';
import { STRESS_DICTIONARY, YO_RESTORATION } from './dictionary';

export type StressSource = 'yo_restored' | 'yo_present' | 'monosyllable' | 'dictionary';

export type StressResolution =
  | { word: string; status: 'resolved'; stressedForm: string; source: StressSource }
  | { word: string; status: 'unresolved' };

function countVowels(word: string): number {
  let count = 0;
  for (const char of word.toLowerCase()) {
    if (VOWELS.includes(char))
      count++;
  }
  return count;
}

/** ё is always the stressed vowel when present — a fixed rule of standard Russian orthography, not something to look up. */
function insertYoStress(word: string): string {
  const index = word.toLowerCase().indexOf('ё');
  if (index === -1)
    return word;
  return `${word.slice(0, index + 1)}${COMBINING_ACUTE}${word.slice(index + 1)}`;
}

/** Preserves the input's capitalization on a lowercase replacement form — Russian dialogue only ever capitalizes the first letter of a word, never mixed/all-caps, so this is a complete rule for this codebase's actual input, not a partial approximation. */
function matchCase(original: string, replacementLower: string): string {
  const firstChar = original.charAt(0);
  if (firstChar && firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase())
    return replacementLower.charAt(0).toUpperCase() + replacementLower.slice(1);
  return replacementLower;
}

/**
 * Resolves stress for a single word. Ticket #16 AC #2/#3.
 *
 * Order matters and is deliberate:
 * 1. `YO_RESTORATION` first — a curated, high-confidence list of е-spelled
 *    words whose only correct spelling has ё (dictionary.ts explains why
 *    this is narrower than a general е→ё model). This has to run before
 *    every other check, including the vowel-count shortcut below:
 *    correcting a spelling is a different, prior question from whether
 *    the result needs a stress *mark*, and a single-vowel е→ё correction
 *    (e.g. "мед" → "мёд") would otherwise wrongly short-circuit through
 *    the monosyllable rule with the wrong spelling still in place.
 * 2. Already contains ё — always the stressed vowel by rule, never a
 *    dictionary lookup.
 * 3. One vowel or fewer — no ambiguity possible, no mark needed.
 * 4. Dictionary lookup.
 * 5. Honestly unresolved.
 *
 * Never removes or replaces any character except via the narrow,
 * curated `YO_RESTORATION` step above — otherwise only *inserts* a
 * combining accent — so an existing `ё` is structurally guaranteed to
 * survive untouched (AC #4: "ё written explicitly... never silently
 * dropped" isn't a separate check bolted on, it falls out of how this
 * function is written).
 */
export function resolveWordStress(word: string): StressResolution {
  const lower = word.toLowerCase();

  const restored = YO_RESTORATION[lower];
  if (restored)
    return { word, status: 'resolved', stressedForm: matchCase(word, insertYoStress(restored)), source: 'yo_restored' };

  if (lower.includes('ё'))
    return { word, status: 'resolved', stressedForm: insertYoStress(word), source: 'yo_present' };

  if (countVowels(lower) <= 1)
    return { word, status: 'resolved', stressedForm: word, source: 'monosyllable' };

  const dictionaryEntry = STRESS_DICTIONARY[lower];
  if (dictionaryEntry)
    return { word, status: 'resolved', stressedForm: matchCase(word, dictionaryEntry), source: 'dictionary' };

  // Ticket #16's own AC: "out-of-dictionary words resolved via a
  // RUAccent-class statistical model." No such model is available in
  // this environment — no JS/Node port exists, and the real
  // implementations (RUAccent, StressRNN) are Python packages that would
  // need hosted inference infrastructure this ticket doesn't have (see
  // docs/adr/0015). Rather than guess and risk teaching a wrong stress
  // (PRD §7.4: "a mis-stressed word... actively teaches the error"),
  // out-of-dictionary words are honestly reported as unresolved so the
  // caller can decide what to do (skip the mark, log for later dictionary
  // expansion) rather than silently getting a confident wrong answer.
  return { word, status: 'unresolved' };
}

const WORD_PATTERN = /[а-яёА-ЯЁ]+/g;

export type AnnotatedText = {
  /** The input with stress marks inserted wherever resolved — unresolved words pass through unmarked, not corrupted or dropped. */
  text: string;
  /** Every word that fell through to the honest "unresolved" path, in order of appearance (may contain duplicates) — for logging/telemetry, so dictionary gaps are visible rather than silently absorbed. */
  unresolvedWords: string[];
};

/** Ticket #16 AC #1: every persona LLM turn should pass through this before reaching TTS (wiring that call site is ticket #18's job — see docs/adr/0014's established scope-boundary pattern). */
export function annotateText(text: string): AnnotatedText {
  const unresolvedWords: string[] = [];
  const annotated = text.replace(WORD_PATTERN, (word) => {
    const resolution = resolveWordStress(word);
    if (resolution.status === 'unresolved') {
      unresolvedWords.push(word);
      return word;
    }
    return resolution.stressedForm;
  });
  return { text: annotated, unresolvedWords };
}
