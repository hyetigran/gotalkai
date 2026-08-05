/**
 * Hardcoded Open-screen content for this ticket ("Scripted data used for
 * now"). Copy ported verbatim from the mockup's English (`T.en`) strings —
 * `Initial mockup request/design_handoff_conversation_loop/Speaking
 * Practice - core loop.dc.html`.
 *
 * `callbackLine` is English here (UAT: a full Russian sentence outside
 * the live chat session read as broken/regressed to a learner who
 * hasn't been asked whether they read Cyrillic — Session Zero currently
 * auto-skips that question, see `session-zero-screen.tsx`). Target-
 * language dialogue is reserved for the actual conversation transcript
 * (`transcript.tsx`/`live-transcript.tsx`), not this pre-call preview.
 */
export const SCRIPTED_OPEN_DATA = {
  openDay: 'Tuesday · 8 min',
  settingsLink: 'Settings',
  personaName: 'Valentina Sergeevna',
  personaMeta: '78 · Yaroslavl · retired librarian',
  callbackLine: '"Finally, you called! Sit down, I’ve got the tea on. How was your weekend?"',
  answer: 'Pick up',
} as const;
