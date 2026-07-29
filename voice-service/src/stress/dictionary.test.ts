import { COMBINING_ACUTE, VOWELS } from './constants';
import { STRESS_DICTIONARY, YO_RESTORATION } from './dictionary';

describe('STRESS_DICTIONARY', () => {
  it('has a real, non-trivial number of entries', () => {
    expect(Object.keys(STRESS_DICTIONARY).length).toBeGreaterThan(50);
  });

  it('every key is lowercase (lookup in stress-annotation.ts always lowercases first)', () => {
    for (const key of Object.keys(STRESS_DICTIONARY))
      expect(key).toBe(key.toLowerCase());
  });

  it('every value, with the stress mark stripped, matches its key exactly — the dictionary only adds a mark, never changes the word', () => {
    for (const [key, value] of Object.entries(STRESS_DICTIONARY))
      expect(value.replace(new RegExp(COMBINING_ACUTE, 'g'), '')).toBe(key);
  });

  it('every multi-vowel entry carries exactly one stress mark, placed immediately after a vowel', () => {
    for (const value of Object.values(STRESS_DICTIONARY)) {
      const markCount = (value.match(new RegExp(COMBINING_ACUTE, 'g')) ?? []).length;
      expect(markCount).toBe(1);
      const markIndex = value.indexOf(COMBINING_ACUTE);
      const precedingChar = value.charAt(markIndex - 1);
      expect(VOWELS).toContain(precedingChar);
    }
  });

  it('has no entry for a single-vowel word — those resolve via the vowel-count rule in stress-annotation.ts, a dictionary entry would be dead weight', () => {
    for (const key of Object.keys(STRESS_DICTIONARY)) {
      const vowelCount = [...key].filter(char => VOWELS.includes(char)).length;
      expect(vowelCount).toBeGreaterThan(1);
    }
  });

  it('has no entry containing ё — ё-stress is resolved by rule (always stressed), never by dictionary lookup', () => {
    for (const key of Object.keys(STRESS_DICTIONARY))
      expect(key).not.toContain('ё');
  });
});

describe('YO_RESTORATION', () => {
  it('every key contains no ё (it is the flattened, е-spelled form) and every value contains exactly one ё more than its key', () => {
    for (const [key, value] of Object.entries(YO_RESTORATION)) {
      expect(key).not.toContain('ё');
      const yoCountInValue = (value.match(/ё/g) ?? []).length;
      expect(yoCountInValue).toBe(1);
    }
  });

  it('every value, with its single ё replaced back to е, matches its key exactly — restoration only ever swaps е→ё, never anything else', () => {
    for (const [key, value] of Object.entries(YO_RESTORATION))
      expect(value.replace('ё', 'е')).toBe(key);
  });

  it('excludes the known-ambiguous homograph pairs (все/всё, берет/берёт) — these are documented exclusions, not oversights', () => {
    expect(YO_RESTORATION.все).toBeUndefined();
    expect(YO_RESTORATION.берет).toBeUndefined();
  });
});
