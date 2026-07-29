import { splitIntoSentences } from './split-sentences';

describe('splitIntoSentences', () => {
  it('splits on sentence-terminal punctuation followed by whitespace', () => {
    expect(splitIntoSentences('Ну конечно, заходи. Чайник уже кипит.')).toEqual([
      'Ну конечно, заходи.',
      'Чайник уже кипит.',
    ]);
  });

  it('handles a single-sentence turn (the common case for this persona, ADR-0003)', () => {
    expect(splitIntoSentences('Ну конечно, заходи!')).toEqual(['Ну конечно, заходи!']);
  });

  it('handles an ellipsis as a sentence terminator', () => {
    expect(splitIntoSentences('Хм… дай подумать. Хорошо, пойдём.')).toEqual(['Хм…', 'дай подумать.', 'Хорошо, пойдём.']);
  });

  it('trims surrounding whitespace and drops empty segments', () => {
    expect(splitIntoSentences('  Привет!   Как дела?  ')).toEqual(['Привет!', 'Как дела?']);
  });

  it('returns an empty array for empty input', () => {
    expect(splitIntoSentences('')).toEqual([]);
  });
});
