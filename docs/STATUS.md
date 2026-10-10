# STATUS — current work, blockers and next action

Updated 2026-10-10. **A-1 merged (#1): the repository is ready for implementation.** Package (Node 24), committed
lockfile, fake Neon API that checks every request against Neon's own API description, throwaway-Postgres database tests,
secret/docs/index/lint/write-safety/core-import/budget checks, and CI with one merge gate (`ci`). No tools, endpoints or
database tables yet. No Neon key has been added anywhere; nothing touches a real database or Neon account.

## Next

- **Next card: A-2 — database schema** ([card](pr-cards/A-2.md), READY). Then **A-3** — connector login, two PRs
  ([card](pr-cards/A-3.md), READY). Then A-4 … A-7 (write each card just in time from `designs/BATCH-A.md` §4).
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
