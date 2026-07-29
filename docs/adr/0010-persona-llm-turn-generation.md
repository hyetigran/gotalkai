# Persona LLM turn generation: scope, judgment calls, and verification gaps

**Status:** accepted

Ticket #14 built `voice-service/src/persona.ts` and `persona-turn.ts`: Валентина's identity prompt, the `personaTurnSchema` structured-output contract, `generatePersonaTurn` (streaming, mid-stream partial parse, filler fallback), and a debug CLI script for manual UAT. This records the judgment calls made where the spec (PRD.md/ARCHITECTURE.md/ADR-0003) underspecifies something, and — importantly — what could and could not be verified in this environment.

## No real `ANTHROPIC_API_KEY` in this environment

This ticket was implemented in a background job with no Anthropic API credentials available. Every piece of *orchestration logic* — mid-stream partial-field extraction and its wiring, fallback construction on failure, the exact request shape sent to the API — is real, unmocked, and unit-tested (`persona.test.ts`, `persona-turn.test.ts`), using a hand-rolled fake that implements only the two `MessageStream` methods `generatePersonaTurn` actually calls (`on('text', ...)`, `finalMessage()`). What is **not** verified here is that the real Claude Sonnet 5 API actually behaves the way that fake assumes, or that the assembled prompt produces good persona behavior in practice (natural recasts, correct register, no policy violations under adversarial input).

Both live-API-only tests are written and gated behind `process.env.ANTHROPIC_API_KEY ? describe : describe.skip`, so they run for real the first time this suite executes somewhere with a key configured, without any code change:
- `persona.test.ts`: `buildValentinaSystemPrompt`'s identity prompt actually exceeds Sonnet 5's 1024-token prompt-cache minimum (ADR-0003's own stated caveat), verified via the real `client.messages.countTokens()` endpoint, not a heuristic.
- `persona-turn.test.ts`: `generatePersonaTurn` produces a schema-valid, non-fallback turn against the real model for a normal transcript.

This is the same class of gap as prior tickets' "no live browser" (#30) / "no real audio or human judges" (#13) — disclosed rather than worked around with a fabricated pass. Whoever runs this with real credentials should also exercise the debug script (`pnpm debug:persona-turn` and `pnpm debug:persona-turn -- --adversarial`) per ticket #14's own UAT steps 1-3, since recast naturalness and adversarial-input handling are exactly the things no unit test (fake or real-API) actually judges.

## Judgment calls where the spec underspecifies

- **Affect enum values.** PRD §6.5 requires "an affect tag from day one" for the deferred Rive face, but names no values. Chose `warm | delighted | nostalgic | amused | concerned` (`persona.ts`) to match Валентина's documented character (§6.4) and the situations §5.4-5.6 put her in. Not exhaustive — revisit once the face (v2) defines what it can actually animate.
- **`output_config.effort` vs top-level.** ADR-0003 says "`effort` set to low/medium" without specifying where in the request shape that lives. The installed SDK (`@anthropic-ai/sdk@0.115.0`) puts it inside `output_config: { effort, format }`, alongside the structured-output format — not a top-level request field. `buildPersonaTurnRequest` uses `low`, not `low/medium`: turns are 1-2 sentences (ADR-0003's own reasoning for disabling thinking at all), so there's no case yet where `medium` would earn its extra latency.
- **Failure handling scope.** PRD §7.8 names "validation failure" as the trigger for the filler-line fallback. `generatePersonaTurn` catches *any* error from the stream — network failures included, not just structured-output/JSON validation failures — and degrades identically. Reasoning: a mid-conversation network hiccup demands the same graceful degradation for the same reason ("we cannot surface an error to someone mid-sentence") the PRD spells out for validation failures specifically; narrowing the catch would leave the service crashing on the failure mode that's actually more likely in production.
- **Debug entry point, not a new HTTP route.** UAT #1 says "via a debug script *or* curl-equivalent against the service's internal test endpoint" — offering the script as an explicit alternative. Ticket #14 states it's "buildable and testable in isolation, without STT, TTS, or a mic"; wiring persona-turn generation into `server.ts`'s live WebSocket handling is ticket #18's job ("Full pipeline live in Converse"), which is blocked on #14/#15/#16/#17 precisely because it comes after them. Added `src/debug-persona-turn.ts` (`pnpm debug:persona-turn`) instead of a new always-on HTTP route, to avoid scope creep into #18's territory and avoid adding a billed, network-reaching endpoint to `server.ts` before there's a real caller for it.
- **Identity-prompt length.** The first draft of `VALENTINA_IDENTITY_PROMPT` was ~217 words — almost certainly under the 1024-token cache minimum by any reasonable Cyrillic BPE tokens-per-word ratio. Expanded to ~500 words with grounded, spec-consistent detail (backstory already implied by PRD §6.4 — her late husband, her library career, the cat's name, a recurring neighbor character) plus two worked recast examples, which double as concrete few-shot guidance for the correction policy, not just token padding. Still not verified against a real tokenizer here — see the gated test above.

## What ticket #14 deliberately does not include

- No wiring into `voice-service/src/server.ts`'s WebSocket message handling (ticket #18).
- No real conversation memory / `persona_memories` integration — ticket #14's own text: "real memory comes with the data layer." The identity prompt is fully hardcoded.
- No stress annotation, TTS, or six-timestamp latency instrumentation (§7.3/§7.4) — later pipeline stages.
