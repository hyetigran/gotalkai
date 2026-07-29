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
  /**
   * Ticket #31 AC #2: "Only 2–5% of sessions sampled for replay
   * debugging." 0.03 sits in the middle of that range. Meant to be
   * threaded into `shouldSampleSession`'s `sampleRate` param
   * (src/audio-sampling.ts) once real audio capture exists — no
   * audio-storage subsystem exists yet to call it from
   * (ARCHITECTURE.md hasn't designed one), so nothing reads this env
   * var today; it's the sampling *policy* value, reserved ahead of the
   * capture path per this ticket's scope.
   */
  AUDIO_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.03),
  /**
   * Ticket #31 AC #3: "Sampled audio retention is materially shorter
   * than metadata retention" (RETENTION_DAYS's 180-day default). 30 days
   * is materially shorter. Reserved policy value only, not enforced —
   * there is no audio-storage table yet for a retention job to run
   * against. See docs/adr/0009-privacy-and-data-handling-scope.md.
   */
  AUDIO_SAMPLE_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
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
