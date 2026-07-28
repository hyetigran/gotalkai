# Product requirements — Russian conversation practice app

**Status:** Draft v0.1
**Owner:** _(you)_
**Last updated:** 27 July 2026

---

## 1. Summary

A mobile app for speaking practice in Russian, built around a small cast of AI
conversation partners with persistent memory and calibrated difficulty. The
learner talks; the app is a person to talk to.

The wedge is a gap the streak-based apps create and do not close: people
accumulate vocabulary for years and still cannot hold a conversation, because
they have never had to produce language under real-time social pressure with
someone who might not understand them.

**One-line positioning:** for people who already have the words and still can't
speak.

---

## 2. Problem

Language apps optimise for attendance, not ability. A 900-day streak and an
inability to order lunch is a widely recognised joke, and it exists because
retention metrics and acquisition metrics diverge.

Three specific failures we design against:

1. **No production under pressure.** Multiple choice and typed answers do not
   train real-time speech. Speaking is a distinct motor and cognitive skill.
2. **No register.** How you address a taxi driver and your partner's
   grandmother are different languages in Russian. Textbooks default to вы and
   never train the switch.
3. **Access.** Finding a patient native speaker who will talk to a nervous
   beginner daily is the actual bottleneck, and tutoring marketplaces solve it
   at $15–30/hour.

---

## 3. Target user

**Primary — heritage speakers.** Grew up hearing Russian, understand a great
deal, produce almost nothing, and are embarrassed to speak in front of family.
Badly served by beginner courses that insult their comprehension.

**Secondary — partners of Russian speakers.** Concrete relational motivation,
a real deadline (meeting the family), and a comprehension/production gap.

Both have an asymmetry the market ignores: **listening at B1–B2, speaking at
A1–A2.** The persona format serves this directly, because a grandmother who
tells stories is comprehensible input wrapped in a relationship.

**Level floor: A2 spoken interaction.** We do not serve true beginners in v1.
CEFR is skill-separated; our floor refers to spoken interaction only, and most
users will arrive well above it in listening.

---

## 4. Non-goals

Explicitly out of scope for v1. Revisit only with evidence.

- Beginner instruction from zero. No alphabet, no first-600-words bootstrap.
- Reading, writing, or grammar-drill surfaces.
- Any language other than Russian.
- More than one persona shipped.
- Photorealistic or video avatars.
- Social features, leaderboards, streaks, or friend graphs.
- Tutor marketplace or human-in-the-loop sessions.
- Web client.

---

## 5. Pedagogical model

### 5.1 Framing

Spaced repetition and immersion are not alternatives. SRS is a *retention*
technology; immersion is an *acquisition* technology. We apply spaced
repetition to **grammatical structures rather than vocabulary**, and the
review schedule is driven by whether the learner can produce a structure under
conversational pressure — not whether they can recognise a flashcard.

Sessions are organised as **tasks with success conditions** (task-based
language teaching), not grammar points.

### 5.2 The three difficulty dials

Difficulty is not one number. Three independent axes, stored per session:

| Dial | 1 | 5 |
|---|---|---|
| **Comprehension load** | Slow, high-frequency, no idiom | Natural speed, regional idiom, elision |
| **Production demand** | Fragments accepted | Narration, justification, elaboration required |
| **Repair behaviour** | Rescues immediately, rephrases | Does not adjust; asks again the same way |

Repair behaviour is where the difficulty curve actually lives and is the axis
no competitor exposes.

### 5.3 Scenario design

Scenarios scale by **complication, not vocabulary**. The same scene at three
demand levels: she offers tea → she's out of the tea you like → she's offended
you didn't visit. Authored once, yields a curriculum.

### 5.4 Correction policy

- **In-flow: recasts only.** The persona reformulates the learner's error
  naturally inside a normal reaction. Never flagged, never repeated back,
  maximum one per turn.
- **Post-session: three patterns.** Not every slip. Ranked, not listed.
- **Never:** explicit correction, grammar explanation, or praise of the
  learner's Russian.

Debrief ranking function:

```
score = frequency
      × (impeded ? 2.0 : 1.0)        // did it break communication
      × readiness                     // 0 if below cefr_floor or far above
      × (told_recently ? 0.3 : 1.0)   // don't repeat across sessions
```

### 5.5 Avoidance detection

The differentiating signal. We inject target structures at session start, so
we can diff *intent* against *production* and detect what the learner steered
around — e.g. present tense throughout a scenario that demanded past
narration. "You steered around this" is more useful than "you got this wrong."

### 5.6 Backchanneling — the A2 unlock

Первая persona's main mode is storytelling in installments. The learner's job
is to keep the story alive with minimal production: *правда? да ты что! а
потом?*

Backchanneling is untaught by every competitor, achievable on day one, and
makes a learner *feel* fluent long before they are. It is also the mechanism
that delivers large volumes of comprehensible input without demanding output
the learner cannot yet produce.

### 5.7 Pronunciation

**Intelligibility, not native-likeness.** No percentage scores. Two mechanisms:

1. **She doesn't understand you.** Triggered off STT confidence. Honest,
   motivating, requires no pronunciation model.
2. **Debrief patterns**, reported only when recurring across several turns.
   Never a single low-confidence word.

Russian priority: **stress placement first** — it is lexical, mobile, and
meaning-bearing, and it is the dominant intelligibility factor.

### 5.8 Structures taxonomy (Russian)

Priority order, chosen partly because these survive ASR normalisation:

1. **Verbal aspect** — perfective/imperfective are distinct lexemes, so
   recognition does not silently repair them.
2. **Verbs of motion** — идти/ходить/ехать/ездить plus prefixes.
3. **Stress placement.**
4. **Register** — ты/вы and name forms.
5. **Case government** on high-frequency verbs and prepositions. Split by
   trigger, never as one "cases" structure.

---

## 6. Product surface

### 6.1 The daily loop

```
Open  →  Converse  →  Debrief  →  Tomorrow's scenario  ─┐
  ↑                                                      │
  └──────────────────────────────────────────────────────┘
```

1. **Open.** Today's session, zero decisions. She opens with a callback to
   something she remembers.
2. **Converse.** Scaffolding fades as the learner improves.
3. **Debrief.** Three patterns, not every slip.
4. **Tomorrow.** Built to demand what was missed.

The return arrow is the product. Without it this is a chatbot in a costume.

Onboarding and the persona cast browser sit **outside** this loop.

### 6.2 Key screens

**Open** — persona card, her callback line, one tap to start. She opens, not
the learner: the blank page is why speaking practice doesn't get done.

**Converse** — her turn, learner's transcribed turn, suggestion chips at
decaying contrast. The recast is invisible in-flow.

Her line renders as **Cyrillic with stress marks**, one line, nothing else.
Stress annotation (§7.4) already computes these for TTS; displaying them costs
nothing and is what Russian learner materials actually do. This makes stress a
visible teaching surface rather than only a pronunciation input.

**Transcript appears after she finishes speaking, never during.** Text on
screen while she talks converts a listening exercise into a reading one.
Free to implement, and it forces the listening attempt first.

**Tap-to-reveal, not a toggle.** Tapping her line slides a translation in
beneath it — dimmer, smaller. Tap again to dismiss. A persistent mode would
demand a decision mid-conversation, competing with the actual task at the worst
moment; tap-to-reveal has no mode state and costs nothing when unused.

**Transliteration is an onboarding question, not a level gate.** The need is
orthogonal to CEFR: our primary audience includes B2 listeners who never
learned to read, while textbook-trained A2s read Cyrillic fine. Ask once
(`learners.cyrillic_literate`), and treat it as a temporary accommodation with
an explicit path off it — reading is a stated non-goal (§4) and permanent
transliteration guarantees the alphabet is never learned. It occupies the same
reveal slot as the translation, so we never render three lines.

Transliteration also actively teaches error: Latin letters carry English
phonetic expectations, and vowel reduction and palatalization — the two largest
intelligibility factors in Russian — cannot be represented in it at all.

**Mic is open for the whole session. There is no press-to-speak.**
Push-to-talk would break backchanneling (§5.6) — nobody will press a button to
say *правда?* mid-story — and would remove barge-in and stop training
turn-taking, which is part of the skill. It also would not save the VAD work,
since users forget to press stop and silence-based auto-stop is needed anyway.

**Hold to think.** A button whose meaning is *wait, I'm still going*. While
held: turn detection is suspended and **STT is muted**. Release resumes normal
behaviour. It does not gate the learner's audio in the push-to-talk sense — it
buys them time, so it costs nothing when unused and exists precisely when
hesitation would otherwise get them cut off.

Muting STT while held gives a second use for free: someone speaks to the
learner in the room and they hold to keep it out of the transcript. Stray room
audio transcribed as learner speech is a worse failure than losing a few
muttered fragments.

**Teaching it: no tutorial, no modal.** Three mechanisms, in order of
importance:

1. **A live level meter responding to their voice from the first second.**
   This teaches "always on" wordlessly and faster than any copy. Its absence is
   why people tap buttons repeatedly in voice apps — they cannot tell whether
   they are being heard. Highest-leverage element on the screen, and it is not
   the button.
2. **Progressive disclosure.** The button is not visible at session start. It
   fades in the first time the learner goes quiet mid-utterance — discovered at
   the moment it solves a problem they are having. Learners who never hesitate
   never see it.
3. **One line on the Open screen, first session only:** *She'll hear you the
   whole time. Just talk.*

**Copy: "hold to think", never "pause".** Pause implies the session stops and
Валентина freezes. Holding the floor is what is actually happening. Hold rather
than tap-to-toggle, because a toggle can be forgotten and leave her waiting
indefinitely.

Валентина is the confirmation signal — hold and she waits visibly, in
character; release and she responds. That teaches the mechanic more
convincingly than a label, and it is free.

**Push-to-talk ships as a setting**, for noisy environments and for learners
who find an open mic stressful, with the tradeoff stated plainly: it disables
backchanneling and interruption.

**Debrief** — session length, `she understood you 11 times of 14`,
`you understood her without help 12 of 14`, three ranked patterns, one button
to tomorrow.

**Absent by design:** streak counter, accuracy score, percentage grade, badges.

### 6.3 Progress and motivation

**North-star metric: monthly comprehension benchmark.** The learner is
re-tested on a fresh piece of authentic Russian audio; we report comprehension
climbing over time. Ability, not attendance.

Secondary in-product signal: the **fading scaffold** is the progress bar.
Suggestion chips decay 4 → 3 → 2 → 1 → 0. Never announced.

### 6.4 Persona cast

Shipping **one** persona. The rest appear on a coverage map positioned on two
axes (transactional↔relational, casual↔formal), labelled **"unlocks at B1"**
— never "coming soon". Locked cards open a preview showing the register they
train and where they sit on the dials.

**V1 persona — Валентина Сергеевна Румянцева**, 78, Yaroslavl, retired
librarian, partner's grandmother. Warm, unhurried, tells stories, has a dacha
and a cat.

Chosen as the front door because: patience is in-character rather than a
concession; her storytelling delivers comprehensible input at low production
cost; adult female voices in her register are the best-supported thing in
Russian TTS; and the emotional premise is warm rather than fraught.

**Register asymmetry:** she uses ты (the learner is young), the learner uses
вы (she is elderly). Authentic, automatic, and teaches both registers at once.
The eventual invitation to switch to ты is a relationship milestone earned
over weeks.

**Boundary:** her stories stay domestic. The dacha, the garden, her late
husband, queuing for boots in 1979. She does not discuss politics with young
people.

### 6.5 The face

Deferred to v2, designed for now.

Stylised character in **Rive**, driven by a state machine — not photorealistic
video. Visemes from TTS phoneme timings, six expression states. Precedent:
Duolingo drives viseme lip sync through Rive state machines.

The face is a **scaffold that can be removed.** Audio-only is harder mode
(you lose visual articulation cues), which is the phone-call persona.

**Requirement now, not in v2:** the dialogue layer must emit
`{understood | partial | not_understood}` plus an affect tag from day one, so
the face drops in without a redesign.

---

## 7. Technical architecture

### 7.1 Client

**React Native + Expo**, on **EAS development builds from day one**. Expo Go
cannot run the native audio and WebRTC modules this needs. `expo-audio`, not
the deprecated `expo-av`.

**Scaffolded from the Obytes starter** (`create-obytes-app`). It ships the
custom dev client, TypeScript, Expo Router, Zustand + MMKV, Reanimated/Moti,
multi-environment config, and 10+ CI workflows. We use roughly 40% of it — the
value is tooling and CI, not the component library.

Added on top: `expo-audio`, `react-native-webrtc` (echo cancellation is
non-negotiable), and later the Rive runtime.

**The conversation screen sits outside the starter's data-fetching
conventions.** React Query and axios are a request/response idiom; our core
interaction is a persistent bidirectional stream with its own connection
manager. React Query is for everything else — profile, cast map, debrief
history.

Two things the starter does not solve:

- **iOS audio session configuration.** `playAndRecord` with the right options,
  or audio routes to the earpiece and recording silently kills playback. Test
  on hardware; the simulator misreports routing. Decide interruption behaviour
  (incoming call mid-session) at the same time.
- **Cyrillic font coverage.** Verify the chosen typeface renders `ёщъыэюя` at
  scaffold-chip sizes. Many display fonts are Latin-only or drop ё.

### 7.2 Pipeline: cascaded, not speech-to-speech

`VAD → streaming STT → LLM → stress annotation → sentence-chunked TTS`

Speech-to-speech APIs are faster and rejected anyway, because three product
features depend on data they hide:

- **STT confidence** — the entire "she doesn't understand you" mechanic.
- **Phoneme timings** — no TTS stage means no visemes.
- **Text before speech** — deliberate recasts, register control, and the
  repair dial need us to see and shape output before it is spoken.

### 7.3 Latency

**Target: 700–900ms time-to-first-audio.** Sub-250ms is the natural-conversation
threshold and is not achievable with a cascade. Bought back by:

- Streaming at every stage; never await a complete result.
- Sentence-boundary chunking into TTS.
- In-character filler ("ну…", "сейчас…") on end-of-turn detection, masking
  300–500ms.

**Six timestamps recorded per turn** (t0 turn-detect → t5 first audio). A
single duration figure cannot tell you which stage regressed.

### 7.4 Russian-specific: stress annotation

A pipeline stage that does not exist in other languages. Persona lines are
generated at runtime, so nothing is hand-checked, and a mis-stressed word in a
pronunciation-teaching app actively teaches the error.

Implementation: dictionary lookup for the high-frequency core, RUAccent-class
model for the tail, emitting `+` or U+0301 stress marks into the TTS input.
`ё` must be written explicitly — it is dropped in print but changes sound and
meaning.

### 7.5 Vendor selection

**Not yet decided.** Deferred deliberately: the deciding factors are empirical
and cannot be settled from pricing pages. Scheduled as a **Phase 1
deliverable**, before the pipeline is built around any one API.

**Hard requirements — these are decided and non-negotiable.**

STT must provide:

- **Word-level confidence and n-best alternatives.** Two features depend on
  this: the "she doesn't understand you" mechanic (§5.7) and detecting Russian
  case errors before ASR normalisation repairs them (§7.10). A top-1 transcript
  string is disqualifying.
- **Billing by audio duration, not connection time.** VAD gating (§9) saves
  ~3x on this line and saves nothing against connection-time billing. This rules
  out providers that meter the open session.

TTS must provide:

- **Explicit stress marker support** (`+` or U+0301). Without it, the stress
  annotation stage (§7.4) has nothing to write into and we teach mis-stressed
  Russian.
- **Phoneme timings or character-level alignment.** No timings, no visemes, and
  the Rive face (§6.5) has nothing to drive it.
- **Per-Unicode-codepoint billing.** Cyrillic is two bytes in UTF-8; byte-based
  billing silently doubles our largest cost line.

**What only a bake-off can settle.** Russian voice quality does not track price
the way English does, and STT accuracy on *accented learner* Russian is a
different question from accuracy on clean native speech. Vendor benchmarks
answer neither.

*TTS bake-off.* ~200 utterances drawn from real content distribution, loaded
with homographs, mobile-stress paradigms, numerals, ё-words and patronymics.
Native speakers **mark errors, not state preferences** — the output is a
countable stress-error rate per vendor. Second pass: play a subset to A2
learners and measure comprehension directly. The most natural voice may be the
worst teaching voice, because natural Russian carries the vowel reduction and
coarticulation that make native speech hard to parse.

*STT bake-off.* Score against recorded learner Russian — real utterances with
real errors, not clean native speech. **Source needed:** with no Wizard-of-Oz
phase, this audio must be collected deliberately. Options: record 5–6 target
learners reading and free-speaking from the golden-set utterances, or buy time
with italki tutors' students. An hour of audio is enough. Metric: what fraction
of case and aspect errors survive to the transcript rather than being silently
corrected.

**Provisional starting point, to be confirmed by the bake-off:**

- **STT — Deepgram.** Meets both hard requirements; bills per second of audio.
- **TTS — audition Azure Neural against ElevenLabs Turbo.** Azure for cost and
  mature Russian SSML stress control; ElevenLabs for expressiveness, which
  matters for a persona whose main mode is storytelling.

If Azure holds up on stress accuracy, it saves roughly $0.06/session — most of
the gap between the lean and premium configurations in §9.

**Ordering matters.** Priorities here are not the ones vendors benchmark:
phonetic correctness outranks naturalness, and intelligibility at the learner's
level outranks realism. Both invert the usual ranking.

### 7.6 Backend

**Node/TypeScript**, split into two services from day one:

- **App service** — auth, persistence, memory, debrief analysis.
- **Voice service** — the realtime pipeline only.

Latency is not a language problem here; the workload is I/O orchestration and
Node is good at it. The split exists so the voice service can be ported to
Python + Pipecat if turn detection becomes the blocker, without touching
anything else.

**Deployment: long-lived processes, never serverless.** Cold starts exceed the
entire latency budget and you cannot hold warm provider connections across
invocations.

### 7.7 Infrastructure and hosting

**Both services on Railway.** Long-lived containers, private networking between
services, no cross-provider egress.

**Region is the decision that matters, and it is not about the database.** Pin
the voice service to the region nearest the STT/TTS/LLM providers — US-East for
most of them. A wrong region costs 100ms+ against a 700–900ms budget, far more
than any database round trip. Choose that first; put everything else in the
same region.

**Postgres: Railway Postgres** for v1. One platform, one bill, adjacent to the
services.

The database is **not** in the latency path. The app service tolerates 20ms
queries invisibly, and the only query touching the conversation is
session-assembly (persona memories, learner structures, scenario selection),
which runs once before any audio streams. **The voice service holds zero
database dependencies mid-conversation** — it receives its context at session
start and streams. A voice service querying Postgres between turns is a bug.

So the constraint on the database is operational, not performance: managed
backups, point-in-time recovery, connection pooling.

Alternatives, if Railway's backup story proves thin:

- **Neon** — branching is genuinely useful here (a branch per eval run tests
  scenario selection and debrief writes against realistic data without
  polluting production). Scale-to-zero suits lumpy early traffic.
- **Supabase** — only if we want its auth and storage too. We already have auth
  in the app service, so this means adopting a platform for one component.

**Verify the backup story before Phase 3, not after.** `sessions` and `turns`
are replaceable. `persona_memories` is not — losing it resets every user's
relationship to zero, which is the one failure this product cannot absorb.
PITR is a requirement, not a nice-to-have.

**Required regardless of provider:**

- **Connection pooler** (PgBouncer, or Neon's built-in). Long-lived Node
  processes plus per-request connections exhaust Postgres connections faster
  than expected.
- **Retention policy on `sessions` and `turns` from day one.** Turn-level rows
  carrying `timings` JSONB are the highest-volume table by an order of
  magnitude. Set the policy before the data exists.

### 7.8 Runtime validation

**Zod at the boundaries TypeScript cannot reach.** Three places only:

1. **Persona LLM output** — the least trustworthy source in the system. It will
   drop keys, invent enum values, wrap JSON in markdown fences, and return prose
   when it gets confused deep in a long context. `JSON.parse` returns `any`; the
   compiler cannot help here.
2. **Client/server API boundary.**
3. **Environment config at boot.**

**Not** between the app and its own database — Postgres enforces those
constraints and the ORM generates the types. That layer is duplication.

One schema does three jobs: JSON Schema to constrain structured output, runtime
validation of what returns, and the inferred TypeScript type. The eval harness
imports the same schema, so a prompt change that breaks the contract fails
identically in CI and in production. Today the shape is defined three times —
prose in the prompt, hand-rolled checks in `assertions.ts`, and a separate
interface — and three definitions drift.

**Streaming caveat.** Zod validates complete objects, but §6.5 requires
`comprehension` and `affect` to be read mid-stream so the face reacts before
she speaks. Pattern: parse incrementally for the early fields, then validate the
whole object once the stream closes, before anything reaches TTS.

**Failure path is a Phase 1 requirement.** When validation fails mid-conversation
we cannot surface an error to someone mid-sentence. Fall back to in-character
filler («простите, что-то я задумалась»), log the raw output, continue.

### 7.9 Turn detection

**The hold-to-think button (§6.2) is a hard override.** While held, turn
detection is suspended entirely and no audio is sent to STT. This is a
deterministic escape hatch from the model's judgement, and it extends the VAD
gating saving in §9 slightly.

Edge cases to specify before Phase 2:

- **Auto-release timeout.** A learner who holds and puts the phone down must
  not hang the session. Release after ~45s and resume normal behaviour.
- **Held during her turn.** The button means "hold the floor", which only
  applies when the learner has it. Holding while Валентина speaks should not
  interrupt her — decide whether it queues an intent to speak or does nothing.
- **Held at session start**, before the learner has spoken at all.

**Instrument the teaching, not just the feature.** Track first-use session and
holds per session. If almost nobody holds it, the button is either
undiscoverable or unnecessary — false interruption rate distinguishes them.
High interruptions with low hold usage means they never found it.

The hardest UX problem in the product. A B1 learner pauses mid-sentence
hunting for a word, repeatedly. Silence-threshold VAD will interrupt them
constantly, and being cut off is the most demoralising thing that can happen
to a nervous speaker.

**Timeout is a per-level parameter**, not a constant. Patience is the repair
dial expressed in milliseconds.

Pipecat's LLM-based SmartTurnDetection is materially better here than
threshold VAD and is the main reason the Python option stays open.

### 7.10 Known traps

- **Echo cancellation** — her voice re-entering the mic and being transcribed
  as the learner. WebRTC gives AEC free; raw PCM capture does not.
- **Barge-in** — interruption must stop playback, cancel in-flight TTS, cancel
  LLM generation, and reset stream state. Missing any step means she talks
  over the user or finishes an abandoned thought.
- **ASR normalisation hides case errors.** Recognition language models repair
  learner inflection errors before the analyser sees them. Mitigate with
  word-level confidence and n-best alternatives; prefer targets that survive
  (aspect, motion verbs).

---

## 8. Data model

Full DDL in `schema.sql`. The load-bearing decisions:

**`learner_structures`** is the engine. One row per learner per structure,
tracking exposures, attempts, successes, avoidances, and a stability value.
Scenario selection reads it; the debrief writes it. Everything else is
plumbing around this table.

**`persona_memories`** drives the callback mechanic and is the most sensitive
table in the system. Never logged, never a trace attribute.

**`observations` vs `debrief_items`** are separate: we keep everything the
analyser noticed even though only three are shown. That is the training data
for tuning the ranking function.

**`sessions`** stores the calibration actually used, so difficulty settings
can be correlated against completion and abandonment.

**Additions from later discussion, not yet in the DDL:**

- `persona_world_state` — her ongoing life (the cat is ill, the neighbour is
  difficult). Cheap renewable conversation material. Add the table now even if
  unpopulated; migrating later is worse.
- `sessions.scenario_id` plus sessions-since-last-use, to measure repetition
  exposure against abandonment.
- Register split into `persona_register` and `learner_register` — they differ
  for this persona and a single field cannot express it.
- `turns.revealed` (boolean) — drives the reveal-rate signal in §11 and the
  `understood her without help` figure on the debrief.
- `learners.cyrillic_literate` (from onboarding) and `learners.translit_enabled`
  — separate fields, so transliteration can be retired deliberately rather than
  left on indefinitely.

---

## 9. Unit economics

Full model in `voice_cost_model.xlsx`.

**Per 8-minute session: $0.047 (lean) to $0.228 (premium).** Nearly 5x from
configuration alone, with identical user-facing behaviour.

Three lines matter — TTS (largest), STT, persona LLM. Scaffold generation,
turn detection, and stress annotation are together under a cent.

**Levers, by size:**

1. **TTS provider** — roughly $15/1M chars to $66/1M chars across vendors.
2. **Prompt caching** — 14x on the persona LLM line. Highest-return hour of
   work in the build.
3. **VAD gating on STT** — bills 2.4 minutes instead of 8. Requires a provider
   billing *audio duration*, not connection time.
4. **Turn length** — the "one or two sentences" rule is a margin control.

**Requirement: a daily session cap.** A power user at two sessions a day on
the premium stack costs $13.67/month against a $12 subscription. Defensible
honestly: distributed practice beats massed practice, so "come back tomorrow"
is both the pedagogically correct answer and the one that bounds COGS.

**Verify before signing:** that your TTS vendor bills per Unicode codepoint,
not per UTF-8 byte. Cyrillic is two bytes; byte billing silently doubles your
largest line.

**Story mode costs more** — she speaks a higher share of the session. Model it
separately rather than assuming the 14-turn average.

---

## 10. Quality assurance

Harness in `eval/`. Three layers, cheapest first.

**Golden set** — 22 frozen learner turns with planted errors. **Append only,
never edit.** The entire value is diffing every model swap and prompt change
against an identical set.

**Mechanical assertions** — no model call. Schema, turn length, register
consistency, ё spelling, no English leakage, no praise, no grammar talk,
recast fires when and only when it should. Catches instruction decay at turn
40, which manual testing never finds.

**Five negative controls** carry disproportionate weight. `no_false_recast` is
the single most important assertion: a persona that invents grammar problems
destroys the fiction, and aggregate scores hide it completely.

**Judge** — frontier model, three dimensions only (grammaticality, recast
quality, register/character). Native speakers spot-check 20% whenever the
rubric changes.

**Native-speaker cadence is periodic, not continuous** — the owner is fluent
and catches calques by feel (§13). Review on model swaps, rubric changes, and
quarterly. Insurance against fossilised patterns the owner shares with the
model, not the primary instrument.

**Gates:** 0% mechanical errors · 0% false recasts · grammaticality mean ≥ 4.3
with no case below 3 · recast quality ≥ 4.0 · register/character ≥ 4.0 · drift
cases pass 100%.

Expected failure mode of cheaper models: **grammaticality first** (English
calques that read fluent to a non-native and wrong to a native), register and
character second. Schema compliance rarely fails, which is why it is a
misleading thing to test on.

---

## 11. Observability

Two systems, deliberately separate.

**Health** — up, fast, within budget. Alerts and pages.
**Quality** — is she any good today. Sampled, reviewed weekly, **never pages.**

Quality degrades silently: a provider ships an update, and nothing errors.

**Highest-value component: point the eval harness at production.** Five golden
cases against the live endpoint hourly. ~$0.20/day, no new infrastructure,
catches provider-side degradation within the hour. Canary assertion failures
*do* page, because they are deterministic.

**Derived quality metrics, no labelling required:**

- **False interruption rate** — learner resumes within ~500ms of her starting.
  Direct measure of turn-detection quality. Track per level.
- **Reveal rate** — how often the learner taps for a translation. The most
  granular comprehension-load signal we have, needs no labelling, and feeds the
  dial directly. Eight reveals in fourteen turns means the load is set too high.
- **Abandonment turn** — where people quit, crossed against session
  calibration. Tells you which dial setting loses people.
- **Repeat-request rate** — free proxy for comprehension load being too high.
  Coarser than reveal rate; keep both, they disagree usefully.

**Cost, live.** Per session at close, rolling 30-day per user, alert when a
user crosses their subscription price. Vendor invoices arrive four weeks late.

**Trace shape:** one trace per session, span per turn, child spans per stage.
Alert on P95, never mean — one 3-second turn ruins a session without moving
the average.

---

## 12. Safety and privacy

### 12.1 Out-of-character escape hatch

**Engineering requirement, ships before launch.** Валентина is warm, remembers
the learner's life, and asks personal questions. Some users will disclose
serious distress. She must not handle that in character, and the base model
will try. Separate detection path, separate response mode.

The same layer handles attempts to sexualise the persona, which happens with
every character product without exception.

### 12.2 Data

- **Voice recordings may trigger biometric privacy law** in some US states —
  Illinois BIPA is the usual trap. Verify before storing audio, not after.
- **Sample audio, don't capture everything.** 2–5% of sessions for replay
  debugging, explicit consent separate from ToS, much shorter retention than
  metadata.
- `persona_memories` never appears in a log line or trace attribute.
- Deletion path must clear memories, audio, and transcripts together.

### 12.3 Accessibility

A text input path preserving the persona, covering hearing-impaired users and
anyone who cannot speak aloud where they are. Not yet designed.

---

## 13. Owner dogfooding

The owner is a **fluent but lapsed Russian speaker** — strong comprehension,
degraded production, makes errors. That is close to the target user profile,
which makes daily self-use a materially better instrument than developer
testing usually is.

**Practice: use the app daily to actually recover the language**, from the
first working slice onward. Not test sessions — real ones. The product's
failures then cost something personally, which is what makes the signal honest.

**What this covers well:**

- Latency feel, turn detection, barge-in, echo, audio routing. Only a human in
  the loop can judge whether 800ms feels alive.
- **Grammaticality**, more than expected. Recognition and production are
  different skills — a fluent speaker hears that a Russian would not say
  something well before they can explain why. English calques are catchable.
- Whether the hold-to-think button and tap-to-reveal are fiddly in practice.
- **The repetition wall (risk 3).** Thirty consecutive days answers whether it
  arrives at week three. Nothing else surfaces this before launch.
- **Partial signal on the premise (risk 1).** Opening it because you want to
  rather than to debug is real, if not conclusive.

**What it cannot cover:**

- **The nervous-learner state.** Unreproducible once you have built the thing,
  and most of §6 is designed for it.
- **Unconscious accommodation.** The owner steers toward topics she handles
  well without noticing; real users blunder into the edges.
- **Fossilised patterns.** Where the owner's own habitual errors overlap with
  model calques, both pass unnoticed.

**Consequences for QA:** native-speaker review drops from necessary to
insurance — see §10. It does not drop to zero.

**Consequences for scope:** see risk 9.

---

## 14. Risks and open questions

| # | Risk | Mitigation | Status |
|---|---|---|---|
| 1 | Premise unvalidated — will adults voice-chat with an AI grandmother? | **Accepted, unvalidated.** Pre-build validation skipped by decision. Partial signal from owner dogfooding (§13). Otherwise validated in-market: instrument abandonment turn and session-2 return rate from first release, and treat weak session-2 return as the premise failing rather than a retention problem to optimise. | Accepted risk |
| 2 | Session one has no memory, and it is the highest-stakes session in the funnel | Seed 1–2 memories during onboarding | Open |
| 3 | Repetition wall — 20 scenarios repeat inside 3 weeks at daily use | Memory-driven population; persona world-state; complication permutation. Repetition is perceived in the *opening*, so invest there first. **Owner dogfooding surfaces this pre-launch** — 30 consecutive days is the test. | Deferred, instrumented |
| 4 | Turn detection cuts off hesitant learners | Per-level timeout; false-interruption metric; Pipecat option held open | Open |
| 5 | Russian TTS mis-stresses generated text | Stress annotation stage | Designed |
| 6 | Onboarding/placement undesigned | Make session zero itself the placement; never announce assessment | Open |
| 7 | Scope realism — voice pipeline, RN app, Rive, content, evals, observability | Honest timeline before committing | Open |
| 8 | Smaller market than Spanish | Accepted trade for sharper positioning and weaker competition | Accepted |
| 9 | Owner's own gaps become the product's priorities — structures taxonomy drifts toward what the owner needs rather than what a typical lapsed speaker needs | Audit §5.8 priority order against external reference (CEFR descriptors, ТРКИ syllabus, a teacher's view) rather than felt difficulty | Open |

---

## 15. Phasing

**Phase 1 — the slice (2–3 weeks).** No UI. Hardcoded persona, mic in, audio
out, six timestamps logged per stage. Backend proxy first — API keys never
ship in the bundle. This is where the project lives or dies.

**Vendor bake-off runs in this phase** (§7.5), before the pipeline hardens
around any one API. Build against the hard requirements, not a chosen vendor,
so swapping stays cheap.

**Daily owner dogfooding starts the moment the slice works** (§13), and
continues through every later phase. The repetition-wall clock starts here.

**Phase 2 — the loop (4–6 weeks).** Three screens, memory, debrief, scenario
selection. Eval harness in CI. Session cap enforced.

**Phase 3 — production readiness.** Observability, canary, cost tracking,
safety layer, onboarding, privacy consent flows.

**Phase 4 — v2 candidates.** Rive face, second persona, text path,
comprehension benchmark, heritage-speaker persona variant.

---

## Appendix — companion artefacts

| File | Contents |
|---|---|
| `schema.sql` | Postgres DDL |
| `voice_cost_model.xlsx` | Unit economics, adjustable assumptions |
| `eval/` | Golden set, assertions, judge rubric, runner |
| `eval/identity-layer.txt` | Persona Layer 1, production verbatim |
|  `persona_elena_prompt.md` | Persona 2 prompt (Елена Николаевна), Russian |
