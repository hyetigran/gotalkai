import type { DialDefaults } from './calibration-profiles';

/**
 * Ticket #34 / docs/adr/0023: the persona-id vocabulary app-service needs
 * to scope `persona_memories` (and, per ticket #36, the Address book) by
 * persona. Deliberately minimal — no identity/prompt content lives here,
 * that's voice-service's `personas.ts`. Duplicated rather than imported:
 * no pnpm workspace links the two services (same constraint docs/adr/0012
 * already hit for the eval harness).
 */
export const PERSONA_IDS = ['valentina', 'elena'] as const;
export type PersonaId = (typeof PERSONA_IDS)[number];

/** Валентина — the only persona a new learner ever starts with (PRD §6.4: "shipping one persona"). */
export const DEFAULT_PERSONA_ID: PersonaId = 'valentina';

/**
 * Ticket #34 AC #2: "Елена Николаевна added... with her own register/dial
 * calibration distinct from Валентина's ты/вы asymmetry." Register is
 * handled in voice-service's own `personas.ts` (the persona LLM prompt
 * layer); this is the other half — each persona's own baseline
 * difficulty characterization, independent of a learner's
 * `calibration_variant` (ticket #36's own, orthogonal axis — see
 * docs/adr/0024's "distinct from *persona*"). Values match
 * `mobile/src/features/address-book/address-book-fixture.ts`'s own
 * already-committed `CAST_FIXTURE` dials verbatim (Валентина `[2, 2, 1]`,
 * Елена `[4, 3, 4]`) — the same source docs/adr/0023 already draws
 * Елена's identity-prompt characterization from, not new numbers.
 */
export const PERSONA_DIALS: Record<PersonaId, DialDefaults> = {
  valentina: { comprehensionLoad: 2, productionDemand: 2, repairBehaviour: 1 },
  elena: { comprehensionLoad: 4, productionDemand: 3, repairBehaviour: 4 },
};
