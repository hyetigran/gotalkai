/**
 * Ticket #29 AC #1 (PRD §11): two independent dispatch functions with no
 * shared call path — the actual mechanism behind "genuinely separate ...
 * not one dashboard with two tabs." Nothing in this codebase calls both
 * from the same trigger; see docs/adr/0022 for which of this ticket's
 * checks (canary, P95, cost) wire to which.
 *
 * Both take an injectable `fetchImpl` (defaulting to the global `fetch`)
 * purely for testability — same DI seam every vendor-call module in this
 * codebase already uses (persona-turn.ts's `client`, tts.ts's `client`).
 * No real paging/webhook vendor account exists in this environment
 * (docs/adr/0022) — an unset URL logs and no-ops rather than throwing,
 * so a missing integration doesn't take down the caller.
 */

export type FetchImpl = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<unknown>;

export type HealthAlert = {
  /** What triggered this — e.g. 'canary_failure', 'p95_budget_breach', 'cost_threshold_crossed'. Not a closed enum: new health triggers shouldn't need a schema change here to report themselves. */
  source: string;
  message: string;
  detail?: Record<string, unknown>;
};

/** Pages. Used only by the hourly canary, the P95 budget check, and the cost-threshold check — deterministic, threshold-crossing facts, never sampled quality. */
export async function sendHealthAlert(webhookUrl: string | undefined, alert: HealthAlert, fetchImpl: FetchImpl = fetch): Promise<void> {
  console.error('[health-alert]', alert);
  if (!webhookUrl)
    return;
  await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ severity: 'page', ...alert }),
  });
}

export type QualityReport = {
  message: string;
  detail: Record<string, unknown>;
};

/** Never pages. Used only by the weekly derived-metrics digest, unconditionally — a standing report, not a threshold alert. */
export async function sendQualityReport(webhookUrl: string | undefined, report: QualityReport, fetchImpl: FetchImpl = fetch): Promise<void> {
  console.log('[quality-report]', report);
  if (!webhookUrl)
    return;
  await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ severity: 'digest', ...report }),
  });
}
