# Handoff: Russian conversation practice — daily loop

## Overview

Five screens covering the core daily loop of a Russian speaking-practice app (PRD §6.1):
**Open → Converse → Debrief → Tomorrow**, plus two screens that sit outside the loop
(**Address book** and **Settings**).

The product is a voice conversation with a persistent AI persona. The design's job is to
make a nervous learner talk. Three commitments drive almost every decision here, and they
should survive implementation:

1. **The mic is open for the whole session.** There is no press-to-speak (PRD §6.2). The
   level meter — not a button — is the highest-leverage element on the Converse screen.
2. **Nothing is scored.** No streak, no accuracy percentage, no badges, no XP. Progression
   is expressed only through fading scaffolds and position in the address book.
3. **Correction is invisible in-flow.** Recasts happen inside her normal reactions; the
   debrief shows three ranked patterns, never a list of every slip.

Target platform: **iOS (React Native + Expo)**, per PRD §7.1. The mock is rendered at
iPhone size (402 × 874 logical px) inside a device frame.

## About the design files

The files in this bundle are **design references created in HTML** — a prototype showing
intended look and behaviour, not production code to copy. `Speaking Practice - core loop.dc.html`
is a self-contained page that opens in any browser.

The task is to **recreate these designs in the target codebase's existing environment**
(React Native + Expo, per the PRD) using its established patterns and libraries. Do not port
the HTML. Specifically:

- The HTML uses a custom template runtime (`support.js`) that is irrelevant to the target app.
- `ios-frame.jsx` is a **presentation device bezel for the mock only**. It has no counterpart
  in the real app — the real app *is* the phone. Ignore it entirely.
- `image-slot.js` renders portrait placeholders. In the real app these are persona portrait
  images (v1) and later a Rive character (PRD §6.5).
- The left rail (loop navigation, pipeline toggle) and the right column (build notes) in the
  HTML are **scaffolding for reviewing the design**. They are not part of the app. Only the
  content inside the phone frame ships.

## Fidelity

**High fidelity.** Colours, typography, spacing, and interaction states are final and should
be matched. Two caveats:

- **Typography substitution is expected.** The mock uses PT Serif and IBM Plex Mono via
  Google Fonts. In React Native, bundle equivalents with `expo-font`. **Verify Cyrillic
  coverage before committing to a face** (PRD §7.1) — the design leans on stress marks
  (U+0301 combining acute) rendering correctly at 20px and on `ё` never being dropped. Test
  `ёщъыэюя` at scaffold-chip size (15px) specifically.
- **The level meter animation is indicative.** In the mock the bars run on a CSS keyframe
  loop. In the real app they must be driven by **actual mic input amplitude** — that is the
  entire point of the element (see Interactions).

## Screens / views

### 1. Open

**Purpose:** Start today's session with zero decisions. She opens, not the learner.

**Layout:** Full-bleed `#FBF6EC`. Padding `66px 22px 44px`. Column flex.

| Element | Spec |
|---|---|
| Header row | Space-between, baseline-aligned. Left: date + duration, `IBM Plex Mono 500 10px`, letterspacing `.12em`, uppercase, `rgba(35,31,24,.42)`. Right: two links in a 14px-gap row — "Who else →" (`13px` system, `#A0543A`) and "Settings" (`13px` system, `rgba(35,31,24,.42)`) |
| Persona card | `margin-top:26px`. White, `1px solid rgba(35,31,24,.1)`, radius `20px`, `box-shadow:0 1px 2px rgba(35,31,24,.05)`, `overflow:hidden` |
| — portrait area | Height `196px`. Placeholder is a 45° hatch: `repeating-linear-gradient(135deg,#EFE7D9 0 7px,#E6DCCA 7px 14px)`. **Replace with the persona portrait image.** |
| — card body | Padding `20px 20px 22px`. Name `PT Serif 400 21px`. Meta line `IBM Plex Mono 400 12px`, `rgba(35,31,24,.5)`, `margin-top:6px` |
| — callback line | Separated by `1px solid rgba(35,31,24,.09)` at `margin-top:18px; padding-top:18px`. `PT Serif 400 19px/1.45`. This is the persona's opening line, read from `persona_memories` |
| Footer block | `margin-top:auto`, `padding-top:26px` |
| — scenario line | `IBM Plex Mono 400 12px/1.5`, `rgba(35,31,24,.5)` |
| — open-mic line | `PT Serif 400 15px/1.45`, `rgba(35,31,24,.62)`. Copy: *"She'll hear you the whole time. Just talk."* **First session only** (PRD §6.2) |
| — primary CTA | `#A0543A` bg, `#FBF6EC` text, radius `16px`, padding `19px`, centred `PT Serif 400 18px`, `box-shadow:0 2px 0 rgba(35,31,24,.14)`. Hover `#8E4831` |

**Copy (EN):** "Tuesday · 8 min" / "Who else →" / "Settings" / "Валентина Сергеевна" /
"78 · Yaroslavl · retired librarian" / «Ну наконе́ц-то ты позвони́л. Ты говори́л, что соба́ка
пропа́ла — нашла́сь?» / "Tea on the porch · she will ask about the dog" / "She'll hear you the
whole time. Just talk." / "Pick up"

Note: her callback line stays in Russian in both interface languages. Always.

---

### 2. Converse

**Purpose:** The conversation itself. Continuous, open-mic, no press-to-speak.

**Layout:** Column flex, `#FBF6EC`. Three regions: fixed header, scrolling transcript
(`flex:1; overflow:auto`), fixed control block.

**Header** — padding `60px 22px 12px`. Back chevron (`#A0543A`), persona name
(`PT Serif 400 13px`, `rgba(35,31,24,.6)`), elapsed clock (`IBM Plex Mono 500 10px`,
`rgba(35,31,24,.4)`).

**Transcript** — padding `12px 22px 8px`, `gap:18px`, auto-scrolls to newest turn.

| Turn type | Spec |
|---|---|
| Her turn | Left-aligned, full width. `PT Serif 400 20px/1.5`, `#231F18`. Carries `text-decoration: underline dotted rgba(160,84,58,0.4)`, thickness `1px`, offset `5px` — the tap-to-reveal affordance. Cyrillic **with stress marks** |
| Her turn, revealed | Translation appended below at `margin-top:8px`. System font `400 14px/1.45`, `rgba(35,31,24,.6)` (contrast-checked ≈4.6:1) |
| Learner turn | Right-aligned, `max-width:78%`. `PT Serif 400 16px/1.45`, `rgba(35,31,24,.52)` — deliberately recessive; her language is the content |
| Thinking filler | «ну…» at `PT Serif 400 20px/1.5`, `rgba(35,31,24,.35)`, `animation: blink 1.1s ease-in-out infinite` (opacity .25 → .9) |

**Control block** — padding `14px 22px 40px`, three stacked parts:

1. **Reveal hint** — `IBM Plex Mono 500 11px/1.3`, letterspacing `.05em`, `rgba(35,31,24,.55)`,
   centred, `margin-bottom:11px`. Copy: "Tap her line for a translation"
2. **Suggestion chips** — wrapping centred flex row, `gap:8px`, `min-height:34px`. Each chip:
   `PT Serif 400 15px`, padding `9px 14px`, radius `100px`, white bg,
   `1px solid rgba(35,31,24,.18)`. **Opacity ladder `[1, 0.6, 0.36, 0.2]`** by index — the
   decaying-contrast scaffold. Hidden while she talks and while hold-to-think is engaged
3. **Level meter** (see below), then the **hold-to-think** row

**Level meter** — the most important element on this screen.

- Container: `46px` tall pill, padding `0 22px`, radius `100px`,
  bg `rgba(160,84,58,0.08)`, border `1px solid rgba(160,84,58,0.2)`
- 10 bars, `3px` wide, `4px` gap, radius `2px`, heights derived from amplitude
  (mock uses the ratio set `[.42,.68,1,.84,.55,.9,.6,.34,.72,.46]` × 34px)
- Idle colour `rgba(160,84,58,0.5)`; while the learner is speaking `#A0543A`
- **Held state:** all bars collapse to ~16% height, colour `rgba(35,31,24,0.18)`, animation off,
  container bg `rgba(35,31,24,0.05)` / border `rgba(35,31,24,0.12)`
- State label beneath, `IBM Plex Mono 500 11px/1.3`, letterspacing `.05em`:
  - idle → "she can hear you" (`rgba(35,31,24,0.55)`)
  - learner speaking → "she heard that"
  - her turn → "she's talking"
  - held → "she's waiting — take your time" (`#A0543A`)

> In the mock the meter is tappable to simulate a turn (with a "· tap to take a turn"
> suffix on the idle label). **Both the tap handler and that suffix are prototype-only.**
> In the real app the meter is a pure output driven by mic amplitude.

**Hold to think** — `flex:1` centred button between two `62px` spacers (left empty, right
holds the "End" link). Padding `15px 16px`, radius `14px`, `PT Serif 400 16px`,
`user-select:none`, `touch-action:none`.

- Rest: white bg, `1px solid rgba(35,31,24,0.2)`, text `rgba(35,31,24,0.75)`,
  `box-shadow:0 1px 2px rgba(35,31,24,0.06)`
- Held: `#A0543A` bg, `#FBF6EC` text, matching border, no shadow
- Entrance: `fadein .32s ease both` (opacity 0→1, translateY 6px→0)

---

### 3. Debrief

**Purpose:** Three ranked patterns and two ability figures. No grade.

**Layout:** `#FBF6EC`, padding `66px 22px 44px`, scrollable column.

| Element | Spec |
|---|---|
| Eyebrow | "After the conversation" — `IBM Plex Mono 500 10px`, `.12em`, uppercase, `rgba(35,31,24,.42)` |
| Headline | `PT Serif 400 27px/1.28`, `margin-top:16px`. "She understood you **11 times of 14**." — the count in `#A0543A` |
| Second figure | `PT Serif 400 19px/1.35`, `rgba(35,31,24,.62)`, `margin-top:10px`. "You understood her without help N of 14." **N is `14 − count(turns.revealed)`** — derived, never self-reported |
| Session meta | `IBM Plex Mono 400 12px/1.5`, `rgba(35,31,24,.5)` |
| Pattern cards | `margin-top:26px`, `gap:10px`. White, `1px solid rgba(35,31,24,.1)`, radius `16px`, padding `16px 17px`. Index `IBM Plex Mono 500 10px` `rgba(35,31,24,.4)`; title `PT Serif 400 17px/1.4`; body system `400 13px/1.5` `rgba(35,31,24,.55)`; optional tag `IBM Plex Mono 500 10px` `#A0543A` |
| Avoidance panel | `1px dashed rgba(160,84,58,.45)`, bg `rgba(160,84,58,.05)`, radius `16px`, padding `17px`. Heading `#A0543A` mono caps; body `PT Serif 400 16px/1.45` |
| CTA | Same as Open's primary button. "Tomorrow" |

**Pattern titles keep their Russian target forms in both interface languages.** Only the
explanation translates. Example: title `Мы иска́ли, not мы и́щем.` → in RU mode
`Мы иска́ли, а не мы и́щем.`

---

### 4. Tomorrow

**Purpose:** Show the next session is built from what was missed. Close the loop.

**Layout:** Background steps to `#F3ECDE` — the one background change in the product, marking
"session over". Padding `66px 22px 44px`.

Eyebrow ("Wednesday") → title `PT Serif 400 27px/1.3` → intro system `400 16px/1.5`
`rgba(35,31,24,.6)` → complication ladder card → homework note → close button
(`1px solid rgba(35,31,24,.22)`, transparent bg, `margin-top:auto`).

**Complication ladder** (PRD §5.3 — same scene, three demand levels): white card, radius `18px`,
padding `19px`. Each row `9px 0`, `gap:12px`. Current step: `11px` filled `#A0543A` dot,
label `#231F18`. Other steps: `8px` circle, `1.5px solid rgba(35,31,24,.28)`, transparent fill,
label `rgba(35,31,24,.42)`. All labels `PT Serif 400 16px/1.35`.

---

### 5. Address book (outside the loop)

**Purpose:** Show the cast and where the learner is in it. **This is the only progression
surface in the product** (PRD §6.4).

Deliberately **not** a chart or a coverage map. It is an address book with a bookmark ribbon.

**Layout:** header row (back chevron / title / spacer) → title block → scrolling entry list →
footer hint.

**Ribbon + entry rows:** each row is `display:flex; gap:12px; align-items:stretch`. Left column
is `14px` wide, centred, containing `railTop` (flex:1, 2px wide) → node → `railBottom`
(flex:1, 2px wide).

- Ribbon segments are `#A0543A` at and above the reached entry, `rgba(35,31,24,0.14)` below.
  `railTop` of the first entry has `min-height:10px` so the ribbon visibly starts at the top of
  the list; `railBottom` of the last entry is transparent.
- Node: reached `13px` filled `#A0543A`; next `9px` with `2px dashed rgba(160,84,58,0.6)`;
  sealed `9px` with `1.5px solid rgba(35,31,24,0.2)`. Non-filled nodes have `#FBF6EC` fill.

**Entry card:** `flex:1`, white (opaque in all states — do not tint sealed cards; de-emphasis
lives in the name, disc, and dials), radius `18px`. Border: next = `1px dashed rgba(160,84,58,0.5)`,
otherwise `1px solid rgba(35,31,24,0.11)`. Reached entries carry `0 2px 8px rgba(35,31,24,0.09)`.
Padding `14px 16px` collapsed / `17px 18px 18px` expanded.

Collapsed row: disc + name block.

- **Disc** — reached `52px`, others `42px`. Radius `100px`. Reached: `2px solid #A0543A`,
  hatch `repeating-linear-gradient(135deg,#EFE7D9 0 6px,#E4D9C4 6px 12px)`, initials
  `PT Serif 400 18px` `rgba(160,84,58,0.9)`. Next: `1.5px dashed rgba(160,84,58,0.55)`.
  Sealed: `1.5px solid rgba(35,31,24,0.16)`, faint hatch, initials `15px` `rgba(35,31,24,0.38)`
- **Name** — `PT Serif 400 20px` reached / `17px` others
- **Role line** — `PT Serif italic 400 13px/1.35`, `rgba(35,31,24,0.62)` in all states
  (contrast floor). e.g. "Grandmother-in-law · retired librarian"
- **Gate line** — `IBM Plex Mono 500 9px/1.3`, `.08em`, uppercase. `#A0543A` for reached/next,
  `rgba(35,31,24,0.38)` sealed. Copy: "you talk to her daily" / "next up" / "sealed until B1".
  **Never "coming soon"** — the gate is ability, not a release date
- **Level chip** — right-aligned `IBM Plex Mono 500 9px` `rgba(35,31,24,.4)`

Expanded body (`margin-top:15px; padding-top:15px; border-top:1px solid rgba(35,31,24,.08)`):

1. Portrait slot `72 × 88`, radius `12px` + register description (system `400 14px/1.5`,
   `rgba(35,31,24,.62)`), `gap:14px`
2. **Two register meters** — a `5px` track `rgba(35,31,24,.09)` with an `11px` dot positioned
   by percentage; axis labels beneath in mono caps `9px` `rgba(35,31,24,.4)`.
   Axes: formal ↔ casual, transactional ↔ relational
3. **Three difficulty dials** (PRD §5.2) — label column `96px` mono `9px`, then a `4px` track
   with `#A0543A` fill (or `rgba(160,84,58,0.42)` when sealed). Labels: comprehension,
   production, repair
4. Requirement line (next entry only) — `IBM Plex Mono 500 10px/1.5` `#A0543A`
5. Primary button (reached entry only) — "Talk to Валентина"

Only one entry is expanded at a time; the reached entry is expanded by default.

---

### 6. Settings

**Purpose:** Interface-language switch and practice preferences.

Background `#F3ECDE`. Section headings in mono caps `10px` `rgba(35,31,24,.42)`.

- **Interface language** — two-up segmented row, `gap:9px`. Selected: `#A0543A` bg,
  `#FBF6EC` text. Unselected: white, `1px solid rgba(35,31,24,0.16)`,
  `rgba(35,31,24,0.7)` text. Both radius `13px`, padding `13px 10px`, `PT Serif 400 17px`
- **Note beneath** — system `400 13px/1.6` `rgba(35,31,24,.55)`:
  *"Only the app's own text changes. The conversation itself is always in Russian — that is
  the product."*
- **Practice list** — white card radius `16px`; rows padding `16px 17px` with
  `1px solid rgba(35,31,24,.07)` dividers, label `PT Serif 400 16px`, chevron
  `rgba(35,31,24,.3)`. Rows: "Microphone · always open" (the push-to-talk escape hatch,
  PRD §6.2), "Session length · 8 min", "Daily reminder · 19:30"

## Interactions & behaviour

### Open mic and turn-taking (the core decision)

There is **no press-to-speak**. The mic is live for the whole session. Consequences to
implement:

- **Barge-in must work.** Interruption stops playback, cancels in-flight TTS, cancels LLM
  generation, resets stream state (PRD §7.9). Missing any step means she talks over the user.
- **Echo cancellation is non-negotiable** — use `react-native-webrtc`, not raw PCM capture.
- **Transcript appears only after she finishes speaking, never during** (PRD §6.2). Text on
  screen while she talks converts a listening exercise into a reading one.

### Hold to think

| Aspect | Behaviour |
|---|---|
| Trigger | `pointerdown` / `pressIn` |
| Release | `pointerup`, `pointerleave`, **and `pointercancel`** — on iOS a scroll or system gesture during a hold fires cancel with no pointerup, which would otherwise latch the held state |
| While held | Turn detection suspended entirely; **STT muted** (keeps stray room audio out of the transcript); chips hidden; meter collapses; label switches to "she's waiting — take your time" |
| Auto-release | ~45s, so a learner who puts the phone down cannot hang the session |
| Discovery | **Not rendered at session start.** Fades in the first time the learner goes quiet mid-utterance. In the mock this is approximated by "after the learner's first turn". No tutorial, no modal |
| Copy | "hold to think" — **never "pause"**. Pause implies the session stops and she freezes |
| Undecided | What holding during *her* turn should do — queue an intent to speak, or nothing (PRD §7.8). Not designed |

Instrument first-use session and holds-per-session. High false-interruption rate with low hold
usage means the button is undiscoverable, not unnecessary.

### Tap to reveal

Tapping her line toggles a translation beneath it. **No mode state** — not a toggle, not a
setting. Sets `turns.revealed`, which feeds both the debrief's second figure and the reveal-rate
metric (PRD §11). Transliteration, when enabled, occupies the same slot — never render three lines.

### Turn cadence (mock timing)

Learner turn → 1150ms "listening" → 1100ms "thinking" (filler «ну…» visible) → her reply.
Real target is **700–900ms time-to-first-audio** (PRD §7.3), with in-character filler masking
300–500ms of it.

### Scripted beats worth preserving in the demo data

The seven-turn sample script is not arbitrary — each turn demonstrates a mechanic:

| Turn | Demonstrates |
|---|---|
| 3 | An **invisible recast**: `иска́ем → иска́ли` inside a normal reaction. Not flagged, not repeated. Max one per turn |
| 4→5 | **STT confidence 0.61** below the 0.70 floor → she asks again *in character* ("Что-что? Погро́мче"). Not scripted failure, and nothing is scored |
| 6 | Unprompted **self-repair** at 0.93 confidence |
| 7 | **Story installment** — the backchanneling unlock (PRD §5.6) |

### Pipeline overlay (review affordance)

The left-rail toggle annotates each turn with STT confidence, the `t0→t5` figure, and the
`{understood | partial | not_understood}` + affect tag. This exists to make the PRD's
day-one instrumentation requirement (§6.5) visible to reviewers. **Not a shipping feature** —
but the data it shows must be emitted from day one so the Rive face drops in without a redesign.

## State management

Mock state, mapping to real app state:

| Key | Type | Notes |
|---|---|---|
| `screen` | enum | Prototype navigation only — use the app's router |
| `n` | int | Turn index into the transcript |
| `listening` | bool | Learner speaking (from VAD) |
| `thinking` | bool | Generation in flight; drives the filler |
| `holding` | bool | Hold-to-think engaged |
| `holdSeen` | bool | Whether the button has ever been revealed. **Persist per learner**, not per session |
| `revealed` | `{turnIndex: bool}` | Backs `turns.revealed` |
| `sel` | int·null | Expanded address-book entry |
| `lang` | `'en'·'ru'` | Interface language. **Persist on the user row** (`ui_language`), not device settings — it follows the account and the analyser reads it for error-explanation copy |

Data the real screens need: session assembly (persona memories, learner structures, scenario
selection) runs **once before any audio streams**. The voice service holds zero database
dependencies mid-conversation (PRD §7.6) — a voice service querying Postgres between turns is
a bug.

## Design tokens

**Colour**

| Token | Value | Use |
|---|---|---|
| Paper | `#FBF6EC` | Primary screen background |
| Paper, stepped | `#F3ECDE` | Tomorrow + Settings — marks "session over" |
| Card | `#FFFFFF` | All cards, chips, discs |
| Ink | `#231F18` | Primary text |
| Ink 62 / 55 / 45 / 42 / 38 | `rgba(35,31,24,.62 / .55 / .45 / .42 / .38)` | Secondary → tertiary text. **`.62` is the floor for anything a learner must read** |
| Hairline | `rgba(35,31,24,.1)` | Card borders |
| Divider | `rgba(35,31,24,.07–.09)` | Internal rules |
| Accent | `#A0543A` | Primary actions, ribbon, dials, links |
| Accent, pressed | `#8E4831` | Hover / held |
| Accent tint | `rgba(160,84,58,.05–.2)` | Meter fill, dashed panels |
| Portrait hatch | `#EFE7D9 / #E4D9C4` | Placeholder texture — replace with real art |

Two backgrounds total. Do not add a third.

**Typography**

| Role | Spec |
|---|---|
| Her voice | PT Serif 400, 20px/1.5 |
| Screen title | PT Serif 400, 27px/1.28 |
| Card title | PT Serif 400, 17–21px |
| Body / explanation | System, 13–16px/1.45–1.6 |
| Learner turn | PT Serif 400, 16px/1.45 |
| Meta, eyebrow, state | IBM Plex Mono 500, 9–12px, letterspacing `.03–.14em`, often uppercase |

Rule of thumb: **serif for anything a person says or is called; mono for anything the system
reports.** System sans for explanation. Never mix within a line.

**Spacing** — 4px base. Common: 6, 8, 10, 12, 14, 16, 18, 20, 22, 26, 34.
Screen gutter `22px`. Card padding `16–20px`. Section gap `26px`.

**Radius** — chips/discs `100px` · cards `16–20px` · inner cards `12–14px` · dial tracks `3px`

**Shadow** — cards `0 1px 2px rgba(35,31,24,.05)` · reached entry `0 2px 8px rgba(35,31,24,.09)` ·
buttons `0 2px 0 rgba(35,31,24,.14)` (a flat offset, not a blur — it reads as printed ink)

**Motion** — bar loop `.62–1.1s ease-in-out` staggered `.07s` · button fade-in `.32s ease` ·
filler blink `1.1s` · meter transitions `.2s ease`

## Accessibility

Contrast was checked against `#FBF6EC` and two values were raised during design review; keep
them at or above these levels:

- Reveal hint: `rgba(35,31,24,.55)` at 11px (≈4.6:1) — was failing at `.3`/9px
- Revealed translation: `rgba(35,31,24,.6)` at 14px (≈4.6:1) — the PRD's "dimmer, smaller"
  has a floor; this is a comprehension aid read under pressure
- Address-book role line: `rgba(35,31,24,.62)` in **all** states, including sealed

Touch targets: CTAs are 56–58px tall, chips 34px (below the 44px guideline — **raise the chip
hit area with padding or `hitSlop` in the real app**, keeping the visual size), hold-to-think 46px.

## Assets

No production assets in this bundle. Needed for implementation:

- **PT Serif** and **IBM Plex Mono** (SIL OFL) — bundle via `expo-font`, Cyrillic subsets included
- **Persona portraits** — five needed (Валентина, Елена Николаевна, Маша, Дима, Ирина В.).
  Currently hatch placeholders + Cyrillic initials
- Later: **Rive character** for the v2 face (PRD §6.5)

No icon set is used — the only glyphs are typographic (`‹`, `›`, `✕`, `→`).

## Files

| File | What it is |
|---|---|
| `Speaking Practice - core loop.dc.html` | The design. Open in a browser; all six screens are live |
| `support.js` | Runtime the HTML needs to render. Not part of the design |
| `ios-frame.jsx` | Device bezel for presentation only. **Ignore** |
| `image-slot.js` | Portrait placeholder component. Replace with real images |

Run it by opening the `.html` file directly — no build step, no server.

## Not designed yet

Flagged so nobody assumes these were considered and omitted:

- **Onboarding / session zero**, including the Cyrillic-literacy question and the
  transliteration accommodation (PRD §6.2, §13 risk 6)
- **Out-of-character escape hatch** (PRD §12.1) — ships before launch
- **Text input path** for accessibility (PRD §12.3)
- **Monthly comprehension benchmark** — the north-star surface (PRD §6.3)
- **Hold-to-think during her turn** (PRD §7.8)
- Error, offline, and permission-denied states
