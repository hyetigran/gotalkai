import type { TranscriptTurn } from '../persona';

/**
 * Ticket #28 (PRD §10): a single frozen golden-set entry. Append-only
 * once committed (see append-only.ts) — every field here is what a future
 * reader needs to understand what's being tested without re-deriving it,
 * since the entry itself can never be edited to clarify later.
 */
export type GoldenEntry = {
  /** Stable, never-reused identifier — the unit append-only enforcement protects. */
  id: string;
  /** Human-readable note on what this entry tests, for anyone reading a failure report. */
  description: string;
  /** Conversation history before the final learner turn, in `generatePersonaTurn`'s own input shape (ticket #14) — reused, not a separately maintained transcript type. */
  history: TranscriptTurn[];
  /** The learner's final turn Валентина is responding to. */
  learnerTurn: string;
  /** Whether a correct response recasts this specific learner turn (PRD §5.4) — false for clean-input and adversarial-probe entries, where a recast firing at all would itself be a false positive. */
  shouldRecast: boolean;
  /** The exact erroneous span from `learnerTurn`, present only when `shouldRecast` is true — `checkNoMissedRecast` uses this to check the persona's reply doesn't just echo the mistake back uncorrected. */
  erroneousSpan?: string;
  /** PRD §5.8 structure-taxonomy key the planted error targets, when applicable — not exhaustive of every entry (clean/adversarial entries have none). */
  structureKey?: string;
  /**
   * PRD §10: "Catches instruction decay at turn 40." True for entries
   * whose `history` is long enough to probe whether the persona's
   * behavior degrades deep in context — these are the ones the "drift
   * cases pass 100%" gate applies to specifically, not the whole set.
   */
  isDriftCase?: boolean;
};
