# Tech context

## Repo layout

| Path | Role |
| --- | --- |
| `PRD.md` | Product requirements (Draft v0.1) |
| `ARCHITECTURE.md` | System architecture map (target + current) |
| `docs/adr/` | Architecture decision records |
| `docs/agents/` | Issue tracker, triage, domain, versioning for agents |
| `docs/research/` | Primary-source research notes (e.g. layout standards) |
| `mobile/` | Expo / React Native app (primary codebase today) |
| `memory-bank/` | Session continuity for agents |
| `.cursor/rules/` | Always-on project agent rules (incl. code-review → commit) |

Companion artefacts named in PRD but not all present yet: `schema.sql`, `voice_cost_model.xlsx`, `eval/`.

## Mobile stack (`mobile/`)

- **Expo SDK 54** / React Native 0.81 / React 19
- **Expo Router 6**, TypeScript strict
- **pnpm** only (`only-allow pnpm`); packageManager `pnpm@10.12.3`
- Styling: Tailwind via **Uniwind / NativeWind**
- State: **Zustand** + **MMKV**; server: **React Query** + axios
- Forms: **TanStack Form** + Zod
- Animation: Moti / Reanimated (template)
- Tests: Jest + RTL; Maestro e2e scripts present
- Builds: **EAS** profiles (development / preview / production)
- Quality: ESLint, commitlint, husky, lint-staged

**App version:** `mobile/package.json` → `"version"` (currently `0.1.2`). Do not use a separate `VERSION` file.

## Planned / not built yet

| Layer | Choice |
| --- | --- |
| Voice pipeline | Cascaded: VAD → streaming STT → LLM → stress annotation → sentence-chunked TTS |
| STT (provisional) | Deepgram — word confidence + n-best; bill by audio duration |
| TTS (provisional) | Azure Neural vs ElevenLabs Turbo bake-off — needs stress markers + phoneme timings; Unicode-codepoint billing |
| Persona LLM | Claude Sonnet 5 (ADR-0003) |
| Backend | Node/TypeScript app service + voice service |
| Hosting | Railway (long-lived); Postgres on Railway (or Neon/Supabase if backup story fails) |
| Client audio | `expo-audio` + `react-native-webrtc` (AEC); EAS dev builds (not Expo Go) |

## Dev setup (mobile)

```bash
cd mobile
pnpm install
pnpm start              # or pnpm ios / pnpm android
pnpm lint && pnpm type-check && pnpm test
pnpm check-all
```

Env: `EXPO_PUBLIC_*` via `env.ts` / `.env`. Multi-env scripts: `start:preview`, `*:production`, EAS `build:*`.

## Constraints

- API keys never in the mobile bundle — backend proxy first (Phase 1).
- Test iOS audio session (`playAndRecord`) on **hardware**; simulator lies about routing.
- Cyrillic font coverage (including ё) at scaffold-chip sizes.
- STT/TTS bake-off needs deliberate learner audio collection (no WoZ recordings — ADR-0001).

## Remote

- GitLab: `https://labs.gauntletai.com/tigranasriyan/gotalkai.git`
- Current work branch recently: `feat/scaffold-app-design-tokens`
