# Tech context

## Repo layout

| Path | Role |
| --- | --- |
| `PRD.md` | Product requirements (Draft v0.1) |
| `ARCHITECTURE.md` | System architecture map (target + current) — refreshed 2026-07-30 |
| `CHARACTER.md` | Persona / expression asset notes |
| `docs/adr/` | Architecture decision records (0001–0026) |
| `docs/agents/` | Issue tracker, triage, domain, versioning for agents |
| `docs/research/` | Primary-source research notes (e.g. layout standards) |
| `mobile/` | Expo / React Native app |
| `app-service/` | Node/TS HTTP API + Postgres |
| `voice-service/` | Node/TS realtime WS + voice pipeline + eval |
| `landing/` | Next.js marketing site (Vercel) |
| `memory-bank/` | Session continuity for agents |
| `.cursor/rules/` | Always-on project agent rules (incl. code-review → commit) |

Schema: `app-service/migrations/` (not a root full dump — `schema.sql` points there). Eval: `voice-service/src/eval/`.

## Mobile stack (`mobile/`)

- **Expo SDK 54** / React Native 0.81 / React 19
- **Expo Router 6**, TypeScript strict
- **pnpm** only (`only-allow pnpm`); packageManager `pnpm@10.12.3`
- Styling: Tailwind via **Uniwind / NativeWind**
- State: **Zustand** + **MMKV**; server: **React Query** + axios
- Forms: **TanStack Form** + Zod
- Audio: **expo-audio** (+ react-native-webrtc groundwork)
- Animation: Moti / Reanimated
- Tests: Jest + RTL; Maestro e2e scripts present
- Builds: **EAS** profiles (development / preview / production)
- Quality: ESLint, commitlint, husky, lint-staged

**App version:** `mobile/package.json` → `"version"` (currently **0.1.31**). Do not use a separate `VERSION` file.

## Backend / voice (*current*)

| Layer | Choice |
| --- | --- |
| Voice pipeline | Cascaded: VAD → STT → LLM → stress → sentence-chunked TTS |
| STT + TTS | **ElevenLabs** (ADR-0013; bake-off skipped) |
| Persona LLM | Claude Sonnet 5 (ADR-0003) |
| Transport | WebSocket + base64 PCM chunks (ADR-0017) — not WebRTC peer |
| Backend | Node/TypeScript `app-service` + `voice-service` |
| Hosting target | Railway (long-lived); Postgres adjacent |
| Client ↔ app | HTTP + React Query |
| Client ↔ voice | WS (live path built, Converse UI still scripted) |

## Dev setup

```bash
# Mobile
cd mobile && pnpm install && pnpm start

# App service (needs local Postgres)
cd app-service && cp .env.example .env && pnpm install && pnpm db:migrate && pnpm dev

# Voice service
cd voice-service && cp .env.example .env && pnpm install && pnpm dev
```

Env: mobile `EXPO_PUBLIC_*`; services see each package’s `.env.example` (Anthropic, ElevenLabs, auth tokens, DB URL).

## Constraints

- API keys / voice auth never in the mobile bundle — mint per-session credentials from app service.
- Test iOS audio session on **hardware**; simulator lies about routing.
- Cyrillic font coverage (including ё) at scaffold-chip sizes.
- Live mic→PCM into JS is an open blocker for end-to-end Converse (ADR-0017).
- Formal STT/TTS bake-off skipped; empirical learner-accent accuracy unverified.

## Remote

- GitLab: `https://labs.gauntletai.com/tigranasriyan/gotalkai.git`
