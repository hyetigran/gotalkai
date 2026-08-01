import type { CalibrationVariant } from '../learners/calibration-profiles';

/**
 * Ticket #36 AC #3 (PRD §14 risk #9): "audit §5.8 priority order against
 * external reference (CEFR descriptors, ТРКИ syllabus, a teacher's view)
 * rather than felt difficulty." Canonical `structureKey` strings match
 * what scenario content and the eval golden set already use
 * (`voice-service/src/eval/golden-set.ts`, `seed-scenarios.ts`) — no new
 * vocabulary invented.
 *
 * See docs/adr/0024 for the full reasoning behind the heritage reorder,
 * including its honest limits (the case-government fossilization claim
 * is general heritage-language-acquisition literature, not a specific
 * citable CEFR passage or verified ТРКИ syllabus section — this
 * environment has no way to check either against a primary source with
 * real confidence).
 */

export const DEFAULT_STRUCTURE_PRIORITY = [
  'aspect_perfective',
  'verbs_of_motion',
  'stress_placement',
  'register',
  'case_government',
] as const;

/**
 * Register first: CEFR's Sociolinguistic Appropriateness descriptor
 * scale treats register/politeness command as a *productive*,
 * comparatively late-maturing skill, distinct from and often lagging
 * behind basic comprehension — exactly heritage speakers' documented
 * profile (native-level receptive recognition of formality, weak
 * controlled *production* of it, since home input skews informal).
 * Case government second: the well-documented heritage-speaker
 * "fossilization" pattern (default toward nominative/accusative,
 * flattened oblique-case marking under production pressure, despite
 * correct receptive recognition) — another productive-specific gap.
 * Aspect/motion verbs/stress lower, not absent: more perceptually/
 * lexically anchored categories that natural exposure tends to leave
 * comparatively more stable even in production.
 */
export const HERITAGE_STRUCTURE_PRIORITY = [
  'register',
  'case_government',
  'aspect_perfective',
  'verbs_of_motion',
  'stress_placement',
] as const;

export type StructureKey = (typeof DEFAULT_STRUCTURE_PRIORITY)[number];

const STRUCTURE_PRIORITY_BY_VARIANT: Record<CalibrationVariant, readonly StructureKey[]> = {
  partner_learner: DEFAULT_STRUCTURE_PRIORITY,
  heritage_speaker: HERITAGE_STRUCTURE_PRIORITY,
};

export function getStructureTaxonomyPriority(variant: CalibrationVariant): readonly StructureKey[] {
  return STRUCTURE_PRIORITY_BY_VARIANT[variant];
}
