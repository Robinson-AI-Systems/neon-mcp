# Decisions (dated)

One entry per design decision, newest last. Reasons live here; current rules live in AGENTS and the designs.

**2026-10-10 — Build a separate, hosted Neon MCP, standalone first.** Chris is building one solid server per service
(Google Workspace and Stripe first; Vercel, Neon and GitHub next), each fully usable on its own and later combined by
Robinson's Toolkit (the hub) through the Robinson Tool Contract (RTC 1). Reasons for Neon specifically
(`docs/audits/2026-10-10-research.md`): the old toolkit's `neon` namespace (204 tools) cannot run SQL at all (it sends the
Neon API key where a database password belongs), advertises 17 tools that can never run, calls endpoints that do not
exist, and has no preview, confirmation or change log on 70+ destructive tools; the official Neon connector has the
breadth but no dry runs, no change log, no undo, no spend previews, no owner tools, and Neon itself says it is for
development only, never production databases.

**2026-10-10 — "Production" means Neon's default and protected branches, plus project-wide settings.** Decided in one
function from Neon's own data, never from names. Production writes are refused until Chris turns on production access
for an organization (two steps, like the Stripe MCP's live mode), and then need `confirm`. Reason: on 2026-09-28 an
earlier AI session restored and finalized a snapshot on Appliance Desk's production database by itself, without asking
(Appliance Desk's archived decisions). Restores on production always keep the old state; finalizing a restore is its own
production-guarded tool.

**2026-10-10 — SQL is guarded by the real PostgreSQL parser.** Every statement is classified (`libpg-query`); reads run
in read-only transactions; risky SQL on production is first run on a throwaway branch to get the exact affected rows and
schema diff, then applied in one transaction that rolls back if the count differs, after recording a restore point (LSN)
that undo can use. Reason: the old toolkit concatenated arguments into SQL and its "explain" tool ran `EXPLAIN ANALYZE`,
which executes the statement.

**2026-10-10 — Narrowest key per tool; project-scoped keys recommended (IN-04).** Neon's project-scoped keys cannot delete
their project or change access; an organization key is admin over everything. Tools declare the key kind they need; owner
tools need the organization key and the `full` profile. Keys are entered only on the setup page and never returned.

**2026-10-10 — Secrets never in chat, both directions.** Role passwords, connection strings, new API keys, credentials,
claim links and passes leave only through the one-time-secret page; secrets a tool needs (OAuth client secrets, SMTP
passwords) are typed by Chris on the setup page and consumed once. Writing a connection string straight into a Vercel
environment variable is a hub workflow (ROADMAP), not built here.

**2026-10-10 — Spend guard with Neon's published prices as a stored, dated setting.** Neon bills by usage (compute hours,
storage, history, extra branches, snapshots). Every change that can raise the bill shows a worst-case monthly dollar
figure from the stored price table (source URL and date shown), needs `confirm`, and is refused above a per-change and
daily cap (IN-10). Plan changes and purchases have no tool at all.

**2026-10-10 — Self-protection.** The server never changes or runs SQL against its own database or the other Robinson
servers' databases; the list is edited only on the setup page (IN-07).

**2026-10-10 — `@neon/sdk` (raw layer, exact version) instead of `@neondatabase/api-client`.** Neon's newer official
client is fetch-based with no dependencies and is described by Neon as the successor; its ergonomic layer changed
signatures across seven major versions in three months, so only its 1:1 generated `raw` functions are used, behind one
client file with our own retry policy (only 423 and 429; never a blind resend of a write, because Neon's API has no
idempotency keys). The API description is vendored and pinned by date and hash because Neon publishes no dated API
versions.

**2026-10-10 — Testing without an official mock.** Neon has no mock of its management API (Neon Local needs a real
account). Tests use a fake Neon server whose every request is validated against the vendored description, and real
throwaway Postgres for everything SQL. Real-account checks are read-only (X-2) or confined to a scratch project (X-3).

**2026-10-10 — Runtime Node 24.x, not Node 20.** The shared server decisions said Node 20, but Vercel disabled Node 20
for new deployments on 2026-10-01 (vercel.com/changelog/node-js-20-is-being-deprecated). Code stays within Node 20.19+
features, so nothing else changes. The same applies to the Stripe and other Robinson server plans (reported to the
planning coordinator).

**2026-10-10 — General development tool and owner tool, with optional project profiles.** Same decisions as the Stripe MCP
(Chris, 2026-10-10): three audiences (builder / owner / operator) tagged on every tool; Batch V developer tools that
refuse production; Batch O owner tools with guided settings for every console-only setting; project profiles only for
apps that manage part of their own Neon project (Appliance Desk is the first example, never the scope).

**2026-10-10 — Neon's new backend services (Auth, Data API, storage, Functions, triggers, logs) come late (Batch E).**
They became generally available on 2026-09-18 and none of Chris's projects uses them yet; the universal tools reach every
one of their operations with the same guards meanwhile.

**2026-10-10 — Structured DDL tools not rebuilt.** The old toolkit's 34 one-statement schema and row tools are replaced by
the guarded `sql_execute` and `workflow_safe_migration`: one well-tested path is safer and costs agents far less context.

**2026-10-10 — Repository process mirrors the Stripe MCP (IN-01 pending confirmation).** Public repository, no automated
review; the implementer self-reviews every diff against AI-PR-READ-FIRST; if an organization-wide reviewer posts anyway,
its threads are answered and resolved, never waited for.

**2026-10-10 — Gap check against prior toolkits.** Chris asked for every Neon tool he ever built or planned, across all
his Robinson toolkit repositories, to be checked against this plan. 333 distinct prior names were found (old local
toolkit 204, the TypeScript toolkit and its standalone Neon server 165, the HTTPS toolkit API 167, plans and docs 46,
an auto-generated index 41 — heavily overlapping); every one is mapped in `docs/audits/2026-10-10-prior-tools.md`.
300 are covered by catalog tools (many as the guarded `sql_execute`, per the DDL decision above), 30 are dropped with
reasons (no Neon API behind them — metrics, Postgres logs, alerts, webhooks, encryption/SSL/password switches, project
clone, branch merge, backup export — or generated/speculative names), and 3 were real gaps, now added in a new card D-9:
`branch_compare_data`, `schema_list_migrations`, `health_reindex`. Two catalog rows gained an option
(`schema_enable_extension` `update: true`; `schema_list_objects` publications) and the SQL guard got a dated amendment
(BATCH-B) because the mapping showed `REINDEX` pointed at a tool that could not run it and several statement types had
no class; unclassified statements now fail closed as `destructive`. Totals: 173 hand-built + 4 universal = 177 tools;
54 cards.
