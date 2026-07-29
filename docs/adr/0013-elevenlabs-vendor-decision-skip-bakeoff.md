# Vendor decision: ElevenLabs for both TTS and STT, bake-off skipped

**Status:** accepted

Ticket #13 specified a formal empirical bake-off (PRD §7.5) before committing to STT/TTS vendors: ~200 utterances scored by native speakers for a countable stress-error rate, a second pass measuring A2-learner comprehension, and STT scored against deliberately collected real learner audio measuring case/aspect-error survival through the transcript. That process needs real human judges and real audio this environment cannot produce — the same constraint that made #13 the one ticket blocking the entire voice-pipeline arc (#15-18) all session.

**Decision, made explicitly by the product owner given a moved-up deadline:** skip the formal bake-off. Commit to **ElevenLabs for both TTS and STT** — one vendor, one API key, simplest integration surface. This supersedes PRD §7.5's provisional starting point (Deepgram STT; Azure vs. ElevenLabs TTS bake-off) without the bake-off ever running.

## What was actually verified before committing to this (documentation research, not empirical testing)

PRD §7.5's hard requirements were checked against ElevenLabs' current public API documentation (checked 2026-07-29, via web search/fetch — not a bake-off, and worth re-verifying if this ADR is read much later, since vendor APIs change):

| Requirement | Status | Detail |
|---|---|---|
| STT: word-level confidence | **Met, differently shaped than assumed** | Each word carries a `logprob` (log-probability, range (-∞, 0]) rather than a 0-100%/0-1 confidence score. Usable for the "she doesn't understand you" mechanic (PRD §5.7), but any threshold logic needs calibrating against logprob's scale, not ported from a percentage-based assumption. |
| STT: n-best alternatives | **Not met** | ElevenLabs STT returns a single top transcript per audio channel — no alternative hypotheses at all. PRD §7.5 calls this explicitly **disqualifying**: "A top-1 transcript string is disqualifying." Accepted anyway, by explicit product-owner decision — see "Consequences" below. |
| STT: billing by audio duration | **Met** | Priced per minute of audio processed, not connection time. |
| TTS: explicit stress-marker support | **Not met as PRD assumed, but adaptable** | PRD's stress-annotation stage (§7.4) assumes emitting a `+` or U+0301 combining-accent mark inline before the stressed vowel, a convention some Russian-specific accentuator/TTS pairings use. ElevenLabs' actual pronunciation-control mechanism is SSML `<phoneme>` tags carrying full IPA (or CMU, English-only) transcription — a different, heavier mechanism. IPA/CMU phoneme tags in non-English languages additionally require the `eleven_v3` model specifically. The stress-annotation stage's *output format* (ticket #16) needs to target this — per-word IPA phoneme tags, not inline marks — not the input mechanism PRD originally assumed. |
| TTS: phoneme timings / character-level alignment | **Met** | Documented character-level timestamp endpoints (start/end seconds per character), usable for viseme driving (PRD §6.5/§7.3). |
| TTS: per-Unicode-codepoint billing | **Met** | Priced per character (1 character ≈ 1 credit for the V2 Multilingual models), not per byte — avoids the Cyrillic byte-doubling cost problem PRD §7.5 flagged. |

## Consequences

- **Case/aspect-error detection before ASR normalization repairs them (PRD §7.10) is dropped/deferred**, not built as originally scoped. That mechanic specifically depended on n-best alternatives surfacing a learner's actual (wrong) case ending before the recognizer's own language model silently "corrects" it to the grammatically expected form. With only a top-1 transcript, this signal isn't available from STT at all. If it's needed later, it would require either a different/additional STT call, a custom n-best-producing setup, or dropping the requirement that this specific signal come from ASR at all.
- **Stress annotation (ticket #16) must target IPA phoneme tags**, not the `+`/combining-accent convention PRD's §7.4 text describes. This is a real, larger scope difference for that ticket than "swap the marker character" — it needs a Russian grapheme-to-IPA-with-stress conversion step, not just stress-position detection.
- **The bake-off's actual empirical purpose — voice quality and STT accuracy specifically on accented learner Russian, which PRD §7.5 itself says "vendor benchmarks answer neither" — remains unverified.** This ADR records a documentation-level capability check, not the human-judged stress-error rate or comprehension data ticket #13's own Pass bar required. Ticket #13 stays open (see its tracker note) as a reminder that this gap exists, even though the vendor decision it would have informed has now been made without it.
- Ticket #13 is not being "completed" by this ADR — it's being explicitly superseded/skipped, by the same kind of product-owner call that overrides any other blocked-and-waiting ticket. If the deadline pressure eases, running the real bake-off retroactively (to confirm rather than blindly trust the vendor choice) is still valuable and cheap relative to having shipped on an unverified assumption.
