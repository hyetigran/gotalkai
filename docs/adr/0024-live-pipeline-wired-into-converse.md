# Live pipeline wired into Converse

**Status:** accepted

docs/adr/0023's own "What's still not done" section listed four items once its two structural gaps (credentials, native mic capture) closed. This ADR covers the first three of those: `converse-screen.tsx` now renders a real `LiveConverseScreen` when a real session exists, `POST /sessions`'s token flows through from Open to the live hook, and native capture feeds `VoiceConnection.sendAudioChunk`. The fourth item — on-device verification — is **not** addressed here and can't be: no physical Android device exists in this environment. Every design decision below is real, working code; none of it has run on hardware.

## Routing: two full components, not one conditional hook call

`ConverseScreen` now reads `learnerId`/`sessionId`/`voiceServiceToken` from route params and renders either `LiveConverseScreen` or `ScriptedConverseScreen` — two separate components, not one component that conditionally calls `useConverseSession()` vs. `useLiveConverseSession()` based on a runtime check. React's rules of hooks don't allow a hook call to depend on a condition that can vary within a single component's render; splitting into two components, each with its own straight-line hook calls, is the standard, safe pattern for this. The branch condition (`Boolean(learnerId && sessionId && voiceServiceToken)`) is the same "real when present, fixture-equivalent default otherwise" pattern this file already used for `useTranslitEnabled`.

`open/api.ts`'s `StartSessionResponse` now includes `voiceServiceToken`, and `use-open-screen.ts` forwards it to `/converse` alongside the existing `learnerId`/`sessionId` params. `mobile/env.ts` gained `EXPO_PUBLIC_VOICE_SERVICE_URL` (previously entirely absent, per the earlier audit that prompted this whole line of work) — `LiveConverseScreen` reads it to construct the `VoiceConnection`.

## Skipping the WebRTC AEC stream in live mode

`useWebrtcAecStream` (ticket #10's `react-native-webrtc`-based `getUserMedia` capture — never anything more than groundwork, since docs/adr/0017 ultimately chose the WS-chunk transport over a WebRTC peer connection) is called only from `ScriptedConverseScreen`, not `LiveConverseScreen`. Running it alongside the new native `AudioRecord`-based capture would mean two independent consumers competing for the same microphone — an avoidable, unverified risk sidestepped by simply not acquiring a stream nothing in the live path reads from. No functional loss: nothing was ever attached to that stream to begin with.

## Level meter: driven by real capture frames, not a second recorder

`LiveConverseScreen` does not call `use-mic-capture.ts`'s `useMicCapture` (the `expo-audio`-based recorder the scripted screen still uses for its meter). Running both `useMicCapture` and the native module simultaneously would be two concurrent Android audio-capture sessions — a real, likely conflict, not just theoretical overhead. Instead, `use-native-pcm-capture.ts` now computes and returns its own `amplitude` (mirroring `useMicCapture`'s `{ amplitude, isRecording, ... }` shape deliberately), derived from each real captured frame via a new pure function, `derive-pcm-amplitude.ts`. That function converts a frame's RMS to dBFS and feeds it through the *same* `deriveMeterAmplitude` floor/ceiling the scripted meter already uses — one calibration, two capture sources, so the meter reads consistently regardless of which screen is showing it.

`use-live-converse-session.ts` gained a `sendAudioChunk(pcmBase64, sampleRateHz)` method (delegating to `VoiceConnection.sendAudioChunk`) — the hook already owned the connection for every other message type; this was simply never called until a real frame source existed.

## Capture gating: continuous, no half-duplex AEC mitigation

`useNativePcmCapture` runs whenever `!holding && mode === 'voice'` — paused during a hold (matching `use-mic-capture.ts`'s own `paused: holding` convention: nothing to usefully send while the server's been told via `hold_start` to ignore audio anyway) and while in text-input mode (ticket #32: text mode "bypasses audio entirely"). It is **not** paused during her own turn (`'thinking'`/`'speaking'`). A half-duplex gating scheme (muting capture while she talks, as a cheap partial mitigation for the still-unaddressed AEC gap) was considered and deliberately not built here — it's a product tradeoff between echo risk and barge-in capability that hasn't been decided, and this ADR's scope is wiring what already exists, not making that call unprompted. docs/adr/0017's AEC gap stands exactly as it was.

## Live transcript: no reveal, because there's nothing to reveal

`components/live-transcript.tsx` is a new component, not an extension of `components/transcript.tsx` — `ConverseTurn` (the live wire shape: `speaker`, `text`, `comprehension?`, `affect?`) carries no translation or transliteration field, unlike `ScriptedTurn`. Rather than fabricate a reveal affordance with nothing behind it, live her-turns render as plain, non-interactive text; the "Tap her line for a translation/transliteration" hint is omitted entirely in live mode. This is a real, disclosed gap one level up the stack (the server-side pipeline doesn't generate a translation yet), not something introduced or worked around here. `SuggestionChips` are likewise not rendered in live mode, per `use-live-converse-session.ts`'s own pre-existing comment that they don't apply there. A third turn kind, `system` (the ticket #27 safety escape hatch), renders distinctly — centered, muted — never styled as either speaker.

## What's still not done

Physical-device verification remains completely outstanding — nothing in this ADR changes that. Specifically still unverified: whether audio actually round-trips (mic → native module → WS → STT → persona → TTS → playback) at all on real hardware; the level meter's visual behavior against real capture frames; whether pausing capture during a hold and resuming afterward feels right; text-mode ↔ voice-mode switching mid-conversation. Echo cancellation remains structurally absent, unchanged from docs/adr/0017.
