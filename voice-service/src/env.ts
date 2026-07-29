import { z } from 'zod';

/**
 * Env validation at boot (PRD §7.8 — one of exactly three places Zod
 * belongs: "environment config at boot"). Audited for completeness in
 * ticket #26 ("runtime validation hardening... superseding the minimal
 * check from ticket #11"): every env var this service actually reads
 * (grepped for `process.env` usage) is covered here — `PORT`,
 * `NODE_ENV`, `VOICE_SERVICE_AUTH_TOKEN` — so there's nothing left
 * un-validated to add. Grows only if a real new config need shows up in
 * pipeline work (persona LLM keys, etc.), not preemptively.
 */
const envSchema = z.object({
  /** Railway injects this for the container; falls back to a sane local default. */
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /**
   * Shared-secret bearer token clients must present to open a connection.
   * A placeholder for real per-session credentials the app service will
   * issue once it exists (ARCHITECTURE.md §6: "App service authenticates
   * learner ... returns session handle + voice endpoint credentials") —
   * this ticket only has to prove the auth *path* works end to end.
   */
  VOICE_SERVICE_AUTH_TOKEN: z.string().min(16, 'VOICE_SERVICE_AUTH_TOKEN must be at least 16 characters'),
  /**
   * Ticket #14: the persona LLM stage (ADR-0003: Claude Sonnet 5) needs a
   * real key to call the Anthropic API. No default — this is a secret, not
   * a tunable, and an empty/missing key should fail loudly at boot rather
   * than produce confusing 401s from every persona-turn call later.
   */
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  /**
   * Ticket #15/#17: ElevenLabs for both STT and TTS (docs/adr/0013 —
   * deadline-driven, bake-off skipped). No default — a real secret.
   */
  ELEVENLABS_API_KEY: z.string().min(1, 'ELEVENLABS_API_KEY is required'),
  /**
   * Ticket #17: the ElevenLabs voice ID for Валентина. No default and no
   * placeholder value — picking a real voice from ElevenLabs' library
   * (matching PRD §6.4's "78, warm, unhurried") needs someone to actually
   * listen to candidates, which this environment cannot do (docs/adr/0016).
   * Required so a real deployment fails loudly at boot if nobody has set
   * it yet, rather than synthesizing with an arbitrary default voice.
   */
  ELEVENLABS_VALENTINA_VOICE_ID: z.string().min(1, 'ELEVENLABS_VALENTINA_VOICE_ID is required'),
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
