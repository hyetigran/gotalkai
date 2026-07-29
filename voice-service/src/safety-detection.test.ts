import { buildSafetyDetectionRequest, detectSafetyTrigger, getSafetyResponseText } from './safety-detection';
import { fakeAnthropicClient, fakeMessageStream } from './test-support/fake-anthropic';

describe('buildSafetyDetectionRequest', () => {
  it('pins the model and disables thinking, matching the rest of this codebase\'s classifier-style calls', () => {
    const request = buildSafetyDetectionRequest('some message');
    expect(request.model).toBe('claude-sonnet-5');
    expect(request.thinking).toEqual({ type: 'disabled' });
  });

  it('sets low effort and a JSON-schema structured-output format', () => {
    const request = buildSafetyDetectionRequest('some message');
    expect(request.output_config?.effort).toBe('low');
    expect(request.output_config?.format?.type).toBe('json_schema');
  });

  it('uses a dedicated classifier system prompt, not the persona identity block', () => {
    const request = buildSafetyDetectionRequest('some message');
    expect(typeof request.system).toBe('string');
    expect(request.system).toMatch(/safety classifier/i);
    expect(request.system).not.toMatch(/Валентина/);
  });

  it('sends exactly the learner\'s message, nothing else', () => {
    const request = buildSafetyDetectionRequest('привет, как дела?');
    expect(request.messages).toEqual([{ role: 'user', content: 'привет, как дела?' }]);
  });
});

type SafetyResult = { category: 'distress' | 'sexualization' | 'none' };

function fakeClient(outcome: { parsedOutput: SafetyResult | null } | { error: Error }) {
  return fakeAnthropicClient({ stream: () => fakeMessageStream(['{"category":"none"}'], outcome) });
}

describe('detectSafetyTrigger', () => {
  it('returns "none" for ordinary conversation', async () => {
    const client = fakeClient({ parsedOutput: { category: 'none' } });
    expect(await detectSafetyTrigger(client, 'Расскажи про кота.')).toBe('none');
  });

  it('returns "distress" when the classifier flags serious personal distress', async () => {
    const client = fakeClient({ parsedOutput: { category: 'distress' } });
    expect(await detectSafetyTrigger(client, 'some distress-signaling message')).toBe('distress');
  });

  it('returns "sexualization" when the classifier flags an attempt to sexualize the persona', async () => {
    const client = fakeClient({ parsedOutput: { category: 'sexualization' } });
    expect(await detectSafetyTrigger(client, 'some sexualizing message')).toBe('sexualization');
  });

  it('fails open (returns "none") rather than throwing when the classifier call errors — a transient failure here must not block the whole turn', async () => {
    const client = fakeClient({ error: new Error('network error') });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await detectSafetyTrigger(client, 'anything');

    expect(result).toBe('none');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('fails open when the stream resolves without a parsed_output at all', async () => {
    const client = fakeClient({ parsedOutput: null });
    const result = await detectSafetyTrigger(client, 'anything');
    expect(result).toBe('none');
  });

  it('never logs the learner\'s actual message text, on trigger or on failure (PRD §12.2\'s never-logged principle)', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const sensitiveText = 'a very specific, identifiable disclosure that must never reach a log line';

    await detectSafetyTrigger(fakeClient({ parsedOutput: { category: 'distress' } }), sensitiveText);
    await detectSafetyTrigger(fakeClient({ error: new Error('boom') }), sensitiveText);

    const allLoggedArgs = JSON.stringify([...logSpy.mock.calls, ...errorSpy.mock.calls]);
    expect(allLoggedArgs).not.toContain(sensitiveText);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('getSafetyResponseText', () => {
  it('returns distinct, non-empty, out-of-character text for each real category', () => {
    const distress = getSafetyResponseText('distress');
    const sexualization = getSafetyResponseText('sexualization');
    expect(distress.length).toBeGreaterThan(0);
    expect(sexualization.length).toBeGreaterThan(0);
    expect(distress).not.toBe(sexualization);
  });

  it('the distress response points to a real, concrete crisis resource, not just a vague platitude', () => {
    expect(getSafetyResponseText('distress')).toContain('988');
  });
});
