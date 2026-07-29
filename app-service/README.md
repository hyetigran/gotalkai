# app-service

Skeleton only (ticket #12) — proves Postgres connectivity and the
long-lived process shape. No schema, auth, or persistence logic yet; see
`ARCHITECTURE.md` at the repo root for the target design (§3.2).

## Run locally

Requires a reachable local Postgres. With Homebrew's `postgresql@15`:

```sh
brew services start postgresql@15
createdb lingoai_app_service
```

```sh
cp .env.example .env
pnpm install
pnpm dev
curl http://localhost:8081/health
```

## Scripts

- `pnpm dev` — run with `tsx watch` for local development
- `pnpm build` — compile to `dist/`
- `pnpm start` — run the compiled build (`node dist/index.js`) — what
  Railway (or any host) should run in production
- `pnpm test` — runs against a real local Postgres instance (see above),
  no DB mocking — set `DATABASE_URL` to point tests at a different
  database
- `pnpm type-check`, `pnpm lint`

## Deploying

Target: Railway, **deployed as its own service, separate from
voice-service** — PRD §7.6's two-service split only counts if these are
genuinely two independently deployable/restartable processes, not one
process wearing two hats. Set `DATABASE_URL` as a Railway environment
variable (Railway's Postgres addon provides this automatically when
attached), never committed.

Deploying to a real environment and testing from a physical device is
outside what this skeleton's automated tests can prove — see the
ticket's UAT.
