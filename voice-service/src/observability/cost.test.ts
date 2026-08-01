import { estimateLlmCostUsd, estimateSttCostUsd, estimateTtsCostUsd } from './cost';

describe('estimateLlmCostUsd', () => {
  it('prices input/output/cache-write/cache-read tokens independently', () => {
    const cost = estimateLlmCostUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000, cacheCreationInputTokens: 1_000_000, cacheReadInputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(3 + 15 + 3.75 + 0.3);
  });

  it('a cache read is far cheaper than a fresh input token — caching economics (ADR-0003) actually show up in the number', () => {
    const freshInput = estimateLlmCostUsd({ inputTokens: 1000, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 });
    const cachedInput = estimateLlmCostUsd({ inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 1000 });
    expect(cachedInput).toBeLessThan(freshInput);
  });

  it('zero usage costs zero', () => {
    expect(estimateLlmCostUsd({ inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 })).toBe(0);
  });
});

describe('estimateTtsCostUsd', () => {
  it('scales linearly with character count', () => {
    expect(estimateTtsCostUsd(1000)).toBeCloseTo(0.3);
    expect(estimateTtsCostUsd(2000)).toBeCloseTo(0.6);
  });

  it('zero characters costs zero — the "didn\'t catch that" / no-TTS paths', () => {
    expect(estimateTtsCostUsd(0)).toBe(0);
  });
});

describe('estimateSttCostUsd', () => {
  it('scales linearly with audio seconds actually sent to the vendor', () => {
    const oneSecond = estimateSttCostUsd(1);
    expect(estimateSttCostUsd(10)).toBeCloseTo(oneSecond * 10);
  });

  it('zero seconds costs zero — the text-input path (ticket #32), which never touches STT', () => {
    expect(estimateSttCostUsd(0)).toBe(0);
  });
});
