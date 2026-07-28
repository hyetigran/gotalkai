/**
 * The seven-turn scripted demo script for the Converse screen (ticket #3).
 * No live pipeline yet — this stands in for the real STT/LLM/TTS turn
 * content. Ported verbatim from the mockup's `SCRIPT`/`CHIPS` consts
 * (`Initial mockup request/design_handoff_conversation_loop/Speaking
 * Practice - core loop.dc.html`), which is the source of truth for the
 * exact Russian/English copy.
 *
 * Each turn is not arbitrary — see the README's "Scripted beats worth
 * preserving in the demo data" table:
 *   - turn index 2 (her): invisible recast, иска́ем → иска́ли
 *   - turn index 3 (learner) → 4 (her): STT-confidence retry, "Что-что? Погро́мче"
 *   - turn index 5 (learner): unprompted self-repair
 *   - turn index 6 (her): story-installment backchanneling beat
 */

export type ScriptedTurn = {
  who: 'her' | 'you';
  ru: string;
  /** Only her turns carry a translation (tap-to-reveal). */
  en?: string;
};

export const CONVERSE_SCRIPT: ScriptedTurn[] = [
  {
    who: 'her',
    ru: '«Ну наконе́ц-то ты позвони́л! Сади́сь, я чай поста́вила. Так что с соба́кой-то?»',
    en: 'Finally you called! Sit down, I’ve put the kettle on. So what happened with the dog?',
  },
  {
    who: 'you',
    ru: 'Да, соба́ка… она́ до́ма. Мы иска́ем два дня.',
  },
  {
    who: 'her',
    ru: '«Два дня иска́ли! Ох, я представля́ю. И кто её нашёл?»',
    en: 'Two days you were looking! Oh, I can imagine. And who found her?',
  },
  {
    who: 'you',
    ru: 'Сосе́д нашёл. Он… как сказа́ть… в гара́ж.',
  },
  {
    who: 'her',
    ru: '«Что-что? Погро́мче, я пло́хо слы́шу.»',
    en: 'What was that? Louder, I don’t hear well.',
  },
  {
    who: 'you',
    ru: 'В гараже́. Сосе́д нашёл её в гараже́.',
  },
  {
    who: 'her',
    ru: '«Ах ты бо́же мой. У Ни́ны Петро́вны кот то́же так пря́тался — це́лую неде́лю, представля́ешь…»',
    en: 'Oh my goodness. Nina Petrovna’s cat used to hide like that too — for a whole week, imagine…',
  },
];

/**
 * Suggestion-chip labels. These are generic reaction prompts, not the
 * scripted learner line itself — tapping any chip advances the script by
 * one exchange; the actual "learner" transcript text always comes from
 * `CONVERSE_SCRIPT`, regardless of which chip was tapped.
 */
export const SUGGESTION_CHIPS = ['пра́вда?', 'да ты что!', 'а пото́м?', 'а кот?'] as const;
