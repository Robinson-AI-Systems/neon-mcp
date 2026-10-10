# ARCHITECTURE — runtime facts, as built

This file describes what **exists**, and is updated in the same PR that ships it (DRIFT-PROTOCOL checklist B). What the
system is designed to become is in `docs/designs/`; do not copy design text here before it is built.

As of 2026-10-10 (A-1, #1): **the foundation for building is in place; no server code yet** — no tools, no endpoints, no
database tables, no Neon calls. What exists: the package, test harness, fake Neon API, check scripts and CI below.

## Infrastructure

| Piece | State |
|---|---|
| GitHub repo `Robinson-AI-Systems/neon-mcp` | Public. Changes reach `main` only through `ai/*` branches and PRs |
| CI (`.github/workflows/ci.yml`) | On every PR and push to `main`: jobs `check` (secret scan, docs check, work-index validation, lint, write-safety, core imports, token budgets), `unit` (fake Neon), `db` (throwaway Postgres 17 service, image `public.ecr.aws/docker/library/postgres:17`), and the aggregate **`ci`** job — the single merge gate, red unless all three are `success`. Node 24, `npm ci` from the committed lockfile, `permissions: contents: read`, no secrets, never calls Neon |
| Vercel project | Not created (IN-02) |
| This server's own Neon database | Not created (IN-02) |
| Neon API keys | None added (IN-04) |

## Environment variables

None yet. Batch A defines `DATABASE_URL`, `ADMIN_PASSPHRASE`, `PUBLIC_BASE_URL`, `TOKEN_ENCRYPTION_KEY`; record each
here with its environments when A-5 ships. Never record values.

## Database tables

None yet. Each batch's design lists its tables; record them here as they ship.

## Endpoints

None yet.

## Neon API description and client

- Vendored description: `vendor/neon-openapi/v2.yaml` — fallback source `@neondatabase/api-client@2.7.3`
  (`public-v2-for-users.gen.yaml`, published 2026-07-01; the live URL was unreachable from the build workspace), 163
  operations, SHA-256 `dacf72ea…059c44`; details in `vendor/neon-openapi/SOURCE.md`. Used today only by tests.
- `@neon/sdk` pinned at **7.0.1** (dependency installed; no production code imports it yet — `src/neon/client.js` is A-4).

## Test harness (A-1)

| Piece | What it does |
|---|---|
| `test/helpers/neon-spec.js` | Loads the vendored description; matches method + path to an operationId; validates request bodies strictly (unknown or missing fields), query parameters and response bodies |
| `test/helpers/fake-neon.js` | `makeFakeNeon()` → `{ fetch, calls, when, operations, lockedThen, rateLimited, problems, assertClean }`. Pass `fetch` to `@neon/sdk` (`createNeonClient({ fetch })`). Refuses undocumented or malformed requests, answers 401 without a bearer key, polls operations `running` → `finished`/`failed`, plays 423/429 sequences |
| `test/helpers/neon-fixtures.js` | Made-up project `proj-fake-000001`: default protected branch `main`, child `dev`, a compute on each, `neondb`/`neondb_owner`; all schema-valid |
| `test/helpers/pg-neon-adapter.js`, `tests/db/local-url.js` | Real `pg` client in a uniquely named throwaway schema; refuses any non-localhost database |
| `scripts/local-postgres-test.sh` | `npm run test:db`: CI's service, or a throwaway local cluster from `initdb`/`pg_ctl` (found under `/usr/lib/postgresql/*/bin`; runs as `postgres` when root) |
| `scripts/check-*.mjs` | `npm run check`; each exports its rule and has tests (`tests/unit/check-*.test.js`) |
| `src/core/registry.js`, `src/tools/index.js` | `mergeNamespaces` (duplicate names and missing handlers throw); the registry is empty |

## Runtime

Node **24.x** (`package.json` `engines`; Vercel stopped deploying Node 20 on 2026-10-01). Plain ES modules, no build
step. Dependencies (exact versions): `@modelcontextprotocol/sdk` 1.32.1, `@neon/sdk` 7.0.1, `@neondatabase/serverless`
1.2.0, `libpg-query` 18.1.5; dev: `eslint` 10.12.0, `pg` 8.23.1, `vitest` 5.0.3, `yaml` 2.9.1.
