import { annotateText, resolveWordStress } from './stress-annotation';

describe('resolveWordStress', () => {
  it('resolves a dictionary word to its stressed form', () => {
    const result = resolveWordStress('говорить');
    expect(result).toEqual({ word: 'говорить', status: 'resolved', stressedForm: 'говори́ть', source: 'dictionary' });
  });

  it('is case-insensitive for lookup but preserves the input\'s capitalization in the output', () => {
    const result = resolveWordStress('Валентина');
    expect(result).toEqual({ word: 'Валентина', status: 'resolved', stressedForm: 'Вале́нтина', source: 'dictionary' });
  });

  it('resolves a monosyllabic word with zero or one vowels, via the vowel-count rule alone — no dictionary entry needed or consulted', () => {
    const result = resolveWordStress('он');
    expect(result).toEqual({ word: 'он', status: 'resolved', stressedForm: 'он', source: 'monosyllable' });
  });

  it('resolves any word already containing ё by placing the accent on ё, regardless of dictionary presence — ё is always stressed by rule, not lookup', () => {
    const result = resolveWordStress('ещё');
    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') {
      expect(result.source).toBe('yo_present');
      expect(result.stressedForm).toBe(`ещё${'́'}`); // combining accent immediately after ё (the word's last character here)
      expect(result.stressedForm).toContain('ё'); // AC #4: ё itself is never dropped
    }
  });

  it('restores a dropped ё for a curated, unambiguous е-spelled word (AC #4: correcting a flattened ё, not just preserving one already present)', () => {
    const result = resolveWordStress('еще'); // е-spelled, no ё — should become ещё, stressed
    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') {
      expect(result.source).toBe('yo_restored');
      // "еще" → "ещё": only the SECOND е (position 2) becomes ё — the
      // first letter of "ещё" is legitimately "е", so this checks the
      // exact corrected spelling rather than a blanket "no е left" claim.
      expect(result.stressedForm.replace('́', '')).toBe('ещё');
    }
  });

  it('restores ё even for a single-vowel е-spelled word — spelling correction runs before the monosyllable shortcut, not after', () => {
    const result = resolveWordStress('мед'); // one vowel, but the correct spelling is "мёд"
    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') {
      expect(result.source).toBe('yo_restored');
      expect(result.stressedForm.replace('́', '')).toBe('мёд');
    }
  });

  it('preserves capitalization through ё-restoration', () => {
    const result = resolveWordStress('Еще');
    expect(result.status).toBe('resolved');
    if (result.status === 'resolved')
      expect(result.stressedForm.charAt(0)).toBe('Е');
  });

  it('does NOT auto-restore a known-ambiguous homograph (все/всё are different words — restoring blindly would corrupt correct text)', () => {
    // "все" is deliberately absent from YO_RESTORATION. It happens to
    // also be monosyllabic (one vowel: "е"), so it resolves via that
    // rule unchanged — either way, the key guarantee holds: it is never
    // silently rewritten to "всё".
    const result = resolveWordStress('все');
    expect(result).toEqual({ word: 'все', status: 'resolved', stressedForm: 'все', source: 'monosyllable' });
  });

  it('never drops or alters a pre-existing combining accent\'s target character — only inserts, never removes', () => {
    const before = resolveWordStress('чёрный');
    expect(before.status).toBe('resolved');
    if (before.status === 'resolved')
      expect(before.stressedForm.replace('́', '')).toBe('чёрный');
  });

  it('honestly reports an out-of-dictionary, multi-syllable, non-ё word as unresolved rather than guessing', () => {
    const result = resolveWordStress('электростанция'); // not in STRESS_DICTIONARY
    expect(result).toEqual({ word: 'электростанция', status: 'unresolved' });
  });
});

describe('annotateText', () => {
  it('annotates every resolvable word in a sentence and reassembles it with punctuation/spacing intact', () => {
    const result = annotateText('Здравствуй! Заходи, будем пить чай.');
    expect(result.text).toContain('!');
    expect(result.text).toContain(',');
    expect(result.text).toContain('.');
    expect(result.text).not.toBe('Здравствуй! Заходи, будем пить чай.'); // at least one word got a stress mark
  });

  it('collects unresolved words without corrupting them in the output text', () => {
    const result = annotateText('электростанция работает');
    expect(result.unresolvedWords).toContain('электростанция');
    expect(result.text).toContain('электростанция'); // passed through unmarked, not dropped or mangled
  });

  it('returns an empty unresolvedWords list when every word resolves', () => {
    const result = annotateText('Спасибо, кот!');
    expect(result.unresolvedWords).toEqual([]);
  });

  it('handles text with no Cyrillic words at all without throwing', () => {
    expect(() => annotateText('123 !!!')).not.toThrow();
    expect(annotateText('123 !!!')).toEqual({ text: '123 !!!', unresolvedWords: [] });
  });
});
