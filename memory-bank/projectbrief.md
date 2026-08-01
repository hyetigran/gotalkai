# Project brief — LingoAI / gotalkai

## What this is

A mobile app for **Russian speaking practice** built around AI conversation partners with persistent memory and calibrated difficulty. The learner talks; the app is a person to talk to — not a flashcard deck in a costume.

**Working names:** repo `LingoAI` / remote `gotalkai` (Gauntlet GitLab). Product positioning (one line): *for people who already have the words and still can't speak.*

## Goals

1. Close the production gap for people who understand Russian but cannot hold a conversation under real-time social pressure.
2. Ship a daily loop: **Open → Converse → Debrief → Tomorrow's scenario**.
3. One v1 front-door persona (**Валентина Сергеевна Румянцева**) with memory, register asymmetry (she ты / learner вы), and difficulty dials — not streaks or gamification. Second persona (Елена) parameterized in code; not the default unlock.
4. Validate premise via **owner dogfooding** and in-market signals (abandonment turn, session-2 return), not Wizard-of-Oz (ADR-0001).

## Target users

- **Primary:** heritage speakers (high listening, low production; embarrassed with family).
- **Secondary:** partners of Russian speakers (relational deadline, same asymmetry).
- **Floor:** A2 spoken interaction. True beginners are out of scope for v1.

## In scope (v1)

- Cascaded voice pipeline (not speech-to-speech): VAD → STT → persona LLM → stress annotation → TTS (ElevenLabs STT/TTS; Sonnet 5 persona — ADR-0013 / 0003).
- React Native / Expo client; Node/TS app + voice services; Postgres; optional marketing site (`landing/`).
- Product loop screens (Open / Converse / Debrief / Tomorrow), memory, debrief ranking, scenario selection.
- Eval harness, cost controls (daily session cap), safety escape hatch before launch.

## Out of scope (v1)

Beginner-from-zero instruction; reading/writing/grammar drills; languages other than Russian; photorealistic/video avatars; social/streaks; tutor marketplace; **web Converse client** (marketing landing is allowed and separate).

## Source of truth

- Product requirements: `PRD.md` (Draft v0.1)
- System architecture: `ARCHITECTURE.md` (refresh when current ≠ target)
- Architecture decisions: `docs/adr/` (0001–0024+)
- Agent ops: `docs/agents/`
- Code: `mobile/`, `app-service/`, `voice-service/`, `landing/`
