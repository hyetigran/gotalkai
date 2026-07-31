# Progress

## What works

- [x] Product requirements documented (`PRD.md`)
- [x] Founding ADRs 0001–0003 + many follow-ons through **0024** (vendors, pipeline, privacy, eval, Elena, dials, etc.)
- [x] Git remote / GitLab project (`gotalkai`)
- [x] Agent docs: issue tracker (GitLab/`glab`), triage labels, domain, versioning
- [x] Cursor rules: review→commit; version bump on `mobile/package.json`
- [x] Mobile product loop UI: Open / Converse (scripted) / Debrief / Tomorrow / cast / onboarding / settings / benchmark
- [x] Design tokens + persona/cast assets; `expo-audio` mic metering; hold-to-think UX (45s auto-release)
- [x] `app-service/`: schema (`schema.sql`), migrate, sessions, memories, debrief, scenario, avoidance, privacy, daily cap
- [x] `voice-service/`: WS server, VAD/STT/LLM/stress/TTS modules, turn orchestrator, safety, eval harness under `src/eval/`
- [x] `landing/`: Next.js marketing site (Vercel) — ticket #38
- [x] Live Converse client hook + TTS playback helpers (unit-tested; **not** wired into shipped screen — ADR-0017)
- [x] Memory Bank + `ARCHITECTURE.md` (refreshed 2026-07-30)

## What's left / gaps

### Live Converse activation (critical path)

- [ ] Per-session voice credentials from app service (no shared secret in bundle)
- [ ] Live mic → PCM frames into JS (or WebRTC peer with AEC) — ADR-0017 disclosed stub
- [ ] Wire `use-live-converse-session` into `converse-screen.tsx`
- [ ] Device UAT: barge-in, echo, hold override, six timestamps, low-confidence path

### Empirics / vendors

- [ ] Optional retrospective STT/TTS bake-off (ticket #13 left open; ADR-0013 skipped it)
- [ ] Calibrate ElevenLabs STT `logprob` threshold for “she doesn’t understand you”
- [ ] Owner dogfooding once device path works

### Phase 3-ish ops

- [ ] Confirm Postgres PITR / backups before relying on `persona_memories`
- [ ] Production observability / canary against live endpoint
- [ ] Privacy consent + audio sampling on device

### Phase 4 / polish

- [ ] Rive face (visemes + affect already in dialogue schema)
- [ ] Second persona (Елена) voice id + cast unlock UX polish
- [ ] Text-input accessibility path (ADR-0021)
- [ ] Heritage calibration dials (ADR-0024)

## Current status

**Mid-build, not early scaffold.** Backend + pipeline code and product UI exist; **realtime conversation is not live in the shipped Converse screen**. Vendor = ElevenLabs (both STT/TTS). App version **0.1.31** (`mobile/package.json`).

## Known issues

- Converse uses scripted demo; live path inert without PCM source + session voice tokens (ADR-0017).
- No WebRTC AEC on the WS+PCM transport path — echo risk if/when live.
- Root `VERSION` file may reappear — policy forbids it; bump only `mobile/package.json`.
- Formal bake-off never run; n-best STT requirement dropped with ElevenLabs.
- Template feed/auth routes may still linger beside product routes.
