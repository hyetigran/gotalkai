import type { TurnTimestamps } from './messages';

/**
 * Ticket #29 (PRD §11): "Trace shape: one trace per session, span per
 * turn, child spans per pipeline stage." Built from the six timestamps
 * `turn-orchestrator.ts` already computes per turn — this module turns
 * them into named child spans and logs a structured line, ready for a
 * real collector to ingest. See docs/adr/0022: no tracing backend
 * (Honeycomb/Datadog/an OTel collector) has an account in this
 * environment, so `logTrace` is the export seam, not a claim that traces
 * are queryable anywhere today.
 */

export type Span = {
  name: 'stt' | 'persona_llm' | 'stress_annotation' | 'tts_first_audio';
  /** Offset from the turn's own start (`t0TurnDetected`), not wall-clock — matches how a span's `startTime` is normally expressed relative to its parent trace. */
  startOffsetMs: number;
  durationMs: number;
};

/** Matches turn-orchestrator.ts's own stage boundaries (messages.ts's doc comment on `TurnTimestamps`) — the same mapping app-service's p95-math.ts independently derives server-side from the persisted copy of this same data. */
export function buildTurnSpans(t: TurnTimestamps): Span[] {
  return [
    { name: 'stt', startOffsetMs: 0, durationMs: t.t1SttFinal - t.t0TurnDetected },
    { name: 'persona_llm', startOffsetMs: t.t2PersonaStart - t.t0TurnDetected, durationMs: t.t3PersonaComplete - t.t2PersonaStart },
    { name: 'stress_annotation', startOffsetMs: t.t3PersonaComplete - t.t0TurnDetected, durationMs: t.t4StressAnnotated - t.t3PersonaComplete },
    { name: 'tts_first_audio', startOffsetMs: t.t4StressAnnotated - t.t0TurnDetected, durationMs: t.t5FirstAudio - t.t4StressAnnotated },
  ];
}

/**
 * One structured line per turn, tagged `[trace]` for easy grepping/log-
 * pipeline routing until a real collector exists. `sessionId`/`turnId`
 * give the "one trace per session, span per turn" nesting a real backend
 * would key on.
 */
export function logTrace(sessionId: string, turnId: string, timestamps: TurnTimestamps): void {
  console.log('[trace]', { sessionId, turnId, spans: buildTurnSpans(timestamps) });
}
