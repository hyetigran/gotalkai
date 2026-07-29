import type { Pool } from 'pg';
import type { AbandonmentByLevel, FalseInterruptionRateByLevel } from './metrics-math';
import {
  computeAbandonmentByLevel,
  computeFalseInterruptionRate,
  computeRepeatRequestRate,
  computeRevealRate,
} from './metrics-math';

/**
 * Ticket #29 (PRD §11): DB-fetch orchestration for the four derived
 * quality metrics — each query fetches raw rows, then hands them to the
 * pure aggregation in metrics-math.ts. All four read only columns
 * `POST /sessions/:id/turns` (turns.ts) already writes; no manual
 * labelling step exists anywhere in this path.
 */

export async function falseInterruptionRate(pool: Pool): Promise<FalseInterruptionRateByLevel[]> {
  const result = await pool.query<{ level: string | null; interrupted_after_ms: number }>(
    `SELECT s.calibration->>'complicationLevel' AS level, t.interrupted_after_ms
     FROM turns t
     JOIN sessions s ON s.id = t.session_id
     WHERE t.interrupted_after_ms IS NOT NULL`,
  );
  return computeFalseInterruptionRate(result.rows.map(row => ({ level: row.level, interruptedAfterMs: row.interrupted_after_ms })));
}

export async function revealRate(pool: Pool): Promise<number> {
  const result = await pool.query<{ revealed: boolean }>('SELECT revealed FROM turns WHERE speaker = \'persona\'');
  return computeRevealRate(result.rows);
}

export async function abandonmentByLevel(pool: Pool): Promise<AbandonmentByLevel[]> {
  const result = await pool.query<{ session_id: string; level: string | null; turn_count: number }>(
    `SELECT s.id AS session_id, s.calibration->>'complicationLevel' AS level, COUNT(t.id)::int AS turn_count
     FROM sessions s
     LEFT JOIN turns t ON t.session_id = s.id
     GROUP BY s.id, level`,
  );
  return computeAbandonmentByLevel(result.rows.map(row => ({ sessionId: row.session_id, level: row.level, turnCount: row.turn_count })));
}

export async function repeatRequestRate(pool: Pool): Promise<number> {
  const result = await pool.query<{ content: string }>('SELECT content FROM turns WHERE speaker = \'learner\'');
  return computeRepeatRequestRate(result.rows);
}

export type QualityMetricsReport = {
  falseInterruptionRate: FalseInterruptionRateByLevel[];
  revealRate: number;
  abandonmentByLevel: AbandonmentByLevel[];
  repeatRequestRate: number;
};

/** All four metrics in one call — what the weekly quality digest (run-checks.ts) actually sends. */
export async function computeQualityMetricsReport(pool: Pool): Promise<QualityMetricsReport> {
  const [falseInterruption, reveal, abandonment, repeatRequest] = await Promise.all([
    falseInterruptionRate(pool),
    revealRate(pool),
    abandonmentByLevel(pool),
    repeatRequestRate(pool),
  ]);
  return {
    falseInterruptionRate: falseInterruption,
    revealRate: reveal,
    abandonmentByLevel: abandonment,
    repeatRequestRate: repeatRequest,
  };
}
