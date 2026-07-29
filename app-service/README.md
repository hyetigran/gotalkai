# app-service

Long-lived Node/TS service owning auth, persistence, memory, and debrief
analysis. See `ARCHITECTURE.md` at the repo root for the target design
(§3.2, §3.4). Schema is in `schema.sql` (PRD §8) — apply it with
`pnpm db:migrate`.

## Run locally

Requires a reachable local Postgres. With Homebrew's `postgresql@15`:

```sh
brew services start postgresql@15
createdb lingoai_app_service
```

```sh
cp .env.example .env
pnpm install
pnpm db:migrate
pnpm dev
curl http://localhost:8081/health
```

## Scripts

- `pnpm dev` — run with `tsx watch` for local development
- `pnpm build` — compile to `dist/`
- `pnpm start` — run the compiled build (`node dist/index.js`) — what
  Railway (or any host) should run in production
- `pnpm db:migrate` — apply `schema.sql` (idempotent — safe to re-run)
- `pnpm test` — runs against a real local Postgres instance (see above),
  no DB mocking — set `DATABASE_URL` to point tests at a different
  database
- `pnpm type-check`, `pnpm lint`

## Schema (ticket #19)

`schema.sql` is the full DDL — `learners`, `sessions`, `turns`,
`learner_structures`, `persona_memories`, `observations`, `debrief_items`,
`persona_world_state`. See the comments in the file for the reasoning
behind each table and column, cited back to PRD §8.

**`persona_memories` never appears in a log line or trace attribute** —
enforced structurally, not just documented: `src/persona-memories.ts`
wraps every read of `content` in a value whose `toString`/`toJSON`/
`util.inspect` formatting all redact it. `reveal()` is the one explicit,
greppable escape hatch, meant to be called only where the persona prompt
is actually assembled.

**Retention policy** — `sessions`/`turns` older than `RETENTION_DAYS`
(env var, default 180, provisional) are deleted; see `src/retention.ts`.
Deleting a session cascades to its `turns`/`observations`/`debrief_items`
via the FK graph. `learner_structures`, `persona_memories`, and
`persona_world_state` are per-learner, not per-session, and are
untouched. Enforced by a sweep that runs once at boot and then daily
(`src/index.ts`) — not just "defined," genuinely running against a real
database in every started process.

**Connection pooler** — required (PRD §7.7); `pgbouncer.ini.example`
documents the config. Verified locally: ran PgBouncer
(`brew install pgbouncer`) in front of the local Postgres instance with
`default_pool_size = 5`, then fired 50 concurrent client queries through
it. Real Postgres-side backend connections during the load
(`pg_stat_activity`) stayed at 5 — bounded, not growing 1:1 with client
concurrency. In production, point `DATABASE_URL` at the deployed
pooler's host:port instead of at Postgres directly.

## Deploying

Target: Railway, **deployed as its own service, separate from
voice-service** — PRD §7.6's two-service split only counts if these are
genuinely two independently deployable/restartable processes, not one
process wearing two hats. Set `DATABASE_URL` as a Railway environment
variable (Railway's Postgres addon provides this automatically when
attached), never committed.

**Not verified in this environment** (no cloud credentials/staging
instance available): managed backups and point-in-time recovery. Railway
Postgres's backup/PITR story must be confirmed with a real test
restore — enabling the setting is not sufficient (PRD §7.7: "Verify the
backup story before Phase 3, not after") — before real user data
accumulates. Do this before Phase 3, per the PRD.

Deploying to a real environment and testing from a physical device is
outside what this skeleton's automated tests can prove — see the
ticket's UAT.
