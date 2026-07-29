/**
 * Ticket #29 (PRD §11): pure aggregation math for the four derived
 * quality metrics. No I/O — DB-touching fetches live in metrics.ts, kept
 * separate so this can be unit-tested against fixture rows without a
 * real database, matching this codebase's established split (see
 * debrief-ranking.ts/debrief.ts).
 */

export type InterruptionRow = { level: string | null; interruptedAfterMs: number };
export type FalseInterruptionRateByLevel = { level: string | null; falseInterruptionRate: number; totalInterruptions: number };

/**
 * PRD §11: "learner resumes within ~500ms of her starting" — see
 * docs/adr/0022 for why 500ms is the precise threshold this reads that
 * as. Grouped by level per AC's own "track per level." A level with zero
 * recorded interruptions doesn't appear in the result at all — there is
 * nothing to report a rate over, and 0/0 isn't a real 0%.
 */
export const FALSE_INTERRUPTION_THRESHOLD_MS = 500;

export function computeFalseInterruptionRate(rows: InterruptionRow[]): FalseInterruptionRateByLevel[] {
  const byLevel = new Map<string | null, InterruptionRow[]>();
  for (const row of rows) {
    const group = byLevel.get(row.level) ?? [];
    group.push(row);
    byLevel.set(row.level, group);
  }
  return [...byLevel.entries()].map(([level, group]) => ({
    level,
    falseInterruptionRate: group.filter(row => row.interruptedAfterMs < FALSE_INTERRUPTION_THRESHOLD_MS).length / group.length,
    totalInterruptions: group.length,
  }));
}

export type RevealRow = { revealed: boolean };

/** PRD §11: "how often the learner taps for a translation." Zero persona turns yields 0, not NaN — no data isn't the same as a real 0% rate, but there's nothing more informative to report from an empty set. */
export function computeRevealRate(rows: RevealRow[]): number {
  if (rows.length === 0)
    return 0;
  return rows.filter(row => row.revealed).length / rows.length;
}

export type SessionTurnCountRow = { sessionId: string; level: string | null; turnCount: number };
export type AbandonmentByLevel = { level: string | null; averageFinalTurnIndex: number; sessionCount: number };

/**
 * PRD §11: "where people quit, crossed against session calibration."
 * There is no separate "session complete" marker anywhere in this
 * protocol (see docs/adr/0022) — a session's own final turn count is the
 * only signal of where it stopped, whether that was a natural end or an
 * abandonment. Grouped by level so a caller can see "which dial setting
 * loses people," per PRD's own framing.
 */
export function computeAbandonmentByLevel(rows: SessionTurnCountRow[]): AbandonmentByLevel[] {
  const byLevel = new Map<string | null, SessionTurnCountRow[]>();
  for (const row of rows) {
    const group = byLevel.get(row.level) ?? [];
    group.push(row);
    byLevel.set(row.level, group);
  }
  return [...byLevel.entries()].map(([level, group]) => ({
    level,
    averageFinalTurnIndex: group.reduce((sum, row) => sum + row.turnCount, 0) / group.length,
    sessionCount: group.length,
  }));
}

/**
 * PRD §11: "free proxy for comprehension load being too high ... coarser
 * than reveal rate; keep both, they disagree usefully." A keyword
 * heuristic over the learner's own turn content, disclosed as exactly
 * that (docs/adr/0022) — not an NLU classifier, and deliberately not the
 * same signal as the STT-confidence-triggered "didn't catch that"
 * mechanic (turn-orchestrator.ts), which is about the system failing to
 * hear the learner, the opposite direction from the learner asking her
 * to repeat herself.
 */
export const REPEAT_REQUEST_CUE_PHRASES = ['что?', 'повтори', 'не поняла', 'не понял', 'ещё раз', 'простите'];

export type RepeatRequestRow = { content: string };

export function isRepeatRequest(content: string): boolean {
  const normalized = content.toLowerCase();
  return REPEAT_REQUEST_CUE_PHRASES.some(phrase => normalized.includes(phrase));
}

export function computeRepeatRequestRate(rows: RepeatRequestRow[]): number {
  if (rows.length === 0)
    return 0;
  return rows.filter(row => isRepeatRequest(row.content)).length / rows.length;
}
