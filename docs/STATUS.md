# STATUS — current work, blockers and next action

Updated 2026-10-11. **A-4a official Neon client and operation waiter merged (#10):**
SDK raw calls only through one entrypoint; retries only for 423/429, ambiguous writes never automatically
resent, request keys, bounded waits and budget enforcement by injected fail-closed budget. No live account was called.
**A-3b OAuth endpoints merged (#9):** secure OAuth authorization, registration, token exchange and refresh
routes, metadata, and a default-deny MCP endpoint exist in code. **A-3a OAuth primitives merged (#8):** OAuth client registration, hashed grants, one-use codes,
atomic refresh and database-backed login attempts now exist. **A-2 database schema merged (#7):** the 11 additive foundation tables, partial key uniqueness and
expiry indexes exist in code and are verified by isolated-Postgres tests. No live database is provisioned; OAuth endpoints exist in code but no Neon tools are registered, and no real Neon account was accessed.

## Next

- **Next: A-4b — persistent shared API budget, OpenAPI lookup and drift tooling** (`pr-cards/A-4.md`).
  Then A-5 → A-6 → A-7. A-4a (#10) introduced the guarded SDK client and waiter.
- **Answered 2026-10-10 (Chris):** IN-00 — plan approved ("I approve the plans"); IN-01 — **no automated review** ("I don't want the automated review at this time"); the repository stays public as Chris created it; the implementer self-reviews every diff.
- **Queue:** A → B → C → D → V → O → P → W → U → R → E → X (`MASTER-ROADMAP.md`).

## Environment

- Repo: `Robinson-AI-Systems/neon-mcp`, default branch `main`; every change goes through an `ai/*` branch and a PR.
- CI: `.github/workflows/ci.yml` — jobs `check`, `unit`, `db` and the aggregate `ci` (the merge gate). Proof that it
  really fails and passes: PR #1 description (red-proof run and final green run).
- Commands: `npm ci`, `npm run check`, `npm test`, `npm run test:db` (`docs/ARCHITECTURE.md` "Test harness").
- Vercel project, this server's own Neon database and Neon API keys: not created yet (IN-02, IN-03, IN-04).
- Runtime: Node 24.x (Vercel stopped deploying Node 20 on 2026-10-01; see DECISIONS).

## Recent work (newest first)

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
