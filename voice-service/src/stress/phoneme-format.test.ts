import { toElevenLabsPhonemeTag, toIpa } from './phoneme-format';

describe('toIpa', () => {
  it('places the primary-stress marker immediately before the stressed vowel\'s phoneme', () => {
    const ipa = toIpa(`говори${'́'}ть`); // говори́ть — stress on the и
    expect(ipa).toBe('ɡovorˈitʲ');
  });

  it('produces no stress marker at all for a word with no combining accent', () => {
    const ipa = toIpa('кот');
    expect(ipa).not.toContain('ˈ');
    expect(ipa).toBe('kot');
  });

  it('maps ё to the "o" phoneme, matching its actual pronunciation despite the different letter', () => {
    const ipa = toIpa(`ещ${'ё'}${'́'}`); // ещё́
    expect(ipa).toContain('o');
  });

  it('drops the hard sign (ъ) — it marks a phonological boundary, not a sound of its own', () => {
    const ipa = toIpa('объект');
    expect(ipa).not.toContain('ъ');
  });
});

describe('toElevenLabsPhonemeTag', () => {
  it('wraps the visible word with an IPA phoneme attribute', () => {
    const tag = toElevenLabsPhonemeTag('говорить', `говори${'́'}ть`);
    expect(tag).toBe('<phoneme alphabet="ipa" ph="ɡovorˈitʲ">говорить</phoneme>');
  });

  it('keeps the original (display) word visible in the tag body, separate from the phonemic detail', () => {
    const tag = toElevenLabsPhonemeTag('Валентина', `Вале${'́'}нтина`);
    expect(tag).toContain('>Валентина<');
  });
});
