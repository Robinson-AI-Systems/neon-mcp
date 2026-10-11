**B-6 result safety and profile filtering (PR #32):** shared nested provider secret scrub, audit snapshot minimization, safe additive money/size/Denver-time display, metadata-based profile enforcement and home-page counts. No SQL tools published, no owner approvals changed. Next: B-7 declaration enforcement.

# STATUS — current work, blockers and next action

**Workflow guidance (#31, docs only):** AGENTS, SESSION-START §6 and PLAYBOOK Step 4 now direct agents without a local checkout, terminal or PostgreSQL to use authenticated GitHub REST for branch/PR/file operations and GitHub Actions check/unit/disposable-db logs as remote test evidence. They must state local tests were unavailable, fix CI failures, self-review and merge only on green exact-head `ci`. This adds no product capability and does not change B-6 as the next approved unit.


**B-5 plain-English errors completed (#30):** `src/neon/errors.js` now normalizes Neon 401/403/404/409/423/422/429, plan/branch constraints and 14 PostgreSQL SQLSTATE families to redacted, actionable messages with safe technical IDs. The Neon client uses the formatter; the private SQL read runner maps driver failures and reconnects only once on an AST-verified read-only connection reset, never a write. Tests cover mapping, redaction and replay limits. Next: B-6 result shaping, secret removal and profile filtering (JIT card); no live Neon account, new tools, production activation or spend.


**B-3 private SQL foundation completed (#22/#23/#24/#26–#29).** PR #29 seeds persisted `sql.affected_rows_tolerance` = 0 and validates configured limits before any token/audit/SQL; rollback compares actual counts against the trusted policy. Durable child preview/token, SQL read, internal guarded apply, WAL checkpoint, B-4 spend adapter and explicit estimate fallback are in code with tests. **Next B-5 plain-English errors** (JIT card). D-5 still owns tool registration and actual `defineWrite`/authenticated context injection; X-3 owns real scratch Neon restore proof. No production activation or live Neon changes.

**B-3d SQL estimate fallback (#28):** on an independently verified branch-limit or budget-capacity problem, private read-only EXPLAIN produces estimated DML counts and a clearly inexact, 30-minute, one-use token. Production apply requires `acceptEstimate:true`; exact previews retain zero-tolerance row-count rollback. No SQL tool published and no real Neon account used. Remaining B-3: owner-configurable SQL affected-row tolerance (default zero), complete successor interface checks; later D-5 owns public registration and trusted admission wiring.

**B-3d spending admission adapter (#27):** private `createSqlAdmissions` wires SQL preview cost reservation to B-4's atomic per-org/day cap and explicit owner confirmation, and SQL apply approval to B-4 persisted policy. No tool exposed or production turned on. Next B-3d work: branch-limit/budget estimate fallback and concrete D-5 guards/read-back wiring.

**B-3d guarded apply foundation merged (#26):** private SQL apply now checks protected/production/app/spend admission, atomically claims one-use bound exact token, persists restore WAL LSN before running SQL, compares exact row counts in one transaction and rolls back mismatch; ambiguous commits remain pending. Unit/real-Postgres tests added. No public SQL tools or production activation. Remaining B-3d: documented branch-limit/price estimate fallback and D-5 provider-backed admission/read-back integration; do not claim full B-3 finished until all gates pass.

**B-3a classifier merged (#22):** parser-only fail-closed classification with 100+ fixtures; B-3 remains IN_PROGRESS. SQL read runner, disposable exact preview, bound token, LSN and guarded apply still pending; no SQL tool exposed. **IN-09 and IN-10 defaults approved by owner 2026-10-11**, but neither stored runtime setting has yet been verified or applied. Production activation stays OFF. **B-3b authorized read runner merged (#23):** database-seeded IN-09 defaults (200 rows, production SELECT enabled), protected-resource + trusted-branch checks, read-only transaction and rollback, safe SQL errors. Remains unexposed until D-5; exact preview, durable token and guarded apply still pending. **B-3c exact child SQL previews / durable tokens merged (#24):** temporary branch creation, bounded operations, SQL counts, schema diff digest, cleanup, 30-minute one-use hash-bound tokens in additive change_log storage; requires explicit previewAdmission guard before API writes, not yet wired to MCP. **B-4 spending guard (#25):** owner-approved $25/change, $50/day limits now seeded and enforceable by private pricing/guard modules with atomic PostgreSQL daily admission, confirmed previews and dated micro-dollar pricing. No spending tools are exposed, and no live spend was authorized. Next: B-3d guarded SQL apply (preview token, restore LSN, count rollback), then B-5 errors.

**B-2 completed (#18/#19/#20):** trusted production classifier, absolute protection, secure owner resource editor and owner-production access two-step request/passphrase mechanism. All production flags remain OFF; X-2/X-3 and IN-07/08 approval gates are enforced by default. Only two internal control tools are newly visible to full-profile connectors on an approved production deployment; no Neon project write tools yet.

**B-2b protected-resources owner editor merged (#19):** owner-only form secured by same-origin POST and passphrase, own-project environment/host verification, immutable automatic self protection, safe list editing and tests. Production access still disabled; B-2c is next.

**B-2a production classification and absolute self-protection merged (#18):** safe target verification uses only Neon-fetched default/protected flags plus trusted profiles; protected list and own-project identity fail closed. No write tools or production access enabled. B-2b owner authorization remains.

**B-1 guarded write lifecycle merged (#17):** durable atomic change-log reservation, request-key deduplication, confirmation, fail-closed safety interfaces and operation-aware Neon adapter; test fixtures exercise all nine contract cases. No new write tool is exposed.

**A-7 deployment instructions merged (#16):** owner-only, preview-first guidance in `docs/DEPLOY.md`; no infrastructure, keys, credentials, or live access created. Batch A documentation complete; Batch B safety layer next.

Updated 2026-10-11. **A-6 SQL connection layer merged (#15):** guarded Neon URI lookup, self-database
host exclusion, statement/lock timeouts, credential-safe error/result handling and connection cleanup,
with fake-Neon and disposable PostgreSQL verification. No SQL MCP tool is exposed.
**A-5c owner setup and first read tools merged (#14):** passphrase/Origin-guarded
key setup, revocation, one-time secret viewing/submission and exactly two scoped read-only MCP tools.
**A-5b one-time secret exchange merged (#13):** inbound and outbound ciphertext, expiry, org-bound
single-use consumption through guarded backend functions, disposable database and fake-unit tests.
**A-5a encrypted key storage merged (#12):** authenticated ciphertext, scoped organization and
project key persistence, verified Neon identity/reach, fail-closed missing credentials, and fake/isolated-Postgres tests.
**A-4b shared budget and API description tooling merged (#11):** database-atomic 500/minute API admission
across serverless instances, secret-safe key hashing, pinned OpenAPI lookup/diff tools, isolated-Postgres coverage.
**A-4a official Neon client and operation waiter merged (#10):**
SDK raw calls only through one entrypoint; retries only for 423/429, ambiguous writes never automatically
resent, request keys, bounded waits and budget enforcement by injected fail-closed budget. No live account was called.
**A-3b OAuth endpoints merged (#9):** secure OAuth authorization, registration, token exchange and refresh
routes, metadata, and a default-deny MCP endpoint exist in code. **A-3a OAuth primitives merged (#8):** OAuth client registration, hashed grants, one-use codes,
atomic refresh and database-backed login attempts now exist. **A-2 database schema merged (#7):** the 11 additive foundation tables, partial key uniqueness and
expiry indexes exist in code and are verified by isolated-Postgres tests. No live database is provisioned; OAuth and setup endpoints exist in code and two safe owner read tools are registered, and no real Neon account was accessed.

## Next

- **Next: B-3 — SQL guard and preview/apply safety.** IN-09 (200-row production read-only SQL) and IN-10 ($25/change, $50/day) approved 2026-10-11, not yet applied. B-3 runner/preview/apply and B-4 spending guard remain to implement. No real-account activation.
- **Answered 2026-10-10 (Chris):** IN-00 — plan approved ("I approve the plans"); IN-01 — **no automated review** ("I don't want the automated review at this time"); the repository stays public as Chris created it; the implementer self-reviews every diff.
- **Queue:** A → B → C → D → V → O → P → W → U → R → E → X (`MASTER-ROADMAP.md`).

## Environment

- Repo: `Robinson-AI-Systems/neon-mcp`, default branch `main`; every change goes through an `ai/*` branch and a PR.
- CI: `.github/workflows/ci.yml` — jobs `check`, `unit`, `db` and the aggregate `ci` (the merge gate). Proof that it
  really fails and passes: PR #1 description (red-proof run and final green run).
- Commands: `npm ci`, `npm run check`, `npm test`, `npm run test:db` (`docs/ARCHITECTURE.md` "Test harness").
- Vercel project, this server's own Neon database and Neon API keys: not created yet (IN-02, IN-03, IN-04).
- Runtime: Node 24.x (Vercel stopped deploying Node 20 on 2026-10-01; see DECISIONS).

## Implementation guidance

Concrete recipes, remaining-unit routes and a B-3 worked example live in
`implementation-contracts/IMPLEMENTATION-RECIPES.md`; startup and card-writing instructions link them.
Documentation only; no product card is completed by this guidance. Baseline inspected: PR #20 main.
IN-09 remains an owner decision **before B-3 merges** (OWNER-INPUTS), not merely before real use.

## Recent work (newest first)

**2026-10-11 — A-7 documentation (#16):** clear owner-only deployment and rollback instructions; README link, exact environment variables, approved preview checks and hard production/spend gates. No cloud resources created.

**2026-10-11 — A-6 SQL connection layer (#15):** one guarded API URI lookup, host comparison protecting
this server's own DB, 15-second statement/5-second lock limits and guaranteed cleanup; no SQL tools exposed.


**2026-10-11 — A-5c setup and read-only tools (#14):** owner page for key addition/revocation and one-time
secrets, passphrase lockout, strict same-origin POST, scoped organization and project selection, first two MCP tools.


**2026-10-11 — A-5b one-time secrets (#13):** an outbound encrypted view-once link, inbound secret
request submission and consume-once retrieval, scoped by organization and 10-minute expiry. No secret in any URL.


**2026-10-11 — A-5a encrypted key vault (#12):** AES-256-GCM AAD scope binding; stored key ciphertext only; API
identity and project visibility verified via fake/real-capable Neon client with database-backed budget; key reach tests.


**2026-10-11 — A-4b budget and OpenAPI tools (#11):** rate_limits-backed atomic per-key admission, 501st call
refused, SHA-256 key identifier, prune of expired windows, offline method lookup and bounded public-spec drift compare.


**2026-10-11 — A-4a client and waiter (#10):** SDK 7.0.1 raw wrapper with no automatic SDK retries,
explicit 423/429 backoff, write uncertainty reconciliation, stable request keys, bounded operation waiter,
cursor-aware pagination and fake-Neon unit tests. Budget must be supplied or calls fail closed; A-4b persists it.


**2026-10-11 — A-3b endpoints (#9):** OAuth authorization, registration, token rotation, metadata and
MCP bearer boundary (zero tools); production gate and project scope fail closed; unit and disposable-Postgres tests.


**2026-10-11 — A-3a primitives (#8):** OAuth PKCE, hash/redirect helpers, connector-client and code tables,
atomic refresh with connection settings, login attempt persistence and unit/isolated-Postgres tests.


**2026-10-11 — A-2 schema (#7):** additive, idempotent internal tables and indexes, no key material or real Neon
calls; test coverage includes Postgres uniqueness/revocation, connector defaults, protected mode and ciphertext columns.


**2026-10-10 — CI cadence (docs + CI config PR):** never push while a PR's CI run is in progress (SESSION-START §6,
PLAYBOOK Step 5); obsolete PR runs are cancelled, runs on `main` never are. Next action unchanged.

**2026-10-10 — A-1 foundation merged (#1), by Claude (Opus 5.5):** `package.json` (Node 24.x, ES modules, exact
versions) and `package-lock.json`; Neon's API description vendored (fallback source; the live URL was unreachable — BATCH-A
amendment); `test/helpers/fake-neon.js` (validates requests, operations, 423/429), schema-valid fixtures, proof that the
real `@neon/sdk` works through it; secret scan with planted-key tests; docs, index, lint, write-safety, core-import and
budget checks with tests; throwaway Postgres harness (read-only transactions, timeouts, rollback proven on real
Postgres); CI with a deliberately failing test run recorded red, then green. Cards A-2 and A-3 written.


**2026-10-10 — Gap check against prior toolkits:** every Neon tool name Chris built or planned in any Robinson toolkit
(333 names across `robinsons-toolkit-mcp`, `robinsonai-mcp-servers`, `robinsons-toolkit-api`) mapped in
`audits/2026-10-10-prior-tools.md`: 300 covered, 30 dropped with reasons, 3 gaps added as card D-9
(`neon_branch_compare_data`, `neon_schema_list_migrations`, `neon_health_reindex`); SQL guard amendment (BATCH-B). Needs from
Cortiware, oldReplit, Household-Assistant and Appliance Desk checked. Totals now **173 hand-built + 4 universal = 177
tools, 53 cards** (old-toolkit decision note dropped) (the entry below is the original plan's count).

**2026-10-10 — Plan written (initial commits):** research audit (Neon API ≈180 operations, the old toolkit's 204 tools
with 13 verified bugs including 17 unreachable tools and a SQL path that never authenticates, the official Neon
connector compared, credentials, coverage matrix), AGENTS, START-HERE, SESSION-START, PLAYBOOK, drift protocol, PLAN,
MASTER-ROADMAP, 12 batch designs, TOOL-CATALOG (170 hand-built tools + 4 universal), Appliance Desk project profile,
owner inputs, go-live checklist, decisions, roadmap, owner guide, work index with validator (53 cards), first card A-1.

## Blocked

Nothing in engineering. Owner inputs open: IN-02 … IN-13 (IN-14 answered: not needed)
(`OWNER-INPUTS.md`); none blocks A-2 … A-4.
