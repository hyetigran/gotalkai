import type { PersonaTurn } from '../persona';
import type { GoldenEntry } from './golden-set-types';
import {
  checkNoEnglishLeakage,
  checkNoFalseRecast,
  checkNoGrammarTalk,
  checkNoMissedRecast,
  checkNoPraise,
  checkRegisterConsistency,
  checkSchemaValidity,
  checkTurnLength,
  checkYoSpelling,
  runMechanicalAssertions,
} from './mechanical-assertions';

const baseEntry: GoldenEntry = {
  id: 'test-entry',
  description: 'test',
  history: [],
  learnerTurn: 'test',
  shouldRecast: false,
};

const baseTurn: PersonaTurn = {
  comprehension: 'understood',
  affect: 'warm',
  text: 'Ну конечно, заходи, чайник уже кипит.',
};

describe('checkSchemaValidity', () => {
  it('passes when the response was not a filler fallback', () => {
    expect(checkSchemaValidity({ entry: baseEntry, turn: baseTurn, fellBackToFiller: false }).passed).toBe(true);
  });

  it('fails when the response fell back to the filler line', () => {
    expect(checkSchemaValidity({ entry: baseEntry, turn: baseTurn, fellBackToFiller: true }).passed).toBe(false);
  });
});

describe('checkTurnLength', () => {
  it('passes for one or two sentences', () => {
    expect(checkTurnLength({ entry: baseEntry, turn: { ...baseTurn, text: 'Одно предложение.' }, fellBackToFiller: false }).passed).toBe(true);
    expect(checkTurnLength({ entry: baseEntry, turn: { ...baseTurn, text: 'Первое предложение. Второе предложение!' }, fellBackToFiller: false }).passed).toBe(true);
  });

  it('fails for an excessively long response (many sentences)', () => {
    const text = 'Раз. Два. Три. Четыре. Пять.';
    expect(checkTurnLength({ entry: baseEntry, turn: { ...baseTurn, text }, fellBackToFiller: false }).passed).toBe(false);
  });

  it('fails for empty text', () => {
    expect(checkTurnLength({ entry: baseEntry, turn: { ...baseTurn, text: '' }, fellBackToFiller: false }).passed).toBe(false);
  });
});

describe('checkRegisterConsistency', () => {
  it('passes when the response addresses the learner as ты', () => {
    expect(checkRegisterConsistency({ entry: baseEntry, turn: { ...baseTurn, text: 'А ты как поживаешь?' }, fellBackToFiller: false }).passed).toBe(true);
  });

  it('fails when the response addresses the learner as вы', () => {
    expect(checkRegisterConsistency({ entry: baseEntry, turn: { ...baseTurn, text: 'А как вы поживаете?' }, fellBackToFiller: false }).passed).toBe(false);
  });

  it('fails on formal possessive "ваш" forms too', () => {
    expect(checkRegisterConsistency({ entry: baseEntry, turn: { ...baseTurn, text: 'Как ваши дела?' }, fellBackToFiller: false }).passed).toBe(false);
  });
});

describe('checkYoSpelling', () => {
  it('passes for a response with no ё-bearing words at all', () => {
    expect(checkYoSpelling({ entry: baseEntry, turn: baseTurn, fellBackToFiller: false }).passed).toBe(true);
  });

  it('passes when a common word correctly uses ё', () => {
    expect(checkYoSpelling({ entry: baseEntry, turn: { ...baseTurn, text: 'Хочешь ещё чаю?' }, fellBackToFiller: false }).passed).toBe(true);
  });

  it('fails when ё was dropped in favor of е on a common word (dictionary-based, exercised by any matching response — not tied to a per-entry prediction)', () => {
    expect(checkYoSpelling({ entry: baseEntry, turn: { ...baseTurn, text: 'Хочешь еще чаю?' }, fellBackToFiller: false }).passed).toBe(false);
  });

  it('does not false-positive on an unrelated word that merely contains the same letters', () => {
    // "весь" ends in "-ес..." not the exact "все" token — boundary-anchored, not a raw substring search.
    expect(checkYoSpelling({ entry: baseEntry, turn: { ...baseTurn, text: 'Весь день шёл дождь.' }, fellBackToFiller: false }).passed).toBe(true);
  });
});

describe('checkNoEnglishLeakage', () => {
  it('passes for pure Russian text', () => {
    expect(checkNoEnglishLeakage({ entry: baseEntry, turn: baseTurn, fellBackToFiller: false }).passed).toBe(true);
  });

  it('fails when Latin letters appear', () => {
    expect(checkNoEnglishLeakage({ entry: baseEntry, turn: { ...baseTurn, text: 'OK, конечно, заходи.' }, fellBackToFiller: false }).passed).toBe(false);
  });
});

describe('checkNoPraise', () => {
  it('passes for a response with no praise', () => {
    expect(checkNoPraise({ entry: baseEntry, turn: baseTurn, fellBackToFiller: false }).passed).toBe(true);
  });

  it('fails when the response praises the learner\'s Russian', () => {
    expect(checkNoPraise({ entry: baseEntry, turn: { ...baseTurn, text: 'Ты так хорошо говоришь по-русски!' }, fellBackToFiller: false }).passed).toBe(false);
  });
});

describe('checkNoGrammarTalk', () => {
  it('passes for a response with no grammar terminology', () => {
    expect(checkNoGrammarTalk({ entry: baseEntry, turn: baseTurn, fellBackToFiller: false }).passed).toBe(true);
  });

  it('fails when the response names a grammatical case', () => {
    expect(checkNoGrammarTalk({ entry: baseEntry, turn: { ...baseTurn, text: 'Тут нужен родительный падеж.' }, fellBackToFiller: false }).passed).toBe(false);
  });
});

describe('checkNoFalseRecast', () => {
  it('passes for an in-flow response with no explicit correction marker', () => {
    expect(checkNoFalseRecast({ entry: baseEntry, turn: baseTurn, fellBackToFiller: false }).passed).toBe(true);
  });

  it('fails when the response explicitly flags a correction', () => {
    expect(checkNoFalseRecast({ entry: baseEntry, turn: { ...baseTurn, text: 'Нет, нужно сказать по-другому.' }, fellBackToFiller: false }).passed).toBe(false);
  });

  it('fails even on a clean-input entry where nothing needed correcting (the whole point of the control)', () => {
    const entry: GoldenEntry = { ...baseEntry, shouldRecast: false };
    expect(checkNoFalseRecast({ entry, turn: { ...baseTurn, text: 'Ты имела в виду другое слово?' }, fellBackToFiller: false }).passed).toBe(false);
  });
});

describe('checkNoMissedRecast', () => {
  it('trivially passes when the entry has no planted error', () => {
    expect(checkNoMissedRecast({ entry: baseEntry, turn: baseTurn, fellBackToFiller: false }).passed).toBe(true);
  });

  it('passes when the response does not echo the learner\'s erroneous span', () => {
    const entry: GoldenEntry = { ...baseEntry, shouldRecast: true, erroneousSpan: 'готовлю' };
    expect(checkNoMissedRecast({ entry, turn: { ...baseTurn, text: 'Ах, ты приготовила борщ — как вкусно!' }, fellBackToFiller: false }).passed).toBe(true);
  });

  it('fails when the response echoes the exact erroneous span back uncorrected', () => {
    const entry: GoldenEntry = { ...baseEntry, shouldRecast: true, erroneousSpan: 'готовлю' };
    expect(checkNoMissedRecast({ entry, turn: { ...baseTurn, text: 'А, ты готовлю борщ для меня?' }, fellBackToFiller: false }).passed).toBe(false);
  });
});

describe('runMechanicalAssertions', () => {
  it('runs all nine checks and returns one result per check, all passing for a clean response', () => {
    const results = runMechanicalAssertions({ entry: baseEntry, turn: baseTurn, fellBackToFiller: false });
    expect(results).toHaveLength(9);
    expect(results.every(result => result.passed)).toBe(true);
    // no_false_recast reported first among negative controls, per PRD §10's "single most important" framing.
    expect(results.map(r => r.key)).toContain('no_false_recast');
    expect(results.findIndex(r => r.key === 'no_false_recast')).toBeLessThan(results.findIndex(r => r.key === 'no_english_leakage'));
  });
});
