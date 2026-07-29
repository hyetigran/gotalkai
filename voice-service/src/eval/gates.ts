import type { AssertionResult } from './mechanical-assertions';
import type { GoldenEntry } from './golden-set-types';
import type { JudgeScore } from './judge';

export type EvalEntryResult = {
  entry: GoldenEntry;
  mechanicalResults: AssertionResult[];
  /** Null when the judge call itself failed — see run-eval.ts's handling; a missing score fails its gates rather than being silently excluded. */
  judgeScore: JudgeScore | null;
};

export type GateKey = 'zero_mechanical_errors' | 'zero_false_recasts' | 'grammaticality' | 'recast_quality' | 'register_character' | 'drift_cases_pass';

export type GateResult = {
  key: GateKey;
  passed: boolean;
  detail: string;
};

function mean(values: number[]): number {
  if (values.length === 0)
    return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Shared shape behind `grammaticality`'s floor-and-mean check and `recast_quality`/`register_character`'s plain mean check — a missing score always fails, matching `missingScoreCount`'s own "fail loudly, don't silently exclude" reasoning above. */
function meetsMeanFloor(scores: number[], threshold: number, missingScoreCount: number): boolean {
  return missingScoreCount === 0 && mean(scores) >= threshold;
}

/**
 * Ticket #28 AC #5, PRD §10's exact gate list: "0% mechanical errors ·
 * 0% false recasts · grammaticality mean ≥ 4.3 with no case below 3 ·
 * recast quality ≥ 4.0 · register/character ≥ 4.0 · drift cases pass
 * 100%." Each gate below maps to one clause, in that order.
 *
 * `recastQuality`'s mean is computed only over entries where
 * `shouldRecast` is true — PRD doesn't specify this scoping explicitly,
 * but a "recast quality" score on an entry with nothing to recast isn't
 * measuring the same thing (whether execution of a real correction was
 * good), so including it would dilute the gate with numbers that aren't
 * answering the gate's own question. Documented judgment call — see
 * docs/adr/0012.
 */
export function computeGates(results: EvalEntryResult[]): GateResult[] {
  const allMechanical = results.flatMap(result => result.mechanicalResults);
  const mechanicalFailures = allMechanical.filter(result => !result.passed);

  const falseRecastFailures = results
    .flatMap(result => result.mechanicalResults.filter(assertion => assertion.key === 'no_false_recast'))
    .filter(assertion => !assertion.passed);

  const scoredResults = results.filter((result): result is EvalEntryResult & { judgeScore: JudgeScore } => result.judgeScore !== null);
  const grammaticalityScores = scoredResults.map(result => result.judgeScore.grammaticality);
  const recastQualityScores = scoredResults.filter(result => result.entry.shouldRecast).map(result => result.judgeScore.recastQuality);
  const registerCharacterScores = scoredResults.map(result => result.judgeScore.registerCharacter);
  // Missing scores (judge call failed) can't be silently excluded from a
  // "no case below 3"-style floor check — score 0 fails the floor loudly
  // rather than the entry just vanishing from the aggregate.
  const missingScoreCount = results.length - scoredResults.length;

  const driftResults = results.filter(result => result.entry.isDriftCase);
  const driftFailures = driftResults.filter(result => result.mechanicalResults.some(assertion => !assertion.passed));

  return [
    {
      key: 'zero_mechanical_errors',
      passed: mechanicalFailures.length === 0,
      detail: `${mechanicalFailures.length} mechanical assertion failure(s) across ${results.length} entries`,
    },
    {
      key: 'zero_false_recasts',
      passed: falseRecastFailures.length === 0,
      detail: `${falseRecastFailures.length} no_false_recast failure(s)`,
    },
    {
      key: 'grammaticality',
      passed: missingScoreCount === 0 && mean(grammaticalityScores) >= 4.3 && grammaticalityScores.every(score => score >= 3),
      detail: `mean ${mean(grammaticalityScores).toFixed(2)} (need ≥4.3, no case <3), ${missingScoreCount} entrie(s) missing a judge score`,
    },
    {
      key: 'recast_quality',
      passed: meetsMeanFloor(recastQualityScores, 4.0, missingScoreCount),
      detail: `mean ${mean(recastQualityScores).toFixed(2)} over ${recastQualityScores.length} shouldRecast entries (need ≥4.0)`,
    },
    {
      key: 'register_character',
      passed: meetsMeanFloor(registerCharacterScores, 4.0, missingScoreCount),
      detail: `mean ${mean(registerCharacterScores).toFixed(2)} (need ≥4.0)`,
    },
    {
      key: 'drift_cases_pass',
      passed: driftResults.length > 0 && driftFailures.length === 0,
      detail: `${driftResults.length - driftFailures.length}/${driftResults.length} drift-case entries pass all mechanical assertions`,
    },
  ];
}

export function allGatesPassed(gates: GateResult[]): boolean {
  return gates.every(gate => gate.passed);
}
