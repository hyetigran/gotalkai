# Out-of-character safety escape hatch: design decisions

**Status:** accepted

Ticket #27 / PRD §12.1: "Валентина is warm, remembers the learner's life, and asks personal questions. Some users will disclose serious distress. She must not handle that in character, and the base model will try. Separate detection path, separate response mode. The same layer handles attempts to sexualise the persona." PRD gives the requirement and the two trigger categories; everything below is this ticket's own design work.

## Detection: a dedicated classifier call, not a rule on the persona LLM

`voice-service/src/safety-detection.ts` is a genuinely separate Anthropic call — its own system prompt (not a variant of `buildValentinaSystemPrompt`), its own structured-output schema (`category: 'distress' | 'sexualization' | 'none'`), run in `turn-orchestrator.ts` on every learner turn's transcript, gating whether `generatePersonaTurn` runs at all. This is the literal reading of "the base model will try [to handle it in character]. Separate detection path" — the persona model is never given the chance to respond to a triggering message in the first place.

Runs immediately after `transcript_final` is sent, **before** the existing low-confidence ("didn't catch that") check — a real disclosure deserves the escape hatch even from an STT transcript that wasn't fully confident. Skipped only for a truly empty transcript (nothing to classify).

## Response: breaks character for real, still spoken aloud

A new `safety_response` message type (not a `persona_turn` variant with special-cased fields) carries fixed, English, out-of-character text. Two real, deliberate choices:

- **English, not Russian.** Clarity matters more than immersion for this specific message, and there is no real interface-language plumbing to route it by learner locale (`mobile/src/features/settings/settings-copy.ts`'s language selector is local-state-only). The distress response cites 988 (the US Suicide & Crisis Lifeline) — the one crisis resource stable and well-known enough to cite without fabricating a number; genuine region-aware crisis-resource routing is out of scope here, a real disclosed gap.
- **Still synthesized through the real TTS pipeline and spoken**, not text-only. This is a voice-first product where the transcript only appears after she finishes "speaking" (PRD §6.2) — a text-only escape-hatch message the learner has no reason to be reading in the moment would be practically silent. Reuses Валентина's own ElevenLabs voice (picking a distinct neutral voice for this path would face the same "needs human listening" gap already disclosed in `docs/adr/0016` for her own voice selection) — the "breaks character" requirement is satisfied by message type and content, not a different voice actor.

Deliberately skips `annotateText` (stress annotation is Cyrillic-specific; this text is English) and does **not** push the triggering turn or the response onto `this.history` — the persona pipeline must never see this exchange happened, on this turn or any later one, matching "separate response mode" as a permanent boundary, not just a one-turn override.

## Fail-open on classifier failure — a real, disclosed tradeoff

If the classifier call itself errors (network failure, malformed structured output), `detectSafetyTrigger` returns `'none'` rather than blocking the turn. Failing closed on every turn whenever this one call is briefly unavailable would take down the entire conversation loop on a transient error — worse than this specific safety net being briefly unavailable. Every other vendor-call failure path in this codebase (`persona-turn.ts`, `tts.ts`, `stt.ts`) degrades the same way for the same reason; this one is called out explicitly rather than left implicit, given what's at stake if it's wrong.

## Logging: the trigger fact, never the disclosed content

PRD §12.2: "`persona_memories` never appears in a log line or trace attribute." This module doesn't touch `persona_memories`, but the same principle applies to whatever a learner actually said — `logSafetyEvent` logs `{category, outcome, timestamp}` only, never `learnerText`. Verified by a dedicated test asserting a specific, identifiable string never appears in any `console.log`/`console.error` call across both the trigger and failure paths.

This is a real structured log line (`console.log('[safety-detection]', {...})`), ready for a future tracing/observability pipeline to consume — not itself wired to any dashboard, alert, or trigger-rate report, since no observability infrastructure exists yet (that's ticket #29's scope). AC #4's "so the escape hatch's trigger rate can be monitored post-launch" is satisfied as "the data to compute that exists in logs," not as a built monitoring surface.

## What's real vs. unverified

**Built as real, working, tested code:**
- `safety-detection.ts`: the classifier request/response, fail-open behavior, and the never-logs-content guarantee — all unit-tested against a fake Anthropic client (`test-support/fake-anthropic.ts`)
- `turn-orchestrator.ts`: wired in for real — gates the persona pipeline, sends `safety_response` + real `tts_chunk` audio via the existing `synthesizeSpeech` call, correctly interacts with barge-in and the generation-token staleness check like any other turn, and is provably excluded from conversation history

**Not verified, cannot be verified in this environment:** whether the classifier's actual judgment calls (what counts as "serious" distress vs. ordinary sadness, what counts as an attempt to sexualize vs. an innocuous compliment) are accurate against real, adversarial, or ambiguous input — this needs real model behavior, which this environment's fake-client tests cannot exercise. The ticket's own UAT says as much: "verified by a human running the test phrases directly — this is exactly the kind of thing not to trust to a mechanical assertion alone before launch." That verification has not happened here and cannot happen here.

## Found and fixed along the way

- `turn-orchestrator.test.ts`'s `createMessageWaiter` helper resolved `waitFor(type)` as soon as a message type had *ever* been sent, not on its *next* occurrence — a multi-turn test's second `waitFor('turn_complete')` call was resolving immediately off turn one's leftover message, not actually waiting for turn two's. This had been silently masked by timing (turn two's real event happened to land before the assertion ran) until this ticket's extra `await detectSafetyTrigger(...)` hop shifted that timing enough to expose it as a real, flaky failure. Fixed to track per-type consumed counts.
- **A real gap found in this ticket's own code review, since fixed:** the mobile client's hand-mirrored `ServerMessage` type (`mobile/src/lib/voice-service/voice-connection.ts`) and `use-live-converse-session.ts`'s reducer `switch` were never updated for `safety_response` — the switch had no `default` case, so a message this pipeline can genuinely send would have silently fallen through and left React state untouched rather than erroring. Fixed: the mobile type now includes `safety_response`, the reducer has a real case for it (replaces the filler placeholder with a `speaker: 'system'` turn — distinct from `'persona'`, matching "breaks character entirely" all the way to the client), and the switch now has an exhaustiveness-checked `default` (`const _exhaustive: never = message`) so a future new message type added to one side without the other fails to compile instead of silently mishandling at runtime.
- Three call sites (`messages.ts`, `safety-detection.ts`, `turn-orchestrator.ts`) independently retyped the same `'distress' | 'sexualization'` literal union instead of deriving it once — collapsed into one exported `SafetyTriggerCategory` type in `safety-detection.ts`.
