import type { PersonaTurn } from '../persona';
import { fakeAnthropicClient, fakeMessageStream } from '../test-support/fake-anthropic';
import { getCanarySet } from './canary';
import { runCanary } from './run-canary';

/** Same fake-client shape as run-eval.test.ts's own, scoped to the canary set instead of the full golden set. */
function fakeClient(options: {
  turnFor: (learnerText: string) => PersonaTurn;
  judgeScoreFor?: (learnerText: string) => { grammaticality: number; recastQuality: number; registerCharacter: number } | 'throw';
}) {
  return fakeAnthropicClient({
    stream: (params: { messages: { role: string; content: unknown }[] }) => {
      const lastUserMessage = [...params.messages].reverse().find(message => message.role === 'user');
      const learnerText = String(lastUserMessage?.content ?? '');
      const turn = options.turnFor(learnerText);
      return fakeMessageStream([JSON.stringify(turn)], { parsedOutput: turn });
    },
    parse: async (params: { messages: { content: unknown }[] }) => {
      const content = String(params.messages[0]?.content ?? '');
      const learnerText = getCanarySet().find(entry => content.includes(entry.learnerTurn))?.learnerTurn ?? '';
      const result = options.judgeScoreFor?.(learnerText) ?? { grammaticality: 5, recastQuality: 5, registerCharacter: 5 };
      if (result === 'throw')
        throw new Error('judge unavailable');
      return { parsed_output: result };
    },
  });
}

const PERFECT_TURN: PersonaTurn = { comprehension: 'understood', affect: 'warm', text: 'Ах, как приятно — заходи скорее.', translation: 'Ah, how nice — come in quickly.' };

describe('runCanary', () => {
  it('runs exactly the five-entry canary set, not the full golden set', async () => {
    const client = fakeClient({ turnFor: () => PERFECT_TURN });
    const report = await runCanary(client);
    expect(report.results).toHaveLength(5);
    expect(report.results.map(result => result.entry.id).sort()).toEqual(getCanarySet().map(entry => entry.id).sort());
  });

  it('passes when every canary entry passes its gates', async () => {
    const client = fakeClient({ turnFor: () => PERFECT_TURN });
    const report = await runCanary(client);
    expect(report.passed).toBe(true);
  });

  it('a deliberately broken response (false recast) fails the report — the deterministic failure PRD says should page', async () => {
    const brokenTurn: PersonaTurn = { comprehension: 'understood', affect: 'warm', text: 'Нет, нужно сказать по-другому.', translation: 'No, you need to say it differently.' };
    const client = fakeClient({ turnFor: () => brokenTurn });
    const report = await runCanary(client);
    expect(report.passed).toBe(false);
    expect(report.gates.find(gate => gate.key === 'zero_false_recasts')?.passed).toBe(false);
  });
});
