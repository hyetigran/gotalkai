/**
 * Pure debrief ranking math (PRD §5.4). No I/O — DB-touching orchestration
 * (grouping a session's observations, fetching learner_structures rows,
 * checking prior sessions for `told_recently`) lives in debrief.ts. Kept
 * separate so this can be unit-tested against fixtures without a real
 * session or LLM call, per ticket #20's UAT.
 */

/**
 * PRD §5.4 defines readiness only at its boundaries ("0 if below
 * cefr_floor or far above") — it doesn't specify a per-structure CEFR
 * floor catalog, and `learners` has no stored CEFR level yet (that's
 * onboarding/calibration, ticket #30, not this ticket). See
 * docs/adr/0004-debrief-readiness-proxy.md for the full reasoning: this
 * proxies "cefr_floor"/"far above" using the learner's own exposure and
 * stability for that specific structure (learner_structures, ticket #19)
 * rather than a separate global CEFR-level system. Provisional, tunable
 * constants — not a recorded product decision on the exact thresholds.
 */
export const READINESS_MIN_EXPOSURES = 2;
export const READINESS_MASTERY_STABILITY = 0.85;

export type ReadinessInput = {
  exposures: number;
  stability: number;
};

/**
 * 0 if the learner hasn't seen this structure enough yet to usefully
 * receive feedback on it (below the floor), 0 if they've already
 * mastered it (far above — repeating it back adds nothing), 1 otherwise.
 * A step function, not a graded curve: PRD §5.4 only specifies the two
 * zero boundaries, so this doesn't invent behaviour it didn't ask for.
 */
export function computeReadiness({ exposures, stability }: ReadinessInput): number {
  if (exposures < READINESS_MIN_EXPOSURES)
    return 0;
  if (stability >= READINESS_MASTERY_STABILITY)
    return 0;
  return 1;
}

export type ObservationScoreInput = {
  frequency: number;
  impeded: boolean;
  readiness: number;
  toldRecently: boolean;
};

/** PRD §5.4, verbatim: `score = frequency × (impeded ? 2.0 : 1.0) × readiness × (told_recently ? 0.3 : 1.0)`. */
export function computeObservationScore({ frequency, impeded, readiness, toldRecently }: ObservationScoreInput): number {
  return frequency * (impeded ? 2.0 : 1.0) * readiness * (toldRecently ? 0.3 : 1.0);
}
