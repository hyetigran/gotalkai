import type { PersonaTurn } from '../persona';
import type { GoldenEntry } from './golden-set-types';

export type AssertionKey = 'schema_validity' | 'turn_length' | 'register_consistency' | 'yo_spelling' | 'no_false_recast' | 'no_missed_recast' | 'no_english_leakage' | 'no_praise' | 'no_grammar_talk';

export type AssertionResult = {
  key: AssertionKey;
  passed: boolean;
  reason?: string;
};

export type MechanicalCheckInput = {
  entry: GoldenEntry;
  turn: PersonaTurn;
  fellBackToFiller: boolean;
};

/**
 * Ticket #28 AC #2: "Mechanical assertions — no model call." Every
 * function below reads only `entry`/`turn` — no network, no Anthropic
 * client — matching PRD §10's framing that this layer is the cheapest of
 * the three and must catch "instruction decay at turn 40, which manual
 * testing never finds" on every run, not just when someone remembers to
 * look.
 *
 * Split into two groups per PRD §10's own wording: four structural checks
 * (schema/turn-length/register/ё), then five "negative controls" — see
 * NEGATIVE_CONTROLS below for how the PRD's own list of eight assertion
 * *names* was mapped onto five distinct negative-control *functions*
 * (PRD doesn't enumerate the five by name; this mapping is a documented
 * judgment call, see docs/adr/0012).
 */

/** AC #2 "Schema": did the model produce genuinely valid structured output, not the filler fallback (persona-turn.ts's own contract — a fallback is a recovery, not a real answer to grade). */
export function checkSchemaValidity(input: MechanicalCheckInput): AssertionResult {
  return {
    key: 'schema_validity',
    passed: !input.fellBackToFiller,
    reason: input.fellBackToFiller ? 'response fell back to the filler line — not real structured output' : undefined,
  };
}

/**
 * AC #2 "turn length": ADR-0003 / persona.ts's own contract is "one
 * conversational turn (1-2 sentences)". Sentence count is a heuristic
 * (splitting on ./!/…/?), not a syntactic parse — allows up to 3 to avoid
 * penalizing a single trailing clause after an ellipsis, documented as an
 * approximation rather than a strict parser.
 */
export function checkTurnLength(input: MechanicalCheckInput): AssertionResult {
  const sentenceCount = input.turn.text
    .split(/(?<=[.!?…])\s+/)
    .filter(sentence => sentence.trim().length > 0).length;
  return {
    key: 'turn_length',
    passed: sentenceCount >= 1 && sentenceCount <= 3,
    reason: sentenceCount < 1 || sentenceCount > 3 ? `expected 1-2 (up to 3) sentences, counted ${sentenceCount}` : undefined,
  };
}

// `\b` doesn't recognize Cyrillic as word characters in JS regex, so a
// literal `\bвы\b` never matches at all — lookaround on an explicit
// Cyrillic-letter class stands in for a real word boundary here.
const FORMAL_ADDRESS_PATTERN = /(?<![а-яёА-ЯЁ])(?:вы|вас|вам|вами|ваш(?:а|е|и|его|ей|ему|им|их)?)(?![а-яёА-ЯЁ])/i;

/**
 * AC #2 "register consistency": Валентина always addresses the learner
 * as ты (PRD §6.4) regardless of what register the learner used — a
 * keyword-based heuristic (formal-address pronoun/possessive forms), not
 * a full morphological parse. False positives are possible (e.g. "вы"
 * appearing inside an unrelated word) — documented limitation, not a
 * claim of complete accuracy.
 */
export function checkRegisterConsistency(input: MechanicalCheckInput): AssertionResult {
  const usesFormalAddress = FORMAL_ADDRESS_PATTERN.test(input.turn.text);
  return {
    key: 'register_consistency',
    passed: !usesFormalAddress,
    reason: usesFormalAddress ? 'response appears to address the learner as "вы" — Валентина always uses "ты"' : undefined,
  };
}

/**
 * A small dictionary of common ё-bearing words, mapped to their
 * (incorrect, per PRD §7.4) е-only spelling. General-purpose rather than
 * tied to a per-entry expected word: a per-entry `expectedYoWord` field
 * was tried first, but nothing could actually predict which exact word a
 * generated response would use, so no golden entry ever set it and the
 * check was vacuous in practice — never exercised, never able to fail.
 * Checking the response against this dictionary is exercised by *any*
 * response that happens to use one of these common words, regardless of
 * which golden entry it came from.
 */
const YO_WORD_DROPPED_SPELLINGS: Record<string, string> = {
  еще: 'ещё',
  все: 'всё',
  идет: 'идёт',
  живет: 'живёт',
  поет: 'поёт',
  берет: 'берёт',
  дает: 'даёт',
  черный: 'чёрный',
  теплый: 'тёплый',
};

/** AC #2 "ё spelling" (PRD §7.4: "ё must be written explicitly — it is dropped in print but changes sound and meaning"). Checks the response against a small dictionary of common ё-words rather than a per-entry prediction — see YO_WORD_DROPPED_SPELLINGS above for why. */
export function checkYoSpelling(input: MechanicalCheckInput): AssertionResult {
  const text = input.turn.text;
  const dropped = Object.entries(YO_WORD_DROPPED_SPELLINGS).find(([withoutYo]) => {
    const pattern = new RegExp(`(?<![а-яёА-ЯЁ])${withoutYo}(?![а-яёА-ЯЁ])`, 'i');
    return pattern.test(text);
  });
  return {
    key: 'yo_spelling',
    passed: !dropped,
    reason: dropped ? `found "${dropped[0]}" without ё — should be "${dropped[1]}" (PRD §7.4)` : undefined,
  };
}

const ENGLISH_LETTERS_PATTERN = /[a-z]/i;

/** Negative control 1/5: PRD §10 "no English leakage." */
export function checkNoEnglishLeakage(input: MechanicalCheckInput): AssertionResult {
  const leaked = ENGLISH_LETTERS_PATTERN.test(input.turn.text);
  return {
    key: 'no_english_leakage',
    passed: !leaked,
    reason: leaked ? 'response contains Latin-alphabet characters' : undefined,
  };
}

const PRAISE_PATTERNS = [/хорошо\s+говор/i, /отличн(?:ый|ая|ое)\s+русск/i, /молодец/i, /прекрасн(?:ый|ая|ое)\s+русск/i, /у\s+тебя\s+хороший\s+русский/i];

/** Negative control 2/5: PRD §5.4 "Never: ...praise of the learner's Russian." Keyword-based, not exhaustive. */
export function checkNoPraise(input: MechanicalCheckInput): AssertionResult {
  const praised = PRAISE_PATTERNS.some(pattern => pattern.test(input.turn.text));
  return {
    key: 'no_praise',
    passed: !praised,
    reason: praised ? 'response appears to praise the learner\'s Russian' : undefined,
  };
}

const GRAMMAR_TALK_PATTERNS = [/падеж/i, /спряжени/i, /грамматик/i, /вид\s+глагола/i, /родительн(?:ый|ого)/i, /винительн(?:ый|ого)/i, /дательн(?:ый|ого)/i, /творительн(?:ый|ого)/i, /предложн(?:ый|ого)/i];

/** Negative control 3/5: PRD §5.4 "Never: ...grammar explanation." Keyword-based (Russian case/grammar terminology), not exhaustive. */
export function checkNoGrammarTalk(input: MechanicalCheckInput): AssertionResult {
  const talkedGrammar = GRAMMAR_TALK_PATTERNS.some(pattern => pattern.test(input.turn.text));
  return {
    key: 'no_grammar_talk',
    passed: !talkedGrammar,
    reason: talkedGrammar ? 'response appears to use explicit grammar terminology' : undefined,
  };
}

const CORRECTION_MARKER_PATTERNS = [/нужно\s+сказать/i, /правильно\s+говорить/i, /ты\s+имел(?:а)?\s+в\s+виду/i, /на\s+самом\s+деле\s+нужно/i, /не\s+так,?\s+а/i];

/**
 * Negative control 4/5: `no_false_recast` — PRD §10: "the single most
 * important assertion: a persona that invents grammar problems destroys
 * the fiction." A true recast is invisible in-flow (PRD §5.4) — it never
 * *looks* like a correction, so what's actually mechanically detectable
 * is the thing recasts must never do: contain an EXPLICIT correction
 * marker. This runs on every entry (not just clean ones): flagging an
 * error explicitly is wrong whether or not one was planted.
 */
export function checkNoFalseRecast(input: MechanicalCheckInput): AssertionResult {
  const flagged = CORRECTION_MARKER_PATTERNS.some(pattern => pattern.test(input.turn.text));
  return {
    key: 'no_false_recast',
    passed: !flagged,
    reason: flagged ? 'response contains an explicit correction marker — recasts must be invisible in-flow (PRD §5.4)' : undefined,
  };
}

/**
 * Negative control 5/5: `no_missed_recast` — the other side of "recast
 * fires when and only when it should" (PRD §10). Only meaningful for
 * entries with `shouldRecast: true`; trivially passed otherwise. An
 * imperfect mechanical proxy: checks the response doesn't just echo the
 * learner's exact erroneous span back uncorrected. It cannot verify the
 * CORRECT form was actually produced — validating that arbitrary
 * generated Russian is grammatically right isn't reliable via regex,
 * which is exactly why "recast quality" is a separate judge dimension
 * (judge.ts), not folded into this mechanical check.
 */
export function checkNoMissedRecast(input: MechanicalCheckInput): AssertionResult {
  if (!input.entry.shouldRecast || !input.entry.erroneousSpan)
    return { key: 'no_missed_recast', passed: true };
  const echoed = input.turn.text.includes(input.entry.erroneousSpan);
  return {
    key: 'no_missed_recast',
    passed: !echoed,
    reason: echoed ? `response echoes the learner's exact erroneous span ("${input.entry.erroneousSpan}") uncorrected` : undefined,
  };
}

/** All nine mechanical checks, in report order — four structural, then the five negative controls (`no_false_recast` first, per PRD §10's "single most important"). */
export const MECHANICAL_ASSERTIONS: ((input: MechanicalCheckInput) => AssertionResult)[] = [
  checkSchemaValidity,
  checkTurnLength,
  checkRegisterConsistency,
  checkYoSpelling,
  checkNoFalseRecast,
  checkNoMissedRecast,
  checkNoEnglishLeakage,
  checkNoPraise,
  checkNoGrammarTalk,
];

export function runMechanicalAssertions(input: MechanicalCheckInput): AssertionResult[] {
  return MECHANICAL_ASSERTIONS.map(check => check(input));
}
