# Real per-session credentials, and Android native PCM capture

**Status:** accepted

docs/adr/0017 disclosed two structural gaps blocking a live Converse session from ever activating: (1) no real per-session voice-service credential issuance existed (app-service's `POST /sessions` returned only `{status, id}`), and (2) no live raw-PCM microphone source existed anywhere in the mobile dependency stack on Android. This ADR records closing both, built in parallel as two independent workstreams. **Neither change wires the live pipeline into `converse-screen.tsx`** — that integration remains separate, unscheduled follow-up work. This is the same disclosure posture as 0014/0017: build the real, testable core; say plainly what still needs a physical device.

**Update (docs/adr/0026):** the wiring described as not-yet-done below has since been built — `converse-screen.tsx` now renders a real live session when a real learner/session/token are present. On-device verification is still entirely outstanding; see 0024 for what specifically changed and what's still unverified.

## Part 1: real per-session credentials (closes ADR-0017's credential gap)

`app-service/src/session-token.ts` mints a short-lived (`SESSION_TOKEN_TTL_MS`, one hour), HMAC-SHA256-signed token scoped to one `sessionId`, returned as `voiceServiceToken`/`voiceServiceTokenExpiresAt` in `POST /sessions`'s response. Format is `base64url(JSON payload).base64url(HMAC signature)` — deliberately not JWT's three-part shape, since there's no algorithm-negotiation need when both sides hardcode HMAC-SHA256. Signed with a new `SESSION_TOKEN_SECRET` env var, required and validated at boot (min 32 chars) in both services — the exact same value must be configured on both sides, the same operational requirement the old `VOICE_SERVICE_AUTH_TOKEN` shared secret had.

`voice-service/src/session-token.ts` is the verification-only mirror (this service never issues tokens, only checks them) — hand-duplicated across the two independent npm projects, the same pattern already established for the WS message shapes between `voice-connection.ts` and `messages.ts`.

**`VOICE_SERVICE_AUTH_TOKEN` is fully retired**, not kept as a fallback. `voice-service/src/server.ts`'s upgrade handler now verifies the bearer token via `verifySessionToken` and, on success, uses the token's own embedded `sessionId` as the connection's authenticated session id immediately — `orchestrator.sessionStart()` is called right at connection setup, not deferred to the client's `session_start` message. That message is still handled (the mobile client still sends it, and it carries `learnerId`, reserved for future use), but its `sessionId` is now checked against the authenticated one rather than trusted outright; a mismatch gets an `error` response, not a silent re-point of turn recording at an unverified id.

This closes a real trust gap the old static shared-secret had: previously any client holding the one shared token could claim *any* `sessionId` via `session_start` and have turns attributed to it. Now a session's turns can only ever be attributed to the session app-service actually issued a token for.

Not addressed here: token revocation (a session's token is valid for its full TTL even if, e.g., the learner deletes their account mid-session — no revocation list exists), and there's no rate limiting on `POST /sessions` itself beyond the existing daily cap.

## Part 2: Android native PCM capture (closes ADR-0017's mic-capture gap)

`mobile/modules/expo-live-pcm-capture/` is a new **local, unpublished Expo module** (Android-only — `expo-module.config.json`'s `"platforms": ["android"]`, no `ios/`), picked up automatically by `expo-modules-autolinking`'s default `./modules` scan. Per `mobile/CLAUDE.md`'s explicit rule, `android/` (the generated, gitignored native project) was not touched — this is the correct Expo pattern for first-party native code needing autolinking, not a workaround.

The Kotlin module (`ExpoLivePcmCaptureModule.kt`) captures mono 16kHz PCM16 via `android.media.AudioRecord.read()` on a dedicated background thread (the documented pattern for this blocking API — never on the JS/main thread), converts samples to float `[-1.0, 1.0]` (the exact inverse of `pcm-encode.ts`'s `floatSampleToInt16`), and emits ~100ms frames to JS via `expo-modules-core`'s `Events`/`sendEvent`. It deliberately does no downmixing, PCM16 packing, or base64 encoding itself — `pcm-encode.ts`'s existing pure, unit-tested functions still own that, so this module's only job is supplying real samples in the shape that code already expected. `MediaRecorder.AudioSource.VOICE_COMMUNICATION` is used instead of `MIC` as a best-effort mitigation (many OEMs route it through hardware AEC/NS) — **this does not close ADR-0017's AEC gap**, which is about WebRTC-level echo cancellation being structurally absent from this WS-chunk transport; whether this source choice engages any real AEC on any given device is unverified.

`mobile/src/features/converse/use-native-pcm-capture.ts` is the React binding: `useNativePcmCapture({ enabled, onChunk, onError })`, styled after the existing `use-mic-capture.ts` (same start/stop lifecycle shape, same `AppState`-driven background/foreground handling, same ref-based "what's wanted vs. what's running" pattern). `onChunk` already receives `(pcmBase64, sampleRateHz)` — the exact argument shape `VoiceConnection.sendAudioChunk` expects — so wiring this into the live session later is a direct call, not another translation layer.

**Deliberately not wired into `converse-screen.tsx` or `use-live-converse-session.ts`** — per this ADR's scope, and because doing so would also need Part 1's token flowing through from `POST /sessions` into the connection, which is itself a separate integration step nobody has done yet (see "What's still not done," below).

### What's real vs. unverified (Part 2)

Real, built against verified `expo-modules-core`/`expo-modules-autolinking` APIs (checked against vendored `node_modules` source, not assumed): the Kotlin capture loop, the JS/TS bridge, the React hook (9 passing unit tests against a fake native module), and `pcm-encode.ts`'s existing round-trip logic.

Not verified, and cannot be in this environment (no physical Android device or emulator available): whether `AudioRecord` actually initializes with these parameters on real hardware; whether the JS bridge delivers frames at the intended cadence without drops; whether `sendEvent`-from-a-background-thread-via-`mainQueue.launch` is necessary or adds meaningful latency (a defensive choice, not one forced by evidence of an actual crash); whether `VOICE_COMMUNICATION` engages hardware AEC on any specific device/OEM.

## What's still not done to reach a live, on-device demo

Even with both gaps above closed, none of this activated the Converse screen yet as of this ADR:

1. ~~`converse-screen.tsx` still renders `use-converse-session.ts`'s scripted demo, not `use-live-converse-session.ts`.~~ **Done, see docs/adr/0026.**
2. ~~Nothing yet threads `POST /sessions`'s `voiceServiceToken` from the mobile client's session-creation call into `useLiveConverseSession`'s `token` option, or `useNativePcmCapture`'s frames into `VoiceConnection.sendAudioChunk`.~~ **Done, see docs/adr/0026.**
3. Every item ADR-0017 already flagged as unverifiable without a device — `data:` URI TTS playback, barge-in responsiveness, hold-to-think real-device timing, the 700–900ms latency target — remains exactly as unverified as before; nothing here touched that. **Still true as of 0024.**
4. No physical Android device has run any of this. All of the above is, as of this ADR, real and independently tested in isolation — not proven end to end. **Still true as of 0024 — this is the one item that can't be closed without a physical device.**
