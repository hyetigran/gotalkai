/**
 * Ticket #36 / docs/adr/0024: the three PRD §5.2 difficulty dials
 * (comprehension load, production demand, repair behaviour — each 1-5,
 * "stored per session") as real data for the first time. No prior
 * ticket wrote any of these anywhere; `sessions.calibration` has only
 * ever carried `complicationLevel` (ADR-0005).
 */

export const CALIBRATION_VARIANTS = ['partner_learner', 'heritage_speaker'] as const;
export type CalibrationVariant = (typeof CALIBRATION_VARIANTS)[number];

/** Валентина — every learner's default until onboarding/settings says otherwise (ticket #30's own precedent for `cyrillicLiterate`/`translitEnabled`). */
export const DEFAULT_CALIBRATION_VARIANT: CalibrationVariant = 'partner_learner';

export type DialDefaults = {
  comprehensionLoad: number;
  productionDemand: number;
  repairBehaviour: number;
};

/**
 * `partner_learner`: Валентина's own already-committed
 * `mobile/src/features/address-book/address-book-fixture.ts` dial
 * values `[2, 2, 1]` — adopted directly rather than invented fresh, per
 * docs/adr/0024.
 *
 * `heritage_speaker`: comprehension load moves *up* (PRD's 1-5 scale
 * describes 5 as "natural speed, regional idiom, elision" — what a
 * heritage speaker's ear is already used to), production demand moves
 * *down* (PRD's 1, "fragments accepted" — meeting the learner where
 * their actual output ability is, per the AC's own framing: "already
 * listens well but produces little"), repair behaviour stays low
 * (building production confidence, not testing resilience against a
 * learner whose fragile output is more likely to be misheard than a
 * confident partner-learner's). See docs/adr/0024's own table for the
 * full reasoning behind each number.
 */
export const DIAL_DEFAULTS: Record<CalibrationVariant, DialDefaults> = {
  partner_learner: { comprehensionLoad: 2, productionDemand: 2, repairBehaviour: 1 },
  heritage_speaker: { comprehensionLoad: 4, productionDemand: 1, repairBehaviour: 1 },
};

export function getDialDefaults(variant: CalibrationVariant): DialDefaults {
  return DIAL_DEFAULTS[variant];
}
