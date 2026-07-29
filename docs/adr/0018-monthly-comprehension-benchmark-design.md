# Monthly comprehension benchmark: design decisions

**Status:** accepted

Ticket #35's own description: "Flagged explicitly in the mockup handoff as 'not designed yet' — this ticket includes designing the screen/flow, not just building an already-specified one." PRD §6.3 gives two sentences: re-test the learner on fresh authentic Russian audio, report comprehension climbing over time, "ability, not attendance." Everything else here is a judgment call, made against the codebase's existing conventions and the PRD's adjacent, explicit anti-gamification stance (§6.2: "absent by design: streak counter, accuracy score, percentage grade, badges").

## Content format: multiple-choice comprehension questions per audio clip

PRD doesn't specify a question format. Multiple-choice is the only format that scores objectively without a second LLM-judging pipeline (which doesn't exist for this and would be new, unscoped infrastructure) — matches the UAT's "produces a score" requirement directly. Each benchmark item is one audio clip + 2-4 multiple-choice questions with one correct answer each; a set's score is `correct_count / total_count` across all its items' questions.

## Real gap, disclosed: no authentic native-speaker audio content exists

PRD is explicit: "fresh authentic Russian audio" — non-learner-directed, i.e. real native-speaker recorded speech, not a synthesized voice. This is categorically different from this session's earlier hand-authored *text* content (`seed-scenarios.ts`'s scenario copy, written directly by an agent — an accepted, established pattern in this codebase for narrative/UI text). Audio is not text: there is no way to responsibly source or fabricate real recorded native-speaker Russian audio in this environment. Using ElevenLabs TTS to fake a clip would produce something that fails the AC's own stated requirement (authentic, non-learner-directed) while looking superficially complete — worse than leaving it disclosed.

**Decision:** the full schema/API/seeding pipeline is built for real. `seed-benchmark.ts` seeds two placeholder benchmark sets (across two different months), explicitly commented as placeholder, so the pipeline has something real to exercise end-to-end in tests and dev — not a stand-in for actual content curation. Two months, not one: this ticket's own UAT step 2 ("take it again a month later with refreshed content; confirm the second attempt didn't reuse identical clips") needs a second, different month's set to be manually walkable at all — a single seeded month made that UAT step unrunnable even as a placeholder walkthrough (found in this ticket's own code review). Sourcing licensed/curated authentic audio, writing real comprehension questions against it, and refreshing that content monthly is a human content-curation task, out of scope for this ticket, matching the precedent set by `docs/adr/0016`'s `ELEVENLABS_VALENTINA_VOICE_ID` (a required value with no default — "picking one needs human listening"). The placeholder set's `title` is rendered on the taking screen itself (not just in code comments), so anyone testing the flow sees the disclosure directly rather than silently pressing "Play clip" against a non-resolving URL with no explanation.

## Monthly refresh: `benchmark_sets` keyed by `month_key`, not a generation job

A `benchmark_sets` row per month (`month_key`, e.g. `'2026-07'`), each owning several `benchmark_items`. "Current set" = the most recent `month_key` at or before the current month — no auto-generation, no LLM content pipeline; a human/content process adds a new month's set by running the seeder (or a future admin tool, out of scope here) with real content. This directly satisfies "refreshed monthly so repeat-takers aren't scoring against memorized content" as an operational property (whoever curates content adds a new set monthly) rather than something the code itself needs to automate.

## Scoring integrity: correct answers never leave the server

`GET` the current set returns items' audio URL, question text, and choices — **never `correct_choice_index`**. Scoring happens server-side in `submitBenchmarkAttempt`, from the learner's submitted choice indices matched against the stored correct answers, the same way `createSession`'s daily-cap check treats client input as untrusted (PRD §7.8's Zod-at-the-API-boundary rule, plus never trusting a client-reported score).

## Trend display: numbers, not a chart

The one existing progress surface in this app (address-book screen, ticket #22) is explicitly documented as "deliberately not a chart or coverage map." PRD §6.2's anti-gamification list (no streak/accuracy score/percentage grade/badges) sits right next to §6.3's benchmark section. No charting library exists anywhere in `mobile/` (`react-native-svg`/`reanimated` are present as low-level primitives, but nothing higher-level — introducing one would be new dependency surface for a single screen). Given all three signals point the same direction, the trend view lists past attempts chronologically as plain counts ("14 of 16 understood — March 2026", "11 of 14 understood — February 2026"), mirroring the debrief screen's own established "numbers, not visualization" precedent — not a chart, sparkline, or percentage.

## Navigation: a row on the Settings screen, not a change to the daily loop

Two low-disruption options existed (Open screen's header row, next to "Who else"/"Settings"; or a new row in Settings' existing "Practice" list). Settings' row list (`settings-copy.ts`) is already the right shape — a list of navigable rows, currently static/inert — and doesn't add a third element to the Open screen's already-tight header. Chosen: a new "Monthly benchmark" row in Settings, `router.push('/benchmark')`. The daily Open→Converse→Debrief→Tomorrow route chain is untouched.

## Found and fixed during this ticket's own code review

- **Trend was only reachable by retaking the benchmark.** The AC calls for a trend view, not just a post-attempt receipt — the screen now has a "History" toggle independent of submitting a new attempt.
- **A native audio player leaked on every "Play clip" tap.** `expo-audio` has no GC hook for an abandoned player; `playClip` now releases the previous player before creating a new one and on completion, matching the one existing precedent for this API in the codebase (`use-tts-playback.ts`'s `player.remove()`).
- **A real cross-file test race.** `getCurrentBenchmarkSet`'s query is deliberately global (no per-test scoping key exists for "the current set"), and `jest.config.js`'s `maxWorkers: 4` runs test files in parallel against one shared local Postgres instance — a test asserting the whole `benchmark_sets` table was empty raced against another test file's own (previously uncleaned-up) seeded rows and failed non-deterministically. Fixed by removing that assertion (the branch it covered is still exercised indirectly) and making every test file that calls `seedBenchmark` clean up its rows afterward, the same discipline every other table in this schema already follows.
- **Two near-identical SQL queries** in `getCurrentBenchmarkSet` (opposite sort directions for "most recent past/current" vs. "earliest future" fallback) collapsed into one `UNION ALL` query.

## What's real vs. disclosed

**Built as real, working, tested code:**
- Schema (`benchmark_sets`, `benchmark_items`, `benchmark_attempts`), following every existing convention (UUID PKs, `ON DELETE CASCADE` from learner, `month_key`/`scene_key`-style stable content identifiers, idempotent seeder with `ON CONFLICT DO UPDATE`)
- `app-service/src/benchmark.ts`: fetch current set (answers stripped), submit + server-side score, learner trend — all Zod-validated at the API boundary, all with real tests
- `mobile/src/features/benchmark/`: full taking flow (clip → questions → submit → result), a trend view reachable independent of retaking, wired into Settings navigation — real, tested against fixtures/fakes the same way every other screen in this codebase is

**Disclosed, not built:** real authentic audio content beyond two placeholder sets; any admin/CMS tooling for adding future months' content (a human runs the seeder with real content, same operational model as `seed-scenarios.ts`); a small residual cross-file test race remains possible in principle for `getCurrentBenchmarkSet`'s tests (documented in `benchmark.test.ts` — a fully race-proof fix would mean per-test transactional DB isolation across this whole suite, out of proportion here).
