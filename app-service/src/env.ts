import { z } from 'zod';

/**
 * Minimal env validation at boot (PRD §7.8 — one of exactly three places
 * Zod belongs: "environment config at boot"). This is deliberately small;
 * the fuller runtime-validation hardening (persona LLM output doesn't
 * apply here, but the full client/server API schemas do) is later work,
 * not this skeleton.
 */
const envSchema = z.object({
  /** Railway injects this for the container; falls back to a sane local default. */
  PORT: z.coerce.number().int().positive().default(8081),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /** Standard `postgres://` connection string — Railway's own Postgres addon env var name. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /**
   * Retention window for `sessions`/`turns` (PRD §7.7). 180 days is a
   * provisional default, not a product decision recorded anywhere —
   * deliberately an env var rather than a hardcoded constant so it can be
   * adjusted without a code change once there's a real policy to encode.
   */
  RETENTION_DAYS: z.coerce.number().int().positive().default(180),
  /**
   * Max real sessions a learner can start per calendar day (PRD §9:
   * "Requirement: a daily session cap. A power user at two sessions a
   * day on the premium stack costs $13.67/month against a $12
   * subscription."). Default 1 — the PRD's own numbers put the
   * breakeven between one and two sessions/day on the premium stack, so
   * one session/day is what actually bounds COGS under the $12
   * subscription; two is the explicitly-cited failure case. Configurable
   * (not hardcoded) so it stays in sync with `voice_cost_model.xlsx` as
   * vendor costs change, per this ticket's AC.
   */
  DAILY_SESSION_CAP: z.coerce.number().int().positive().default(1),
});

export type Env = z.infer<typeof envSchema>;

/** Throws with a readable message (not a raw ZodError dump) if config is invalid — this is meant to crash boot, loudly. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map(issue => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
