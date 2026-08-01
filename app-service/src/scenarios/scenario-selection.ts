/**
 * Pure scenario/complication selection math. No I/O — DB-touching
 * orchestration (reading learner_structures, session history) lives in
 * scenario-selector.ts. Kept separate so this can be unit-tested against
 * fixtures without a real session or LLM call, matching the precedent
 * set by debrief-ranking.ts (ticket #20).
 */

/**
 * Number of complication levels a scenario has (PRD §5.3's tea example:
 * offers tea → out of the tea you like → offended you didn't visit —
 * three levels). Matches the Tomorrow screen's existing 3-item ladder
 * fixture shape.
 */
export const COMPLICATION_LEVELS = 3;

/**
 * PRD §5.2/§5.3 describe complication scaling by demonstrated
 * performance but don't specify exact thresholds — provisional, tunable
 * constants. See docs/adr/0005-complication-level-step-function.md.
 */
export const SUCCESS_ESCALATE_THRESHOLD = 0.7;
export const STRUGGLE_DEESCALATE_THRESHOLD = 0.35;

export type ComplicationLevelInput = {
  previousLevel: number;
  /** successes / (attempts + avoidances) across the learner's learner_structures rows; null when there's no signal yet (e.g. a first session). Avoidances count against readiness the same way a failed attempt does (PRD §5.5). */
  performanceRate: number | null;
};

/**
 * Ticket #21 UAT: "harder complication after success, same/lower after
 * struggle" — a step relative to the previous session's level, not an
 * absolute mapping from raw stats. No signal yet (null performanceRate)
 * holds at the previous level rather than guessing.
 */
export function computeNextComplicationLevel({ previousLevel, performanceRate }: ComplicationLevelInput): number {
  if (performanceRate === null)
    return previousLevel;
  if (performanceRate >= SUCCESS_ESCALATE_THRESHOLD)
    return Math.min(previousLevel + 1, COMPLICATION_LEVELS - 1);
  if (performanceRate < STRUGGLE_DEESCALATE_THRESHOLD)
    return Math.max(previousLevel - 1, 0);
  return previousLevel;
}

export type ScenarioCandidate = {
  id: string;
  /** Sessions elapsed since this scenario was last used for this learner; null if never used. */
  sessionsSinceLastUse: number | null;
};

/**
 * Picks the scenario due for reuse (PRD risk #3, "repetition wall" —
 * maximize variety). Never-used scenarios (null) come first — an
 * infinite gap outranks any finite one. Ties broken by `id` for
 * determinism (stable across repeated calls with identical input).
 */
export function selectLeastRecentlyUsedScenario(candidates: ScenarioCandidate[]): ScenarioCandidate {
  if (candidates.length === 0)
    throw new Error('selectLeastRecentlyUsedScenario requires at least one candidate');
  return [...candidates].sort((a, b) => {
    if (a.sessionsSinceLastUse === null && b.sessionsSinceLastUse === null)
      return a.id.localeCompare(b.id);
    if (a.sessionsSinceLastUse === null)
      return -1;
    if (b.sessionsSinceLastUse === null)
      return 1;
    if (a.sessionsSinceLastUse !== b.sessionsSinceLastUse)
      return b.sessionsSinceLastUse - a.sessionsSinceLastUse;
    return a.id.localeCompare(b.id);
  })[0] as ScenarioCandidate;
}
