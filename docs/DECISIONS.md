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
the guarded `neon_sql_execute` and `neon_workflow_safe_migration`: one well-tested path is safer and costs agents far less context.

**2026-10-10 — Repository process mirrors the Stripe MCP (IN-01 pending confirmation).** Public repository, no automated
review; the implementer self-reviews every diff against AI-PR-READ-FIRST; if an organization-wide reviewer posts anyway,
its threads are answered and resolved, never waited for.

**2026-10-10 — Gap check against prior toolkits.** Chris asked for every Neon tool he ever built or planned, across all
his Robinson toolkit repositories, to be checked against this plan. 333 distinct prior names were found (old local
toolkit 204, the TypeScript toolkit and its standalone Neon server 165, the HTTPS toolkit API 167, plans and docs 46,
an auto-generated index 41 — heavily overlapping); every one is mapped in `docs/audits/2026-10-10-prior-tools.md`.
300 are covered by catalog tools (many as the guarded `neon_sql_execute`, per the DDL decision above), 30 are dropped with
reasons (no Neon API behind them — metrics, Postgres logs, alerts, webhooks, encryption/SSL/password switches, project
clone, branch merge, backup export — or generated/speculative names), and 3 were real gaps, now added in a new card D-9:
`neon_branch_compare_data`, `neon_schema_list_migrations`, `neon_health_reindex`. Two catalog rows gained an option
(`neon_schema_enable_extension` `update: true`; `neon_schema_list_objects` publications) and the SQL guard got a dated amendment
(BATCH-B) because the mapping showed `REINDEX` pointed at a tool that could not run it and several statement types had
no class; unclassified statements now fail closed as `destructive`. Totals: 173 hand-built + 4 universal = 177 tools;
54 cards.

**2026-10-10 — Every tool name starts with `neon_` (cross-server consistency).** GitHub, Vercel and Neon all have
"projects", "branches", "members" and "workflows"; several Robinson servers are often loaded in one chat, and some
clients do not namespace tool names by server. Every tool here is therefore `neon_<area>_<verb>_<object>` (contract §3
as clarified on 2026-10-10). Renamed mechanically across the plan; no behavior changed.

**2026-10-10 — A-1 foundation choices.** (1) Neon's API description is vendored in A-1, not A-4, because the fake Neon
server validates every request against it and the live file was unreachable (BATCH-A amendment). (2) The fake validates
request bodies **strictly** — an unknown field fails the test — because misspelled or invented fields were the old
toolkit's commonest Neon bug; response fixtures are checked loosely (Neon adds fields). (3) The fake answers 401 when no
bearer key is sent, because the old toolkit's SQL path never authenticated. (4) The secret scan also refuses real-looking
Neon branch, endpoint and organization IDs and Vercel IDs (AGENTS hard limits), and skips the vendored description only
while its SHA-256 matches `SOURCE.md`. (5) CI runs on Node 24 with `npm ci --ignore-scripts` from the committed lockfile;
the database job uses the ECR mirror of Postgres 17 (Docker Hub's anonymous limit broke Appliance Desk CI).

**2026-10-10 — Plan approved; no automated review (Chris).** "I approve the plans, and I don't want the automated review
at this time." IN-00 and IN-01 answered; designs marked APPROVED. An organization-wide Codex reviewer may still post
until Chris turns it off for this repository; agents answer and resolve its threads but never wait for one.

**2026-10-10 — No compatibility with the old toolkits (Chris).** "The reference to the older toolkits was to help make sure
you designed this custom MCP with as much functionality as possible … I don't need legacy compatibility." Removed the
old-name map from D-1 and the toolkit decision note (X-4); IN-14 answered "not needed". The prior-tools audit stays as
the completeness checklist it was meant to be.

**2026-10-10 — Stronger anti-stall rules (from the implementing agent's own diagnosis).** Sol stopped after opening a PR
with red CI although nothing blocked it. Its reasons: too much code before running tests; preventable CI errors (a wrong
API parameter, lint, outdated test expectations); no rule forcing a red PR to be finished first; and chat sessions that
end between actions. Added: SESSION-START §0 (finish open PRs first), §6 (problems vs real blockers, thin slices, a
no-shell path with draft PRs, an exact recovery point at every push) and AGENTS rules 11–13.

**2026-10-10 — CI cadence (from the implementing agent's review of its own CI use).** Every push runs the full CI on
purpose (the merge gate must be green at the exact head). The waste was pushing fixes while a run was still going, which
started overlapping full runs. Rule added to SESSION-START §6: never push while your PR's run is in progress; collect all
failures, fix them together, push once; run checks locally first; "re-run failed jobs" only for infrastructure hiccups.
CI cancels an obsolete PR run when a newer push arrives.

**2026-10-11 — Owner-approved policy defaults, no activation.** Chris replied "I approve your defaults" to IN-09 (read-only production SQL, at most 200 result rows) and IN-10 (spending cap $25/change and $50/day). These are implementation policy decisions only. They do not enable production write mode, procure paid resources, or authorize a real-account operation. Defaults become *applied* only after durable runtime settings and guards are tested and verified.

**2026-10-11 — GitHub REST fallback for environments without local testing (owner instruction).** When an agent's
workspace lacks a functioning checkout, terminal or local PostgreSQL, it must use GitHub REST via a connected GitHub
plugin (or `gh api`) to inspect and change repository branches and PRs, then obtain real unit, database and repository
checks from GitHub Actions. REST does not itself run local tests; never claim local validation, bypass CI, commit to
`main`, skip self-review or weaken production/spending/approval restrictions. Current procedure lives in
`AGENTS.md`, `docs/SESSION-START.md` §6 and `docs/PLAYBOOK.md` Step 4.

**2026-10-11 — D-2 beta branch recovery SDK compatibility:** The vendored Neon API includes POST branch recover, but pinned @neon/sdk 7.0.1 omits the generated raw recoverProjectBranch export. Keep the approved recovery behavior behind src/neon/client.js only: use the official SDK client's own POST method with one literal path template copied from the vendored API, its existing authenticated client, shared budget, error rules and write-uncertainty handling. No handwritten HTTP client, concatenated endpoint, automatic unsafe replay or authorization bypass. Fake-Neon validates the full request/response. If the SDK later exports the raw operation, use it without changing the public tool contract.

## 2026-10-12 — owner-requested independent server / universal gateway planning repair

RTC external interoperability is independent of shared internal implementation. Hub owns compact broker,
routing and grant mapping; this service owns provider credentials, canonical tools, state and guarded dispatch.
Core adoption is optional and separately gated; do not require K-3 for RTC/Hub acceptance or reduce standalone
capability for common code. Existing source/fake/deployed/real evidence and every owner/CI/release gate remain.
This explicit docs/planning request permits this focused documentation PR; routine cadence remains unchanged.

## 2026-10-13 — Owner-approved D-5 independence (IN-15)

The owner approved implementing D-5 without completing D-4 public role deletion. D-3 is the completed index prerequisite; D-4 provider-verified connection selection remains mandatory in every SQL tool. D-4 deletion remains unregistered pending independently reliable pooled-client safety evidence. Approval does not enable production changes, real fixture mutations or spending. See the D-5 implementation card.

## October 14, 2026 — owner-delegated concrete implementation designs

The owner requested completing/revising remaining designs, then extending the
same Sol 5.6 implementation detail to all six active custom MCP repositories.
[REMAINING-WORK-ROUTES.md](implementation-contracts/REMAINING-WORK-ROUTES.md) adds typed state/argument/result
contracts, domain-specific failure and recovery cases, current code seams and
finite proof requirements for the remaining indexed scope. This is an explicit
design-maintenance exception to routine no-docs-only implementation work, not a
feature PR or completed subsection. Existing owner-specific missing inputs,
spending/production/credential/cleanup authority remain gated; this entry does
not mark them answered. The original Toolkit stays reference-only.

## 2026-10-19 — Owner clarification: independent RTC conformance, not Hub LIVE connection, gates Neon completion

Neon MCP is an independently usable RTC 1 provider. Its completion requires implementing and proving its own server-side contract, direct transport, provider identity/permissions and applicable real-provider acceptance. The Hub discovers, enrolls, authorizes and routes to compliant servers; actual Hub LIVE registration, relay, discovery and end-to-end routing are Hub-owned acceptance, not blockers for this Neon repository. This does not waive R-1/R-2/R-3 conformance, direct LIVE provider proof, security, CI, review, release or owner gates, and it does not mark any queue row PASSED. The same separation was already documented for Google Workspace MCP. See `HUB-COMPATIBILITY.md` and the R batch in `PLAN.md`.

## 2026-10-19 — Universal standalone native MCP, provider attribution and end-user authority directive

Owner-approved engineering policy: every standalone Robinson AI Systems provider service must offer standards-based direct remote MCP independent of platform adapters, desktop IDEs and Hub, wherever actual desktop/mobile client software supports remote MCP. Hub only owns optional cross-server discovery/routing. Owner-controlled user-facing label is **Neon by Robinson AI Systems**, explicitly unofficial and not endorsed by Neon; preserve stable technical identifiers and existing client tokens/grants. Do not publish/invite outside users or claim official eligibility before separate platform and owner authorization. Developer $0 spend, fixture, production and release restrictions constrain **implementation agents**; end users have actual provider-scoped, security-protected delegated capabilities governed by their selected policy. Audit and repair accidental product denials without removing provider identity, tenant, protected resource, audited confirmation, user-configured spending or fraud safeguards. An actual authorized desktop/mobile MCP client and provider call are separate acceptance from code and docs. Current corrective inventory: `docs/audits/2026-10-19-universal-mcp-directive.md`. The developer's earlier suspicion that `neon_role_delete` was missing from the B-6 allowlist was not correct and no role deletion policy was changed; the five preexisting guarded D-7 snapshot writes WERE omitted and are the scoped correction. Production deployment and source merge remain separately verified, and existing owner credentials remain untouched.

### 2026-10-19 D-8 authority inspection follow-up

The standing universal developer-versus-end-user distinction also applies to four preexisting audited D-8 project security write handlers which the old conservative client visibility list accidentally hid. Their full-owner discovery must not bypass the provider's actual role/organization/project entitlement, B-1 audit/approval, B-2 protected/production classification, per-operation verified prior state, denial on drift and separate production/paid release gates. An implemented, independently confirmed reversible/configured action is different from an unimplemented irreversible logical replication or unpriced audit-log increase; the latter require reviewed cost and authorization work rather than generic allowlist widening. The source repair is not proof of a real live provider/client test, and does not alter the standing rule that live Hub connectivity is Hub-owned.
