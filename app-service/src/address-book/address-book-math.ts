import type { PersonaId } from '../memories/personas';

/**
 * Ticket #34 AC #3 / docs/adr/0023: pure B1-readiness math. No I/O —
 * DB-touching orchestration lives in address-book.ts, kept separate for
 * the same reason debrief-ranking.ts/debrief.ts already are (unit-testable
 * against fixtures, no real session or DB needed). Importing `PersonaId`
 * is a type-only dependency (erased at build time) — it doesn't pull in
 * any of personas.ts's runtime code, so this file's "no I/O" property
 * still holds.
 */

export type AddressBookEntryStatus = 'reached' | 'next' | 'sealed';

/**
 * No stored CEFR level exists anywhere in this schema — same structural
 * gap docs/adr/0004's debrief-readiness proxy already documented for a
 * different purpose. "B1-ready" is proxied here the same way that ADR
 * proxies "cefr_floor"/"far above": from real `learner_structures` data,
 * reusing `debrief-ranking.ts`'s own `READINESS_MASTERY_STABILITY`
 * (0.85) rather than inventing a second mastery threshold for the same
 * underlying signal.
 *
 * `B1_READY_STRUCTURE_COUNT` is a provisional, tunable constant — not a
 * recorded product decision on the exact number, matching ADR-0005's own
 * disclosure posture for `SUCCESS_ESCALATE_THRESHOLD`/`COMPLICATION_LEVELS`.
 * Three (of the five PRD §5.8 taxonomy structures) is a middle-of-the-road
 * reading of "ready to unlock a harder persona" — mastering a bare
 * majority, not all five and not just one.
 */
export const B1_READY_STRUCTURE_COUNT = 3;

export function isB1Ready(masteredStructureCount: number): boolean {
  return masteredStructureCount >= B1_READY_STRUCTURE_COUNT;
}

/**
 * Валентина is always `'reached'` — the only persona a new learner ever
 * starts with (PRD §6.4: "shipping one persona"), never gated. Every
 * other known persona (just Елена, for real, today) is `'reached'` once
 * B1-ready, `'next'` otherwise. `'sealed'` is a real status this type
 * supports (the mockup's fuller five-persona cast — Маша, Дима, Ирина —
 * uses it), but with only two personas actually built, nothing in this
 * function ever produces it: Елена is always at minimum "the next one
 * up," never several unlocks away. That's an honest property of the real
 * data being smaller than the mockup's cast, not a gap in the type.
 */
export function computeAddressBookEntryStatus(personaId: PersonaId, masteredStructureCount: number): AddressBookEntryStatus {
  if (personaId === 'valentina')
    return 'reached';
  return isB1Ready(masteredStructureCount) ? 'reached' : 'next';
}
