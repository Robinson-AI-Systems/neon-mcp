# Design — Batch A: Foundation (repo, tests, login, key store, Neon client, SQL connection layer)

Status: **DRAFT — awaiting Chris's approval (IN-00)**. Written 2026-10-10 by Claude (Opus 5.5) for an empty repository.
Scope and acceptance: `docs/PLAN.md` → Batch A. Cards A-1 … A-7. Research behind every decision:
`docs/audits/2026-10-10-research.md`.

## 0. Verify before starting

| # | Assumption | How to check |
|---|---|---|
| A1 | Contract-generic code to copy exists in the newest of these sources, in this order: (1) the hub's `robinson-mcp-core` package (hub card K-3); (2) `Robinson-AI-Systems/stripe-mcp` `src/core/` once its A-3/B-1/C-2 have merged; (3) `Robinson-AI-Systems/google-workspace-mcp` files `api/oauth/{authorize,register,token}.js`, `api/well-known/*.js`, `src/oauth/{helpers,login-guard}.js`, `src/crypto.js`, `src/once.js`, `src/changelog.js`, `src/tools/{write,util,errors}.js`, `scripts/check-writes.mjs`, `test/helpers/{fake-db,pg-neon-adapter}.js`, `test/contract/db-contract.js`, `.github/workflows/ci.yml` | `npm view robinson-mcp-core version` (may not exist); `git clone --depth 1` each repo to `/tmp/<name>` and `ls` the paths; record the source and commit in the PR |
| A2 | `@neon/sdk` is still the official successor client; its `raw` subpath exports one function per operation and accepts a configured client (base URL, bearer key, custom `fetch`) | `npm view @neon/sdk version`; `node -e "import('@neon/sdk/raw').then(m=>console.log(Object.keys(m).length))"`; read `node_modules/@neon/sdk/README.md` section on `raw` (≤150 lines). At writing: 7.0.1 (2026-10-05) |
| A3 | Neon's OpenAPI description is downloadable at `https://neon.com/api_spec/release/v2.json` | `curl -sS -o /tmp/neon-v2.json -w "%{http_code}" https://neon.com/api_spec/release/v2.json`. If the workspace cannot reach it (the planning shell got HTTP 403 from its proxy), use the fallback: `npm pack @neondatabase/api-client@2.7.3` → `package/public-v2-for-users.gen.yaml` (2026-07-01, 163 operations), and record in `vendor/neon-openapi/SOURCE.md` that the newer operations (17, see the research audit §1) are not yet vendored |
| A4 | Vercel builds Node **24.x** functions (Node 20 deploys were disabled on 2026-10-01) and the code runs on Node ≥ 20.19 locally | `package.json` `"engines": { "node": "24.x" }`; a preview deployment builds (A-7 checks on the real project) |
| A5 | `@neondatabase/serverless` `Pool` works on Node 24 using the global `WebSocket`, and its `Pool`/`Client` API matches node-postgres closely enough for one interface (`connect`, `query`, `release`, `end`) | read `node_modules/@neondatabase/serverless/README.md` "Pool and Client" (≤150 lines); unit test with a fake `WebSocket` in A-6 |
| A6 | `libpg-query` (real PostgreSQL parser, WebAssembly) loads in a Vercel Node function within the size limit | `npm view libpg-query version dist.unpackedSize` (18.1.5, ~1.8 MB at writing); B-3 checks it in a preview build |
| A7 | `@modelcontextprotocol/sdk` installs under Node 24 | `npm i` in A-1 (1.32.1 at writing) |

If any row is false, stop and report; the design may need amending.

## 1. Decisions (made — do not re-open)

**A1. A separate, hosted, standalone server.** It follows the Robinson Tool Contract (RTC 1) so the hub can combine it
later, but it never depends on the hub: connector, HTTPS API and passes all work without it (Chris, 2026-10-10).

**A2. Copy, don't reinvent.** Contract-generic code is copied from the first available source in row A1. First line of
each copied file: `// Copied from <repo> <path> @ <commit>`. Contract-generic code lives in `src/core/` and imports
nothing from `src/neon/`, `src/tools/` or any Neon package (a grep test in `npm run check` enforces it), so the hub can
extract or replace it with `robinson-mcp-core`.

**A3. Keys live encrypted in this server's database; there is no plain copy and no fallback.** `TOKEN_ENCRYPTION_KEY` is
required. Without it the setup page refuses to store a key and every tool returns a plain message saying what to set.

**A4. A Neon key never passes through an AI.** Keys are added only on `api/neon/setup.js`, behind the passphrase and the
same lockout as the connector login. No tool takes a key argument; no result, log, change-log row or test contains one.

**A5. Keys are stored per Neon organization, by kind, and each tool uses the narrowest kind that can do its job.**
Kinds: `project` (project-scoped key; one per project; Editor on that project; cannot delete it or change access),
`org` (organization key; admin-level; optional), `personal` (accepted only when the account has no organization; not
recommended). Each tool declares `key: 'project' | 'org'` in its metadata; the client picks the project key for the
target project, falls back to the org key only for tools that need it or when no project key exists for that project,
and otherwise answers in words which key to add. On adding a key the setup page calls `GET /auth` (`auth_method`
`api_key_user` or `api_key_org`) and probes reach (list projects; for an org key, list members) and stores the result.
The final choice is IN-04.

**A6. Each connection is bound to one organization, one mode, one profile, one listing mode, and optionally one
project**, chosen at login. Modes: `preview` (default; production writes refused with code `refused_by_guard`) and
`production` (offered only when `production_enabled` is true for that organization — Batch B, B-2). Profiles
(`read_only`, `everyday`, `full`) and listing modes (`catalog`, `compact`) are defined in Batches B and C; A stores
them. A project-scoped connection refuses tools on other projects with code `outside_scope`.

**A7. The Neon API description is vendored and pinned by date and hash.** Neon has no dated API versions, so
`vendor/neon-openapi/v2.json` (or `.yaml`) plus `vendor/neon-openapi/SOURCE.md` (URL, download date, SHA-256, operation
count) is the pinned contract; `@neon/sdk` is pinned to an exact version. `scripts/openapi-find.mjs "<words>"` prints
matching operations (method, path, operationId, summary; ≤20 lines). `scripts/neon-api-drift.mjs` downloads the live file
(when reachable) and lists added/removed/changed operations; moving the vendored file is its own card.

**A8. One Neon client, retries only when nothing happened.** `src/neon/client.js` is the only file that imports
`@neon/sdk` (a grep test enforces it). It uses the SDK's `raw` functions with `retries: 0` and its own policy: retry
**423 Locked** and **429** (the request was not executed) with backoff (0.5 s, 1 s, 2 s, max 3 tries, inside the wait
budget); never resend a write after a 5xx, timeout or network error — instead `findExisting(requestKey)` looks for the
object by its annotation and reports `confirmed: null` if it cannot tell.

**A9. Request keys and annotations make retries safe.** `requestKey(ctx, tool, args)` =
`rmcp_<tool>_<sha256(org, project, tool, canonical JSON of args without dryRun/confirm/fields/detail)>_<10-minute
bucket>`, or the caller's `requestKey`. The change log stores it; a second call with the same key inside 10 minutes
returns the first result. Objects that accept annotations (branches; a new project's default branch) get
`rtc_request=<requestKey>` (and `rtc_run=<runId>` for developer runs, Batch V).

**A10. Asynchronous operations have one bounded waiter.** `waitForOperations(projectId, operations, { budgetMs })` polls
`GET /projects/{project_id}/operations/{operation_id}` once a second until every operation is `finished` or `skipped`,
any is `failed`/`error`/`cancelled` (→ plain-English error with the operation's action), or the budget ends (stored
setting `operation_wait_seconds`, default 20, maximum 45 — under Vercel's function limit). Out of budget → the tool
returns `{ done: 'pending', operations, next: 'operation_get with waitSeconds' }` and `confirmed: null`. Never an
unbounded loop.

**A11. The server counts its own Neon API calls.** Neon allows 700 requests a minute. Every call through the client
increments a database counter per key per minute (`rate_limits`, one atomic upsert — the same table R-2 uses for passes);
over the stored budget (`neon_api_budget_per_minute`, default 500) the tool answers `rate_limited` with the seconds to
wait, before calling Neon.

**A12. Secrets travel through the setup page only, in both directions.** `one_time_secrets` (outbound) holds encrypted
secrets Neon returns once or that Chris asks to see — role passwords, connection strings, new API keys, claim links,
passes — shown once behind the passphrase for 10 minutes, then deleted. `secret_requests` (inbound) lets a tool ask Chris
to type a secret it needs (an OAuth client secret, an SMTP password): the tool returns a link, Chris types the secret on
the setup page, the tool's follow-up call consumes it once; it is never stored after use.

**A13. Previews of this server never hold production power.** Vercel previews of this server share its database. On any
non-production deployment (`VERCEL_ENV !== 'production'`): every connection is forced to `preview` mode, the setup page
refuses to enable production access, and `org`-key tools are refused. Mirrors Appliance Desk's
`deployment-safety.ts`.

**A14. The SQL connection layer is part of the foundation.** `src/neon/sql.js` gets a connection URI server-side
(`GET /projects/{id}/connection_uri` with branch, endpoint, database, role, `pooled`), keeps it in memory for one request,
and opens a `@neondatabase/serverless` `Pool` (WebSocket, interactive transactions) — or, in tests, a `pg.Pool` with the
same interface. It never logs, returns or stores the URI. Batch B builds the SQL guard on top of it.

**A15. This server's own database is never a target.** At startup the server resolves its own `DATABASE_URL` host to
the Neon endpoint/branch/project when a stored key can see it, and adds it to the protected-resources list as
`{ kind: 'self' }` (B-2). The SQL layer refuses any URI whose host equals `DATABASE_URL`'s host, even before B-2 exists.

**A16. Runtime is Node 24.x** (amends the shared "Node 20" decision; Vercel disabled Node 20 deployments on 2026-10-01).
Code uses only features available in Node 20.19+, plain ES modules, no build step.

## 2. Schema (additive; A-2 creates these, later batches add their own)

```sql
CREATE TABLE IF NOT EXISTS neon_orgs (
  id TEXT PRIMARY KEY,                       -- Neon org id (never committed to the repo)
  label TEXT NOT NULL,                       -- "Robinson AI Systems"
  production_enabled BOOLEAN NOT NULL DEFAULT FALSE,   -- B-2 turns it on (two steps)
  production_enabled_at TIMESTAMPTZ,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS neon_keys (
  id BIGSERIAL PRIMARY KEY,
  org_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('project','org','personal')),   -- A5
  project_id TEXT,                           -- set for kind 'project'
  key_enc TEXT NOT NULL, last4 TEXT NOT NULL, label TEXT,
  reach JSONB,                               -- probe result (A-5)
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(), checked_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS neon_keys_one_per_scope
  ON neon_keys (org_id, kind, COALESCE(project_id, '')) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS oauth_clients (client_id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS oauth_codes (code TEXT PRIMARY KEY, client_id TEXT NOT NULL, data JSONB NOT NULL,
  neon_org TEXT, project_scope TEXT, mode TEXT NOT NULL DEFAULT 'preview', profile TEXT NOT NULL DEFAULT 'everyday',
  listing TEXT NOT NULL DEFAULT 'catalog', expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_tokens (token_hash TEXT PRIMARY KEY, client_id TEXT, refresh_hash TEXT,
  neon_org TEXT, project_scope TEXT, mode TEXT NOT NULL DEFAULT 'preview', profile TEXT NOT NULL DEFAULT 'everyday',
  listing TEXT NOT NULL DEFAULT 'catalog', kind TEXT NOT NULL DEFAULT 'connector',   -- 'pass' added in Batch R
  expires_at TIMESTAMPTZ, last_used_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS login_attempts (id BIGSERIAL PRIMARY KEY, ip TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(), success BOOLEAN NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT NOT NULL, window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (key, window_start));          -- A11 now, R-2 for passes
CREATE TABLE IF NOT EXISTS change_log (id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(),
  neon_org TEXT, project_id TEXT, branch_id TEXT, mode TEXT, connection TEXT, tool TEXT NOT NULL, target TEXT,
  summary TEXT NOT NULL, before JSONB, after JSONB, dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  production BOOLEAN NOT NULL DEFAULT FALSE,           -- B-2 decided the target was production
  spend_month_cents BIGINT,                            -- B-4 worst-case monthly increase, when any
  request_key TEXT, operation_ids TEXT[], confirmed TEXT,   -- 'true' | 'false' | 'null' | 'pending'
  restore_lsn TEXT,                                    -- B-3: branch LSN captured before a production SQL write
  inverse JSONB, undone_by BIGINT);
CREATE INDEX IF NOT EXISTS change_log_request_key ON change_log (request_key, at);
CREATE TABLE IF NOT EXISTS one_time_secrets (id TEXT PRIMARY KEY, neon_org TEXT, kind TEXT NOT NULL,
  label TEXT NOT NULL, ciphertext TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL, viewed_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS secret_requests (id TEXT PRIMARY KEY, neon_org TEXT, tool TEXT NOT NULL, purpose TEXT NOT NULL,
  ciphertext TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by TEXT);      -- defaults seeded by B-2/B-3/B-4, never overwritten
```

Tokens are stored hashed (SHA-256). Money and prices: integer cents for totals, integer micro-dollars for unit rates
(Neon's $0.106 per CU-hour = 106000), shown with `_display` dollars.

## 3. Shared primitives

```js
// src/neon/client.js — the only file that imports '@neon/sdk'
export const NEON_SDK_VERSION = '<exact>';                  // also printed by neon_whoami
export function makeNeonClient({ key, orgId, budget }): NeonClient;      // raw functions, retries: 0 (A8)
export async function call(client, operationId, params, { write }): { data, operations? };   // 423/429 policy, budget (A11)
export function requestKey(ctx, tool, args): string;                     // A9
export async function findExisting(client, { projectId, requestKey }): object | null;
export async function listAll(fn, params, { max = 1000 }): { items, capped: boolean };    // cursor pagination
// src/neon/operations.js
export async function waitForOperations(client, projectId, operations, { budgetMs }): { done: true | 'pending', operations };
// src/neon/keys.js
export async function storeKey({ orgId, kind, projectId, key }): { orgId, kind, projectId, last4, reach };
export async function keyFor({ orgId, projectId, need: 'project' | 'org' }): { key, kind } | { missing: string };   // decrypt per request
// src/neon/sql.js
export async function withSqlClient(ctx, { projectId, branchId, database, role, pooled }, fn): any;  // A14; refuses self (A15)
// src/core/one-time.js (contract-generic)
export async function putOneTimeSecret({ kind, label, secret, org }): { link };       // A12 outbound
export async function requestSecret({ tool, purpose, org }): { id, link };            // A12 inbound
export async function takeRequestedSecret(id): string;                                 // once, then deleted
```

## 4. Work units (in order)

### A-1 — Repository, test harness, CI and doc checks
Files: `package.json` (`"type": "module"`, engines node 24.x), `.github/workflows/ci.yml`, `vitest.config.js`,
`vitest.db.config.js`, `scripts/{check-secrets,check-docs-updated,check-writes,check-budgets,check-core-imports}.mjs`
(writes/budgets start by passing on an empty registry **and saying so**), `scripts/local-postgres-test.sh`,
`test/helpers/{fake-db,pg-neon-adapter}.js`, `test/contract/db-contract.js`, `test/helpers/fake-neon.js` (exact API in
`docs/pr-cards/A-1.md`), `src/tools/index.js` (empty registry), `README.md`.
Tests: fake-neon records calls and returns configured operations; secret scan fails on planted key-shaped strings
(prove, remove). Done when: `npm run check`, `npm test`, `npm run test:db` pass locally and in CI; a deliberately failing
test turns CI red once.

### A-2 — Database schema
Files: `src/db.js` (all SQL; `initSchema()` idempotent), fake and contract updated.
Tests: contract against fake and real Postgres; `initSchema()` twice changes nothing; the partial unique index allows a
new key after the old one is revoked.

### A-3 — Connector login (organization, mode, profile, listing, project scope)
Files: `api/oauth/*`, `api/well-known/*`, `src/core/oauth/*`, `api/mcp.js` (zero tools until B), `api/index.js` (home page
prints counts).
Change: port the login; the authorize page shows the organization dropdown, optional project scope (projects the stored
keys can see), mode (`preview` only unless `production_enabled`; never on a non-production deployment — A13), profile,
listing, passphrase. Hash tokens. **Settings survive refresh**: `neon_org`, `project_scope`, `mode`, `profile`,
`listing` are stored on the code and the token row; one helper copies every connection setting from the issuing row for
both grant types.
Tests: 5 wrong passphrases in 15 minutes lock the address (database-backed); a forged `mode=production` is refused when
not enabled and always on a preview deployment; refresh only for the same client; revoked tokens refused; tokens stored
hashed; after a refresh the new token keeps organization, project scope, mode, profile and listing (unit + database
test); a test fails if a connection-setting column is added to `oauth_tokens` but not copied by the helper.

### A-4 — Neon client, vendored API description, operations waiter, API budget
Files: `src/neon/client.js`, `src/neon/operations.js`, `src/neon/openapi-index.js`, `vendor/neon-openapi/{v2.json|v2.yaml,SOURCE.md}`,
`scripts/openapi-find.mjs`, `scripts/neon-api-drift.mjs`, `docs/audits/2026-10-10-research.md` Appendix A regenerated
from the vendored file (only the table).
Tests: every fake-neon fixture validates against the vendored description (method, path, required body fields); 423 then
200 → one retry and success; 429 three times → `rate_limited`; 500 on a create → no resend, `findExisting` consulted,
`confirmed: null` when not found; waiter: finished, failed (plain error), budget exceeded → `pending`; the budget counter
refuses call 501 in a minute across two client instances sharing one database (overlapping calls); a grep test proves
only `src/neon/client.js` imports `@neon/sdk`; `requestKey` stable across `dryRun`/`confirm`/`fields`/`detail`, changed by
`requestKey`.

### A-5 — Encrypted key store, setup page, one-time secrets both ways
Files: `api/neon/setup.js`, `src/neon/keys.js`, `src/core/one-time.js`, `src/tools/server.js` (`neon_whoami`,
`neon_list_accounts`, read-only).
Change: paste key → `GET /auth` and reach probe → store encrypted with kind and last 4; list keys per organization with
reach; revoke a stored key; view one-time secrets; answer secret requests; view (not yet edit) settings.
Tests (fake keys only, e.g. `napi_FAKE…`): stored value is ciphertext; wrong encryption key gives a plain error, never the
key; a key-scan test scans every tool result and change-log row the unit suite produced and fails on key-, password- or
connection-string-shaped text; one-time secret shown once then gone; a secret request is consumed once and then
unreadable; a project-scoped key is never used for another project.

### A-6 — SQL connection layer
Files: `src/neon/sql.js`, `test/helpers/sql-client.js` (`pg.Pool` factory for tests).
Change: A14 and A15. Statement timeout and lock timeout set per session from settings (B-3 seeds them; A-6 uses safe
constants until then: 15 s / 5 s).
Tests: the URI is fetched with `pooled` as asked and never appears in results, errors or logs (error messages are
rebuilt without it); a URI whose host equals `DATABASE_URL`'s host is refused; the test factory runs real queries on
throwaway Postgres; a connection is always released (also after an error).

### A-7 — DEPLOY.md (docs) `[light effort]`
Files: `docs/DEPLOY.md`.
Change: Vercel project (Node 24.x), this server's own Neon database (it becomes a protected resource automatically), env
vars (`DATABASE_URL`, `ADMIN_PASSPHRASE`, `PUBLIC_BASE_URL`, `TOKEN_ENCRYPTION_KEY`), generating the encryption key, which
Neon keys to create and where (IN-04: project-scoped keys per project; optional organization key), adding them on the
setup page, adding the connector in claude.ai (preview mode first).
Done when: a reviewer pretending to be Chris can follow it without a question.

## 5. Stop-and-ask points

1. Any row of section 0 false.
2. Neon's key-type behavior differs from the research audit §4 (e.g. a project-scoped key can delete its project): stop,
   record what Neon answered, amend A5.
3. Anything requiring a paid Vercel/Neon plan (IN-02).

## 6. Acceptance mapping

| PLAN Batch A line | Evidence |
|---|---|
| CI with all checks | A-1 CI run |
| Login, lockout, hashed tokens, settings survive refresh, previews forced to preview mode | `tests/unit/oauth*.test.js`, `tests/db/oauth-refresh.test.js` |
| Keys encrypted, never exposed, narrowest key per tool | `tests/unit/keys.test.js`, key-scan test |
| Pinned description, safe retries, bounded waits, API budget | `tests/unit/client.test.js`, `tests/unit/operations.test.js`, `tests/db/api-budget.test.js` |
| SQL layer never leaks the URI; never touches this server's own database | `tests/unit/sql-layer.test.js`, `tests/db/sql-layer.test.js` |

## Amendments

(Dated entries only.)
