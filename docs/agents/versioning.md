# Versioning

App version lives in **`mobile/package.json`** → `"version"` (`MAJOR.MINOR.PATCH`).

**Never use a separate `VERSION` file.** Do not create, update, or restore one. If `mobile/package.json` is missing, skip bumping until it exists.

## Bump rules

| Event | Bump |
| --- | --- |
| A **ticket** is completed (implemented, valid `/code-review`, committed) | **PATCH** — `0.1.1` → `0.1.2` |
| A **feature** is completed as a unit (same gate: valid review + commit) | **PATCH** — same as a ticket |

Do **not** bump when only drafting tickets (`/to-tickets`), reviewing without committing, or for chores that are not a ticket/feature deliverable (unless they are themselves the ticket).

## How to bump

1. Read `mobile/package.json` `"version"`.
2. Increment the PATCH segment by 1; leave MAJOR/MINOR unchanged unless the user explicitly asks otherwise.
3. Write the new value back to `mobile/package.json` `"version"` only (semver string, no `v` prefix). Keep JSON valid.
4. Include `mobile/package.json` in the same commit as the ticket/feature work.
5. Prefer a conventional commit that mentions the version, e.g. `feat(foo): …` with body/footer `Version: 0.1.2` and `Closes #N` / `Refs #N` when applicable.

If other manifests pin the same app version (e.g. Expo `app.config` / native build numbers), keep them in sync with `mobile/package.json` in the same bump — still never via a `VERSION` file.
