# Full daily loop on real backend data: scope and verification

**Status:** accepted

Ticket #25: "the full daily loop running entirely on real backend data — every remaining scripted/fixture content from Wave 1 replaced end to end." Its own AC #1 explicitly names Converse's real pipeline as part of that loop. This ADR records why that specific piece is out of reach here, what the actual remaining gap turned out to be, and how AC #2 (a multi-day real sequence) is verified without a device.

## Converse's own pipeline is out of scope — an already-accepted gap, not a new one

Ticket #18 already established, with explicit product-owner sign-off, that Converse's live pipeline cannot be activated in this environment: no live raw-PCM mic-capture API exists in `expo-audio` (`docs/adr/0017`), and no real per-session credential issuance exists from app-service. Ticket #25 inherits that same gap by dependency, not by a new decision made here — Converse continues to run the scripted demo (`use-converse-session.ts`), unchanged by this ticket. AC #1's "Converse's real pipeline" runs as part of the loop is therefore not met, and cannot be met without first resolving #18's own disclosed blockers.

## What was actually broken: the navigation chain, not the data layer

Investigation (not assumption) before writing any code found that `useCallbackLine` (#22), `useSessionDebrief` (#20), and `useSessionScenario` (#21) were **already correctly wired** in Open/Debrief/Tomorrow — real data when a real id is present, explicit loading/error states, fixture only when no id at all, exactly per this codebase's established pattern. The real gap was upstream: `sessionId` was created in Open, forwarded correctly into Converse's own route params, and then **silently dropped** — Converse never read it, and none of Converse's three outbound navigations (auto-advance, back, End) forwarded it or `learnerId` onward. Debrief and Tomorrow had the same gap one hop further down the chain. The result: Debrief/Tomorrow's real-data code paths were correctly implemented but functionally unreachable from the live in-app navigation flow — dead code with working logic behind it.

**Fix:** every screen in the loop now reads and forwards both `sessionId` and `learnerId` through to the next screen, even where it doesn't consume both itself (e.g. Converse doesn't use `sessionId` for anything internally, but relays it to Debrief; Tomorrow doesn't use `learnerId`, but relays it back to Open so the next day's loop doesn't lose the learner). The 429/daily-cap-rejected path in `use-open-screen.ts` gets the same treatment — `learnerId` now survives even the "come back tomorrow" redirect.

## Verifying AC #2 without a device: a real HTTP-level multi-session sequence

The ticket's own UAT ("complete three to five real consecutive days... behaving deliberately... confirm the loop never falls back to scripted content") needs a human on a real device for the Converse-dependent parts — already covered by #18's disclosure. But everything else in that UAT — Open's callback, Debrief's ranking, Tomorrow's scenario/complication response, the session cap — is deterministic HTTP+Postgres behavior with no device dependency at all, and was previously untested as a *sequence* (each piece was unit/module-tested in isolation; nothing drove multiple real sessions through the actual running server for one learner and checked evolution across them).

`app-service/src/server.test.ts`'s new "full daily loop sequence" test does exactly that: creates a real learner, runs several real sessions through the actual `POST /sessions` → `GET .../scenario` → `POST .../observations` → `GET .../debrief` → `GET .../callback` cycle, with a genuinely distinct `structureKey`/`kind` observation submitted each day (an earlier draft reused the same observation for two of the three days, which meant nothing about real, non-repeating evolution was actually being exercised — found and fixed in this ticket's own code review). Each day asserts: the scenario response has real title/ladder content; the promoted debrief items (both from the `POST .../observations` response and the independent `GET .../debrief` read) actually contain *that day's* `structureKey`, not just a non-empty list; and the callback response has the real `{ callbackLine: string | null }` shape (the first draft only checked the HTTP status here, which would have passed even for an empty or malformed body — also found and fixed in review). Across the sequence, the real least-recently-used scenario rotation (#21) is asserted to actually produce more than one scenario, and the daily cap (#24) is confirmed to still reject the next session afterward. This is a genuine, real, run-repeatedly-stable proof of AC #2's substance, minus the literal "3-5 calendar days on a physical device" framing, which — like Converse itself — needs a human.

## Found and fixed along the way

Five call sites independently re-derived the same "build a params object only if a real id exists, otherwise navigate to the bare path" shape (Converse → Debrief, Converse → Open, Debrief → Tomorrow, Tomorrow → Open, Open's daily-cap-rejection → Tomorrow) — collapsed into one shared `realParamsOrBarePath` helper (`mobile/src/lib/navigation/loop-nav-params.ts`), unit-tested directly.

## What's real vs. unverified

**Built and verified, real:**
- Full `sessionId`/`learnerId` threading across Open → Converse → Debrief → Tomorrow → Open, including the daily-cap-rejection branch
- A new HTTP-level integration test proving real, evolving multi-session data across the callback/debrief/scenario surfaces, plus cap enforcement, all through the real running server and real Postgres

**Not built, structurally out of reach (inherited from #18, not new):** Converse's own live pipeline — the loop's real-data plumbing now reaches every screen around it, but Converse itself still runs the scripted demo.

**Not verified, needs a device/human:** the literal UAT — a human completing several real days on a physical device, observing the loop never fall back to scripted content anywhere including inside a live Converse conversation.
