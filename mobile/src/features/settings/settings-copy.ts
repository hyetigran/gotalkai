/**
 * Copy for the Settings screen. Ported verbatim from the mockup's `T.en` —
 * `Initial mockup request/design_handoff_conversation_loop/Speaking
 * Practice - core loop.dc.html`.
 */
export const SETTINGS_COPY = {
  settingsHead: 'Settings',
  langSection: 'Interface language',
  langNote: 'Only the app’s own text changes. The conversation itself is always in Russian — that is the product.',
  otherSection: 'Practice',
  rows: [
    'Microphone · always open',
    'Session length · 8 min',
    'Daily reminder · 19:30',
  ],
  close: 'Close',
} as const;

export const LANGUAGE_CHOICES = [
  { id: 'en', label: 'English' },
  { id: 'ru', label: 'Russian' },
] as const;

export type LanguageId = (typeof LANGUAGE_CHOICES)[number]['id'];
