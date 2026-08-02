/**
 * Fixture data for the Address book screen. Ported verbatim from the
 * mockup's `CAST` array and `T.en` copy —
 * `Initial mockup request/design_handoff_conversation_loop/Speaking
 * Practice - core loop.dc.html`.
 *
 * `registerAxes` fields are deliberately named for what they position, not
 * for the mockup's `x`/`y` field names — the reference implementation maps
 * the formal↔casual meter's dot to `y` and the transactional↔relational
 * meter's dot to `x` (not the other way round), which reads as arbitrary
 * unless the field names say what they mean.
 */

import type { CastId } from '../cast/cast-assets';

export type EntryStatus = 'reached' | 'next' | 'sealed';

export type CastMember = {
  name: string;
  initial: string;
  /** Keys into `CAST_PORTRAITS` (cast-assets.ts) for this member's real flat portrait. */
  castId: CastId;
  level: string;
  role: string;
  /** The register description shown in the expanded body's portrait-slot row. */
  trains: string;
  /** [comprehension, production, repair], each out of 5. */
  dials: readonly [number, number, number];
  registerAxes: {
    formalCasualPercent: number;
    transactionalRelationalPercent: number;
  };
};

/** Only the first `REACHED_COUNT` entries are reached; the next one is "next up"; the rest are sealed. */
export const REACHED_COUNT = 1;

/** From the mockup's `trail`/`requirement` derivations: `12 * reachedCount`. */
export const CONVERSATIONS_PER_LEVEL = 12;

export const CAST_FIXTURE: readonly CastMember[] = [
  {
    name: 'Valentina',
    initial: 'VS',
    castId: 'valentina',
    level: 'A2',
    role: 'Grandmother-in-law · retired librarian',
    trains: 'ты from her, вы from you. Storytelling, backchanneling, domestic register.',
    dials: [2, 2, 1],
    registerAxes: { formalCasualPercent: 22, transactionalRelationalPercent: 64 },
  },
  {
    name: 'Elena Nikolaevna',
    initial: 'EN',
    castId: 'elena',
    level: 'B1',
    role: 'Mother-in-law · school administrator',
    trains: 'A younger relative who talks fast and does not slow down for you. Idiom, elision.',
    dials: [4, 3, 4],
    registerAxes: { formalCasualPercent: 50, transactionalRelationalPercent: 71 },
  },
  {
    name: 'Masha',
    initial: 'M',
    castId: 'masha',
    level: 'B1',
    role: 'Cousin-in-law · barista, 26',
    trains: 'Partner’s cousin, your age. Slang, teasing, texting register spoken aloud.',
    dials: [4, 4, 3],
    registerAxes: { formalCasualPercent: 73, transactionalRelationalPercent: 48 },
  },
  {
    name: 'Dima',
    initial: 'D',
    castId: 'dima',
    level: 'B2',
    role: 'Taxi driver · Yaroslavl',
    trains: 'Taxi driver. ты both ways, transactional pressure, numbers and directions under time.',
    dials: [4, 2, 5],
    registerAxes: { formalCasualPercent: 63, transactionalRelationalPercent: 24 },
  },
  {
    name: 'Irina V.',
    initial: 'IV',
    castId: 'irina',
    level: 'B2',
    role: 'Clinic receptionist',
    trains: 'Clinic receptionist. вы both ways, forms and appointments, no patience for hesitation.',
    dials: [3, 4, 4],
    registerAxes: { formalCasualPercent: 24, transactionalRelationalPercent: 26 },
  },
] as const;

export const ADDRESS_BOOK_COPY = {
  castHead: 'Who to talk to',
  bookHead: 'Your address book',
  axisFormal: 'formal',
  axisCasual: 'casual',
  axisTransactional: 'transactional',
  axisRelational: 'relational',
  dialLabels: ['comprehension', 'production', 'repair'] as const,
  /** Never "coming soon" — the gate is ability, not a release date. */
  gate: {
    playingNow: 'you talk to her daily',
    nextUp: 'next up',
    sealedPrefix: 'Sealed until ',
  },
  requirement: (conversationsNeeded: number) => `${conversationsNeeded} more conversations at this level`,
  trail: (reachedCount: number, total: number, nextLevel: string) =>
    `${reachedCount} of ${total} · ${CONVERSATIONS_PER_LEVEL * reachedCount} more conversations to ${nextLevel}`,
  talkToPrefix: 'Talk to ',
} as const;
