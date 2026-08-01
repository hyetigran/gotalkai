import type Anthropic from '@anthropic-ai/sdk';
import { sendHealthAlert } from '../observability/alerting';
import { loadEnv } from '../config/env';
import { generatePersonaTurn } from '../pipeline/persona-turn';
import { PERSONA_DEFINITIONS } from '../pipeline/personas';
import { getCanarySet } from './canary';
import { computeGates } from './gates';
import { judgeTurn } from './judge';
import { runMechanicalAssertions } from './mechanical-assertions';
import type { EvalReport } from './run-eval';

/**
 * Ticket #29 AC #2 (PRD §11): "Point the eval harness at production.
 * Five golden cases against the live endpoint hourly ... canary
 * assertion failures do page, because they are deterministic." See
 * docs/adr/0022's "hourly canary" section for why "the live endpoint"
 * here means the real Anthropic API `generatePersonaTurn` already calls
 * in-process — the same call production traffic makes, since no separate
 * staging model deployment exists to distinguish "production" from.
 *
 * Deliberately a near-duplicate of run-eval.ts's own loop rather than a
 * shared helper parameterized by golden-set choice: run-eval.ts's
 * `runEval` is the full local/CI harness (all 20+ entries, no alerting),
 * and this is a narrower, cost-capped, paging-on-failure production
 * canary — conflating the two into one parameterized function would make
 * either caller harder to read for what it actually does. Both call the
 * same underlying `generatePersonaTurn`/`runMechanicalAssertions`/
 * `judgeTurn`/`computeGates`, so there's no duplicated *logic*, just a
 * duplicated loop shape.
 */
export async function runCanary(client: Anthropic): Promise<EvalReport> {
  const results: EvalReport['results'] = [];
  for (const entry of getCanarySet()) {
    const transcript = [...entry.history, { speaker: 'learner' as const, text: entry.learnerTurn }];
    // Ticket #34: the canary set is drawn from golden-set.ts, authored specifically against Валентина — same reasoning as run-eval.ts.
    const { turn, fellBackToFiller } = await generatePersonaTurn(client, transcript, PERSONA_DEFINITIONS.valentina, {});
    const mechanicalResults = runMechanicalAssertions({ entry, turn, fellBackToFiller });

    let judgeScore = null;
    try {
      judgeScore = await judgeTurn(client, entry, turn);
    }
    catch (error) {
      console.error(`[canary] judge failed for ${entry.id}`, error);
    }

    results.push({ entry, mechanicalResults, judgeScore });
  }

  const gates = computeGates(results);
  const passed = gates.every(gate => gate.passed);
  return { results, gates, passed };
}

// `pnpm eval:canary` — see .gitlab-ci.yml's `eval:canary` job, triggered
// by a GitLab CI Pipeline Schedule (hourly), not `.gitlab-ci.yml` alone
// (schedules are project-settings config, not expressible in the YAML
// file itself). Exits non-zero on gate failure, matching run-eval.ts's
// own CI-failure convention, in addition to paging.
if (require.main === module) {
  void (async () => {
    const env = loadEnv();
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const report = await runCanary(client);

    console.log(`--- canary report: ${report.results.length} entries ---`);
    for (const gate of report.gates)
      console.log(`  [${gate.passed ? 'PASS' : 'FAIL'}] ${gate.key}: ${gate.detail}`);

    if (!report.passed) {
      const failedGates = report.gates.filter(gate => !gate.passed);
      await sendHealthAlert(env.HEALTH_ALERT_WEBHOOK_URL, {
        source: 'canary_failure',
        message: `Production canary failed ${failedGates.length} gate(s): ${failedGates.map(gate => gate.key).join(', ')}`,
        detail: { gates: report.gates },
      });
      process.exitCode = 1;
    }
  })();
}
