import type { AssertionResult } from './mechanical-assertions';
import type { GoldenEntry } from './golden-set-types';
import type { EvalEntryResult } from './gates';
import { allGatesPassed, computeGates } from './gates';

function passingMechanicalResults(): AssertionResult[] {
  return [
    { key: 'schema_validity', passed: true },
    { key: 'turn_length', passed: true },
    { key: 'register_consistency', passed: true },
    { key: 'yo_spelling', passed: true },
    { key: 'no_false_recast', passed: true },
    { key: 'no_missed_recast', passed: true },
    { key: 'no_english_leakage', passed: true },
    { key: 'no_praise', passed: true },
    { key: 'no_grammar_talk', passed: true },
  ];
}

function makeEntry(overrides: Partial<GoldenEntry> = {}): GoldenEntry {
  return { id: 'e', description: '', history: [], learnerTurn: '', shouldRecast: false, ...overrides };
}

function makeResult(overrides: Partial<EvalEntryResult> = {}): EvalEntryResult {
  return {
    entry: makeEntry(),
    mechanicalResults: passingMechanicalResults(),
    judgeScore: { grammaticality: 5, recastQuality: 5, registerCharacter: 5 },
    ...overrides,
  };
}

describe('computeGates', () => {
  it('all six gates pass for a perfect report', () => {
    const results = [
      makeResult({ entry: makeEntry({ shouldRecast: true }) }),
      makeResult({ entry: makeEntry({ isDriftCase: true }) }),
    ];
    const gates = computeGates(results);
    expect(gates).toHaveLength(6);
    expect(allGatesPassed(gates)).toBe(true);
  });

  it('zero_mechanical_errors fails on a single mechanical failure anywhere', () => {
    const results = [
      makeResult({ mechanicalResults: [...passingMechanicalResults().slice(0, -1), { key: 'no_grammar_talk', passed: false, reason: 'x' }] }),
    ];
    const gates = computeGates(results);
    expect(gates.find(g => g.key === 'zero_mechanical_errors')?.passed).toBe(false);
  });

  it('zero_false_recasts fails specifically on a no_false_recast failure, independent of other mechanical checks', () => {
    const results = [
      makeResult({ mechanicalResults: passingMechanicalResults().map(r => (r.key === 'no_false_recast' ? { ...r, passed: false } : r)) }),
    ];
    const gates = computeGates(results);
    expect(gates.find(g => g.key === 'zero_false_recasts')?.passed).toBe(false);
    // Distinct from the aggregate gate, which also fails here, but for a documented reason:
    expect(gates.find(g => g.key === 'zero_mechanical_errors')?.passed).toBe(false);
  });

  it('grammaticality gate fails below the 4.3 mean threshold', () => {
    const results = [
      makeResult({ judgeScore: { grammaticality: 4, recastQuality: 5, registerCharacter: 5 } }),
      makeResult({ judgeScore: { grammaticality: 4, recastQuality: 5, registerCharacter: 5 } }),
    ];
    const gates = computeGates(results);
    expect(gates.find(g => g.key === 'grammaticality')?.passed).toBe(false);
  });

  it('grammaticality gate fails if any single case scores below 3, even with a high mean overall', () => {
    const results = [
      makeResult({ judgeScore: { grammaticality: 5, recastQuality: 5, registerCharacter: 5 } }),
      makeResult({ judgeScore: { grammaticality: 5, recastQuality: 5, registerCharacter: 5 } }),
      makeResult({ judgeScore: { grammaticality: 5, recastQuality: 5, registerCharacter: 5 } }),
      makeResult({ judgeScore: { grammaticality: 2, recastQuality: 5, registerCharacter: 5 } }), // mean is 4.25, still fails the floor
    ];
    const gates = computeGates(results);
    expect(gates.find(g => g.key === 'grammaticality')?.passed).toBe(false);
  });

  it('recast_quality gate is computed only over shouldRecast entries — a low score on a non-recast entry does not count against it', () => {
    const results = [
      makeResult({ entry: makeEntry({ shouldRecast: true }), judgeScore: { grammaticality: 5, recastQuality: 5, registerCharacter: 5 } }),
      makeResult({ entry: makeEntry({ shouldRecast: false }), judgeScore: { grammaticality: 5, recastQuality: 1, registerCharacter: 5 } }),
    ];
    const gates = computeGates(results);
    expect(gates.find(g => g.key === 'recast_quality')?.passed).toBe(true);
  });

  it('a missing judge score (null) fails the score-based gates rather than being silently excluded', () => {
    const results = [makeResult({ judgeScore: null })];
    const gates = computeGates(results);
    expect(gates.find(g => g.key === 'grammaticality')?.passed).toBe(false);
    expect(gates.find(g => g.key === 'register_character')?.passed).toBe(false);
  });

  it('drift_cases_pass fails if any drift-case entry has a mechanical failure', () => {
    const results = [
      makeResult({
        entry: makeEntry({ isDriftCase: true }),
        mechanicalResults: passingMechanicalResults().map(r => (r.key === 'register_consistency' ? { ...r, passed: false } : r)),
      }),
    ];
    const gates = computeGates(results);
    expect(gates.find(g => g.key === 'drift_cases_pass')?.passed).toBe(false);
  });

  it('drift_cases_pass fails (not vacuously passes) when there are no drift-case entries at all — a report missing drift coverage shouldn\'t look clean', () => {
    const results = [makeResult({ entry: makeEntry({ isDriftCase: false }) })];
    const gates = computeGates(results);
    expect(gates.find(g => g.key === 'drift_cases_pass')?.passed).toBe(false);
  });
});

describe('allGatesPassed', () => {
  it('is false if any single gate fails', () => {
    expect(allGatesPassed([{ key: 'zero_mechanical_errors', passed: true, detail: '' }, { key: 'zero_false_recasts', passed: false, detail: '' }])).toBe(false);
  });

  it('is true only when every gate passes', () => {
    expect(allGatesPassed([{ key: 'zero_mechanical_errors', passed: true, detail: '' }, { key: 'zero_false_recasts', passed: true, detail: '' }])).toBe(true);
  });
});
