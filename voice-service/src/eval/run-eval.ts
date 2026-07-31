import type Anthropic from '@anthropic-ai/sdk';
import { generatePersonaTurn } from '../persona-turn';
import type { EvalEntryResult, GateResult } from './gates';
import { allGatesPassed, computeGates } from './gates';
import { GOLDEN_SET } from './golden-set';
import { judgeTurn } from './judge';
import { runMechanicalAssertions } from './mechanical-assertions';

export type EvalReport = {
  results: EvalEntryResult[];
  gates: GateResult[];
  passed: boolean;
};

/**
 * Ticket #28 AC #6: "Harness imports the same Zod schema from ticket #14
 * rather than a separately maintained shape" — `generatePersonaTurn`
 * (persona-turn.ts) is called directly, not reimplemented; its
 * `personaTurnSchema` is the one and only structured-output contract
 * both production and this harness validate against.
 *
 * Runs every golden entry through the real pipeline: `generatePersonaTurn`
 * (real model call), mechanical assertions (no model call), then the
 * judge (a second, different real model call). A judge failure for one
 * entry doesn't abort the run — it's recorded as `judgeScore: null`,
 * which `computeGates` treats as a failing score, not a silently skipped
 * entry (PRD's gates are meant to fail loudly, not partially).
 */
export async function runEval(client: Anthropic): Promise<EvalReport> {
  const results: EvalEntryResult[] = [];
  for (const entry of GOLDEN_SET) {
    const transcript = [...entry.history, { speaker: 'learner' as const, text: entry.learnerTurn }];
    const { turn, fellBackToFiller } = await generatePersonaTurn(client, transcript, {});
    const mechanicalResults = runMechanicalAssertions({ entry, turn, fellBackToFiller });

    let judgeScore = null;
    try {
      judgeScore = await judgeTurn(client, entry, turn);
    }
    catch (error) {
      console.error(`[eval] judge failed for ${entry.id}`, error);
    }

    results.push({ entry, mechanicalResults, judgeScore });
  }

  const gates = computeGates(results);
  return { results, gates, passed: allGatesPassed(gates) };
}

function printReport(report: EvalReport): void {
  console.log(`--- eval report: ${report.results.length} entries ---`);
  for (const result of report.results) {
    const failures = result.mechanicalResults.filter(assertion => !assertion.passed);
    if (failures.length > 0)
      console.log(`  ${result.entry.id}: ${failures.map(f => `${f.key} (${f.reason})`).join(', ')}`);
  }
  console.log('--- gates ---');
  for (const gate of report.gates)
    console.log(`  [${gate.passed ? 'PASS' : 'FAIL'}] ${gate.key}: ${gate.detail}`);
  console.log(report.passed ? 'ALL GATES PASSED' : 'GATES FAILED');
}

// `pnpm eval` — see .gitlab-ci.yml's `eval:harness` job (AC #7: "runnable
// in CI, not just locally"). Exits non-zero on gate failure so CI fails
// the pipeline, not just prints a report someone has to notice.
if (require.main === module) {
  void (async () => {
    // Reads ANTHROPIC_API_KEY directly rather than going through
    // env.ts's `loadEnv` — that schema also requires
    // SESSION_TOKEN_SECRET, which the eval harness has no use for
    // and shouldn't need configured just to run.
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY is required to run the eval harness.');
      process.exitCode = 1;
      return;
    }
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey });
    const report = await runEval(client);
    printReport(report);
    if (!report.passed)
      process.exitCode = 1;
  })();
}
