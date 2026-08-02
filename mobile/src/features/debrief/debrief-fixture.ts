/**
 * Fixture session data for the Debrief screen ("Scripted/fixture data used
 * for now, matching the mockup's sample debrief content"). Ported from the
 * mockup's `T.en` copy and `patterns` derivation —
 * `Initial mockup request/design_handoff_conversation_loop/Speaking
 * Practice - core loop.dc.html`.
 *
 * `revealedTurnCount` stands in for a real session's `turns.revealed`
 * count. The screen derives "you understood her without help" from
 * `totalTurns - revealedTurnCount`, per the ticket: "N is 14 −
 * count(turns.revealed) — derived, never self-reported."
 */
export const DEBRIEF_FIXTURE = {
  totalTurns: 14,
  understoodCount: 11,
  revealedTurnCount: 3,
  sessionMeta: '8 min 12 s · 14 turns · she spoke 61%',
  patterns: [
    {
      index: '01',
      /** Kept in Russian (Cyrillic) in both interface languages — only `body` translates. */
      title: 'Мы иска́ли, not мы и́щем.',
      body: 'Past narration came up four times. Twice she had to ask what you meant.',
      tag: 'impeded communication · 2×',
    },
    {
      index: '02',
      title: 'в гараже́, not в гара́ж.',
      body: 'Location after в takes the prepositional. Only after motion verbs does it take the accusative.',
      tag: null,
    },
    {
      index: '03',
      title: 'Stress: нашла́сь, not на́шлась.',
      body: 'Recurring across three turns. She worked it out from context each time.',
      tag: null,
    },
  ],
  avoidance: {
    heading: 'Steered around',
    body: 'The scenario asked what happened. 11 of your 12 verbs were present tense.',
  },
} as const;
