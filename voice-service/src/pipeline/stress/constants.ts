/** Shared across stress-annotation.ts, phoneme-format.ts, and their tests — extracted after the third independent copy (dictionary.ts, stress-annotation.ts, phoneme-format.ts all needed one), matching this codebase's established "rule of three" threshold for extracting shared test/support code (see test-support/fake-anthropic.ts). */
export const VOWELS = 'аеёиоуыэюя';

/** Unicode combining acute accent (U+0301) — the standard, unambiguous way to mark Russian lexical stress in plain Cyrillic text, placed immediately after the stressed vowel. */
export const COMBINING_ACUTE = '́';
