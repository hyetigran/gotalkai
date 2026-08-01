# File and directory layout standards

**Date:** 2026-08-01

**Scope:** Primary-source conventions for (1) database-backed Node/TypeScript + Postgres apps with SQL schema/migrations, (2) Node.js TypeScript HTTP and long-lived services, and (3) React Native / Expo apps using Expo Router and feature-based structure. Claims are tied to official docs, first-party scaffolding, RFCs/specs, or first-party templates (especially Obytes, which LingoAI’s `mobile/` app is based on). Where a source does **not** prescribe layout, that is stated explicitly. De facto community habits are labeled as such and not treated as official standards.

**Repo grounding:** LingoAI currently has `app-service/` (Node/TS + `pg` + Zod; `migrations/` + Nest-inspired `src/` modules; `dist/`; Jest), `voice-service/` (Node/TS realtime; Nest-inspired modules under `src/`), and `mobile/` (Expo Router under `src/app/`, features under `src/features/`, Obytes-derived layout).

---

## 1. Database-backed apps (Node/TypeScript + Postgres)

### 1.1 What primary sources say

#### PostgreSQL

PostgreSQL documents **server/cluster on-disk layout** (`PGDATA`, tablespaces, etc.), not how application repositories should arrange source files. See [Database File Layout](https://www.postgresql.org/docs/current/storage-file-layout.html). **It does not prescribe an app-side directory tree for schema or migrations.**

#### node-pg (`pg`)

The Node Postgres driver documents connection and query APIs. It does **not** prescribe where application schema SQL or migration files live.

#### node-pg-migrate

Official CLI defaults and examples:

- Default migrations directory name: `migrations` (resolved from `cwd()`), configurable via `migrations-dir` / `-m`.  
  Source: [CLI Usage](https://salsita.github.io/node-pg-migrate/cli)
- Programmatic API examples use a project-root `migrations/` folder with numbered SQL files (e.g. `00_init.sql`, `01_foobar.sql`).  
  Source: [Programmatic API](https://salsita.github.io/node-pg-migrate/api)
- Migration files may be JS/TS or SQL; loader strategies are documented but do **not** require a deeper app folder convention beyond the configured `dir`.  
  Source: [Defining Migrations](https://salsita.github.io/node-pg-migrate/migrations/), [Migration Loading Strategies](https://salsita.github.io/node-pg-migrate/migration-loading-strategies)

**Prescribed:** a dedicated, versioned migrations directory (default name `migrations`). **Not prescribed:** colocation under `src/`, or a single monolithic `schema.sql` as the long-term evolution mechanism.

#### Prisma

Official defaults and rules:

- Default schema path: `./prisma/schema.prisma` (also accepts `./schema.prisma`).  
  Source: [Prisma Schema Location](https://www.prisma.io/docs/orm/prisma-schema/overview/location)
- `prisma init` creates `prisma/schema.prisma` and `prisma.config.ts` with `migrations.path: "prisma/migrations"`.  
  Source: [prisma init](https://www.prisma.io/docs/cli/init)
- Multi-file schemas: keep `migrations/` at the **same level** as the main `schema.prisma` (typically under `prisma/`).  
  Source: [Prisma Schema Location](https://www.prisma.io/docs/orm/prisma-schema/overview/location)
- Commit both the schema and the full migration history.  
  Source: [Getting started with Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate/getting-started)

**Prescribed tree (default):**

```text
prisma/
  schema.prisma
  migrations/
prisma.config.ts   # (current CLI)
```

#### Drizzle ORM / Drizzle Kit

Official get-started and config docs show:

- Schema TypeScript under `src/db/schema.ts` (example layout).
- Migrations output folder default `./drizzle` via `out` in `drizzle.config.ts` (override e.g. to `./migrations`).
- Project-root `drizzle.config.ts`.

Sources: [Drizzle get-started (example structure)](https://orm.drizzle.team/docs/get-started/mysql-new), [drizzle-kit generate / `out`](https://orm.drizzle.team/docs/drizzle-kit-generate), [drizzle.config.ts](https://orm.drizzle.team/docs/drizzle-config-file)

**Example tree from docs:**

```text
.
├── drizzle/                 # or custom `out`
├── src/
│   └── db/
│       └── schema.ts
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

#### Flyway (concepts; not Node-specific)

Relevant as a widely cited migration-tool mental model:

- Default project folders from `flyway init` / Flyway Desktop: `migrations/`, `schema-model/`, `flyway.toml`.  
  Source: [Flyway projects](https://documentation.red-gate.com/flyway/flyway-concepts/flyway-projects)
- Migrations are versioned scripts discovered from configured `locations`; scanning is recursive; execution order follows version in the filename, not folder nesting.  
  Source: [Migrations](https://documentation.red-gate.com/flyway/flyway-concepts/migrations), [Organize migration scripts](https://documentation.red-gate.com/flyway/database-development-using-flyway/managing-migrations/tutorial-organize-migration-scripts)

**Prescribed concept:** incremental, ordered migration scripts in a dedicated folder (default `migrations/`), version-controlled. Subfolders are organizational only.

### 1.2 De facto conventions (not official)

- **Single `schema.sql` at service root** used as idempotent “apply full DDL” is a common early-stage / ops-friendly pattern for small schemas, but it is **not** what Prisma, Drizzle Kit, node-pg-migrate, or Flyway document as the primary evolution model. Those tools center on **ordered migration history**. LingoAI `app-service` now uses `migrations/` + a journal; root `schema.sql` is only a pointer.
- Colocating SQL under `src/db/` or `db/` is common in Node services; migration tools generally allow any path via config.
- Keeping **raw SQL as source of truth** (no ORM schema language) is a valid stack choice; official migration tools still expect **incremental files + a journal table**, not only a rewritable full dump.

### 1.3 Recommended directory tree for LingoAI (`app-service`)

LingoAI uses hand-authored SQL + `pg`, not Prisma/Drizzle. Align with migration-tool defaults while keeping the current explicit migrate CLI.

```text
app-service/
├── package.json
├── tsconfig.json          # rootDir: src, outDir: dist
├── .env.example
├── schema.sql             # optional: current full baseline / reference dump
├── migrations/            # preferred long-term: ordered up/down (or up-only) SQL
│   ├── 001_init.sql
│   └── 002_….sql
├── dist/                  # tsc output (gitignored in deploy artifacts as appropriate)
└── src/
    ├── index.ts
    ├── server.ts
    ├── db.ts
    ├── migrate.ts         # applies migrations (or schema) explicitly — not on every boot
    ├── schema.ts          # loader/helpers for SQL files
    ├── env.ts
    ├── <domain>.ts        # sessions, turns, privacy, …
    └── <domain>.test.ts   # Jest colocated *.test.ts (see §2)
```

**Recommendation:** treat `migrations/` as the evolution mechanism (node-pg-migrate-compatible or equivalent ordered SQL). Keep a baseline `schema.sql` only if useful as documentation or bootstrap; do not rely on rewriting one file as the sole history once multiple environments exist. Prisma/Drizzle layouts above are alternatives **if** the stack switches ORMs.

### 1.4 Gaps / conflicts between sources

| Source | Schema location | Migrations location | App `src/` layout |
|--------|-----------------|---------------------|-------------------|
| PostgreSQL | Not prescribed | Not prescribed | Not prescribed |
| node-pg-migrate | N/A (SQL/JS migrations) | Default `migrations/` | Not prescribed |
| Prisma | Default `prisma/schema.prisma` | `prisma/migrations` | Not prescribed |
| Drizzle | Configurable TS schema (docs often `src/db/`) | Default `./drizzle` | Example only |
| Flyway | Optional `schema-model/` | Default `migrations/` | Not Node-oriented |
| Full single `schema.sql` | Used by some apps | Conflicts with incremental-history tools | — |

---

## 2. Node.js servers (TypeScript HTTP / long-lived services)

### 2.1 What primary sources say

#### Node.js (`package.json`)

Node defines a **package** as a folder tree rooted at `package.json`. Entry points use `"main"` and/or `"exports"`; `"type"` selects CommonJS vs ES modules.  
Source: [Modules: Packages](https://nodejs.org/api/packages.html)

**Prescribed:** package root + entry fields. **Not prescribed:** `src/` vs root source layout, layered folders, or feature modules.

#### TypeScript compiler

- `outDir`: emit `.js` into a separate directory; without it, emit beside `.ts`.  
  Source: [TSConfig `outDir`](https://www.typescriptlang.org/tsconfig/outDir.html)
- `rootDir`: controls mirrored output structure under `outDir`; defaults to longest common path of inputs.  
  Source: [TSConfig `rootDir`](https://www.typescriptlang.org/tsconfig/rootDir.html)

**Prescribed mechanism:** separate emit directory via `outDir` (commonly named `dist` in tooling examples). TypeScript does **not** mandate the name `src/` or `dist/`; it documents the options that make that pattern work.

#### Express (official generator)

`express-generator` scaffold:

```text
.
├── app.js
├── bin/www
├── package.json
├── public/
├── routes/
└── views/
```

Official note: *“The app structure created by the generator is just one of many ways to structure Express apps. Feel free to use this structure or modify it to best suit your needs.”*  
Source: [Express application generator](https://expressjs.com/en/starter/generator.html)

**Prescribed as a starter only** — explicitly non-mandatory. Classic Express scaffold is **not** TypeScript/`src`/`dist`-centric.

#### Fastify

Fastify’s first-party guidance is about **plugin registration order and encapsulation**, not a fixed filesystem taxonomy:

```text
└── plugins (from the Fastify ecosystem)
└── your plugins (your custom plugins)
└── decorators
└── hooks
└── your services
```

Replicate that structure per encapsulated service when scoping plugins to route subsets.  
Source: [Getting Started — Loading order of your plugins](https://fastify.io/docs/latest/Guides/Getting-Started/)

Also points to `fastify-cli` for scaffolding; the Getting Started guide itself does **not** mandate `src/plugins` vs `src/routes` folder names — it mandates **load order semantics**.

#### NestJS (opinionated standard)

`nest new` creates `src/` with:

```text
src/
  main.ts
  app.module.ts
  app.controller.ts
  app.controller.spec.ts
  app.service.ts
```

Docs state the scaffold “encourages developers to follow the convention of keeping each module in its own dedicated directory.”  
Source: [First steps](https://docs.nestjs.com/first-steps)

CLI also defines **standard mode** vs **monorepo mode** (`apps/`, `libs/` in monorepo).  
Source: [Nest CLI overview](https://docs.nestjs.com/cli/overview) (project structure / workspaces)

**This is a real, opinionated standard** — cite Nest when choosing Nest; do not treat Nest module folders as required for Express/Fastify/`http` + hand-rolled servers.

#### Jest (tests)

Default `testMatch` finds:

- files under any `__tests__/` directory, and  
- files matching `*.test.*` / `*.spec.*` (colocated or elsewhere).

`roots` can limit search (e.g. only under `src/`).  
Source: [Configuring Jest](https://jestjs.io/docs/configuration) (`testMatch`, `roots`)

**Prescribed:** either colocated `*.test.ts` / `*.spec.ts` **or** `__tests__/` trees are first-class. Jest does **not** require one exclusive style.

### 2.2 De facto conventions (not official)

- **`src/` + `dist/`** for TypeScript Node apps is ubiquitous and matches how `rootDir`/`outDir` are usually set; Node itself does not name these folders.
- **Flat `src/*.ts`** for small services; **feature or domain folders** as file count grows — community practice, not a Node/Express mandate.
- **E2E tests in `test/`** appears in Nest scaffolds; unit tests often sit next to sources (Nest’s `*.spec.ts` colocated). Express generator historically had little opinion on tests.
- Community Fastify layouts (`plugins/`, `routes/`, `modules/`) mirror Fastify’s *conceptual* load order but are **not** spelled out as a required path layout in Getting Started.

### 2.3 Recommended directory trees for LingoAI services

#### `app-service` (HTTP + Postgres)

Keep TypeScript `src/` → `dist/` (already matches TSConfig guidance). Prefer light domain grouping only when the flat root becomes hard to navigate — Nest-style modules are optional, not required for this stack.

```text
app-service/
├── package.json            # "main" / scripts point at dist or tsx entry
├── tsconfig.json           # rootDir: src, outDir: dist
├── migrations/             # see §1
├── schema.sql              # pointer to migrations baseline
├── dist/
└── src/
    ├── main.ts
    ├── config/
    ├── db/
    ├── http/
    ├── learners/
    ├── turns/
    ├── memories/
    ├── debrief/
    ├── scenarios/
    ├── address-book/
    ├── benchmark/
    └── observability/
```

#### `voice-service` (long-lived realtime)

Same Node/TS package conventions; Fastify-style **conceptual** separation if/when the service adopts a plugin framework. Today’s flat modules + `eval/`, `stress/`, `test-support/` are consistent with Jest allowing non-prod trees under `src/` or sibling folders.

```text
voice-service/
├── package.json
├── tsconfig.json
├── dist/
└── src/
    ├── main.ts
    ├── config/             # env
    ├── realtime/           # server, messages, session-token
    ├── pipeline/           # turn, stt, tts, stress/, persona*, safety
    ├── integrations/       # app-service-client
    ├── observability/      # tracing, alerting, cost
    ├── eval/               # offline / CI evaluation (not request path)
    └── test-support/
```

Nest-inspired module folders without adopting NestJS. If adopting Fastify later, map **ecosystem plugins → app plugins → decorators/hooks → services** in registration order ([Fastify Getting Started](https://fastify.io/docs/latest/Guides/Getting-Started/)), with folders named to match that mental model only if helpful.

### 2.4 Gaps / conflicts between sources

| Source | Opinion on layout |
|--------|-------------------|
| Node.js | Package root + entry fields only |
| TypeScript | `outDir`/`rootDir` mechanics; no mandated folder names |
| Express generator | One optional MVC-ish scaffold; explicitly non-binding |
| Fastify | Plugin **load order**; filesystem names not mandated |
| NestJS | Strong `src/` + per-module directories (+ optional monorepo) |
| Jest | Both colocated `*.test`/`*.spec` and `__tests__/` are official defaults |

**Conflict:** Nest’s module-per-folder vs Express’s flat `routes/` vs Fastify’s encapsulation model — all “official,” mutually incompatible if treated as universal Node law. For LingoAI’s hand-rolled TS services, prefer Node + TypeScript + Jest primary rules; treat Nest/Express/Fastify as **framework-specific** standards.

---

## 3. React Native / Expo mobile apps (Expo Router, feature-based)

### 3.1 What primary sources say

#### React Native (core)

React Native’s official documentation does **not** publish a single mandatory application source-tree standard comparable to Nest or Expo Router’s `app/` rules. Structure guidance in the RN ecosystem is largely template- and community-driven. **Do not claim an official RN “features/” layout from Meta docs unless citing a specific page that states it** — as of this research, Expo Router and first-party templates are the binding sources for Expo apps.

#### Expo Router

- Routes live as files under **`app/`** or **`src/app/`**. SDK 55+ default template includes top-level `src` with `app`, `components`, `constants`, `hooks`.  
  Source: [Top-level src directory](https://docs.expo.dev/router/reference/src-directory/)
- Config files (`app.config.ts`, `package.json`, `metro.config.js`, `tsconfig.json`) stay at project root; `public/` stays at root; `src/app` wins over root `app` if both exist.  
  Same source.
- Custom route roots via config plugin are **highly discouraged**.  
  Same source.
- Core concepts document routes and sibling non-route folders (e.g. `src/components`) so components are not turned into URLs.  
  Source: [Core concepts](https://docs.expo.dev/router/basics/core-concepts/)
- Notation for groups `(name)`, dynamic `[param]`, `_layout.tsx`, etc.  
  Source: [Notation](https://docs.expo.dev/router/basics/notation)
- Installation: `package.json` `"main": "expo-router/entry"`; initial layout at `src/app/_layout.tsx` or `app/_layout.tsx`.  
  Source: [Installation](https://docs.expo.dev/router/installation)

**Prescribed:** file-based routes in `app` or `src/app`; keep tooling config at root; keep non-routes outside the routes directory.

#### Obytes React Native template (first-party for this repo’s mobile base)

Obytes documents a **feature-oriented** layout used by `react-native-template-obytes`:

| Area | Role |
|------|------|
| `src/features/` | Self-contained features: `*-screen.tsx`, `components/`, optional `api.ts`, optional `use-*-store.tsx` |
| `src/app/` | Expo Router routes as **thin re-exports** of feature screens |
| `src/components/ui/` | Design-system primitives shared across features |
| `src/lib/` | Cross-cutting infrastructure (api client, auth utils, i18n, hooks, storage) |
| `src/translations/` | i18n JSON resources |

Conventions called out by Obytes: screens use `-screen.tsx`; only `components/` subfolder under a feature; prefer single files like `api.ts` over folders; **no feature `index.ts` barrels** (fast refresh); absolute `@/` imports.  
Sources: [Project Structure](https://starter.obytes.com/getting-started/project-structure/), [claude.md in template](https://github.com/obytes/react-native-template-obytes/blob/master/claude.md), [Overview](https://starter.obytes.com/overview/)

#### Expo (first-party blog — weaker than Router docs, still Expo-owned)

Expo’s engineering blog recommends `/src`, reusable `/components`, and often thin route files that re-export `/screens` for larger apps — aligned with Obytes’ route/screen split, though Obytes uses `features/` instead of a global `screens/`.  
Source: [How to organize Expo app folder structure](https://expo.dev/blog/expo-app-folder-structure-best-practices) (blog, not API reference — treat as first-party guidance, not a schema).

### 3.2 De facto conventions (not official)

- Global `screens/` vs Obytes `features/*-screen.tsx` — both coexist in the Expo community; LingoAI should follow **Obytes** for consistency with the existing app.
- Colocated `*.test.tsx` next to feature components (Obytes shows `login-form.test.tsx`) matches Jest defaults (§2.1).
- Putting shared API/auth under `lib/` vs `features/auth` — Obytes splits **product auth feature** vs **low-level token helpers in `lib/auth`**.

### 3.3 Recommended directory tree for LingoAI `mobile/`

This matches Expo Router + Obytes (already largely in place):

```text
mobile/
├── app.config.ts
├── package.json              # "main": "expo-router/entry"
├── tsconfig.json             # "@/*" → "./src/*"
├── babel.config.js
├── assets/
└── src/
    ├── app/                  # Expo Router only (thin re-exports)
    │   ├── _layout.tsx
    │   ├── (app)/
    │   ├── (tabs)/
    │   └── …
    ├── features/
    │   └── <feature>/
    │       ├── <feature>-screen.tsx
    │       ├── api.ts        # optional
    │       ├── use-*-store.tsx  # optional
    │       └── components/
    ├── components/
    │   └── ui/               # design system
    ├── lib/                  # api, auth utils, i18n, hooks, clients
    ├── translations/
    └── global.css
```

**Do not** move routes out of `src/app` without a strong reason (Expo discourages custom roots). **Do** keep feature logic out of `src/app` so files there do not accidentally become routes.

### 3.4 Gaps / conflicts between sources

| Source | Routes | Feature code | Shared UI |
|--------|--------|--------------|-----------|
| Expo Router docs | `app/` or `src/app/` | Not prescribed (sibling folders OK) | Example: `src/components` |
| Expo default SDK 55+ template | `src/app` | `components`, `constants`, `hooks` (not `features/`) | `src/components` |
| Obytes | `src/app` re-exports | **`src/features/`** | `src/components/ui` |
| Expo blog | `app` / `src/app` | Often `screens/` | `components/` |

**Conflict:** Expo’s stock template uses type-based folders (`hooks`, `constants`); Obytes uses **feature modules**. For LingoAI, Obytes wins as the project’s adopted standard; Expo Router only constrains the routes directory.

---

## 4. Implications for LingoAI

High-level comparison only (not a full audit):

### `app-service/`

- **Aligned:** Nest-inspired domain folders under `src/` (`config/`, `db/`, `http/`, `learners/`, `turns/`, `memories/`, `debrief/`, `scenarios/`, `address-book/`, `benchmark/`, `observability/`); `src/` + `dist/` via `rootDir`/`outDir`; colocated `*.test.ts` (Jest-official); explicit migrate CLI; ordered `migrations/` with `schema_migrations` journal. Root `schema.sql` is a pointer to the baseline migration.

### `voice-service/`

- **Aligned:** Nest-inspired domain folders under `src/` (`config/`, `realtime/`, `pipeline/`, `integrations/`, `observability/`) plus `eval/` and `test-support/`; same TS package layout as `app-service`; entry `main.ts`.
- **No DB mid-turn:** §1 migration layout mostly N/A unless persistence is added later.
- Fastify/Nest **framework** structures remain optional; this layout copies Nest’s *module folders* without Nest DI.

### `mobile/`

- **Strongly aligned** with Expo Router (`src/app`) and **Obytes** (`features/`, `components/ui/`, `lib/`, `translations/`).
- Keep route files thin; continue putting product UI/state in `features/`.
- Stock Expo template’s `constants/`/`hooks/` at `src/` root is **not** required — Obytes already maps hooks into `lib/hooks` and feature folders.

### Cross-cutting

- Node itself will not settle `src/` debates; TypeScript’s `outDir` is the hard rule for compiled services.
- Prefer citing **framework docs that own the tool you use** (Expo Router for routes, Obytes for mobile feature layout, a chosen migrator for SQL history) over generic blog “best practices.”

---

## 5. Primary sources cited

1. [Node.js — Modules: Packages](https://nodejs.org/api/packages.html)  
2. [TypeScript — `outDir`](https://www.typescriptlang.org/tsconfig/outDir.html)  
3. [TypeScript — `rootDir`](https://www.typescriptlang.org/tsconfig/rootDir.html)  
4. [PostgreSQL — Database File Layout](https://www.postgresql.org/docs/current/storage-file-layout.html)  
5. [node-pg-migrate — CLI Usage](https://salsita.github.io/node-pg-migrate/cli)  
6. [node-pg-migrate — Programmatic API](https://salsita.github.io/node-pg-migrate/api)  
7. [node-pg-migrate — Defining Migrations](https://salsita.github.io/node-pg-migrate/migrations/)  
8. [Prisma — Schema Location](https://www.prisma.io/docs/orm/prisma-schema/overview/location)  
9. [Prisma — `prisma init`](https://www.prisma.io/docs/cli/init)  
10. [Prisma Migrate — Getting started](https://www.prisma.io/docs/orm/prisma-migrate/getting-started)  
11. [Drizzle — Get started (file structure)](https://orm.drizzle.team/docs/get-started/mysql-new)  
12. [Drizzle Kit — `generate` / `out`](https://orm.drizzle.team/docs/drizzle-kit-generate)  
13. [Flyway — Projects (default folders)](https://documentation.red-gate.com/flyway/flyway-concepts/flyway-projects)  
14. [Flyway — Migrations](https://documentation.red-gate.com/flyway/flyway-concepts/migrations)  
15. [Express — Application generator](https://expressjs.com/en/starter/generator.html)  
16. [Fastify — Getting Started (plugin load order)](https://fastify.io/docs/latest/Guides/Getting-Started/)  
17. [NestJS — First steps](https://docs.nestjs.com/first-steps)  
18. [NestJS — CLI overview](https://docs.nestjs.com/cli/overview)  
19. [Jest — Configuration (`testMatch`, `roots`)](https://jestjs.io/docs/configuration)  
20. [Expo Router — Top-level src directory](https://docs.expo.dev/router/reference/src-directory/)  
21. [Expo Router — Core concepts](https://docs.expo.dev/router/basics/core-concepts/)  
22. [Expo Router — Notation](https://docs.expo.dev/router/basics/notation)  
23. [Expo Router — Installation](https://docs.expo.dev/router/installation)  
24. [Obytes — Project Structure](https://starter.obytes.com/getting-started/project-structure/)  
25. [Obytes — Overview](https://starter.obytes.com/overview/)  
26. [Obytes template — `claude.md` structure](https://github.com/obytes/react-native-template-obytes/blob/master/claude.md)  
27. [Expo blog — App folder structure](https://expo.dev/blog/expo-app-folder-structure-best-practices) (first-party blog guidance)

---

## 6. Explicit non-prescriptions (summary)

| Claim sometimes heard | Primary-source status |
|----------------------|------------------------|
| “Postgres requires `migrations/` in the app repo” | **False** — Postgres docs cover server data dirs, not app repos |
| “All Node apps must use Nest module folders” | **False** — Nest-only convention |
| “Express requires `routes/` + `views/`” | **False** — generator is optional by its own docs |
| “Fastify requires `src/plugins` on disk” | **False** — requires plugin **registration order** |
| “Tests must live in `__tests__/`” | **False** — Jest equally supports `*.test` / `*.spec` colocated |
| “Expo forbids `src/features`” | **False** — Expo only constrains the routes root; Obytes adds features |
| “TypeScript requires folders named `src` and `dist`” | **False** — requires coherent `rootDir`/`outDir` if separating emit |
