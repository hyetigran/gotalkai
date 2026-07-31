# System patterns

## Architecture (current + target)

```
Mobile (Expo) ──WS+PCM──► Voice service (Node/TS, long-lived)
                              │
                              ├── VAD → STT → LLM → stress → TTS  (ElevenLabs + Sonnet 5)
                              │
App service (Node/TS) ◄───────┘ session start context only
      │
      └── Postgres (not on mid-turn path)

Landing (Next.js / Vercel) — marketing only, not Converse
```

- **Cascaded pipeline**, not speech-to-speech — needs confidence signals, timings, text-before-speech.
- **Two services from day one:** App (auth, persistence, memory, debrief) vs Voice (realtime only).
- **Long-lived processes, never serverless.**
- **Region first:** pin voice near vendors (US-East for most).
- **Voice holds zero DB deps mid-conversation.**
- **Transport today:** WebSocket + base64 PCM (ADR-0017), not WebRTC peer → **no free AEC**.
- **Converse UI today:** scripted demo hook; live hook exists but not mounted (activation blockers in ADR-0017).

## Latency pattern

Budget ~700–900ms perceived. Streaming STT, sentence-boundary TTS chunking, filler, prompt caching on persona prefix (≥1024 tokens for Sonnet cache economics).

## Persona LLM (ADR-0003 / 0010)

Claude Sonnet 5; `thinking` disabled; `effort` low/medium. Structured output + Zod. Mid-stream `comprehension` / `affect`; full Zod before TTS. Failure → in-character filler, log raw, continue.

## Vendors (ADR-0013)

ElevenLabs for STT **and** TTS. Bake-off skipped. STT n-best dropped; stress annotation targets IPA/`<phoneme>`, not only `+`/U+0301.

## Client patterns

- **Obytes Expo** under `mobile/`: Expo Router, feature folders, Zustand + MMKV, React Query, TanStack Form + Zod, Uniwind/NativeWind.
- Core loop: **not** React Query — `VoiceConnection` / session hooks. React Query for profile/cast/debrief/session start.
- Absolute imports `@/…`; features in `src/features/[name]/`; routes in `src/app/`.

## Hold-to-think (ADR-0002)

While held and learner has the floor → suspend turn detection + mute STT. Holding during her turn or before first speak → **no-op**. Auto-release **~45s**.

## Data patterns (load-bearing)

- `learner_structures` — engine for scenario selection + debrief writes.
- `persona_memories` — callbacks; never log or put in traces.
- `observations` vs `debrief_items` — keep all; show three.
- Zod only at: persona LLM output, client/server API, env at boot — **not** ORM↔Postgres (ADR-0007).
- Schema file: `app-service/schema.sql`.

## Agent / delivery patterns (this repo)

- Issues on **GitLab** via `glab` (`docs/agents/issue-tracker.md`).
- Valid `/code-review` → auto `/commit` (`.cursor/rules/code-review-then-commit.mdc`).
- Ticket/feature completion bumps **`mobile/package.json` `"version"`** PATCH only — **never** a root `VERSION` file.
- ADRs in `docs/adr/` (0001–0024); domain rules in `docs/agents/domain.md`.
- Matt Pocock global `code-review` skill; repo rule only chains commit after valid review.
