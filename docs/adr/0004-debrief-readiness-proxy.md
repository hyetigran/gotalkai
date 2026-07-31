# Debrief ranking `readiness`: proxied via `learner_structures`, not a global CEFR level

**Status:** accepted, provisional thresholds

PRD §5.4 defines the debrief ranking function exactly: `score = frequency × (impeded ? 2.0 : 1.0) × readiness × (told_recently ? 0.3 : 1.0)`. Three of the four terms are unambiguous — `readiness` is specified only at its boundaries: "0 if below cefr_floor or far above." The PRD doesn't define a per-structure CEFR floor catalog, and `learners` (ticket #19) deliberately has no stored overall CEFR level — assigning one is onboarding/calibration's job (ticket #30), not this ticket's.

**Decision:** `readiness` is computed from the learner's own `learner_structures` row for that specific structure (ticket #19: `exposures`, `stability`), not from a separate learner-level CEFR score compared against a static per-structure floor:

- `readiness = 0` if `exposures < READINESS_MIN_EXPOSURES` (default 2) — the learner hasn't seen this structure enough yet for feedback on it to be grounded in anything they've actually encountered. This stands in for "below cefr_floor."
- `readiness = 0` if `stability >= READINESS_MASTERY_STABILITY` (default 0.85) — the learner has already demonstrated consistent success with this structure; repeating feedback about it adds nothing. This stands in for "far above."
- `readiness = 1` otherwise. A step function, not a graded curve — the PRD only specifies the two zero boundaries, so nothing beyond that is invented.

For observation groups keyed by `kind` alone (no `structureKey` — e.g. avoidance-pattern observations, ticket #23) `readiness` is 0: there's no `learner_structures` row to check against, so there's no signal to compute readiness from. That observation is still written and can still be promoted if nothing else outranks it, but it can never contribute a nonzero readiness term.

**Reasoning:** building an actual per-structure CEFR-floor catalog plus a global learner CEFR level, ahead of ticket #30's onboarding/calibration work, would mean guessing both the catalog contents and the calibration mechanism this ticket has no data for yet. Proxying via data that already exists (`learner_structures`, populated as the learner is actually exposed to structures in real sessions) keeps the ranking function grounded in real per-learner signal today, while staying replaceable: once #30 lands a real CEFR level and #23 lands richer per-structure metadata, `computeReadiness`'s inputs can be swapped without touching the ranking formula itself (`computeObservationScore`) or its callers.

**Consequences:** `READINESS_MIN_EXPOSURES` and `READINESS_MASTERY_STABILITY` are provisional, tunable constants (`app-service/src/debrief-ranking.ts`), not a recorded product decision on the exact numbers — revisit once real session data exists to check whether 2 exposures / 0.85 stability actually track "ready for feedback" in practice. Likewise `TOLD_RECENTLY_LOOKBACK_SESSIONS` (default 3, `app-service/src/debrief.ts`) is a provisional window size; the PRD specifies the discount factor (0.3) but not how many sessions "recently" spans.
