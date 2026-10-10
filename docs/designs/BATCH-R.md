# Design — Batch R: Hub-ready doors (Robinson Tool Contract, RTC 1)

Status: **DRAFT — awaiting Chris's approval (IN-00)**. Written 2026-10-10. Scope and acceptance: `docs/PLAN.md` →
Batch R. Cards R-1 … R-3. Depends on Batches B and C. Same design as the Stripe MCP's Batch R (as amended 2026-10-10),
with Neon's modes.

Chris (2026-10-10) chose this architecture: each service gets its own solid, hosted server, and **Robinson's Toolkit**
(`Robinson-AI-Systems/robinsons-toolkit-hub`, the hub) combines them into one MCP, CLI and HTTPS API. This server
provides only the doors every server provides under RTC 1 (authority: the hub's `docs/CONTRACT.md`): passes, the HTTPS
tool API and the contract manifest. The `rtool` CLI, code SDK, local MCP, GitHub relay and agent recipes are built once,
in the hub. **This server never depends on the hub** (Chris, 2026-10-10): agents reach it through its connector, its
HTTPS API, or the hub repo's `rtool`/relay talking to it directly.

## 0. Verify before starting

| # | Assumption | How to check |
|---|---|---|
| R1 | `neon_call` dispatches through wrapped handlers (C-2) | `grep -n "neon_call" src/core/meta.js src/tools/*.js \| head` |
| R2 | The contract version is still RTC 1 | read the hub's `docs/CONTRACT.md` header; if newer, implement the newest and note it |
| R3 | The hub's conformance package exists (hub card K-2) | look for `packages/conformance` in the hub repo; if not yet, R-3 waits and R-1/R-2 proceed |

## 1. Decisions

**R1. Passes** (RTC §2): `oauth_tokens.kind = 'pass'`; created only by Chris with `neon_create_pass` (confirm) or the
setup page; shown once on the one-time page, never in chat. Defaults: `preview` mode, `read_only`, 24 hours,
`allow_writes` false, all areas, organization required, optional project scope. Writes, `production` mode (only for an
organization with production access enabled; also needs the setup-page passphrase), chosen areas, a project scope and a
longer life (≤30 days; ≤365 days only for a pass marked "for Robinson's Toolkit") are explicit choices. Passes are listed
by `neon_list_connections` and revoked by `neon_revoke_connection`. Neon has no money-moving operations, so the RTC
money limit is fixed at $0 and not offered; the spend caps (B-4) apply to passes like any connection.

**R2. HTTPS tool API and manifest** exactly as RTC §1 and §7: `GET /api/contract` (no auth) →
`{ rtc: 1, server: 'neon-mcp', version, apiVersion: '<vendored description date + hash prefix>', areas, counts: { tools,
writes, money: 0 }, profiles, listingModes: ['catalog','compact'], modes: ['preview','production'], devTools: true }`;
`GET /api/whoami`, `GET /api/tools`, `GET /api/tools/{name}`, `POST /api/tools/{name}`, `POST /api/tools/_batch`,
`GET /api/results/{handle}`; pass-only auth; the RTC result envelope and error codes. Rate limit per pass, shared across
serverless instances: the `rate_limits` table (A-2) with one atomic `INSERT … ON CONFLICT (key, window_start) DO UPDATE
SET count = rate_limits.count + 1 RETURNING count`, one-minute windows; the limit is stored per pass in
`oauth_tokens.rate_limit_per_minute` (starting value **60**, allowed 1–300, IN-11 — lower than Stripe's 120 because every
tool call can cost several Neon API calls against Neon's 700/minute account limit), chosen when the pass is created, shown
by `neon_list_connections`, read from the pass row on every call; over the limit → HTTP 429 with `Retry-After` and code
`rate_limited`. Never an in-memory counter. `GET /api/openapi.json` (generated, ≤30 operations: meta tools, whoami,
workflows) for HTTP-only agents.

**R3. Conformance in CI, never a blocker.** When the hub's `packages/conformance` exists it runs in this repo's CI
against a locally started server (fake Neon, throwaway Postgres) with **two server processes sharing one database** for
the rate-limit check; a failure fails `ci`. Until then this server's own write-contract tests over MCP, `neon_call` and
HTTPS cover the same behavior.

**R4. Contract code lives in `src/core/`** (A2): passes, HTTPS doors, manifest, meta-tools, result rules, write layer,
error envelope. When the hub ships `robinson-mcp-core`, a card here switches to the package.

## 2. Schema

```sql
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS allow_writes BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS areas TEXT[];
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS for_hub BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS rate_limit_per_minute INTEGER NOT NULL DEFAULT 60;
```

(`rate_limits` exists since A-2.)

## 4. Work units

### R-1 — Passes (M, medium effort)
Tests: shown once; expired → `pass_expired`; revoked → `pass_revoked`; read-only pass cannot write through `neon_call` or
HTTPS; production mode refused for an organization without production access; 365-day life only with `for_hub`;
project-scoped pass refused outside its project (`outside_scope`).

### R-2 — HTTPS tool API, manifest, OpenAPI (M)
Tests: write-contract helper through HTTPS (door #3); envelope and error codes per RTC §7; manifest counts match the
registry and `modes` is `['preview','production']`; OpenAPI valid with ≤30 operations; connector tokens and no token
refused on `/api/tools`; rate-limit database test with two independently created handler instances sharing one pass's
limit, sending **overlapping** requests (e.g. 80 at once split across both, `Promise.all`): exactly 60 succeed and the
rest get 429 — a read-then-update counter fails this test; a pass created with limit 5 gets 429 on its 6th call; old
windows are cleaned up.

### R-3 — RTC 1 conformance in CI (S)
Done when: the hub's conformance package passes in this repo's CI against a local server with fake Neon.

## 5. Stop-and-ask points

1. The contract and this design disagree: the contract wins; amend this design in the same PR.

## 6. Acceptance mapping

| PLAN Batch R line | Evidence |
|---|---|
| Passes per RTC §2 | `tests/unit/passes.test.js` |
| HTTPS API per RTC §1/§7, same guards, shared rate limits | write-contract through HTTPS; `tests/db/rate-limit.test.js` |
| RTC 1 conformance | CI job `conformance` |

## Amendments
