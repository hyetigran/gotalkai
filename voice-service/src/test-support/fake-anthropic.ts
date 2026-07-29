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

/** Shape of the real SDK's `Usage` field that production code (persona-turn.ts's cost capture, ticket #29) actually reads. */
export type FakeUsage = { input_tokens: number | null; output_tokens: number; cache_creation_input_tokens: number | null; cache_read_input_tokens: number | null };
const ZERO_USAGE: FakeUsage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

export type FakeStreamOutcome<T> = { parsedOutput: T | null; usage?: FakeUsage } | { error: Error };

export type FakeMessageStream<T> = {
  on: (event: 'text', cb: TextListener) => unknown;
  finalMessage: () => Promise<{ parsed_output: T | null; usage: FakeUsage }>;
};

/**
 * A fake `MessageStream`-shaped object: `.on('text', cb)` replays
 * `deltas` through the registered listener (accumulating a snapshot,
 * matching the real SDK's `(delta, snapshot)` event shape) before
 * `.finalMessage()` resolves or rejects per `outcome`. `usage` defaults
 * to all-zero when a test doesn't care about cost capture specifically —
 * only tests exercising ticket #29's cost path need to set it.
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
      return { parsed_output: outcome.parsedOutput, usage: outcome.usage ?? ZERO_USAGE };
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
