import type { TranscriptTurn } from '../persona';
import type { GoldenEntry } from './golden-set-types';

const OPENING: TranscriptTurn[] = [
  { speaker: 'persona', text: 'Здравствуй! Заходи, будем пить чай.' },
];

/**
 * PRD §10: "Catches instruction decay at turn 40." A repeating, plausible
 * small-talk exchange (tea, the cat, the weather, the dacha — content
 * already established in the persona identity prompt) rather than
 * hand-authored unique dialogue for every one of ~40 turns — the value of
 * a drift case is context *length*, not content novelty; a long,
 * mundane, realistic-shaped history is what actually probes whether
 * instructions survive that deep, not variety for its own sake.
 */
function buildDriftHistory(turnCount: number): TranscriptTurn[] {
  const beats: TranscriptTurn[] = [
    { speaker: 'persona', text: 'Пушок опять спит на подоконнике, лентяй такой.' },
    { speaker: 'learner', text: 'Правда? А что он делал утром?' },
    { speaker: 'persona', text: 'Гонялся за мухой минут десять, а потом сдался и уснул.' },
    { speaker: 'learner', text: 'Да ты что!' },
    { speaker: 'persona', text: 'Сегодня на даче, наверное, дождь — вчера так парило.' },
    { speaker: 'learner', text: 'А потом?' },
    { speaker: 'persona', text: 'Тамара Ивановна опять жаловалась на своих кур.' },
    { speaker: 'learner', text: 'Надо же.' },
  ];
  const history: TranscriptTurn[] = [...OPENING];
  while (history.length < turnCount) history.push(...beats);
  return history.slice(0, turnCount);
}

/**
 * Ticket #28 (PRD §10): 22 frozen learner turns with planted errors.
 * APPEND ONLY — see append-only.ts / .gitlab-ci.yml's
 * `eval:golden-set-append-only` job. Adding a 23rd entry is fine and
 * expected over time; editing or removing entries 001-022 is not.
 *
 * Distribution: 4 aspect, 3 motion-verb, 2 case-government, 2 register,
 * 1 gender-agreement — the structure-taxonomy priority order from PRD
 * §5.8 — plus 3 clean/no-error, 2 English-leakage bait, 1 praise bait, 1
 * grammar-talk bait (negative-control coverage: a control that never has
 * a genuine negative case to reject is not actually being tested), and 3
 * drift cases (long context, PRD §10's "instruction decay at turn 40").
 *
 * Content authored directly (no native-speaker review has happened on
 * this specific set — see docs/adr/0012's disclosure, matching how
 * persona.ts's identity prompt was built and disclosed in ticket #14).
 */
export const GOLDEN_SET: GoldenEntry[] = [
  // --- Aspect (perfective/imperfective) ---
  {
    id: 'golden-001',
    description: 'Imperfective present used for a single completed past action ("Вчера я готовлю" should be "приготовила").',
    history: OPENING,
    learnerTurn: 'Спасибо! Вчера я готовлю борщ для тебя.',
    shouldRecast: true,
    erroneousSpan: 'готовлю',
    structureKey: 'aspect_perfective',
  },
  {
    id: 'golden-002',
    description: 'Infinitive used where a finite perfective past verb is needed ("Я уже писать письмо").',
    history: OPENING,
    learnerTurn: 'Я уже писать письмо родителям.',
    shouldRecast: true,
    erroneousSpan: 'писать',
    structureKey: 'aspect_perfective',
  },
  {
    id: 'golden-003',
    description: 'Perfective past used for a habitual/repeated action ("Каждый день я купил" should be imperfective "покупаю").',
    history: OPENING,
    learnerTurn: 'Каждый день я купил хлеб по дороге домой.',
    shouldRecast: true,
    erroneousSpan: 'купил',
    structureKey: 'aspect_perfective',
  },
  {
    id: 'golden-004',
    description: '"буду" + perfective infinitive is ungrammatical (should be "буду читать" or "прочитаю").',
    history: OPENING,
    learnerTurn: 'Завтра я буду прочитать эту книгу.',
    shouldRecast: true,
    erroneousSpan: 'буду прочитать',
    structureKey: 'aspect_perfective',
  },

  // --- Motion verbs ---
  {
    id: 'golden-005',
    description: 'On-foot verb "ходил" used with "на машине" (by car) — should be "ездил".',
    history: OPENING,
    learnerTurn: 'Вчера я ходил в магазин на машине.',
    shouldRecast: true,
    erroneousSpan: 'ходил',
    structureKey: 'verbs_of_motion',
  },
  {
    id: 'golden-006',
    description: 'On-foot unidirectional "иду" used for travel by train — should be "еду"/"поеду".',
    history: OPENING,
    learnerTurn: 'Завтра я иду в Москву на поезде.',
    shouldRecast: true,
    erroneousSpan: 'иду',
    structureKey: 'verbs_of_motion',
  },
  {
    id: 'golden-007',
    description: 'Unidirectional "едем" used for a habitual, repeated trip — should be multidirectional "ездим".',
    history: OPENING,
    learnerTurn: 'Каждое лето мы едем на дачу к бабушке.',
    shouldRecast: true,
    erroneousSpan: 'едем',
    structureKey: 'verbs_of_motion',
  },

  // --- Case government ---
  {
    id: 'golden-008',
    description: '"интересоваться" governs instrumental directly — no "о" + prepositional.',
    history: OPENING,
    learnerTurn: 'Я интересуюсь о русском языке уже два года.',
    shouldRecast: true,
    erroneousSpan: 'о русском языке',
    structureKey: 'case_government',
  },
  {
    id: 'golden-009',
    description: '"доволен" governs instrumental ("моим успехом"), not genitive.',
    history: OPENING,
    learnerTurn: 'Учитель был доволен моего успеха на экзамене.',
    shouldRecast: true,
    erroneousSpan: 'моего успеха',
    structureKey: 'case_government',
  },

  // --- Register (Валентина's own ты-address must hold regardless of the learner's register) ---
  {
    id: 'golden-010',
    description: 'Learner correctly uses вы toward her — checks her reply still uses ты toward the learner, not mirrored вы.',
    history: OPENING,
    learnerTurn: 'Здравствуйте! Как вы поживаете?',
    shouldRecast: false,
    structureKey: 'register',
  },
  {
    id: 'golden-011',
    description: 'Same register check with a different correct-вы learner turn.',
    history: OPENING,
    learnerTurn: 'Спасибо, что пригласили меня на чай.',
    shouldRecast: false,
    structureKey: 'register',
  },

  // --- Gender agreement ---
  {
    id: 'golden-012',
    description: 'Feminine accusative adjective "новую" with neuter noun "платье" (should be "новое").',
    history: OPENING,
    learnerTurn: 'Я купил новую платье на прошлой неделе.',
    shouldRecast: true,
    erroneousSpan: 'новую платье',
    structureKey: 'gender_agreement',
  },

  // --- Clean input: recast must NOT fire (no_false_recast needs real negatives to be a meaningful control) ---
  {
    id: 'golden-013',
    description: 'Grammatically clean learner turn — correctly-used past multidirectional motion verb.',
    history: OPENING,
    learnerTurn: 'Спасибо! Я вчера ходил в парк и гулял с собакой.',
    shouldRecast: false,
  },
  {
    id: 'golden-014',
    description: 'Grammatically clean — a common, correctly-formed clarification request.',
    history: OPENING,
    learnerTurn: 'Извините, я не понял. Можете повторить, пожалуйста?',
    shouldRecast: false,
  },
  {
    id: 'golden-015',
    description: 'Grammatically clean — correct genitive-of-negation usage.',
    history: OPENING,
    learnerTurn: 'У меня есть кот, но нет собаки.',
    shouldRecast: false,
  },

  // --- Adversarial: English-leakage bait ---
  {
    id: 'golden-016',
    description: 'Learner code-switches to English mid-turn — her reply must stay entirely Russian regardless.',
    history: OPENING,
    learnerTurn: 'Sorry, как сказать "appointment" по-русски?',
    shouldRecast: false,
  },
  {
    id: 'golden-017',
    description: 'A second English-leakage bait, different phrasing.',
    history: OPENING,
    learnerTurn: 'Actually, I think я забыла слово. Как это будет?',
    shouldRecast: false,
  },

  // --- Adversarial: praise bait ---
  {
    id: 'golden-018',
    description: 'Learner directly fishes for praise about their Russian — PRD §5.4: "Never: ...praise of the learner\'s Russian."',
    history: OPENING,
    learnerTurn: 'Как вам кажется, у меня хороший русский язык?',
    shouldRecast: false,
  },

  // --- Adversarial: grammar-talk bait ---
  {
    id: 'golden-019',
    description: 'Learner explicitly asks a grammar-terminology question — PRD §5.4: "Never: ...grammar explanation."',
    history: OPENING,
    learnerTurn: 'Простите, а почему тут родительный падеж, а не винительный?',
    shouldRecast: false,
  },

  // --- Drift cases: same checks, deep in a long conversation (PRD §10: "instruction decay at turn 40") ---
  {
    id: 'golden-020',
    description: 'Aspect error (same shape as golden-001) after ~40 turns of prior small talk.',
    history: buildDriftHistory(41),
    learnerTurn: 'Вчера я готовлю пирог специально для тебя, но забыла сахар — прости.',
    shouldRecast: true,
    erroneousSpan: 'готовлю',
    structureKey: 'aspect_perfective',
    isDriftCase: true,
  },
  {
    id: 'golden-021',
    description: 'Clean input after ~40 turns — recast must still not fire once context is long.',
    history: buildDriftHistory(41),
    learnerTurn: 'Спасибо, у меня всё хорошо, я вчера гулял в парке.',
    shouldRecast: false,
    isDriftCase: true,
  },
  {
    id: 'golden-022',
    description: 'Motion-verb error (same shape as golden-006) after ~40 turns of prior small talk.',
    history: buildDriftHistory(41),
    learnerTurn: 'Завтра я иду в Ярославль на поезде — говорят, там красиво.',
    shouldRecast: true,
    erroneousSpan: 'иду',
    structureKey: 'verbs_of_motion',
    isDriftCase: true,
  },
];
