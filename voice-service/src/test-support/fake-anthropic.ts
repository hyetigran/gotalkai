import type Anthropic from '@anthropic-ai/sdk';

/**
 * Shared by every test file that needs a fake Anthropic client
 * (persona-turn.test.ts, judge.test.ts, eval/run-eval.test.ts) — three
 * independent hand-rolled versions of this existed before, each
 * reimplementing the same "cast a plain object to `Anthropic`" shape.
 * Deliberately minimal: only `messages.stream`/`messages.parse`, the two
 * methods this codebase's production code (`generatePersonaTurn`,
 * `judgeTurn`) actually calls — not an attempt to mock the SDK's full,
 * heavily-overloaded, generic surface.
 */

export type TextListener = (delta: string, snapshot: string) => void;

export type FakeStreamOutcome<T> = { parsedOutput: T | null } | { error: Error };

export type FakeMessageStream<T> = {
  on: (event: 'text', cb: TextListener) => unknown;
  finalMessage: () => Promise<{ parsed_output: T | null }>;
};

/**
 * A fake `MessageStream`-shaped object: `.on('text', cb)` replays
 * `deltas` through the registered listener (accumulating a snapshot,
 * matching the real SDK's `(delta, snapshot)` event shape) before
 * `.finalMessage()` resolves or rejects per `outcome`.
 */
export function fakeMessageStream<T>(deltas: string[], outcome: FakeStreamOutcome<T>): FakeMessageStream<T> {
  let listener: TextListener | undefined;
  return {
    on: (_event, cb) => {
      listener = cb;
      return undefined;
    },
    finalMessage: async () => {
      let snapshot = '';
      for (const delta of deltas) {
        snapshot += delta;
        listener?.(delta, snapshot);
      }
      if ('error' in outcome)
        throw outcome.error;
      return { parsed_output: outcome.parsedOutput };
    },
  };
}

export type FakeAnthropicClientOptions<StreamParams = never, ParseParams = never> = {
  /** Backs `client.messages.stream(params)` — receives the real request params so a test can vary its response per call (e.g. by inspecting the transcript). Generic (not a fixed type) so each call site can declare exactly the params shape it inspects, without a cast. */
  stream?: (params: StreamParams) => FakeMessageStream<unknown>;
  /** Backs `client.messages.parse(params)`, same reasoning. */
  parse?: (params: ParseParams) => Promise<{ parsed_output: unknown }>;
};

/** Builds a fake client satisfying the shape `generatePersonaTurn`/`judgeTurn` need, cast via `as unknown as Anthropic` — the standard technique for a test double that isn't required to satisfy the SDK's full type surface. */
export function fakeAnthropicClient<StreamParams = never, ParseParams = never>(
  options: FakeAnthropicClientOptions<StreamParams, ParseParams>,
): Anthropic {
  return {
    messages: {
      stream: options.stream,
      parse: options.parse,
    },
  } as unknown as Anthropic;
}
