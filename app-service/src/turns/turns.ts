import type { Pool } from 'pg';
import { z } from 'zod';

/**
 * Ticket #29 / docs/adr/0022: the write path `turns` never had. Voice
 * service posts one artefact per turn "after turns or at session end"
 * (ARCHITECTURE.md §3's own sequence) — this is that endpoint's request
 * shape and the insert it drives. `timings` mirrors
 * `voice-service/src/messages.ts`'s `TurnTimestamps` field-for-field;
 * duplicated rather than imported because this repo has no pnpm
 * workspace linking app-service to voice-service (same constraint
 * docs/adr/0012 already hit for the eval harness).
 */
export const recordTurnRequestSchema = z.object({
  speaker: z.enum(['persona', 'learner']),
  content: z.string(),
  personaRegister: z.string().optional(),
  learnerRegister: z.string().optional(),
  revealed: z.boolean().optional(),
  timings: z.object({
    t0TurnDetected: z.number(),
    t1SttFinal: z.number(),
    t2PersonaStart: z.number(),
    t3PersonaComplete: z.number(),
    t4StressAnnotated: z.number(),
    t5FirstAudio: z.number(),
  }).optional(),
  /** This row's own attributable vendor-cost estimate — see docs/adr/0022's "cost" section for what is and isn't priced in. */
  costUsd: z.number().nonnegative().optional(),
});

export type RecordTurnRequest = z.infer<typeof recordTurnRequestSchema>;

export const recordInterruptionRequestSchema = z.object({
  interruptedAfterMs: z.number().int().nonnegative(),
});

export type RecordInterruptionRequest = z.infer<typeof recordInterruptionRequestSchema>;

/** Writes one `turns` row. Returns the new row's id. */
export async function recordTurn(pool: Pool, sessionId: string, data: RecordTurnRequest): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO turns (session_id, speaker, content, persona_register, learner_register, revealed, timings, cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      sessionId,
      data.speaker,
      data.content,
      data.personaRegister ?? null,
      data.learnerRegister ?? null,
      data.revealed ?? false,
      data.timings ? JSON.stringify(data.timings) : null,
      data.costUsd ?? null,
    ],
  );
  const row = result.rows[0];
  if (!row)
    throw new Error('insert did not return a row');
  return row.id;
}

/**
 * Ticket #29 AC #3: reveal rate "needs no labelling" — this is the write
 * side that makes it derivable at all. Real and unit-tested, but see
 * docs/adr/0022: no mobile client calls it yet, the same pre-existing gap
 * docs/adr/0017 already disclosed for the live Converse hook generally.
 * Returns false for a nonexistent turn id, matching this codebase's
 * established "not found" convention.
 */
export async function markTurnRevealed(pool: Pool, turnId: string): Promise<boolean> {
  const result = await pool.query('UPDATE turns SET revealed = true WHERE id = $1', [turnId]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Ticket #29's false-interruption-rate signal: `turn-orchestrator.ts`
 * calls this (via the app-service HTTP boundary) when a barge-in lands
 * while the interrupted persona turn's audio was genuinely playing,
 * recording the elapsed ms from that turn's own `t5FirstAudio` to the
 * interruption. See docs/adr/0022 for why 500ms is the threshold this
 * value gets compared against downstream, in `observability/metrics.ts`,
 * not here.
 */
export async function recordInterruption(pool: Pool, turnId: string, interruptedAfterMs: number): Promise<boolean> {
  const result = await pool.query('UPDATE turns SET interrupted_after_ms = $2 WHERE id = $1', [turnId, interruptedAfterMs]);
  return (result.rowCount ?? 0) > 0;
}
