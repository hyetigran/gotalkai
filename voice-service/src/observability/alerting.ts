/**
 * Ticket #29 AC #1 (PRD §11): the health-alert half of "genuinely
 * separate alerting paths" on the voice-service side — used only by the
 * hourly production canary (eval/run-canary.ts) when a golden-set gate
 * fails. There is no quality-report counterpart here: voice-service has
 * no derived-metrics data to report (that lives in app-service, which
 * owns `turns`) — see `app-service/src/observability/alerting.ts` for
 * the full health/quality split. Deliberately duplicated rather than
 * imported: no pnpm workspace links the two services (docs/adr/0012's
 * same constraint), and this function is ~10 lines either way.
 *
 * No real paging vendor account exists in this environment (docs/adr/0022)
 * — an unset webhook URL logs and no-ops rather than throwing.
 */

export type FetchImpl = typeof fetch;

export type HealthAlert = {
  source: string;
  message: string;
  detail?: Record<string, unknown>;
};

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
