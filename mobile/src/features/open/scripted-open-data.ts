/**
 * Hardcoded Open-screen content for this ticket ("Scripted data used for
 * now"). Copy ported verbatim from the mockup's English (`T.en`) strings —
 * `Initial mockup request/design_handoff_conversation_loop/Speaking
 * Practice - core loop.dc.html`.
 *
 * `callbackLine` is Russian regardless of interface language — per the
 * README: "her callback line stays in Russian in both interface languages.
 * Always." There is no English variant to switch to.
 */
export const SCRIPTED_OPEN_DATA = {
  openDay: 'Tuesday · 8 min',
  whoElse: 'Who else →',
  settingsLink: 'Settings',
  personaName: 'Валентина Сергеевна',
  personaMeta: '78 · Yaroslavl · retired librarian',
  callbackLine: '«Ну наконе́ц-то ты позвони́л! Сади́сь, я чай поста́вила. Как вы́ходные?»',
  scenarioLine: 'Tea on the porch · she’ll ask how your weekend was',
  openMicLine: 'She’ll hear you the whole time. Just talk.',
  answer: 'Pick up',
} as const;
