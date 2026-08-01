import { z } from 'zod';

/**
 * Env validation at boot (PRD §7.8 — one of exactly three places Zod
 * belongs: "environment config at boot"). Audited for completeness in
 * ticket #26 ("runtime validation hardening... superseding the minimal
 * check from ticket #11"): every env var this service actually reads
 * (grepped for `process.env` usage) is covered here — `PORT`,
 * `NODE_ENV`, `SESSION_TOKEN_SECRET` — so there's nothing left
 * un-validated to add. Grows only if a real new config need shows up in
 * pipeline work (persona LLM keys, etc.), not preemptively.
 */
const envSchema = z.object({
  /** Railway injects this for the container; falls back to a sane local default. */
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /**
   * Closes docs/adr/0017's disclosed gap: this used to be a static
   * shared-secret bearer token every client presented (the placeholder
   * "prove the auth *path* works end to end" ticket #11 built). Now it's
   * the secret this service uses to *verify* short-lived, session-scoped
   * tokens app-service mints in `POST /sessions` (session-token.ts) —
   * ARCHITECTURE.md §6's "App service authenticates learner ... returns
   * session handle + voice endpoint credentials", finally real. Must be
   * the exact same value as app-service's own `SESSION_TOKEN_SECRET`
   * (app-service/src/env.ts) — never sent to or read by the mobile
   * client.
   */
  SESSION_TOKEN_SECRET: z.string().min(32, 'SESSION_TOKEN_SECRET must be at least 32 characters'),
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
  /**
   * Ticket #34 / docs/adr/0023: Елена's own ElevenLabs voice id.
   * Deliberately **optional**, unlike Валентина's own required one — no
   * real ElevenLabs account exists in this environment to audition a
   * voice for her either (same disclosed gap as docs/adr/0016), and she
   * hasn't launched yet (Address book: "unlocks at B1"). If a
   * `session_start` names her and this isn't configured, server.ts sends
   * an error and leaves the connection on its current persona rather
   * than crashing.
   */
  ELEVENLABS_ELENA_VOICE_ID: z.string().min(1).optional(),
  /**
   * Ticket #29 / docs/adr/0022: where `app-service-client.ts` posts turn
   * artefacts (ARCHITECTURE.md §3's "posts turn artefacts / timings back
   * through app service after turns"). Defaults to app-service's own
   * local dev port (its env.ts's own `PORT` default) — not a secret,
   * just a same-machine service address in local/dev; a real deployment
   * sets this to app-service's real internal URL.
   */
  APP_SERVICE_URL: z.string().url().default('http://localhost:8081'),
  /**
   * Ticket #29 AC #1: the hourly production canary (eval/run-canary.ts)
   * pages here on a real golden-set failure — see docs/adr/0022 for why
   * this is a generic webhook, not a real paging-vendor integration
   * (none exists in this environment). Optional: unset means the canary
   * still runs and logs, it just doesn't attempt delivery anywhere.
   */
  HEALTH_ALERT_WEBHOOK_URL: z.string().url().optional(),
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
