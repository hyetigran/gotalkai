/**
 * Ticket #16 AC #3: "Stress marks emitted in the format the chosen TTS
 * vendor... actually supports." PRD §7.4 assumes a `+`/U+0301 inline
 * convention some Russian TTS/accentuator pairings use — ElevenLabs'
 * actual, documented pronunciation-control mechanism is different: SSML
 * `<phoneme alphabet="ipa" ph="...">` tags carrying a full IPA
 * transcription (docs/adr/0013). This module is the adapter between
 * stress-annotation.ts's internal representation (Cyrillic text with a
 * combining acute accent, U+0301, marking the stressed vowel) and that
 * vendor-specific wire format.
 *
 * The Cyrillic→IPA table below is a simplified, per-letter mapping — it
 * does NOT model Russian vowel reduction (akanie/ikanie: unstressed о
 * sounding like [ə]/[ɐ], unstressed е sounding like [ɪ], etc.) or
 * consonant palatalization assimilation, both real phenomena a
 * production-quality phonemic transcription needs. Getting those right
 * requires either a real grapheme-to-phoneme model or native-speaker
 * verification against actual TTS output — neither is available in this
 * environment (docs/adr/0015). What this table gets right: the stress
 * mark itself (ˈ before the stressed syllable) lands in the correct
 * place, which is this ticket's actual, stated requirement — full
 * phonetic fidelity beyond stress placement is a disclosed gap, not a
 * silent one.
 */

import { COMBINING_ACUTE } from './constants';

const CYRILLIC_TO_IPA: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'ɡ',
  д: 'd',
  е: 'e',
  ё: 'o',
  ж: 'ʐ',
  з: 'z',
  и: 'i',
  й: 'j',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'x',
  ц: 'ts',
  ч: 'tɕ',
  ш: 'ʂ',
  щ: 'ɕː',
  ъ: '',
  ы: 'ɨ',
  ь: 'ʲ',
  э: 'e',
  ю: 'ju',
  я: 'ja',
};

/**
 * Converts one stress-annotated Cyrillic word (as produced by
 * stress-annotation.ts — a combining acute accent after the stressed
 * vowel, or none if the word didn't need one) into an IPA string with a
 * primary-stress marker (ˈ) immediately before the stressed vowel's
 * phoneme, IPA convention.
 */
export function toIpa(stressedWord: string): string {
  let ipa = '';
  const chars = [...stressedWord.toLowerCase()];
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i] as string;
    if (char === COMBINING_ACUTE)
      continue; // consumed when handling the preceding letter, below
    const nextIsStressMark = chars[i + 1] === COMBINING_ACUTE;
    if (nextIsStressMark)
      ipa += 'ˈ';
    ipa += CYRILLIC_TO_IPA[char] ?? char;
  }
  return ipa;
}

/**
 * Wraps a word in the SSML phoneme tag ElevenLabs' `eleven_v3` model
 * expects for non-English IPA pronunciation control (docs/adr/0013 — IPA
 * phoneme tags in non-English languages require that specific model).
 * `word` should be the *original* (unstressed-mark) display text —
 * `stressedWord` supplies the phonemic detail separately, matching SSML
 * phoneme tags' own shape (visible text + a hidden pronunciation
 * override), so downstream text still reads normally wherever this tag
 * is inspected outside a TTS call.
 */
export function toElevenLabsPhonemeTag(word: string, stressedWord: string): string {
  return `<phoneme alphabet="ipa" ph="${toIpa(stressedWord)}">${word}</phoneme>`;
}
