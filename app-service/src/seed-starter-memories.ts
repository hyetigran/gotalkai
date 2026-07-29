import type { Pool, PoolClient } from 'pg';

import { recordPersonaMemory } from './persona-memories';

/**
 * Session one is seeded with 1–2 memories rather than opening cold
 * (ticket #22 AC #3; PRD risk #2: "Session one has no memory, and it is
 * the highest-stakes session in the funnel"). Generic, not personalized
 * to real onboarding answers — there's no onboarding flow yet (ticket
 * #30) to personalize from. Once #30 lands, seeding should read the
 * learner's actual onboarding answers instead of using this fixed pair.
 */
const STARTER_MEMORIES: string[] = [
  'Она рада, что вы наконец решили начать заниматься.',
  'Она уже предвкушает, о чём с вами поговорит.',
];

export async function seedStarterMemories(pool: Pool | PoolClient, learnerId: string): Promise<void> {
  for (const content of STARTER_MEMORIES)
    await recordPersonaMemory(pool, learnerId, content);
}
