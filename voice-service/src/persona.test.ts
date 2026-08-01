import Anthropic from '@anthropic-ai/sdk';
import {
  buildValentinaSystemPrompt,
  FILLER_LINE,
  personaTurnSchema,
  toMessageParams,
  VALENTINA_IDENTITY_PROMPT,
} from './persona';

describe('personaTurnSchema', () => {
  it('accepts a well-formed persona turn', () => {
    const result = personaTurnSchema.safeParse({
      comprehension: 'understood',
      affect: 'warm',
      text: 'Ну конечно, заходи, чайник уже кипит.',
      translation: 'Of course, come in, the kettle\'s already boiling.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unrecognized comprehension value — Zod, not the model, is the source of truth for the enum', () => {
    const result = personaTurnSchema.safeParse({
      comprehension: 'fully_understood', // not a real value
      affect: 'warm',
      text: 'Привет.',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized affect value', () => {
    const result = personaTurnSchema.safeParse({
      comprehension: 'understood',
      affect: 'ecstatic', // not in PERSONA_AFFECT_VALUES
      text: 'Привет.',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty text — a turn with nothing to say is not a valid turn', () => {
    const result = personaTurnSchema.safeParse({
      comprehension: 'understood',
      affect: 'warm',
      text: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing field entirely, not just a wrong-typed one', () => {
    const result = personaTurnSchema.safeParse({ comprehension: 'understood', affect: 'warm' });
    expect(result.success).toBe(false);
  });
});

describe('FILLER_LINE', () => {
  it('matches PRD.md\'s exact specified fallback line, not a paraphrase', () => {
    // PRD §7.8: «простите, что-то я задумалась» (lowercase, as quoted in the doc).
    expect(FILLER_LINE.toLowerCase()).toContain('простите, что-то я задумалась');
  });

  it('is itself a valid persona turn text', () => {
    const result = personaTurnSchema.safeParse({ comprehension: 'partial', affect: 'warm', text: FILLER_LINE, translation: 'Sorry, I got lost in thought...' });
    expect(result.success).toBe(true);
  });
});

describe('buildValentinaSystemPrompt', () => {
  it('returns a single text block carrying the identity prompt, marked for prompt caching', () => {
    const blocks = buildValentinaSystemPrompt();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      type: 'text',
      text: VALENTINA_IDENTITY_PROMPT,
      cache_control: { type: 'ephemeral' },
    });
  });

  it('encodes the register asymmetry (she uses ты, learner uses вы) — PRD §6.4', () => {
    expect(VALENTINA_IDENTITY_PROMPT).toContain('"ты"');
    expect(VALENTINA_IDENTITY_PROMPT).toContain('"вы"');
  });

  it('encodes the in-flow-recast-only correction policy — PRD §5.4', () => {
    expect(VALENTINA_IDENTITY_PROMPT).toMatch(/не более\s+одного исправления/);
    expect(VALENTINA_IDENTITY_PROMPT).toMatch(/не хвали/);
  });

  it('encodes the domestic-topics boundary and the politics-deflection instruction — PRD §6.4', () => {
    expect(VALENTINA_IDENTITY_PROMPT).toMatch(/не\s+обсуждаешь\s+политику/);
  });

  it('rough word-count sanity check for the 1024-token cache minimum (ADR-0003) — NOT a substitute for a real token count', () => {
    // This is a heuristic floor, not a verified measurement: no
    // ANTHROPIC_API_KEY exists in this environment to call the real
    // `client.messages.countTokens()` endpoint (see the gated describe
    // block below, and docs/adr/0010). ~500 Russian words comfortably
    // clears 1024 tokens under any reasonable tokens-per-word ratio for
    // Cyrillic BPE tokenization, but "comfortably" here is a judgment
    // call pending real verification, not a guarantee.
    const wordCount = VALENTINA_IDENTITY_PROMPT.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeGreaterThan(400);
  });
});

describe('toMessageParams', () => {
  it('maps persona turns to assistant and learner turns to user, in order', () => {
    const params = toMessageParams([
      { speaker: 'persona', text: 'Привет!' },
      { speaker: 'learner', text: 'Здравствуйте!' },
    ]);
    expect(params).toEqual([
      { role: 'assistant', content: 'Привет!' },
      { role: 'user', content: 'Здравствуйте!' },
    ]);
  });

  it('handles an empty transcript (session start, before the learner has spoken)', () => {
    expect(toMessageParams([])).toEqual([]);
  });
});

/**
 * ADR-0003's own stated caveat: "verify the actual assembled persona
 * prompt exceeds the 1024-token cache minimum before relying on the §9
 * caching economics." This is the real verification — gated behind a real
 * `ANTHROPIC_API_KEY`, which does not exist in this background-job
 * environment (see docs/adr/0010), so it is skipped here and will run for
 * real the first time this suite runs somewhere that has one configured.
 */
const describeIfLiveApi = process.env.ANTHROPIC_API_KEY ? describe : describe.skip;

describeIfLiveApi('buildValentinaSystemPrompt (live API token count)', () => {
  it('the identity prompt exceeds the Sonnet 5 1024-token prompt-cache minimum', async () => {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const result = await client.messages.countTokens({
      model: 'claude-sonnet-5',
      system: buildValentinaSystemPrompt(),
      messages: [{ role: 'user', content: '(token count probe)' }],
    });
    expect(result.input_tokens).toBeGreaterThan(1024);
  });
});
