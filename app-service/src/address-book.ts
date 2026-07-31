import type { Pool } from 'pg';
import type { AddressBookEntryStatus } from './address-book-math';
import { computeAddressBookEntryStatus } from './address-book-math';
import type { DialDefaults } from './calibration-profiles';
import { READINESS_MASTERY_STABILITY } from './debrief-ranking';
import { PERSONA_DIALS, PERSONA_IDS } from './personas';
import type { PersonaId } from './personas';

/**
 * Ticket #34 AC #3 (PRD §6.4's persona-cast Address book): "shows Елена
 * as sealed/next/reached based on real `learner_structures` B1-readiness
 * data, not a hardcoded flag." DB-fetch half — see address-book-math.ts
 * for the pure status computation this hands off to. `dials` (AC #2)
 * is each persona's own static baseline characterization
 * (`personas.ts`'s `PERSONA_DIALS`) — not this learner's dynamic
 * `calibration_variant` (ticket #36), which is a different, orthogonal
 * axis (docs/adr/0024).
 */

export type AddressBookEntry = { personaId: PersonaId; status: AddressBookEntryStatus; dials: DialDefaults };

async function getMasteredStructureCount(pool: Pool, learnerId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM learner_structures WHERE learner_id = $1 AND stability >= $2',
    [learnerId, READINESS_MASTERY_STABILITY],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function getAddressBookForLearner(pool: Pool, learnerId: string): Promise<AddressBookEntry[]> {
  const masteredStructureCount = await getMasteredStructureCount(pool, learnerId);
  return PERSONA_IDS.map(personaId => ({
    personaId,
    status: computeAddressBookEntryStatus(personaId, masteredStructureCount),
    dials: PERSONA_DIALS[personaId],
  }));
}
