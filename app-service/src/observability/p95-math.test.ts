import { computeP95ByStage, computeStageDurations, findP95BudgetBreach, percentile95 } from './p95-math';

describe('computeStageDurations', () => {
  it('derives each pipeline stage from the six timestamps, matching turn-orchestrator.ts\'s own stage boundaries', () => {
    const durations = computeStageDurations({
      t0TurnDetected: 0,
      t1SttFinal: 100,
      t2PersonaStart: 100,
      t3PersonaComplete: 400,
      t4StressAnnotated: 420,
      t5FirstAudio: 700,
    });
    expect(durations).toEqual({ stt: 100, personaLlm: 300, stressAnnotation: 20, ttsFirstAudio: 280, total: 700 });
  });
});

describe('percentile95', () => {
  it('picks the nearest-rank 95th percentile value', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile95(values)).toBe(95);
  });

  it('handles a small sample without blowing up', () => {
    expect(percentile95([10, 20, 30])).toBe(30);
  });

  it('throws on an empty array rather than fabricating a value', () => {
    expect(() => percentile95([])).toThrow();
  });
});

describe('computeP95ByStage', () => {
  it('computes P95 independently per stage, not just the total', () => {
    const durations = [
      { stt: 50, personaLlm: 300, stressAnnotation: 10, ttsFirstAudio: 200, total: 560 },
      { stt: 3000, personaLlm: 310, stressAnnotation: 12, ttsFirstAudio: 210, total: 3532 }, // one very slow STT stage
    ];
    const p95 = computeP95ByStage(durations);
    // A single slow stage shows up in that stage's own P95 even though it wouldn't move a mean much with more samples.
    expect(p95.stt).toBe(3000);
    expect(p95.personaLlm).toBe(310);
  });
});

describe('findP95BudgetBreach', () => {
  it('returns null when total P95 is within budget', () => {
    const p95 = { stt: 100, personaLlm: 300, stressAnnotation: 20, ttsFirstAudio: 280, total: 700 };
    expect(findP95BudgetBreach(p95, 900)).toBeNull();
  });

  it('reports a breach when total P95 exceeds budget — the case a single slow turn should surface without moving the mean', () => {
    const p95 = { stt: 100, personaLlm: 300, stressAnnotation: 20, ttsFirstAudio: 3000, total: 3420 };
    expect(findP95BudgetBreach(p95, 900)).toEqual({ stage: 'total', p95Ms: 3420, budgetMs: 900 });
  });
});
