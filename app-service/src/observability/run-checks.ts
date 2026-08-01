import { Pool } from 'pg';

import { loadEnv } from '../config/env';
import { sendHealthAlert, sendQualityReport } from './alerting';
import { findCostAlerts, getLearnerCostRollup30Day } from './cost';
import { computeQualityMetricsReport } from './metrics';
import { checkP95Budget } from './p95';

/**
 * Ticket #29's periodic observability job — `pnpm observability:run-checks`,
 * meant to be scheduled (e.g. hourly, alongside the eval canary), matching
 * `run-eval.ts`'s own CLI-entrypoint shape. Runs three independent
 * checks; AC #1's "genuinely separate alerting paths" is visible directly
 * here — the P95 and cost checks only ever call `sendHealthAlert`, the
 * quality digest only ever calls `sendQualityReport`, and neither
 * function is shared between them.
 */
export async function runObservabilityChecks(pool: Pool, env: { P95_LATENCY_BUDGET_MS: number; SUBSCRIPTION_PRICE_USD: number; HEALTH_ALERT_WEBHOOK_URL?: string; QUALITY_REPORT_WEBHOOK_URL?: string }): Promise<void> {
  const p95Breach = await checkP95Budget(pool, env.P95_LATENCY_BUDGET_MS);
  if (p95Breach) {
    await sendHealthAlert(env.HEALTH_ALERT_WEBHOOK_URL, {
      source: 'p95_budget_breach',
      message: `P95 ${p95Breach.stage} latency ${p95Breach.p95Ms}ms exceeds ${p95Breach.budgetMs}ms budget`,
      detail: p95Breach,
    });
  }

  const costRollup = await getLearnerCostRollup30Day(pool);
  const costAlerts = findCostAlerts(costRollup, env.SUBSCRIPTION_PRICE_USD);
  for (const alert of costAlerts) {
    await sendHealthAlert(env.HEALTH_ALERT_WEBHOOK_URL, {
      source: 'cost_threshold_crossed',
      message: `Learner ${alert.learnerId} 30-day cost $${alert.totalCostUsd.toFixed(2)} exceeds $${alert.subscriptionPriceUsd} subscription price`,
      detail: alert,
    });
  }

  // Unconditional: a standing digest, not a threshold check — sent every run regardless of what the numbers say.
  const qualityReport = await computeQualityMetricsReport(pool);
  await sendQualityReport(env.QUALITY_REPORT_WEBHOOK_URL, {
    message: 'weekly quality digest',
    detail: qualityReport,
  });
}

if (require.main === module) {
  void (async () => {
    const env = loadEnv();
    const pool = new Pool({ connectionString: env.DATABASE_URL });
    try {
      await runObservabilityChecks(pool, env);
      console.log('observability checks complete');
    }
    finally {
      await pool.end();
    }
  })();
}
