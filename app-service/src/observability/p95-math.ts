/**
 * Ticket #29 (PRD §11): "Alert on P95, never mean." Pure percentile math
 * over per-turn stage durations derived from the six-timestamp log
 * (voice-service/src/messages.ts's `TurnTimestamps`, persisted verbatim
 * into `turns.timings`) — no I/O, matching this directory's
 * metrics/metrics-math split. See docs/adr/0022 for why this runs as a
 * periodic check over a trailing window rather than per-turn: a single
 * turn has no percentile of its own.
 */

export type TurnTimings = {
  t0TurnDetected: number;
  t1SttFinal: number;
  t2PersonaStart: number;
  t3PersonaComplete: number;
  t4StressAnnotated: number;
  t5FirstAudio: number;
};

export type StageDurationsMs = {
  stt: number;
  personaLlm: number;
  stressAnnotation: number;
  ttsFirstAudio: number;
  total: number;
};

/** Matches turn-orchestrator.ts's own stage boundaries (messages.ts's doc comment on `TurnTimestamps`) — not a re-derivation, the same mapping. */
export function computeStageDurations(t: TurnTimings): StageDurationsMs {
  return {
    stt: t.t1SttFinal - t.t0TurnDetected,
    personaLlm: t.t3PersonaComplete - t.t2PersonaStart,
    stressAnnotation: t.t4StressAnnotated - t.t3PersonaComplete,
    ttsFirstAudio: t.t5FirstAudio - t.t4StressAnnotated,
    total: t.t5FirstAudio - t.t0TurnDetected,
  };
}

/**
 * Nearest-rank P95: sorts ascending, takes the value at index
 * `ceil(0.95 * n) - 1`. Standard, simple, and doesn't require
 * interpolation between points — appropriate for the sample sizes a
 * single trailing window of turns actually has. Throws on an empty
 * array rather than returning a fabricated 0 — "no data" and "P95 is
 * zero" are different facts, and callers (p95.ts) skip stages with no
 * samples rather than calling this on an empty list.
 */
export function percentile95(values: number[]): number {
  if (values.length === 0)
    throw new Error('percentile95 called with an empty array');
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[index] as number;
}

export type P95ByStage = { stt: number; personaLlm: number; stressAnnotation: number; ttsFirstAudio: number; total: number };

export function computeP95ByStage(durations: StageDurationsMs[]): P95ByStage {
  return {
    stt: percentile95(durations.map(d => d.stt)),
    personaLlm: percentile95(durations.map(d => d.personaLlm)),
    stressAnnotation: percentile95(durations.map(d => d.stressAnnotation)),
    ttsFirstAudio: percentile95(durations.map(d => d.ttsFirstAudio)),
    total: percentile95(durations.map(d => d.total)),
  };
}

export type P95BudgetBreach = { stage: keyof P95ByStage; p95Ms: number; budgetMs: number };

/** Only `total` is checked against the budget by default — per-stage numbers are what makes a breach diagnosable (PRD: "one 3-second turn ruins a session without moving the average"), but the budget itself (docs/adr/0022: P95_LATENCY_BUDGET_MS) is PRD §7.3's end-to-end target, not a per-stage figure nothing in PRD specifies. */
export function findP95BudgetBreach(p95: P95ByStage, budgetMs: number): P95BudgetBreach | null {
  if (p95.total <= budgetMs)
    return null;
  return { stage: 'total', p95Ms: p95.total, budgetMs };
}
