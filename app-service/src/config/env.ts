import { z } from 'zod';

/**
 * Minimal env validation at boot (PRD §7.8 — one of exactly three places
 * Zod belongs: "environment config at boot"). This is deliberately small;
 * the fuller runtime-validation hardening (persona LLM output doesn't
 * apply here, but the full client/server API schemas do) is later work,
 * not this skeleton.
 */
const envSchema = z.object({
  /**
   * Railway injects this for the container; falls back to a local default.
   * Not 8081 — that's Expo/Metro's own default dev-server port, and the two
   * running side by side (this service + the mobile app) on the same
   * machine is the common case, not an edge case.
   */
  PORT: z.coerce.number().int().positive().default(8082),
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
  /**
   * Ticket #29 / docs/adr/0022: PRD §11's "alert when a user crosses
   * their subscription price," rolled up per learner over a trailing 30
   * days (observability/cost.ts). $12 matches PRD §9's own subscription
   * figure (the number the daily-session-cap math above is already
   * built around) — not a separately sourced billing-system value, since
   * no billing system exists yet.
   */
  SUBSCRIPTION_PRICE_USD: z.coerce.number().positive().default(12),
  /**
   * PRD §11: "Alert on P95, never mean." No PRD-specified numeric
   * budget exists for the full turn-completion latency; 900ms matches
   * PRD §7.3's own "700-900ms target" upper bound, cited already in
   * ADR-0017's disclosure of what's unverified. Applied per pipeline
   * stage (observability/p95.ts), not just the end-to-end total, so a
   * single slow stage is visible even when the total still clears budget.
   */
  P95_LATENCY_BUDGET_MS: z.coerce.number().int().positive().default(900),
  /**
   * Ticket #29 AC #1: health alerts "page." No real paging vendor
   * (PagerDuty/Opsgenie) account exists in this environment — this is
   * the generic webhook seam any of those products expose on their
   * receiving end (docs/adr/0022). Optional: unset means alerts are
   * logged, not delivered, so tests and local dev don't need one
   * configured.
   */
  HEALTH_ALERT_WEBHOOK_URL: z.string().url().optional(),
  /**
   * Ticket #29 AC #1: the quality path, structurally separate from
   * HEALTH_ALERT_WEBHOOK_URL above — this is what makes "different
   * alerting paths, not one dashboard with two tabs" real rather than
   * cosmetic. Never paged into; see observability/alerting.ts.
   */
  QUALITY_REPORT_WEBHOOK_URL: z.string().url().optional(),
  /**
   * Closes the gap docs/adr/0017 disclosed ("Real per-session credential
   * issuance from app-service ... doesn't exist"): the secret this
   * service uses to sign short-lived, session-scoped voice-service
   * tokens (session-token.ts), minted in `POST /sessions`'s response and
   * validated by voice-service against the *same* secret
   * (voice-service/src/env.ts's own `SESSION_TOKEN_SECRET` — must match
   * across both services' deployment config, the same operational
   * requirement `VOICE_SERVICE_AUTH_TOKEN` used to have before this
   * replaced it). Never sent to or read by the mobile client. No
   * default, and a 32-char minimum (matching the entropy the old shared
   * secret required) — a weak or missing signing secret should fail loud
   * at boot, not produce forgeable tokens silently.
   */
  SESSION_TOKEN_SECRET: z.string().min(32, 'SESSION_TOKEN_SECRET must be at least 32 characters'),
  /**
   * The post-session analyser's own key (debrief/analyser.ts) — a
   * separate Anthropic account/key from voice-service's own
   * `ANTHROPIC_API_KEY` (voice-service/src/config/env.ts), same
   * per-service-boundary reasoning `main.ts`'s own comment gives for why
   * neither service imports the other. No default, same "a missing
   * secret fails loud at boot, not with confusing 401s later" reasoning
   * voice-service's own copy of this var documents.
   */
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
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
