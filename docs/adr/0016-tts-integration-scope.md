# TTS integration: sentence-level chunking, no voice picked yet, playback gap

**Status:** accepted

Ticket #17 (PRD §7.3/§17's own text) builds real TTS via ElevenLabs (docs/adr/0013's vendor decision). This records the design choices specific to this ticket, on top of the shared no-device scope boundary already established in docs/adr/0014.

## SDK use: the official client, unlike STT

Unlike the realtime STT endpoint (docs/adr/0014 — no SDK client exists for it), `@elevenlabs/elevenlabs-js`'s `textToSpeech.convertWithTimestamps` properly wraps ElevenLabs' TTS API, including character-level alignment data. `tts.ts` uses it directly rather than hand-rolling a client the way `stt.ts` had to.

## Chunking unit: whole sentences via `convertWithTimestamps`, not intra-sentence frame streaming

PRD's own language is "sentence-chunked TTS" — the pipeline diagram names the sentence as the unit, and AC #1 asks for "sentence-boundary chunking so playback can begin before the full response is generated." `synthesizeSpeech` (tts.ts) calls `convertWithTimestamps` once per sentence (via `splitIntoSentences`, a punctuation-boundary split — not a full NLP tokenizer, disclosed as not special-casing abbreviations/decimals, an acceptable gap given ADR-0003's own framing that persona turns are 1-2 sentences), and invokes `onChunk` as each sentence's audio becomes available — a caller (ticket #18) can start playback on sentence 1 without waiting for sentence 2.

The SDK also exposes `streamWithTimestamps`, which streams audio incrementally *within* a single sentence (frame-by-frame, not just sentence-by-sentence). That's a real additional latency lever, but not the one PRD names — the product's turns are already short (1-2 sentences per ADR-0003), so the win from chunking at the sentence boundary is the one actually asked for here. Intra-sentence streaming is a reasonable follow-up optimization once real latency numbers exist to justify it (PRD §7.3's six-timestamp instrumentation, ticket #18), not something to build speculatively now.

## No voice has been picked

Валентина's ElevenLabs voice ID (`ELEVENLABS_VALENTINA_VOICE_ID`, env.ts) has no default and no placeholder. Picking a real voice matching PRD §6.4 ("78, warm, unhurried... adult female voices in her register are the best-supported thing in Russian TTS") requires actually listening to candidate voices from ElevenLabs' library — an inherently human, subjective judgment this environment cannot make responsibly. Hardcoding an arbitrary real-looking voice ID would be worse than requiring configuration: it would silently ship an unverified, unlistened-to voice as if it had been chosen deliberately. `env.ts` makes this a required value with no default so a real deployment fails loudly at boot rather than starting up with a voice nobody selected.

## On-device gap (extends docs/adr/0014)

AC #2 ("audio plays back on the device through the same audio session established in ticket #10, without breaking mic capture") is not implemented at all in this ticket, not merely untested — no mobile-side code was written. `tts.ts` builds only the backend synthesis + alignment-capture half. This is a stronger statement than "unverified": there is no playback wiring to verify in the first place. Consistent with the scope boundary docs/adr/0014 establishes for #15 (build the backend module, defer wiring into the live client-facing flow to #18) and #16 (same), but worth being precise about here specifically — an earlier draft of this ADR said the mobile wiring "remain[s] untested," which reads as though it exists and just hasn't been exercised. It doesn't exist yet at all; #18 is where it would be written.

AC #3's alignment-data plumbing (PRD's own "should not require re-plumbing it" bar) is genuinely met by what's built: `TtsChunk.alignment` is populated on every returned chunk and passed to `onChunk`, in the same shape the vendor itself returns — a future caller (the Rive-face ticket) can consume it directly.
