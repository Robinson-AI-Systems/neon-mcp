# ARCHITECTURE — runtime facts, as built

This file describes what **exists**, and is updated in the same PR that ships it (DRIFT-PROTOCOL checklist B). What the
system is designed to become is in `docs/designs/`; do not copy design text here before it is built.

As of 2026-10-11 (A-2, #7): the foundation includes additive internal schema initialization, OAuth primitives and 11 tables
(defined, not provisioned). OAuth and MCP endpoints exist in code but are not deployed. No registered Neon tools, real API calls, keys or live database yet.

## Infrastructure

| Piece | State |
|---|---|
| GitHub repo `Robinson-AI-Systems/neon-mcp` | Public. Changes reach `main` only through `ai/*` branches and PRs |
| CI (`.github/workflows/ci.yml`) | On every PR and push to `main`: jobs `check` (secret scan, docs check, work-index validation, lint, write-safety, core imports, token budgets), `unit` (fake Neon), `db` (throwaway Postgres 17 service, image `public.ecr.aws/docker/library/postgres:17`), and the aggregate **`ci`** job — the single merge gate, red unless all three are `success`. Node 24, `npm ci` from the committed lockfile, `permissions: contents: read`, no secrets, never calls Neon |
| Vercel project | Not created (IN-02) |
| This server's own Neon database | Not created (IN-02) |
| Neon API keys | None added (IN-04) |

## Environment variables

`DATABASE_URL` is read lazily by `src/db.js` on `createDb()`/startup initialization, never at import time.
No live database or environment values have been configured. Batch A also defines `ADMIN_PASSPHRASE`, `PUBLIC_BASE_URL`
and `TOKEN_ENCRYPTION_KEY` for later cards. Never record values.

## Database tables

Defined by `src/db.js` using only additive `CREATE ... IF NOT EXISTS`; not provisioned until deployment.

| Table | Purpose |
|---|---|
| `neon_orgs` | Organization labels, default status and production-disabled gate |
| `neon_keys` | Encrypted key ciphertext, scope and revocation; at most one active key per scope |
| `oauth_clients` | Registered connector clients |
| `oauth_codes` | One-use authorization code data and connection settings |
| `oauth_tokens` | Hashed token/refresh identifiers and connection settings |
| `login_attempts` | Login lockout audit |
| `rate_limits` | Request counters per time window |
| `change_log` | Change intent, previews, confirmations and future undo references |
| `one_time_secrets` | Outbound ciphertext with expiry and one-time viewing |
| `secret_requests` | Inbound ciphertext with expiry and one-time consumption |
| `settings` | Persisted user-editable configuration |

The A-2 real-Postgres tests use an isolated disposable local schema; the fake DB only mirrors table names.

## OAuth primitives (A-3a)

`src/core/oauth.js` supplies SHA-256 credential hashing, S256 PKCE, strict callback URI checks,
normalized client IPs and DB-backed 5-attempt / 15-minute login lockout.
`src/db.js` provides OAuth client/code/token methods and atomic refresh rotation, preserving
`CONNECTION_FIELDS` across the grant. `src/core/http.js` supplies safe HTTP response helpers.
A-3b adds authorization and token endpoints, OAuth discovery, and a default-deny MCP bearer boundary.

## Encrypted key storage (A-5a)

`src/core/crypto.js` uses AES-256-GCM with scope-bound associated data; `TOKEN_ENCRYPTION_KEY` must be a
random 32-byte base64url environment variable and is never read during module import. `src/neon/keys.js`
verifies incoming project/organization keys through the guarded Neon client and persists ciphertext in
`neon_keys` only after confirming identity and project reach. The narrowest key is selected for
back-end calls. Organization-key operations are refused from preview deployments. A-5b adds `src/core/one-time.js` and DB methods for ciphertext-only ten-minute outbound and
inbound secrets. Outbound secrets are deleted atomically when viewed; incoming requests are filled and
consumed once, with organization scope. The setup page will be added by A-5c.

## Endpoints (A-3b, not deployed)

- `/api/oauth/register`: client registration with hashed client credentials in storage
- `/api/oauth/authorize`: owner passphrase, organization, mode, profile, listing and currently unscoped projects; forged project scopes rejected until A-5 can list them
- `/api/oauth/token`: S256 PKCE authorization-code exchange and atomic refresh
- `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`: OAuth discovery
- `/api/mcp`: bearer-only stateless MCP; zero tools until Batch B
- `/api`: service home and tool count

Requires `ADMIN_PASSPHRASE`, `PUBLIC_BASE_URL`, and a database before login; `VERCEL_ENV` non-production forces preview. No variable values are committed.

## Neon API description and client

- Vendored description: `vendor/neon-openapi/v2.yaml` — fallback source `@neondatabase/api-client@2.7.3`
  (`public-v2-for-users.gen.yaml`, published 2026-07-01; the live URL was unreachable from the build workspace), 163
  operations, SHA-256 `dacf72ea…059c44`; details in `vendor/neon-openapi/SOURCE.md`. Used today only by tests.
- `@neon/sdk` pinned at **7.0.1** and imported only by `src/neon/client.js` (A-4a). Raw calls have SDK retries disabled, an injected mandatory API budget, 423/429 bounded retries, and unknown-outcome handling on uncertain writes. `src/neon/operations.js` polls by bounded budget (max 45 seconds) and returns resumable pending states. A-4b adds `src/neon/budget.js` (default 500 requests per key per minute across instances) and atomic
`src/db.js` `rate_limits` counter with optional expiration cleanup. Plain keys are never passed to the DB counter.
The operations index is pure code; `scripts/openapi-find.mjs` queries the pinned YAML offline and
`scripts/neon-api-drift.mjs` optionally compares against Neon's unauthenticated public description.
Neither script changes the vendored file. No live Neon account is used in tests.

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
