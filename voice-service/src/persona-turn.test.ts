import type { PersonaTurn, TranscriptTurn } from './persona';
import { FILLER_LINE } from './persona';
import { buildPersonaTurnRequest, extractPartialFields, generatePersonaTurn } from './persona-turn';
import { fakeAnthropicClient, fakeMessageStream } from './test-support/fake-anthropic';

describe('extractPartialFields', () => {
  it('finds nothing in an empty or unrelated snapshot', () => {
    expect(extractPartialFields('')).toEqual({});
    expect(extractPartialFields('{"tex')).toEqual({});
  });

  it('finds comprehension before affect arrives, matching schema field order', () => {
    expect(extractPartialFields('{"comprehension":"under')).toEqual({});
    expect(extractPartialFields('{"comprehension":"understood",')).toEqual({ comprehension: 'understood' });
  });

  it('finds both fields once both have streamed in, ahead of the (still-incomplete) text field', () => {
    const snapshot = '{"comprehension":"partial","affect":"concerned","text":"Ой, извини';
    expect(extractPartialFields(snapshot)).toEqual({ comprehension: 'partial', affect: 'concerned' });
  });

  it('does not false-positive on the words "comprehension"/"affect" appearing inside free-form text', () => {
    // Deliberately adversarial: if the regex weren't anchored on the JSON
    // key position, this would wrongly extract a match from prose.
    const snapshot = '{"comprehension":"understood","affect":"warm","text":"affect and comprehension are words too"';
    expect(extractPartialFields(snapshot)).toEqual({ comprehension: 'understood', affect: 'warm' });
  });

  it('ignores an unrecognized enum value rather than matching it', () => {
    expect(extractPartialFields('{"comprehension":"fully_understood"')).toEqual({});
  });
});

describe('buildPersonaTurnRequest', () => {
  const transcript: TranscriptTurn[] = [
    { speaker: 'persona', text: 'Привет!' },
    { speaker: 'learner', text: 'Здравствуйте!' },
  ];

  it('pins the model and disables thinking, per ADR-0003', () => {
    const request = buildPersonaTurnRequest(transcript);
    expect(request.model).toBe('claude-sonnet-5');
    expect(request.thinking).toEqual({ type: 'disabled' });
  });

  it('sets low effort and a JSON-schema structured-output format, per ADR-0003 / AC #1', () => {
    const request = buildPersonaTurnRequest(transcript);
    expect(request.output_config?.effort).toBe('low');
    expect(request.output_config?.format?.type).toBe('json_schema');
  });

  it('maps the transcript onto messages and includes the cached identity system prompt', () => {
    const request = buildPersonaTurnRequest(transcript);
    expect(request.messages).toEqual([
      { role: 'assistant', content: 'Привет!' },
      { role: 'user', content: 'Здравствуйте!' },
    ]);
    expect(Array.isArray(request.system)).toBe(true);
    expect((request.system as Array<{ cache_control?: unknown }>)[0]?.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('handles an empty transcript (session start)', () => {
    const request = buildPersonaTurnRequest([]);
    expect(request.messages).toEqual([]);
  });
});

/**
 * `generatePersonaTurn`'s only untestable-without-a-real-key surface is
 * the network call itself (`client.messages.stream(...)`) — everything
 * else (partial-field wiring, fallback construction, no-crash guarantee)
 * is orchestration this fake exercises for real. See
 * test-support/fake-anthropic.ts for why the fake is this minimal.
 */
function fakeClient(deltas: string[], outcome: { parsedOutput: PersonaTurn | null } | { error: Error }) {
  return fakeAnthropicClient({ stream: () => fakeMessageStream(deltas, outcome) });
}

describe('generatePersonaTurn', () => {
  const transcript: TranscriptTurn[] = [{ speaker: 'learner', text: 'Здравствуйте!' }];
  const validTurn: PersonaTurn = { comprehension: 'understood', affect: 'warm', text: 'Ну конечно, заходи!' };

  it('returns the validated turn on success, with fellBackToFiller false', async () => {
    const client = fakeClient([JSON.stringify(validTurn)], { parsedOutput: validTurn });
    const result = await generatePersonaTurn(client, transcript);
    expect(result).toEqual({
      turn: validTurn,
      fellBackToFiller: false,
      rawOutput: JSON.stringify(validTurn),
      usage: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
    });
  });

  it('captures real Anthropic usage for cost.ts\'s estimateLlmCostUsd (ticket #29)', async () => {
    const client = fakeAnthropicClient({
      stream: () => fakeMessageStream([JSON.stringify(validTurn)], {
        parsedOutput: validTurn,
        usage: { input_tokens: 120, output_tokens: 40, cache_creation_input_tokens: 0, cache_read_input_tokens: 1000 },
      }),
    });
    const result = await generatePersonaTurn(client, transcript);
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 40, cacheCreationInputTokens: 0, cacheReadInputTokens: 1000 });
  });

  it('zeroes usage when the stream itself throws — no message ever resolved to read usage from', async () => {
    const client = fakeClient([], { error: new Error('network error') });
    const result = await generatePersonaTurn(client, transcript);
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 });
  });

  it('calls onPartial once per field, exactly when each first becomes available, not repeatedly', async () => {
    const deltas = [
      '{"comprehension":"under',
      'stood","affect":"nost',
      'algic","text":"Ой, слушай',
      ', расскажу тебе историю."}',
    ];
    const client = fakeClient(deltas, { parsedOutput: { comprehension: 'understood', affect: 'nostalgic', text: 'Ой, слушай, расскажу тебе историю.' } });
    const onPartial = jest.fn();

    await generatePersonaTurn(client, transcript, { onPartial });

    expect(onPartial).toHaveBeenCalledTimes(2);
    expect(onPartial).toHaveBeenNthCalledWith(1, { comprehension: 'understood' });
    expect(onPartial).toHaveBeenNthCalledWith(2, { affect: 'nostalgic' });
  });

  it('falls back to the filler line and preserves the raw output when the stream rejects (structured-output validation failure) — never throws', async () => {
    const malformedSnapshot = '{"comprehension":"understood","affect":"warm","text":"тут что-то слома';
    const client = fakeClient([malformedSnapshot], { error: new Error('Failed to parse structured output: invalid JSON') });

    const result = await generatePersonaTurn(client, transcript);

    expect(result.fellBackToFiller).toBe(true);
    expect(result.turn).toEqual({ comprehension: 'partial', affect: 'warm', text: FILLER_LINE });
    expect(result.rawOutput).toBe(malformedSnapshot);
  });

  it('falls back to the filler line and logs, if the stream resolves without a parsed_output at all (defensive — should not happen if the SDK behaves per its own contract, but a null must never propagate downstream as a real turn, silently or otherwise)', async () => {
    const client = fakeClient(['not valid json'], { parsedOutput: null });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await generatePersonaTurn(client, transcript);

    expect(result.fellBackToFiller).toBe(true);
    expect(result.turn).toEqual({ comprehension: 'partial', affect: 'warm', text: FILLER_LINE });
    // PRD §7.8: "log the raw output" applies to every path that produces a
    // filler turn — not just the one the SDK's own contract is documented
    // to take (the catch block below).
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('does not call onPartial at all when no onPartial callback was passed', async () => {
    const client = fakeClient([JSON.stringify(validTurn)], { parsedOutput: validTurn });
    // No `options` argument — should not throw despite the internal `on('text', ...)` listener running.
    await expect(generatePersonaTurn(client, transcript)).resolves.toBeDefined();
  });
});

/**
 * End-to-end against the real Anthropic API — gated behind a real
 * `ANTHROPIC_API_KEY`, which does not exist in this background-job
 * environment (see docs/adr/0010), so this is skipped here and will run
 * for real the first time this suite runs somewhere that has one
 * configured. `fakeClient`'s tests above cover the same orchestration
 * logic this exercises against a real model; this test's job is only to
 * confirm the real SDK/API actually behaves the way `fakeClient` assumes.
 */
const describeIfLiveApi = process.env.ANTHROPIC_API_KEY ? describe : describe.skip;

describeIfLiveApi('generatePersonaTurn (live API)', () => {
  it('produces a schema-valid Russian turn for a normal transcript, without falling back, and genuinely streams comprehension/affect before text (AC #4 — persona.ts\'s field-order claim, verified against the real model rather than only asserted in a comment)', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const partialCalls: Array<{ comprehension?: string; affect?: string }> = [];

    const result = await generatePersonaTurn(
      client,
      [
        { speaker: 'persona', text: 'Здравствуй! Заходи, будем пить чай.' },
        { speaker: 'learner', text: 'Спасибо большое!' },
      ],
      { onPartial: partial => partialCalls.push(partial) },
    );

    expect(result.fellBackToFiller).toBe(false);
    expect(result.turn.text.length).toBeGreaterThan(0);

    // onPartial must have fired for both fields — proving they were
    // readable before the stream (and therefore `text`) completed, not
    // just present in the final object.
    expect(partialCalls.some(p => p.comprehension)).toBe(true);
    expect(partialCalls.some(p => p.affect)).toBe(true);

    // And directly against the raw JSON text: comprehension/affect must
    // precede text positionally, which is what makes them extractable
    // before `text` (usually the longest field) has finished streaming.
    const comprehensionIndex = result.rawOutput.indexOf('"comprehension"');
    const affectIndex = result.rawOutput.indexOf('"affect"');
    const textIndex = result.rawOutput.indexOf('"text"');
    expect(comprehensionIndex).toBeGreaterThanOrEqual(0);
    expect(affectIndex).toBeGreaterThanOrEqual(0);
    expect(textIndex).toBeGreaterThan(comprehensionIndex);
    expect(textIndex).toBeGreaterThan(affectIndex);
  });
});
