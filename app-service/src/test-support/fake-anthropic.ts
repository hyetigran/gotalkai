import type Anthropic from '@anthropic-ai/sdk';

/**
 * Mirrors voice-service/src/test-support/fake-anthropic.ts field-for-field
 * — duplicated, not imported, same no-workspace-linking constraint
 * turns.ts's own `timings` comment already documents. This copy only
 * needs `messages.parse` (analyser.ts calls that, not `.stream` — a
 * post-session batch analysis has no mid-stream UI to feed, unlike
 * persona-turn.ts's live dialogue), so `stream` is omitted rather than
 * copied dead.
 */
export type FakeParseOutcome<T> = { parsedOutput: T } | { error: Error };

/**
 * Builds a fake client satisfying the shape `analyseSessionTranscript`
 * needs, cast via `as unknown as Anthropic` — the standard technique for
 * a test double that isn't required to satisfy the SDK's full,
 * heavily-overloaded generic surface.
 */
export function fakeAnthropicClient<ParseParams = never>(
  options: { parse: (params: ParseParams) => Promise<{ parsed_output: unknown }> },
): Anthropic {
  return {
    messages: {
      parse: options.parse,
    },
  } as unknown as Anthropic;
}

/** Resolves/rejects the way `client.messages.parse(...)` really does, from a fixed outcome — a test only cares about `parsed_output`, not the full `ParsedMessage` shape. */
export function fakeParse<T, ParseParams = never>(outcome: FakeParseOutcome<T>): (params: ParseParams) => Promise<{ parsed_output: unknown }> {
  return async () => {
    if ('error' in outcome)
      throw outcome.error;
    return { parsed_output: outcome.parsedOutput };
  };
}
