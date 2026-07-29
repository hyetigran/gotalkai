# voice-service

Skeleton only (ticket #11) — proves the long-lived process, authenticated
connection, and boot-time env validation shape. No pipeline logic
(VAD/STT/LLM/TTS) yet; see `ARCHITECTURE.md` at the repo root for the
target design.

## Run locally

```sh
cp .env.example .env
# set VOICE_SERVICE_AUTH_TOKEN to any string ≥16 characters
pnpm install
pnpm dev
```

## Scripts

- `pnpm dev` — run with `tsx watch` for local development
- `pnpm build` — compile to `dist/`
- `pnpm start` — run the compiled build (`node dist/index.js`) — this is
  what Railway (or any host) should run in production
- `pnpm test` — unit + integration tests (a real server instance, a real
  `ws` client, no mocks) — this is what verifies the auth handshake and
  ping/pong round trip in CI/locally; it is not a substitute for the
  physical-device UAT the ticket also calls for
- `pnpm type-check`, `pnpm lint`

## Deploying

Target: Railway, long-lived container, region pinned near the eventual
STT/TTS/LLM providers (PRD §7.7 — not decided yet, finalized once the
vendor bake-off, tickets #12/13, lands). Railway auto-detects `pnpm build`
+ `pnpm start` for a standard Node service; set `VOICE_SERVICE_AUTH_TOKEN`
as a Railway environment variable, never committed.

Deploying to a real environment and testing the round trip from a
physical device is outside what this skeleton's automated tests can
prove — see the ticket's UAT.
