# Full pipeline live in Converse: transport choice, AEC gap, and verification status

**Status:** accepted

Ticket #18 wires the Converse screen to the real pipeline built in #14-#17. This records the architectural decisions made to do that, and is explicit about verification status: **none of this has run on a device.** Per explicit product-owner direction (given the moved-up deadline, after #13's bake-off was already skipped), the instruction for this ticket specifically was "build the wiring anyway, flag it clearly as unverified" — this ADR is that disclosure, not a claim of working software.

## Audio transport: WebSocket message chunks, not a WebRTC peer connection

PRD's architecture diagram labels the mobile↔voice-service link "WS/WebRTC stream," and ticket #10's own code comment anticipated "later pipeline tickets that add real TTS playback and a peer connection reuse this [WebRTC] stream." Building that — a real `RTCPeerConnection` between the mobile client and a Node WebRTC peer in voice-service — is substantial, independent infrastructure (SDP/ICE negotiation, a server-side WebRTC stack voice-service doesn't have at all) that cannot be responsibly built blind, with zero ability to test signaling or media flow.

Instead, this ticket extends the **existing WebSocket connection** (`voice-service/src/messages.ts`, `mobile/src/lib/voice-service/voice-connection.ts` — ticket #11's skeleton) to carry audio as base64-encoded PCM chunks in both directions, alongside the existing `ping`/`pong` messages. This is consistent with how `stt.ts` (#15) and `tts.ts` (#17) were already built — both assume chunked audio in/out, not a raw media stream — so this choice doesn't retrofit anything, it's the transport those modules were already shaped for.

**Consequence: this does not get WebRTC's automatic echo cancellation.** PRD §7.10 says this explicitly: "WebRTC gives AEC free; raw PCM capture does not." `react-native-webrtc`'s `MediaStream` (acquired in ticket #10's `webrtc-local-audio-stream.ts`) only hands audio to a native `RTCPeerConnection` — it does not expose raw samples to JavaScript, so there is no way to route its AEC-processed audio into a WS-chunk protocol at all. The mic audio this ticket actually sends to STT comes from a *different* path (below), with no AEC applied. **Her own voice re-entering the mic during playback may be transcribed as the learner's speech** — this is a real, known, unaddressed risk, not a theoretical one PRD warns about in the abstract. A real fix requires the WebRTC-peer-connection path described above, out of scope here.

## Mic capture: `expo-audio`'s real streaming-sample API, not a fabricated one

Before writing capture code, the actual `expo-audio` API surface was checked directly (not assumed): `AudioRecorder` (returned by `useAudioRecorder`, already used for ticket #10's level meter) extends `SharedObject<RecordingEvents>`, which provides a real `addListener('audioSampleUpdate', (sample: AudioSample) => void)` method, and a real `setAudioSamplingEnabled(boolean)` method to turn the stream on. `AudioSample.channels[].frames` is an array of floats in [-1.0, 1.0] — this is genuine raw PCM, not a fabrication or a guessed API. Converting float frames to 16-bit PCM (`Math.round(frame * 32767)`), downmixing stereo (`RecordingPresets.HIGH_QUALITY` is 44.1kHz/2ch — the existing preset, left unchanged so the already-working level meter isn't put at risk) to mono by averaging channels, and base64-encoding is real, pure, unit-testable logic (`mobile/src/features/converse/pcm-encode.ts`).

## TTS playback: `data:` URI per sentence chunk, unverified

ElevenLabs returns each sentence's audio as a base64 MP3 blob (`tts.ts`'s `TtsChunk.audioBase64`). Playback uses `expo-audio`'s `useAudioPlayer`/`AudioSource`, whose `uri` field accepts an arbitrary string — a `data:audio/mpeg;base64,<...>` URI is passed directly rather than writing each chunk to a temp file via `expo-file-system`. This is the simpler of two real options; whether iOS/Android's underlying player actually accepts `data:` URIs for audio (as opposed to only `http(s)://`/`file://`) is **not verified** — this is exactly the kind of detail that needs a device to confirm. If it doesn't work, the fallback is writing each chunk to a temp file and using a `file://` URI instead — more code, but a more universally-supported source type.

## What's real vs. what's unverified, summarized

**Built as real, working code** (backend, fully unit-tested with fakes; mobile, real but unexercised):
- Message protocol extending `messages.ts` (audio chunks, turn lifecycle, hold-to-think control, timestamps)
- Server-side turn orchestrator wiring VAD → STT → persona LLM → stress annotation → TTS, with six-timestamp instrumentation, in-character filler on generation latency, and the "she doesn't understand you" mechanic keyed off STT word confidence
- Barge-in state handling (stop TTS, cancel LLM generation, reset turn state) and hold-to-think (suspends turn detection entirely, real ~45s auto-release) — re-hosted against server-driven state rather than `use-converse-session.ts`'s local timers, preserving the single `hasFloor` check from docs/adr/0002 rather than adding special cases
- Mobile-side WS wiring, PCM capture/encoding, and TTS playback integration

**Not verified, cannot be verified in this environment** (no physical device, microphone, or speaker exist here):
- Whether audio actually round-trips correctly end to end
- Echo cancellation (structurally absent, see above — not just untested, actually not implemented)
- Barge-in's actual perceived responsiveness
- Hold-to-think's real-device timing/UX
- `data:` URI playback support
- The six-timestamp numbers actually landing in PRD §7.3's 700-900ms target

This is the same disclosure posture as docs/adr/0014/0015/0016 for #15-17, extended to cover a much larger fraction of this ticket's own AC list, per the explicit scope agreed for #18 specifically.
