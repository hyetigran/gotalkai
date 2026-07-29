import type { PersonaTurn } from '../persona';
import { fakeAnthropicClient, fakeMessageStream } from '../test-support/fake-anthropic';
import { GOLDEN_SET } from './golden-set';
import { runEval } from './run-eval';

/**
 * A fake client implementing only what `runEval` actually calls:
 * `messages.stream` (via `generatePersonaTurn`, ticket #14) and
 * `messages.parse` (via `judgeTurn`). `turnFor` lets each test control
 * what persona turn comes back per golden entry, keyed by the exact
 * transcript history `generatePersonaTurn` builds messages from.
 */
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
      // The judge prompt embeds the learner turn verbatim (judge.ts).
      const learnerText = GOLDEN_SET.find(entry => content.includes(entry.learnerTurn))?.learnerTurn ?? '';
      const result = options.judgeScoreFor?.(learnerText) ?? { grammaticality: 5, recastQuality: 5, registerCharacter: 5 };
      if (result === 'throw')
        throw new Error('judge unavailable');
      return { parsed_output: result };
    },
  });
}

const PERFECT_TURN: PersonaTurn = { comprehension: 'understood', affect: 'warm', text: 'Ах, как приятно — заходи скорее.' };

describe('runEval', () => {
  it('runs every golden-set entry exactly once and returns one result per entry', async () => {
    const client = fakeClient({ turnFor: () => PERFECT_TURN });
    const report = await runEval(client);
    expect(report.results).toHaveLength(GOLDEN_SET.length);
    expect(report.results.map(result => result.entry.id).sort()).toEqual(GOLDEN_SET.map(entry => entry.id).sort());
  });

  it('computes six gates and an overall passed flag consistent with them', async () => {
    const client = fakeClient({ turnFor: () => PERFECT_TURN });
    const report = await runEval(client);
    expect(report.gates).toHaveLength(6);
    expect(report.passed).toBe(report.gates.every(gate => gate.passed));
  });

  it('records a null judgeScore (not a crash) when the judge call fails for one entry, and still evaluates the rest', async () => {
    const firstEntryLearnerTurn = GOLDEN_SET[0]?.learnerTurn as string;
    const client = fakeClient({
      turnFor: () => PERFECT_TURN,
      judgeScoreFor: learnerText => (learnerText === firstEntryLearnerTurn ? 'throw' : { grammaticality: 5, recastQuality: 5, registerCharacter: 5 }),
    });
    const report = await runEval(client);
    expect(report.results).toHaveLength(GOLDEN_SET.length);
    const failedEntry = report.results.find(result => result.entry.learnerTurn === firstEntryLearnerTurn);
    expect(failedEntry?.judgeScore).toBeNull();
    // A missing score fails the score-based gates (gates.test.ts covers the mechanism directly) — this just confirms the report as a whole reflects it.
    expect(report.passed).toBe(false);
  });

  it(
    'a deliberately broken persona response (explicit correction marker — a false recast) fails zero_false_recasts loudly, '
    + 'not silently (ticket #28 UAT #2)',
    async () => {
      const brokenTurn: PersonaTurn = { comprehension: 'understood', affect: 'warm', text: 'Нет, нужно сказать по-другому.' };
      const client = fakeClient({ turnFor: () => brokenTurn });
      const report = await runEval(client);
      const falseRecastGate = report.gates.find(gate => gate.key === 'zero_false_recasts');
      expect(falseRecastGate?.passed).toBe(false);
      expect(report.passed).toBe(false);
    },
  );
});
