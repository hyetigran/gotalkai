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
