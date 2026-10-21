# START HERE — Robinson Neon MCP

An independent hosted MCP server (Node 24, plain ES modules, Vercel serverless + its own Neon Postgres database) intended to give appropriately authorized users and agents broad control of their own Neon accounts. Source features are substantially implemented; **complete native-client, user-tenant, real-provider and public distribution acceptance is not yet proved**. Same family and conventions as
`Robinson-AI-Systems/stripe-mcp` and `Robinson-AI-Systems/google-workspace-mcp` (reused code is named in
`docs/designs/BATCH-A.md`). General-purpose across Chris's projects; apps that manage part of their own Neon project get
a project profile (Batch P), the first being the Appliance Desk rental app (`docs/APP-NEEDS-APPLIANCE-DESK.md`). Chris
operates mostly from a phone; everything he reads must be plain language.

## Read only what this work needs

1. Implementing a card: [SESSION-START](SESSION-START.md) (one page). Otherwise AGENTS — workflow and hard limits.
2. [STATUS](STATUS.md) — current head/state/next item.
3. [MASTER-ROADMAP](MASTER-ROADMAP.md) — order of batches and work coverage.
4. Next card, then its named design headings and code. If JIT, write the short card from the design first;
   [drift protocol](implementation-contracts/DRIFT-PROTOCOL.md) applies every time.
5. PLAN's acceptance for the batch, the six [COMPLETION-GATES](COMPLETION-GATES.md) cross-cutting acceptance overlays, and PLAYBOOK's verification commands. `npm run session:status` separately reports original work units, six OPEN gates and deployed release acceptance.

## Code map (target; confirm the actual path before editing)

`api/` Vercel functions (`mcp.js` connector, `oauth/*` login, `neon/setup.js` key page, protected resources, one-time
secrets and secret requests, `tools/*` HTTPS API, `contract.js` RTC manifest) · `src/core/` contract-generic code (no Neon
imports; extracted later into `robinson-mcp-core`) · `src/neon/` the only Neon client, operations waiter, SQL connection
layer, SQL guard, production classifier, spend estimator, scrubber, OpenAPI index · `src/tools/` one module per area
(`projects.js`, `branches.js`, `sql.js`, …) plus `server.js`, `summaries.js`, `universal.js`, `index.js` (registry
layers) · `src/dev/` scenarios · `src/data/dashboard-map.js` guided settings · `src/db.js` all SQL for this server's own
tables · `tests/unit|db|doors` · `scripts/` checks · `vendor/neon-openapi/` Neon's published API description, pinned by
date and hash.

## One authority per fact

| Fact | Authority |
|---|---|
| Workflow / hard limits | AGENTS; PLAYBOOK for command recipes |
| Current state / ordered work | STATUS / MASTER-ROADMAP / `pr-cards/work-index.json` |
| Remaining acceptance | PLAN, COMPLETION-GATES and STATUS release queue (three complementary obligations, no double-counted subsections) |
| How each batch works | `designs/BATCH-*.md` (targeted headings); the card for exact execution |
| Every tool and its flags | TOOL-CATALOG |
| What each profiled app needs | `APP-NEEDS-<APP>.md` (first: APP-NEEDS-APPLIANCE-DESK), `designs/BATCH-P.md` |
| Owner-only inputs / production switches | OWNER-INPUTS / GO-LIVE-CHECKLIST |
| Runtime facts | code and tests; ARCHITECTURE updated as behavior ships |
| Historical evidence | `archive/`, `audits/`, dated DECISIONS; never current instructions |

Preserve stable IDs (cards, `IN-xx`, decisions). Anything that could touch production or raise spend starts off.
Do not turn a plan or a passing test into a claim of production readiness.
