# Active context

## Current focus

Bootstrap the product codebase and agent workflow after PRD + ADRs:

1. Mobile app scaffolded from Obytes template under `mobile/` with design-system foundation (tokens, fonts, splash fix).
2. Agent ops: GitLab issue tracker docs, code-review → commit chaining, version bumps on `mobile/package.json`.
3. Memory Bank created so sessions can resume without re-deriving PRD/ADR context.
4. Root `ARCHITECTURE.md` added as the living system map (target + current).

## Recent changes

- `ARCHITECTURE.md` written from PRD §7 + ADRs + current `mobile/` scaffold state.
- PRD drafted (`PRD.md`); ADRs 0001–0003 accepted (skip WoZ; hold-to-think floor rule; Sonnet 5 persona LLM).
- `mobile/` scaffold + design tokens; splash no longer hangs on first launch.
- Cursor project rules: `code-review-then-commit`, `version-bump` (package.json only — no `VERSION` file).
- `docs/agents/` configured for GitLab (`glab`), triage labels, domain docs, versioning.
- App version at **0.1.2** in `mobile/package.json`.

## Next steps (product / eng)

Per PRD §15 phasing:

1. **Phase 1 slice** — no product UI required: hardcoded persona, mic in / audio out, six stage timestamps, backend proxy, vendor bake-off against hard STT/TTS requirements.
2. Start **daily owner dogfooding** the moment the slice works.
3. **Phase 2** — Open / Converse / Debrief screens, memory, scenario selection, eval harness in CI, session cap.
4. Do not start Phase 3 privacy/canary/cost until Phase 2 loop is real.

Near-term engineering hygiene:

- Replace template feed/auth demo surface with product routes as Phase 2 approaches.
- Add `schema.sql` / `eval/` artefacts when Phase 1–2 need them.
- Ensure no root `VERSION` file creeps back; version only in `mobile/package.json`.

## Active decisions / considerations

- Premise unvalidated until dogfooding + post-release session-2 return (ADR-0001) — treat weak return as premise failure, not a retention tweak.
- Hold-to-think: no queued intent during her turn (ADR-0002).
- Persona model: Sonnet 5, thinking off; verify cache prefix ≥1024 tokens before relying on §9 caching (ADR-0003).
- STT/TTS vendors provisional until bake-off; build to hard requirements, not a locked API.
- Auto-release timeout for hold-to-think (~45s) still to specify before Phase 2.

## Open questions

- Exact Railway/Neon backup + PITR choice before Phase 3 (`persona_memories` irreplaceable).
- Learner audio source for STT bake-off (record targets vs tutoring-platform students).
- Whether Expo `app.config` / native build numbers should stay in lockstep with `package.json` version on every ticket bump.
