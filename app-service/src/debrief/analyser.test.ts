import type { AnalyserObservation, TranscriptTurnForAnalysis } from './analyser';
import { fakeAnthropicClient, fakeParse } from '../test-support/fake-anthropic';
import { analyseSessionTranscript, buildAnalyserRequest } from './analyser';

describe('buildAnalyserRequest', () => {
  it('pins the model and a JSON-schema structured-output format', () => {
    const request = buildAnalyserRequest([{ speaker: 'persona', content: 'Привет!' }]);
    expect(request.model).toBe('claude-sonnet-5');
    expect(request.output_config?.format?.type).toBe('json_schema');
  });

  it('enables thinking, unlike persona-turn.ts\'s dialogue generation', () => {
    const request = buildAnalyserRequest([{ speaker: 'persona', content: 'Привет!' }]);
    expect(request.thinking).toEqual({ type: 'enabled', budget_tokens: 1024 });
  });

  it('formats the transcript as labeled Persona/Learner lines', () => {
    const request = buildAnalyserRequest([
      { speaker: 'persona', content: 'Привет!' },
      { speaker: 'learner', content: 'Здравствуйте!' },
    ]);
    expect(request.messages).toEqual([
      { role: 'user', content: 'Persona: Привет!\nLearner: Здравствуйте!' },
    ]);
  });

  it('handles an empty transcript without crashing, with a readable placeholder', () => {
    const request = buildAnalyserRequest([]);
    expect(request.messages).toEqual([
      { role: 'user', content: '(empty transcript — no turns were recorded for this session)' },
    ]);
  });
});

describe('analyseSessionTranscript', () => {
  const transcript: TranscriptTurnForAnalysis[] = [
    { speaker: 'persona', content: 'Ты уже искал собаку?' },
    { speaker: 'learner', content: 'Мы иска́ем два дня.' },
  ];

  it('returns [] without calling the API for an empty transcript', async () => {
    const parse = jest.fn();
    const client = fakeAnthropicClient({ parse });
    const result = await analyseSessionTranscript(client, []);
    expect(result).toEqual([]);
    expect(parse).not.toHaveBeenCalled();
  });

  it('maps a real parsed observation into recordObservations\' own ObservationInput shape', async () => {
    const parsedOutput: { observations: AnalyserObservation[] } = {
      observations: [
        { kind: 'grammar_error', structureKey: 'aspect_perfective', impeded: false, title: 'Мы иска́ли, not мы и́щем.', body: 'Past narration used the present tense.', tag: undefined },
      ],
    };
    const client = fakeAnthropicClient({ parse: fakeParse({ parsedOutput }) });

    const result = await analyseSessionTranscript(client, transcript);

    expect(result).toEqual([
      { kind: 'grammar_error', structureKey: 'aspect_perfective', impeded: false, detail: { title: 'Мы иска́ли, not мы и́щем.', body: 'Past narration used the present tense.' } },
    ]);
  });

  it('includes tag in detail only when the model provided one', async () => {
    const parsedOutput = { observations: [{ kind: 'stress_error' as const, impeded: true, title: 'Stress: нашла́сь, not на́шлась.', body: 'Recurring across turns.', tag: 'impeded communication · 2×' }] };
    const client = fakeAnthropicClient({ parse: fakeParse({ parsedOutput }) });

    const result = await analyseSessionTranscript(client, transcript);

    expect(result).toEqual([
      { kind: 'stress_error', structureKey: undefined, impeded: true, detail: { title: 'Stress: нашла́сь, not на́шлась.', body: 'Recurring across turns.', tag: 'impeded communication · 2×' } },
    ]);
  });

  it('returns [] and logs, without throwing, when parsed_output is missing', async () => {
    const client = fakeAnthropicClient({ parse: fakeParse({ parsedOutput: null as unknown as { observations: AnalyserObservation[] } }) });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await analyseSessionTranscript(client, transcript);

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('returns [] and logs, without throwing, when the API call itself fails', async () => {
    const client = fakeAnthropicClient({ parse: fakeParse({ error: new Error('network error') }) });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await analyseSessionTranscript(client, transcript);

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

/**
 * End-to-end against the real Anthropic API — gated behind a real
 * `ANTHROPIC_API_KEY`, same `describeIfLiveApi` pattern
 * persona-turn.test.ts (voice-service) already establishes, and skipped
 * here for the same reason: no real key exists in this environment
 * (docs/adr/0010).
 */
const describeIfLiveApi = process.env.ANTHROPIC_API_KEY ? describe : describe.skip;

describeIfLiveApi('analyseSessionTranscript (live API)', () => {
  it('produces at least one Cyrillic-titled observation for a transcript with a real, obvious mistake', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const result = await analyseSessionTranscript(client, [
      { speaker: 'persona', content: 'Ты уже искал собаку?' },
      { speaker: 'learner', content: 'Мы иска́ем два дня, но не нашли.' },
      { speaker: 'persona', content: 'Два дня искали! Ты имеешь в виду, что вы искали раньше, а не сейчас?' },
    ]);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.detail?.title).toMatch(/[а-яА-Я]/);
  });
});
