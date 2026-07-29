# Accessibility text-input path: design decisions

**Status:** accepted

Ticket #32 / PRD §12.3: "A text input path preserving the persona, covering hearing-impaired users and anyone who cannot speak aloud where they are. Not yet designed." Like ticket #35, this ticket's own description says the design work is part of the deliverable, not a pre-existing spec to build against.

## Core design decision: reuse the pipeline, don't fork it

AC #3 is explicit: "no duplicated pipeline logic." `voice-service/src/turn-orchestrator.ts` already had exactly one place where a learner's turn ever became persona generation + stress annotation + TTS + history + timestamps — `handleTurnDetected`'s tail, reached only via real STT. That tail is now `runPersonaCascade(myToken, learnerText, t0, t1)`, a private method taking a plain string, called by **both** the voice path (after STT resolves and clears the low-confidence check) and a new `submitTextInput(text)` entry point that bypasses VAD/STT entirely and calls straight into the same cascade. The safety check (ticket #27) is shared too (`checkSafetyAndRespond`, called by both paths in the same position, before anything persona-specific runs) — text input gets the exact same distress/sexualization detection voice input does, per AC #4's "avoidance detection... still function[s] in text mode" and the safety escape hatch's own "same layer" requirement (PRD §12.1).

**What text input explicitly does *not* get, and why that's correct, not a gap:** the low-confidence "didn't catch that" mechanic (PRD §5.7) is an ASR-confidence concept — `SttWord.logprob` doesn't exist for typed text, because there's no speech-recognition uncertainty to have an opinion about. Typed text is exact by construction. `submitTextInput` skips that check entirely rather than fabricating a fake confidence value.

This reuse is also what makes AC #1 ("same correction policy... same register/dial calibration, same memory/callback mechanics") true *for free*: recasts come from `generatePersonaTurn`'s own system prompt (`persona.ts`), register asymmetry is baked into that same prompt, and memory/callback mechanics live entirely in app-service, downstream of the transcript text — none of that code changed, because it never needed to know where the text came from.

## Mode switching: per-session, in-conversation, not a settings toggle

AC #2: "switchable per session... rather than a permanent account-level setting." `use-live-converse-session.ts` gains local `mode: 'voice' | 'text'` state (`InputMode`) — not persisted to MMKV or anywhere else, so it resets to voice at the start of every session, and a learner can flip it mid-conversation (e.g. walking into a quiet room). Two new UI components implement the interaction pattern this needed designing from scratch:
- `components/input-mode-toggle.tsx` — two pill buttons (Voice/Text), matching the existing suggestion-chip/hold-button visual language rather than inventing a new control style.
- `components/text-input-bar.tsx` — a plain text field + send button, deliberately not a chat-bubble composer, since Converse itself doesn't render a scrolling message list either (PRD §6.2: her line is one line, tap-to-reveal, transcript only after she finishes).

## Why these are built but not wired into the active screen

Same boundary ticket #18/#25 already established and disclosed: `converse-screen.tsx` still runs the scripted demo; `use-live-converse-session.ts` is the real, tested, but not-yet-activated replacement. `submitText`/`mode`/`setMode` are added to that same hook, and the two new components are real, standalone, and ready to compose into whatever eventually replaces `converse-screen.tsx` — not wired in here, for the same reason nothing else in that hook is.

**One genuine difference worth calling out:** voice mode's inactivity is *structural* — no live mic-capture API exists at all (docs/adr/0017), so no amount of credential-issuance work would unblock it alone. Text mode has no equivalent structural blocker: it needs only the WebSocket connection and a `text_input` send, both of which already exist and work today. The only thing standing between text mode and genuine end-to-end activation is the same real per-session credential-issuance gap from app-service (ARCHITECTURE.md §6) that blocks the whole live screen generally — once that's built, text mode specifically would need no further work to go live, unlike voice mode.

## Verification

**Built as real, working, tested code:**
- `turn-orchestrator.ts`'s refactor (`checkSafetyAndRespond`/`runPersonaCascade` extracted and shared) — the existing 20 voice-path tests pass unchanged against the refactored code, proving no voice-path behavior regressed; 6 new tests cover the text path directly (same cascade, shared history with voice turns, safety check applies, hold-to-think blocks it, empty/whitespace no-ops, barge-in when typed over her)
- `voice-connection.ts`'s `sendTextInput` and the hook's `submitText`/`mode`/`setMode` — unit-tested
- `messages.ts`'s `text_input` schema, wired into `server.ts`, with a real rejection test (malformed/empty text → 400)

**Not tested at the server.ts/WS level, deliberately:** unlike `audio_chunk` (silent audio never crosses the VAD threshold, so a "does this crash the connection" test can safely avoid triggering any real vendor call), there is no equivalent inert `text_input` payload — any non-empty text immediately reaches the real safety-detection/persona-generation/TTS pipeline against this environment's fake vendor credentials. The real happy-path coverage lives in `turn-orchestrator.test.ts` against injected fakes, the same place voice's own happy-path coverage already lived.

**Not verified, needs a device/human:** the ticket's own UAT (a full real text-only session, checking recasts/debrief/avoidance/memory-continuity end to end) — blocked on the same real per-session credential-issuance gap described above, not on anything specific to text input itself.
