# STATUS — current work, blockers and next action

Updated 2026-10-10. Repository created by Chris; plan written by Claude (Opus 5.5) in the same planning system as the
Stripe MCP. **No code exists yet.** No Neon key has been added anywhere. Nothing touches any database.

## Next

- **Waiting for Chris:** IN-00 — approve this plan (the designs in `docs/designs/`). In plain words: "Yes, I approve the
  Neon MCP plan" is enough; or say what to change.
- **Ready once approved:** A-1 — repository, test harness, fake Neon server, CI and doc checks ([card](pr-cards/A-1.md)).
  Then A-2 … A-7 (JIT).
- **Pending confirmation:** IN-01 — repository public, no automated review (the implementer self-reviews every diff), the
  same choice Chris made for the Stripe MCP on 2026-10-10.
- **Queue:** A → B → C → D → V → O → P → W → U → R → E → X (`MASTER-ROADMAP.md`).

## Environment

- Repo: `Robinson-AI-Systems/neon-mcp`, default branch `main`. The first commits (this plan) were made locally on `main`
  because the repository was empty; every later change goes through an `ai/*` branch and a PR.
- Vercel project, this server's own Neon database and Neon API keys: not created yet (IN-02, IN-03, IN-04).
- Runtime: Node 24.x (Vercel stopped deploying Node 20 on 2026-10-01; see DECISIONS).

## Recent work (newest first)

**2026-10-10 — Gap check against prior toolkits:** every Neon tool name Chris built or planned in any Robinson toolkit
(333 names across `robinsons-toolkit-mcp`, `robinsonai-mcp-servers`, `robinsons-toolkit-api`) mapped in
`audits/2026-10-10-prior-tools.md`: 300 covered, 30 dropped with reasons, 3 gaps added as card D-9
(`neon_branch_compare_data`, `neon_schema_list_migrations`, `neon_health_reindex`); SQL guard amendment (BATCH-B). Needs from
Cortiware, oldReplit, Household-Assistant and Appliance Desk checked. Totals now **173 hand-built + 4 universal = 177
tools, 54 cards** (the entry below is the original plan's count).

**2026-10-10 — Plan written (initial commits):** research audit (Neon API ≈180 operations, the old toolkit's 204 tools
with 13 verified bugs including 17 unreachable tools and a SQL path that never authenticates, the official Neon
connector compared, credentials, coverage matrix), AGENTS, START-HERE, SESSION-START, PLAYBOOK, drift protocol, PLAN,
MASTER-ROADMAP, 12 batch designs, TOOL-CATALOG (170 hand-built tools + 4 universal), Appliance Desk project profile,
owner inputs, go-live checklist, decisions, roadmap, owner guide, work index with validator (53 cards), first card A-1.

## Blocked

Nothing in engineering. Owner inputs open: IN-00 (blocks starting), IN-01 (pending confirmation), IN-02 … IN-14
(`OWNER-INPUTS.md`); none blocks A-1 … A-4.
