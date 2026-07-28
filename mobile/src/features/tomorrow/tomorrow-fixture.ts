/**
 * Fixture data for the Tomorrow screen ("Scripted/fixture data"). Ported
 * verbatim from the mockup's `T.en` copy —
 * `Initial mockup request/design_handoff_conversation_loop/Speaking
 * Practice - core loop.dc.html`.
 *
 * The ladder is three demand-level variants of the *same* tomorrow scene
 * (PRD §5.3), not a causal sequence — `currentStepIndex` marks which
 * variant has been selected as tomorrow's actual complication level.
 */
export const TOMORROW_FIXTURE = {
  eyebrow: 'Wednesday',
  title: 'The cat is ill',
  intro: 'She will want to know what the vet said — and she will ask you to tell it back to her.',
  ladderHeading: 'Same scene, harder',
  ladder: [
    'She offers you tea',
    'The cat was driven to the vet last night',
    'She is hurt that you did not visit',
  ],
  currentStepIndex: 1,
  homework: 'No homework. Come back tomorrow.',
  homeworkSub: 'One session a day. Distributed practice beats massed practice.',
  close: 'Close',
} as const;
