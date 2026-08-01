import type { Pool, PoolClient } from 'pg';

import { recordPersonaMemory } from './persona-memories';
import { DEFAULT_PERSONA_ID } from './personas';

/**
 * Session one is seeded with 1–2 memories rather than opening cold
 * (ticket #22 AC #3; PRD risk #2: "Session one has no memory, and it is
 * the highest-stakes session in the funnel"). Generic, not personalized
 * to real onboarding answers — there's no onboarding flow yet (ticket
 * #30) to personalize from. Once #30 lands, seeding should read the
 * learner's actual onboarding answers instead of using this fixed pair.
 *
 * Ticket #34 / docs/adr/0023: seeded for Валентина specifically, not
 * every persona — she's the only one a new learner ever starts with;
 * Елена is sealed until B1, and seeding memories for a persona no
 * session can reference yet would be dead data.
 */
const STARTER_MEMORIES: string[] = [
  'Она рада, что вы наконец решили начать заниматься.',
  'Она уже предвкушает, о чём с вами поговорит.',
];

export async function seedStarterMemories(pool: Pool | PoolClient, learnerId: string): Promise<void> {
  for (const content of STARTER_MEMORIES)
    await recordPersonaMemory(pool, learnerId, content, DEFAULT_PERSONA_ID);
}
