# Active context

## Current focus

Close the gap between **built pipeline/UI** and a **device-exercisable live Converse**:

1. App-service per-session voice credentials (no secrets in the mobile bundle).
2. Real mic audio path into the WS+PCM protocol (or revisit WebRTC peer + AEC — ADR-0017).
3. Flip Converse from `use-converse-session` (scripted) to `use-live-converse-session`.
4. Owner dogfooding + optional retrospective bake-off (#13) when schedule allows.

Secondary: keep docs (`ARCHITECTURE.md`, Memory Bank) honest about current vs target; landing page marketing separate from the app loop.

## Recent changes

- Large ticket wave: app-service + voice-service pipeline, eval harness, product screens, ADRs through **0024**.
- **ADR-0013:** ElevenLabs for STT+TTS; formal bake-off skipped.
- **ADR-0017:** Live wiring built but disclosed incomplete (no device activation; WS+PCM not WebRTC peer; mic PCM stub).
- Marketing `landing/` (Next.js / Vercel, #38); character/cast assets.
- `ARCHITECTURE.md` + Memory Bank refreshed **2026-07-30** after drift from scaffold-era text.
- App version **0.1.31** in `mobile/package.json`.

## Next steps (product / eng)

1. Mint + validate short-lived voice tokens from app service → voice service.
2. Solve live audio capture into JS (native module / segmented PCM / WebRTC peer).
3. Activate live hook on Converse; physical-device UAT of cascade + hold + barge-in.
4. Start daily owner dogfooding the moment that works.
5. Delete any root `VERSION` file if present; version only via `mobile/package.json`.

## Active decisions / considerations

- Premise still unvalidated until dogfooding + session-2 return (ADR-0001).
- Hold-to-think: floor rule (ADR-0002); **45s auto-release** implemented.
- Persona LLM: Sonnet 5, thinking off (ADR-0003); verify cache prefix ≥1024 tokens.
- Vendors: **ElevenLabs both**; n-best dropped; stress via IPA/`<phoneme>` (ADR-0013).
- Transport: **WebSocket + base64 PCM**, not WebRTC peer — **no free AEC** (ADR-0017).
- Second persona (Елена) parameterized in code; shipping polish / voice id still open (ADR-0023).

## Open questions

- Exact Railway/Neon backup + PITR before production memories.
- Whether to run a retrospective bake-off or accept ElevenLabs permanently.
- Expo `app.config` / native build numbers vs `package.json` version lockstep.
- How to get live PCM (or AEC’d audio) into the client without a large native/WebRTC project.
