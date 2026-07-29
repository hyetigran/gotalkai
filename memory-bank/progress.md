# Progress

## What works

- [x] Product requirements documented (`PRD.md`)
- [x] Core ADRs accepted:
  - [x] ADR-0001 skip Wizard-of-Oz; dogfood + in-market validation
  - [x] ADR-0002 hold-to-think requires the floor
  - [x] ADR-0003 persona LLM = Claude Sonnet 5 (thinking off)
- [x] Git remote / GitLab project (`gotalkai`)
- [x] Agent docs: issue tracker (GitLab/`glab`), triage labels, domain, versioning
- [x] Cursor rules: review→commit; version bump on `mobile/package.json`
- [x] Mobile scaffold (Obytes / Expo 54) under `mobile/`
- [x] Design tokens / style foundation + splash-screen fix
- [x] Memory Bank initialized (`memory-bank/`)
- [x] `ARCHITECTURE.md` (system map; target vs current)

## What's left to build

### Phase 1 — the slice (lives or dies here)

- [ ] Backend proxy (keys never in bundle)
- [ ] Voice pipeline stub: VAD → STT → LLM → stress → TTS
- [ ] Hardcoded Валентина identity; mic in / audio out
- [ ] Six timestamps logged per stage
- [ ] STT bake-off (learner audio collected deliberately)
- [ ] TTS bake-off (stress-error rate; learner comprehension pass)
- [ ] Zod validation failure path (in-character filler)
- [ ] Owner dogfooding started from first working slice

### Phase 2 — the loop

- [ ] Open / Converse / Debrief screens (product, not template feed)
- [ ] Persistent `persona_memories` + callbacks
- [ ] Debrief ranking + `learner_structures`
- [ ] Scenario selection / tomorrow generation
- [ ] Hold-to-think UX (progressive disclosure, level meter)
- [ ] Eval harness in CI (golden set, mechanical assertions, judge)
- [ ] Daily session cap

### Phase 3 — production readiness

- [ ] Observability (health vs quality split); canary golden cases
- [ ] Live cost tracking vs subscription
- [ ] Safety / out-of-character escape hatch
- [ ] Onboarding + privacy consent; audio sampling policy
- [ ] Verify Postgres PITR / backups before relying on memories

### Phase 4 — v2 candidates

- [ ] Rive face (visemes + affect already emitted from dialogue layer)
- [ ] Second persona / coverage map unlocks
- [ ] Text input accessibility path
- [ ] Monthly comprehension benchmark surface

## Current status

**Early foundation.** Docs and mobile scaffold exist; realtime voice slice and backend services are not started. App version **0.1.2**. Branch context: scaffolding / design tokens landed on `feat/scaffold-app-design-tokens`.

## Known issues

- Template demo features (feed, sample auth) still present — not product surface.
- Root `VERSION` file has reappeared after being removed; policy forbids it — delete if present; bump only `mobile/package.json`.
- PRD companion files (`schema.sql`, `eval/`, cost model) not in repo yet.
- STT bake-off blocked on learner audio collection (no WoZ corpus).
- Hold-to-think auto-release timeout unspecified until Phase 2.
