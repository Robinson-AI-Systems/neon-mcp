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
consumed once, with organization scope. A-5c adds `/api/neon/setup`: owner-only POST operations, strict configured-origin checks,
passphrase and DB lockout, no-store/CSP/anti-framing headers. It never enables production or accepts org-wide
keys on preview. Its one-time view is explicitly visible only to the passphrase-authenticated owner.

## Endpoints (A-3b, not deployed)

- `/api/oauth/register`: client registration with hashed client credentials in storage
- `/api/oauth/authorize`: owner passphrase, organization, mode, profile, listing and currently unscoped projects; forged project scopes rejected until A-5 can list them
- `/api/oauth/token`: S256 PKCE authorization-code exchange and atomic refresh
- `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`: OAuth discovery
- `/api/mcp`: bearer-only stateless MCP; zero tools until Batch B
- `/api/neon/setup`: owner-only key and secret setup page (A-5c)
- `/api`: service home and tool count

Two scoped read-only MCP tools exist: `neon_whoami` and `neon_list_accounts`.
They report only metadata for the token's organization, never ciphertext or raw keys.
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

## Target SQL connection layer (A-6)

`src/neon/sql.js` provides `createSqlLayer` and `withSqlClient`. A budgeted pinned-SDK
`getConnectionURI` read supplies a URI inside one request. Host comparison refuses this server's
own `DATABASE_URL` host, including its pooled alias, before any pool is opened. A short-lived
`@neondatabase/serverless` Pool applies 15-second statement and 5-second lock timeouts,
passes only a reduced query interface to the callback and always releases/ends the pool.
Callback results scrub the exact fetched URI and errors are rebuilt without connection details.
`test/helpers/sql-client.js` restricts real PostgreSQL tests to localhost. SQL queries are NOT
exposed as MCP tools until the Batch B SQL/production guards are implemented.

## Runtime

Node **24.x** (`package.json` `engines`; Vercel stopped deploying Node 20 on 2026-10-01). Plain ES modules, no build
step. Dependencies (exact versions): `@modelcontextprotocol/sdk` 1.32.1, `@neon/sdk` 7.0.1, `@neondatabase/serverless`
1.2.0, `libpg-query` 18.1.5; dev: `eslint` 10.12.0, `pg` 8.23.1, `vitest` 5.0.3, `yaml` 2.9.1.

## B-1 audited write reservation

The generic write lifecycle lives in `src/core/write.js`; Neon-specific API/wait calls live in `src/neon/write-neon.js`. The existing `change_log` table has an additive partial unique index on `request_key` for real (non-preview) writes. `reserveWrite` atomically records intent before any external mutation, and retries return the existing audit state without resending. `completeWrite` only transitions a pending row. Preview rows never reserve keys. Logs hold safe summaries and identifier-only inverse metadata, never raw before/after state. Until B-2/B-4, no write handlers are registered and every required policy guard must be explicitly injected; missing guards deny execution.

## B-2a production and protected-resource classifiers

`src/neon/production.js` decides from trusted Neon branch reads and server-side profile data, ignoring deprecated `primary`. Unreadable targets are denied. `src/core/protected-resources.js` refuses all protected projects/branches, including this server's own project; the self project must be independently verified before writes can be enabled. The owner-managed list lives in `settings.protected_resources`, but the owner's confirmation/editor and the durable two-step production enable remain B-2b. No generic write door is opened by B-2a.

## B-2b owner protection editor

`src/core/self-resource.js` derives the server's own organization/project from owner-controlled Vercel settings only after confirming `DATABASE_URL` uses the owner-declared endpoint hostname; no secrets are echoed. The passphrase- and Origin-guarded `/api/neon/setup` protects edits to `settings.protected_resources` and always reconstructs its own `self` entry on reads. Missing or mismatched config fails closed. This step does not activate or expose production writes; the remaining two-step owner flow is B-2c.

## B-2c owner permission workflow

`src/tools/owner-production.js` uses the B-1 `defineWrite` audited contract only for two internal access controls, with no Neon API mutations. MCP dispatch permits these two controls only to authenticated full-profile connectors on a production deployment; all other external writes remain unavailable. `src/core/owner-activation.js` denies requests unless the owner independently released X-2/X-3, confirmed IN-07 protection and configured the own-project identity. `settings.production_intent:<org>` holds a 10-minute pending request; the owner passphrase, exact typed confirmation and one atomic Postgres consume+enable are mandatory. Disable revokes production immediately and cancels pending intent. No state was activated by this PR.

### B-3b SQL read boundary (PR #23)
The private `src/neon/sql-read.js` helper requires a server-trusted `connection`, verified Neon branch identity, independently verified self project, stored protected resources and `db.getSqlReadPolicy()` **before** obtaining a scoped SQL URI. The database `settings` row `sql.read_policy` defaults to `{productionReads:true,maxRows:200}` (owner IN-09, approved 2026-10-11); `initSchema()` seeds idempotently and preserves owner overrides. Query strings must parse as one read-only statement, then execute within `BEGIN READ ONLY` with bounded local statement/lock timeouts; failure rolls back and returns sanitized SQLSTATE guidance. At most the configured 200 rows are returned. This helper is **not** an MCP tool and cannot be reached by a client before D-5. B-3 preview/apply remains outstanding; production write activation remains OFF.

### B-3c durable child previews (PR #24)
The unexposed `src/neon/sql-preview.js` requires trusted identity/branch/protected-resource/app guards and an explicit preview spend-admission service. It creates an expiring 0.25 CU child at the verified target, executes statements **only on the returned child**, compares schema when needed, and always attempts recoverable child deletion. An opaque token is emitted only when cleanup and org-scoped audit persistence succeed. `change_log` holds only SHA-256 token and exact SQL/parameters/target hash (never plaintext SQL or token), expected counts, schema hash, 30-minute expiry and atomic consume timestamp. Six additive nullable SQL columns and a unique hash index are re-entrant under `initSchema()`. Until B-3d/B-4 guards are fully wired and D-5 adds tools, these routines cannot be reached through MCP. Production write mode remains OFF.

### B-4 source-dated pricing and atomic spend cap (PR #25)
`src/neon/pricing.js` stores 2026-10-10 Neon Launch/Scale rates as integer micro-dollar rates with source URL. `settings` contains owner-approved IN-10 caps (2500 cents/change and 5000 cents/day) and the dated `pricing` object; `initSchema()` seeds them idempotently and preserves owner updates. `src/neon/spend.js` estimates a worst-case monthly increase from trusted before/after state; unknown usage and Free-plan limits refuse rather than invent billable estimates. No price-setting/purchase tool is exposed; future owner setup edits require explicit confirmation and a change-log row. Admission uses the existing `rate_limits` table with a per-organization, per-UTC-day atomic SQL UPSERT before any external write, shared across Vercel instances; known duplicate audit claims release only the second allowance, uncertain claims remain conservatively reserved. Even short-lived preview branches are atomically admitted into the same daily counter; missing permission fails closed. Future B-3d/B-8/D handlers must inject this guard and never call Neon mutations if `allowed` is not true. Production mode OFF.
