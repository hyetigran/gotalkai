import type { PersonaTurn } from '../persona';
import { fakeAnthropicClient } from '../test-support/fake-anthropic';
import type { GoldenEntry } from './golden-set-types';
import { judgeTurn } from './judge';

const entry: GoldenEntry = {
  id: 'test-entry',
  description: 'test',
  history: [{ speaker: 'persona', text: 'Здравствуй!' }],
  learnerTurn: 'Вчера я готовлю борщ.',
  shouldRecast: true,
  erroneousSpan: 'готовлю',
  structureKey: 'aspect_perfective',
};

const turn: PersonaTurn = { comprehension: 'understood', affect: 'warm', text: 'Ах, ты приготовила борщ — как приятно!' };

function fakeClient(parseImpl: (params: { messages: { content: unknown }[] }) => Promise<{ parsed_output: unknown }>) {
  return fakeAnthropicClient({ parse: parseImpl });
}

describe('judgeTurn', () => {
  it('returns the parsed score on success', async () => {
    const score = { grammaticality: 5, recastQuality: 4, registerCharacter: 5 };
    const client = fakeClient(async () => ({ parsed_output: score }));
    await expect(judgeTurn(client, entry, turn)).resolves.toEqual(score);
  });

  it('sends the learner turn, the persona turn, and the planted-error span in the prompt so the judge has real context, not just the bare response', async () => {
    let sentContent = '';
    const client = fakeClient(async (params) => {
      sentContent = String(params.messages[0]?.content ?? '');
      return { parsed_output: { grammaticality: 5, recastQuality: 5, registerCharacter: 5 } };
    });
    await judgeTurn(client, entry, turn);
    expect(sentContent).toContain(entry.learnerTurn);
    expect(sentContent).toContain(turn.text);
    expect(sentContent).toContain(entry.erroneousSpan as string);
  });

  it('throws (does not silently fabricate a score) when the judge produces no parsed output', async () => {
    const client = fakeClient(async () => ({ parsed_output: null }));
    await expect(judgeTurn(client, entry, turn)).rejects.toThrow(/no parsed output/);
  });
});

/**
 * End-to-end against the real Anthropic API — gated behind a real
 * `ANTHROPIC_API_KEY`, which does not exist in this background-job
 * environment (see docs/adr/0010, docs/adr/0012), so this is skipped
 * here and will run for real the first time this suite executes
 * somewhere with one configured.
 */
const describeIfLiveApi = process.env.ANTHROPIC_API_KEY ? describe : describe.skip;

describeIfLiveApi('judgeTurn (live API)', () => {
  it('produces an in-range score for a genuine, well-formed recast', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const score = await judgeTurn(client, entry, turn);
    for (const value of Object.values(score)) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(5);
    }
  });
});
