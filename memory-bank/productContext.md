# Product context

## Why it exists

Streak-based language apps optimize attendance, not ability. Learners accumulate vocabulary for years and still cannot speak because they never produce language under real-time social pressure with someone who might not understand them.

Three failures we design against:

1. **No production under pressure** — MCQ/typed answers ≠ speech.
2. **No register** — Russian ты/вы and name forms are untrained.
3. **Access** — patient native practice is expensive/scarce; tutoring is $15–30/hr.

## How it should work

### Daily loop

```
Open → Converse → Debrief → Tomorrow's scenario → (return)
```

- **Open:** persona opens with a memory callback; one tap to start; she speaks first.
- **Converse:** open mic (not press-to-speak); backchanneling encouraged; hold-to-think when the learner has the floor (ADR-0002); Cyrillic + stress marks after she finishes speaking; tap-to-reveal translation/translit.
- **Debrief:** three ranked patterns, not every slip; intelligibility framing, not percentage grades.
- **Tomorrow:** scenario built to demand what was missed — the return arrow *is* the product.

### Pedagogy (short)

- SRS applied to **grammatical structures under pressure**, not flashcard vocab.
- Three dials: comprehension load, production demand, **repair behaviour**.
- In-flow: **recasts only** (max one/turn). Never explicit grammar praise/correction in character.
- Differentiator: **avoidance detection** (intent vs production).
- A2 unlock: **backchanneling** during her storytelling.

### Persona (v1)

**Валентина Сергеевна Румянцева** — 78, Yaroslavl, retired librarian, partner's grandmother. Warm storytelling; domestic boundary (no politics with young people). Register asymmetry teaches both forms.

### UX principles that matter

- No streaks, badges, accuracy %, or leaderboards.
- Mic always open for the session; push-to-talk is a setting with stated tradeoffs.
- Hold-to-think is a no-op unless the learner has the floor.
- Transcript of her line never during speech — after, so listening stays listening.
- North-star metric: monthly comprehension benchmark (ability), with fading suggestion chips as in-product progress.

## User experience goals

- Feel like talking to a patient person, not using a language tool.
- Hesitation should not get the learner cut off (hold-to-think + level-aware turn patience).
- Relationship continuity via `persona_memories` callbacks — losing that table resets the product.
