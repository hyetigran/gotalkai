# System patterns

## Architecture (target)

```
Mobile (Expo) ──stream──► Voice service (Node/TS, long-lived)
                              │
                              ├── VAD → STT → LLM → stress → TTS
                              │
App service (Node/TS) ◄───────┘ session start context only
      │
      └── Railway Postgres (not on mid-turn path)
```

- **Cascaded pipeline**, not speech-to-speech — product needs STT confidence, phoneme timings, and text-before-speech for recasts/register/repair.
- **Two services from day one:** App (auth, persistence, memory, debrief) vs Voice (realtime only). Voice can later move to Python/Pipecat without rewriting the app service.
- **Long-lived processes, never serverless** — cold starts blow the latency budget; warm provider connections must stick.
- **Region first:** pin voice near STT/TTS/LLM (US-East for most). Wrong region costs more than DB latency.
- **Voice holds zero DB deps mid-conversation** — context assembled once at session start. A mid-turn Postgres query is a bug.

## Latency pattern

Budget ~700–900ms perceived. Buy back cascade cost with streaming STT, sentence-boundary TTS chunking, and prompt caching on the persona prefix (min ~1024 tokens for Sonnet cache economics).

## Persona LLM (ADR-0003)

Claude Sonnet 5; `thinking` disabled; `effort` low/medium. Structured output + Zod at the boundary. Mid-stream parse early fields (`comprehension`, `affect`) for face; full Zod validate before TTS. Validation failure → in-character filler, log raw, continue (Phase 1 requirement).

## Client patterns (current scaffold)

- **Obytes Expo template** under `mobile/`: Expo Router, feature folders, Zustand + MMKV, React Query, TanStack Form + Zod, Uniwind/NativeWind.
- Conversation UI must **not** force React Query/axios request-response for the core loop — persistent bidirectional stream with its own connection manager. React Query stays for profile/cast/debrief history.
- Absolute imports `@/…`; features in `src/features/[name]/`; routes in `src/app/`.

## Hold-to-think (ADR-0002)

Hard override: while held and learner has the floor → suspend turn detection + mute STT. Holding during her turn or before the learner has spoken → **no-op**. No queued-hold flag.

## Data patterns (load-bearing)

- `learner_structures` — engine for scenario selection + debrief writes.
- `persona_memories` — callbacks; never log or put in traces; deletion must clear memories + audio + transcripts together.
- `observations` vs `debrief_items` — keep all analyser notices; show three.
- Zod only at: persona LLM output, client/server API, env at boot — **not** ORM↔Postgres.

## Agent / delivery patterns (this repo)

- Issues on **GitLab** via `glab` (`docs/agents/issue-tracker.md`).
- Valid `/code-review` → auto `/commit` (`.cursor/rules/code-review-then-commit.mdc`).
- Ticket/feature completion bumps **`mobile/package.json` `"version"`** PATCH only — **never** a root `VERSION` file.
- ADRs in `docs/adr/`; domain consumption rules in `docs/agents/domain.md`.
