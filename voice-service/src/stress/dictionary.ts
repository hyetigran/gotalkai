/**
 * Ticket #16 AC #2: "High-frequency words resolved via dictionary
 * lookup." Hand-curated, not sourced from a bundled Russian stress
 * corpus (no such npm package exists — see docs/adr/0015). Nearly every
 * entry here is a word this codebase's own content actually uses
 * (persona.ts's identity prompt, the eval harness's golden-set.ts,
 * app-service's seed-scenarios.ts, voice-service's own debug-persona-turn.ts
 * test transcript) plus common function words/numbers, so the
 * dictionary's real-world coverage against this product's own dialogue
 * can be checked directly rather than guessed at.
 *
 * Values are the lowercase word with a Unicode combining acute accent
 * (U+0301) placed immediately after the stressed vowel — the standard,
 * unambiguous way to mark Russian lexical stress in plain Cyrillic text
 * (used by Russian dictionaries, learner materials, and tools like
 * russiangram.com). This is the *internal* representation stress
 * resolution produces; phoneme-format.ts converts it to whatever a given
 * TTS vendor actually needs.
 *
 * Deliberately excludes ambiguous homographs whose stress depends on
 * grammatical case/meaning (PRD §7.5's own bake-off list names these:
 * "homographs, mobile-stress paradigms") — a wrong guess on those is
 * worse than no entry at all (falls through to the honestly-unresolved
 * path in stress-annotation.ts, not a confident wrong answer).
 */
export const STRESS_DICTIONARY: Record<string, string> = {
  // Persona identity (persona.ts) and common address/relational words
  валентина: 'вале́нтина',
  сергеевна: 'серге́евна',
  румянцева: 'румя́нцева',
  бабушка: 'ба́бушка',
  бабушке: 'ба́бушке',
  дача: 'да́ча',
  даче: 'да́че',
  дачу: 'да́чу',
  пушок: 'пушо́к',
  библиотека: 'библиоте́ка',
  библиотекарша: 'библиоте́карша',
  сосед: 'сосе́д',
  соседка: 'сосе́дка',
  ивановна: 'ива́новна',
  тамара: 'тама́ра',

  // Greetings / common conversational openers
  здравствуй: 'здра́вствуй',
  здравствуйте: 'здра́вствуйте',
  спасибо: 'спаси́бо',
  пожалуйста: 'пожа́луйста',
  извините: 'извини́те',
  простите: 'прости́те',

  // Time words
  вчера: 'вчера́',
  завтра: 'за́втра',
  сегодня: 'сего́дня',
  неделя: 'неде́ля',
  неделе: 'неде́ле',
  месяц: 'ме́сяц',
  года: 'го́да',
  лето: 'ле́то',
  зима: 'зима́',
  утро: 'у́тро',
  вечер: 'ве́чер',

  // Common verbs (infinitive and a few inflected forms already seen in this codebase's own content)
  говорить: 'говори́ть',
  говорят: 'говоря́т',
  делать: 'де́лать',
  делал: 'де́лал',
  идти: 'идти́',
  иду: 'иду́',
  ходить: 'ходи́ть',
  ездить: 'е́здить',
  ездил: 'е́здил',
  ездим: 'е́здим',
  ехать: 'е́хать',
  еду: 'е́ду',
  едем: 'е́дем',
  поехать: 'пое́хать',
  поеду: 'пое́ду',
  писать: 'писа́ть',
  читать: 'чита́ть',
  любить: 'люби́ть',
  понимать: 'понима́ть',
  видеть: 'ви́деть',
  слышать: 'слы́шать',
  забыть: 'забы́ть',
  забыла: 'забы́ла',
  купить: 'купи́ть',
  купил: 'купи́л',
  гулять: 'гуля́ть',
  гулял: 'гуля́л',

  // Common nouns from the codebase's own scenario/golden-set content
  пирог: 'пиро́г',
  магазин: 'магази́н',
  письмо: 'письмо́',
  книга: 'кни́га',
  книгу: 'кни́гу',
  билет: 'биле́т',
  билеты: 'биле́ты',
  поезд: 'по́езд',
  поезде: 'по́езде',
  москва: 'москва́',
  ярославль: 'яросла́вль',

  // High-frequency function words (many are monosyllabic and would be
  // trivially "resolved" by stress-annotation.ts's monosyllable rule
  // anyway, but a few common multi-syllable ones genuinely need an entry)
  очень: 'о́чень',
  всегда: 'всегда́',
  никогда: 'никогда́',
  сейчас: 'сейча́с',
  потом: 'пото́м',
  опять: 'опя́ть',
  наверное: 'наве́рное',
  конечно: 'коне́чно',
  надо: 'на́до',
  можно: 'мо́жно',
  нельзя: 'нельзя́',
};

/**
 * Ticket #16 AC #4: "ё written explicitly wherever semantically present,
 * never silently dropped." `stress-annotation.ts`'s core logic only
 * *preserves* an `ё` already in the input — it can't restore one that
 * arrived already flattened to `е`, which is extremely common in casual
 * Russian writing (and plausible in LLM-generated text, since training
 * data is full of it). This table is a narrow, curated safety net for
 * that case: **only** words where `ё` is the *sole* correct spelling,
 * with no competing real word that happens to be spelled the same way
 * without it.
 *
 * Deliberately excludes words where dropping `ё` produces a different,
 * valid word — restoring those automatically would silently corrupt
 * correct text, which is worse than the gap this table closes:
 * - `все` (all, plural) vs `всё` (everything) — genuinely different words.
 * - `берет` (a beret, the hat) vs `берёт` (takes, 3rd person) — also different words.
 *
 * This is not a general е→ё model (that's the same class of problem as
 * the missing statistical stress model — see docs/adr/0015) — just a
 * short, high-confidence list, expandable the same way the main
 * dictionary is: only add a word here once its е-spelled form is
 * confirmed to have no competing meaning.
 */
export const YO_RESTORATION: Record<string, string> = {
  еще: 'ещё',
  живет: 'живёт',
  идет: 'идёт',
  поет: 'поёт',
  дает: 'даёт',
  несет: 'несёт',
  черный: 'чёрный',
  теплый: 'тёплый',
  мед: 'мёд',
};
